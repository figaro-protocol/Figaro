/**
 * GHG module — V5 event-sourced via AttestationCoordinator.
 *
 * Two clause FAMILIES collaborate to represent a GHG disclosure arc, both
 * resolved from the registry's specs (chain → IPFS), never named in code:
 *
 *   - DISCLOSURE clauses (Category-2, committed) — every registered clause
 *     declaring a `scope` field. Each accounting standard is its own clause;
 *     the committed `{scope}` sectionData is the contract-signing-time
 *     declaration ("seller is reporting under this standard, scope 1").
 *
 *   - MEASUREMENT clauses (Category-1, runtime grams) — each disclosure
 *     clause's `block.sisterClauseId`. Content is `abi.encode(uint256 grams)`
 *     per fulfilment; the validator does NOT cross-check against sectionData
 *     because the committed unit-of-account clause and the per-measurement
 *     value are deliberately decoupled.
 *
 * Read hooks reconstruct disclosure state from indexed Attestation events
 * under both families — no contract storage reads. Writes flow through the
 * generic capability rail (`submit-clause-attestation`), not this module.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import {
    decodeFunctionData,
    type Hex,
    type PublicClient,
} from "viem";
import { isEmptyHex, ZERO_BYTES32 } from "@/lib/shared/evm";
import { ATTESTATION_COORDINATOR_ABI } from "@/lib/core/contracts";
import { clauseIdOf } from "@/lib/core/agreement";
import {
    DISCLOSURE_KIND,
    DISCLOSURE_KIND_LABELS,
    MEASUREMENT_KIND_LABELS,
} from "@/lib/mechanisms/contracts";
import {
    getAttestationsByProcessAndClause,
    getAttestationsByOrder,
    type IndexedAttestationLog,
} from "@/lib/core/indexer";
import { clauseDeclaresField, getClauseSpec, listKnownClauseIds } from "@/lib/shared/clauseSpecSource";
import { useClauseSpecs } from "@/lib/mechanisms/useClauseSpecs";

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
    actualGrams: bigint | null;
    blockNumber: number;
};

export type ProcessDisclosureSummary = {
    processId: string;
    attestationCount: number;
    commitmentCount: number;
    actualCount: number;
    totalActualGrams: bigint;
    attestations: AttestationRecord[];
};

// ── Spec-derived clause families ─────────────────────────────────────────────

/** keccak256 event-topic hashes of every registered DISCLOSURE clause —
 *  the clauses declaring a `scope` field. Empty while the cache is cold. */
function disclosureClauseIdHashes(): Hex[] {
    return listKnownClauseIds()
        .filter((clauseId) => clauseDeclaresField(clauseId, "scope"))
        .map((clauseId) => clauseIdOf(clauseId));
}

/** keccak256 event-topic hashes of every registered MEASUREMENT clause —
 *  the disclosure clauses' Category-1 sisters. Empty while the cache is cold. */
