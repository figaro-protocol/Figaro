/**
 * GHG module — V5 event-sourced via AttestationCoordinator.
 *
 * Two schemas collaborate to represent a GHG disclosure arc:
 *
 *   - `figaro-ghg-iso-14064-v1`  (Category-2, committed clause)
 *       Declares the *accounting standard + scope* at contract-signing time.
 *       Runtime attestations must carry content byte-equal to the committed
 *       sectionData (handled automatically by `useAttestationCoordinatorActions`
 *       when callers omit `content`). Used for the commitment / verification
 *       narrative — "seller is reporting under ISO-14064 scope 1".
 *
 *   - `figaro-ghg-measurement-v1` (Category-1, runtime grams)
 *       Carries actual grams CO2e values per fulfillment. Content is
 *       `abi.encode(uint256 grams)`; the validator does NOT cross-check
 *       against sectionData because the committed unit-of-account clause and
 *       the per-measurement value are deliberately decoupled.
 *
 * Read hooks reconstruct disclosure state from indexed Attestation events
 * under both schemas — no contract storage reads.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import {
    decodeFunctionData,
    type Hex,
    type PublicClient,
} from "viem";
import { ZERO_BYTES32, useAttestationCoordinatorActions } from "@/lib/mechanisms/useAttestationCoordinatorActions";
import { ATTESTATION_COORDINATOR_ABI } from "@/lib/core/contracts";
import {
    GHG_SCHEMA_ID,
    GHG_MEASUREMENT_SCHEMA_ID,
    DISCLOSURE_KIND,
    DISCLOSURE_KIND_LABELS,
    MEASUREMENT_KIND,
    MEASUREMENT_KIND_LABELS,
} from "@/lib/mechanisms/contracts";
import {
    getAttestationsByProcessAndSchema,
    getAttestationsByOrder,
} from "@/lib/core/indexer";
import { encodeGHGMeasurementContent } from "@figaro/core/schemas";

export type AttestationRecord = {
    orderHash: string;
    processId: string;
    attester: string;
    schemaId: string;
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

type IndexedAttestationLog = {
    args?: Record<string, unknown> & {
        orderHash?: string;
        processId?: string;
        attester?: string;
        schemaId?: string;
        stage?: number | bigint;
        contentRef?: string;
    };
    blockNumber?: number | bigint | null;
    transactionHash?: `0x${string}` | null;
};

// ── Pure utility functions ───────────────────────────────────────────────────

/**
 * ABI-encode grams for a `figaro-ghg-measurement-v1` attestation.
 * Shape: `abi.encode(uint256 grams)` — 32 bytes, big-endian padded.
 */
export function encodeMeasurementGramsContent(grams: bigint): Hex {
    return encodeGHGMeasurementContent({ grams });
}

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
        if (!tx?.input || tx.input === "0x") return null;
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
 * Decode a `figaro-ghg-measurement-v1` content payload back to grams.
 * Shape: `abi.encode(uint256 grams)` — 32 bytes, big-endian padded, equivalent
 * to a raw hex integer. Returns `null` for empty / zero / unparseable content.
 */
export function decodeMeasurementGramsContent(content: Hex | null | undefined): bigint | null {
    if (!content || content === ZERO_BYTES32 || content === "0x") return null;
    try {
        return BigInt(content);
    } catch {
        return null;
    }
}

export function formatActualGrams(grams: bigint): string {
    if (grams < 1000n) return `${grams} g CO2e`;
    if (grams < 1_000_000n) return `${(Number(grams) / 1000).toFixed(2)} kg CO2e`;
    return `${(Number(grams) / 1_000_000).toFixed(3)} t CO2e`;
}

function parseAttestationLog(log: IndexedAttestationLog): AttestationRecord {
    return {
        orderHash: log.args?.orderHash ?? "",
        processId: log.args?.processId ?? "",
        attester: log.args?.attester ?? "",
        schemaId: log.args?.schemaId ?? "",
        stage: Number(log.args?.stage ?? 0),
        contentRef: log.args?.contentRef ?? ZERO_BYTES32,
        transactionHash: log.transactionHash ?? null,
        blockNumber: Number(log.blockNumber ?? 0),
    };
}

// ── Write-only action hook ───────────────────────────────────────────────────

