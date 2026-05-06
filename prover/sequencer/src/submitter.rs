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
            bytes32 schemaId;
            uint8 stage;
            bytes32 contentRef;
        }

        struct SchemaDataCall {
            bytes32 schemaId;
            uint64 version;
            bytes32 uriHash;
            address registrar;
        }

        struct MechanismSchemaDataCall {
            address mechanism;
            bytes32 schemaId;
        }

        struct OperatorEventInputCall {
            uint8 tag;
            address operator;
            string metadataURI;
        }

        struct BatchEventDataCall {
            AttestationDataCall[] attestations;
            SchemaDataCall[] schemas;
            MechanismSchemaDataCall[] mechanismSchemas;
            OperatorEventInputCall[] operatorEvents;
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
            schemaId: a.schema_id,
            stage: a.stage,
            contentRef: a.content_ref,
        })
        .collect();

    let schemas: Vec<IFigaroBatchVerifier::SchemaDataCall> = result
        .events
        .schemas
        .iter()
        .map(|s| IFigaroBatchVerifier::SchemaDataCall {
            schemaId: s.schema_id,
            version: s.version,
            uriHash: s.uri_hash,
            registrar: s.registrar,
        })
        .collect();

    let mechanism_schemas: Vec<IFigaroBatchVerifier::MechanismSchemaDataCall> = result
        .events
        .mechanism_schemas
        .iter()
        .map(|m| IFigaroBatchVerifier::MechanismSchemaDataCall {
            mechanism: m.mechanism,
            schemaId: m.schema_id,
        })
        .collect();

    let operator_events: Vec<IFigaroBatchVerifier::OperatorEventInputCall> = result
        .events
        .operators
        .iter()
        .map(|o| match o {
            OperatorEventData::Registered { operator, metadata_uri } => {
                IFigaroBatchVerifier::OperatorEventInputCall {
                    tag: 1,
                    operator: *operator,
                    metadataURI: metadata_uri.clone(),
                }
            }
            OperatorEventData::ProfileUpdated { operator, metadata_uri } => {
                IFigaroBatchVerifier::OperatorEventInputCall {
                    tag: 2,
                    operator: *operator,
                    metadataURI: metadata_uri.clone(),
                }
            }
        })
        .collect();

    let events_call = IFigaroBatchVerifier::BatchEventDataCall {
        attestations,
        schemas,
        mechanismSchemas: mechanism_schemas,
        operatorEvents: operator_events,
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
