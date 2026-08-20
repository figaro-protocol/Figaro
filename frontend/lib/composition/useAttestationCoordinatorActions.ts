"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { activeChain, DEVNET_CHAIN_ID } from "@/lib/shared/chains";
import type { Hex } from "viem";
import { ATTESTATION_COORDINATOR_ABI } from "@figaro-protocol/sdk";
import { getAttestationCoordinator } from "@/lib/composition/contracts";
import { extractErrorMessage } from "@/lib/shared/errors";
import { fetchAgreement } from "@/lib/kernel/agreementFetch";
import { getAllOrderCommitted, getStringArg } from "@/lib/kernel/indexer";
import { restoreSignedProcessId } from "@/lib/kernel/signedCommitment";
import { keccak256 } from "viem";
import { computeClauseKey } from "@figaro-protocol/sdk";
import { hexEqual } from "@/lib/shared/evm";
import { truncateHex } from "@/lib/shared/formatHex";
import { buildSectionInclusionProof, sectionDataHash, type Commitment } from "@figaro-protocol/sdk";
import { publishWitnessContent } from "@/lib/composition/witnessContent";

type SellerAttestationInput = {
    /** The order being attested — its `agreementHash` anchors the inclusion proof. */
    orderHash: Hex;
    clauseId: Hex;
    stage: number;
    /**
     * ABI-encoded content per the clause's encoding. Omit to default to the
     * committed `sectionData` — correct when the attestation RE-ASSERTS the
     * committed section (content == sectionData; e.g. handoff, geo, modality,
     * emissions-disclosure). Supply an explicit value when the runtime witness DIFFERS
     * from the committed section (merchant-process / courier-process ladders,
     * proximity proof, measurement). Either way the attestation is merkle-bound
     * to the committed clause under `agreementHash` — that binding is the check,
     * uniform across both; there is no "cross-checked" vs "runtime" clause tier.
     */
    content?: Hex;
    failureMessage?: string;
};

type BuyerAttestationInput = {
    /** The order being attested. Caller must equal `c.buyer` (which equals
     *  the process's rootBuyer by commit invariant). */
    orderHash: Hex;
    clauseId: Hex;
    stage: number;
    /** See `SellerAttestationInput.content`. Omit to default to sectionData. */
    content?: Hex;
    failureMessage?: string;
};

