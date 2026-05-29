/// On-chain submitter — sends settleBatch transactions to the
/// FigaroBatchVerifier contract via alloy.
use alloy::primitives::{Address, Bytes};
use alloy::providers::ProviderBuilder;
use alloy::sol;
use alloy::signers::local::PrivateKeySigner;
use alloy::network::EthereumWallet;
use tracing::info;

use crate::prover::ProveResult;
use figaro_kernel::types::*;

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

        struct ClauseDataCall {
            bytes32 clauseId;
            uint64 version;
            bytes32 uriHash;
            address registrar;
        }

        struct MechanismClauseDataCall {
            address mechanism;
            bytes32 clauseId;
        }

        struct SellerEventInputCall {
            uint8 tag;
            address seller;
            string metadataURI;
        }

        struct BatchEventDataCall {
            AttestationDataCall[] attestations;
            ClauseDataCall[] clauses;
            MechanismClauseDataCall[] mechanismClauses;
            SellerEventInputCall[] sellerEvents;
        }

        function settleBatch(
            bytes calldata proof,
            bytes calldata publicValues,
            NetPositionCall[] calldata positions,
            BatchEventDataCall calldata events
        ) external;

        function stateRoot() external view returns (bytes32);
        function batchCount() external view returns (uint64);
    }
}

/// Configuration for the on-chain submitter.
#[derive(Clone, Debug)]
pub struct SubmitterConfig {
    pub rpc_url: String,
    pub verifier_address: Address,
    pub private_key: String,
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

    let clauses: Vec<IFigaroBatchVerifier::ClauseDataCall> = result
        .events
        .clauses
        .iter()
        .map(|s| IFigaroBatchVerifier::ClauseDataCall {
            clauseId: s.clause_id,
            version: s.version,
            uriHash: s.uri_hash,
            registrar: s.registrar,
        })
        .collect();

    let mechanism_clauses: Vec<IFigaroBatchVerifier::MechanismClauseDataCall> = result
        .events
        .mechanism_clauses
        .iter()
        .map(|m| IFigaroBatchVerifier::MechanismClauseDataCall {
            mechanism: m.mechanism,
            clauseId: m.clause_id,
        })
        .collect();

    let seller_events: Vec<IFigaroBatchVerifier::SellerEventInputCall> = result
        .events
        .sellers
        .iter()
        .map(|o| match o {
            SellerEventData::Registered { seller, metadata_uri } => {
                IFigaroBatchVerifier::SellerEventInputCall {
                    tag: 1,
                    seller: *seller,
                    metadataURI: metadata_uri.clone(),
                }
            }
            SellerEventData::ProfileUpdated { seller, metadata_uri } => {
                IFigaroBatchVerifier::SellerEventInputCall {
                    tag: 2,
                    seller: *seller,
                    metadataURI: metadata_uri.clone(),
                }
            }
        })
        .collect();

    let events_call = IFigaroBatchVerifier::BatchEventDataCall {
        attestations,
        clauses,
        mechanismClauses: mechanism_clauses,
        sellerEvents: seller_events,
    };

    let contract =
        IFigaroBatchVerifier::new(config.verifier_address, &provider);

    let tx = contract.settleBatch(
        Bytes::from(result.proof_bytes.clone()),
        Bytes::from(result.public_values_bytes.clone()),
        positions,
        events_call,
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
