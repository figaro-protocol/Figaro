/// On-chain submitter — sends settleBatch transactions to the
/// FigaroBatchVerifier contract via alloy.
use alloy::primitives::{Address, Bytes};
use alloy::providers::ProviderBuilder;
use alloy::sol;
use alloy::signers::local::PrivateKeySigner;
use alloy::network::EthereumWallet;
use tracing::info;

use crate::prover::ProveResult;

// Generate Rust bindings for the FigaroBatchVerifier contract.
sol! {
    #[sol(rpc)]
    interface IFigaroBatchVerifier {
        struct NetPositionCall {
            address token;
            address user;
            uint256 deposit;
            uint256 payout;
        }

        struct AttestationDataCall {
            bytes32 orderHash;
            bytes32 processId;
            address attester;
            bytes32 clauseId;
            uint8 stage;
            bytes32 contentRef;
        }

        struct SpecBindingCall {
            bytes32 clauseId;
            bytes32 specHash;
        }

        struct BatchEventDataCall {
            AttestationDataCall[] attestations;
            SpecBindingCall[] specBindings;
        }

        struct BatchAccrualCall {
            bytes32 artifact;
            uint64 c;
            uint64 d;
        }

        struct BatchUsageDataCall {
            uint8 period;
            bytes32 provenanceClause;
            BatchAccrualCall[] accruals;
            address[] sellers;
        }

        function settleBatch(
            bytes calldata proof,
            bytes calldata publicValues,
            NetPositionCall[] calldata positions,
            BatchEventDataCall calldata events,
            BatchUsageDataCall calldata usage
        ) external;

        function stateRoot() external view returns (bytes32);
        function batchCount() external view returns (uint64);
    }
}

// The two UsageCounter facts a batch's accrual must agree with. Both are
// re-checked by the counter at settlement, so reading them here is an
// optimisation (don't prove a batch that cannot settle), never a source of
// authority.
sol! {
    #[sol(rpc)]
    interface IUsageCounter {
        function currentPeriod() external view returns (uint8);
        function provenanceClause() external view returns (bytes32);
    }
}

/// Configuration for the on-chain submitter.
#[derive(Clone, Debug)]
pub struct SubmitterConfig {
    pub rpc_url: String,
    pub verifier_address: Address,
    /// The RPGF counter. `Address::ZERO` disables usage accrual — the
    /// sequencer then settles trade without crediting it, which is exactly
    /// what a deployment with no counter should do.
    pub usage_counter_address: Address,
    pub private_key: String,
}

/// Read the accrual period and provenance clause a batch must commit to.
///
/// Returns `None` when there is no counter configured, or when accrual has
/// CLOSED (`currentPeriod()` reverts `AccrualClosed` after the last period).
/// A closed reward is not an error: trade goes on, it simply stops being
/// credited, and the batch settles with an empty accrual.
pub async fn read_usage_context(
    rpc_url: &str,
    usage_counter: Address,
) -> Option<(u8, alloy::primitives::B256)> {
    if usage_counter == Address::ZERO {
        return None;
    }
    let provider = ProviderBuilder::new().on_http(rpc_url.parse().ok()?);
    let contract = IUsageCounter::new(usage_counter, &provider);
    let period = contract.currentPeriod().call().await.ok()?;
    let provenance = contract.provenanceClause().call().await.ok()?;
    Some((period._0, provenance._0))
}

/// Submit a proved batch to the on-chain FigaroBatchVerifier.
pub async fn submit_batch(
    config: &SubmitterConfig,
    result: &ProveResult,
) -> Result<alloy::primitives::B256, String> {
    // Build provider with signer
    let signer: PrivateKeySigner = config
        .private_key
        .parse()
        .map_err(|e| format!("invalid private key: {e}"))?;
    let wallet = EthereumWallet::from(signer);

    let provider = ProviderBuilder::new()
        .with_recommended_fillers()
        .wallet(wallet)
        .on_http(config.rpc_url.parse().map_err(|e| format!("invalid rpc url: {e}"))?);

    // Convert kernel types to contract call types
    let positions: Vec<IFigaroBatchVerifier::NetPositionCall> = result
        .positions
        .iter()
        .map(|p| IFigaroBatchVerifier::NetPositionCall {
            token: p.token,
            user: p.user,
            deposit: p.deposit,
            payout: p.payout,
        })
        .collect();

    let attestations: Vec<IFigaroBatchVerifier::AttestationDataCall> = result
        .events
        .attestations
        .iter()
        .map(|a| IFigaroBatchVerifier::AttestationDataCall {
            orderHash: a.order_hash,
            processId: a.process_id,
            attester: a.attester,
            clauseId: a.clause_id,
            stage: a.stage,
            contentRef: a.content_ref,
        })
        .collect();

    // The (clause key → witness-spec hash) bindings the proof committed —
    // the verifier checks each against ClauseRegistry.contentHashOf.
    let spec_bindings: Vec<IFigaroBatchVerifier::SpecBindingCall> = result
        .events
        .spec_bindings
        .iter()
        .map(|b| IFigaroBatchVerifier::SpecBindingCall {
            clauseId: b.clause_id,
            specHash: b.spec_hash,
        })
        .collect();

    let events_call = IFigaroBatchVerifier::BatchEventDataCall {
        attestations,
        specBindings: spec_bindings,
    };

    // The RPGF accrual the proof committed. Empty arrays are normal and
    // settle fine — the counter treats an empty accrual as a no-op, which
    // is what lets trade keep settling after the reward's last period ends.
    let usage_call = IFigaroBatchVerifier::BatchUsageDataCall {
        period: result.events.usage_period,
        provenanceClause: result.provenance_clause,
        accruals: result
            .events
            .usage_accruals
            .iter()
            .map(|a| IFigaroBatchVerifier::BatchAccrualCall {
                artifact: a.artifact,
                c: a.c,
                d: a.d,
            })
            .collect(),
        sellers: result.events.usage_sellers.clone(),
    };

    let contract =
        IFigaroBatchVerifier::new(config.verifier_address, &provider);

    let tx = contract.settleBatch(
        Bytes::from(result.proof_bytes.clone()),
        Bytes::from(result.public_values_bytes.clone()),
        positions,
        events_call,
        usage_call,
    );

    info!(verifier = ?config.verifier_address, "Submitting settleBatch transaction");

    let pending = match tx.send().await {
        Ok(p) => p,
        Err(e) => {
            let msg = format!("tx submission failed: {e}");
            eprintln!("SUBMIT_ERROR: {msg}");
            return Err(msg);
        }
    };

    let receipt = match pending.get_receipt().await {
        Ok(r) => r,
        Err(e) => {
            let msg = format!("tx confirmation failed: {e}");
            eprintln!("RECEIPT_ERROR: {msg}");
            return Err(msg);
        }
    };

    let tx_hash = receipt.transaction_hash;
    info!(?tx_hash, "settleBatch confirmed");

    Ok(tx_hash)
}

/// Read the current on-chain state root.
pub async fn read_state_root(
    rpc_url: &str,
    verifier_address: Address,
) -> Result<alloy::primitives::B256, String> {
    let provider = ProviderBuilder::new()
        .on_http(rpc_url.parse().map_err(|e| format!("invalid rpc url: {e}"))?);

    let contract = IFigaroBatchVerifier::new(verifier_address, &provider);
    let root = contract
        .stateRoot()
        .call()
        .await
        .map_err(|e| format!("stateRoot() call failed: {e}"))?;

    Ok(root._0)
}
