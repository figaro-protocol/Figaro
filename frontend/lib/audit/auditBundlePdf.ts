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

import { erc20Abi, type PublicClient } from "viem";
import type { Order } from "@/lib/kernel/store";
import type { Agreement } from "@figaro-protocol/sdk";
import { getAllMemberRegistered, getActiveMembers } from "@/lib/protocol/membersRegistryIndexer";
import { getAttestationsByOrder } from "@/lib/composition/indexer";
import { buildAuditBundle, type AuditBundle } from "@/lib/audit/auditBundle";
import type {
    MemberRegisteredEvent,
} from "@/lib/audit/membersRegistryExtract";
import { projectDocuments, projectAllFinancialStatements } from "@/lib/audit/documentProjection";
import { DOCUMENT_LAYOUTS } from "@/lib/audit/documentLayouts";
import type { AttestationRecord } from "@/lib/composition/indexer";
import {
    buildProcessTimeline,
    type ProcessTimeline,
} from "@/lib/audit/processTimeline";
import type { MissingPart } from "@/lib/audit/types";
import type { AuditBundlePdfData } from "@/lib/audit/pdfBundle";


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

/**
 * The data the evidence file is drawn from: one bundle per order whose agreement
 * loaded, the process timeline, the documents, and `missing`, the list of every
 * part the evidence file does not contain with its reason. A part that could not be
 * read is named there; none is left out without a word, and none is replaced by
 * content the evidence file does not hold.
 */
export async function buildAuditBundleData(
    processId: string,
    orders: readonly Order[],
    publicClient: PublicClient | undefined,
    chainId: number,
    agreements: Map<string, Agreement>,
    options: BuildAuditBundlePdfOptions = {},
): Promise<AuditBundlePdfData> {
    const perOrderBundles: AuditBundle[] = [];
    const missing: MissingPart[] = [];

    let memberRegisteredAll: MemberRegisteredEvent[] = [];
    if (publicClient) {
        try {
            // SDK-decoded rows; project to the audit extractor's shape.
            // `getActiveMembers` already folds MemberRegistered +
            // MemberProfileUpdated + MemberWithdrawalRequested (the same
            // fold `getMemberState` uses for a single address) — a member
            // absent from it has withdrawn since its most recent
            // registration. Consuming that fold here (rather than
            // re-deriving withdrawal from raw events) is what makes the
            // extractor's `registered:` verdict agree with every other
            // withdrawal-aware surface.
            const [rows, active] = await Promise.all([
                getAllMemberRegistered(publicClient, chainId),
                getActiveMembers(publicClient, chainId),
            ]);
            const activeMembers = new Set(active.map((m) => m.address));
            memberRegisteredAll = rows.map((row) => ({
                member: row.member,
                metadataURI: row.metadataURI,
                blockNumber: row.blockNumber,
                transactionHash: row.transactionHash ?? undefined,
                withdrawn: !activeMembers.has(row.member.toLowerCase()),
            }));
        } catch {
            // The extractor reports registered=false and the bundle still
            // renders; the evidence file says the registry rows were not read.
            missing.push({
                part: "Members registry rows of the parties",
                reason: "the read of the members registry failed, so each party's registration is shown as not found",
            });
        }
    } else {
        missing.push({
            part: "Members registry rows of the parties",
            reason: "no network client was given, so the members registry was not read",
        });
    }

    for (const order of orders) {
        const cleartextAgreement = order.checkoutHash
            ? (agreements.get(order.checkoutHash) ?? null)
            : null;
        if (!cleartextAgreement) {
            missing.push({
                part: `Agreement and clauses of order ${order.orderHash}`,
                orderHash: order.orderHash,
                reason: order.checkoutHash
                    ? `the agreement under checkoutHash ${order.checkoutHash} was not loaded`
                    : "the order carries no checkoutHash, so no agreement was looked up",
            });
            continue;
        }
        // Agreements are cleartext end to end (the IPFS body carries every
        // clause in full). No redacted distribution form.
        const agreement = cleartextAgreement;

        let attestations: readonly AttestationRecord[] = [];
        if (publicClient) {
            try {
                attestations = await getAttestationsByOrder(publicClient, chainId, order.orderHash);
            } catch {
                missing.push({
                    part: `Attestations of order ${order.orderHash}`,
                    orderHash: order.orderHash,
                    reason: "the read of its attestations failed, so the evidence file lists none; the order may have attestations",
                });
            }
        } else {
            missing.push({
                part: `Attestations of order ${order.orderHash}`,
                orderHash: order.orderHash,
                reason: "no network client was given, so its attestations were not read",
            });
        }

        const bundle = buildAuditBundle(order, agreement, attestations, {
            memberRegistrationEvents: memberRegisteredAll,
        });
        perOrderBundles.push(bundle);
        missing.push(...bundle.missing);
    }

    // Every document — invoice per seller, BoL per carriage leg, financial
    // statements per seller + consolidated — is the SAME RenderedDocument shape
    // from the SAME generic engine. No genre code, no bespoke financials page.
    const documents = [
        ...projectDocuments(DOCUMENT_LAYOUTS, orders, agreements),
        ...projectAllFinancialStatements(orders, processId),
    ];
    const buyer = orders[0]?.buyer;

    let timeline: ProcessTimeline | null = null;
    if (!publicClient) {
        missing.push({ part: "Process timeline", reason: "no network client was given, so the timeline was not read" });
    } else if (options.includeTimeline === false) {
        missing.push({ part: "Process timeline", reason: "the timeline was not requested for this evidence file" });
    } else {
        try {
            timeline = await buildProcessTimeline(publicClient, processId as `0x${string}`);
            missing.push(...timeline.missing);
        } catch {
            // The evidence file renders without the timeline page and says so; the
            // hash-anchored evidence (clauses, contentRefs) still verifies.
            missing.push({ part: "Process timeline", reason: "the read of the chain's events failed" });
        }
    }

    // The process token's decimals(), read from the chain; absent when unreadable.
    let tokenDecimals: number | undefined;
    const processCurrency = orders[0]?.currency as `0x${string}` | undefined;
    if (publicClient && processCurrency) {
        try {
            tokenDecimals = Number(await publicClient.readContract({ address: processCurrency, abi: erc20Abi, functionName: "decimals" }));
        } catch {
            tokenDecimals = undefined;
            missing.push({
                part: "Amounts of the contract pages, in the token's units",
                reason: `the decimals of the token ${processCurrency} could not be read, so the amounts are shown in the token's smallest unit`,
            });
        }
    } else if (orders.length > 0) {
        missing.push({
            part: "Amounts of the contract pages, in the token's units",
            reason: publicClient ? "no commitment names the process's token" : "no network client was given, so the token's decimals were not read",
        });
    }

    return {
        processId,
        buyer,
        perOrderBundles,
        documents,
        timeline,
        tokenDecimals,
        missing,
        generatedAt: new Date(),
    };
}

export async function buildAuditBundlePdfBlob(
    processId: string,
    orders: readonly Order[],
    publicClient: PublicClient | undefined,
    chainId: number,
    agreements: Map<string, Agreement>,
    options: BuildAuditBundlePdfOptions = {},
): Promise<Blob> {
    const data = await buildAuditBundleData(processId, orders, publicClient, chainId, agreements, options);

    const { pdf, AuditBundlePdf } = await loadPdfModule();
    const doc = AuditBundlePdf({ data });
    return pdf(doc).toBlob();
}
