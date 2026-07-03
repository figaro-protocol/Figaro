/**
 * GHG module — V5 event-sourced via AttestationCoordinator.
 *
 * DISCLOSURE clauses (committed at signing) — every registered clause
 * under the `emissions` article (`block.article`), resolved from the
 * registry's specs (chain → IPFS), never named in code. The accounting
 * methodology is a free-form `standard` value on the clause (not a
 * per-standard clause id); the committed `{standard}` sectionData is the
 * contract-signing-time declaration ("seller reports under this
 * methodology"). No scope is stored — scope 1/2/3 is relative to a
 * reporting entity's boundary, derived from its position in the topology.
 *
 * The runtime MEASUREMENT companion clause was retired (a consequence, not a
 * clause — operator ruling; re-affirmed 2026-07-02). The measured-grams
 * channel is an emissions-cluster design decision; until it lands,
 * `totalActualGrams` is 0.
 *
 * Read hooks reconstruct disclosure state from indexed Attestation events —
 * no contract storage reads. Writes flow through the generic capability rail
 * (`submit-clause-attestation`), not this module.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import {
    decodeFunctionData,
    type Hex,
    type PublicClient,
} from "viem";
import { isEmptyHex, ZERO_BYTES32, clauseIdHash } from "@/lib/shared/evm";
import { ATTESTATION_COORDINATOR_ABI } from "@/lib/composition/abis";
import { DISCLOSURE_KIND } from "@/lib/composition/contracts";
import {
    getAttestationsByProcessAndClause,
    getAttestationsByOrder,
    type IndexedAttestationLog,
} from "@/lib/composition/indexer";
import { getClauseSpec, listKnownClauseIds, describeAttestation } from "@/lib/shared/clauseSpecSource";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";

export type AttestationRecord = {
    orderHash: string;
    processId: string;
    attester: string;
    clauseId: string;
    stage: number;
    contentRef: string;
    transactionHash: string | null;
    blockNumber: number;
};

export type DisclosureTask = {
    orderHash: string;
    stage: number;
    stageLabel: string;
    contentRef: Hex | null;
    attester: string;
    blockNumber: number;
};

export type ProcessDisclosureSummary = {
    processId: string;
    attestationCount: number;
    commitmentCount: number;
    /** 0 until the emissions-cluster rebuild defines the measured-grams
     *  channel (the measurement companion clause was retired). */
    totalActualGrams: bigint;
    attestations: AttestationRecord[];
};

// ── Spec-derived clause families ─────────────────────────────────────────────

/** keccak256 event-topic hashes of every registered DISCLOSURE clause —
 *  the clauses under the `emissions` article (`block.article`, the designed
 *  grouping axis — the `clauseIsStructural` pattern). Any registered clause
 *  declaring the article participates, including ones this codebase has
 *  never seen. Empty while the cache is cold. */
function disclosureClauseIdHashes(): Hex[] {
    return listKnownClauseIds()
        .filter((clauseId) => getClauseSpec(clauseId)?.block?.article === "emissions")
        .map((clauseId) => clauseIdHash(clauseId, getClauseSpec(clauseId)?.version ?? 1));
}

// ── Pure utility functions ───────────────────────────────────────────────────

/**
 * Fetch the `bytes content` argument the seller/buyer attestation was called
 * with. The on-chain `Attestation` event records `keccak256(content)`, not the
 * content itself, so any value-recovery (grams, addresses, structured data)
 * has to read transaction calldata.
 *
 * Returns `null` on missing tx, missing input, or a non-attestation function
 * call. Errors during fetch/decode swallow to `null` — callers that need
 * provenance should compare `keccak256(content)` against the event's contentRef.
 */
export async function getAttestationContent(
    client: PublicClient,
    txHash: Hex,
): Promise<Hex | null> {
    try {
        const tx = await client.getTransaction({ hash: txHash });
        if (isEmptyHex(tx?.input)) return null;
        const decoded = decodeFunctionData({
            abi: ATTESTATION_COORDINATOR_ABI,
            data: tx.input,
        });
        if (
            decoded.functionName !== "attestAsSeller"
            && decoded.functionName !== "attestAsBuyer"
        ) {
            return null;
        }
        const args = decoded.args ?? [];
        const content = args[args.length - 1];
        return typeof content === "string" && content.startsWith("0x")
            ? (content as Hex)
            : null;
    } catch {
        return null;
    }
}

