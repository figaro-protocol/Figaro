import { decodeEventLog, type PublicClient } from "viem";
import { CORE_ABI } from "@/lib/core/contracts";
import { removeFulfillerEcdhKeypair } from "@/lib/handoff/ecdh";
import {
    readJsonStorage,
    readSessionStorage,
    writeJsonStorage,
    writeSessionStorage,
} from "@/lib/shared/storage";

export interface HandoffKeyRecord {
    keyB64: string;
    txHash: string;
    processId: string;
    orderId: string;
    createdAt: number;
    ephemeralPublicKeyHex?: string;
    ephemeralPrivateKeyHex?: string;
}

export interface PendingHandoffIntent {
    processId: string;
    originOrderId: string;
    pickupGeohash: string;
    dropoffGeohash: string;
    maxFulfillerPrice: string;
    createdAt: number;
}

export interface PersistHandoffArtifactsParams {
    publicClient: PublicClient;
    buyerAddress: string;
    orderTxHash: `0x${string}`;
    keyB64: string;
    pickupGeohash: string;
    dropoffGeohash: string;
    maxFulfillerPrice: string;
    ephemeralPublicKeyHex?: string;
    ephemeralPrivateKeyHex?: string;
}

export interface PersistedHandoffArtifacts {
    processId: string;
    orderId: string;
    txHash: string;
}

export interface OrderRef {
    processId: string;
    orderId: string;
    txHash?: string;
}

interface PurgeEntry {
    processId: string;
    orderId: string;
    purgeAfter: number;
}

export interface HandoffPersistenceService {
    saveHandoffKey(address: string, record: HandoffKeyRecord): void;
    getHandoffKey(address: string, processId: string, orderId: string): HandoffKeyRecord | null;
    removeHandoffKey(address: string, processId: string, orderId: string): void;
    savePendingHandoffIntent(address: string, intent: PendingHandoffIntent): void;
    getPendingHandoffIntent(address: string, processId: string, originOrderId: string): PendingHandoffIntent | null;
    removePendingHandoffIntent(address: string, processId: string, originOrderId: string): void;
    persistHandoffArtifactsForOrder(
        params: PersistHandoffArtifactsParams,
    ): Promise<PersistedHandoffArtifacts | null>;
    recoverHandoffKeys(
        walletClient: unknown,
        address: `0x${string}`,
        orders: OrderRef[],
    ): Promise<number>;
    purgeHandoffArtifacts(address: string, processId: string, orderId: string): void;
    schedulePurge(address: string, processId: string, orderId: string, gracePeriodMs: number): void;
    sweepDuePurges(address: string, now?: number): void;
}

export const HANDOFF_KEY_STORAGE_KEY = "figaro-handoff-keys";
export const PENDING_HANDOFF_INTENT_STORAGE_KEY = "figaro-pending-handoff-intents";
export const HANDOFF_PURGE_QUEUE_KEY = "figaro-handoff-purge-queue";

function handoffKeyStorageKey(address: string, processId: string, orderId: string): string {
    return `${address.toLowerCase()}:${processId}:${orderId}`;
}

function handoffIntentStorageKey(address: string, processId: string, originOrderId: string): string {
    return `${address.toLowerCase()}:${processId}:${originOrderId}`;
}

function readKeyStorage(): Record<string, HandoffKeyRecord> {
    return readSessionStorage<Record<string, HandoffKeyRecord>>(HANDOFF_KEY_STORAGE_KEY, {});
}

function writeKeyStorage(storage: Record<string, HandoffKeyRecord>) {
    writeSessionStorage(HANDOFF_KEY_STORAGE_KEY, storage);
}

function readIntentStorage(): Record<string, PendingHandoffIntent> {
    return readJsonStorage<Record<string, PendingHandoffIntent>>(PENDING_HANDOFF_INTENT_STORAGE_KEY, {});
}

function writeIntentStorage(storage: Record<string, PendingHandoffIntent>) {
    writeJsonStorage(PENDING_HANDOFF_INTENT_STORAGE_KEY, storage);
}

function readPurgeQueue(): PurgeEntry[] {
    return readJsonStorage<PurgeEntry[]>(HANDOFF_PURGE_QUEUE_KEY, []);
}

function writePurgeQueue(queue: PurgeEntry[]) {
    writeJsonStorage(HANDOFF_PURGE_QUEUE_KEY, queue);
}

function collectMatchingOrderIds(
    address: string,
    processId: string,
    orderId: string,
): Set<string> {
    if (orderId !== "all") {
        return new Set([orderId]);
    }

    const normalizedAddress = address.toLowerCase();
    const orderIds = new Set<string>();
    for (const [entryKey, record] of Object.entries(readKeyStorage())) {
        if (!entryKey.startsWith(`${normalizedAddress}:`)) continue;
        if (record.processId !== processId) continue;
        orderIds.add(record.orderId);
    }
    for (const [entryKey, intent] of Object.entries(readIntentStorage())) {
        if (!entryKey.startsWith(`${normalizedAddress}:`)) continue;
        if (intent.processId !== processId) continue;
        orderIds.add(intent.originOrderId);
    }
    return orderIds;
}

class DefaultHandoffPersistenceService implements HandoffPersistenceService {
    saveHandoffKey(address: string, record: HandoffKeyRecord): void {
        const storage = readKeyStorage();
        storage[handoffKeyStorageKey(address, record.processId, record.orderId)] = record;
        writeKeyStorage(storage);
    }

