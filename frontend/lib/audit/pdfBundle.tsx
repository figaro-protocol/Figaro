/**
 * PDF renderer for the audit bundle (Phase D).
 *
 * Composes the four extractor outputs (Contract, Invoice, Bill of Lading,
 * Hash appendix) plus the financials projection into one
 * cryptographically-verifiable PDF. Every page footer carries the
 * `agreementHash` (or `processId` for the financials page) so a reader
 * lands on each page already oriented to the on-chain anchor it derives
 * from.
 *
 * Implementation notes:
 *
 * - `@react-pdf/renderer` uses its own component set (not HTML / Tailwind).
 *   All styling goes through `StyleSheet.create`.
 *
 * - The PDF is rendered client-side on user click — see
 *   `components/core/DownloadAuditBundleButton.tsx`. No server round-trip;
 *   the user's data stays in their browser. SSR-side generation is also
 *   possible with the same component if a backend ever needs to ship
 *   pre-rendered bundles.
 *
 * - For multi-order processes the bundle iterates orders, emitting
 *   per-order Contract / Invoice / BoL pages. The financials and hash
 *   appendix sections aggregate across the whole process.
 */
import {
    Document,
    Page,
    View,
    Text,
    StyleSheet,
} from "@react-pdf/renderer";
import { formatUnits } from "viem";
import type { AuditBundle } from "./auditBundle";
import type { BillOfLadingDocument } from "./billOfLadingExtract";
import type {
    BalanceSheetEntry,
    FinancialsModel,
    OrderLineItem,
} from "@/lib/semantic/financialsProjection";
import { OrderState } from "@/lib/core/store";
import type { ProcessTimeline, TimelineEvent } from "@/lib/dispute/evidenceTimeline";
import { truncateHex } from "@/lib/shared/formatHex";

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    page: {
        padding: 36,
        fontSize: 9,
        fontFamily: "Helvetica",
        color: "#111111",
    },
    header: {
        marginBottom: 16,
        paddingBottom: 8,
        borderBottom: "1pt solid #d4d4d4",
    },
    h1: {
        fontSize: 16,
        fontWeight: 700,
        marginBottom: 4,
    },
    h2: {
        fontSize: 11,
        fontWeight: 700,
        marginTop: 14,
        marginBottom: 6,
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    label: {
        fontSize: 7,
        color: "#737373",
        textTransform: "uppercase",
        letterSpacing: 0.4,
    },
    mono: {
        fontFamily: "Courier",
        fontSize: 8,
    },
    metadataRow: {
        flexDirection: "row",
        marginBottom: 2,
    },
    metadataKey: {
        width: 120,
        color: "#737373",
        fontSize: 8,
    },
    metadataValue: {
        fontSize: 8,
        flex: 1,
    },
    section: {
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 9,
        fontWeight: 700,
        marginBottom: 4,
    },
    sectionBody: {
        fontSize: 8,
        color: "#404040",
    },
    table: {
        marginTop: 6,
        marginBottom: 6,
        borderTop: "1pt solid #e5e5e5",
    },
    tableRow: {
        flexDirection: "row",
        borderBottom: "0.5pt solid #e5e5e5",
        paddingTop: 3,
        paddingBottom: 3,
    },
    tableHeader: {
        backgroundColor: "#fafafa",
        fontWeight: 700,
    },
    tCell: {
        paddingHorizontal: 4,
        fontSize: 8,
    },
    tCellMono: {
        paddingHorizontal: 4,
        fontFamily: "Courier",
        fontSize: 7,
    },
    tCellRight: {
        paddingHorizontal: 4,
        fontSize: 8,
        textAlign: "right",
    },
    footer: {
        position: "absolute",
        bottom: 18,
        left: 36,
        right: 36,
        flexDirection: "row",
        justifyContent: "space-between",
        fontSize: 7,
        color: "#737373",
        borderTop: "0.5pt solid #d4d4d4",
        paddingTop: 4,
    },
    footerHash: {
        fontFamily: "Courier",
        fontSize: 7,
        color: "#737373",
    },
    badge: {
        fontSize: 7,
        fontFamily: "Courier",
        color: "#737373",
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 2,
    },
    badgeOk: {
        color: "#15803d",
    },
    badgeBad: {
        color: "#b91c1c",
    },
    note: {
        fontSize: 7,
        color: "#737373",
        marginTop: 6,
        fontStyle: "italic",
    },
});

// ── Display helpers ─────────────────────────────────────────────────────────

const DEFAULT_DECIMALS = 18;
function fmt(amount: bigint): string {
    return formatUnits(amount, DEFAULT_DECIMALS);
}

function shortHex(hex: string | undefined, head = 10, tail = 6): string {
    return truncateHex(hex, { head, tail }) || "—";
}

function shortAddr(addr: string | undefined): string {
    return shortHex(addr, 6, 4);
}

// ── Footer ──────────────────────────────────────────────────────────────────

function PageFooter({ agreementHash, processId }: { agreementHash?: string; processId?: string }) {
    return (
        <View style={styles.footer} fixed>
            <View>
                <Text style={styles.footerHash}>
                    agreementHash {shortHex(agreementHash, 14, 8)}
                </Text>
                <Text style={styles.footerHash}>
                    processId {shortHex(processId, 14, 8)}
                </Text>
            </View>
            <Text
                style={styles.footerHash}
                render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
            />
        </View>
    );
}

// ── Cover page ──────────────────────────────────────────────────────────────

