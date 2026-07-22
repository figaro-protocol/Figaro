/**
 * Real XMTP HandoffChannel using @xmtp/browser-sdk v7.
 *
 * The SDK is dynamically imported so that SSR builds never
 * pull in OPFS / WASM code.  This module is only loaded via
 * `import('./xmtpChannel')` inside the channel factory.
 */

import type { HandoffChannel, HandoffKeyMessage, EcdhPubkeyMessage, EcdhWrappedKeyMessage, CommitmentSignatureMessage, ChannelMessage } from "@figaro/sdk/handoff";
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
    const createClient = () => Client.create(signer, {
        env: "dev",
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
        const [state] = await Client.fetchInboxStates([inboxId], "dev");
        const installationIds = (state?.installations ?? []).map((inst) => inst.bytes);
        if (installationIds.length === 0) throw err;
        console.warn(`[xmtp] installation cap hit — revoking ${installationIds.length} stale installations for inbox ${inboxId}`);
        await Client.revokeInstallations(signer, inboxId, installationIds, "dev");
        client = await withRetry(createClient);
    }

    // DEV-network housekeeping: collapse this inbox to THE current
    // installation. Stale dev installations carry expired key packages that
    // later fail COUNTERPARTY validation when a DM opens ("[ClientError::
    // Group] Failed to verify all installations") — and only the owning
    // wallet can revoke its own. One wallet, one browser, one installation
    // is the dev model; a production policy must never silently revoke a
    // user's other devices, which is why this runs only against env "dev".
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

    // Track active stream cleanups.
    const streamCleanups: Array<() => void> = [];

    /** Generic listener for typed channel messages over XMTP.
     *
     *  `once` stops after the first match (single-shot exchanges). The
     *  authenticated ECDH listeners pass `once: false` and deliver EVERY
     *  match: order hashes are public, so any inbox can inject a matching
     *  envelope — the CONSUMER verifies each message's wallet signature and
     *  skips failures, and a listener that stopped at the first match would
     *  hand garbage a denial-of-ceremony win. `msg.senderInboxId` is passed
     *  through as transport metadata only (an XMTP inbox id, NOT a wallet
     *  address) — identity lives in the message signature, never here. */
    function listenForMessage<T extends ChannelMessage>(
        type: T["type"],
        orderId: string,
        onMatch: (msg: T, senderInboxId: string) => void,
        { once = true }: { once?: boolean } = {},
    ): () => void {
        let cancelled = false;

        const run = async () => {
            try {
                await client.conversations.sync();
                const convos = await client.conversations.list();
                for (const convo of convos) {
                    const msgs = await convo.messages({ limit: XMTP_MESSAGE_FETCH_LIMIT });
                    for (const msg of msgs) {
                        if (cancelled) return;
                        const parsed = parseChannelMessage(msg.content);
                        if (parsed?.type === type && parsed.orderId === orderId) {
                            onMatch(parsed as T, msg.senderInboxId);
                            if (once) return;
                        }
                    }
                }
                const stream = await client.conversations.streamAllMessages();
                for await (const msg of stream) {
                    if (cancelled) break;
                    const parsed = parseChannelMessage(msg.content);
                    if (parsed?.type === type && parsed.orderId === orderId) {
                        onMatch(parsed as T, msg.senderInboxId);
                        if (once) break;
                    }
                }
            } catch (err) {
                console.warn(`[xmtp] ${type} listener error:`, err);
            }
        };

        void run();
        const cleanup = () => { cancelled = true; };
        streamCleanups.push(cleanup);
        return cleanup;
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

        async sendCommitmentPayload({ recipientAddress, orderId, payloadCid }) {
            const dm = await client.conversations.createDmWithIdentifier({
                identifier: recipientAddress.toLowerCase(),
                identifierKind: IdentifierKind.Ethereum,
            });
            const payload: CommitmentSignatureMessage = {
                type: "COMMITMENT_PAYLOAD",
                orderId,
                payloadCid,
                ts: Date.now(),
            };
            await dm.sendText(JSON.stringify(payload));
        },

        onCommitmentPayload(orderId, callback) {
            return listenForMessage<CommitmentSignatureMessage>(
                "COMMITMENT_PAYLOAD",
                orderId,
                (msg, senderInboxId) => callback(msg.payloadCid, senderInboxId),
            );
        },

        onAnyCommitmentPayload(callback) {
            let cancelled = false;
            const seen = new Set<string>();

            const run = async () => {
                try {
                    await client.conversations.sync();
                    const convos = await client.conversations.list();
                    for (const convo of convos) {
                        const msgs = await convo.messages({ limit: XMTP_MESSAGE_FETCH_LIMIT });
                        for (const msg of msgs) {
                            if (cancelled) return;
                            const parsed = parseChannelMessage(msg.content);
                            if (parsed?.type !== "COMMITMENT_PAYLOAD") {
                                continue;
                            }

                            const messageKey = `${parsed.orderId}:${parsed.ts}`;
                            if (seen.has(messageKey)) {
                                continue;
                            }

                            seen.add(messageKey);
                            callback(parsed.payloadCid, parsed.orderId);
                        }
                    }

                    const stream = await client.conversations.streamAllMessages();
                    for await (const msg of stream) {
                        if (cancelled) {
                            break;
                        }

                        const parsed = parseChannelMessage(msg.content);
                        if (parsed?.type !== "COMMITMENT_PAYLOAD") {
                            continue;
                        }

                        const messageKey = `${parsed.orderId}:${parsed.ts}`;
                        if (seen.has(messageKey)) {
                            continue;
                        }

                        seen.add(messageKey);
                        callback(parsed.payloadCid, parsed.orderId);
                    }
                } catch (err) {
                    console.warn("[xmtp] commitment channel listener error:", err);
                }
            };

            void run();
            const cleanup = () => {
                cancelled = true;
            };
            streamCleanups.push(cleanup);
            return cleanup;
        },

        destroy() {
            for (const fn of streamCleanups) fn();
            streamCleanups.length = 0;
            try {
                client.close();
            } catch { /* already closed */ }
        },
    };
}