function measurementClauseIdHashes(): Hex[] {
    const sisters = new Set<string>();
    for (const clauseId of listKnownClauseIds()) {
        if (!clauseDeclaresField(clauseId, "scope")) continue;
        const sister = getClauseSpec(clauseId)?.block?.sisterClauseId;
        if (sister) sisters.add(sister);
    }
    return Array.from(sisters).map((clauseId) => clauseIdOf(clauseId));
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

/**
 * Decode a measurement-clause content payload back to grams.
 * Shape: `abi.encode(uint256 grams)` — 32 bytes, big-endian padded, equivalent
 * to a raw hex integer. Returns `null` for empty / zero / unparseable content.
 */
export function decodeMeasurementGramsContent(content: Hex | null | undefined): bigint | null {
    if (isEmptyHex(content) || content === ZERO_BYTES32) return null;
    try {
        return BigInt(content);
    } catch {
        return null;
    }
}

export function formatActualGrams(grams: bigint): string {
    if (grams < 1000n) return `${grams} g CO₂e`;
    if (grams < 1_000_000n) return `${(Number(grams) / 1000).toFixed(2)} kg CO₂e`;
    return `${(Number(grams) / 1_000_000).toFixed(3)} t CO₂e`;
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

function labelFor(clauseIdHash: string, stage: number, measurementHashes: readonly string[]): string {
    if (measurementHashes.includes(clauseIdHash)) {
        return MEASUREMENT_KIND_LABELS[stage] ?? `Stage(${stage})`;
    }
    return DISCLOSURE_KIND_LABELS[stage] ?? `Stage(${stage})`;
}

export function useOrderDisclosureTasks(orderHash: string | undefined) {
    const publicClient = usePublicClient();
    const chainId = publicClient?.chain?.id ?? 0;
    // The clause families are spec-derived; re-run when the cache warms.
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
                const disclosureHashes = disclosureClauseIdHashes();
                const measurementHashes = measurementClauseIdHashes();
                const ghgHashes = new Set<string>([...disclosureHashes, ...measurementHashes]);
                const logs = await getAttestationsByOrder(publicClient, chainId, orderHash);
                if (cancelled) return;
                const ghgLogs = logs.filter(
                    (log): log is IndexedAttestationLog => (
                        typeof log.args?.clauseId === "string" && ghgHashes.has(log.args.clauseId)
                    ),
                );
                const result = await Promise.all(ghgLogs.map(async (log) => {
                    const rec = parseAttestationLog(log);
                    const contentHex = rec.contentRef !== ZERO_BYTES32
                        ? rec.contentRef as Hex : null;
                    let actualGrams: bigint | null = null;
                    if (measurementHashes.includes(rec.clauseId as Hex) && rec.transactionHash) {
                        const content = await getAttestationContent(
                            publicClient,
                            rec.transactionHash as Hex,
                        );
                        actualGrams = decodeMeasurementGramsContent(content);
                    }
                    const task: DisclosureTask = {
                        orderHash: rec.orderHash,
                        stage: rec.stage,
                        stageLabel: labelFor(rec.clauseId, rec.stage, measurementHashes),
                        contentRef: contentHex,
                        attester: rec.attester,
                        actualGrams,
                        blockNumber: rec.blockNumber,
                    };
                    return task;
                }));
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
    // The clause families are spec-derived; re-run when the cache warms.
    const { version: clauseSpecsVersion } = useClauseSpecs();
    const [summary, setSummary] = useState<ProcessDisclosureSummary | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!processId || !publicClient || !chainId) { setSummary(null); return; }
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                // Query every registered clause in each family in parallel.
                // Disclosures carry commitment / restatement / verification
                // events; measurements carry grams.
                const disclosureHashes = disclosureClauseIdHashes();
                const measurementHashes = measurementClauseIdHashes();
                const [disclosureLogs, measurementLogs] = await Promise.all([
                    Promise.all(disclosureHashes.map((h) =>
                        getAttestationsByProcessAndClause(publicClient, chainId, processId, h),
                    )).then((r) => r.flat()),
                    Promise.all(measurementHashes.map((h) =>
                        getAttestationsByProcessAndClause(publicClient, chainId, processId, h),
                    )).then((r) => r.flat()),
                ]);
                if (cancelled) return;
                const disclosureAttestations = disclosureLogs.map(
                    (log) => parseAttestationLog(log as IndexedAttestationLog),
                );
                const measurementAttestations = measurementLogs.map(
                    (log) => parseAttestationLog(log as IndexedAttestationLog),
                );
                const measurementGrams = await Promise.all(
                    measurementAttestations
                        .filter((a) => a.transactionHash)
                        .map(async (a) => {
                            const content = await getAttestationContent(
                                publicClient,
                                a.transactionHash as Hex,
                            );
                            return decodeMeasurementGramsContent(content);
                        }),
                );
                if (cancelled) return;

                let commitmentCount = 0;
                for (const a of disclosureAttestations) {
                    if (a.stage === DISCLOSURE_KIND.commitment) commitmentCount++;
                }
                let totalActualGrams = 0n;
                for (const grams of measurementGrams) {
                    if (grams !== null) totalActualGrams += grams;
                }
                const attestations = [...disclosureAttestations, ...measurementAttestations];

                if (!cancelled) {
                    setSummary({
                        processId,
                        attestationCount: attestations.length,
                        commitmentCount,
                        actualCount: measurementAttestations.length,
                        totalActualGrams,
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
