/**
 * Real XMTP HandoffChannel using @xmtp/browser-sdk v7.
 *
 * The SDK is dynamically imported so that SSR builds never
 * pull in OPFS / WASM code.  This module is only loaded via
 * `import('./xmtpChannel')` inside the channel factory.
 */

import type { HandoffChannel, HandoffKeyMessage, EcdhPubkeyMessage, EcdhWrappedKeyMessage, CommitmentSignatureMessage, ChannelMessage } from "@figaro-protocol/sdk/handoff";
import { keccak256 } from "viem";
import { safeJsonParse } from "@/lib/shared/safeJson";
import { hexToBytes } from "@/lib/shared/evm";

/** Domain-separated message the wallet signs to DERIVE the OPFS database
 *  encryption key. A wallet's ECDSA signature over a fixed message is
 *  deterministic (RFC 6979), so this yields the SAME 32-byte key every session
 *  without ever storing it — the key is re-derived, never persisted beside the
 *  encrypted database it protects (finding 8). */
const XMTP_DB_KEY_DERIVATION_MESSAGE =
    "Figaro: derive the local XMTP database encryption key for this device. " +
    "This signature never leaves your browser.";

/** Derive the 32-byte OPFS db-encryption key from a wallet signature over the
 *  fixed derivation message. */
async function deriveDbEncryptionKey(
    signMessage: (message: string) => Promise<`0x${string}`>,
): Promise<Uint8Array> {
    const sig = await signMessage(XMTP_DB_KEY_DERIVATION_MESSAGE);
    return hexToBytes(keccak256(sig));
}

function parseChannelMessage(content: unknown): ChannelMessage | null {
    return safeJsonParse<ChannelMessage>(content);
}

/** Messages fetched per conversation poll. */
const XMTP_MESSAGE_FETCH_LIMIT = 50n;

/**
 * The XMTP network this deployment coordinates over — DEPLOYMENT CONFIG, not
 * code: `NEXT_PUBLIC_XMTP_ENV` = `dev` (XMTP's public dev network — the DEVNET
 * build only; inboxes there are shared by every developer on earth) or
 * `production` (TESTNET and MAINNET — the testnet rehearses mainnet, so it
 * coordinates over the same network mainnet will). `||`, not `??`: an EMPTY
 * env value (a devnet .env.local read by `next build`) means the default.
 * Anything else is refused at first use rather than silently sent to the
 * wrong network.
 */
export type XmtpNetworkEnv = "dev" | "production";
export function xmtpNetworkEnv(): XmtpNetworkEnv {
    const raw = (process.env.NEXT_PUBLIC_XMTP_ENV || "dev").trim();
    if (raw === "dev" || raw === "production") return raw;
    throw new Error(`NEXT_PUBLIC_XMTP_ENV must be "dev" or "production", got "${raw}"`);
}

/** Retry an async operation with exponential backoff. */
async function withRetry<T>(
    fn: () => Promise<T>,
    { maxAttempts = 3, baseDelayMs = 1000, maxDelayMs = 10000 } = {},
): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt < maxAttempts - 1) {
                const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
                const jitter = delay * (0.5 + Math.random() * 0.5);
                await new Promise((r) => setTimeout(r, jitter));
                console.warn(`[xmtp] Client.create attempt ${attempt + 1} failed, retrying in ${Math.round(jitter)}ms...`, err);
            }
        }
    }
    throw lastError;
}

/** The XMTP network refuses new installations past 10 per inbox. */
function isInstallationCapError(err: unknown): boolean {
    return /already registered .*installations|revoke existing installations/i.test(
        err instanceof Error ? err.message : String(err),
    );
}

/**
 * Does this wallet already have an XMTP inbox? A static, signature-free
 * network read (`Client.canMessage`) — THE derived fact that replaces the
 * deleted per-wallet transport toggle (one-seam ruling 2026-08-14): a wallet
 * with an inbox chose XMTP somewhere, so connecting it here is continuation,
 * not seizure; a wallet without one stays on the links-only floor. Fails
 * CLOSED (no inbox) on network errors — the floor always works.
 */
export async function walletHasXmtpInbox(address: string): Promise<boolean> {
    try {
        const { Client, IdentifierKind } = await import("@xmtp/browser-sdk");
        const result = await Client.canMessage(
            [{ identifier: address.toLowerCase(), identifierKind: IdentifierKind.Ethereum }],
            xmtpNetworkEnv(),
        );
        return result.get(address.toLowerCase()) === true;
    } catch {
        return false;
    }
}