function CoverPage({ processId, buyer, generatedAt }: {
    processId: string;
    buyer: string | undefined;
    generatedAt: Date;
}) {
    return (
        <Page size="A4" style={styles.page}>
            <View style={styles.header}>
                <Text style={styles.label}>Audit bundle</Text>
                <Text style={styles.h1}>Bonded commitment record</Text>
            </View>
            <View style={styles.section}>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>processId</Text>
                    <Text style={[styles.metadataValue, styles.mono]}>{processId}</Text>
                </View>
                {buyer && (
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>buyer</Text>
                        <Text style={[styles.metadataValue, styles.mono]}>{buyer}</Text>
                    </View>
                )}
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>generated</Text>
                    <Text style={styles.metadataValue}>{generatedAt.toISOString()}</Text>
                </View>
            </View>
            <Text style={styles.note}>
                This bundle is a cryptographically-verifiable trade record. Every
                hash herein anchors to one or more on-chain events; the reader can
                recompute each hash from the cited content and verify against
                chain without protocol cooperation. Cash-basis projection of
                on-chain commit + resolve events. Not an audited statement under
                any accounting standard — interpretation under GAAP/IFRS requires
                accountant judgment.
            </Text>
            <Text style={styles.note}>
                Sections: Process timeline (FigaroCore lifecycle, once for the
                whole process). Then per order, repeated: Contract · Invoice ·
                Bill of Lading · Emissions · Proximity · Sovereign process
                logs · Dutch auction trail · Operator registry. Then once for
                the whole process: Financials (consolidated) · Hash appendix.
            </Text>
            <PageFooter processId={processId} />
        </Page>
    );
}

// ── Contract page ───────────────────────────────────────────────────────────

function ContractPage({ contract }: { contract: AuditBundle["contract"] }) {
    return (
        <Page size="A4" style={styles.page}>
            <View style={styles.header}>
                <Text style={styles.label}>Contract</Text>
                <Text style={styles.h1}>{contract.title}</Text>
            </View>
            <View style={styles.section}>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>orderHash</Text>
                    <Text style={[styles.metadataValue, styles.mono]}>{contract.orderHash}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>buyer</Text>
                    <Text style={[styles.metadataValue, styles.mono]}>{contract.parties.buyer}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>seller</Text>
                    <Text style={[styles.metadataValue, styles.mono]}>{contract.parties.seller}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>currency</Text>
                    <Text style={[styles.metadataValue, styles.mono]}>{contract.currency}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>payment (P)</Text>
                    <Text style={styles.metadataValue}>{fmt(contract.payment)}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>cumulativeValue (G)</Text>
                    <Text style={styles.metadataValue}>{fmt(contract.cumulativeValue)}</Text>
                </View>
                {contract.committedAtBlock !== undefined && (
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>committedAtBlock</Text>
                        <Text style={styles.metadataValue}>{contract.committedAtBlock}</Text>
                    </View>
                )}
            </View>

            {/* Lineage */}
            <Text style={styles.h2}>Lineage</Text>
            <View style={styles.section}>
                {contract.lineage.parentOrderHashes.length === 0 ? (
                    <Text style={styles.sectionBody}>Root order — no parent commitments.</Text>
                ) : (
                    <>
                        <Text style={styles.sectionBody}>
                            Parent order(s){contract.lineage.topologyMode ? ` (mode: ${contract.lineage.topologyMode})` : ""}:
                        </Text>
                        {contract.lineage.parentOrderHashes.map((p) => (
                            <Text key={p} style={[styles.mono, { marginTop: 1 }]}>{p}</Text>
                        ))}
                    </>
                )}
            </View>

            {/* Fulfilment + jurisdiction summaries */}
            {(contract.fulfilment || contract.jurisdiction) && (
                <>
                    <Text style={styles.h2}>Terms</Text>
                    <View style={styles.section}>
                        {contract.fulfilment && (
                            <View style={styles.metadataRow}>
                                <Text style={styles.metadataKey}>fulfilment</Text>
                                <Text style={[styles.metadataValue, styles.mono]}>{contract.fulfilment.method}</Text>
                            </View>
                        )}
                        {contract.jurisdiction && (
                            <>
                                <View style={styles.metadataRow}>
                                    <Text style={styles.metadataKey}>applicable law</Text>
                                    <Text style={styles.metadataValue}>{contract.jurisdiction.applicableLaw}</Text>
                                </View>
                                {contract.jurisdiction.forum && (
                                    <View style={styles.metadataRow}>
                                        <Text style={styles.metadataKey}>forum</Text>
                                        <Text style={styles.metadataValue}>{contract.jurisdiction.forum}</Text>
                                    </View>
                                )}
                                {contract.jurisdiction.language && (
                                    <View style={styles.metadataRow}>
                                        <Text style={styles.metadataKey}>language</Text>
                                        <Text style={styles.metadataValue}>{contract.jurisdiction.language}</Text>
                                    </View>
                                )}
                            </>
                        )}
                    </View>
                </>
            )}

            {/* Clauses table */}
            <Text style={styles.h2}>Clauses ({contract.clauses.length})</Text>
            <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                    <Text style={[styles.tCell, { flex: 2 }]}>Schema</Text>
                    <Text style={[styles.tCell, { flex: 3 }]}>Title</Text>
                    <Text style={[styles.tCellMono, { flex: 4 }]}>Leaf hash</Text>
                </View>
                {contract.clauses.map((clause) => (
                    <View key={clause.schemaKey} style={styles.tableRow}>
                        <Text style={[styles.tCellMono, { flex: 2 }]}>
                            {clause.schemaKey}
                            {clause.sealed ? " 🔒" : ""}
                        </Text>
                        <Text style={[styles.tCell, { flex: 3 }]}>
                            {clause.sealed ? `${clause.title} — sealed` : clause.title}
                        </Text>
                        <Text style={[styles.tCellMono, { flex: 4 }]}>{shortHex(clause.leafHash, 14, 10)}</Text>
                    </View>
                ))}
            </View>
            <Text style={styles.note}>
                Each clause leaf hash is a node in the merkle tree under
                agreementHash. Reader recomputes via computeSectionLeaf and
                verifies inclusion.
            </Text>
            <PageFooter agreementHash={contract.agreementHash} processId={contract.processId} />
        </Page>
    );
}

// ── Invoice page ────────────────────────────────────────────────────────────

