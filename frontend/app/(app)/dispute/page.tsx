"use client";

/**
 * /dispute — Figaro Beta consent-dispute submission flow.
 *
 * Per §10 of the Figaro Beta Informed Consent Agreement, disputes go to
 * Kleros first. This page lets a Participant or the Project Operator
 * package a consent dispute and submit it to the Kleros ArbitrableProxy
 * with the consent-receipt PDF as evidence.
 *
 * Five states (one per step):
 *
 *   1. select   — identify which consent receipt is being disputed.
 *                  Two paths: paste receipt CID + document CID + signer
 *                  + signature manually, OR (when wallet+chain match)
 *                  pre-fill from a locally-cached receipt. The manual
 *                  path is the more reliable one — not all sessions
 *                  cache.
 *
 *   2. compose  — write the claim text + cite the section of the
 *                  agreement allegedly breached. Sidebar shows the
 *                  scope of valid claims (§3.2 / §3.4 / §3.6 etc.) and
 *                  what doesn't qualify (changing one's mind is
 *                  withdrawal per §6, not a dispute).
 *
 *   3. review   — show the assembled evidence + Kleros MetaEvidence +
 *                  Evidence JSON preview. Click "Sign claim" to bind
 *                  the textual claim to the submitting wallet via
 *                  EIP-712 typed-data signing (no transaction yet).
 *
 *   4. submit   — show arbitration deposit estimate + final "Submit to
 *                  Kleros" button. Pins MetaEvidence + Evidence JSON to
 *                  IPFS, then calls `createDispute` on the Kleros
 *                  ArbitrableProxy. Followed by a single
 *                  `submitEvidence` call to attach the formatted
 *                  Evidence URI.
 *
 *   5. confirmation — show the local dispute ID, the on-chain dispute
 *                  ID, the create-dispute tx hash, and a link to the
 *                  Kleros case page (resolve.kleros.io).
 *
 * Wallet-connect is required for compose-onwards (the claim signature
 * and on-chain submission both need a wallet). The select step is
 * read-only and shows pre-connect guidance like /consent does.
 *
 * Architectural note: no new Figaro schema is needed. Kleros's own
 * chain is the on-chain record of the dispute. The PDF receipt + the
 * canonical document IPFS CID is sufficient evidence — every juror
 * has the EIP-712 typed-data message + signature in one
 * self-contained PDF.
 */

import { useEffect, useMemo, useState } from "react";
import {
    useAccount,
    useChainId,
    usePublicClient,
    useSignTypedData,
    useWalletClient,
} from "wagmi";
import { recoverTypedDataAddress, type Address, type Hex } from "viem";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import { CONTRACTS } from "@/lib/core/contracts";
import {
    buildConsentDisputeEvidence,
    buildConsentDisputeMetaEvidence,
    createDispute,
    getArbitrationCost,
    submitEvidence,
    type DisputedConsentAttestation,
    type ConsentDisputeRole,
    type KlerosConfig,
} from "@/lib/dispute";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * EIP-712 domain for the submitter's claim signature. Distinct from the
 * `Figaro Beta Consent` domain used by /consent — a claim signature is
 * a different speech act and must not be replay-able as a consent.
 */
const CLAIM_DOMAIN_NAME = "Figaro Consent Dispute Claim";
const CLAIM_DOMAIN_VERSION = "1";

const CONSENT_DISPUTE_CLAIM_TYPES = {
    DisputeClaim: [
        { name: "receiptCid", type: "string" },
        { name: "documentHash", type: "bytes32" },
        { name: "citedSection", type: "string" },
        { name: "claimDigest", type: "bytes32" },
        { name: "submittedAt", type: "string" },
    ],
} as const;

const KLEROS_RESOLVER_BASE = "https://resolve.kleros.io";

const MIN_CLAIM_LENGTH = 200;
const MAX_CLAIM_LENGTH = 4000;

/**
 * Cited-section options shown in the compose step. Each maps to a
 * surviving clause of the agreement (cf. §6 of the consent document).
 * The submitter may also enter a custom value via the "Other" path.
 */
const CITED_SECTION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
    { value: "§3.2 (constructive engagement)", label: "§3.2 (constructive engagement)" },
    { value: "§3.4 (confidentiality of access materials)", label: "§3.4 (confidentiality of access materials)" },
    { value: "§3.6 (artifact custody)", label: "§3.6 (artifact custody)" },
    { value: "§9 (breach and remedies)", label: "§9 (breach and remedies)" },
    { value: "Other", label: "Other (specify in claim text)" },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = "select" | "compose" | "review" | "submit" | "confirmation";

