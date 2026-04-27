/**
 * Delivery coordinator event source for the evidence timeline.
 *
 * Lifecycle and proximity events come from AttestationCoordinator
 * (Attestation events filtered by schema — delivery lifecycle or proximity).
 * Proximity proofs are standard attestations under figaro-proximity-proof-v1
 * (the runtime sister of figaro-proximity-policy-v1, which commits the band
 * at agreement signing). Proof data (band, nonce, deviceSig) lives in the
 * on-chain `content` bytes payload. The event's `contentRef` is
 * `keccak256(content)` — a verification digest, not an off-chain pointer.
 *
 * Used by buildExtendedTimeline() to produce rich dispute evidence that
 * includes:
 *   - En-route / picked-up / delivered attestations
 *   - Proximity proof attestations (separate schema; proof bytes in `content`)
 *
 * This is a read-only module. No contract writes.
 */

import type { PublicClient } from "viem";
import { keccak256, stringToHex } from "viem";
import type { CoordinatorEventSource, TimelineEvent } from "@/lib/dispute/evidenceTimeline";
import { CONTRACTS, ATTESTATION_COORDINATOR_ABI } from "@/lib/core/contracts";

// ---------------------------------------------------------------------------
// Delivery schema
// ---------------------------------------------------------------------------

const DELIVERY_SCHEMA_KEY = "figaro-delivery-lifecycle-v1";
const DELIVERY_SCHEMA_ID = keccak256(stringToHex(DELIVERY_SCHEMA_KEY));

const PROXIMITY_SCHEMA_KEY = "figaro-proximity-proof-v1";
const PROXIMITY_SCHEMA_ID = keccak256(stringToHex(PROXIMITY_SCHEMA_KEY));

const STAGE_LABELS: Record<number, string> = {
    0: "Preparation Started",
    1: "Ready for Pickup",
    2: "Courier En Route",
    3: "Order Picked Up",
    4: "Order Delivered",
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
 * Create a CoordinatorEventSource for delivery lifecycle attestations.
 *
 * All attestations (lifecycle, proximity, GHG) come through the unified
 * Attestation event. Proximity proofs are standard attestations under the
 * figaro-proximity-proof-v1 schema; proof bytes live in the on-chain
 * `content` payload. The event's `contentRef = keccak256(content)`.
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

                if (schemaId === DELIVERY_SCHEMA_ID) {
                    // ── Delivery lifecycle attestation ──
                    events.push({
                        label: STAGE_LABELS[stage] ?? `Delivery Stage ${stage}`,
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
                        },
                    });
                } else if (schemaId === PROXIMITY_SCHEMA_ID) {
                    // ── Proximity proof attestation ──
                    // Proof data (band, nonce, deviceSig) is off-chain in contentRef.
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
