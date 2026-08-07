/**
 * userTransport — per-user coordination-transport selection.
 *
 * The off-chain coordination channel (pending-commitment counter-sign,
 * handoff key exchange) has an optional PUSH transport (XMTP dev network)
 * that is OFF by default. The floor is `links-only`: the share/receive URI
 * flow, which needs no broker and no third-party messaging network — a
 * hosted deploy must never seize a visitor onto XMTP they never chose.
 * `xmtp` is a deliberate per-wallet opt-in.
 *
 * Mirrors the userEndpoints override pattern (localStorage, read at call
 * time — see `lib/shared/userEndpoints`). Applies on the next reload, like
 * the RPC override: the channel is a per-wallet cached singleton.
 */
import { readJsonStorage, writeJsonStorage } from "@/lib/shared/storage";

const STORAGE_KEY = "figaro.user-transport";

/** The transports a wallet can select for the off-chain coordination channel. */
export type CoordinationTransport = "links-only" | "xmtp";

/** The floor: share/receive links, no push transport. */
const DEFAULT_TRANSPORT: CoordinationTransport = "links-only";

function sanitize(value: unknown): CoordinationTransport {
    return value === "xmtp" ? "xmtp" : DEFAULT_TRANSPORT;
}

export function readUserTransport(): CoordinationTransport {
    const raw = readJsonStorage<{ transport?: unknown }>(STORAGE_KEY, {});
    return sanitize(raw.transport);
}

/** @public The picker died with /settings (four-SoC ruling); the testnet
 *  channel rationalization (punchlist) is this writer's next caller. */
export function writeUserTransport(next: CoordinationTransport): void {
    writeJsonStorage(STORAGE_KEY, { transport: sanitize(next) });
}
