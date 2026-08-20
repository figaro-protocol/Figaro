/**
 * Process-scoped audit-bundle PDF builder.
 *
 * Pure async helper consumed by both surfaces that emit the audit-bundle
 * PDF: `DownloadAuditBundleButton` (browser download) and `RecoursePanel`'s
 * evidence-bundle action (IPFS pin; the party attaches the pinned URI as
 * evidence on the recourse forum's own UI). Agreements are cleartext — there
 * is no redacted distribution form. The PDF includes a Process Timeline page when a
 * `publicClient` is supplied, so the timeline doesn't need a separate
 * IPFS pin or evidence submission.
 */

import type { PublicClient } from "viem";
import type { Order } from "@/lib/kernel/store";
import type { Agreement } from "@figaro-protocol/sdk";
import { getAllMemberRegistered, getActiveMembers } from "@/lib/protocol/membersRegistryIndexer";
import {
    getAttestationsByOrder,
    parseAttestationLog,
    type IndexedAttestationLog,
} from "@/lib/composition/indexer";
import { buildAuditBundle, type AuditBundle } from "@/lib/audit/auditBundle";
import type {
    MemberRegisteredEvent,
} from "@/lib/audit/membersRegistryExtract";
import { projectDocuments, projectAllFinancialStatements } from "@/lib/audit/documentProjection";
import { DOCUMENT_TEMPLATES } from "@/lib/audit/documentTemplates";
import type { AttestationRecord } from "@/lib/composition/indexer";
import {
    buildProcessTimeline,
    type ProcessTimeline,
} from "@/lib/audit/processTimeline";


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

    let memberRegisteredAll: MemberRegisteredEvent[] = [];
    if (publicClient) {
        try {
            // SDK-decoded rows; project to the audit extractor's shape.
            // `getActiveMembers` already folds MemberRegistered +
            // MemberProfileUpdated + MemberWithdrawalRequested (the same
            // fold `getMemberState` uses for a single address) — a seller
            // absent from it has withdrawn since its most recent
            // registration. Consuming that fold here (rather than
            // re-deriving withdrawal from raw events) is what makes the
            // extractor's `registered:` verdict agree with every other
            // withdrawal-aware surface.
            const [rows, active] = await Promise.all([
                getAllMemberRegistered(publicClient, chainId),
                getActiveMembers(publicClient, chainId),
            ]);
            const activeSellers = new Set(active.map((m) => m.address));
            memberRegisteredAll = rows.map((row) => ({
                seller: row.member,
                metadataURI: row.metadataURI,
                blockNumber: row.blockNumber,
                transactionHash: row.transactionHash ?? undefined,
                withdrawn: !activeSellers.has(row.member.toLowerCase()),
            }));
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
                const logs = await getAttestationsByOrder(publicClient, chainId, order.orderHash);
                attestations = (logs as IndexedAttestationLog[])
                    .map(parseAttestationLog)
                    .filter((r): r is AttestationRecord => r !== null);
            } catch {
                attestations = [];
            }
        }

        perOrderBundles.push(
            buildAuditBundle(order, agreement, attestations, {
                memberRegistrationEvents: memberRegisteredAll,
            }),
        );
    }

    // Every document — invoice per seller, BoL per carriage leg, financial
    // statements per seller + consolidated — is the SAME RenderedDocument shape
    // from the SAME generic engine. No genre code, no bespoke financials page.
    const documents = [
        ...projectDocuments(DOCUMENT_TEMPLATES, orders, agreements),
        ...projectAllFinancialStatements(orders, processId),
    ];
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
            documents,
            timeline,
            generatedAt: new Date(),
        },
    });
    return pdf(doc).toBlob();
}
