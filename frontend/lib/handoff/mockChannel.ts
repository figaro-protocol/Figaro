/**
 * Mock CoordinationChannel for e2e tests.
 *
 * Messages are persisted in same-origin localStorage so separate pages in the
 * same browser context can exchange keys and commitment payloads without a real
 * XMTP network.
 */

import type { CoordinationChannel, HandoffKeyMessage, EcdhPubkeyMessage, EcdhWrappedKeyMessage, CommitmentSignatureMessage } from "./channel";

type StoredHandoffKeyMessage = HandoffKeyMessage & { senderIdentity: string };
type StoredEcdhPubkeyMessage = EcdhPubkeyMessage & { senderIdentity: string };
type StoredEcdhWrappedKeyMessage = EcdhWrappedKeyMessage & { senderIdentity: string };
type StoredCommitmentSignatureMessage = CommitmentSignatureMessage & { senderIdentity: string };

type StoredMockMessage = (
    StoredHandoffKeyMessage
    | StoredEcdhPubkeyMessage
    | StoredEcdhWrappedKeyMessage
    | StoredCommitmentSignatureMessage
);

const MOCK_STORAGE_KEY = "__FIGARO_COORDINATION_MOCK_MESSAGES__";
const MOCK_BROADCAST_KEY = "__FIGARO_COORDINATION_MOCK_LAST_MESSAGE__";
const MAX_STORED_MESSAGES = 200;

declare global {
    interface Window {
        __FIGARO_COORDINATION_MOCK__?: {
            messages: StoredMockMessage[];
            listeners: Array<{
                orderId?: string;
                type: string;
                callback: (...args: unknown[]) => void;
            }>;
            storageBridgeAttached?: boolean;
        };
    }
}

function parseStoredMessages(raw: string | null): StoredMockMessage[] {
    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed as StoredMockMessage[] : [];
    } catch {
        return [];
    }
}

function isStoredHandoffKeyMessage(message: StoredMockMessage): message is StoredHandoffKeyMessage {
    return message.type === "HANDOFF_KEY";
}

function isStoredEcdhPubkeyMessage(message: StoredMockMessage): message is StoredEcdhPubkeyMessage {
    return message.type === "ECDH_PUBKEY";
}

function isStoredEcdhWrappedKeyMessage(message: StoredMockMessage): message is StoredEcdhWrappedKeyMessage {
    return message.type === "ECDH_WRAPPED_KEY";
}

function isStoredCommitmentSignatureMessage(message: StoredMockMessage): message is StoredCommitmentSignatureMessage {
    return message.type === "COMMITMENT_PAYLOAD";
}

function readPersistedMessages(): StoredMockMessage[] {
    if (typeof window === "undefined") {
        return [];
    }

    try {
        return parseStoredMessages(window.localStorage.getItem(MOCK_STORAGE_KEY));
    } catch {
        return [];
    }
}

function persistMessage(message: StoredMockMessage) {
    if (typeof window === "undefined") {
        return;
    }

    try {
        const existing = readPersistedMessages();
        const next = [...existing, message].slice(-MAX_STORED_MESSAGES);
        window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(next));
        window.localStorage.setItem(MOCK_BROADCAST_KEY, JSON.stringify(message));
    } catch {
        // Storage can fail in restricted contexts. Tests can still use same-page delivery.
    }
}

function notifyMessage(
    store: NonNullable<Window["__FIGARO_COORDINATION_MOCK__"]>,
    message: StoredMockMessage,
) {
    const notify = (type: string, orderId: string, ...args: unknown[]) => {
        for (const listener of store.listeners) {
            if (listener.type === type && (listener.orderId === undefined || listener.orderId === orderId)) {
                try {
                    listener.callback(...args);
                } catch {
                    // Test harness listeners should not crash message delivery.
                }
            }
        }
    };

    switch (message.type) {
        case "HANDOFF_KEY":
            notify("HANDOFF_KEY", message.orderId, message.keyB64, message.senderIdentity);
            return;
        case "ECDH_PUBKEY":
            notify("ECDH_PUBKEY", message.orderId, message.pubKeyHex, message.senderIdentity);
            return;
        case "ECDH_WRAPPED_KEY":
            notify("ECDH_WRAPPED_KEY", message.orderId, message.wrappedKeyB64, message.senderIdentity);
            return;
        case "COMMITMENT_PAYLOAD":
            notify("COMMITMENT_PAYLOAD", message.orderId, message.payloadCid, message.senderIdentity, message.orderId);
            return;
    }
}

function ensureStore() {
    if (typeof window === "undefined") return undefined;
    if (!window.__FIGARO_COORDINATION_MOCK__) {
        window.__FIGARO_COORDINATION_MOCK__ = {
            messages: readPersistedMessages(),
            listeners: [],
        };
    }

    if (!window.__FIGARO_COORDINATION_MOCK__.storageBridgeAttached) {
        window.addEventListener("storage", (event) => {
            if (event.key !== MOCK_BROADCAST_KEY || !event.newValue) {
                return;
            }

            const [message] = parseStoredMessages(`[${event.newValue}]`);
            if (!message) {
                return;
            }

            const store = window.__FIGARO_COORDINATION_MOCK__;
            if (!store) {
                return;
            }

            store.messages.push(message);
            notifyMessage(store, message);
        });
        window.__FIGARO_COORDINATION_MOCK__.storageBridgeAttached = true;
    }

    return window.__FIGARO_COORDINATION_MOCK__;
}