export function useGhgDisclosureActions() {
    const {
        submitSellerAttestation,
        submitBuyerAttestation,
        isPending,
        isConfirming,
        isSuccess,
        error,
        isAvailable,
    } = useAttestationCoordinatorActions();

    const attestAsSeller = useCallback(async (
        roleOrderHash: Hex,
        orderHash: Hex,
        stage: number,
        content?: Hex,
    ) => {
        return submitSellerAttestation({
            roleOrderHash,
            orderHash,
            schemaId: GHG_SCHEMA_ID as Hex,
            stage,
            content,
        });
    }, [submitSellerAttestation]);

    const attestAsBuyer = useCallback(async (
        orderHash: Hex,
        stage: number,
        content?: Hex,
    ) => {
        return submitBuyerAttestation({
            orderHash,
            schemaId: GHG_SCHEMA_ID as Hex,
            stage,
            content,
        });
    }, [submitBuyerAttestation]);

    /**
     * Commitment attestation under `figaro-ghg-iso-14064-v1`.
     * Category-2: content is auto-filled with the committed sectionData
     * (the signed `{standard, scope}` clause). The stage field alone
     * distinguishes commitment / restatement / verification attestations.
     */
    const submitCommitmentForOrder = useCallback(async (
        orderHash: string,
    ) => {
        return submitSellerAttestation({
            orderHash: orderHash as Hex,
            schemaId: GHG_SCHEMA_ID as Hex,
            stage: DISCLOSURE_KIND.commitment,
            // content omitted — defaults to committed sectionData
        });
    }, [submitSellerAttestation]);

    /**
     * Runtime grams measurement under `figaro-ghg-measurement-v1`.
     * The committing agreement must carry a `figaro-ghg-measurement-v1`
     * section or the inclusion proof will fail.
     */
    const submitActualForOrder = useCallback(async (
        orderHash: string,
        grams: bigint,
    ) => {
        return submitSellerAttestation({
            orderHash: orderHash as Hex,
            schemaId: GHG_MEASUREMENT_SCHEMA_ID as Hex,
            stage: MEASUREMENT_KIND.measured,
            content: encodeMeasurementGramsContent(grams),
        });
    }, [submitSellerAttestation]);

    return {
        attestAsSeller,
        attestAsBuyer,
        submitCommitmentForOrder,
        submitActualForOrder,
        isPending,
        isConfirming,
        isSuccess,
        error,
        isAvailable,
    };
}

// ── Read hooks — event-sourced via cached indexer ────────────────────────────

function labelFor(schemaId: string, stage: number): string {
    if (schemaId === GHG_MEASUREMENT_SCHEMA_ID) {
        return MEASUREMENT_KIND_LABELS[stage] ?? `Stage(${stage})`;
    }
    return DISCLOSURE_KIND_LABELS[stage] ?? `Stage(${stage})`;
}

export function useOrderDisclosureTasks(orderHash: string | undefined) {
    const publicClient = usePublicClient();
    const chainId = publicClient?.chain?.id ?? 0;
    const [tasks, setTasks] = useState<DisclosureTask[]>([]);
    const [loading, setLoading] = useState(false);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!orderHash || !publicClient || !chainId) { setTasks([]); return; }
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const logs = await getAttestationsByOrder(publicClient, chainId, orderHash);
                if (cancelled) return;
                const ghgLogs = logs.filter(
                    (log): log is IndexedAttestationLog => (
                        log.args?.schemaId === GHG_SCHEMA_ID
                        || log.args?.schemaId === GHG_MEASUREMENT_SCHEMA_ID
                    ),
                );
                const result = await Promise.all(ghgLogs.map(async (log) => {
                    const rec = parseAttestationLog(log);
                    const contentHex = rec.contentRef !== ZERO_BYTES32
                        ? rec.contentRef as Hex : null;
                    let actualGrams: bigint | null = null;
                    if (rec.schemaId === GHG_MEASUREMENT_SCHEMA_ID && rec.transactionHash) {
                        const content = await getAttestationContent(
                            publicClient,
                            rec.transactionHash as Hex,
                        );
                        actualGrams = decodeMeasurementGramsContent(content);
                    }
                    const task: DisclosureTask = {
                        orderHash: rec.orderHash,
                        stage: rec.stage,
                        stageLabel: labelFor(rec.schemaId, rec.stage),
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
    }, [orderHash, publicClient, chainId, tick]);

    const refresh = useCallback(async () => { setTick((t) => t + 1); }, []);
    return { tasks, loading, refresh };
}

export function useProcessDisclosureSummary(processId: Hex | undefined) {
    const publicClient = usePublicClient();
    const chainId = publicClient?.chain?.id ?? 0;
    const [summary, setSummary] = useState<ProcessDisclosureSummary | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!processId || !publicClient || !chainId) { setSummary(null); return; }
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                // Query both schemas in parallel. Disclosure carries commitment /
                // restatement / verification events; measurement carries grams.
                const [disclosureLogs, measurementLogs] = await Promise.all([
                    getAttestationsByProcessAndSchema(publicClient, chainId, processId, GHG_SCHEMA_ID),
                    getAttestationsByProcessAndSchema(publicClient, chainId, processId, GHG_MEASUREMENT_SCHEMA_ID),
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
    }, [processId, publicClient, chainId]);

    return { summary, loading };
}
