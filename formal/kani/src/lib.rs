//! Kani proof harnesses for the bonding arithmetic of the proof program's
//! mirror of the Core (`prover/lib/src/kernel.rs`).
//!
//! What the harnesses reach. A harness outside `prover/lib` reaches only the
//! crate's public items, and `prover/lib` carries no Kani attribute:
//!
//! - `kernel::commit_bonds`, the one place the guest computes the two bonds
//!   a commit locks (buyer `2 × payment`, seller `2 × runningTotal`), each
//!   refused as `Overflow` past 2^256; `apply_commit` deposits exactly what
//!   it returns, and the relay's funding check reads the same function;
//! - `kernel::resolution_payouts`, the one place the guest computes the two
//!   payout legs of a resolved order (seller `2 × runningTotal + payment`,
//!   buyer `payment`);
//! - `operation_stream::resolved_running_total`, the cumulative value a
//!   resolve signs, the sum of the listed payments.
//!
//! So the conservation harnesses prove the formulas the guest runs, bonds
//! and payouts alike, against each other.
//!
//! Out of reach, each because the item is private to `prover/lib/src/kernel.rs`
//! and this crate adds no attribute there:
//!
//! - the netting: `TokenTracker::deposit`, `TokenTracker::payout` and
//!   `TokenTracker::net_positions` (`struct TokenTracker`, private) add up
//!   each (token, user)'s deposits and payouts across a batch;
//! - across a batch, that no user's payouts exceed what the batch and the
//!   state locked for it, which needs the netting and the state.
//!
//! `apply_operations` is public and reaches both, but every commit and every
//! signed resolve first recovers a secp256k1 signature over a keccak digest,
//! which CBMC cannot invert, so a harness through it proves nothing past the
//! signature check.
//!
//! Bounds. Every harness fixes `#[kani::unwind(34)]`, enough for the 256-bit
//! limb loops. The two-order harness takes every 256-bit payment; the
//! three-order harness takes each payment below 2^64 (the low limb symbolic,
//! the other three zero), since a third symbolic 256-bit payment drove CBMC
//! past the 8 GB of the machine the two-order harness first ran on.
//!
//! Run: `cd formal/kani && cargo kani` (all harnesses), or
//! `cargo kani --harness <name>` for one; `.github/workflows/kani-dispatch.yml`
//! runs the same command.

#[cfg(kani)]
mod proofs {
    use alloy_primitives::{Address, B256, U256};
    use figaro_kernel::kernel::{commit_bonds, resolution_payouts};
    use figaro_kernel::operation_stream::resolved_running_total;
    use figaro_kernel::types::Commitment;

    fn any_u256() -> U256 {
        U256::from_limbs(kani::any::<[u64; 4]>())
    }

    fn commitment(payment: U256, running_total: U256) -> Commitment {
        Commitment {
            process_id: B256::ZERO,
            buyer: Address::ZERO,
            seller: Address::ZERO,
            token: Address::ZERO,
            payment,
            running_total,
            checkout_hash: B256::ZERO,
            salt: U256::ZERO,
            commit_deadline: U256::ZERO,
        }
    }

    /// The payout legs never panic and never wrap: the call fails exactly
    /// when `2 × runningTotal + payment` passes 2^256, and otherwise returns
    /// the seller's `2 × runningTotal + payment` and the buyer's `payment`.
    #[kani::proof]
    #[kani::unwind(34)]
    fn payouts_are_exact_or_overflow() {
        let p = any_u256();
        let rt = any_u256();
        let wide = rt.checked_mul(U256::from(2)).and_then(|d| d.checked_add(p));
        match resolution_payouts(&commitment(p, rt)) {
            Ok((seller, buyer)) => {
                assert!(wide.is_some());
                assert_eq!(seller, wide.unwrap());
                assert_eq!(buyer, p);
            }
            Err(_) => assert!(wide.is_none()),
        }
    }

