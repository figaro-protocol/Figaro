"use client";

/**
 * DownloadAuditBundleButton — client-side trigger for Phase D PDF generation.
 *
 * On click:
 *   1. For each order in the process, load the signed Agreement
 *      (agreementStore: in-memory + localStorage cache; mock-mode + devnet
 *      both populate this on commit).
 *   2. Fetch lifecycle attestations per order via the indexer.
 *   3. Build an AuditBundle per order (contractExtract + invoiceExtract +
 *      billOfLadingExtract + hashAppendix).
 *   4. Project consolidated process-level financials.
 *   5. Render to a Blob via @react-pdf/renderer's `pdf()` and trigger
 *      a browser download. No server round-trip; the user's data never
 *      leaves the browser.
 */
import { useState } from "react";
import { useChainId, usePublicClient } from "wagmi";
import type { Order } from "@/lib/core/store";
import { loadAgreement } from "@/lib/core/agreementStore";
import { COMMERCE_SCHEMA_KEY, redactSections } from "@/lib/core/agreementManifest";
import {
    getAttestationsByOrder,
    getAllAuctionCreated,
    getAllAuctionClaimed,
    getAllOperatorRegistered,
} from "@/lib/core/indexer";
import { buildAuditBundle, type AuditBundle } from "@/lib/audit/auditBundle";
import type {
    DutchAuctionCreatedEvent,
    DutchAuctionClaimedEvent,
} from "@/lib/audit/dutchAuctionExtract";
import type {
    OperatorRegisteredEvent,
    OperatorRoleNumeric,
} from "@/lib/audit/operatorRegistryExtract";
import {
    projectFinancials,
    type FinancialsModel,
} from "@/lib/semantic/financialsProjection";
import type { AttestationRecord } from "@/lib/mechanisms/useGHGDisclosure";

// `@react-pdf/renderer` is ~400 kB. Lazy-load on click so the financials
// page itself stays light. Users who never download the PDF never pay
// the cost; users who click see a brief "Building bundle…" while the
// chunk fetches + the PDF renders.
async function loadPdfModule() {
    const [renderer, bundle] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/lib/audit/pdfBundle"),
    ]);
    return { pdf: renderer.pdf, AuditBundlePdf: bundle.AuditBundlePdf };
}

interface DownloadAuditBundleButtonProps {
    processId: string;
    orders: readonly Order[];
}

type IndexedAttestationLog = {
    args?: {
        orderHash?: string;
        processId?: string;
        attester?: string;
        schemaId?: string;
        stage?: number | bigint;
        contentRef?: string;
    };
    transactionHash?: string;
    blockNumber?: bigint | number;
};

/**
 * Normalize an indexer log into the AttestationRecord shape the extractors
 * expect. The indexer's getAttestationsByOrder returns viem decoded logs;
 * the field names match but we cast through to bridge bigint stage / block.
 */
function toAttestationRecord(log: IndexedAttestationLog): AttestationRecord | null {
    const args = log.args;
    if (!args || !args.orderHash || !args.processId || !args.attester || !args.schemaId) {
        return null;
    }
    const stage = args.stage === undefined ? 0 : Number(args.stage);
    return {
        orderHash: args.orderHash,
        processId: args.processId,
        attester: args.attester,
        schemaId: args.schemaId,
        stage,
        contentRef: args.contentRef ?? "0x",
        transactionHash: log.transactionHash ?? null,
        blockNumber: log.blockNumber === undefined ? 0 : Number(log.blockNumber),
    };
}

type IndexedLog = {
    args?: Record<string, unknown>;
    transactionHash?: string;
    blockNumber?: bigint | number;
};

function toAuctionCreated(log: IndexedLog): DutchAuctionCreatedEvent | null {
    const a = log.args;
    if (!a || typeof a.auctionId !== "string" || typeof a.creator !== "string"
        || typeof a.processId !== "string" || typeof a.currency !== "string") {
        return null;
    }
    return {
        auctionId: a.auctionId,
        creator: a.creator,
        maxPrice: typeof a.maxPrice === "bigint" ? a.maxPrice : BigInt(String(a.maxPrice ?? 0)),
        processId: a.processId,
        currency: a.currency,
        blockNumber: log.blockNumber === undefined ? undefined : Number(log.blockNumber),
        transactionHash: log.transactionHash,
    };
}

