//! The batch's cost on chain, and the cap it derives.
//!
//! What a batch costs the chain is what it PUBLISHES — the net positions
//! `settleBatch` transfers, the attestation events it re-emits, the spec
//! bindings it anchors against the registry and the usage accruals it
//! writes to the counter — plus the proof's verification, the call's fixed
//! execution and the calldata it carries; not the number of operations it
//! proves. The relay bounds a batch by this estimate against the live block
//! gas limit, read at every tick, so the cap follows the chain it runs on
//! (`sdk/src/gasCeilings.ts` gives the direct path the same shape).
//!
//! The per-item constants mirror `test/core/verifier/BatchGasCeilingTest.t.sol`,
//! where they are measured on the pre-fork EVM and the allowance over the
//! measurement is stated; the maintainer's gate holds the two copies
//! equal. Each is a ceiling on the chain's charge, never a mean.

use figaro_kernel::types::{BatchEvents, BatchInput, KernelOp, NetPosition, UsageClaim};

/// Execution gas of one net position (the dearer kind, a payout to a fresh
/// balance), with the fork allowance (`BatchGasCeilingTest`). A plain
/// ERC-20's transfer: a token whose transfer costs more is the parties'
/// choice, and a batch it over-runs fails at the send like any transient
/// failure — re-proved, then dead-lettered with every operation batched
/// beside it.
pub const SETTLE_GAS_PER_POSITION: u64 = 60_000;
/// Execution gas of one attestation event re-emitted.
pub const SETTLE_GAS_PER_ATTESTATION: u64 = 6_000;
/// Execution gas of one spec binding checked against the registry.
pub const SETTLE_GAS_PER_SPEC_BINDING: u64 = 4_500;
/// Execution gas of one usage accrual the counter writes.
pub const SETTLE_GAS_PER_ACCRUAL: u64 = 190_000;
/// Execution gas of one usage seller the counter checks against the
/// members registry.
pub const SETTLE_GAS_PER_USAGE_SELLER: u64 = 12_000;
/// The call's execution with nothing to publish.
pub const SETTLE_FIXED_EXEC_GAS: u64 = 105_000;
/// The proof's verification by the SP1 gateway, read from live receipts.
pub const SETTLE_PROOF_VERIFY_GAS: u64 = 300_000;

/// The share of the block's gas limit a batch may plan on, in percent: the
/// rest is headroom for the limit's block-to-block movement and the one-time
/// premiums a first batch pays (the same figure the SDK's ceilings keep).
pub const GAS_HEADROOM_PCT: u64 = 95;

/// The most gas one transaction may take, by default: EIP-7825's cap of
/// 2^24, which mainnet enforces. A chain without it (Sepolia carries larger
/// transactions) is told so by the operator (`SETTLE_GAS_CAP`).
pub const DEFAULT_SETTLE_GAS_CAP: u64 = 16_777_216;

/// The calldata a settle carries besides its positions, charged as nonzero
/// bytes: the selector, the head words, the proof (a PLONK proof's 1,536
/// bytes, the larger form), the public values' 288 bytes, and the lengths
/// and offsets of the events and the usage — about 2,500 bytes.
const SETTLE_FRAMING_CALLDATA_GAS: u64 = 2_500 * CALLDATA_NONZERO_BYTE_GAS;

/// The calldata one net position occupies, charged as nonzero bytes: the
/// ceiling the resolve capacity plans with.
const POSITION_CALLDATA_GAS: u64 = 128 * CALLDATA_NONZERO_BYTE_GAS;

/// The least a settle cap can be: a settle resolving a process of one
/// order (two positions) with its framing. A cap below it would admit no
/// commit at all.
pub const MIN_SETTLE_GAS_CAP: u64 = SETTLE_PROOF_VERIFY_GAS
    + SETTLE_FIXED_EXEC_GAS
    + TX_BASE_GAS
    + SETTLE_FRAMING_CALLDATA_GAS
    + 2 * (SETTLE_GAS_PER_POSITION + POSITION_CALLDATA_GAS);

/// Calldata gas: a transaction's base cost and the per-byte charge.
const TX_BASE_GAS: u64 = 21_000;
const CALLDATA_ZERO_BYTE_GAS: u64 = 4;
const CALLDATA_NONZERO_BYTE_GAS: u64 = 16;

/// What a batch publishes, counted.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct SettleItems {
    pub positions: usize,
    pub attestations: usize,
    pub spec_bindings: usize,
    pub accruals: usize,
    pub usage_sellers: usize,
}

impl SettleItems {
    /// The items of an executed batch.
    pub fn of(positions: &[NetPosition], events: &BatchEvents) -> Self {
        Self {
            positions: positions.len(),
            attestations: events.attestations.len(),
            spec_bindings: events.spec_bindings.len(),
            accruals: events.usage_accruals.len(),
            usage_sellers: events.usage_sellers.len(),
        }
    }
}