interface SelectionState {
    receiptCid: string;
    documentCid: string;
    documentHash: Hex;
    documentVersion: string;
    documentTitle: string;
    signature: Hex;
    signer: Address;
    signedAt: string;
}

interface ComposeState {
    role: ConsentDisputeRole;
    citedSection: string;
    citedSectionFreeform: string;
    claimText: string;
}

interface SignedClaim {
    submittedAt: string;
    signature: Hex;
    submitter: Address;
    /** keccak256-style local digest (computed in-browser for the sig payload). */
    claimDigest: Hex;
}

interface SubmissionResult {
    metaEvidenceCid: string;
    evidenceCid: string;
    localDisputeId: bigint;
    submitEvidenceTxHash: Hex | null;
}

// ---------------------------------------------------------------------------
// Env wiring (parallels useArbitrationCost.ts)
// ---------------------------------------------------------------------------

function getKlerosConfigFromEnv(): KlerosConfig | null {
    const proxy = process.env.NEXT_PUBLIC_KLEROS_ARBITRABLE_PROXY;
    const extraData = process.env.NEXT_PUBLIC_KLEROS_ARBITRATOR_EXTRA_DATA;
    if (!proxy) return null;
    return {
        arbitrableProxy: proxy as Address,
        arbitratorExtraData: (extraData ?? "0x") as `0x${string}`,
    };
}

// ---------------------------------------------------------------------------
// Helpers — local claim digest (browser-side hashing for the EIP-712 leaf)
// ---------------------------------------------------------------------------

async function computeClaimDigest(
    claimText: string,
    citedSection: string,
): Promise<Hex> {
    const payload = JSON.stringify({ citedSection, claimText });
    const bytes = new TextEncoder().encode(payload);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return `0x${hex}` as Hex;
}

function shortAddr(addr: string | undefined | null): string {
    if (!addr) return "—";
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function isValidCid(value: string): boolean {
    return /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{55,})$/.test(value);
}