export function useAttestationCoordinatorActions() {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const chain = activeChain;
    const coordinator = getAttestationCoordinator();
    const hasCoordinator = !!coordinator;
    const { writeContractAsync, data: hash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
    const [error, setError] = useState("");

    const ensureCoordinatorAccess = useCallback(() => {
        if (!coordinator || !address) {
            const message = "Attestation coordinator unavailable for this wallet or network.";
            setError(message);
            throw new Error(message);
        }
        return { account: address, coordinator };
    }, [coordinator, address]);

    const loadCommitment = useCallback(async (orderHash: Hex) => {
        if (!publicClient) {
            const message = "Attestation coordinator unavailable for this wallet or network.";
            setError(message);
            throw new Error(message);
        }
        // Reconstruct the target Commitment from its OrderCommitted event — the
        // indexer is the source, no commitment store.
        const chainId = publicClient.chain?.id ?? DEVNET_CHAIN_ID;
        const log = (await getAllOrderCommitted(publicClient, chainId))
            .find((l) => getStringArg(l, "orderHash") === orderHash);
        if (!log) {
            const message = `Unable to reconstruct commitment for ${truncateHex(orderHash, { head: 10, tail: 0 })}`;
            setError(message);
            throw new Error(message);
        }
        const args = (log as { args?: Record<string, unknown> }).args ?? {};
        const c: Commitment = {
            processId: String(args.processId) as Hex,
            buyer: String(args.buyer) as Hex,
            seller: String(args.seller) as Hex,
            currency: String(args.currency) as Hex,
            payment: BigInt((args.payment as bigint | string | number) ?? 0),
            expectedCumulativeValue: BigInt((args.cumulativeValue as bigint | string | number) ?? 0),
            agreementHash: String(args.agreementHash) as Hex,
            salt: BigInt((args.salt as bigint | string | number) ?? 0),
            deadline: BigInt((args.deadline as bigint | string | number) ?? 0),
        };
        // The coordinator recomputes orderHash from hashStruct(commitment), so it
        // needs the SIGNED commitment — restore the root's processId 0.
        return restoreSignedProcessId(c, chainId);
    }, [publicClient]);

    /**
     * Build the `sectionHash` + inclusion `proof` arguments for an attestation
     * against a target order's `agreementHash`. Hydrates the signed agreement
     * assemblyTemplate (from localStorage or IPFS), finds the clause for `clauseId`,
     * and produces the merkle inclusion proof the coordinator verifies. Returns
     * the section FINGERPRINT (`keccak256` of its canonical bytes), never the
     * preimage — the coordinator takes only the hash, so a private section's
     * plaintext never touches calldata.
     */
    const buildReceipt = useCallback(async (targetAgreementHash: Hex, clauseId: Hex) => {
        const agreement = await fetchAgreement(targetAgreementHash);
        if (!agreement) {
            const message = `Agreement assemblyTemplate unavailable for ${truncateHex(targetAgreementHash, { head: 10, tail: 0 })} — `
                + `cannot generate inclusion proof`;
            setError(message);
            throw new Error(message);
        }
        // The clauseId here is a runtime value (the clause being attested), not a
        // hardcoded literal — find its section by matching the on-chain id.
        const section = agreement.sections.find((s) => hexEqual(computeClauseKey(s.clause, s.version), clauseId));
        if (!section) {
            const message = `Clause ${truncateHex(clauseId, { head: 10, tail: 0 })} not committed in the signed agreement`;
            setError(message);
            throw new Error(message);
        }
        const sectionHash = sectionDataHash(section);
        const { proof } = buildSectionInclusionProof(agreement, section.clause);
        return { sectionHash, proof };
    }, []);

    const submitSellerAttestation = useCallback(async ({
        orderHash,
        clauseId,
        stage,
        content,
        failureMessage = "Transaction failed",
    }: SellerAttestationInput) => {
        const { account, coordinator: attestationCoordinator } = ensureCoordinatorAccess();
        setError("");
        try {
            const target = await loadCommitment(orderHash);
            const { sectionHash, proof } = await buildReceipt(target.agreementHash as Hex, clauseId);
            // Re-assert (content omitted) ⇒ contentRef IS the committed section's
            // fingerprint; otherwise bind the runtime content by its hash. The
            // content preimage lives off-chain, never in calldata.
            const contentRef = content ? keccak256(content) : sectionHash;

            // Public-disposition content publishes at its fingerprint-derived
            // keccak-CID so any audit reader can resolve the values; private or
            // unknown-spec content is withheld inside (fail-closed). Published
            // BEFORE the broadcast: the chain event is what readers key on, so
            // the preimage must be resolvable the moment the event exists — a
            // post-broadcast pin races the caller's next navigation and dies
            // mid-flight. Best-effort: a pin failure never blocks the
            // attestation (an unattested orphan pin is public content, erasable).
            // Re-asserts publish nothing: their preimage is the committed
            // section, already in the agreement pin.
            if (content) await publishWitnessContent({ clauseId, stage, content });

            return await writeContractAsync({
                address: attestationCoordinator,
                abi: ATTESTATION_COORDINATOR_ABI,
                functionName: "attestAsSeller",
                args: [target, target, clauseId, stage, sectionHash, proof, contentRef],
                account,
                chain,
            });
        } catch (cause: unknown) {
            const message = extractErrorMessage(cause, failureMessage);
            setError(message);
            throw new Error(message);
        }
    }, [ensureCoordinatorAccess, loadCommitment, buildReceipt, writeContractAsync, chain]);

    const submitBuyerAttestation = useCallback(async ({
        orderHash,
        clauseId,
        stage,
        content,
        failureMessage = "Transaction failed",
    }: BuyerAttestationInput) => {
        const { account, coordinator: attestationCoordinator } = ensureCoordinatorAccess();
        setError("");
        try {
            const target = await loadCommitment(orderHash);
            const { sectionHash, proof } = await buildReceipt(target.agreementHash as Hex, clauseId);
            // Re-assert (content omitted) ⇒ contentRef IS the committed section's
            // fingerprint; otherwise bind the runtime content by its hash.
            const contentRef = content ? keccak256(content) : sectionHash;

            // Same publication seam as the seller path — see the note there
            // (publish before broadcast: readers key on the chain event).
            if (content) await publishWitnessContent({ clauseId, stage, content });

            return await writeContractAsync({
                address: attestationCoordinator,
                abi: ATTESTATION_COORDINATOR_ABI,
                functionName: "attestAsBuyer",
                args: [target, clauseId, stage, sectionHash, proof, contentRef],
                account,
                chain,
            });
        } catch (cause: unknown) {
            const message = extractErrorMessage(cause, failureMessage);
            setError(message);
            throw new Error(message);
        }
    }, [ensureCoordinatorAccess, loadCommitment, buildReceipt, writeContractAsync, chain]);

    return {
        submitSellerAttestation,
        submitBuyerAttestation,
        // Composable building blocks — a custom attestation surface can
        // reconstruct the commitment and build the inclusion receipt without
        // re-implementing either step.
        loadCommitment,
        buildReceipt,
        isPending,
        isConfirming,
        isSuccess,
        error,
        isAvailable: hasCoordinator && !!address,
    };
}