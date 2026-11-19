/**
 * lib/core/attestationIndexer.ts — event readers for the Core's attestation
 * stream: the `Attestation` events of the AttestationCoordinator (direct path)
 * and of the FigaroBatchVerifier (batch path), and the verifier's
 * `BatchSettled`. The order and process readers are `lib/core/indexer.ts`;
 * both build on the same event-cache primitives. Reads are clause-agnostic —
 * clauseId is DATA off the event, never hardcoded.
 */
import { getAbiItem, type Log, type PublicClient } from "viem";
import { cachedGetLogs } from "@/lib/core/eventCache";
import { cachedGetLogsMulti, getStringArg, type IndexedLog } from "@/lib/core/indexer";
import { hexEqual, isEmptyHex } from "@/lib/shared/evm";
import {
    ATTESTATION_COORDINATOR_ABI,
    BATCH_VERIFIER_ABI,
    EV_ATTESTATION,
    tagAttestationUniverses,
    type ResolutionUniverse,
    type UniverseAttestationEvent,
} from "@figaro-protocol/sdk";
import { getAttestationCoordinator, getBatchVerifier } from "@/lib/core/contracts";

// ── AttestationCoordinator ────────────────────────────────────────────────────

/** One `Attestation` event flattened to its full row — the shape shared by
 *  the audit/evidence bundle and (via the narrower `RuntimeAttestation` view)
 *  the semantic model. clauseId is DATA off the event, never hardcoded.
 *  `universe` names the path that emitted the row when the reader knows it. */
export type AttestationRecord = {
    orderHash: string;
    processId: string;
    attester: string;
    clauseId: string;
    stage: number;
    contentRef: string;
    transactionHash: string | null;
    blockNumber: number;
    universe?: ResolutionUniverse;
};

/** `Attestation` logs emitted BY THE COORDINATOR (the direct path). Empty when
 *  no coordinator address is configured — absence, not "not resolved". */
export async function getAllAttestations(client: PublicClient, chainId: number): Promise<IndexedLog[]> {
    const coordinator = getAttestationCoordinator();
    if (!coordinator) return [];
    return cachedGetLogsMulti(
        client,
        chainId,
        [coordinator],
        { event: EV_ATTESTATION, eventName: "Attestation" },
    );
}

// ── FigaroBatchVerifier — the batch path, the second of the two resolution paths ─────────────────────
//
// These reads are deliberately NOT merged into `getAllAttestations` above. The
// `Attestation` topic hash is shared by the coordinator and the verifier
// (the WARNING above the verifier's `Attestation` event says exactly this), so the EMITTING ADDRESS
// is the only thing that says which universe a row came from — and that
// distinction is the whole evidentiary difference between "re-verifiable from
// calldata" and "proved once inside a batch". Merging the two streams would
// erase it. Every evidence reader folds both streams through
// `getAllAttestationRecords`, which keeps each row's `universe` tag.

/** `Attestation` logs re-emitted BY THE BATCH VERIFIER (never the coordinator's).
 *  Empty when no verifier address is configured — absence, not "not resolved". */
export async function getAllBatchAttestations(client: PublicClient, chainId: number): Promise<IndexedLog[]> {
    const verifier = getBatchVerifier();
    if (!verifier) return [];
    return cachedGetLogs(client, chainId, {
        address: verifier,
        event: EV_ATTESTATION,
        eventName: "Attestation",
    });
}

/** Verifier-re-emitted `Attestation` logs for one order (hex case never matters). */
export async function getBatchAttestationsByOrder(
    client: PublicClient,
    chainId: number,
    orderHash: string,
): Promise<IndexedLog[]> {
    const all = await getAllBatchAttestations(client, chainId);
    return all.filter((log) => hexEqual(getStringArg(log, "orderHash"), orderHash));
}

/** `BatchSettled` logs from the verifier. The event item comes off the SDK's
 *  `BATCH_VERIFIER_ABI` rather than a new `EV_*` constant — the same pattern
 *  the SDK README documents for outside integrators. */
export async function getAllBatchSettled(client: PublicClient, chainId: number): Promise<IndexedLog[]> {
    const verifier = getBatchVerifier();
    if (!verifier) return [];
    return cachedGetLogs(client, chainId, {
        address: verifier,
        event: getAbiItem({ abi: BATCH_VERIFIER_ABI, name: "BatchSettled" }),
        eventName: "BatchSettled",
    });
}

/**
 * Every `Attestation` event on this chain, from BOTH resolution paths,
 * each row TAGGED with the universe that emitted it — the frontend's read of
 * the SDK's `fetchAttestationRecords` shape (`UniverseAttestationEvent`),
 * served from the event cache instead of a fresh chunked scan.
 *
 * The two streams stay address-filtered and separately parsed for the reason
 * stated above: the topic hash is shared, so the emitting address is the only
 * thing that says whether a row is re-verifiable from calldata (direct) or was
 * proved once inside a batch (batch). Empty from a stream whose contract is
 * unconfigured — absence of a reader, never "no attestations".
 */
export async function getAllAttestationRecords(
    client: PublicClient,
    chainId: number,
): Promise<UniverseAttestationEvent[]> {
    const [direct, batch] = await Promise.all([
        getAllAttestations(client, chainId),
        getAllBatchAttestations(client, chainId),
    ]);
    // The pure fold is the SDK's — tag each address-filtered stream and merge
    // in (blockNumber) order.
    return tagAttestationUniverses(direct as unknown as Log[], batch as unknown as Log[]);
}

/** Attestations on one order from BOTH resolution paths (hex case never
 *  matters), each row tagged with the `universe` that emitted it ("direct": the
 *  coordinator's; "batch": the verifier's re-emission). Empty from a stream whose
 *  contract is unconfigured: absence of a reader, never "no attestations". */
export async function getAttestationsByOrder(
    client: PublicClient,
    chainId: number,
    orderHash: string,
): Promise<UniverseAttestationEvent[]> {
    const all = await getAllAttestationRecords(client, chainId);
    return all.filter((row) => hexEqual(row.orderHash, orderHash));
}

/** A process attestation flattened to the fields the runtime model needs:
 *  which clause, which order, which stage, who attested, and the fingerprint
 *  of what was attested (`contentRef`, the keccak-CID digest a reader resolves
 *  the published content at), and the `universe` that emitted it. clauseId is
 *  DATA off the event — no caller hardcodes it. */
export interface RuntimeAttestation {
    clauseId: string;
    orderHash: string;
    stage: number;
    attester: string;
    contentRef: string;
    blockNumber: number;
    universe: ResolutionUniverse;
}

/** All attestations on a process, from both paths, clause-agnostic. The semantic builder buckets
 *  these by clause to gate capabilities; the order page renders them as a
 *  generic timeline (clause + stage straight from data). */
export async function getAttestationsByProcess(
    client: PublicClient,
    chainId: number,
    processId: string,
): Promise<RuntimeAttestation[]> {
    const all = await getAllAttestationRecords(client, chainId);
    return all
        .filter((row) => hexEqual(row.processId, processId))
        .map(({ clauseId, orderHash, stage, attester, contentRef, blockNumber, universe }) => ({
            clauseId, orderHash, stage, attester, contentRef, blockNumber, universe,
        }))
        .sort((a, b) => a.blockNumber - b.blockNumber);
}