/// The gas the calldata itself costs: the base and the per-byte charge.
pub fn calldata_gas(calldata: &[u8]) -> u64 {
    let zero = calldata.iter().filter(|b| **b == 0).count() as u64;
    let nonzero = calldata.len() as u64 - zero;
    TX_BASE_GAS + zero * CALLDATA_ZERO_BYTE_GAS + nonzero * CALLDATA_NONZERO_BYTE_GAS
}

/// The gas a settle of these items is planned on, with this calldata:
/// a ceiling on the chain's charge.
pub fn settle_gas_estimate(calldata: &[u8], items: SettleItems) -> u64 {
    calldata_gas(calldata)
        + SETTLE_PROOF_VERIFY_GAS
        + SETTLE_FIXED_EXEC_GAS
        + items.positions as u64 * SETTLE_GAS_PER_POSITION
        + items.attestations as u64 * SETTLE_GAS_PER_ATTESTATION
        + items.spec_bindings as u64 * SETTLE_GAS_PER_SPEC_BINDING
        + items.accruals as u64 * SETTLE_GAS_PER_ACCRUAL
        + items.usage_sellers as u64 * SETTLE_GAS_PER_USAGE_SELLER
}

/// The gas a batch may plan on in a block with this limit, under the
/// chain's cap on one transaction.
pub fn settle_gas_budget(block_gas_limit: u64, settle_gas_cap: u64) -> u64 {
    (block_gas_limit / 100 * GAS_HEADROOM_PCT).min(settle_gas_cap)
}

/// The most orders a batch-path process may hold for its resolve to fit
/// one settle under `cap`: a resolve nets at most one position per order
/// and one for the buyer, each with its calldata, over the settle's fixed
/// cost and framing. A commit that would grow a process past this is
/// refused at batch formation
/// (`assembler::filter_commits_within_resolve_capacity`): a process past it
/// has no resolve any relay on the chain can settle, and its bonds would
/// stay where they are. The bound is the configured cap's, stable across
/// ticks, never a tick's budget: a process outlives the tick it was
/// admitted on.
pub fn max_orders_in_one_settle(cap: u64) -> usize {
    let fixed = SETTLE_PROOF_VERIFY_GAS + SETTLE_FIXED_EXEC_GAS + TX_BASE_GAS + SETTLE_FRAMING_CALLDATA_GAS;
    if cap <= fixed {
        return 0;
    }
    let positions = (cap - fixed) / (SETTLE_GAS_PER_POSITION + POSITION_CALLDATA_GAS);
    positions.saturating_sub(1) as usize
}