    /// The bonds never panic and never wrap, and each party locks its own:
    /// the call fails exactly when `2 × payment` or `2 × runningTotal` passes
    /// 2^256, and otherwise returns the buyer's `2 × payment` and the seller's
    /// `2 × runningTotal`. The conservation harnesses hold the two bonds' sum;
    /// this one holds the split between the two parties.
    #[kani::proof]
    #[kani::unwind(34)]
    fn bonds_are_exact_or_overflow() {
        let p = any_u256();
        let rt = any_u256();
        let buyer_wide = p.checked_mul(U256::from(2));
        let seller_wide = rt.checked_mul(U256::from(2));
        match commit_bonds(&commitment(p, rt)) {
            Ok((buyer_bond, seller_bond)) => {
                assert_eq!(Some(buyer_bond), buyer_wide);
                assert_eq!(Some(seller_bond), seller_wide);
            }
            Err(_) => assert!(buyer_wide.is_none() || seller_wide.is_none()),
        }
    }

    /// One order conserves its bonds: what resolution pays out equals what
    /// commit locked (the guest's `commit_bonds`), no leg exceeds the total
    /// locked, and the buyer's leg never exceeds the buyer's own bond. Over
    /// every payment and running total whose bonds the guest accepts.
    #[kani::proof]
    #[kani::unwind(34)]
    fn one_order_conserves_its_bonds() {
        let p = any_u256();
        let rt = any_u256();
        let c = commitment(p, rt);
        let Ok((buyer_bond, seller_bond)) = commit_bonds(&c) else {
            return;
        };
        let Some(locked) = buyer_bond.checked_add(seller_bond) else {
            return;
        };
        let (seller, buyer) = resolution_payouts(&c).expect("bonds that fit give payouts that fit");
        assert_eq!(seller.checked_add(buyer), Some(locked));
        assert!(le(seller, locked));
        assert!(le(buyer, buyer_bond));
        assert!(le(buyer, locked));
    }

    /// `a <= b` limb by limb. `U256`'s own ordering reaches the x86-64
    /// `_subborrow_u64` intrinsic, which Kani does not model.
    fn le(a: U256, b: U256) -> bool {
        let (a, b) = (a.as_limbs(), b.as_limbs());
        for i in (0..4).rev() {
            if a[i] != b[i] {
                return a[i] < b[i];
            }
        }
        true
    }

    /// A process of `payments.len()` orders, each committed under the Core's
    /// rule (the k-th order's running total is the sum of the first k
    /// payments): the cumulative value a resolve signs is the last running
    /// total, and the sum of every payout equals the sum of every bond the
    /// guest's `commit_bonds` locks, with no overflow in the payouts once the
    /// bonds fit.
    fn process_conserves_its_bonds(payments: &[U256]) {
        let mut orders = Vec::new();
        let mut running = U256::ZERO;
        let mut locked = U256::ZERO;
        for &p in payments {
            kani::assume(!p.is_zero());
            let Some(next) = running.checked_add(p) else {
                return;
            };
            running = next;
            let c = commitment(p, running);
            let Ok((b, s)) = commit_bonds(&c) else {
                return;
            };
            let Some(l) = locked.checked_add(b).and_then(|l| l.checked_add(s)) else {
                return;
            };
            locked = l;
            orders.push(c);
        }
        assert_eq!(resolved_running_total(&orders), Some(running));
        let mut paid = U256::ZERO;
        for c in &orders {
            let (seller, buyer) =
                resolution_payouts(c).expect("bonds that fit give payouts that fit");
            paid = paid
                .checked_add(seller)
                .and_then(|x| x.checked_add(buyer))
                .expect("payouts that sum to the bonds fit");
        }
        assert_eq!(paid, locked);
    }

    /// A process of two orders, every 256-bit payment.
    #[kani::proof]
    #[kani::unwind(34)]
    fn a_process_conserves_its_bonds() {
        process_conserves_its_bonds(&[any_u256(), any_u256()]);
    }

    /// A process of three orders, each payment below 2^64: the bound that
    /// keeps CBMC within a small machine's memory (see the module doc). The
    /// running totals and the bonds still reach past 2^64.
    #[kani::proof]
    #[kani::unwind(34)]
    fn a_three_order_process_conserves_its_bonds() {
        let low = || U256::from(kani::any::<u64>());
        process_conserves_its_bonds(&[low(), low(), low()]);
    }

    /// The cumulative value a resolve signs is `None` exactly when the listed
    /// payments sum past 2^256, and the exact sum otherwise.
    #[kani::proof]
    #[kani::unwind(34)]
    fn resolved_running_total_is_the_exact_sum() {
        let a = any_u256();
        let b = any_u256();
        let orders = [commitment(a, U256::ZERO), commitment(b, U256::ZERO)];
        assert_eq!(resolved_running_total(&orders), a.checked_add(b));
    }
}