function InvoicePage({ invoice }: { invoice: AuditBundle["invoice"] }) {
    const totalLineValue = invoice.lineItems.reduce(
        (acc, li) => acc + Number(li.quantity) * Number(li.unitPrice),
        0,
    );
    return (
        <Page size="A4" style={styles.page}>
            <View style={styles.header}>
                <Text style={styles.label}>Invoice</Text>
                <Text style={styles.h1}>{invoice.title}</Text>
            </View>
            <View style={styles.section}>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>invoice no.</Text>
                    <Text style={[styles.metadataValue, styles.mono]}>{shortHex(invoice.invoiceNumber, 14, 8)}</Text>
                </View>
                {invoice.issuedAtBlock !== undefined && (
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>issued at block</Text>
                        <Text style={styles.metadataValue}>{invoice.issuedAtBlock}</Text>
                    </View>
                )}
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>bill from (seller)</Text>
                    <Text style={[styles.metadataValue, styles.mono]}>{invoice.billFrom}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>bill to (buyer)</Text>
                    <Text style={[styles.metadataValue, styles.mono]}>{invoice.billTo}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>currency</Text>
                    <Text style={[styles.metadataValue, styles.mono]}>{invoice.currency}</Text>
                </View>
            </View>

            <Text style={styles.h2}>
                Line items {invoice.lineItemsSealed ? "🔒 sealed" : `(${invoice.lineItems.length})`}
            </Text>
            <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                    <Text style={[styles.tCell, { flex: 2 }]}>Item id</Text>
                    <Text style={[styles.tCell, { flex: 4 }]}>Name</Text>
                    <Text style={[styles.tCellRight, { flex: 1 }]}>Qty</Text>
                    <Text style={[styles.tCellRight, { flex: 2 }]}>Unit price</Text>
                    <Text style={[styles.tCellRight, { flex: 2 }]}>Line total</Text>
                </View>
                {invoice.lineItemsSealed ? (
                    <View style={styles.tableRow}>
                        <Text style={[styles.tCell, { flex: 11 }]}>
                            🔒 Line items sealed. The commerce clause was redacted in
                            this distribution; cleartext is held by buyer + seller and
                            can be revealed selectively. The total below is preserved
                            (recorded on chain at commit, independent of redaction).
                        </Text>
                    </View>
                ) : invoice.lineItems.length === 0 ? (
                    <View style={styles.tableRow}>
                        <Text style={[styles.tCell, { flex: 11 }]}>
                            No line items in the agreement&apos;s commerce clause.
                        </Text>
                    </View>
                ) : (
                    invoice.lineItems.map((li) => {
                        const lineTotal = Number(li.quantity) * Number(li.unitPrice);
                        return (
                            <View key={li.itemId} style={styles.tableRow}>
                                <Text style={[styles.tCellMono, { flex: 2 }]}>{li.itemId}</Text>
                                <Text style={[styles.tCell, { flex: 4 }]}>{li.name}</Text>
                                <Text style={[styles.tCellRight, { flex: 1 }]}>{li.quantity}</Text>
                                <Text style={[styles.tCellRight, { flex: 2 }]}>{li.unitPrice}</Text>
                                <Text style={[styles.tCellRight, { flex: 2 }]}>{lineTotal}</Text>
                            </View>
                        );
                    })
                )}
            </View>

            <View style={styles.section}>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>line-items sum</Text>
                    <Text style={styles.metadataValue}>{totalLineValue}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>total (P, smallest units)</Text>
                    <Text style={[styles.metadataValue, { fontWeight: 700 }]}>{invoice.total.toString()}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>total (18-decimal display)</Text>
                    <Text style={styles.metadataValue}>{fmt(invoice.total)}</Text>
                </View>
            </View>
            <Text style={styles.note}>
                The line-items sum is the unit-price arithmetic from the
                agreement; total (P) is the kernel-recorded payment that
                anchors against on-chain transfers. Reconcile by inspection.
            </Text>
            <PageFooter agreementHash={invoice.agreementHash} processId={invoice.processId} />
        </Page>
    );
}

// ── Bill of Lading page ─────────────────────────────────────────────────────

function BillOfLadingPage({ bol }: { bol: BillOfLadingDocument }) {
    return (
        <Page size="A4" style={styles.page}>
            <View style={styles.header}>
                <Text style={styles.label}>Bill of Lading</Text>
                <Text style={styles.h1}>{bol.title}</Text>
            </View>
            <View style={styles.section}>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>BoL no.</Text>
                    <Text style={[styles.metadataValue, styles.mono]}>{shortHex(bol.bolNumber, 14, 8)}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>consignor</Text>
                    <Text style={[styles.metadataValue, styles.mono]}>{bol.consignor}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>consignee</Text>
                    <Text style={[styles.metadataValue, styles.mono]}>{bol.consignee}</Text>
                </View>
                {bol.handoffMode && (
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>handoff mode</Text>
                        <Text style={[styles.metadataValue, styles.mono]}>{bol.handoffMode}</Text>
                    </View>
                )}
                {bol.originGeohash && (
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>origin geohash</Text>
                        <Text style={[styles.metadataValue, styles.mono]}>{bol.originGeohash}</Text>
                    </View>
                )}
                {bol.destinationGeohash && (
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>destination geohash</Text>
                        <Text style={[styles.metadataValue, styles.mono]}>{bol.destinationGeohash}</Text>
                    </View>
                )}
            </View>

            <Text style={styles.h2}>Lifecycle stages</Text>
            <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                    <Text style={[styles.tCell, { flex: 0.6 }]}>#</Text>
                    <Text style={[styles.tCell, { flex: 2.5 }]}>Stage</Text>
                    <Text style={[styles.tCell, { flex: 1.2 }]}>Status</Text>
                    <Text style={[styles.tCellMono, { flex: 2.5 }]}>Attester</Text>
                    <Text style={[styles.tCellMono, { flex: 2.5 }]}>contentRef</Text>
                    <Text style={[styles.tCell, { flex: 1 }]}>Block</Text>
                </View>
                {bol.stages.map((stage) => (
                    <View key={stage.stageId} style={styles.tableRow}>
                        <Text style={[styles.tCell, { flex: 0.6 }]}>{stage.stageId}</Text>
                        <Text style={[styles.tCell, { flex: 2.5 }]}>{stage.stageName}</Text>
                        <Text style={[styles.tCell, { flex: 1.2 }, stage.attested ? styles.badgeOk : styles.badgeBad]}>
                            {stage.attested ? "Attested" : "Pending"}
                        </Text>
                        <Text style={[styles.tCellMono, { flex: 2.5 }]}>
                            {stage.attester ? shortAddr(stage.attester) : "—"}
                        </Text>
                        <Text style={[styles.tCellMono, { flex: 2.5 }]}>
                            {stage.contentRef ? shortHex(stage.contentRef, 10, 6) : "—"}
                        </Text>
                        <Text style={[styles.tCell, { flex: 1 }]}>
                            {stage.attestedAtBlock ?? "—"}
                        </Text>
                    </View>
                ))}
            </View>
            <Text style={styles.note}>
                Each contentRef = keccak256(content). Original evidenceUri (if
                any) recoverable from the transaction calldata.
            </Text>
            <PageFooter agreementHash={bol.agreementHash} processId={bol.processId} />
        </Page>
    );
}