    getHandoffKey(address: string, processId: string, orderId: string): HandoffKeyRecord | null {
        const storage = readKeyStorage();
        return storage[handoffKeyStorageKey(address, processId, orderId)] ?? null;
    }

    removeHandoffKey(address: string, processId: string, orderId: string): void {
        const storage = readKeyStorage();
        delete storage[handoffKeyStorageKey(address, processId, orderId)];
        writeKeyStorage(storage);
    }

    savePendingHandoffIntent(address: string, intent: PendingHandoffIntent): void {
        const storage = readIntentStorage();
        storage[handoffIntentStorageKey(address, intent.processId, intent.originOrderId)] = intent;
        writeIntentStorage(storage);
    }

    getPendingHandoffIntent(address: string, processId: string, originOrderId: string): PendingHandoffIntent | null {
        const storage = readIntentStorage();
        return storage[handoffIntentStorageKey(address, processId, originOrderId)] ?? null;
    }

    removePendingHandoffIntent(address: string, processId: string, originOrderId: string): void {
        const storage = readIntentStorage();
        delete storage[handoffIntentStorageKey(address, processId, originOrderId)];
        writeIntentStorage(storage);
    }

    async persistHandoffArtifactsForOrder(
        params: PersistHandoffArtifactsParams,
    ): Promise<PersistedHandoffArtifacts | null> {
        const receipt = await params.publicClient.waitForTransactionReceipt({ hash: params.orderTxHash });
        let processId: string | null = null;
        let orderId: string | null = null;

        for (const log of receipt.logs ?? []) {
            try {
                const event = decodeEventLog({ abi: CORE_ABI, data: log.data, topics: log.topics });
                if (event.eventName === "OrderCommitted" && event.args?.processId) {
                    processId = event.args.processId;
                    orderId = event.args?.orderHash !== undefined ? String(event.args.orderHash) : null;
                    break;
                }
            } catch (err) {
                if (process.env.NODE_ENV === "development") {
                    console.debug("[handoffPersistenceService] skipping unrelated log", err);
                }
            }
        }

        if (!processId || !orderId) {
            return null;
        }

        this.saveHandoffKey(params.buyerAddress, {
            keyB64: params.keyB64,
            txHash: params.orderTxHash,
            processId,
            orderId,
            createdAt: Date.now(),
            ephemeralPublicKeyHex: params.ephemeralPublicKeyHex,
            ephemeralPrivateKeyHex: params.ephemeralPrivateKeyHex,
        });

        this.savePendingHandoffIntent(params.buyerAddress, {
            processId,
            originOrderId: orderId,
            pickupGeohash: params.pickupGeohash,
            dropoffGeohash: params.dropoffGeohash,
            maxFulfillerPrice: params.maxFulfillerPrice,
            createdAt: Date.now(),
        });

        return {
            processId,
            orderId,
            txHash: params.orderTxHash,
        };
    }

    async recoverHandoffKeys(
        _walletClient: unknown,
        address: `0x${string}`,
        orders: OrderRef[],
    ): Promise<number> {
        let present = 0;
        for (const order of orders) {
            if (this.getHandoffKey(address, order.processId, order.orderId)) {
                present++;
            }
        }
        return present;
    }

    purgeHandoffArtifacts(address: string, processId: string, orderId: string): void {
        const orderIds = collectMatchingOrderIds(address, processId, orderId);

        if (orderId === "all") {
            const normalizedAddress = address.toLowerCase();

            const keyStorage = readKeyStorage();
            for (const [entryKey, record] of Object.entries(keyStorage)) {
                if (!entryKey.startsWith(`${normalizedAddress}:`)) continue;
                if (record.processId !== processId) continue;
                delete keyStorage[entryKey];
            }
            writeKeyStorage(keyStorage);

            const intentStorage = readIntentStorage();
            for (const [entryKey, intent] of Object.entries(intentStorage)) {
                if (!entryKey.startsWith(`${normalizedAddress}:`)) continue;
                if (intent.processId !== processId) continue;
                delete intentStorage[entryKey];
            }
            writeIntentStorage(intentStorage);
        } else {
            this.removeHandoffKey(address, processId, orderId);
            this.removePendingHandoffIntent(address, processId, orderId);
        }

        for (const matchedOrderId of orderIds) {
            removeFulfillerEcdhKeypair(address, matchedOrderId);
        }
    }

    schedulePurge(address: string, processId: string, orderId: string, gracePeriodMs: number): void {
        if (gracePeriodMs <= 0) {
            this.purgeHandoffArtifacts(address, processId, orderId);
            return;
        }

        const queue = readPurgeQueue();
        const alreadyQueued = queue.some(
            (entry) => entry.processId === processId && entry.orderId === orderId,
        );

        if (!alreadyQueued) {
            queue.push({ processId, orderId, purgeAfter: Date.now() + gracePeriodMs });
            writePurgeQueue(queue);
        }
    }

    sweepDuePurges(address: string, now = Date.now()): void {
        const queue = readPurgeQueue();
        const remaining: PurgeEntry[] = [];

        for (const entry of queue) {
            if (now >= entry.purgeAfter) {
                this.purgeHandoffArtifacts(address, entry.processId, entry.orderId);
            } else {
                remaining.push(entry);
            }
        }

        if (remaining.length !== queue.length) {
            writePurgeQueue(remaining);
        }
    }
}

export const DEFAULT_HANDOFF_PERSISTENCE_SERVICE: HandoffPersistenceService =
    new DefaultHandoffPersistenceService();
