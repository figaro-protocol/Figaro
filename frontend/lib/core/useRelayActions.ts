"use client";

/**
 * useRelayActions — the batch path's acts, signed in the wallet and sent to a
 * relay: a commit, a resolve, an attestation and a usage claim.
 *
 * Every signature is made under the batch verifier's EIP-712 domain
 * (`buildDomain(chainId, FigaroBatchVerifier)`), never FigaroCore's: the
 * wallet's prompt names the verifier as its verifying contract. The typed
 * data and the wire are the SDK's (`RESOLVE_PROCESS_TYPES`,
 * `ATTEST_SELLER_TYPES`, `ATTEST_BUYER_TYPES`, `SequencerClient`); nothing
 * here writes to the chain. A relay's answer is an operation id: the act is
 * with the relay and not yet on the chain, and the order's readers show it
 * once its batch lands.
 */
import { useCallback } from "react";
import { useChainId, useSignTypedData } from "wagmi";
import {
    RESOLVE_PROCESS_TYPES,
    buildDomain,
    computeCommitmentProcessId,
    computeOrderHash,
    type Commitment,
} from "@figaro-protocol/sdk";
import {
    ATTEST_BUYER_TYPES,
    ATTEST_SELLER_TYPES,
    type SequencerClient,
    type SequencerUsageClaim,
} from "@figaro-protocol/sdk/agent";
import { pathContract } from "@/lib/core/signedCommitment";
import type { PartyRole } from "@/lib/core/walletProcessQueries";

/** A relay that passed the check against the chain (`checkRelay`). */
export interface KnownRelay {
    url: string;
    client: SequencerClient;
}

/** What a relay answered for one act: the act is with the relay, under this
 *  operation id, and not yet on the chain. */
export interface RelayReceipt {
    act: "commit" | "resolve" | "attest";
    operationId: number;
    relayUrl: string;
    /** A commit's `commitDeadline`: a batch can carry it until then. */
    commitDeadline?: bigint;
}

/** The attestation a batched order carries: the coordinator's arguments, the
 *  same on both paths (`useAttestationCoordinatorActions.buildReceipt`). */
export interface BatchedAttestation {
    /** The attested order's commitment as signed (a root's processId 0). */
    target: Commitment;
    clauseId: `0x${string}`;
    stage: number;
    contentRef: `0x${string}`;
    clauseDataHash: `0x${string}`;
    proof: `0x${string}`[];
}

/** The refusal when no relay that passes the check is known. */
const NO_CHECKED_RELAY =
    "No relay that passes the check against this deployment's batch verifier is known, so nothing was signed or sent.";

export function useRelayActions(relay: KnownRelay | null) {
    // The page's chain: the domain binds each signature to it.
    const chainId = useChainId();
    const { signTypedDataAsync } = useSignTypedData();

    const known = useCallback((): KnownRelay => {
        if (!relay) throw new Error(NO_CHECKED_RELAY);
        return relay;
    }, [relay]);


    /** The buyer's resolve: `ResolveProcess(processId, runningTotal)` signed
     *  under the verifier's domain, at the process's cumulative value (every
     *  order is active until the resolve, so the largest running total).
     *  `commitments` are the orders as signed. */
    const resolveProcess = useCallback(async (processId: `0x${string}`, commitments: Commitment[]): Promise<RelayReceipt> => {
        const { url, client } = known();
        const runningTotal = commitments.reduce((max, c) => (c.runningTotal > max ? c.runningTotal : max), 0n);
        const buyerSig = await signTypedDataAsync({
            domain: buildDomain(chainId, pathContract("batch")),
            types: RESOLVE_PROCESS_TYPES,
            primaryType: "ResolveProcess",
            message: { processId, runningTotal },
        });
        const { id } = await client.submitResolve(processId, runningTotal, commitments, buyerSig);
        return { act: "resolve", operationId: id, relayUrl: url };
    }, [known, chainId, signTypedDataAsync]);

    /** One attestation as `role`: `AttestSeller` or `AttestBuyer` signed under
     *  the verifier's domain over the order's id there, sent in the hash-only
     *  form (fingerprints only, as the coordinator takes them). */
    const attest = useCallback(async (role: PartyRole, at: BatchedAttestation): Promise<RelayReceipt> => {
        const { url, client } = known();
        const verifier = pathContract("batch");
        const domain = buildDomain(chainId, verifier);
        const orderHash = computeOrderHash(at.target, chainId, verifier);
        const witness = {
            target: at.target,
            clauseId: at.clauseId,
            stage: at.stage,
            contentRef: at.contentRef,
            clauseDataHash: at.clauseDataHash,
            inclusionProof: at.proof,
        };
        if (role === "seller") {
            const sellerSig = await signTypedDataAsync({
                domain,
                types: ATTEST_SELLER_TYPES,
                primaryType: "AttestSeller",
                message: { orderHash, clauseId: at.clauseId, stage: at.stage, contentRef: at.contentRef },
            });
            const { id } = await client.submitAttestAsSeller({ ...witness, sellerSig });
            return { act: "attest", operationId: id, relayUrl: url };
        }
        const processId = computeCommitmentProcessId(at.target, chainId, verifier);
        const buyerSig = await signTypedDataAsync({
            domain,
            types: ATTEST_BUYER_TYPES,
            primaryType: "AttestBuyer",
            message: { processId, orderHash, clauseId: at.clauseId, stage: at.stage, contentRef: at.contentRef },
        });
        const { id } = await client.submitAttestAsBuyer({ ...witness, buyerSig });
        return { act: "attest", operationId: id, relayUrl: url };
    }, [known, chainId, signTypedDataAsync]);

    /** Send each usage claim of a resolved batched process to the relay. A
     *  claim is a request to be counted: the proof re-proves it and the
     *  counter applies its own gates. Returns the claims the relay admitted
     *  and the reason of each it refused. */
    const submitUsageClaims = useCallback(async (claims: readonly SequencerUsageClaim[]) => {
        const { client } = known();
        let admitted = 0;
        const refused: string[] = [];
        for (const claim of claims) {
            try {
                await client.submitUsageClaim(claim);
                admitted++;
            } catch (error) {
                refused.push(`${claim.clause_or_process}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return { admitted, refused };
    }, [known]);

    return { relay, resolveProcess, attest, submitUsageClaims };
}

/** Send a fully signed commitment, both signatures under the verifier's
 *  domain, to `relay`. The verifier pulls both bonds when a batch carries it, and the
 *  relay refuses a commitment whose bonds are not funded to the verifier. No
 *  signature is made here: either party, or anyone, may send it. */
export async function commitThroughRelay(
    relay: KnownRelay | null,
    commitment: Commitment,
    buyerSig: `0x${string}`,
    sellerSig: `0x${string}`,
): Promise<RelayReceipt> {
    if (!relay) throw new Error(NO_CHECKED_RELAY);
    const { id } = await relay.client.submitCommit(commitment, buyerSig, sellerSig);
    return { act: "commit", operationId: id, relayUrl: relay.url, commitDeadline: commitment.commitDeadline };
}