// ── Emissions page ──────────────────────────────────────────────────────────

function EmissionsPage({ doc }: { doc: AuditBundle["emissions"] }) {
    return (
        <Page size="A4" style={styles.page}>
            <View style={styles.header}>
                <Text style={styles.label}>Emissions</Text>
                <Text style={styles.h1}>{doc.title}</Text>
            </View>
            <View style={styles.section}>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>orderHash</Text>
                    <Text style={[styles.metadataValue, styles.mono]}>{doc.orderHash}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>committed?</Text>
                    <Text style={[styles.metadataValue, doc.disclosed ? styles.badgeOk : styles.badgeBad]}>
                        {doc.disclosed ? "Yes — GHG framework declared at signing" : "No — order signed without a GHG clause"}
                    </Text>
                </View>
                {doc.standardLabel && (
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>accounting standard</Text>
                        <Text style={styles.metadataValue}>{doc.standardLabel}</Text>
                    </View>
                )}
                {doc.standardSchemaKey && (
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>schemaId</Text>
                        <Text style={[styles.metadataValue, styles.mono]}>{doc.standardSchemaKey}</Text>
                    </View>
                )}
                {doc.scope !== undefined && (
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>scope</Text>
                        <Text style={styles.metadataValue}>
                            {doc.scope === 0 ? "Unset" : `Scope ${doc.scope}`}
                        </Text>
                    </View>
                )}
            </View>

            <Text style={styles.h2}>Runtime measurements ({doc.measurements.length})</Text>
            {doc.measurements.length === 0 ? (
                <Text style={styles.sectionBody}>
                    No runtime grams attestations recorded against this order.
                </Text>
            ) : (
                <View style={styles.table}>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                        <Text style={[styles.tCell, { flex: 0.8 }]}>Stage</Text>
                        <Text style={[styles.tCellMono, { flex: 3 }]}>Attester</Text>
                        <Text style={[styles.tCellMono, { flex: 4 }]}>contentRef</Text>
                        <Text style={[styles.tCell, { flex: 1 }]}>Block</Text>
                    </View>
                    {doc.measurements.map((m, i) => (
                        <View key={`${m.contentRef}-${i}`} style={styles.tableRow}>
                            <Text style={[styles.tCell, { flex: 0.8 }]}>{m.stage}</Text>
                            <Text style={[styles.tCellMono, { flex: 3 }]}>{shortAddr(m.attester)}</Text>
                            <Text style={[styles.tCellMono, { flex: 4 }]}>{shortHex(m.contentRef, 14, 8)}</Text>
                            <Text style={[styles.tCell, { flex: 1 }]}>{m.blockNumber}</Text>
                        </View>
                    ))}
                </View>
            )}
            <Text style={styles.note}>
                Each contentRef = keccak256(`(uint256 grams)`). Original
                grams value recoverable from the transaction calldata.
                Standard identity lives in the schemaId — there is one sister
                schema per accounting framework.
            </Text>
            <PageFooter agreementHash={doc.agreementHash} processId={doc.processId} />
        </Page>
    );
}

// ── Proximity page ──────────────────────────────────────────────────────────

function ProximityPage({ doc }: { doc: AuditBundle["proximity"] }) {
    return (
        <Page size="A4" style={styles.page}>
            <View style={styles.header}>
                <Text style={styles.label}>Proximity</Text>
                <Text style={styles.h1}>{doc.title}</Text>
            </View>
            <View style={styles.section}>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>orderHash</Text>
                    <Text style={[styles.metadataValue, styles.mono]}>{doc.orderHash}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>policy committed?</Text>
                    <Text style={[styles.metadataValue, doc.policyCommitted ? styles.badgeOk : styles.badgeBad]}>
                        {doc.policyCommitted ? "Yes — band declared at signing" : "No — no policy clause signed"}
                    </Text>
                </View>
                {doc.committedBand !== undefined && (
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>committed band</Text>
                        <Text style={styles.metadataValue}>
                            {doc.committedBand === 0 ? "Unset" : `Band ${doc.committedBand}`}
                        </Text>
                    </View>
                )}
            </View>

            <Text style={styles.h2}>Runtime proofs ({doc.proofs.length})</Text>
            {doc.proofs.length === 0 ? (
                <Text style={styles.sectionBody}>
                    No proximity-proof attestations recorded against this order.
                </Text>
            ) : (
                <View style={styles.table}>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                        <Text style={[styles.tCell, { flex: 0.8 }]}>Stage</Text>
                        <Text style={[styles.tCellMono, { flex: 3 }]}>Attester</Text>
                        <Text style={[styles.tCellMono, { flex: 4 }]}>contentRef</Text>
                        <Text style={[styles.tCell, { flex: 1 }]}>Block</Text>
                    </View>
                    {doc.proofs.map((p, i) => (
                        <View key={`${p.contentRef}-${i}`} style={styles.tableRow}>
                            <Text style={[styles.tCell, { flex: 0.8 }]}>{p.stage}</Text>
                            <Text style={[styles.tCellMono, { flex: 3 }]}>{shortAddr(p.attester)}</Text>
                            <Text style={[styles.tCellMono, { flex: 4 }]}>{shortHex(p.contentRef, 14, 8)}</Text>
                            <Text style={[styles.tCell, { flex: 1 }]}>{p.blockNumber}</Text>
                        </View>
                    ))}
                </View>
            )}
            <Text style={styles.note}>
                Each contentRef = keccak256(`(uint8 band, bytes32 nonce, bytes
                witness)`). Off-chain consumers verify proof.band ===
                committedBand when both are present.
            </Text>
            <PageFooter agreementHash={doc.agreementHash} processId={doc.processId} />
        </Page>
    );
}

