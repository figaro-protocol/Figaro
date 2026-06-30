/**
 * Delivery coordinator event source for the evidence timeline.
 *
 * Every clause's runtime attestations — lifecycle ladders, proximity
 * proofs, any permissionless clause — come from AttestationCoordinator's
 * unified Attestation event. Proximity proofs carry their proof bytes
 * (band, nonce, deviceSig) in the on-chain `content` payload; the event's
 * `contentRef = keccak256(content)` is a verification digest, not an
 * off-chain pointer.
 *
 * Used by buildExtendedTimeline() to produce rich dispute evidence that
 * includes:
 *   - Merchant-role events (prep-started, ready-for-pickup, handed-off, …)
 *   - Courier-role events (en-route-pickup, arrived-pickup, completed, …)
 *   - Proximity proof attestations (separate clause; proof bytes in `content`)
 *
 * This is a read-only module. No contract writes.
 */

import { type PublicClient } from "viem";
import type { CoordinatorEventSource, TimelineEvent } from "@/lib/dispute/evidenceTimeline";
import { ATTESTATION_COORDINATOR_ABI } from "@/lib/composition/abis";
import { COMPOSITION_CONTRACTS } from "@/lib/composition/contracts";
import { describeAttestation } from "@/lib/shared/clauseSpecSource";

// Every attestation — whatever clause — is labeled from its OWN spec via
// describeAttestation (clause title + the enum value at `stage`). No clause
// names, no per-clause label maps: a permissionlessly-registered clause's
// attestations appear on the timeline with correct labels, unchanged.

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
 * All attestations (lifecycle, proximity, disclosure) come through the
 * unified Attestation event, each labeled from its own spec. Proximity
 * proofs are standard attestations under the proximity proof clause;
 * proof bytes live in the on-chain `content` payload.
 */
export function createDeliveryCoordinatorSource(): CoordinatorEventSource {
    return {
        name: "DeliveryCoordinator",
        fetchEvents: async (client, processId) => {
            const addr = COMPOSITION_CONTRACTS.attestationCoordinator;
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
                    clauseId: string;
                    stage: bigint | number;
                    orderHash: string;
                    attester: string;
                    contentRef: string;
                }>;
                const clauseId = a.clauseId;
                if (!clauseId) continue;
                const stage = Number(a.stage ?? 0);
                const ts = await getBlockTimestamp(client, log.blockNumber!, blockCache);

                // Label any attestation from its own spec — title + the enum value
                // at `stage`. No clause names; unknown clauses fall back to a short
                // hash + stage (describeAttestation handles it).
                const { clauseTitle, eventLabel } = describeAttestation(clauseId, stage);
                events.push({
                    label: `${clauseTitle} — ${eventLabel}`,
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
                        clauseId,
                    },
                });
            }

            return events;
        },
    };
}
