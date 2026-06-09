/**
 * useCommitmentFlow — Off-chain EIP-712 signature collection for V5 dual-signed commitments.
 *
 * V5 FigaroCore uses a single unified `commit(Commitment, buyerSig, sellerSig)`
 * function. Root orders set processId = 0x00...00 (the kernel derives processId
 * from the EIP-712 digest). Sub-orders set processId to the existing process.
 *
 * This hook handles:
 *   1. Building the EIP-712 typed data from commitment parameters
 *   2. Signing as the current wallet (buyer or seller)
 *   3. Sharing unsigned/partially-signed commitments via the coordination channel
 *   4. Collecting the counter-party signature
 *   5. Broadcasting the fully-signed commitment to FigaroCore
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useChainId, useSignTypedData } from "wagmi";
import { COMMITMENT_TYPES } from "@figaro/core";
import { CONTRACTS } from "@/lib/core/contracts";
import { useFigaroActions, Commitment } from "@/lib/core/useFigaroActions";
import { ZERO_ADDRESS, ZERO_PROCESS_ID, hexEqual } from "@/lib/shared/evm";
import type { PartyRole } from "@/lib/core/walletProcessQueries";
import { isValidAddress } from "@/components/sellers/TokenAddressInput";
import { extractErrorMessage } from "@/lib/shared/errors";
import { saveCommitment, computeOrderHash } from "@/lib/core/commitmentStore";
import type { Agreement } from "@/lib/core/agreement";
import { hydrateAgreement, loadAgreement, primeAgreementArtifact, saveAgreementUri } from "@/lib/core/agreementStore";
import { requestSignConfirmation } from "@/lib/core/commitmentSignPreviewStore";
import { strippingReviver } from "@/lib/shared/safeJson";

// ── EIP-712 Domain (V5: version "3") ──────────────────────────

function isValidVerifyingContract(addr: string | undefined): addr is `0x${string}` {
    if (!addr) return false;
    if (addr === ZERO_ADDRESS) return false;
    return isValidAddress(addr);
}

function useFigaroDomain() {
    const chainId = useChainId();
    // Object.freeze closes the "extension intercepts the signTypedData
    // arguments and mutates the domain after the hook returned" angle.
    // The fields are still wagmi-derived, but they cannot be mutated
    // in-place once the object leaves the hook.
    return Object.freeze({
        name: "FigaroCore",
        version: "3",
        chainId,
        verifyingContract: CONTRACTS.core as `0x${string}`,
    } as const);
}

function assertValidSigningDomain(domain: {
    chainId: number;
    verifyingContract: `0x${string}`;
}): void {
    // Pre-sign sanity gate. Catches: missing CONTRACTS.core (deploy
    // misconfig), zero / malformed verifyingContract (env tampering),
    // and chainId 0 (no wallet connected — wagmi default).
    if (!isValidVerifyingContract(domain.verifyingContract)) {
        throw new Error(
            "Refusing to sign: FigaroCore address is missing or invalid. " +
            "Check NEXT_PUBLIC_FIGARO_CORE in your environment.",
        );
    }
    if (!domain.chainId || domain.chainId === 0) {
        throw new Error(
            "Refusing to sign: no chain detected. Connect a wallet first.",
        );
    }
}

// ── EIP-712 Type Definition (imported from SDK) ───────────────
// COMMITMENT_TYPES imported from @figaro/core above

// ── Serializable payload for sharing ───────────────────────────

export interface CommitmentPayload {
    commitment: Commitment;
    buyerSig?: `0x${string}`;
    sellerSig?: `0x${string}`;
    agreement?: Agreement;
    agreementUri?: string;
}

export interface CommitmentPayloadMeta {
    agreement?: Agreement;
    agreementUri?: string;
}

// ── Flow state ─────────────────────────────────────────────────

export type CommitmentFlowStep =
    | "idle"
    | "signing"        // Wallet signing prompt active
    | "awaiting-counter" // One sig collected, waiting for counter-party
    | "ready"          // Both sigs collected, ready to broadcast
    | "broadcasting"   // On-chain tx in flight
    | "done"
    | "error";

// ── SessionStorage persistence ─────────────────────────────────

const PAYLOAD_STORAGE_KEY = "figaro_commitment_payload";

function persistPayload(p: CommitmentPayload | null) {
    if (typeof window === "undefined") return;
    if (!p) {
        sessionStorage.removeItem(PAYLOAD_STORAGE_KEY);
        return;
    }
    try {
        sessionStorage.setItem(PAYLOAD_STORAGE_KEY, JSON.stringify(p, (_k, v) =>
            typeof v === "bigint" ? `0xn${v.toString(16)}` : v,
        ));
    } catch { /* quota exceeded — ignore */ }
}