// ── Sovereign process-logs page ─────────────────────────────────────────────

function ProcessLogsPage({ doc }: { doc: AuditBundle["processLogs"] }) {
    const total = doc.merchantEvents.length + doc.courierEvents.length;
    return (
        <Page size="A4" style={styles.page}>
            <View style={styles.header}>
                <Text style={styles.label}>Process logs</Text>
                <Text style={styles.h1}>{doc.title}</Text>
            </View>
            <View style={styles.section}>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>orderHash</Text>
                    <Text style={[styles.metadataValue, styles.mono]}>{doc.orderHash}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>events recorded</Text>
                    <Text style={styles.metadataValue}>
                        {total} ({doc.merchantEvents.length} merchant + {doc.courierEvents.length} courier)
                    </Text>
                </View>
            </View>
            <Text style={styles.note}>
                Sovereign event logs from off-chain operators. Per CLAUDE.md, the
                buyer&apos;s actions are the kernel events (commit / resolveProcess);
                merchants and couriers record theirs via these per-role process
                schemas to make their physical-world state changes tamper-proof.
                Each contentRef = keccak256(`(uint8 eventType, string evidenceUri)`);
                eventType is an index into the role-specific event enum.
            </Text>

            {doc.merchantEvents.length > 0 && (
                <>
                    <Text style={styles.h2}>Merchant events ({doc.merchantEvents.length})</Text>
                    <View style={styles.table}>
                        <View style={[styles.tableRow, styles.tableHeader]}>
                            <Text style={[styles.tCell, { flex: 0.8 }]}>Stage</Text>
                            <Text style={[styles.tCellMono, { flex: 3 }]}>Attester</Text>
                            <Text style={[styles.tCellMono, { flex: 4 }]}>contentRef</Text>
                            <Text style={[styles.tCell, { flex: 1 }]}>Block</Text>
                        </View>
                        {doc.merchantEvents.map((e, i) => (
                            <View key={`m-${e.contentRef}-${i}`} style={styles.tableRow}>
                                <Text style={[styles.tCell, { flex: 0.8 }]}>{e.stage}</Text>
                                <Text style={[styles.tCellMono, { flex: 3 }]}>{shortAddr(e.attester)}</Text>
                                <Text style={[styles.tCellMono, { flex: 4 }]}>{shortHex(e.contentRef, 14, 8)}</Text>
                                <Text style={[styles.tCell, { flex: 1 }]}>{e.blockNumber}</Text>
                            </View>
                        ))}
                    </View>
                </>
            )}

            {doc.courierEvents.length > 0 && (
                <>
                    <Text style={styles.h2}>Courier events ({doc.courierEvents.length})</Text>
                    <View style={styles.table}>
                        <View style={[styles.tableRow, styles.tableHeader]}>
                            <Text style={[styles.tCell, { flex: 0.8 }]}>Stage</Text>
                            <Text style={[styles.tCellMono, { flex: 3 }]}>Attester</Text>
                            <Text style={[styles.tCellMono, { flex: 4 }]}>contentRef</Text>
                            <Text style={[styles.tCell, { flex: 1 }]}>Block</Text>
                        </View>
                        {doc.courierEvents.map((e, i) => (
                            <View key={`c-${e.contentRef}-${i}`} style={styles.tableRow}>
                                <Text style={[styles.tCell, { flex: 0.8 }]}>{e.stage}</Text>
                                <Text style={[styles.tCellMono, { flex: 3 }]}>{shortAddr(e.attester)}</Text>
                                <Text style={[styles.tCellMono, { flex: 4 }]}>{shortHex(e.contentRef, 14, 8)}</Text>
                                <Text style={[styles.tCell, { flex: 1 }]}>{e.blockNumber}</Text>
                            </View>
                        ))}
                    </View>
                </>
            )}

            {total === 0 && (
                <Text style={styles.sectionBody}>
                    No sovereign process events attested for this order.
                </Text>
            )}
            <PageFooter agreementHash={doc.agreementHash} processId={doc.processId} />
        </Page>
    );
}

// ── Dutch auction page ──────────────────────────────────────────────────────

