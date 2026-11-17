"use client";

/**
 * useRegisterClause — the `ClauseRegistry` hooks that need a wallet provider:
 * the registration write (`useRegisterClause`) and the read scoped to the
 * connected wallet through wagmi's client (`useRegisteredClausesByWallet`).
 * The reads a page with no wallet provider uses are in
 * `@/lib/protocol/useClauseRegistry`, which imports nothing from `wagmi`.
 */

import { type Abi } from "viem";
import { canonicalize, computeClauseKey } from "@figaro-protocol/sdk";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { CLAUSE_REGISTRY_ABI } from "@/lib/core/contracts";
import type { publicClient } from "@/lib/shared/publicClient";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import { simulateWriteVerify } from "@/lib/shared/contractWrite";
import {
    clauseRegisterRevertMessage,
    getClauseRegistry,
    useClauseRegistryScan,
} from "@/lib/protocol/useClauseRegistry";

/** Read all `ClauseRegistered` events filtered by the registering wallet. Sorts
 *  most-recent block first. Call `refetch` to pick up newly registered clauses. */
export function useRegisteredClausesByWallet(registeredBy: `0x${string}` | undefined) {
    const client = usePublicClient();
    return useClauseRegistryScan({
        registeredBy,
        enabled: !!client && !!registeredBy,
        client: client as typeof publicClient | undefined,
    });
}

/** The confirmed outcome of a `registerClause` — the registered identity plus
 *  the anchored locator, enough to render a receipt and link to the live
 *  `/clauses` inventory where the clause now appears. */
export interface RegisterClauseOutcome {
    hash: `0x${string}`;
    /** The spec's own presentation fields — what a receipt shows. */
    clauseId: string;
    version: number;
    /** `computeClauseKey` of the spec — the on-chain key. */
    clauseKey: `0x${string}`;
    contentURI: string;
}

/**
 * Register a clause on `ClauseRegistry.registerClause` (payable). Mirrors the
 * assembly publish flow (`usePublishAssembly`) for clauses: pin the RAW spec
 * document's canonical bytes (`canonicalize`, `block` included, so a reader
 * gets the presentation with the spec), take the clause key as `keccak256` of
 * the canonical bytes of the spec without `block` (`computeClauseKey`), read the
 * registry's stake ON DEMAND, simulate to surface a typed revert before
 * opening the wallet, send, then wait for a `success` receipt.
 *
 * The caller validates well-formedness via `@figaro-protocol/sdk/clauses`
 * (`parseClauseSpec`) BEFORE calling this — the same off-chain gate that runs
 * at sign-time. This hook takes the already-parsed raw document and does the
 * pin + anchor. Throws on any failure (no wallet, IPFS down, wrong deposit,
 * already-registered collision, on-chain revert).
 */
export function useRegisterClause() {
    const client = usePublicClient();
    const { address } = useAccount();
    const { writeContractAsync, isPending } = useWriteContract();

    async function register(rawSpec: Record<string, unknown>): Promise<RegisterClauseOutcome> {
        const registry = getClauseRegistry();
        if (!registry) {
            throw new Error("ClauseRegistry address not configured (NEXT_PUBLIC_CLAUSE_REGISTRY).");
        }
        if (!client) throw new Error("No public client available to read the registration stake.");
        if (!address) throw new Error("Connect a wallet before registering a clause.");

        const clauseId = rawSpec.clauseId as string;
        const version = Number(rawSpec.version);

        // The key covers the spec without `block`; a reader parses the bytes
        // it fetches, drops `block` and recomputes it. The bytes pinned are the
        // canonical form (sorted keys, no whitespace) with `block` included —
        // the convention populate-clauses.mjs pins too.
        const bytes = canonicalize(rawSpec);
        const clauseKey = computeClauseKey(rawSpec);
        const cid = await DEFAULT_IPFS_SERVICE.pinBlob(new Blob([bytes], { type: "application/json" }));
        const uri = DEFAULT_IPFS_SERVICE.buildURI(cid);

        // No reward tag is anchored: the 600M reward is UNIFORM
        // — every clause and assembly scores on its real usage
        // alone, with no category or weight — so the registry stores no
        // incentive input. The only classification a clause carries is
        // `block.design.article`, a reader grouping that stays off-chain
        // entirely.
        const deposit = await client.readContract({
            address: registry,
            abi: CLAUSE_REGISTRY_ABI,
            functionName: "registrationDeposit",
        });

        const txHash = await simulateWriteVerify({
            client,
            writeContractAsync,
            address: registry,
            abi: CLAUSE_REGISTRY_ABI as Abi,
            functionName: "registerClause",
            args: [clauseKey, uri],
            value: deposit,
            account: address,
            revertMessage: (errorName, args) => clauseRegisterRevertMessage(errorName, args, `${clauseId}@${version}`),
            failureMessage: "The clause was not registered.",
        });
        return { hash: txHash, clauseId, version, clauseKey, contentURI: uri };
    }

    return { register, isPending };
}