/// The largest prefix length in `0..=n` the batch fits at, found by
/// bisection: the estimate grows with the prefix, so a fitting prefix has
/// every shorter prefix fitting too. The full length is tried first — the
/// common case costs one execution — and the empty prefix always fits.
fn largest_fitting_prefix<F>(n: usize, mut fits: F) -> Result<usize, String>
where
    F: FnMut(usize) -> Result<bool, String>,
{
    if n == 0 || fits(n)? {
        return Ok(n);
    }
    let (mut lo, mut hi) = (0usize, n); // lo fits, hi does not
    while hi - lo > 1 {
        let mid = lo + (hi - lo) / 2;
        if fits(mid)? {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    Ok(lo)
}

/// A batch's operations planned under the budget.
#[derive(Debug)]
pub struct PlannedOps {
    /// The batch, its operations cut to the budget; its usage claims as
    /// they were, for the caller to filter against the kept operations.
    pub batch: BatchInput,
    /// The first operation, when it did not fit the chain's cap as a batch
    /// of ONE, with the gas it was planned at: nothing any relay on the
    /// chain can settle. The batch then keeps no operation, and
    /// `given_back` holds the rest, for the caller to filter again without
    /// it — the order they were filtered into may have built on it — and
    /// plan anew.
    pub unfit: Option<(KernelOp, u64)>,
    /// The operations after the kept prefix, in their order: they wait.
    pub given_back: Vec<KernelOp>,
}

/// The batch's operations cut to the budget, claims set aside: the longest
/// prefix of the execution order whose settle is planned under
/// `prefix_budget`, the share of the tick's `budget` the operations plan
/// on (the whole of it, or half on a tick that owes the claims their
/// turn). A prefix of the execution order always applies, so the estimate
/// fails only when the kernel does. The first operation is probed alone
/// first, against `cap`, the chain's bound on one transaction and the
/// bound commits were admitted under: one that does not fit the cap on its
/// own would stand at the front of the queue and empty every batch after
/// it, so it is returned as unfit and nothing is planned behind it until
/// the caller has filtered the rest without it. One that fits the tick's
/// whole budget but not the operations' share is kept alone: a share may
/// be smaller than one operation, and it would otherwise hold the queue
/// for as long as the claims kept their turn. One that fits the cap but
/// not the tick's budget waits: the prefix is then empty and it is given
/// back with the rest. `estimate` gives the settle gas of a batch, claims
/// included.
pub fn trim_ops_to_budget<F>(
    mut batch: BatchInput,
    cap: u64,
    budget: u64,
    prefix_budget: u64,
    mut estimate: F,
) -> Result<PlannedOps, String>
where
    F: FnMut(&BatchInput) -> Result<u64, String>,
{
    let claims = std::mem::take(&mut batch.usage_claims);
    let mut ops = std::mem::take(&mut batch.operations);
    let mut probe = batch.clone();
    let planned_at = |probe: &mut BatchInput, ops: &[KernelOp], estimate: &mut F| -> Result<u64, String> {
        probe.operations = ops.to_vec();
        estimate(probe)
    };
    let mut first_alone = 0;
    if !ops.is_empty() {
        first_alone = planned_at(&mut probe, &ops[..1], &mut estimate)?;
        if first_alone > cap {
            let first = ops.remove(0);
            batch.usage_claims = claims;
            return Ok(PlannedOps { batch, unfit: Some((first, first_alone)), given_back: ops });
        }
    }
    let n = ops.len();
    let mut kept =
        largest_fitting_prefix(n, |len| Ok(planned_at(&mut probe, &ops[..len], &mut estimate)? <= prefix_budget))?;
    if kept == 0 && n > 0 && first_alone <= budget {
        kept = 1;
    }
    let given_back = ops.split_off(kept);
    batch.operations = ops;
    batch.usage_claims = claims;
    Ok(PlannedOps { batch, unfit: None, given_back })
}

/// The batch's usage claims cut to the budget, its operations as they are:
/// the longest prefix of the claims whose settle is planned under
/// `budget`. A claim stands on its own, so any prefix applies. Returns the
/// batch and the claims after the kept prefix, in their order.
pub fn trim_claims_to_budget<F>(
    mut batch: BatchInput,
    budget: u64,
    mut estimate: F,
) -> Result<(BatchInput, Vec<UsageClaim>), String>
where
    F: FnMut(&BatchInput) -> Result<u64, String>,
{
    let mut claims = std::mem::take(&mut batch.usage_claims);
    let n = claims.len();
    let mut probe = batch.clone();
    let kept = largest_fitting_prefix(n, |len| {
        probe.usage_claims = claims[..len].to_vec();
        Ok(estimate(&probe)? <= budget)
    })?;
    let given_back = claims.split_off(kept);
    batch.usage_claims = claims;
    Ok((batch, given_back))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calldata_gas_charges_the_base_and_each_byte_by_kind() {
        assert_eq!(calldata_gas(&[]), 21_000);
        assert_eq!(calldata_gas(&[0, 0, 1, 2]), 21_000 + 2 * 4 + 2 * 16);
    }

    #[test]
    fn the_estimate_is_the_sum_of_its_parts() {
        let items = SettleItems { positions: 2, attestations: 1, spec_bindings: 1, accruals: 1, usage_sellers: 1 };
        assert_eq!(
            settle_gas_estimate(&[1], items),
            21_016 + 300_000 + 105_000 + 120_000 + 6_000 + 4_500 + 190_000 + 12_000
        );
    }

    #[test]
    fn the_budget_keeps_the_headroom_under_the_transaction_cap() {
        assert_eq!(settle_gas_budget(30_000_000, u64::MAX), 28_500_000);
        assert_eq!(settle_gas_budget(60_000_000, DEFAULT_SETTLE_GAS_CAP), 16_777_216);
        assert_eq!(settle_gas_budget(200_000_000, u64::MAX), 190_000_000);
    }

    #[test]
    fn the_resolve_capacity_is_one_position_an_order_and_one_for_the_buyer_over_the_framing() {
        let fixed = SETTLE_PROOF_VERIFY_GAS + SETTLE_FIXED_EXEC_GAS + 21_000 + 40_000;
        assert_eq!(max_orders_in_one_settle(fixed), 0);
        assert_eq!(max_orders_in_one_settle(fixed + 2 * (SETTLE_GAS_PER_POSITION + 2_048)), 1);
        assert_eq!(max_orders_in_one_settle(DEFAULT_SETTLE_GAS_CAP), 261);
        // The least cap admits a process of one order, and no less.
        assert_eq!(MIN_SETTLE_GAS_CAP, 590_096);
        assert_eq!(max_orders_in_one_settle(MIN_SETTLE_GAS_CAP), 1);
        assert_eq!(max_orders_in_one_settle(MIN_SETTLE_GAS_CAP - 1), 0);
    }

    #[test]
    fn the_prefix_search_finds_the_largest_fit_with_few_probes() {
        let mut probes = 0;
        let kept = largest_fitting_prefix(100, |len| {
            probes += 1;
            Ok(len <= 37)
        })
        .unwrap();
        assert_eq!(kept, 37);
        assert!(probes <= 9, "{probes} probes for 100");
        assert_eq!(largest_fitting_prefix(100, |_| Ok(true)).unwrap(), 100);
        assert_eq!(largest_fitting_prefix(100, |len| Ok(len == 0)).unwrap(), 0);
        assert_eq!(largest_fitting_prefix(0, |_| Ok(false)).unwrap(), 0);
    }
}