function DutchAuctionPage({ doc }: { doc: AuditBundle["dutchAuction"] }) {
    return (
        <Page size="A4" style={styles.page}>
            <View style={styles.header}>
                <Text style={styles.label}>Dutch auction trail</Text>
                <Text style={styles.h1}>{doc.title}</Text>
            </View>
            <View style={styles.section}>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>orderHash</Text>
                    <Text style={[styles.metadataValue, styles.mono]}>{doc.orderHash}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>buyer</Text>
                    <Text style={[styles.metadataValue, styles.mono]}>{doc.buyer}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>seller (provider)</Text>
                    <Text style={[styles.metadataValue, styles.mono]}>{doc.seller}</Text>
                </View>
            </View>

            {!doc.auctionApplicable ? (
                <Text style={styles.sectionBody}>
                    This order&apos;s fulfilment method is not Dutch auction —
                    no auction trail applies.
                </Text>
            ) : !doc.auctionId ? (
                <Text style={[styles.sectionBody, styles.badgeBad]}>
                    Fulfilment method indicates Dutch-auction pricing, but the
                    matching AuctionClaimed event was not located. Investigate
                    — the price-discovery trail is missing from the bundle.
                </Text>
            ) : (
                <>
                    <Text style={styles.h2}>Price discovery</Text>
                    <View style={styles.section}>
                        <View style={styles.metadataRow}>
                            <Text style={styles.metadataKey}>auctionId</Text>
                            <Text style={[styles.metadataValue, styles.mono]}>{doc.auctionId}</Text>
                        </View>
                        {doc.creator && (
                            <View style={styles.metadataRow}>
                                <Text style={styles.metadataKey}>creator</Text>
                                <Text style={[styles.metadataValue, styles.mono]}>{doc.creator}</Text>
                            </View>
                        )}
                        {doc.maxPrice !== undefined && (
                            <View style={styles.metadataRow}>
                                <Text style={styles.metadataKey}>maxPrice</Text>
                                <Text style={styles.metadataValue}>{fmt(doc.maxPrice)}</Text>
                            </View>
                        )}
                        {doc.startBlock !== undefined && (
                            <View style={styles.metadataRow}>
                                <Text style={styles.metadataKey}>opened at block</Text>
                                <Text style={styles.metadataValue}>{doc.startBlock}</Text>
                            </View>
                        )}
                        {doc.clearingPrice !== undefined && (
                            <View style={styles.metadataRow}>
                                <Text style={styles.metadataKey}>clearingPrice</Text>
                                <Text style={[styles.metadataValue, { fontWeight: 700 }]}>{fmt(doc.clearingPrice)}</Text>
                            </View>
                        )}
                        {doc.claimedAtBlock !== undefined && (
                            <View style={styles.metadataRow}>
                                <Text style={styles.metadataKey}>claimed at block</Text>
                                <Text style={styles.metadataValue}>{doc.claimedAtBlock}</Text>
                            </View>
                        )}
                        {doc.blocksToClaim !== undefined && (
                            <View style={styles.metadataRow}>
                                <Text style={styles.metadataKey}>blocks to claim</Text>
                                <Text style={styles.metadataValue}>{doc.blocksToClaim}</Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.note}>
                        The auction&apos;s clearingPrice equals the order&apos;s
                        committed payment (P) — the auction&apos;s output IS the
                        order&apos;s price. Latency from open to claim measures
                        the price-discovery footprint.
                    </Text>
                </>
            )}
            <PageFooter agreementHash={doc.agreementHash} processId={doc.processId} />
        </Page>
    );
}

// ── Operator registry page ──────────────────────────────────────────────────

function OperatorRegistryPage({ doc }: { doc: AuditBundle["operatorRegistry"] }) {
    return (
        <Page size="A4" style={styles.page}>
            <View style={styles.header}>
                <Text style={styles.label}>Operator registry</Text>
                <Text style={styles.h1}>{doc.title}</Text>
            </View>
            <View style={styles.section}>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>orderHash</Text>
                    <Text style={[styles.metadataValue, styles.mono]}>{doc.orderHash}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>seller</Text>
                    <Text style={[styles.metadataValue, styles.mono]}>{doc.seller}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>registered?</Text>
                    <Text style={[styles.metadataValue, doc.registered ? styles.badgeOk : styles.badgeBad]}>
                        {doc.registered ? "Yes" : "NOT REGISTERED"}
                    </Text>
                </View>
                {doc.registered && doc.metadataURI && (
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>metadataURI</Text>
                        <Text style={[styles.metadataValue, styles.mono]}>{doc.metadataURI}</Text>
                    </View>
                )}
                {doc.registered && doc.registeredAtBlock !== undefined && (
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>registered at block</Text>
                        <Text style={styles.metadataValue}>{doc.registeredAtBlock}</Text>
                    </View>
                )}
            </View>
            {doc.notice && (
                <Text style={[styles.sectionBody, styles.badgeBad]}>{doc.notice}</Text>
            )}
            <Text style={styles.note}>
                The Figaro kernel does not enforce seller registration —
                OperatorRegistry is advisory off-chain metadata. Every
                legitimate seller is expected to register (runtime convention);
                an unregistered seller is itself an audit-significant flag.
            </Text>
            <PageFooter agreementHash={doc.agreementHash} processId={doc.processId} />
        </Page>
    );
}

// ── Financials page ─────────────────────────────────────────────────────────

function FinancialsPage({ model }: { model: FinancialsModel }) {
    return (
        <Page size="A4" style={styles.page}>
            <View style={styles.header}>
                <Text style={styles.label}>Financials</Text>
                <Text style={styles.h1}>Process consolidated statement</Text>
            </View>
            <Text style={styles.note}>
                Cash-basis projection of on-chain commit + resolve events. Bond
                deposits = assets; refund obligations = liabilities; payment =
                retained earnings. Identity assets = liabilities + retained
                earnings holds at every block by construction (Paper G §5.1).
                Amounts in 18-decimal display units.
            </Text>

            {model.currencies.length === 0 ? (
                <Text style={styles.sectionBody}>No orders found for this process.</Text>
            ) : (
                model.currencies.map((currency) => (
                    <CurrencyBlock key={currency} currency={currency} model={model} />
                ))
            )}
            <PageFooter processId={model.scopeId} />
        </Page>
    );
}

function CurrencyBlock({ currency, model }: { currency: string; model: FinancialsModel }) {
    const bs = model.balanceSheet[currency];
    const ist = model.incomeStatement[currency];
    const lineItems = model.lineItems.filter((li) => li.currency === currency);
    const identityHolds = bs.buyerCustody + bs.sellerCustody === bs.refundOwedToBuyer + bs.refundOwedToSeller + bs.retainedEarnings;
    return (
        <View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10, marginBottom: 4 }}>
                <Text style={styles.h2}>Currency {shortAddr(currency)}</Text>
                <Text style={[styles.badge, identityHolds ? styles.badgeOk : styles.badgeBad]}>
                    {identityHolds ? "books reconcile" : "books DRIFT"}
                </Text>
            </View>

            <BalanceSheetBlock entry={bs} />
            <IncomeStatementBlock sales={ist.sales} cost={ist.cost} netIncome={ist.netIncome} />
            <LineItemsTable items={lineItems} />
        </View>
    );
}

function BalanceSheetBlock({ entry }: { entry: BalanceSheetEntry }) {
    return (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>Balance sheet</Text>
            <Row label="Asset: buyer deposit (custody)" amount={entry.buyerCustody} />
            <Row label="Asset: seller deposit (custody)" amount={entry.sellerCustody} />
            <Row label="Total assets" amount={entry.buyerCustody + entry.sellerCustody} bold />
            <Row label="Liability: refund owed to buyer" amount={entry.refundOwedToBuyer} />
            <Row label="Liability: refund owed to seller" amount={entry.refundOwedToSeller} />
            <Row label="Total liabilities" amount={entry.refundOwedToBuyer + entry.refundOwedToSeller} bold />
            <Row label="Retained earnings (payment in custody)" amount={entry.retainedEarnings} bold />
        </View>
    );
}

