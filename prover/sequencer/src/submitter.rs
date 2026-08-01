use alloy::network::EthereumWallet;
/// On-chain submitter — sends settleBatch transactions to the
/// FigaroBatchVerifier contract via alloy.
use alloy::primitives::{Address, Bytes};
use alloy::providers::ProviderBuilder;
use alloy::signers::local::PrivateKeySigner;
use alloy::sol;
use tracing::info;

use figaro_kernel::types::{UsageClaim, UsageClaimKind};

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
        function excludedArtifact(bytes32 artifact) external view returns (bool);
    }
}

// The artifact-side and seller-side stake gates the counter applies at
// settlement (skip for artifacts, whole-batch revert for an unstaked seller).
// Reading them HERE is a pre-filter: drop a claim the counter would reject
// before it enters a proof, so one poison claim cannot cost the whole batch's
// accrual. Never a source of authority — the counter re-checks all of it.
sol! {
    #[sol(rpc)]
    interface IClauseRegistry {
        function depositOf(bytes32 idHash) external view returns (address registrar, bool withdrawn);
    }
}

sol! {
    #[sol(rpc)]
    interface IAssemblyRegistry {
        function bindings(bytes32 compositionHash)
            external
            view
            returns (address author, uint64 registeredAt, bool depositWithdrawn, string contentURI);
    }
}

