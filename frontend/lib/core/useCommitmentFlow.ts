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
import { getE2EModeFromSearchParams } from "@/lib/shared/e2e";
import { isValidAddress } from "@/components/operators/TokenAddressInput";
import { extractErrorMessage } from "@/lib/shared/errors";
import { saveCommitment, computeOrderHash } from "@/lib/core/commitmentStore";
import type { Agreement } from "@/lib/core/agreementManifest";
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

interface JsonRpcRequest {
    method: string;
    params?: unknown[];
}

interface InjectedEthereumProvider {
    request<T = unknown>(args: JsonRpcRequest): Promise<T>;
}

/**
 * Direct `window.ethereum` access for the **devnet shortcut path only**.
 *
 * Production signing flows go through wagmi's `useSignTypedData` and the
 * EIP-6963-discovered provider — not this helper. Reading `window.ethereum`
 * directly is a known soft attack surface (a malicious browser extension
 * can shadow the property after page load), so the helper bails on
 * production builds even if some future call site tries to use it. See
 * `docs/v5/AUDIT_REPORT.md` "Web2 / UI / Specific-Feature Audits → UI ↔ MetaMask Injection Threat Model".
 *
 * The threat model 🟡 Priority 2 fix landed here: gate the helper to dev
 * builds + scope the call to the devnet shortcut branch. Production calls
 * are blocked at runtime, not just by upstream control flow.
 */
function getInjectedEthereumProvider(): InjectedEthereumProvider | null {
    if (typeof window === "undefined") {
        return null;
    }

    if (process.env.NODE_ENV === "production") {
        // Defense-in-depth: even if some future code path tries to call
        // this in prod, it bails. Production sign flows must go through
        // wagmi connectors (EIP-6963 discovery), never direct window.ethereum.
        return null;
    }

    const candidate = (window as Window & { ethereum?: Partial<InjectedEthereumProvider> }).ethereum;
    if (!candidate || typeof candidate.request !== "function") {
        return null;
    }

    return candidate as InjectedEthereumProvider;
}

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

    const signCommitment = useCallback(async (commitment: Commitment): Promise<`0x${string}`> => {
        setError(null);
        setStep("signing");
        try {
            // Pre-sign domain-separator gate. Refuses to call the wallet
            // if the EIP-712 domain has been tampered or is misconfigured.
            assertValidSigningDomain(domain);

            // Threat-model 🟡 Priority 4: gate signing on a pre-sign agreement
            // preview. The wallet prompt only shows the agreementHash; the
            // user has no way to verify in MetaMask that the hash matches the
            // intended terms. This loads the agreement (if available locally)
            // and posts a confirmation request to the global
            // CommitmentSignPreviewProvider, which renders an
            // AgreementPreviewModal showing the human-readable terms next to
            // the hash. Only after the user clicks Confirm does the wallet
            // prompt open.
            const agreement = loadAgreement(commitment.agreementHash);
            const approved = await requestSignConfirmation(commitment, agreement);
            if (!approved) {
                const msg = "Signing cancelled by user";
                setError(msg);
                setStep("idle");
                throw new Error(msg);
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
        role: "buyer" | "seller",
        meta?: CommitmentPayloadMeta,
    ): Promise<CommitmentPayload> => {
        const sig = await signCommitment(commitment);

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

    // ── Convenience: sign + broadcast in one step (both parties same wallet, devnet) ──

    const signAndBroadcast = useCallback(async (
        commitment: Commitment,
        meta?: CommitmentPayloadMeta,
        initiatorRole?: "buyer" | "seller",
    ) => {
        const e2eMode = typeof window === "undefined"
            ? null
            : getE2EModeFromSearchParams(window.location.search);
        const isE2EMock = e2eMode === "mock" && process.env.NODE_ENV !== "production";
        const isDevnet = e2eMode === "devnet" && process.env.NODE_ENV !== "production";
        const normalizedAddress = address?.toLowerCase();
        const sameParty = hexEqual(commitment.buyer, commitment.seller);
        const resolvedInitiatorRole = initiatorRole
            ?? (normalizedAddress === commitment.buyer.toLowerCase()
                ? "buyer"
                : normalizedAddress === commitment.seller.toLowerCase()
                    ? "seller"
                    : undefined);

        let buyerSig: `0x${string}` | undefined;
        let sellerSig: `0x${string}` | undefined;

        if (isE2EMock) {
            const mockSig = ("0x" + "00".repeat(65)) as `0x${string}`;
            buyerSig = mockSig;
            sellerSig = mockSig;
        } else {
            if (!sameParty && !resolvedInitiatorRole) {
                const msg = "Connected wallet must match the buyer or seller to initiate this commitment";
                setError(msg);
                setStep("error");
                throw new Error(msg);
            }

            const initiatorSig = await signCommitment(commitment);

            if (sameParty) {
                buyerSig = initiatorSig;
                sellerSig = initiatorSig;
            } else if (resolvedInitiatorRole === "buyer") {
                buyerSig = initiatorSig;
            } else {
                sellerSig = initiatorSig;
            }

            if (isDevnet) {
                // Devnet-only path: resolve the injected provider lazily so a
                // production build cannot accidentally enter this branch with
                // a `window.ethereum` reference cached in scope.
                // `getInjectedEthereumProvider` is also gated to NODE_ENV !==
                // "production" as defense-in-depth.
                const injectedProvider = getInjectedEthereumProvider();
                if (!injectedProvider || !resolvedInitiatorRole) {
                    throw new Error("Devnet shortcut requires an injected provider and a recognized participant role");
                }

                const counterpartyAddress = resolvedInitiatorRole === "buyer"
                    ? commitment.seller
                    : commitment.buyer;

                // Devnet: request the missing counterparty signature via raw RPC
                // against Anvil's unlocked accounts. Serialization must match viem:
                //   - BigInt -> decimal string
                //   - EIP712Domain omitted from the explicit types map
                const typedData = JSON.stringify({
                    types: COMMITMENT_TYPES,
                    primaryType: "Commitment",
                    domain,
                    message: Object.fromEntries(
                        Object.entries(commitment).map(([k, v]) =>
                            [k, typeof v === "bigint" ? v.toString() : v]
                        )
                    ),
                });
                const counterpartySig = await injectedProvider.request<`0x${string}`>({
                    method: "eth_signTypedData_v4",
                    params: [counterpartyAddress, typedData],
                });

                if (resolvedInitiatorRole === "buyer") {
                    sellerSig = counterpartySig;
                } else {
                    buyerSig = counterpartySig;
                }

                if (commitment.currency) {
                    const coreHex = (CONTRACTS.core as string).slice(2).toLowerCase().padStart(64, "0");
                    const approveData = `0x095ea7b3${coreHex}${"f".repeat(64)}`;
                    await injectedProvider.request<`0x${string}`>({
                        method: "eth_sendTransaction",
                        params: [{ from: counterpartyAddress, to: commitment.currency, data: approveData }],
                    });
                }
            } else if (!buyerSig || !sellerSig) {
                const msg = "Normal wallets must use the multi-party signing flow before broadcasting";
                setError(msg);
                setStep("error");
                throw new Error(msg);
            }
        }

        const p: CommitmentPayload = {
            commitment,
            buyerSig,
            sellerSig,
            agreement: meta?.agreement,
            agreementUri: meta?.agreementUri,
        };
        setPayload(p);
        return broadcast(p);
    }, [address, signCommitment, broadcast, domain]);

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
        signAndBroadcast,
        reset,
    } as const;
}
