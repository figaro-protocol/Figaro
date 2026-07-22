import { removeOrderEcdhKeypair } from "@/lib/handoff/ecdh";
import { readJsonStorage, writeJsonStorage } from "@/lib/shared/storage";

/**
 * handoffPersistenceService — the resolution-path PURGE choreography for
 * per-order ceremony key material.
 *
 * GDPR posture (operator ruling 2026-07-22): key material is EPHEMERAL by
 * construction — the only key store is the ecdh sessionStorage store
 * (`lib/handoff/ecdh.ts`: per-order keypairs, tab-close clearing, its own
 * abandoned-ceremony age sweep). This service adds the resolution-path purge:
 * when an order resolves (`useHandoffCleanup` watching OrderResolved), its
 * keypair is removed immediately or after a configured grace period. Deleting
 * a key is crypto-shredding — the encrypted channel blobs become permanently
 * unreadable, which is the deletability the layered-evidence pattern promises.
 *
 * The DURABLE data side this service once carried (a saved handoff-key store,
 * pending-intent records with geohashes, wallet-signature key recovery) was
 * deleted under the same ruling: its producers were burned in the open-world
 * corpse pass (`700cf1a2` — the three handoff facades) and durable key
 * persistence runs against the crypto-shredding posture. Only the purge QUEUE
 * survives in localStorage — pseudonymous order references plus timestamps,
 * never key material.
 */

interface PurgeEntry {
    processId: string;
    orderId: string;
    purgeAfter: number;
}

export interface HandoffPersistenceService {
    /** Remove the order's ECDH keypair NOW — crypto-shredding on resolution. */
    purgeHandoffArtifacts(address: string, processId: string, orderId: string): void;
    /** Purge now (no grace) or enqueue for `sweepDuePurges` after the grace period. */
    schedulePurge(address: string, processId: string, orderId: string, gracePeriodMs: number): void;
    /** Execute queued purges whose grace period has elapsed. */
    sweepDuePurges(address: string, now?: number): void;
}

export const HANDOFF_PURGE_QUEUE_KEY = "figaro-handoff-purge-queue";

function readPurgeQueue(): PurgeEntry[] {
    return readJsonStorage<PurgeEntry[]>(HANDOFF_PURGE_QUEUE_KEY, []);
}

function writePurgeQueue(queue: PurgeEntry[]) {
    writeJsonStorage(HANDOFF_PURGE_QUEUE_KEY, queue);
}

class DefaultHandoffPersistenceService implements HandoffPersistenceService {
    purgeHandoffArtifacts(address: string, _processId: string, orderId: string): void {
        removeOrderEcdhKeypair(address, orderId);
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
