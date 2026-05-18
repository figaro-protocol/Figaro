/**
 * Generic state machine for an async outbound message / transport flow.
 *
 *   idle    → no send attempted yet (or reset after a previous send)
 *   waiting → prerequisite gating before send (e.g. counterparty key, address)
 *   sending → request in flight
 *   sent    → terminal success
 *   error   → terminal failure
 *
 * Callers that have no waiting precondition should derive their narrower type
 * via `Exclude<MessageSendStatus, "waiting">`.
 */
export type MessageSendStatus = "idle" | "waiting" | "sending" | "sent" | "error";
