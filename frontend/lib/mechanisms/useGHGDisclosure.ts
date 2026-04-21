/**
 * GHG Disclosure module — V5 event-sourced via AttestationCoordinator.
 *
 * Write hooks submit attestations through AttestationCoordinator.
 * Read hooks reconstruct disclosure state from indexed Attestation events
 * filtered by the GHG schema ID — no contract storage reads.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import {
    keccak256,
    stringToHex,
    toHex,
    type Hex,
} from "viem";
import { ZERO_BYTES32, useAttestationCoordinatorActions } from "@/lib/mechanisms/useAttestationCoordinatorActions";
import {
    GHG_SCHEMA_ID,
    DISCLOSURE_KIND,
    DISCLOSURE_KIND_LABELS,
    DUE_STAGE_LABELS,
} from "@/lib/mechanisms/contracts";
import {
    getAttestationsByProcessAndSchema,
    getAttestationsByOrder,
} from "@/lib/core/indexer";
import { extractErrorMessage } from "@/lib/shared/errors";

// ---------------------------------------------------------------------------
// Live attestation model:
//   - schemaId = GHG_SCHEMA_ID (keccak256 of "figaro-ghg-disclosure-v1")
//   - stage encodes the GHG disclosure kind per ISO 14064 / GHG Protocol:
//       0 = Commitment    (declaration of intent — ISO 14064-1 §5.1)
//       1 = Inventory     (quantified GHG statement — ISO 14064-1 §5.2–5.4)
//       2 = Restatement   (correction to prior statement — GHG Protocol Ch. 5)
//       3 = Verification  (third-party validation — ISO 14064-3)
//   - contentRef carries the evidence payload (e.g., encoded grams or commitment hash)
// ---------------------------------------------------------------------------

export type AttestationRecord = {
    orderHash: string;
    processId: string;
    attester: string;
    schemaId: string;
    stage: number;
    contentRef: string;
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
    args?: {
        orderHash?: string;
        processId?: string;
        attester?: string;
        schemaId?: string;
        stage?: number | bigint;
        contentRef?: string;
    };
    blockNumber?: number | bigint;
};

// ── Pure utility functions ───────────────────────────────────────────────────

export function encodeCommitmentDisclosureRef(orderHash: string, role: string): Hex {
    return keccak256(stringToHex(`figaro:ghg:commitment:v1:${role}:${orderHash}`));
}

export function encodeActualGramsDisclosureRef(grams: bigint): Hex {
    return toHex(grams, { size: 32 });
}

export function decodeActualGramsDisclosureRef(contentRef: Hex | null | undefined): bigint | null {
    if (!contentRef || contentRef === ZERO_BYTES32) return null;
    try {
        return BigInt(contentRef);
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
        contentRef: Hex,
    ) => {
        return submitSellerAttestation({
            roleOrderHash,
            orderHash,
            schemaId: GHG_SCHEMA_ID as Hex,
            stage,
            contentRef,
        });
    }, [submitSellerAttestation]);

    const attestAsBuyer = useCallback(async (
        roleOrderHash: Hex,
        orderHash: Hex,
        stage: number,
        contentRef: Hex,
    ) => {
        return submitBuyerAttestation({
            processId: roleOrderHash,
            orderHash,
            schemaId: GHG_SCHEMA_ID as Hex,
            stage,
            contentRef,
        });
    }, [submitBuyerAttestation]);

    const submitCommitmentForOrder = useCallback(async (
        orderHash: string,
        role: "restaurant" | "driver",
    ) => {
        const contentRef = encodeCommitmentDisclosureRef(orderHash, role);
        return submitSellerAttestation({
            orderHash: orderHash as Hex,
            schemaId: GHG_SCHEMA_ID as Hex,
            stage: DISCLOSURE_KIND.commitment,
            contentRef,
        });
    }, [submitSellerAttestation]);

    const submitActualForOrder = useCallback(async (
        orderHash: string,
        grams: bigint,
    ) => {
        const contentRef = encodeActualGramsDisclosureRef(grams);
        return submitSellerAttestation({
            orderHash: orderHash as Hex,
            schemaId: GHG_SCHEMA_ID as Hex,
            stage: DISCLOSURE_KIND.inventory,
            contentRef,
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
                    (log): log is IndexedAttestationLog => log.args?.schemaId === GHG_SCHEMA_ID,
                );
                const result: DisclosureTask[] = ghgLogs.map((log) => {
                    const rec = parseAttestationLog(log);
                    const contentHex = rec.contentRef !== ZERO_BYTES32
                        ? rec.contentRef as Hex : null;
                    return {
                        orderHash: rec.orderHash,
                        stage: rec.stage,
                        stageLabel: DISCLOSURE_KIND_LABELS[rec.stage] ?? `Stage(${rec.stage})`,
                        contentRef: contentHex,
                        attester: rec.attester,
                        actualGrams: rec.stage === DISCLOSURE_KIND.inventory
                            ? decodeActualGramsDisclosureRef(contentHex) : null,
                        blockNumber: rec.blockNumber,
                    };
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
                const logs = await getAttestationsByProcessAndSchema(
                    publicClient, chainId, processId, GHG_SCHEMA_ID,
                );
                if (cancelled) return;
                const attestations = logs.map((log) => parseAttestationLog(log as IndexedAttestationLog));
                let totalActualGrams = 0n;
                let commitmentCount = 0;
                let actualCount = 0;
                for (const a of attestations) {
                    if (a.stage === DISCLOSURE_KIND.commitment) commitmentCount++;
                    if (a.stage === DISCLOSURE_KIND.inventory) {
                        actualCount++;
                        const grams = decodeActualGramsDisclosureRef(
                            a.contentRef !== ZERO_BYTES32 ? a.contentRef as Hex : null,
                        );
                        if (grams !== null) totalActualGrams += grams;
                    }
                }
                if (!cancelled) {
                    setSummary({
                        processId,
                        attestationCount: attestations.length,
                        commitmentCount,
                        actualCount,
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