function parseAttestationLog(log: IndexedAttestationLog): AttestationRecord {
    return {
        orderHash: log.args?.orderHash ?? "",
        processId: log.args?.processId ?? "",
        attester: log.args?.attester ?? "",
        clauseId: log.args?.clauseId ?? "",
        stage: Number(log.args?.stage ?? 0),
        contentRef: log.args?.contentRef ?? ZERO_BYTES32,
        transactionHash: log.transactionHash ?? null,
        blockNumber: Number(log.blockNumber ?? 0),
    };
}

// ── Read hooks — event-sourced via cached indexer ────────────────────────────

// The stage label is the clause's OWN spec valueLabel (via describeAttestation),
// never a hardcoded per-clause table — any registered clause labels its own
// ladder from its spec, so measurement vs disclosure needs no distinction here.
function labelFor(clauseIdHash: string, stage: number): string {
    return describeAttestation(clauseIdHash, stage).eventLabel;
}

export function useOrderDisclosureTasks(orderHash: string | undefined) {
    const publicClient = usePublicClient();
    const chainId = publicClient?.chain?.id ?? 0;
    // The clause set is spec-derived; re-run when the cache warms.
    const { version: clauseSpecsVersion } = useClauseSpecs();
    const [tasks, setTasks] = useState<DisclosureTask[]>([]);
    const [loading, setLoading] = useState(false);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!orderHash || !publicClient || !chainId) { setTasks([]); return; }
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const ghgHashes = new Set<string>(disclosureClauseIdHashes());
                const logs = await getAttestationsByOrder(publicClient, chainId, orderHash);
                if (cancelled) return;
                const ghgLogs = logs.filter(
                    (log): log is IndexedAttestationLog => (
                        typeof log.args?.clauseId === "string" && ghgHashes.has(log.args.clauseId)
                    ),
                );
                const result = ghgLogs.map((log) => {
                    const rec = parseAttestationLog(log);
                    const contentHex = rec.contentRef !== ZERO_BYTES32
                        ? rec.contentRef as Hex : null;
                    const task: DisclosureTask = {
                        orderHash: rec.orderHash,
                        stage: rec.stage,
                        stageLabel: labelFor(rec.clauseId, rec.stage),
                        contentRef: contentHex,
                        attester: rec.attester,
                        blockNumber: rec.blockNumber,
                    };
                    return task;
                });
                if (!cancelled) setTasks(result);
            } catch (err) {
                console.error("useOrderDisclosureTasks error:", err);
                if (!cancelled) setTasks([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [orderHash, publicClient, chainId, tick, clauseSpecsVersion]);

    const refresh = useCallback(async () => { setTick((t) => t + 1); }, []);
    return { tasks, loading, refresh };
}

export function useProcessDisclosureSummary(processId: Hex | undefined) {
    const publicClient = usePublicClient();
    const chainId = publicClient?.chain?.id ?? 0;
    // The clause set is spec-derived; re-run when the cache warms.
    const { version: clauseSpecsVersion } = useClauseSpecs();
    const [summary, setSummary] = useState<ProcessDisclosureSummary | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!processId || !publicClient || !chainId) { setSummary(null); return; }
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                // Query every registered disclosure clause in parallel.
                const disclosureHashes = disclosureClauseIdHashes();
                const disclosureLogs = await Promise.all(disclosureHashes.map((h) =>
                    getAttestationsByProcessAndClause(publicClient, chainId, processId, h),
                )).then((r) => r.flat());
                if (cancelled) return;
                const attestations = disclosureLogs.map(
                    (log) => parseAttestationLog(log as IndexedAttestationLog),
                );

                let commitmentCount = 0;
                for (const a of attestations) {
                    if (a.stage === DISCLOSURE_KIND.commitment) commitmentCount++;
                }

                if (!cancelled) {
                    setSummary({
                        processId,
                        attestationCount: attestations.length,
                        commitmentCount,
                        totalActualGrams: 0n,
                        attestations,
                    });
                }
            } catch (err) {
                console.error("useProcessDisclosureSummary error:", err);
                if (!cancelled) setSummary(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [processId, publicClient, chainId, clauseSpecsVersion]);

    return { summary, loading };
}