function isValidHash(value: string): boolean {
    return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isValidSignature(value: string): boolean {
    return /^0x[0-9a-fA-F]{130}$/.test(value);
}

function isValidAddress(value: string): boolean {
    return /^0x[0-9a-fA-F]{40}$/.test(value);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DisputePage() {
    const { address, isConnected } = useAccount();
    const chainId = useChainId();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();
    const { signTypedDataAsync } = useSignTypedData();
    const { evidenceTransport } = useRuntimeServices();

    const klerosConfig = useMemo(() => getKlerosConfigFromEnv(), []);

    const [step, setStep] = useState<Step>("select");
    const [error, setError] = useState<string | null>(null);

    const [selection, setSelection] = useState<SelectionState | null>(null);
    const [compose, setCompose] = useState<ComposeState>({
        role: "participant",
        citedSection: CITED_SECTION_OPTIONS[0].value,
        citedSectionFreeform: "",
        claimText: "",
    });
    const [signedClaim, setSignedClaim] = useState<SignedClaim | null>(null);
    const [arbCost, setArbCost] = useState<bigint | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submission, setSubmission] = useState<SubmissionResult | null>(null);

    // ── Fetch arbitration cost when configured + on submit step ─────────
    useEffect(() => {
        if (!publicClient || !klerosConfig) return;
        let cancelled = false;
        getArbitrationCost(publicClient, klerosConfig)
            .then((c) => { if (!cancelled) setArbCost(c); })
            .catch(() => { /* ignore — show "—" instead */ });
        return () => { cancelled = true; };
    }, [publicClient, klerosConfig]);

    // ── Resolve cited section (handles "Other" → freeform) ──────────────
    const resolvedCitedSection =
        compose.citedSection === "Other"
            ? compose.citedSectionFreeform.trim()
            : compose.citedSection;

    // ── Build evidence preview (only when all inputs present) ────────────
    const evidencePreview = useMemo(() => {
        if (!selection || !signedClaim) return null;
        if (!resolvedCitedSection) return null;
        try {
            return buildConsentDisputeEvidence({
                attestation: {
                    documentHash: selection.documentHash,
                    documentVersion: selection.documentVersion,
                    documentTitle: selection.documentTitle,
                    signature: selection.signature,
                    signer: selection.signer,
                    signedAt: selection.signedAt,
                },
                documentCid: selection.documentCid,
                receiptCid: selection.receiptCid,
                claimText: compose.claimText,
                citedSection: resolvedCitedSection,
                role: compose.role,
                claimSignature: {
                    submittedAt: signedClaim.submittedAt,
                    signature: signedClaim.signature,
                    submitter: signedClaim.submitter,
                },
                chainId,
            });
        } catch {
            return null;
        }
    }, [selection, signedClaim, compose, resolvedCitedSection, chainId]);

    // ── Step-1 handler: validate + advance to compose ───────────────────
    const handleSelectSubmit = (incoming: SelectionState) => {
        setError(null);
        setSelection(incoming);
        setStep("compose");
    };

    // ── Step-2 handler: validate compose + advance to review ────────────
    const handleComposeNext = () => {
        setError(null);
        if (!resolvedCitedSection) {
            setError("Please cite a section of the consent agreement.");
            return;
        }
        if (compose.claimText.length < MIN_CLAIM_LENGTH) {
            setError(`Claim text must be at least ${MIN_CLAIM_LENGTH} characters.`);
            return;
        }
        if (compose.claimText.length > MAX_CLAIM_LENGTH) {
            setError(`Claim text must be at most ${MAX_CLAIM_LENGTH} characters.`);
            return;
        }
        setStep("review");
    };

    // ── Step-3 handler: sign the claim digest, advance to submit ────────
    const handleSignClaim = async () => {
        if (!selection || !address) return;
        setError(null);
        try {
            const submittedAt = new Date().toISOString();
            const claimDigest = await computeClaimDigest(
                compose.claimText,
                resolvedCitedSection,
            );
            const message = {
                receiptCid: selection.receiptCid,
                documentHash: selection.documentHash,
                citedSection: resolvedCitedSection,
                claimDigest,
                submittedAt,
            };
            const verifyingContract = (CONTRACTS.core
                || ("0x0000000000000000000000000000000000000000" as Address)) as Address;
            const domain = {
                name: CLAIM_DOMAIN_NAME,
                version: CLAIM_DOMAIN_VERSION,
                chainId,
                verifyingContract,
            } as const;
            const signature = await signTypedDataAsync({
                domain,
                types: CONSENT_DISPUTE_CLAIM_TYPES,
                primaryType: "DisputeClaim",
                message,
            }) as Hex;
            const submitter = await recoverTypedDataAddress({
                domain,
                types: CONSENT_DISPUTE_CLAIM_TYPES,
                primaryType: "DisputeClaim",
                message,
                signature,
            });
            setSignedClaim({ submittedAt, signature, submitter, claimDigest });
            setStep("submit");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Claim signature rejected");
        }
    };

    // ── Step-4 handler: pin + create dispute + submit evidence ──────────
    const handleSubmitToKleros = async () => {
        if (!selection || !signedClaim || !walletClient || !publicClient || !klerosConfig) return;
        if (!evidencePreview) {
            setError("Evidence preview missing — refresh and retry.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            // 1. Pin the MetaEvidence (dispute context).
            const metaEvidence = buildConsentDisputeMetaEvidence();
            const metaEvidenceCid = await evidenceTransport.pinJSON(metaEvidence);
            const metaEvidenceURI = evidenceTransport.buildPath(metaEvidenceCid);

            // 2. Pin the per-submission Evidence (claim + receipt
            //    pointer + claim signature).
            const evidenceCid = await evidenceTransport.pinJSON(evidencePreview);
            const evidenceURI = evidenceTransport.buildPath(evidenceCid);

            // 3. Create the dispute on the Kleros ArbitrableProxy
            //    (pays arbitration deposit; signs + submits tx).
            //    Two ruling options: "breach upheld" / "no breach".
            const localDisputeId = await createDispute(
                walletClient,
                publicClient,
                klerosConfig,
                metaEvidenceURI,
                2,
            );

            // 4. Submit the Evidence to the freshly-created dispute.
            const submitEvidenceTxHash = await submitEvidence(
                walletClient,
                klerosConfig,
                localDisputeId,
                evidenceURI,
            );

            setSubmission({
                metaEvidenceCid,
                evidenceCid,
                localDisputeId,
                submitEvidenceTxHash,
            });
            setStep("confirmation");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Submission to Kleros failed");
        } finally {
            setSubmitting(false);
        }
    };

    // ── Render ──────────────────────────────────────────────────────────

    return (
        <div className="container mx-auto max-w-5xl px-4 py-10 space-y-6" data-testid="dispute-page">
            <header className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                    Figaro Beta — §10 escalation
                </p>
                <h1 className="text-2xl font-bold text-black">
                    Submit a consent dispute to Kleros
                </h1>
                <p className="text-sm text-neutral-700 max-w-2xl">
                    Per §10 of the Figaro Beta Informed Consent Agreement,
                    disputes are submitted first to Kleros, the decentralized
                    arbitration protocol. This flow packages your consent
                    receipt, the canonical document, and your claim into the
                    Kleros ERC-1497 evidence format, then submits it on
                    your behalf.
                </p>
            </header>

            <Stepper current={step} />

            {!klerosConfig && step !== "confirmation" && (
                <Card className="p-4 bg-amber-50 border-amber-200" data-testid="dispute-not-configured">
                    <p className="text-xs font-semibold text-amber-900">
                        Kleros integration not configured for this deployment.
                    </p>
                    <p className="text-xs text-amber-800 mt-1">
                        The flow below works through compose + review (offline
                        steps) but the final on-chain submission is gated on
                        <code className="font-mono mx-1">NEXT_PUBLIC_KLEROS_ARBITRABLE_PROXY</code>
                        being set. You may invoke Kleros directly via{" "}
                        <a
                            href="https://kleros.io"
                            className="underline"
                            target="_blank"
                            rel="noopener noreferrer"
                        >kleros.io</a>{" "}
                        using the Evidence JSON previewed in the review step.
                    </p>
                </Card>
            )}

            {step === "select" && (
                <SelectStep
                    onAdvance={handleSelectSubmit}
                    initial={selection}
                />
            )}

            {step === "compose" && selection && (
                <ComposeStep
                    state={compose}
                    onChange={setCompose}
                    onBack={() => setStep("select")}
                    onNext={handleComposeNext}
                    error={error}
                />
            )}

            {step === "review" && selection && (
                <ReviewStep
                    selection={selection}
                    compose={{ ...compose, citedSection: resolvedCitedSection }}
                    onBack={() => setStep("compose")}
                    onSignClaim={handleSignClaim}
                    isConnected={isConnected}
                    address={address}
                    error={error}
                />
            )}

            {step === "submit" && selection && signedClaim && evidencePreview && (
                <SubmitStep
                    selection={selection}
                    citedSection={resolvedCitedSection}
                    signedClaim={signedClaim}
                    evidenceJson={evidencePreview}
                    arbCost={arbCost}
                    isConnected={isConnected}
                    klerosConfigured={!!klerosConfig}
                    submitting={submitting}
                    onSubmit={handleSubmitToKleros}
                    onBack={() => setStep("review")}
                    error={error}
                />
            )}

            {step === "confirmation" && submission && selection && (
                <ConfirmationStep
                    submission={submission}
                    selection={selection}
                />
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

const STEP_LABELS: Record<Step, string> = {
    select: "1. Select",
    compose: "2. Compose",
    review: "3. Review",
    submit: "4. Submit",
    confirmation: "5. Confirmation",
};

function Stepper({ current }: { current: Step }) {
    const order: Step[] = ["select", "compose", "review", "submit", "confirmation"];
    const currentIdx = order.indexOf(current);
    return (
        <nav className="flex gap-1.5 border-b border-neutral-200 pb-1.5" data-testid="dispute-stepper">
            {order.map((s, idx) => {
                const reached = idx <= currentIdx;
                return (
                    <span
                        key={s}
                        data-testid={`dispute-step-${s}`}
                        className={`text-[11px] font-semibold uppercase tracking-wider ${
                            reached ? "text-black" : "text-neutral-400"
                        } ${idx > 0 ? "pl-3 border-l border-neutral-300" : ""}`}
                    >
                        {STEP_LABELS[s]}
                    </span>
                );
            })}
        </nav>
    );
}

// ---------------------------------------------------------------------------
// Step 1 — Select
// ---------------------------------------------------------------------------

interface SelectStepProps {
    onAdvance: (s: SelectionState) => void;
    initial: SelectionState | null;
}

function SelectStep({ onAdvance, initial }: SelectStepProps) {
    const [receiptCid, setReceiptCid] = useState(initial?.receiptCid ?? "");
    const [documentCid, setDocumentCid] = useState(initial?.documentCid ?? "");
    const [documentHash, setDocumentHash] = useState<string>(initial?.documentHash ?? "");
    const [documentVersion, setDocumentVersion] = useState(initial?.documentVersion ?? "1.0.0");
    const [documentTitle, setDocumentTitle] = useState(
        initial?.documentTitle ?? "Figaro Beta Informed Consent Agreement",
    );
    const [signature, setSignature] = useState<string>(initial?.signature ?? "");
    const [signer, setSigner] = useState<string>(initial?.signer ?? "");
    const [signedAt, setSignedAt] = useState(initial?.signedAt ?? "");
    const [localError, setLocalError] = useState<string | null>(null);

    const submit = () => {
        setLocalError(null);
        if (!isValidCid(receiptCid)) {
            setLocalError("Receipt CID must be a valid IPFS CID (Qm... or bafy...).");
            return;
        }
        if (!isValidCid(documentCid)) {
            setLocalError("Document CID must be a valid IPFS CID (Qm... or bafy...).");
            return;
        }
        if (!isValidHash(documentHash)) {
            setLocalError("Document hash must be a 0x-prefixed 32-byte hex digest.");
            return;
        }
        if (!isValidSignature(signature)) {
            setLocalError("Signature must be a 0x-prefixed 65-byte EIP-712 signature.");
            return;
        }
        if (!isValidAddress(signer)) {
            setLocalError("Signer must be a 0x-prefixed 20-byte address.");
            return;
        }
        if (!documentVersion.trim() || !documentTitle.trim() || !signedAt.trim()) {
            setLocalError("Document version, title, and signed-at timestamp are all required.");
            return;
        }
        onAdvance({
            receiptCid,
            documentCid,
            documentHash: documentHash as Hex,
            documentVersion,
            documentTitle,
            signature: signature as Hex,
            signer: signer as Address,
            signedAt,
        });
    };

    return (
        <div className="space-y-4" data-testid="dispute-select-step">
            <Card className="p-5 space-y-3">
                <h2 className="text-sm font-semibold text-black">
                    Identify the disputed consent receipt
                </h2>
                <p className="text-xs text-neutral-700">
                    Paste the fields from your consent receipt PDF. The PDF
                    carries every field below in plain text near the top —
                    Document hash, Signer, Signature, Signed-at, Document CID,
                    Receipt CID. Field labels match the receipt.
                </p>

                <Field
                    label="Receipt CID (PDF)"
                    value={receiptCid}
                    onChange={setReceiptCid}
                    placeholder="Qm..."
                    testId="dispute-input-receipt-cid"
                />
                <Field
                    label="Document CID (canonical text)"
                    value={documentCid}
                    onChange={setDocumentCid}
                    placeholder="Qm..."
                    testId="dispute-input-document-cid"
                />
                <Field
                    label="Document hash (keccak256, 0x-prefixed)"
                    value={documentHash}
                    onChange={setDocumentHash}
                    placeholder="0x..."
                    testId="dispute-input-document-hash"
                />
                <div className="grid grid-cols-2 gap-3">
                    <Field
                        label="Document version"
                        value={documentVersion}
                        onChange={setDocumentVersion}
                        placeholder="1.0.0"
                        testId="dispute-input-document-version"
                    />
                    <Field
                        label="Document title"
                        value={documentTitle}
                        onChange={setDocumentTitle}
                        placeholder="Figaro Beta Informed Consent Agreement"
                        testId="dispute-input-document-title"
                    />
                </div>
                <Field
                    label="Signature (0x-prefixed 65 bytes)"
                    value={signature}
                    onChange={setSignature}
                    placeholder="0x..."
                    testId="dispute-input-signature"
                />
                <div className="grid grid-cols-2 gap-3">
                    <Field
                        label="Signer (recovered address)"
                        value={signer}
                        onChange={setSigner}
                        placeholder="0x..."
                        testId="dispute-input-signer"
                    />
                    <Field
                        label="Signed at (ISO-8601)"
                        value={signedAt}
                        onChange={setSignedAt}
                        placeholder="2026-04-01T12:00:00Z"
                        testId="dispute-input-signed-at"
                    />
                </div>

                {localError && (
                    <p className="text-red-600 text-xs" data-testid="dispute-select-error">
                        {localError}
                    </p>
                )}

                <div className="flex justify-end pt-2">
                    <Button onClick={submit} data-testid="btn-dispute-select-next">
                        Next — compose claim
                    </Button>
                </div>
            </Card>
        </div>
    );
}

interface FieldProps {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    testId?: string;
}

function Field({ label, value, onChange, placeholder, testId }: FieldProps) {
    return (
        <label className="block text-xs font-semibold text-neutral-700">
            {label}
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                data-testid={testId}
                className="mt-1 w-full font-mono text-xs px-3 py-2 border border-neutral-300 rounded"
            />
        </label>
    );
}

// ---------------------------------------------------------------------------
// Step 2 — Compose
// ---------------------------------------------------------------------------

interface ComposeStepProps {
    state: ComposeState;
    onChange: (s: ComposeState) => void;
    onBack: () => void;
    onNext: () => void;
    error: string | null;
}

function ComposeStep({ state, onChange, onBack, onNext, error }: ComposeStepProps) {
    const len = state.claimText.length;
    const lenLabel = `${len} / ${MAX_CLAIM_LENGTH}`;
    const lenStatus = len < MIN_CLAIM_LENGTH
        ? "below-min"
        : len <= MAX_CLAIM_LENGTH
            ? "ok"
            : "over-max";

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="dispute-compose-step">
            <Card className="p-5 space-y-4 md:col-span-2">
                <h2 className="text-sm font-semibold text-black">Compose the claim</h2>

                <div className="space-y-1">
                    <label className="block text-xs font-semibold text-neutral-700">
                        Submitter role
                    </label>
                    <div className="flex gap-3 text-xs">
                        {(["participant", "operator"] as const).map((r) => (
                            <label key={r} className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                    type="radio"
                                    name="dispute-role"
                                    checked={state.role === r}
                                    onChange={() => onChange({ ...state, role: r })}
                                    data-testid={`dispute-role-${r}`}
                                />
                                <span>{r === "participant" ? "Participant" : "Project Operator"}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="block text-xs font-semibold text-neutral-700">
                        Cited section of the consent agreement
                    </label>
                    <select
                        value={state.citedSection}
                        onChange={(e) => onChange({ ...state, citedSection: e.target.value })}
                        data-testid="dispute-cited-section"
                        className="mt-1 w-full text-xs px-3 py-2 border border-neutral-300 rounded bg-white"
                    >
                        {CITED_SECTION_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                    {state.citedSection === "Other" && (
                        <input
                            type="text"
                            value={state.citedSectionFreeform}
                            onChange={(e) => onChange({ ...state, citedSectionFreeform: e.target.value })}
                            placeholder="Specify section…"
                            data-testid="dispute-cited-section-freeform"
                            className="mt-1 w-full text-xs px-3 py-2 border border-neutral-300 rounded"
                        />
                    )}
                </div>

                <div className="space-y-1">
                    <label className="block text-xs font-semibold text-neutral-700">
                        Claim text ({MIN_CLAIM_LENGTH}–{MAX_CLAIM_LENGTH} characters)
                    </label>
                    <textarea
                        value={state.claimText}
                        onChange={(e) => onChange({ ...state, claimText: e.target.value })}
                        rows={12}
                        placeholder="Describe the alleged breach. Include dates, what happened, what evidence is available, and what outcome you're seeking."
                        data-testid="dispute-claim-text"
                        className="mt-1 w-full text-xs px-3 py-2 border border-neutral-300 rounded font-sans"
                    />
                    <p
                        data-testid="dispute-claim-length"
                        className={`text-[11px] ${
                            lenStatus === "ok"
                                ? "text-neutral-500"
                                : "text-red-600"
                        }`}
                    >
                        {lenLabel}
                    </p>
                </div>

                {error && (
                    <p className="text-red-600 text-xs" data-testid="dispute-compose-error">
                        {error}
                    </p>
                )}

                <div className="flex justify-between pt-2">
                    <Button variant="outline" onClick={onBack} data-testid="btn-dispute-compose-back">
                        Back
                    </Button>
                    <Button onClick={onNext} data-testid="btn-dispute-compose-next">
                        Next — review
                    </Button>
                </div>
            </Card>

            <Card className="p-5 space-y-3 md:col-span-1 bg-neutral-50">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-700">
                    Scope reminder
                </h3>
                <div className="text-xs text-neutral-700 space-y-2">
                    <div>
                        <p className="font-semibold text-black">Appropriate claims</p>
                        <ul className="list-disc list-inside space-y-0.5">
                            <li>Breach of §3.2 (constructive engagement)</li>
                            <li>Breach of §3.4 (confidentiality of access materials)</li>
                            <li>Breach of §3.6 (artifact custody)</li>
                            <li>Breach of §9 (breach and remedies — equitable relief)</li>
                        </ul>
                    </div>
                    <div>
                        <p className="font-semibold text-black">Not a dispute</p>
                        <ul className="list-disc list-inside space-y-0.5">
                            <li>
                                Changing your mind about participation — that is{" "}
                                withdrawal per §6, handled by notifying the
                                Project Operator directly. No Kleros submission
                                needed.
                            </li>
                            <li>
                                Bug reports, friction, surprises — use the
                                in-app feedback channel, not /dispute.
                            </li>
                        </ul>
                    </div>
                    <p className="text-[11px] text-neutral-600 italic">
                        Kleros arbitration is novel. §10 also provides a
                        supplementary legal venue for emergency injunctive
                        relief or non-enforceable rulings.
                    </p>
                </div>
            </Card>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Step 3 — Review
// ---------------------------------------------------------------------------

interface ReviewStepProps {
    selection: SelectionState;
    compose: ComposeState;
    onBack: () => void;
    onSignClaim: () => void;
    isConnected: boolean;
    address?: Address;
    error: string | null;
}

function ReviewStep({
    selection,
    compose,
    onBack,
    onSignClaim,
    isConnected,
    address,
    error,
}: ReviewStepProps) {
    return (
        <div className="space-y-4" data-testid="dispute-review-step">
            <Card className="p-5 space-y-3">
                <h2 className="text-sm font-semibold text-black">Review the dispute package</h2>

                <Section label="Disputed consent attestation">
                    <KV k="Document">{selection.documentTitle} (v{selection.documentVersion})</KV>
                    <KV k="Document hash">
                        <span className="font-mono break-all">{selection.documentHash}</span>
                    </KV>
                    <KV k="Document CID">
                        <span className="font-mono">/ipfs/{selection.documentCid}</span>
                    </KV>
                    <KV k="Receipt CID">
                        <span className="font-mono">/ipfs/{selection.receiptCid}</span>
                    </KV>
                    <KV k="Signer">
                        <span className="font-mono break-all">{selection.signer}</span>
                    </KV>
                    <KV k="Signed at">{selection.signedAt}</KV>
                </Section>

                <Section label="Claim">
                    <KV k="Submitter role">
                        {compose.role === "operator" ? "Project Operator" : "Participant"}
                    </KV>
                    <KV k="Cited section">{compose.citedSection}</KV>
                    <KV k="Claim text">
                        <span className="block whitespace-pre-wrap" data-testid="dispute-review-claim-text">
                            {compose.claimText}
                        </span>
                    </KV>
                </Section>

                <Section label="Submitter signature (next step)">
                    <p className="text-xs text-neutral-700">
                        Click <strong>Sign claim</strong> below to bind this
                        textual claim to your wallet via EIP-712 typed-data
                        signing. No on-chain transaction is submitted at this
                        step — it just locks the claim digest before
                        the on-chain submit.
                    </p>
                </Section>

                {!isConnected && (
                    <p className="text-xs text-amber-700">
                        Connect a wallet from the header to sign the claim.
                    </p>
                )}
                {isConnected && (
                    <p className="text-[11px] text-neutral-500">
                        Signing wallet: <span className="font-mono">{shortAddr(address)}</span>
                    </p>
                )}

                {error && (
                    <p className="text-red-600 text-xs" data-testid="dispute-review-error">{error}</p>
                )}

                <div className="flex justify-between pt-2">
                    <Button variant="outline" onClick={onBack} data-testid="btn-dispute-review-back">
                        Back
                    </Button>
                    <Button
                        onClick={onSignClaim}
                        disabled={!isConnected}
                        data-testid="btn-dispute-sign-claim"
                    >
                        Sign claim (EIP-712)
                    </Button>
                </div>
            </Card>
        </div>
    );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="border border-neutral-200 rounded p-3 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                {label}
            </p>
            {children}
        </div>
    );
}

function KV({ k, children }: { k: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col text-xs gap-0.5">
            <span className="text-neutral-500">{k}</span>
            <span className="text-black">{children}</span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Step 4 — Submit
// ---------------------------------------------------------------------------

interface SubmitStepProps {
    selection: SelectionState;
    citedSection: string;
    signedClaim: SignedClaim;
    evidenceJson: { name: string; description: string; fileURI?: string; fileHash?: string; fileTypeExtension?: string };
    arbCost: bigint | null;
    isConnected: boolean;
    klerosConfigured: boolean;
    submitting: boolean;
    onSubmit: () => void;
    onBack: () => void;
    error: string | null;
}

function SubmitStep({
    selection,
    citedSection,
    signedClaim,
    evidenceJson,
    arbCost,
    isConnected,
    klerosConfigured,
    submitting,
    onSubmit,
    onBack,
    error,
}: SubmitStepProps) {
    const arbCostEth = arbCost !== null ? (Number(arbCost) / 1e18).toFixed(4) : "—";

    return (
        <div className="space-y-4" data-testid="dispute-submit-step">
            <Card className="p-5 space-y-4">
                <h2 className="text-sm font-semibold text-black">Submit to Kleros</h2>

                <div className="text-xs text-neutral-700 space-y-1.5">
                    <KV k="Cited section">{citedSection}</KV>
                    <KV k="Disputed signer">
                        <span className="font-mono break-all">{selection.signer}</span>
                    </KV>
                    <KV k="Submitter (claim signer)">
                        <span className="font-mono break-all">{signedClaim.submitter}</span>
                    </KV>
                    <KV k="Claim digest">
                        <span className="font-mono break-all">{signedClaim.claimDigest}</span>
                    </KV>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded p-3" data-testid="dispute-arbitration-cost">
                    <p className="text-xs font-semibold text-amber-900">
                        Arbitration deposit
                    </p>
                    <p className="text-sm font-mono text-amber-900">{arbCostEth} ETH</p>
                    <p className="text-[11px] text-amber-800 mt-1">
                        Paid by the wallet submitting the dispute. Refunded
                        if the ruling favors your claim; lost otherwise. Court
                        ID is selected by the configured
                        <code className="font-mono mx-1">arbitratorExtraData</code> bytes.
                    </p>
                </div>

                <details className="border border-neutral-200 rounded p-3" data-testid="dispute-evidence-preview-wrapper">
                    <summary className="text-xs font-semibold cursor-pointer">
                        Evidence JSON preview (ERC-1497)
                    </summary>
                    <pre
                        data-testid="dispute-evidence-json"
                        className="mt-2 text-[10px] font-mono bg-neutral-50 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all"
                    >
                        {JSON.stringify(evidenceJson, null, 2)}
                    </pre>
                </details>

                {error && (
                    <p className="text-red-600 text-xs" data-testid="dispute-submit-error">{error}</p>
                )}

                <div className="flex justify-between pt-2">
                    <Button variant="outline" onClick={onBack} disabled={submitting} data-testid="btn-dispute-submit-back">
                        Back
                    </Button>
                    <Button
                        onClick={onSubmit}
                        disabled={submitting || !isConnected || !klerosConfigured}
                        data-testid="btn-dispute-submit-kleros"
                    >
                        {submitting ? "Submitting…" : "Submit to Kleros"}
                    </Button>
                </div>
            </Card>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Step 5 — Confirmation
// ---------------------------------------------------------------------------

interface ConfirmationStepProps {
    submission: SubmissionResult;
    selection: SelectionState;
}

function ConfirmationStep({ submission, selection }: ConfirmationStepProps) {
    return (
        <div className="space-y-4" data-testid="dispute-confirmation-step">
            <Card className="p-5 space-y-4">
                <div>
                    <p className="text-sm font-semibold text-black">Dispute submitted to Kleros.</p>
                    <p className="text-xs text-neutral-700 mt-1">
                        The arbitrators will review the evidence and issue a
                        ruling per the MetaEvidence question. You can track
                        the case at the link below.
                    </p>
                </div>

                <div className="text-xs space-y-1.5 text-neutral-700">
                    <KV k="Local dispute ID">
                        <span className="font-mono" data-testid="dispute-local-id">
                            {submission.localDisputeId.toString()}
                        </span>
                    </KV>
                    <KV k="Submit-evidence tx hash">
                        <span className="font-mono break-all" data-testid="dispute-tx-hash">
                            {submission.submitEvidenceTxHash ?? "—"}
                        </span>
                    </KV>
                    <KV k="MetaEvidence CID">
                        <span className="font-mono break-all">/ipfs/{submission.metaEvidenceCid}</span>
                    </KV>
                    <KV k="Evidence CID">
                        <span className="font-mono break-all">/ipfs/{submission.evidenceCid}</span>
                    </KV>
                    <KV k="Disputed receipt">
                        <span className="font-mono break-all">/ipfs/{selection.receiptCid}</span>
                    </KV>
                </div>

                <a
                    href={`${KLEROS_RESOLVER_BASE}/cases/${submission.localDisputeId.toString()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-xs text-blue-600 hover:text-blue-800 underline"
                    data-testid="dispute-kleros-case-link"
                >
                    View case on Kleros (resolve.kleros.io) →
                </a>
            </Card>

            <Card className="p-4 text-xs text-neutral-600">
                <p>
                    The submitted Evidence is durably pinned via IPFS. Kleros
                    arbitrators independently dereference the CIDs above; the
                    receipt PDF carries the EIP-712 typed-data message + signature
                    + recovered signer in plain text, so any juror can verify
                    the disputed attestation without access to this site.
                </p>
            </Card>
        </div>
    );
}