/** Create a real XMTP-backed coordination channel. */
export async function createXmtpChannel(
    address: string,
    signMessage: (message: string) => Promise<`0x${string}`>,
): Promise<HandoffChannel> {
    // Dynamic import — keeps WASM out of the server bundle.
    const { Client, IdentifierKind, generateInboxId } = await import("@xmtp/browser-sdk");

    const signer = {
        type: "EOA" as const,
        getIdentifier: () => ({
            identifier: address.toLowerCase(),
            identifierKind: IdentifierKind.Ethereum,
        }),
        signMessage: async (message: string) => hexToBytes(await signMessage(message)),
    };

    // Encrypt the OPFS database at rest (finding 8): without a dbEncryptionKey
    // the MLS installation key + cleartext DM history (ceremony ciphertext blobs
    // and public keys) sit unencrypted in OPFS, readable by any same-origin
    // script or local attacker. The key is derived from a wallet signature —
    // deterministic across sessions, never stored.
    const dbEncryptionKey = await deriveDbEncryptionKey(signMessage);

    // OPFS persistence (the SDK default dbPath): ONE installation per
    // browser+origin, reused across sessions. The prior `dbPath: null`
    // (ephemeral) minted a NEW installation keypair on every page session
    // and exhausted the inbox's 10-installation network cap within a day
    // of dev use.
    const env = xmtpNetworkEnv();
    const createClient = () => Client.create(signer, {
        env,
        disableAutoRegister: false,
        dbEncryptionKey,
    } as Parameters<typeof Client.create>[1]);

    let client: Awaited<ReturnType<typeof createClient>>;
    try {
        client = await withRetry(createClient);
    } catch (err) {
        if (!isInstallationCapError(err)) throw err;
        // Self-heal the installation cap: revoke EVERY existing installation
        // through the client-less static path (one extra wallet signature —
        // a fresh installation is created right after, and ephemeral-era
        // installations have no surviving local state worth keeping).
        const inboxId = await generateInboxId(signer.getIdentifier());
        const [state] = await Client.fetchInboxStates([inboxId], env);
        const installationIds = (state?.installations ?? []).map((inst) => inst.bytes);
        if (installationIds.length === 0) throw err;
        console.warn(`[xmtp] installation cap hit — revoking ${installationIds.length} stale installations for inbox ${inboxId}`);
        await Client.revokeInstallations(signer, inboxId, installationIds, env);
        client = await withRetry(createClient);
    }

    // DEV-network housekeeping: collapse this inbox to THE current
    // installation. Stale dev installations carry expired key packages that
    // later fail COUNTERPARTY validation when a DM opens ("[ClientError::
    // Group] Failed to verify all installations") — and only the owning
    // wallet can revoke its own. One wallet, one browser, one installation
    // is the dev model; a production policy must never silently revoke a
    // user's other devices, which is why this runs ONLY against env "dev".
    if (env === "dev") {
        try {
            const ownState = await client.preferences.inboxState();
            const stale = (ownState?.installations ?? []).filter((inst) => inst.id !== client.installationId);
            if (stale.length > 0) {
                console.warn(`[xmtp] revoking ${stale.length} stale installations (dev housekeeping)`);
                await client.revokeInstallations(stale.map((inst) => inst.bytes));
            }
        } catch (housekeepingErr) {
            // Housekeeping is best-effort — the channel still works for inboxes
            // that were already clean.
            console.warn("[xmtp] stale-installation housekeeping failed (continuing)", housekeepingErr);
        }
    }

    // ── THE ONE MESSAGE PUMP ────────────────────────────────────────────
    //
    // Receive-path rewrite (2026-07-22, the smoke-reproduced bug): the prior
    // shape gave EVERY subscriber its own sync→list→scan→streamAllMessages
    // loop. Three structural failures, each observed or implied on the real
    // dev network:
    //   1. /orders mounts three subscribers → three concurrent WASM streams
    //      on one client (the stream-sharing question).
    //   2. A loop error KILLED its listener permanently behind a console.warn.
    //   3. A healthy streamAllMessages can miss the FIRST message of a
    //      brand-new DM when the MLS welcome isn't processed — exactly the
    //      smoke's symptom: the buyer's send reports delivered, the seller's
    //      /orders never hears it.
    // Now the channel owns ONE pump: a resilient stream loop (rebuilds on
    // death) plus a periodic sync+scan sweep (processes welcomes, closes the
    // startup window). Message-id dedup makes the overlap harmless; a bounded
    // replay buffer preserves the old semantics where every subscriber —
    // however late it mounts — sees recent history before live traffic.

    interface PumpedMessage {
        parsed: ChannelMessage;
        senderInboxId: string;
    }
    type PumpSubscriber = (msg: PumpedMessage) => void;

    const subscribers = new Set<PumpSubscriber>();
    const seenMessageIds = new Set<string>();
    const replayBuffer: PumpedMessage[] = [];
    const REPLAY_BUFFER_MAX = 200;
    const SEEN_IDS_MAX = 2000;
    /** Catch-up cadence — each sweep runs conversations.sync() (processes
     *  pending MLS welcomes → new DMs join) and re-scans recent messages.
     *  The live stream carries the common case; the sweep is the safety net. */
    const CATCH_UP_INTERVAL_MS = 5_000;
    let pumpStarted = false;
    let destroyed = false;

    function deliver(msg: { id?: string; content: unknown; senderInboxId: string }): void {
        const parsed = parseChannelMessage(msg.content);
        if (!parsed) return;
        // Dedup on the wire message id (catch-up and stream overlap by
        // design); fall back to a content-derived key for safety.
        const key = msg.id ?? `${parsed.type}:${"orderId" in parsed ? parsed.orderId : ""}:${parsed.ts}`;
        if (seenMessageIds.has(key)) return;
        seenMessageIds.add(key);
        if (seenMessageIds.size > SEEN_IDS_MAX) {
            const oldest = seenMessageIds.values().next().value;
            if (oldest !== undefined) seenMessageIds.delete(oldest);
        }
        const pumped: PumpedMessage = { parsed, senderInboxId: msg.senderInboxId };
        replayBuffer.push(pumped);
        if (replayBuffer.length > REPLAY_BUFFER_MAX) replayBuffer.shift();
        for (const sub of [...subscribers]) sub(pumped);
    }

    async function catchUpSweep(): Promise<void> {
        // syncAll, not sync: `conversations.sync()` processes WELCOMES only —
        // it never pulls the messages inside a joined group, and
        // `convo.messages()` reads the LOCAL store. A message sent before the
        // live stream covered its group is history nothing back-fills, which
        // was the actual receive-side bug (smoke run 5: the seller logs
        // "already in group …" yet the message never surfaces). syncAll
        // syncs welcomes AND every conversation's message history.
        await client.conversations.syncAll();
        const convos = await client.conversations.list();
        for (const convo of convos) {
            if (destroyed) return;
            const msgs = await convo.messages({ limit: XMTP_MESSAGE_FETCH_LIMIT });
            for (const msg of msgs) deliver(msg);
        }
    }

    function ensurePump(): void {
        if (pumpStarted) return;
        pumpStarted = true;
        // Loop A — the live stream, rebuilt whenever it ends or errors.
        void (async () => {
            while (!destroyed) {
                try {
                    const stream = await client.conversations.streamAllMessages();
                    for await (const msg of stream) {
                        if (destroyed) break;
                        deliver(msg);
                    }
                } catch (err) {
                    console.warn("[xmtp] message stream died — rebuilding:", err);
                }
                if (!destroyed) await new Promise((r) => setTimeout(r, 2_000));
            }
        })();
        // Loop B — the periodic catch-up sweep (welcomes + missed windows).
        void (async () => {
            while (!destroyed) {
                try {
                    await catchUpSweep();
                } catch (err) {
                    console.warn("[xmtp] catch-up sweep failed (next sweep retries):", err);
                }
                if (!destroyed) await new Promise((r) => setTimeout(r, CATCH_UP_INTERVAL_MS));
            }
        })();
    }

    /** Subscribe a filter to the pump; replays buffered history first so a
     *  late-mounting subscriber keeps the old scan-history semantics. */
    function subscribe(filter: PumpSubscriber): () => void {
        ensurePump();
        let active = true;
        const guarded: PumpSubscriber = (m) => { if (active) filter(m); };
        for (const pumped of [...replayBuffer]) guarded(pumped);
        subscribers.add(guarded);
        return () => {
            active = false;
            subscribers.delete(guarded);
        };
    }

    /** Generic listener for typed channel messages over XMTP.
     *
     *  `once` stops after the first match (single-shot exchanges). The
     *  authenticated ECDH listeners pass `once: false` and deliver EVERY
     *  match: order hashes are public, so any inbox can inject a matching
     *  envelope — the CONSUMER verifies each message's wallet signature and
     *  skips failures, and a listener that stopped at the first match would
     *  hand garbage a denial-of-ceremony win. `senderInboxId` is passed
     *  through as transport metadata only (an XMTP inbox id, NOT a wallet
     *  address) — identity lives in the message signature, never here. */
    function listenForMessage<T extends ChannelMessage>(
        type: T["type"],
        orderId: string,
        onMatch: (msg: T, senderInboxId: string) => void,
        { once = true }: { once?: boolean } = {},
    ): () => void {
        let done = false;
        const unsubscribe = subscribe(({ parsed, senderInboxId }) => {
            if (done) return;
            if (parsed.type !== type || !("orderId" in parsed) || parsed.orderId !== orderId) return;
            onMatch(parsed as T, senderInboxId);
            if (once) {
                done = true;
                unsubscribe();
            }
        });
        return unsubscribe;
    }

    return {
        async sendHandoffKey({ recipientAddress, orderId, keyB64 }) {
            const dm = await client.conversations.createDmWithIdentifier({
                identifier: recipientAddress.toLowerCase(),
                identifierKind: IdentifierKind.Ethereum,
            });

            const payload: HandoffKeyMessage = {
                type: "HANDOFF_KEY",
                orderId,
                keyB64,
                ts: Date.now(),
            };
            await dm.sendText(JSON.stringify(payload));
        },

        onHandoffKey(orderId, callback) {
            return listenForMessage<HandoffKeyMessage>(
                "HANDOFF_KEY",
                orderId,
                (msg, senderInboxId) => callback(msg.keyB64, senderInboxId),
            );
        },

        // ── ECDH pubkey exchange via XMTP DM ──

        async sendEcdhPubkey({ recipientAddress, orderId, pubKeyHex, senderAddress, sig }) {
            const dm = await client.conversations.createDmWithIdentifier({
                identifier: recipientAddress.toLowerCase(),
                identifierKind: IdentifierKind.Ethereum,
            });
            const payload: EcdhPubkeyMessage = {
                type: "ECDH_PUBKEY",
                orderId,
                pubKeyHex,
                senderAddress,
                sig,
                ts: Date.now(),
            };
            await dm.sendText(JSON.stringify(payload));
        },

        onEcdhPubkey(orderId, callback) {
            return listenForMessage<EcdhPubkeyMessage>(
                "ECDH_PUBKEY",
                orderId,
                (msg, senderInboxId) => callback(msg, senderInboxId),
                { once: false },
            );
        },

        // ── ECDH wrapped key via XMTP DM ──

        async sendWrappedKey({ recipientAddress, orderId, wrappedKeyB64, senderAddress, sig }) {
            const dm = await client.conversations.createDmWithIdentifier({
                identifier: recipientAddress.toLowerCase(),
                identifierKind: IdentifierKind.Ethereum,
            });
            const payload: EcdhWrappedKeyMessage = {
                type: "ECDH_WRAPPED_KEY",
                orderId,
                wrappedKeyB64,
                senderAddress,
                sig,
                ts: Date.now(),
            };
            await dm.sendText(JSON.stringify(payload));
        },

        onWrappedKey(orderId, callback) {
            return listenForMessage<EcdhWrappedKeyMessage>(
                "ECDH_WRAPPED_KEY",
                orderId,
                (msg, senderInboxId) => callback(msg, senderInboxId),
                { once: false },
            );
        },

        // ── Commitment payload exchange via XMTP DM ──

        async sendCommitmentPayload({ recipientAddress, orderId, payload }) {
            const dm = await client.conversations.createDmWithIdentifier({
                identifier: recipientAddress.toLowerCase(),
                identifierKind: IdentifierKind.Ethereum,
            });
            const message: CommitmentSignatureMessage = {
                type: "COMMITMENT_PAYLOAD",
                orderId,
                payload,
                ts: Date.now(),
            };
            await dm.sendText(JSON.stringify(message));
        },

        onCommitmentPayload(orderId, callback) {
            return listenForMessage<CommitmentSignatureMessage>(
                "COMMITMENT_PAYLOAD",
                orderId,
                (msg, senderInboxId) => callback(msg.payload, senderInboxId),
            );
        },

        onAnyCommitmentPayload(callback) {
            // Per-subscriber dedup on (orderId, ts): the pump's message-id
            // dedup is transport-level; this keeps the consumer contract that
            // one logical payload fires once even if relayed twice.
            const seen = new Set<string>();
            return subscribe(({ parsed }) => {
                if (parsed.type !== "COMMITMENT_PAYLOAD") return;
                const messageKey = `${parsed.orderId}:${parsed.ts}`;
                if (seen.has(messageKey)) return;
                seen.add(messageKey);
                callback(parsed.payload, parsed.orderId);
            });
        },

        destroy() {
            destroyed = true;
            subscribers.clear();
            try {
                client.close();
            } catch { /* already closed */ }
        },
    };
}
