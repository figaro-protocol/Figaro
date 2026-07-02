/**
 * Process-scoped audit-bundle PDF builder.
 *
 * Pure async helper consumed by both surfaces that emit the audit-bundle
 * PDF: `DownloadAuditBundleButton` (browser download) and the
 * `DisputeStatusPanel` Submit Evidence flow (IPFS pin + on-chain
 * evidence submission). Agreements are cleartext — there is no redacted
 * distribution form. The PDF includes a Process Timeline page when a
 * `publicClient` is supplied, so the timeline doesn't need a separate
 * IPFS pin or evidence submission.
 */

import type { PublicClient } from "viem";
import type { Order } from "@/lib/kernel/store";
import type { Agreement } from "@figaro/core";
import { getAllSellerRegistered } from "@/lib/protocol/sellerRegistryIndexer";
import {
    getAttestationsByOrder,
    type IndexedAttestationLog,
} from "@/lib/composition/indexer";
import { buildAuditBundle, type AuditBundle } from "@/lib/audit/auditBundle";
import type {
    SellerRegisteredEvent,
} from "@/lib/audit/sellerRegistryExtract";
import {
    projectFinancials,
    type FinancialsModel,
} from "@/lib/audit/financialsProjection";
import type { AttestationRecord } from "@/lib/composition/useGHGDisclosure";
import {
    buildProcessTimeline,
    type ProcessTimeline,
} from "@/lib/audit/processTimeline";

interface IndexedLog {
    args?: Record<string, unknown>;
    transactionHash?: string;
    blockNumber?: bigint | number;
}

export function toAttestationRecord(log: IndexedAttestationLog): AttestationRecord | null {
    const args = log.args;
    if (!args || !args.orderHash || !args.processId || !args.attester || !args.clauseId) {
        return null;
    }
    const stage = args.stage === undefined ? 0 : Number(args.stage);
    return {
        orderHash: args.orderHash,
        processId: args.processId,
        attester: args.attester,
        clauseId: args.clauseId,
        stage,
        contentRef: args.contentRef ?? "0x",
        transactionHash: log.transactionHash ?? null,
        blockNumber: log.blockNumber === undefined ? 0 : Number(log.blockNumber),
    };
}

function toSellerRegistered(log: IndexedLog): SellerRegisteredEvent | null {
    const a = log.args;
    if (!a || typeof a.seller !== "string") return null;
    return {
        seller: a.seller,
        metadataURI: typeof a.metadataURI === "string" ? a.metadataURI : "",
        blockNumber: log.blockNumber === undefined ? undefined : Number(log.blockNumber),
        transactionHash: log.transactionHash,
    };
}

// `@react-pdf/renderer` is ~400 kB. Lazy-load on first call so the
// importer's bundle stays light. Users who never trigger PDF generation
// never pay the cost.
async function loadPdfModule() {
    const [renderer, bundle] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/lib/audit/pdfBundle"),
    ]);
    return { pdf: renderer.pdf, AuditBundlePdf: bundle.AuditBundlePdf };
}

export interface BuildAuditBundlePdfOptions {
    /**
     * Skip the timeline page entirely. Defaults to including the timeline
     * whenever a `publicClient` is available. Set to `false` only if the
     * caller knows the timeline shouldn't appear (e.g. preview render).
     */
    includeTimeline?: boolean;
}

export async function buildAuditBundlePdfBlob(
    processId: string,
    orders: readonly Order[],
    publicClient: PublicClient | undefined,
    chainId: number,
    agreements: Map<string, Agreement>,
    options: BuildAuditBundlePdfOptions = {},
): Promise<Blob> {
    const perOrderBundles: AuditBundle[] = [];

    let sellerRegisteredAll: SellerRegisteredEvent[] = [];
    if (publicClient) {
        try {
            const opRegLogs = await getAllSellerRegistered(publicClient, chainId);
            sellerRegisteredAll = (opRegLogs as IndexedLog[])
                .map(toSellerRegistered)
                .filter((r): r is SellerRegisteredEvent => r !== null);
        } catch {
            // Non-fatal — the extractor reports registered=false and the
            // bundle still renders.
        }
    }

    for (const order of orders) {
        const cleartextAgreement = order.agreementHash
            ? (agreements.get(order.agreementHash) ?? null)
            : null;
        if (!cleartextAgreement) {
            continue;
        }
        // Agreements are cleartext end to end (the IPFS body carries every
        // section in full). No redacted distribution form.
        const agreement = cleartextAgreement;

        let attestations: readonly AttestationRecord[] = [];
        if (publicClient) {
            try {
                const logs = await getAttestationsByOrder(publicClient, chainId, order.id);
                attestations = (logs as IndexedAttestationLog[])
                    .map(toAttestationRecord)
                    .filter((r): r is AttestationRecord => r !== null);
            } catch {
                attestations = [];
            }
        }

        perOrderBundles.push(
            buildAuditBundle(order, agreement, attestations, {
                sellerRegistrationEvents: sellerRegisteredAll,
            }),
        );
    }

    const financials: FinancialsModel = projectFinancials(orders, "process", processId);
    const buyer = orders[0]?.buyer;

    let timeline: ProcessTimeline | null = null;
    if (publicClient && options.includeTimeline !== false) {
        try {
            timeline = await buildProcessTimeline(publicClient, processId as `0x${string}`);
        } catch {
            // Non-fatal — render without the timeline page if RPC fails.
            // Hash-anchored evidence (clauses, contentRefs) is still sufficient
            // for verification; the timeline is convenience.
        }
    }

    const { pdf, AuditBundlePdf } = await loadPdfModule();
    const doc = AuditBundlePdf({
        data: {
            processId,
            buyer,
            perOrderBundles,
            financials,
            timeline,
            generatedAt: new Date(),
        },
    });
    return pdf(doc).toBlob();
}
