/**
 * Consent-receipt PDF builder.
 *
 * Sibling of `auditBundlePdf.ts` — same lazy-loading pattern, same
 * `@react-pdf/renderer` styling primitives, same client-side render path.
 * Composes the EIP-712 typed-data message, the signature, the recovered
 * signer address, the document text, and the off-chain timestamps into a
 * single self-contained evidentiary PDF that a participant can keep
 * regardless of whether the IPFS pin survives.
 *
 * Pinning is the caller's responsibility — see
 * `app/(app)/consent/page.tsx` for the full ceremony. This module is a
 * pure renderer: in → typed data + sig + recovered address + cids; out →
 * PDF Blob.
 */

import {
    Document,
    Page,
    View,
    Text,
    Image,
    StyleSheet,
} from "@react-pdf/renderer";
import { pdf } from "@react-pdf/renderer";
import type { Hex, Address } from "viem";
import { truncateHex } from "@/lib/shared/formatHex";

// ── Styles (mirrored from pdfBundle.tsx for visual continuity) ──────────────

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
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
    },
    headerLeft: {
        flex: 1,
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
    monoSmall: {
        fontFamily: "Courier",
        fontSize: 7,
    },
    metadataRow: {
        flexDirection: "row",
        marginBottom: 2,
    },
    metadataKey: {
        width: 130,
        color: "#737373",
        fontSize: 8,
    },
    metadataValue: {
        fontSize: 8,
        flex: 1,
    },
    metadataValueMono: {
        fontFamily: "Courier",
        fontSize: 7,
        flex: 1,
        wordBreak: "break-all",
    },
    section: {
        marginBottom: 12,
    },
    docBody: {
        fontSize: 8,
        lineHeight: 1.45,
        color: "#262626",
    },
    sigBox: {
        padding: 6,
        backgroundColor: "#fafafa",
        borderTop: "0.5pt solid #d4d4d4",
        borderBottom: "0.5pt solid #d4d4d4",
        marginTop: 4,
        marginBottom: 8,
    },
    note: {
        fontSize: 7,
        color: "#737373",
        marginTop: 6,
        fontStyle: "italic",
    },
    footer: {
        position: "absolute",
        bottom: 18,
        left: 36,
        right: 36,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
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
    watermarkRight: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    watermarkQr: {
        width: 36,
        height: 36,
    },
    typedDataBlock: {
        backgroundColor: "#fafafa",
        padding: 8,
        marginTop: 4,
        marginBottom: 4,
    },
});

// ── Helpers ────────────────────────────────────────────────────────────────

function shortCode(code: string): string {
    return truncateHex(code);
}

// ── Data shape ─────────────────────────────────────────────────────────────

export interface ConsentReceiptData {
    /** EIP-712 domain that was signed — chainId, verifyingContract, name, version. */
    domain: {
        name: string;
        version: string;
        chainId: number;
        verifyingContract: Address;
    };
    /** Typed-data primary type and message that were signed. */
    typedData: {
        primaryType: "Consent";
        message: {
            documentHash: Hex;
            documentVersion: string;
            documentTitle: string;
        };
    };
    /** EIP-712 signature bytes returned by the wallet. */
    signature: Hex;
    /** Address recovered from the signature; included for clarity. */
    signer: Address;
    /** Full canonical document text — the bytes whose keccak256 = documentHash. */
    documentText: string;
    /** ISO 8601 timestamp when the user signed, captured client-side. */
    signedAt: string;
    /** ISO 8601 timestamp when this PDF was generated. */
    generatedAt: string;
    /** IPFS CID of the canonical document text (pinned alongside the receipt). */
    documentCid: string | null;
    /**
     * Beta access code that links this signer to the operator's invitation
     * record. Embedded as a watermark + as the binding identifier in the
     * receipt body. May be null in dev environments.
     */
    accessCode: string | null;
    /** Watermark QR data URL. Caller pre-generates so the renderer stays sync. */
    watermarkQrDataUrl?: string | null;
}

// ── Footer ─────────────────────────────────────────────────────────────────

function PageFooter({ documentHash, accessCode, watermarkQrDataUrl }: {
    documentHash: Hex;
    accessCode: string | null;
    watermarkQrDataUrl?: string | null;
}) {
    return (
        <View style={styles.footer} fixed>
            <View>
                <Text style={styles.footerHash}>
                    documentHash {truncateHex(documentHash, { head: 14, tail: 8 }) || "—"}
                </Text>
                <Text
                    style={styles.footerHash}
                    render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
                />
            </View>
            <View style={styles.watermarkRight}>
                {accessCode && (
                    <Text style={styles.footerHash}>{shortCode(accessCode)}</Text>
                )}
                {watermarkQrDataUrl && (
                    <Image src={watermarkQrDataUrl} style={styles.watermarkQr} />
                )}
            </View>
        </View>
    );
}

// ── Document component ─────────────────────────────────────────────────────

