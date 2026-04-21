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
import { useFigaroActions, Commitment, ZERO_PROCESS_ID } from "@/lib/core/useFigaroActions";
import { saveCommitment, computeOrderHash } from "@/lib/console/commitmentStore";
import type { Agreement } from "@/lib/core/agreementManifest";
import { hydrateAgreement, primeAgreementArtifact, saveAgreementUri } from "@/lib/core/agreementStore";

// ── EIP-712 Domain (V5: version "3") ──────────────────────────

function useFigaroDomain() {
    const chainId = useChainId();
    return {
        name: "FigaroCore",
        version: "3",
        chainId,
        verifyingContract: CONTRACTS.core as `0x${string}`,
    } as const;
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

function getInjectedEthereumProvider(): InjectedEthereumProvider | null {
    if (typeof window === "undefined") {
        return null;
    }

    const candidate = (window as Window & { ethereum?: Partial<InjectedEthereumProvider> }).ethereum;
    if (!candidate || typeof candidate.request !== "function") {
        return null;
    }

    return candidate as InjectedEthereumProvider;
}

function getE2EMode(): "mock" | "devnet" | null {
    if (typeof window === "undefined") {
        return null;
    }

    const mode = new URLSearchParams(window.location.search).get("e2e");
    return mode === "mock" || mode === "devnet" ? mode : null;
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
        return JSON.parse(raw, (_k, v) =>
            typeof v === "string" && v.startsWith("0xn") ? BigInt(`0x${v.slice(3)}`) : v,
        );
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
            const msg = e instanceof Error ? e.message : "Signature rejected";
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
        const isBuyer = address?.toLowerCase() === incoming.commitment.buyer.toLowerCase();
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
            const msg = e instanceof Error ? e.message : "Broadcast failed";
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
        const e2eMode = getE2EMode();
        const isE2EMock = e2eMode === "mock" && process.env.NODE_ENV !== "production";
        const isDevnet = e2eMode === "devnet" && process.env.NODE_ENV !== "production";
        const injectedProvider = getInjectedEthereumProvider();
        const normalizedAddress = address?.toLowerCase();
        const sameParty = commitment.buyer.toLowerCase() === commitment.seller.toLowerCase();
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
