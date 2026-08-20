/**
 * @figaro/sdk/signer — the sandboxed signer runtime's protocol-shaped half.
 *
 * The policy signer (daemon + out-of-model gate + keystore custody) and the
 * socket-backed account the agent layer consumes. Design and requirements:
 * docs/AI_AGENT_COORDINATION.md § "The sandboxed signer runtime";
 * ecosystem-agents/figaro-operator.md § "Security requirements" (F1–F6).
 * The host-shaped half — the sandbox wrapper with the egress allowlist —
 * lives beside the agent prompts, not in this package.
 */

export {
    validatePolicy, parseAmount,
    type SignerPolicy, type SignerCeilings, type PolicyResult,
} from "./policy.js";
export {
    evaluateTypedData, evaluateTransaction, evaluateSimulation,
    APPROVE_SELECTOR,
    type GateDecision, type RiskDelta, type SpentWindow,
    type TypedDataRequest, type TransactionRequest, type SimulationOutcome,
} from "./gate.js";
export { decryptKeystore, type KeystoreV3 } from "./keystore.js";
export { SpendJournal } from "./window.js";
export { appendAudit, type AuditEntry } from "./audit.js";
export {
    createSignerDaemon, reviveTypedMessage,
    type SignerDaemon, type SignerDaemonOptions,
} from "./daemon.js";
export {
    socketSignerAccount, signerHealth,
    type SocketSignerConfig,
} from "./account.js";
export { parseRequest, wireStringify, type WireRequest, type WireResponse, type SignerOp } from "./wire.js";