function toAuctionClaimed(log: IndexedLog): DutchAuctionClaimedEvent | null {
    const a = log.args;
    if (!a || typeof a.auctionId !== "string" || typeof a.provider !== "string") return null;
    return {
        auctionId: a.auctionId,
        provider: a.provider,
        clearingPrice:
            typeof a.clearingPrice === "bigint" ? a.clearingPrice : BigInt(String(a.clearingPrice ?? 0)),
        blockNumber: log.blockNumber === undefined ? undefined : Number(log.blockNumber),
        transactionHash: log.transactionHash,
    };
}

function toOperatorRegistered(log: IndexedLog): OperatorRegisteredEvent | null {
    const a = log.args;
    if (!a || typeof a.operator !== "string") return null;
    const role = Number(a.role ?? 0);
    if (role < 0 || role > 3) return null;
    return {
        operator: a.operator,
        role: role as OperatorRoleNumeric,
        metadataURI: typeof a.metadataURI === "string" ? a.metadataURI : "",
        blockNumber: log.blockNumber === undefined ? undefined : Number(log.blockNumber),
        transactionHash: log.transactionHash,
    };
}

async function buildPdfBlob(
    processId: string,
    orders: readonly Order[],
    publicClient: ReturnType<typeof usePublicClient>,
    chainId: number,
    options: { redactLineItems: boolean } = { redactLineItems: false },
): Promise<Blob> {
    const perOrderBundles: AuditBundle[] = [];

    // Pre-fetch process-wide auction + operator-registration events once,
    // not per order. The extractors filter to the relevant order/seller
    // internally.
    let auctionCreatedAll: DutchAuctionCreatedEvent[] = [];
    let auctionClaimedAll: DutchAuctionClaimedEvent[] = [];
    let operatorRegisteredAll: OperatorRegisteredEvent[] = [];
    if (publicClient) {
        try {
            const [createdLogs, claimedLogs, opRegLogs] = await Promise.all([
                getAllAuctionCreated(publicClient, chainId),
                getAllAuctionClaimed(publicClient, chainId),
                getAllOperatorRegistered(publicClient, chainId),
            ]);
            auctionCreatedAll = (createdLogs as IndexedLog[])
                .map(toAuctionCreated)
                .filter((r): r is DutchAuctionCreatedEvent => r !== null);
            auctionClaimedAll = (claimedLogs as IndexedLog[])
                .map(toAuctionClaimed)
                .filter((r): r is DutchAuctionClaimedEvent => r !== null);
            operatorRegisteredAll = (opRegLogs as IndexedLog[])
                .map(toOperatorRegistered)
                .filter((r): r is OperatorRegisteredEvent => r !== null);
        } catch {
            // Non-fatal — extractors will report auctionApplicable=false /
            // registered=false and the bundle still renders.
        }
    }

    for (const order of orders) {
        const cleartextAgreement = loadAgreement(order.agreementHash);
        if (!cleartextAgreement) {
            // Skip orders whose agreement wasn't hydrated locally — the bundle
            // depends on agreement clauses to extract. The hash appendix would
            // be empty without it. A future enhancement is fetching by uriHash
            // from IPFS, but that's not required for first-cut where mock and
            // devnet both populate agreementStore at commit time.
            continue;
        }
        // Apply redaction at the source so every downstream extractor sees
        // the redacted form. The merkle root is preserved (per Option B,
        // hash-then-encrypt with hash over cleartext); only the section's
        // cleartext is omitted from the distributed PDF.
        const agreement = options.redactLineItems
            ? redactSections(cleartextAgreement, [COMMERCE_SCHEMA_KEY])
            : cleartextAgreement;

        let attestations: readonly AttestationRecord[] = [];
        if (publicClient) {
            try {
                const logs = await getAttestationsByOrder(publicClient, chainId, order.id);
                attestations = (logs as IndexedAttestationLog[])
                    .map(toAttestationRecord)
                    .filter((r): r is AttestationRecord => r !== null);
            } catch {
                // Non-fatal — render the bundle with empty attestations rather
                // than failing the whole PDF.
                attestations = [];
            }
        }

        // Filter the process-wide auction events to those scoped to this
        // order's process. Operator-registration events are filtered to
        // the seller inside the extractor.
        const orderAuctionsCreated = auctionCreatedAll.filter((e) => e.processId === order.processId);
        const auctionIds = new Set(orderAuctionsCreated.map((e) => e.auctionId));
        const orderAuctionsClaimed = auctionClaimedAll.filter((e) => auctionIds.has(e.auctionId));

        perOrderBundles.push(
            buildAuditBundle(order, agreement, attestations, {
                auctionCreatedEvents: orderAuctionsCreated,
                auctionClaimedEvents: orderAuctionsClaimed,
                operatorRegistrationEvents: operatorRegisteredAll,
            }),
        );
    }

    const financials: FinancialsModel = projectFinancials(orders, "process", processId);
    const buyer = orders[0]?.buyer;

    const { pdf, AuditBundlePdf } = await loadPdfModule();
    const doc = AuditBundlePdf({
        data: {
            processId,
            buyer,
            perOrderBundles,
            financials,
            generatedAt: new Date(),
        },
    });
    return pdf(doc).toBlob();
}

function triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export function DownloadAuditBundleButton({ processId, orders }: DownloadAuditBundleButtonProps) {
    const publicClient = usePublicClient();
    const chainId = useChainId();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [redactLineItems, setRedactLineItems] = useState(false);

    const disabled = busy || orders.length === 0;
    const filenameSuffix = redactLineItems ? "-redacted" : "";

    return (
        <div className="flex flex-col gap-2" data-testid="download-audit-bundle">
            <label
                className="flex items-center gap-2 text-[11px] text-neutral-700 cursor-pointer select-none"
                data-testid="download-audit-bundle-redact-toggle"
            >
                <input
                    type="checkbox"
                    checked={redactLineItems}
                    onChange={(e) => setRedactLineItems(e.target.checked)}
                    disabled={busy}
                    className="h-3 w-3"
                    data-testid="download-audit-bundle-redact-checkbox"
                />
                <span>
                    Seal commerce line items (for distribution)
                    {redactLineItems && (
                        <span className="ml-1 text-amber-700 font-semibold">— 🔒 sealed</span>
                    )}
                </span>
            </label>
            {redactLineItems && (
                <p
                    className="text-[10px] text-neutral-600 leading-tight max-w-md"
                    data-testid="download-audit-bundle-redact-note"
                >
                    The PDF will hide line-item detail (SKU, quantity, unit price)
                    while preserving the agreement merkle root, totals, currency,
                    and every other clause. The recipient verifies the root
                    against chain; you can selectively reveal individual sections
                    later via /verify Mode B if needed.
                </p>
            )}
            <button
                type="button"
                onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                        const blob = await buildPdfBlob(processId, orders, publicClient, chainId, {
                            redactLineItems,
                        });
                        triggerDownload(blob, `audit-bundle-${processId.slice(0, 10)}${filenameSuffix}.pdf`);
                    } catch (e) {
                        setError(e instanceof Error ? e.message : "PDF generation failed.");
                    } finally {
                        setBusy(false);
                    }
                }}
                disabled={disabled}
                className={`text-xs px-3 py-1.5 rounded border ${disabled ? "bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed" : "bg-black text-white border-black hover:bg-neutral-800"}`}
                data-testid="download-audit-bundle-button"
            >
                {busy ? "Building bundle…" : redactLineItems ? "Download redacted bundle (PDF)" : "Download audit bundle (PDF)"}
            </button>
            {error && (
                <p className="text-[11px] text-red-700" data-testid="download-audit-bundle-error">
                    {error}
                </p>
            )}
        </div>
    );
}
