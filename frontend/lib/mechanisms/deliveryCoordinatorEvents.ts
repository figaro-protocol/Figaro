/**
 * Delivery coordinator event source for the evidence timeline.
 *
 * Per-role sovereign event logs (figaro-merchant-process-v1,
 * figaro-courier-process-v1) plus proximity proofs
 * (figaro-proximity-proof-v1) come from AttestationCoordinator's unified
 * Attestation event. Proximity proofs carry their proof bytes
 * (band, nonce, deviceSig) in the on-chain `content` payload; the event's
 * `contentRef = keccak256(content)` is a verification digest, not an
 * off-chain pointer.
 *
 * Used by buildExtendedTimeline() to produce rich dispute evidence that
 * includes:
 *   - Merchant-role events (prep-started, ready-for-pickup, handed-off, …)
 *   - Courier-role events (en-route-pickup, arrived-pickup, completed, …)
 *   - Proximity proof attestations (separate schema; proof bytes in `content`)
 *
 * This is a read-only module. No contract writes.
 */

import { keccak256, stringToHex, type PublicClient } from "viem";
import type { CoordinatorEventSource, TimelineEvent } from "@/lib/dispute/evidenceTimeline";
import { CONTRACTS, ATTESTATION_COORDINATOR_ABI } from "@/lib/core/contracts";
import {
    COURIER_PROCESS_SCHEMA_KEY,
    MERCHANT_PROCESS_SCHEMA_KEY,
} from "@/lib/core/agreementManifest";

const PROXIMITY_SCHEMA_KEY = "figaro-proximity-proof-v1";

const MERCHANT_SCHEMA_ID = keccak256(stringToHex(MERCHANT_PROCESS_SCHEMA_KEY));
const COURIER_SCHEMA_ID = keccak256(stringToHex(COURIER_PROCESS_SCHEMA_KEY));
const PROXIMITY_SCHEMA_ID = keccak256(stringToHex(PROXIMITY_SCHEMA_KEY));

/** Merchant lifecycle event labels keyed by uint8 stage. */
const MERCHANT_EVENT_LABELS: Record<number, string> = {
    0: "Order Received",
    1: "Order Accepted",
    2: "Preparation Started",
    3: "Ready for Pickup",
    4: "Handed Off",
    5: "Order Cancelled",
};

/** Courier lifecycle event labels keyed by uint8 stage. */
const COURIER_EVENT_LABELS: Record<number, string> = {
    0: "Courier Available",
    1: "Courier Accepted",
    2: "En Route to Pickup",
    3: "Arrived at Pickup",
    4: "In Transit",
    5: "Arrived at Dropoff",
    6: "Delivered",
    7: "Job Cancelled",
};

const BAND_LABELS: Record<number, string> = {
    0: "None",
    1: "Zone (WiFi ~30m)",
    2: "Nearby (BLE ~10m)",
    3: "Contact (NFC ~4cm)",
    4: "Visual (QR ~1-3m)",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getBlockTimestamp(
    client: PublicClient,
    blockNumber: bigint,
    cache: Map<string, number>,
): Promise<number> {
    const key = blockNumber.toString();
    if (cache.has(key)) return cache.get(key)!;
    const block = await client.getBlock({ blockNumber });
    const ts = Number(block.timestamp);
    cache.set(key, ts);
    return ts;
}

// ---------------------------------------------------------------------------
// Event source factory
// ---------------------------------------------------------------------------

/**
 * Create a CoordinatorEventSource for per-role lifecycle attestations.
 *
 * All attestations (lifecycle, proximity, GHG) come through the unified
 * Attestation event. The per-role schemas surface as merchant and courier
 * events with role-specific labels. Proximity proofs are standard
 * attestations under the figaro-proximity-proof-v1 schema; proof bytes
 * live in the on-chain `content` payload.
 */
export function createDeliveryCoordinatorSource(): CoordinatorEventSource {
    return {
        name: "DeliveryCoordinator",
        fetchEvents: async (client, processId) => {
            const addr = CONTRACTS.attestationCoordinator;
            if (!addr || addr.length !== 42) return [];

            const blockCache = new Map<string, number>();
            const events: TimelineEvent[] = [];

            // Single fetch — all attestations for this processId
            const attestLogs = await client.getContractEvents({
                address: addr,
                abi: ATTESTATION_COORDINATOR_ABI,
                eventName: "Attestation",
                args: { processId },
                fromBlock: 0n,
                toBlock: "latest",
            });

            for (const log of attestLogs) {
                const a = log.args as Partial<{
                    schemaId: string;
                    stage: bigint | number;
                    orderHash: string;
                    attester: string;
                    contentRef: string;
                }>;
                const schemaId = a.schemaId;
                const stage = Number(a.stage ?? 0);
                const ts = await getBlockTimestamp(client, log.blockNumber!, blockCache);

                if (schemaId === MERCHANT_SCHEMA_ID) {
                    events.push({
                        label: MERCHANT_EVENT_LABELS[stage] ?? `Merchant Event ${stage}`,
                        blockNumber: log.blockNumber!,
                        timestamp: ts,
                        iso: new Date(ts * 1000).toISOString(),
                        txHash: log.transactionHash!,
                        orderHash: a.orderHash ?? "",
                        eventName: "Attestation",
                        details: {
                            attester: a.attester ?? "",
                            stage: String(stage),
                            contentRef: a.contentRef ?? "",
                            schema: "merchant-process",
                        },
                    });
                } else if (schemaId === COURIER_SCHEMA_ID) {
                    events.push({
                        label: COURIER_EVENT_LABELS[stage] ?? `Courier Event ${stage}`,
                        blockNumber: log.blockNumber!,
                        timestamp: ts,
                        iso: new Date(ts * 1000).toISOString(),
                        txHash: log.transactionHash!,
                        orderHash: a.orderHash ?? "",
                        eventName: "Attestation",
                        details: {
                            attester: a.attester ?? "",
                            stage: String(stage),
                            contentRef: a.contentRef ?? "",
                            schema: "courier-process",
                        },
                    });
                } else if (schemaId === PROXIMITY_SCHEMA_ID) {
                    // ── Proximity proof attestation ──
                    // Stage encodes the band type: 1=Zone, 2=Nearby, 3=Contact, 4=Visual
                    events.push({
                        label: `Proximity Proof — ${BAND_LABELS[stage] ?? `Band ${stage}`}`,
                        blockNumber: log.blockNumber!,
                        timestamp: ts,
                        iso: new Date(ts * 1000).toISOString(),
                        txHash: log.transactionHash!,
                        orderHash: a.orderHash ?? "",
                        eventName: "Attestation",
                        details: {
                            attester: a.attester ?? "",
                            stage: String(stage),
                            contentRef: a.contentRef ?? "",
                            schema: "proximity",
                        },
                    });
                }
            }

            return events;
        },
    };
}
