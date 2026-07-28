/**
 * lib/designer/publishAssembly.ts — AUTHORING: pin + anchor an assembly.
 *
 * Designer-tier only. Builds the off-chain assembly template from a design
 * snapshot, pins it to IPFS, and registers it on `AssemblyRegistry`.
 * READING published assemblies (the `AssemblyChoice` enrichment) lives in
 * `@/lib/protocol/assemblyChoices` — design is design; reading is everyone's.
 *
 * Publish flow:
 *   1. Build a full off-chain assemblyTemplate from the snapshot — one
 *      agreement per canvas order (clauses inlined, topology as a clause),
 *      plus prose.
 *   2. Compute the canonical composition hash (keccak256 of the stable-JSON
 *      composition subset — the assembly's identity).
 *   3. Pin the assemblyTemplate to IPFS via DEFAULT_IPFS_SERVICE.
 *   4. Call AssemblyRegistry.registerAssembly(compositionHash, contentURI).
 *      Before the call, a CLIENT-SIDE publish guard checks
 *      that the agreement count fits the per-process gas
 *      ceiling, derived at runtime from the active chain's block gas limit
 *      via `maxOrdersResolvablePerProcess` in `@/lib/shared/chainGasCeilings`.
 *      The count is not a contract parameter and is never stored on-chain.
 *
 * No graceful retry, no optimistic UI — the publish is a single atomic
 * step from the user's POV: success means the composition is permanently
 * bound to (msg.sender, ipfs URI).
 */

import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { verifyTxSuccess } from "@/lib/shared/verifyTxSuccess";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import type { DesignSnapshot } from "@/lib/designer/syntheticDesignStore";
import { buildAssemblyTemplate, serializeAssemblyTemplate } from "@figaro/sdk";
import { specSource } from "@/lib/shared/clauseSpecSource";
import { deriveAssemblySlug } from "@/lib/shared/assemblyTemplate";
import { maxOrdersResolvablePerProcess } from "@/lib/shared/chainGasCeilings";
import { ASSEMBLY_REGISTRY_ABI } from "@/lib/kernel/contracts";
import {
    getAssemblyRegistry,
    translatePublishRevert,
    type PublishOutcome,
} from "@/lib/protocol/useAssemblyRegistry";

export function usePublishAssembly() {
    const client = usePublicClient();
    const { address } = useAccount();
    const { writeContractAsync, data: hash, isPending, error: writeError } =
        useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    /** Build a assemblyTemplate from the snapshot, pin to IPFS, fetch the
     *  registry's deposit amount, simulate to catch reverts (composition
     *  already anchored, wrong deposit) BEFORE opening the wallet, send the
     *  transaction, then wait for the receipt and verify status is
     *  `success`. Returns the transaction hash + IPFS URI on confirmed
     *  success. Throws on any failure — no wallet, IPFS down,
     *  insufficient ETH, composition collision, on-chain revert, etc. */
    async function publish(snapshot: DesignSnapshot): Promise<PublishOutcome> {
        const registry = getAssemblyRegistry();
        if (!registry) {
            throw new Error(
                "AssemblyRegistry address not configured (NEXT_PUBLIC_ASSEMBLY_REGISTRY).",
            );
        }
        if (!client) {
            throw new Error("No public client available to read the registration deposit.");
        }
        if (!address) {
            throw new Error("Connect a wallet before publishing.");
        }
        // Hard cap = the resolve ceiling: every order must settle in one atomic
        // resolveProcess within a block. Same ceiling the designer canvas gates
        // node addition on, so an assembly authored there never trips this — the
        // guard catches forked / hand-crafted templates. (Commit landing rate is
        // a checkout-time signal, not a size cap; see chainGasCeilings.)
        const perProcessCap = await maxOrdersResolvablePerProcess(client);
        if (snapshot.orders.length > perProcessCap) {
            throw new Error(
                `Assembly has ${snapshot.orders.length} orders; this chain settles at most ${perProcessCap} in one atomic resolveProcess. Compose multiple processes instead.`,
            );
        }
        const deposit = await client.readContract({
            address: registry,
            abi: ASSEMBLY_REGISTRY_ABI,
            functionName: "registrationDeposit",
        });
        // Publish the no-hash assembly template: per order, who's bound, its
        // topology parents, and the selected clauses. The fingerprint forms later
        // at checkout when the parties fill the clause fields.
        // buildAssemblyTemplate VERIFIES scope placement (ruled 2026-07-28):
        // an assembly-scoped clause on an order, or an agreement-scoped one at
        // assembly level, throws here — publish refuses, never a silent no-op.
        const template = buildAssemblyTemplate({
            name: snapshot.name.trim() || undefined,
            summary: snapshot.summary?.trim() || undefined,
            description: snapshot.description?.trim() || undefined,
            orders: snapshot.orders,
            clausesByOrderId: snapshot.clausesByOrderId ?? {},
            clauseVersionsByOrderId: snapshot.clauseVersionsByOrderId,
            assemblyClauses: snapshot.assemblyClauses,
            assemblyClauseVersions: snapshot.assemblyClauseVersions,
            specs: specSource(),
        });
        const { json, compositionHash } = serializeAssemblyTemplate(template);
        // The slug is presentation, derived from the composition hash —
        // identical compositions collapse to one on-chain binding (the
        // registry's first-write-wins dedups them); the user never names it.
        const slug = deriveAssemblySlug(compositionHash);
        const ipfs = await DEFAULT_IPFS_SERVICE.publishJSON(JSON.parse(json));

        // Simulate before opening the wallet — catches composition collision /
        // wrong-deposit reverts so the user sees a typed error instead of
        // a silent on-chain revert post-submission.
        try {
            await client.simulateContract({
                address: registry,
                abi: ASSEMBLY_REGISTRY_ABI,
                functionName: "registerAssembly",
                args: [compositionHash, ipfs.uri],
                value: deposit,
                account: address,
            });
        } catch (err) {
            throw translatePublishRevert(err, slug);
        }

        const txHash = await writeContractAsync({
            address: registry,
            abi: ASSEMBLY_REGISTRY_ABI,
            functionName: "registerAssembly",
            args: [compositionHash, ipfs.uri],
            value: deposit,
        });

        // Wait for the transaction to be mined and verify it didn't revert
        // on-chain. `writeContractAsync` only confirms wallet submission;
        // without this wait the UI could declare success on a transaction
        // that the chain ultimately rejected.
        await verifyTxSuccess(client, txHash, "The composition binding was not created.");

        return { hash: txHash, ipfsURI: ipfs.uri, slug };
    }

    return {
        publish,
        hash,
        isPending,
        isConfirming,
        isSuccess,
        error: writeError,
    };
}