function recoverPayload(): CommitmentPayload | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = sessionStorage.getItem(PAYLOAD_STORAGE_KEY);
        if (!raw) return null;
        // Compose stripping (proto-pollution defense) + bigint rehydration.
        // sessionStorage is technically same-origin, but we treat any
        // path into the typed-data signing flow as a potential injection
        // vector — defense-in-depth.
        return JSON.parse(raw, (k, v) => {
            const stripped = strippingReviver(k, v);
            if (stripped === undefined) return undefined;
            return typeof stripped === "string" && stripped.startsWith("0xn")
                ? BigInt(`0x${stripped.slice(3)}`)
                : stripped;
        });
    } catch {
        return null;
    }
}

// ── Hook ───────────────────────────────────────────────────────

export function useCommitmentFlow() {
    const { address } = useAccount();
    const domain = useFigaroDomain();
    const { signTypedDataAsync } = useSignTypedData();
    const { commit } = useFigaroActions();

    const [step, setStep] = useState<CommitmentFlowStep>("idle");
    const [error, setError] = useState<string | null>(null);
    const [payload, setPayload] = useState<CommitmentPayload | null>(null);

    // Recover persisted commitment payload on mount
    useEffect(() => {
        const recovered = recoverPayload();
        if (recovered) {
            setPayload(recovered);
            void primeAgreementArtifact({
                agreementHash: recovered.commitment.agreementHash,
                agreement: recovered.agreement,
                agreementUri: recovered.agreementUri,
            }).catch(() => null);
            if (recovered.buyerSig && recovered.sellerSig) {
                setStep("ready");
            } else if (recovered.buyerSig || recovered.sellerSig) {
                setStep("awaiting-counter");
            }
        }
    }, []);

    // Clear partially-signed payloads from sessionStorage on page unload
    // to prevent stale half-signed commitments from persisting across navigations.
    useEffect(() => {
        const cleanup = () => {
            if (step === "awaiting-counter") {
                sessionStorage.removeItem(PAYLOAD_STORAGE_KEY);
            }
        };
        window.addEventListener("beforeunload", cleanup);
        return () => window.removeEventListener("beforeunload", cleanup);
    }, [step]);

    // Persist payload to sessionStorage on every change
    useEffect(() => {
        persistPayload(payload);
    }, [payload]);

    const reset = useCallback(() => {
        setStep("idle");
        setError(null);
        setPayload(null);
    }, []);

    // ── Sign a Commitment ──────────────────────────────────────

    const signCommitment = useCallback(async (
        commitment: Commitment,
        opts?: { skipPreview?: boolean },
    ): Promise<`0x${string}`> => {
        setError(null);
        setStep("signing");
        try {
            // Pre-sign domain-separator gate. Refuses to call the wallet
            // if the EIP-712 domain has been tampered or is misconfigured.
            assertValidSigningDomain(domain);

            // Threat-model 🟡 Priority 4: gate signing on a pre-sign agreement
            // preview. The wallet prompt only shows the agreementHash; the user
            // has no way to verify in MetaMask that the hash matches the intended
            // terms. The global CommitmentSignPreviewProvider renders an
            // AgreementPreviewModal showing the human-readable terms next to the
            // hash before the wallet opens.
            //
            // `skipPreview` is set by callers that ALREADY show the agreement
            // terms inline (the checkout surface) — there the visible terms plus
            // the explicit place-order click are the confirmation, so the modal
            // would be a redundant second gate. Contexts with no inline display
            // (the inbox counter-sign) leave it on.
            if (!opts?.skipPreview) {
                const agreement = loadAgreement(commitment.agreementHash);
                const approved = await requestSignConfirmation(commitment, agreement);
                if (!approved) {
                    const msg = "Signing cancelled by user";
                    setError(msg);
                    setStep("idle");
                    throw new Error(msg);
                }
            }

            const sig = await signTypedDataAsync({
                domain,
                types: COMMITMENT_TYPES,
                primaryType: "Commitment",
                message: {
                    processId: commitment.processId,
                    buyer: commitment.buyer,
                    seller: commitment.seller,
                    currency: commitment.currency,
                    payment: commitment.payment,
                    expectedCumulativeValue: commitment.expectedCumulativeValue,
                    agreementHash: commitment.agreementHash,
                    salt: commitment.salt,
                    deadline: commitment.deadline,
                },
            });
            return sig;
        } catch (e: unknown) {
            const msg = extractErrorMessage(e, "Signature rejected");
            setError(msg);
            setStep("error");
            throw e;
        }
    }, [domain, signTypedDataAsync]);

    // ── Initiate flow as buyer or seller (sign + prepare payload) ──

    const initiateAsParty = useCallback(async (
        commitment: Commitment,
        role: PartyRole,
        meta?: CommitmentPayloadMeta,
        opts?: { skipPreview?: boolean },
    ): Promise<CommitmentPayload> => {
        const sig = await signCommitment(commitment, opts);

        const p: CommitmentPayload = {
            commitment,
            buyerSig: role === "buyer" ? sig : undefined,
            sellerSig: role === "seller" ? sig : undefined,
            agreement: meta?.agreement,
            agreementUri: meta?.agreementUri,
        };

        setPayload(p);
        setStep("awaiting-counter");
        return p;
    }, [signCommitment]);

    // ── Counter-sign a received payload ────────────────────────

    const counterSign = useCallback(async (
        incoming: CommitmentPayload,
    ): Promise<CommitmentPayload> => {
        const sig = await signCommitment(incoming.commitment);

        // Determine which role the current wallet fills
        const isBuyer = hexEqual(address, incoming.commitment.buyer);
        const updated: CommitmentPayload = {
            ...incoming,
            buyerSig: isBuyer ? sig : incoming.buyerSig,
            sellerSig: isBuyer ? incoming.sellerSig : sig,
        };

        setPayload(updated);
        setStep("ready");
        return updated;
    }, [address, signCommitment]);

    // ── Broadcast fully-signed commitment on-chain ─────────────

    const broadcast = useCallback(async (
        p: CommitmentPayload,
    ): Promise<`0x${string}` | undefined> => {
        if (!p.buyerSig || !p.sellerSig) {
            setError("Both signatures required before broadcast");
            setStep("error");
            return;
        }

        setStep("broadcasting");
        setError(null);
        try {
            if (p.agreement) {
                await primeAgreementArtifact({
                    agreementHash: p.commitment.agreementHash,
                    agreement: p.agreement,
                    agreementUri: p.agreementUri,
                });
            } else if (p.agreementUri) {
                saveAgreementUri(p.commitment.agreementHash, p.agreementUri);
                void hydrateAgreement(p.commitment.agreementHash, p.agreementUri).catch(() => null);
            }
            const txHash = await commit(
                p.commitment,
                p.buyerSig,
                p.sellerSig,
            );
            // Persist commitment for later resolution/attestation
            try {
                const hash = computeOrderHash(
                    p.commitment,
                    domain.chainId,
                    domain.verifyingContract,
                );
                saveCommitment(hash, p.commitment);
            } catch { /* localStorage may be unavailable */ }
            setStep("done");
            return txHash;
        } catch (e: unknown) {
            const msg = extractErrorMessage(e, "Broadcast failed");
            setError(msg);
            setStep("error");
            throw e;
        }
    }, [commit, domain.chainId, domain.verifyingContract]);

    return {
        // State
        step,
        error,
        payload,

        // Actions
        signCommitment,
        initiateAsParty,
        counterSign,
        broadcast,
        reset,
    } as const;
}