sol! {
    #[sol(rpc)]
    interface IMembersRegistry {
        function registered(address member) external view returns (bool);
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
    /// The three registries the usage-claim pre-filter reads. Any left
    /// `Address::ZERO` (e.g. all three, on a deployment with no reward)
    /// disables the pre-filter — every claim passes through and the counter's
    /// own gates plus the verifier's try/catch remain the backstop.
    pub clause_registry_address: Address,
    pub assembly_registry_address: Address,
    pub members_registry_address: Address,
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

/// Drop usage claims the `UsageCounter` would reject at settlement, BEFORE they
/// enter a proof.
///
/// The counter now SKIPS excluded/unregistered artifacts (they never revert),
/// and the verifier CATCHES a `SellerNotStaked` revert — but a caught revert
/// drops the WHOLE batch's accrual, not just the offending claim. Filtering here
/// keeps one poison claim (an excluded/unregistered artifact) or one unstaked
/// seller from costing every other claim in the batch its accrual. The residual
/// — a seller who unstakes AFTER this read but before submission — is exactly
/// what the verifier's try/catch absorbs; this only shrinks how often that
/// fires.
///
/// The pre-filter is an OPTIMISATION, never authority: the counter re-checks all
/// of it on-chain. So when a registry read fails (RPC hiccup) the claim is
/// dropped conservatively — it can be re-submitted — rather than proven on
/// unverified state. The filter is keyed on the COUNTER address, not the
/// registries: with no counter there is no accrual (claims are dropped upstream
/// when `read_usage_context` returns `None`), so passing them through here is
/// harmless. When a counter IS configured the filter always runs — a misconfig
/// that left the registries at `Address::ZERO` while accrual is live must NOT
/// silently disable the protection (it would re-open the poison-seller
/// whole-batch drop); the per-claim reads against a zero registry simply fail and
/// drop the claim loudly, rather than the filter switching itself off.
pub async fn filter_usage_claims(
    config: &SubmitterConfig,
    claims: Vec<UsageClaim>,
) -> (Vec<UsageClaim>, Vec<(UsageClaim, String)>) {
    let disabled = config.usage_counter_address == Address::ZERO;
    if disabled || claims.is_empty() {
        return (claims, Vec::new());
    }

    let provider = match config
        .rpc_url
        .parse()
        .ok()
        .map(|u| ProviderBuilder::new().on_http(u))
    {
        Some(p) => p,
        None => return (claims, Vec::new()), // unparsable RPC — leave to the on-chain backstop
    };
    let counter = IUsageCounter::new(config.usage_counter_address, &provider);
    let clauses = IClauseRegistry::new(config.clause_registry_address, &provider);
    let assemblies = IAssemblyRegistry::new(config.assembly_registry_address, &provider);
    let members = IMembersRegistry::new(config.members_registry_address, &provider);

    let mut valid = Vec::with_capacity(claims.len());
    let mut dropped = Vec::new();

    // Per-claim classification. `Ok(())` = would be accrued on-chain; any read
    // error drops the claim conservatively (re-submittable), never proven on
    // unverified state.
    for claim in claims {
        let reason: Result<(), String> = async {
            // Excluded artifacts earn nothing (protocol floor); the counter skips them.
            match counter.excludedArtifact(claim.artifact).call().await {
                Ok(r) if r._0 => return Err("artifact is excluded from scoring".to_string()),
                Ok(_) => {}
                Err(e) => return Err(format!("excludedArtifact read failed: {e}")),
            }

            // Artifact-side stake gate: a LIVE registration deposit in the
            // artifact's own registry (clause OR assembly, matching the kind).
            let live = match claim.kind {
                UsageClaimKind::Clause { .. } => {
                    match clauses.depositOf(claim.artifact).call().await {
                        Ok(d) => d.registrar != Address::ZERO && !d.withdrawn,
                        Err(e) => return Err(format!("clause depositOf read failed: {e}")),
                    }
                }
                UsageClaimKind::Assembly => {
                    match assemblies.bindings(claim.artifact).call().await {
                        Ok(b) => {
                            b.author != Address::ZERO && b.registeredAt != 0 && !b.depositWithdrawn
                        }
                        Err(e) => return Err(format!("assembly bindings read failed: {e}")),
                    }
                }
            };
            if !live {
                return Err("artifact has no live registration deposit".to_string());
            }

            // Seller-side stake gate: the order's seller of record must be live-staked.
            match members.registered(claim.order.seller).call().await {
                Ok(r) if r._0 => Ok(()),
                Ok(_) => Err("seller is not live-staked".to_string()),
                Err(e) => Err(format!("member registered read failed: {e}")),
            }
        }
        .await;

        match reason {
            Ok(()) => valid.push(claim),
            Err(why) => dropped.push((claim, why)),
        }
    }
    (valid, dropped)
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
        .on_http(
            config
                .rpc_url
                .parse()
                .map_err(|e| format!("invalid rpc url: {e}"))?,
        );

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

    let contract = IFigaroBatchVerifier::new(config.verifier_address, &provider);

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
    let provider = ProviderBuilder::new().on_http(
        rpc_url
            .parse()
            .map_err(|e| format!("invalid rpc url: {e}"))?,
    );

    let contract = IFigaroBatchVerifier::new(verifier_address, &provider);
    let root = contract
        .stateRoot()
        .call()
        .await
        .map_err(|e| format!("stateRoot() call failed: {e}"))?;

    Ok(root._0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::primitives::{B256, U256};
    use figaro_kernel::types::Commitment;

    fn dummy_config(clause: Address, assembly: Address, members: Address) -> SubmitterConfig {
        SubmitterConfig {
            rpc_url: "http://127.0.0.1:1".to_string(),
            verifier_address: Address::ZERO,
            usage_counter_address: Address::ZERO,
            clause_registry_address: clause,
            assembly_registry_address: assembly,
            members_registry_address: members,
            private_key: String::new(),
        }
    }

    fn dummy_claim() -> UsageClaim {
        UsageClaim {
            order: Commitment {
                process_id: B256::ZERO,
                buyer: Address::ZERO,
                seller: Address::repeat_byte(0x11),
                currency: Address::ZERO,
                payment: U256::from(1),
                expected_cumulative_value: U256::from(1),
                agreement_hash: B256::ZERO,
                salt: U256::ZERO,
                deadline: U256::ZERO,
            },
            artifact: B256::repeat_byte(0xAB),
            kind: UsageClaimKind::Clause {
                section_hash: B256::ZERO,
            },
            inclusion_proof: Vec::new(),
        }
    }

    // When no registries are configured, the pre-filter is disabled and every
    // claim passes through UNTOUCHED — the on-chain gates plus the verifier's
    // try/catch are the backstop. It must NOT make chain calls (the rpc here is
    // unreachable) and must NOT drop anything.
    #[tokio::test]
    async fn disabled_when_no_registries_configured_passes_all_through() {
        let config = dummy_config(Address::ZERO, Address::ZERO, Address::ZERO);
        let (valid, dropped) = filter_usage_claims(&config, vec![dummy_claim()]).await;
        assert_eq!(valid.len(), 1, "the one claim survives");
        assert!(
            dropped.is_empty(),
            "nothing dropped when the filter is disabled"
        );
    }

    // Even with registries configured, an empty claim set short-circuits before
    // any provider is built (an unreachable rpc must not error the batch loop).
    #[tokio::test]
    async fn empty_claims_return_empty_without_touching_the_chain() {
        let config = dummy_config(
            Address::repeat_byte(0x01),
            Address::repeat_byte(0x02),
            Address::repeat_byte(0x03),
        );
        let (valid, dropped) = filter_usage_claims(&config, Vec::new()).await;
        assert!(valid.is_empty());
        assert!(dropped.is_empty());
    }
}
