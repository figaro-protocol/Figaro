"use client";

/**
 * /consent — Figaro Beta consent ceremony.
 *
 * Three states:
 *   1. pre-connect — show the document text + watermark + connect prompt.
 *   2. pre-sign    — wallet connected, show document + sign button.
 *      Clicking triggers EIP-712 typed-data signing. NO on-chain
 *      transaction.
 *   3. post-sign   — confirmation: PDF download + IPFS CIDs (document +
 *      receipt) + "Continue to app" button. Sets `figaro-consent-complete`
 *      flag and redirects to `/terminal`.
 *
 * The signature is the artifact. The Figaro consent schema (`figaro-consent-v1`)
 * defines the typed-data shape the protocol uses for any future flow that
 * wants consent as a clause inside a bonded commitment; the beta ceremony
 * here exercises only the typed-data primitive — no `commit`, no
 * `attestAsBuyer`, no kernel state mutation.
 *
 * Field order in the `Consent` type below MUST match
 * `encodeConsentContent` in `sdk/src/schemas/encode.ts` exactly:
 *   [bytes32 documentHash, string documentVersion, string documentTitle].
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    useAccount,
    useChainId,
    useSignTypedData,
} from "wagmi";
import { recoverTypedDataAddress, type Address, type Hex } from "viem";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
    CONSENT_DOCUMENT_TEXT,
    CONSENT_DOCUMENT_HASH,
    CONSENT_DOCUMENT_VERSION,
    CONSENT_DOCUMENT_TITLE,
} from "@/lib/shared/consentDocument";
import { CONTRACTS } from "@/lib/core/contracts";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import { readAccessCode } from "@/components/shared/Watermark";
import { ConsentOnboardingModal } from "@/components/core/ConsentOnboardingModal";

const CONSENT_DOMAIN_NAME = "Figaro Beta Consent";
const CONSENT_DOMAIN_VERSION = "1";
const CONSENT_COMPLETE_KEY = "figaro-consent-complete";

const CONSENT_TYPES = {
    Consent: [
        { name: "documentHash", type: "bytes32" },
        { name: "documentVersion", type: "string" },
        { name: "documentTitle", type: "string" },
    ],
} as const;

type Stage = "pre-connect" | "pre-sign" | "signing" | "pinning" | "post-sign";

interface SignedReceipt {
    signature: Hex;
    signer: Address;
    signedAt: string;
    documentCid: string | null;
    receiptCid: string | null;
    pdfBlob: Blob;
}

function shortAddr(addr: string | undefined): string {
    if (!addr) return "—";
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

async function pinDocumentText(): Promise<string | null> {
    try {
        // Pin the canonical document as text. Future flows that want to
        // resolve the document by CID get the same bytes whose keccak256 =
        // CONSENT_DOCUMENT_HASH.
        const blob = new Blob([CONSENT_DOCUMENT_TEXT], { type: "text/plain" });
        return await DEFAULT_IPFS_SERVICE.pinBlob(blob);
    } catch {
        return null;
    }
}

async function pinReceipt(blob: Blob): Promise<string | null> {
    try {
        return await DEFAULT_IPFS_SERVICE.pinBlob(blob);
    } catch {
        return null;
    }
}

async function buildPdf(args: {
    domain: { name: string; version: string; chainId: number; verifyingContract: Address };
    signature: Hex;
    signer: Address;
    signedAt: string;
    documentCid: string | null;
    accessCode: string | null;
}): Promise<Blob> {
    // Lazy-load the PDF renderer + the `qrcode` watermark generator only
    // when the user actually signs. Both are heavy; pre-loading them on
    // first paint of `/consent` would defeat the bundle-size discipline
    // already practiced in `auditBundlePdf.ts`.
    const [{ buildConsentReceiptPdfBlob }, qrModule] = await Promise.all([
        import("@/lib/audit/consentReceiptPdf"),
        args.accessCode ? import("qrcode") : Promise.resolve(null),
    ]);

    let watermarkQr: string | null = null;
    if (qrModule && args.accessCode) {
        try {
            watermarkQr = await qrModule.toDataURL(args.accessCode, {
                width: 56,
                margin: 1,
                errorCorrectionLevel: "M",
                color: { dark: "#000000", light: "#ffffff" },
            });
        } catch {
            watermarkQr = null;
        }
    }

    return buildConsentReceiptPdfBlob({
        domain: args.domain,
        typedData: {
            primaryType: "Consent",
            message: {
                documentHash: CONSENT_DOCUMENT_HASH,
                documentVersion: CONSENT_DOCUMENT_VERSION,
                documentTitle: CONSENT_DOCUMENT_TITLE,
            },
        },
        signature: args.signature,
        signer: args.signer,
        documentText: CONSENT_DOCUMENT_TEXT,
        signedAt: args.signedAt,
        generatedAt: new Date().toISOString(),
        documentCid: args.documentCid,
        accessCode: args.accessCode,
        watermarkQrDataUrl: watermarkQr,
    });
}

export default function ConsentPage() {
    const router = useRouter();
    const { address, isConnected } = useAccount();
    const chainId = useChainId();
    const { signTypedDataAsync } = useSignTypedData();

    const [stage, setStage] = useState<Stage>("pre-connect");
    const [error, setError] = useState<string | null>(null);
    const [receipt, setReceipt] = useState<SignedReceipt | null>(null);
    const [showOnboarding, setShowOnboarding] = useState(false);

    // Drive stage transitions from connection state. Stay in post-sign
    // once we've signed, regardless of any subsequent connect/disconnect.
    useEffect(() => {
        setStage((prev) => {
            if (prev === "post-sign" || prev === "signing" || prev === "pinning") {
                return prev;
            }
            return isConnected && address ? "pre-sign" : "pre-connect";
        });
    }, [isConnected, address]);

    const accessCode = typeof window !== "undefined" ? readAccessCode() : null;

    const verifyingContract = (CONTRACTS.core || ("0x0000000000000000000000000000000000000000" as Address)) as Address;
    const domain = {
        name: CONSENT_DOMAIN_NAME,
        version: CONSENT_DOMAIN_VERSION,
        chainId: chainId ?? 0,
        verifyingContract,
    } as const;

    const handleSign = async () => {
        if (!address) return;
        setError(null);
        try {
            // ── Step 1: typed-data sign (no transaction) ────────────────
            setStage("signing");
            const signedAt = new Date().toISOString();
            const message = {
                documentHash: CONSENT_DOCUMENT_HASH,
                documentVersion: CONSENT_DOCUMENT_VERSION,
                documentTitle: CONSENT_DOCUMENT_TITLE,
            };
            const signature = await signTypedDataAsync({
                domain,
                types: CONSENT_TYPES,
                primaryType: "Consent",
                message,
            }) as Hex;

            const signer = await recoverTypedDataAddress({
                domain,
                types: CONSENT_TYPES,
                primaryType: "Consent",
                message,
                signature,
            });

            // ── Step 2: pin document + build PDF + pin receipt ──────────
            setStage("pinning");
            const documentCid = await pinDocumentText();
            const pdfBlob = await buildPdf({
                domain,
                signature,
                signer,
                signedAt,
                documentCid,
                accessCode,
            });
            const receiptCid = await pinReceipt(pdfBlob);

            setReceipt({
                signature,
                signer,
                signedAt,
                documentCid,
                receiptCid,
                pdfBlob,
            });
            setStage("post-sign");
            setShowOnboarding(true);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Signature rejected";
            setError(msg);
            setStage(isConnected && address ? "pre-sign" : "pre-connect");
        }
    };

    const handleDownloadPdf = () => {
        if (!receipt) return;
        const url = URL.createObjectURL(receipt.pdfBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "figaro-beta-consent-receipt.pdf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleContinue = () => {
        try {
            window.localStorage.setItem(CONSENT_COMPLETE_KEY, "1");
        } catch {
            // localStorage unavailable — continue anyway.
        }
        router.push("/terminal");
    };

    return (
        <div className="container mx-auto max-w-3xl px-4 py-10 space-y-6" data-testid="consent-page">
            <header className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                    Figaro Beta
                </p>
                <h1 className="text-2xl font-bold text-black">Informed-consent ceremony</h1>
                <p className="text-sm text-neutral-700 max-w-2xl">
                    Read the agreement below, then sign it with your wallet. Signing
                    produces an EIP-712 signature — no on-chain transaction is
                    submitted. The signature, the document, and a PDF receipt are
                    pinned to IPFS as durable evidence.
                </p>
            </header>

            <Card className="p-5 space-y-3" data-testid="consent-document-card">
                <div className="flex items-baseline justify-between">
                    <h2 className="text-sm font-semibold text-black">
                        {CONSENT_DOCUMENT_TITLE}
                    </h2>
                    <span className="text-[10px] font-mono text-neutral-500">
                        v{CONSENT_DOCUMENT_VERSION}
                    </span>
                </div>
                <pre
                    className="whitespace-pre-wrap font-sans text-xs text-neutral-800 leading-relaxed max-h-[420px] overflow-y-auto border border-neutral-200 rounded p-3 bg-neutral-50"
                    data-testid="consent-document-text"
                >
                    {CONSENT_DOCUMENT_TEXT}
                </pre>
                <div className="text-[10px] font-mono text-neutral-500 break-all" data-testid="consent-document-hash">
                    keccak256 {CONSENT_DOCUMENT_HASH}
                </div>
            </Card>

            {stage === "pre-connect" && (
                <Card className="p-5 space-y-3" data-testid="consent-pre-connect">
                    <p className="text-sm text-neutral-700">
                        Connect a wallet to sign. The wallet you connect for the
                        beta is a test wallet — its address is not the link
                        between you and your beta session; the access code is.
                    </p>
                    <p className="text-xs text-neutral-500">
                        Access code:{" "}
                        <span className="font-mono">
                            {accessCode ? accessCode : "not detected — visit with ?code=… on first arrival"}
                        </span>
                    </p>
                </Card>
            )}

            {stage === "pre-sign" && (
                <Card className="p-5 space-y-3" data-testid="consent-pre-sign">
                    <div className="text-xs space-y-1.5 text-neutral-600">
                        <div className="flex justify-between">
                            <span>Signer</span>
                            <span className="font-mono">{shortAddr(address)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Chain</span>
                            <span className="font-mono">{chainId}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Access code</span>
                            <span className="font-mono">{accessCode ?? "(not detected)"}</span>
                        </div>
                    </div>
                    <Button
                        onClick={handleSign}
                        data-testid="btn-sign-consent"
                        className="w-full"
                    >
                        Sign consent (EIP-712 typed data)
                    </Button>
                    {error && (
                        <p className="text-red-600 text-xs" data-testid="consent-error">
                            {error}
                        </p>
                    )}
                </Card>
            )}

            {(stage === "signing" || stage === "pinning") && (
                <Card className="p-5 text-center" data-testid="consent-progress">
                    <p className="text-sm text-neutral-700">
                        {stage === "signing"
                            ? "Waiting for wallet signature…"
                            : "Pinning document and receipt to IPFS…"}
                    </p>
                </Card>
            )}

            {stage === "post-sign" && receipt && (
                <Card className="p-5 space-y-4" data-testid="consent-post-sign">
                    <div>
                        <p className="text-sm font-semibold text-black">
                            Consent recorded.
                        </p>
                        <p className="text-xs text-neutral-600 mt-1">
                            The signature is the artifact. Download the PDF receipt
                            for your records and continue to the runtime.
                        </p>
                    </div>

                    <div className="text-xs space-y-1.5 text-neutral-600">
                        <div className="flex justify-between">
                            <span>Signer</span>
                            <span className="font-mono" data-testid="consent-signer">
                                {receipt.signer}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span>Signed at</span>
                            <span>{receipt.signedAt}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Document CID</span>
                            <span className="font-mono break-all" data-testid="consent-document-cid">
                                {receipt.documentCid ?? "(not pinned)"}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span>Receipt CID</span>
                            <span className="font-mono break-all" data-testid="consent-receipt-cid">
                                {receipt.receiptCid ?? "(not pinned)"}
                            </span>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <Button
                            onClick={handleDownloadPdf}
                            variant="outline"
                            data-testid="btn-download-receipt"
                            className="flex-1"
                        >
                            Download PDF receipt
                        </Button>
                        <Button
                            onClick={handleContinue}
                            data-testid="btn-continue-to-app"
                            className="flex-1"
                        >
                            Continue to app
                        </Button>
                    </div>

                    <div className="border-t border-neutral-200 pt-3">
                        <p className="text-[11px] text-neutral-600 mb-1.5">
                            If you believe this consent attestation has been
                            breached (e.g. unauthorized redistribution of a
                            watermarked artifact), submit a dispute to Kleros
                            per §10:
                        </p>
                        <a
                            href="/dispute"
                            data-testid="btn-dispute-this-consent"
                            className="inline-block text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                            Dispute this consent →
                        </a>
                    </div>
                </Card>
            )}

            <Card className="p-4 space-y-2 text-xs text-neutral-600" data-testid="consent-help-footer">
                <p className="font-semibold text-black uppercase tracking-wider text-[10px]">
                    Questions or concerns
                </p>
                <p>
                    Contact the Project Operator at the address provided in your
                    beta invitation. The Operator handles all questions, withdrawals,
                    and disputes during the beta — most issues resolve directly.
                </p>
                <p>
                    If a dispute remains unresolved, the formal escalation per §10
                    of the Agreement is <strong>Kleros</strong>, the decentralized
                    arbitration protocol. You may invoke Kleros independently using
                    your consent receipt PDF as evidence; a project-side submission
                    flow is available at{" "}
                    <a href="/dispute" className="underline" data-testid="consent-dispute-link">
                        /dispute
                    </a>
                    .
                </p>
            </Card>

            {showOnboarding && (
                <ConsentOnboardingModal onDismiss={() => setShowOnboarding(false)} />
            )}
        </div>
    );
}