function ConsentReceiptPdf({ data }: { data: ConsentReceiptData }) {
    const { domain, typedData, signature, signer, documentText, signedAt,
        generatedAt, documentCid, accessCode, watermarkQrDataUrl } = data;
    const documentHash = typedData.message.documentHash;

    return (
        <Document>
            {/* Page 1 — receipt header + EIP-712 message + signature */}
            <Page size="A4" style={styles.page}>
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Text style={styles.label}>Figaro Beta</Text>
                        <Text style={styles.h1}>Consent receipt</Text>
                    </View>
                    {watermarkQrDataUrl && (
                        <View style={styles.watermarkRight}>
                            {accessCode && (
                                <Text style={styles.monoSmall}>{shortCode(accessCode)}</Text>
                            )}
                            <Image src={watermarkQrDataUrl} style={styles.watermarkQr} />
                        </View>
                    )}
                </View>

                <View style={styles.section}>
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>document</Text>
                        <Text style={styles.metadataValue}>
                            {typedData.message.documentTitle}
                        </Text>
                    </View>
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>version</Text>
                        <Text style={styles.metadataValue}>
                            {typedData.message.documentVersion}
                        </Text>
                    </View>
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>signer</Text>
                        <Text style={[styles.metadataValue, styles.mono]}>{signer}</Text>
                    </View>
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>access code</Text>
                        <Text style={[styles.metadataValue, styles.mono]}>
                            {accessCode ?? "(not provided)"}
                        </Text>
                    </View>
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>signed at</Text>
                        <Text style={styles.metadataValue}>{signedAt}</Text>
                    </View>
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>generated at</Text>
                        <Text style={styles.metadataValue}>{generatedAt}</Text>
                    </View>
                </View>

                <Text style={styles.h2}>EIP-712 domain</Text>
                <View style={styles.section}>
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>name</Text>
                        <Text style={styles.metadataValue}>{domain.name}</Text>
                    </View>
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>version</Text>
                        <Text style={styles.metadataValue}>{domain.version}</Text>
                    </View>
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>chainId</Text>
                        <Text style={styles.metadataValue}>{domain.chainId}</Text>
                    </View>
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>verifyingContract</Text>
                        <Text style={[styles.metadataValueMono]}>{domain.verifyingContract}</Text>
                    </View>
                </View>

                <Text style={styles.h2}>Signed message ({typedData.primaryType})</Text>
                <View style={styles.typedDataBlock}>
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>documentHash</Text>
                        <Text style={[styles.metadataValueMono]}>
                            {typedData.message.documentHash}
                        </Text>
                    </View>
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>documentVersion</Text>
                        <Text style={styles.metadataValue}>
                            {typedData.message.documentVersion}
                        </Text>
                    </View>
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>documentTitle</Text>
                        <Text style={styles.metadataValue}>
                            {typedData.message.documentTitle}
                        </Text>
                    </View>
                </View>

                <Text style={styles.h2}>Signature</Text>
                <View style={styles.sigBox}>
                    <Text style={styles.monoSmall}>{signature}</Text>
                </View>
                <Text style={styles.note}>
                    The signature above can be re-verified off-chain by recomputing
                    the EIP-712 digest from the domain + typed data above and
                    recovering the signer address. No on-chain transaction
                    accompanies this consent — the signature is the artifact.
                </Text>

                <Text style={styles.h2}>Pinning</Text>
                <View style={styles.section}>
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>documentCid</Text>
                        <Text style={[styles.metadataValueMono]}>
                            {documentCid ?? "(not pinned)"}
                        </Text>
                    </View>
                </View>

                <PageFooter
                    documentHash={documentHash}
                    accessCode={accessCode}
                    watermarkQrDataUrl={watermarkQrDataUrl}
                />
            </Page>

            {/* Page 2 — full document text inline so the PDF is self-contained */}
            <Page size="A4" style={styles.page}>
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Text style={styles.label}>Document text</Text>
                        <Text style={styles.h1}>{typedData.message.documentTitle}</Text>
                    </View>
                </View>
                <View style={styles.section}>
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>version</Text>
                        <Text style={styles.metadataValue}>
                            {typedData.message.documentVersion}
                        </Text>
                    </View>
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataKey}>keccak256</Text>
                        <Text style={[styles.metadataValueMono]}>{documentHash}</Text>
                    </View>
                </View>
                <Text style={styles.docBody}>{documentText}</Text>
                <PageFooter
                    documentHash={documentHash}
                    accessCode={accessCode}
                    watermarkQrDataUrl={watermarkQrDataUrl}
                />
            </Page>
        </Document>
    );
}

/**
 * Render the consent-receipt PDF and return a Blob ready to download / pin.
 *
 * The wrapping module also lazy-loads `@react-pdf/renderer`, but since this
 * file is itself imported lazily by `consent/page.tsx` (via `await import`),
 * the renderer cost only lands when the user actually signs.
 */
export async function buildConsentReceiptPdfBlob(
    data: ConsentReceiptData,
): Promise<Blob> {
    const doc = ConsentReceiptPdf({ data });
    return pdf(doc).toBlob();
}