function IncomeStatementBlock({ sales, cost, netIncome }: {
    sales: bigint; cost: bigint; netIncome: bigint;
}) {
    return (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>Income statement</Text>
            <Row label="Sales (commit-time)" amount={sales} />
            <Row label="Cost (resolve-time)" amount={cost} />
            <Row label="Net income" amount={netIncome} bold />
        </View>
    );
}

function LineItemsTable({ items }: { items: OrderLineItem[] }) {
    return (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>Line items ({items.length})</Text>
            <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                    <Text style={[styles.tCellMono, { flex: 2 }]}>Order</Text>
                    <Text style={[styles.tCellMono, { flex: 2 }]}>Seller</Text>
                    <Text style={[styles.tCellRight, { flex: 1.2 }]}>Payment</Text>
                    <Text style={[styles.tCellRight, { flex: 1.2 }]}>Cumulative</Text>
                    <Text style={[styles.tCellRight, { flex: 1 }]}>Sales</Text>
                    <Text style={[styles.tCellRight, { flex: 1 }]}>Cost</Text>
                    <Text style={[styles.tCell, { flex: 1 }]}>State</Text>
                </View>
                {items.map((li) => (
                    <View key={li.orderId} style={styles.tableRow}>
                        <Text style={[styles.tCellMono, { flex: 2 }]}>{shortHex(li.orderId, 8, 4)}</Text>
                        <Text style={[styles.tCellMono, { flex: 2 }]}>{shortAddr(li.seller)}</Text>
                        <Text style={[styles.tCellRight, { flex: 1.2 }]}>{fmt(li.payment)}</Text>
                        <Text style={[styles.tCellRight, { flex: 1.2 }]}>{fmt(li.cumulativeValue)}</Text>
                        <Text style={[styles.tCellRight, { flex: 1 }]}>{fmt(li.salesContribution)}</Text>
                        <Text style={[styles.tCellRight, { flex: 1 }]}>{fmt(li.costContribution)}</Text>
                        <Text style={[styles.tCell, { flex: 1 }, li.state === OrderState.Active ? styles.badgeBad : styles.badgeOk]}>
                            {li.state === OrderState.Active ? "Active" : "Resolved"}
                        </Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

function Row({ label, amount, bold }: { label: string; amount: bigint; bold?: boolean }) {
    return (
        <View style={styles.metadataRow}>
            <Text style={[styles.metadataKey, { flex: 2 }, bold ? { fontWeight: 700, color: "#111111" } : {}]}>
                {label}
            </Text>
            <Text style={[styles.metadataValue, { textAlign: "right", fontFamily: "Courier" }, bold ? { fontWeight: 700 } : {}]}>
                {fmt(amount)}
            </Text>
        </View>
    );
}

// ── Timeline page ───────────────────────────────────────────────────────────

function shortDetails(ev: TimelineEvent): string {
    const parts: string[] = [];
    if (ev.eventName === "OrderCommitted") {
        if (ev.details.payment) parts.push(`P=${ev.details.payment}`);
        if (ev.details.seller) parts.push(`seller ${shortAddr(ev.details.seller)}`);
    } else if (ev.eventName === "OrderResolved") {
        if (ev.details.sellerPayout) parts.push(`seller +${ev.details.sellerPayout}`);
        if (ev.details.buyerPayout) parts.push(`buyer +${ev.details.buyerPayout}`);
    } else {
        for (const [k, v] of Object.entries(ev.details)) {
            if (!v) continue;
            const display = v.length > 24 ? shortHex(v, 8, 4) : v;
            parts.push(`${k}=${display}`);
        }
    }
    return parts.join(" · ");
}

function TimelinePage({ timeline }: { timeline: ProcessTimeline }) {
    const { events, summary, participants } = timeline;
    return (
        <Page size="A4" style={styles.page}>
            <View style={styles.header}>
                <Text style={styles.label}>Process timeline</Text>
                <Text style={styles.h1}>FigaroCore lifecycle events</Text>
            </View>
            <Text style={styles.note}>
                Chronological reconstruction of all FigaroCore events scoped to
                this processId, plus coordinator-specific extensions where
                supplied (lifecycle signals, proximity proofs). Each row is
                anchored to a transaction hash on chain — the reader can
                verify event-by-event without protocol cooperation.
            </Text>

            <View style={styles.section}>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>chainId</Text>
                    <Text style={styles.metadataValue}>{timeline.chainId}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>core address</Text>
                    <Text style={[styles.metadataValue, styles.mono]}>{timeline.coreAddress}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>events</Text>
                    <Text style={styles.metadataValue}>
                        {events.length} total · {summary.orderCount} committed · {summary.resolvedCount} resolved
                    </Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>total payment</Text>
                    <Text style={styles.metadataValue}>{summary.totalPayment}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>seller payouts</Text>
                    <Text style={styles.metadataValue}>{summary.totalSellerPayout}</Text>
                </View>
                <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>buyer payouts</Text>
                    <Text style={styles.metadataValue}>{summary.totalBuyerPayout}</Text>
                </View>
                {participants.length > 0 && (
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>participants</Text>
                        <Text style={[styles.metadataValue, styles.mono]}>
                            {participants.map((p) => shortAddr(p)).join(", ")}
                        </Text>
                    </View>
                )}
            </View>

            <Text style={styles.h2}>Events ({events.length})</Text>
            {events.length === 0 ? (
                <Text style={styles.sectionBody}>
                    No FigaroCore events found for this processId. The process
                    may not yet exist on this chain, or the RPC may have lost
                    the historical range.
                </Text>
            ) : (
                <View style={styles.table}>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                        <Text style={[styles.tCell, { flex: 2 }]}>Timestamp (UTC)</Text>
                        <Text style={[styles.tCell, { flex: 1 }]}>Block</Text>
                        <Text style={[styles.tCell, { flex: 2 }]}>Event</Text>
                        <Text style={[styles.tCellMono, { flex: 2 }]}>Order</Text>
                        <Text style={[styles.tCell, { flex: 4 }]}>Detail</Text>
                        <Text style={[styles.tCellMono, { flex: 2 }]}>tx</Text>
                    </View>
                    {events.map((ev, idx) => (
                        <View key={`${ev.txHash}-${idx}`} style={styles.tableRow}>
                            <Text style={[styles.tCell, { flex: 2 }]}>{ev.iso}</Text>
                            <Text style={[styles.tCell, { flex: 1 }]}>{ev.blockNumber.toString()}</Text>
                            <Text style={[styles.tCell, { flex: 2 }]}>{ev.label}</Text>
                            <Text style={[styles.tCellMono, { flex: 2 }]}>
                                {ev.orderHash ? shortHex(ev.orderHash, 8, 4) : "—"}
                            </Text>
                            <Text style={[styles.tCell, { flex: 4 }]}>{shortDetails(ev)}</Text>
                            <Text style={[styles.tCellMono, { flex: 2 }]}>{shortHex(ev.txHash, 8, 4)}</Text>
                        </View>
                    ))}
                </View>
            )}
            <Text style={styles.note}>
                Generated {timeline.generatedAt}. Same data surface used by
                the in-iframe evidence-display view and previously submitted
                as standalone timeline JSON evidence prior to this bundle&apos;s
                consolidation.
            </Text>
            <PageFooter processId={timeline.processId} />
        </Page>
    );
}

// ── Hash appendix page ──────────────────────────────────────────────────────

function HashAppendixPage({ appendix }: { appendix: AuditBundle["hashAppendix"] }) {
    return (
        <Page size="A4" style={styles.page}>
            <View style={styles.header}>
                <Text style={styles.label}>Verification</Text>
                <Text style={styles.h1}>{appendix.title}</Text>
            </View>
            <Text style={styles.note}>
                Reader recomputes each hash from the cited content / location and
                verifies against chain. agreementHash = merkle root over section
                leaves. Each section leaf = computeSectionLeaf(section). Each
                attestation contentRef = keccak256(content) where content sits
                in the transaction calldata.
            </Text>
            <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                    <Text style={[styles.tCell, { flex: 1.5 }]}>Kind</Text>
                    <Text style={[styles.tCell, { flex: 3 }]}>Label</Text>
                    <Text style={[styles.tCellMono, { flex: 3 }]}>Hash</Text>
                    <Text style={[styles.tCell, { flex: 4 }]}>Source</Text>
                </View>
                {appendix.anchors.map((anchor, idx) => (
                    <View key={idx} style={styles.tableRow}>
                        <Text style={[styles.tCellMono, { flex: 1.5 }]}>{anchor.kind}</Text>
                        <Text style={[styles.tCell, { flex: 3 }]}>{anchor.label}</Text>
                        <Text style={[styles.tCellMono, { flex: 3 }]}>{shortHex(anchor.hash, 12, 8)}</Text>
                        <Text style={[styles.tCell, { flex: 4 }]}>{anchor.sourceLocation}</Text>
                    </View>
                ))}
            </View>
            <PageFooter agreementHash={appendix.agreementHash} processId={appendix.processId} />
        </Page>
    );
}

// ── Top-level Document ──────────────────────────────────────────────────────

export interface AuditBundlePdfData {
    /** Process id this bundle covers. */
    processId: string;
    /** Buyer address (root buyer of the process), if known. */
    buyer?: string;
    /** Per-order extractor outputs. One entry per order in the process. */
    perOrderBundles: AuditBundle[];
    /** Process-level financials projection (consolidated). */
    financials: FinancialsModel;
    /**
     * FigaroCore lifecycle timeline for the process. When present, the PDF
     * renders a Process Timeline page right after the cover. When omitted
     * (e.g. RPC unavailable), the bundle still renders without it.
     */
    timeline?: ProcessTimeline | null;
    /** Generation timestamp (UTC). */
    generatedAt: Date;
}

export function AuditBundlePdf({ data }: { data: AuditBundlePdfData }) {
    return (
        <Document
            title={`Audit bundle ${shortHex(data.processId, 10, 6)}`}
            author="Figaro Protocol"
            subject="Bonded commitment record"
        >
            <CoverPage processId={data.processId} buyer={data.buyer} generatedAt={data.generatedAt} />
            {data.timeline ? <TimelinePage timeline={data.timeline} /> : null}
            {data.perOrderBundles.map((bundle) => (
                <ContractPage key={`contract-${bundle.contract.orderHash}`} contract={bundle.contract} />
            ))}
            {data.perOrderBundles.map((bundle) => (
                <InvoicePage key={`invoice-${bundle.invoice.orderHash}`} invoice={bundle.invoice} />
            ))}
            {data.perOrderBundles.flatMap((bundle) =>
                bundle.billOfLading
                    ? [<BillOfLadingPage key={`bol-${bundle.billOfLading.orderHash}`} bol={bundle.billOfLading} />]
                    : []
            )}
            {data.perOrderBundles.map((bundle) => (
                <EmissionsPage key={`emissions-${bundle.emissions.orderHash}`} doc={bundle.emissions} />
            ))}
            {data.perOrderBundles.map((bundle) => (
                <ProximityPage key={`proximity-${bundle.proximity.orderHash}`} doc={bundle.proximity} />
            ))}
            {data.perOrderBundles.map((bundle) => (
                <ProcessLogsPage key={`processlogs-${bundle.processLogs.orderHash}`} doc={bundle.processLogs} />
            ))}
            {data.perOrderBundles.map((bundle) => (
                <DutchAuctionPage key={`auction-${bundle.dutchAuction.orderHash}`} doc={bundle.dutchAuction} />
            ))}
            {data.perOrderBundles.map((bundle) => (
                <OperatorRegistryPage key={`opreg-${bundle.operatorRegistry.orderHash}`} doc={bundle.operatorRegistry} />
            ))}
            <FinancialsPage model={data.financials} />
            {data.perOrderBundles.map((bundle) => (
                <HashAppendixPage key={`appendix-${bundle.hashAppendix.orderHash}`} appendix={bundle.hashAppendix} />
            ))}
        </Document>
    );
}