export function createMockChannel(ownerAddress: string): CoordinationChannel {
    const store = ensureStore();

    if (!store) {
        throw new Error("Mock coordination channel requires a browser window");
    }

    const channelStore = store;

    function deliver(message: StoredMockMessage) {
        channelStore.messages.push(message);
        persistMessage(message);
        notifyMessage(channelStore, message);
    }

    function subscribe(type: string, callback: (...args: unknown[]) => void, orderId?: string): () => void {
        const entry = { orderId, type, callback };
        channelStore.listeners.push(entry);
        return () => {
            const idx = channelStore.listeners.indexOf(entry);
            if (idx >= 0) channelStore.listeners.splice(idx, 1);
        };
    }

    return {
        async sendHandoffKey({ recipientAddress: _, orderId, keyB64 }) {
            const msg: StoredMockMessage = {
                type: "HANDOFF_KEY",
                orderId,
                keyB64,
                ts: Date.now(),
                senderIdentity: ownerAddress,
            };
            deliver(msg);
        },

        onHandoffKey(orderId, callback) {
            const existing = readPersistedMessages().find(
                (message): message is StoredHandoffKeyMessage => isStoredHandoffKeyMessage(message) && message.orderId === orderId,
            );
            if (existing) {
                queueMicrotask(() => callback(existing.keyB64, existing.senderIdentity));
            }
            return subscribe("HANDOFF_KEY", (k, s) => callback(k as string, s as string), orderId);
        },

        // ── ECDH pubkey exchange ──

        async sendEcdhPubkey({ recipientAddress: _, orderId, pubKeyHex }) {
            const msg: StoredMockMessage = {
                type: "ECDH_PUBKEY",
                orderId,
                pubKeyHex,
                ts: Date.now(),
                senderIdentity: ownerAddress,
            };
            deliver(msg);
        },

        onEcdhPubkey(orderId, callback) {
            // Replay EVERY persisted message — both parties send a pubkey on
            // the same orderId (a two-message exchange); replaying only the
            // first starves a late subscriber of the counterparty's key.
            // Mirrors XMTP's full-DM-history delivery.
            const existing = readPersistedMessages().filter(
                (message): message is StoredEcdhPubkeyMessage => isStoredEcdhPubkeyMessage(message) && message.orderId === orderId,
            );
            for (const message of existing) {
                queueMicrotask(() => callback(message.pubKeyHex, message.senderIdentity));
            }
            return subscribe("ECDH_PUBKEY", (pk, s) => callback(pk as string, s as string), orderId);
        },

        // ── ECDH wrapped key ──

        async sendWrappedKey({ recipientAddress: _, orderId, wrappedKeyB64 }) {
            const msg: StoredMockMessage = {
                type: "ECDH_WRAPPED_KEY",
                orderId,
                wrappedKeyB64,
                ts: Date.now(),
                senderIdentity: ownerAddress,
            };
            deliver(msg);
        },

        onWrappedKey(orderId, callback) {
            // Replay EVERY persisted message (see onEcdhPubkey).
            const existing = readPersistedMessages().filter(
                (message): message is StoredEcdhWrappedKeyMessage => isStoredEcdhWrappedKeyMessage(message) && message.orderId === orderId,
            );
            for (const message of existing) {
                queueMicrotask(() => callback(message.wrappedKeyB64, message.senderIdentity));
            }
            return subscribe("ECDH_WRAPPED_KEY", (wk, s) => callback(wk as string, s as string), orderId);
        },

        // ── Commitment payload exchange ──

        async sendCommitmentPayload({ recipientAddress: _, orderId, payloadCid }) {
            const msg: StoredMockMessage = {
                type: "COMMITMENT_PAYLOAD",
                orderId,
                payloadCid,
                ts: Date.now(),
                senderIdentity: ownerAddress,
            };
            deliver(msg);
        },

        onCommitmentPayload(orderId, callback) {
            const existing = readPersistedMessages().find(
                (message): message is StoredCommitmentSignatureMessage => isStoredCommitmentSignatureMessage(message) && message.orderId === orderId,
            );
            if (existing) {
                queueMicrotask(() => callback(existing.payloadCid, existing.senderIdentity));
            }
            return subscribe("COMMITMENT_PAYLOAD", (pc, s) => callback(pc as string, s as string), orderId);
        },

        onAnyCommitmentPayload(callback) {
            const existing = readPersistedMessages().filter(
                isStoredCommitmentSignatureMessage,
            );
            for (const message of existing) {
                queueMicrotask(() => callback(message.payloadCid, message.orderId));
            }

            return subscribe(
                "COMMITMENT_PAYLOAD",
                (payloadCid, _senderIdentity, orderId) => callback(payloadCid as string, orderId as string),
            );
        },

        destroy() {
            // Nothing to tear down for the mock.
        },
    };
}
