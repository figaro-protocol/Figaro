/**
 * lib/designer/publishAssembly.ts — AUTHORING: pin + anchor an assembly.
 *
 * Designer-tier only. Builds the off-chain assembly from a design
 * snapshot, registers each newly agreement on `AgreementRegistry`,
 * pins the assembly to IPFS, and registers it on `AssemblyRegistry`.
 * READING published assemblies (the `AssemblyChoice` enrichment) lives in
 * `@/lib/protocol/assemblyChoices` — design is design; reading is everyone's.
 *
 * Publish flow:
 *   1. Build the assembly from the snapshot — one agreement per canvas
 *      order, each binding a registered agreement by key (one the designer
 *      bound, or one newly composed from the order's clauses), the topology
 *      parents in the agreement's own fill — plus prose.
 *   2. Compute the composition root (the merkle root over the agreements
 *      and the assembly terms — the assembly's identity).
 *   3. Pin the assembly to IPFS and simulate
 *      AssemblyRegistry.registerAssembly(compositionHash, contentURI); pin
 *      each newly agreement no registry binds yet and simulate its
 *      AgreementRegistry.registerAgreement(key, uri). Every check passes
 *      before any write is sent.
 *   4. Send each agreement registration with its stake — one transaction,
 *      one receipt each — then registerAssembly.
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
import type { Abi } from "viem";
import { publishTail } from "@/lib/protocol/publishTail";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import type { DesignSnapshot } from "@/lib/designer/syntheticDesignStore";
import { AGREEMENT_REGISTRY_ABI, canonicalize, composeOrderAgreement, serializeAssembly, type RegisteredAgreement } from "@figaro-protocol/sdk";
import { snapshotToAssembly } from "@/lib/designer/draftToAssembly";
import { specSource } from "@/lib/shared/clauseSpecSource";
import { getRegisteredAgreement } from "@/lib/protocol/useAgreementRegistry";
import { deriveAssemblySlug } from "@/lib/shared/assembly";
import { hexEqual } from "@/lib/shared/evm";
import { maxOrdersResolvablePerProcess } from "@/lib/shared/chainGasCeilings";
import { ASSEMBLY_REGISTRY_ABI } from "@/lib/kernel/contracts";
import {
    getAgreementRegistry,
    readAgreementBinding,
    translateAgreementRegisterRevert,
} from "@/lib/protocol/useAgreementRegistry";
import {
    getAssemblyRegistry,
    translatePublishRevert,
    type PublishOutcome,
} from "@/lib/protocol/useAssemblyRegistry";

/** The client a registration needs: the stake read, the simulation and the receipt. */
type RegistrationClient = Parameters<typeof publishTail>[0]["client"] & {
    readContract(args: { address: `0x${string}`; abi: Abi; functionName: string }): Promise<unknown>;
};

export interface RegisteredAgreementOutcome {
    agreementKey: `0x${string}`;
    /** The registration's transaction and pinned document, or null when the
     *  registry already bound the key (first write wins; nothing was sent). */
    hash: `0x${string}` | null;
    ipfsURI: string | null;
}

/**
 * Pin ONE agreement and register it on `AgreementRegistry` under its
 * key with the registry's stake — the one registration path, whether a
 * designer registers an agreement on its own from the drawer or an assembly's
 * publish registers each agreement's new agreement. A key the registry
 * already binds is skipped and reported as such: the same clauses always key
 * to one registration. Every check (the pin, the simulation) passes before
 * the wallet opens; the write waits for a `success` receipt.
 */
export async function registerAgreement(args: {
    client: RegistrationClient;
    writeContractAsync: Parameters<typeof publishTail>[0]["writeContractAsync"];
    address: `0x${string}`;
    doc: RegisteredAgreement;
    agreementKey: `0x${string}`;
    ipfs?: Pick<typeof DEFAULT_IPFS_SERVICE, "publishJSON">;
    readBinding?: typeof readAgreementBinding;
}): Promise<RegisteredAgreementOutcome> {
    const { client, writeContractAsync, address, doc, agreementKey } = args;
    const ipfs = args.ipfs ?? DEFAULT_IPFS_SERVICE;
    const readBinding = args.readBinding ?? readAgreementBinding;
    const agreementRegistry = getAgreementRegistry();
    if (!agreementRegistry) {
        throw new Error("AgreementRegistry address not configured (NEXT_PUBLIC_AGREEMENT_REGISTRY).");
    }
    if (await readBinding(agreementKey, client as never)) {
        return { agreementKey, hash: null, ipfsURI: null };
    }
    const agreementDeposit = (await client.readContract({
        address: agreementRegistry,
        abi: AGREEMENT_REGISTRY_ABI as Abi,
        functionName: "registrationDeposit",
    })) as bigint;
    // The pinned document carries the designer's words beside the clauses;
    // the key is over the clauses alone.
    const pinned = await ipfs.publishJSON(JSON.parse(canonicalize(doc)));
    const hash = await publishTail({
        client,
        writeContractAsync,
        address: agreementRegistry,
        abi: AGREEMENT_REGISTRY_ABI as Abi,
        functionName: "registerAgreement",
        args: [agreementKey, pinned.uri],
        value: agreementDeposit,
        account: address,
        translateRevert: (err) => translateAgreementRegisterRevert(err, agreementKey),
        failureMessage: "The agreement registration was not created.",
    });
    return { agreementKey, hash, ipfsURI: pinned.uri };
}

/**
 * Register ONE order's agreement on its own, from the drawer: the
 * clauses the designer selected for the order compose through the SDK's one
 * composition rule (`composeOrderAgreement` — the clauses of the registered
 * agreement picked in the mandatory article merged, value-free but for design
 * fills, the scope check), then `registerAgreement`.
 * The registered key is what the agreement then binds, and what any other
 * assembly's drawer offers from the live registry.
 */
export function usePublishAgreement() {
    const client = usePublicClient();
    const { address } = useAccount();
    const { writeContractAsync, isPending } = useWriteContract();

    async function publishAgreement(args: {
        clauses: Readonly<Record<`0x${string}`, Record<string, unknown>>>;
        /** The `AgreementRegistry` key the order picked in the mandatory article. */
        mandatoryAgreementKey?: `0x${string}`;
        name?: string;
    }): Promise<RegisteredAgreementOutcome> {
        if (!client) throw new Error("No public client available to read the registration stake.");
        if (!address) throw new Error("Connect a wallet before registering an agreement.");
        if (Object.keys(args.clauses).length === 0) {
            throw new Error("Compose at least one clause on this order before registering its agreement.");
        }
        if (!args.mandatoryAgreementKey) {
            throw new Error("Pick a registered agreement in the mandatory article before registering this order's agreement.");
        }
        const mandatory = getRegisteredAgreement(args.mandatoryAgreementKey);
        if (!mandatory) {
            throw new Error(`the registered agreement ${args.mandatoryAgreementKey} picked in the mandatory article has not been read from the AgreementRegistry yet`);
        }
        const { composed, agreementKey } = composeOrderAgreement({ clauses: args.clauses, mandatory, specs: specSource() });
        const doc: RegisteredAgreement = { ...(args.name ? { name: args.name } : {}), ...composed };
        return registerAgreement({ client: client as never, writeContractAsync, address, doc, agreementKey });
    }

    return { publishAgreement, isPending };
}

export function usePublishAssembly() {
    const client = usePublicClient();
    const { address } = useAccount();
    const { writeContractAsync, data: hash, isPending, error: writeError } =
        useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    /** Build the assembly from the snapshot, register each newly composed
     *  agreement, pin the assembly to IPFS, fetch the registry's stake amount,
     *  simulate to catch reverts (composition already anchored, wrong stake)
     *  BEFORE opening the wallet, send the transaction, then wait for the
     *  receipt and verify status is `success`. Returns the transaction hash +
     *  IPFS URI on confirmed success, beside one entry per agreement
     *  registered. Throws on any failure — no wallet, IPFS down,
     *  insufficient ETH, composition collision, on-chain revert, etc.
     *
     *  `reviewedCompositionHash` is the BYTE-EQUALITY GATE: the identity the
     *  caller last showed a human. The anchor is permanent, so the bytes that
     *  go out must be the bytes that were seen — if the build no longer hashes
     *  to what was reviewed, this refuses before anything is pinned or signed
     *  rather than anchoring a composition nobody read. */
    async function publish(
        snapshot: DesignSnapshot,
        reviewedCompositionHash?: `0x${string}`,
    ): Promise<PublishOutcome> {
        const registry = getAssemblyRegistry();
        if (!registry) {
            throw new Error(
                "AssemblyRegistry address not configured (NEXT_PUBLIC_ASSEMBLY_REGISTRY).",
            );
        }
        if (!client) {
            throw new Error("No public client available to read the registration stake.");
        }
        if (!address) {
            throw new Error("Connect a wallet before publishing.");
        }
        // Hard cap = the resolve ceiling: every order must resolve in one atomic
        // resolveProcess within a block. Same ceiling the designer canvas gates
        // node addition on, so an assembly designed there never trips this — the
        // guard catches forked / hand-crafted assemblies. (Commit landing rate is
        // a checkout-time signal, not a size cap; see chainGasCeilings.)
        const perProcessCap = await maxOrdersResolvablePerProcess(client);
        if (snapshot.orders.length > perProcessCap) {
            throw new Error(
                `Assembly has ${snapshot.orders.length} orders; this chain resolves at most ${perProcessCap} in one atomic resolveProcess. Compose multiple processes instead.`,
            );
        }
        const deposit = await client.readContract({
            address: registry,
            abi: ASSEMBLY_REGISTRY_ABI,
            functionName: "registrationDeposit",
        });
        // Publish the no-hash assembly: per order, who's bound, its
        // topology parents, and the selected clauses. The fingerprint forms later
        // at checkout when the parties fill the clause fields.
        // The ONE draft→assembly walk (`draftToAssembly`), shared with
        // the hand-off panel and the canvas identity readout. It VERIFIES scope
        // placement: an assembly-scoped clause on an order,
        // or an agreement-scoped one at assembly level, throws here — publish
        // refuses, never a silent no-op.
        const built = snapshotToAssembly(snapshot);
        const { assembly } = built;
        const { json, compositionHash } = serializeAssembly(assembly);
        // One assembly, one hash: refuse before the pin and before the wallet
        // when this build is not the composition the caller reviewed.
        if (reviewedCompositionHash && !hexEqual(compositionHash, reviewedCompositionHash)) {
            throw new Error(
                `This draft now builds a different composition than the one reviewed `
                + `(reviewed ${reviewedCompositionHash}, builds ${compositionHash}). `
                + `Nothing was published — reopen it in the editor and review again.`,
            );
        }
        // The slug is presentation, derived from the composition hash —
        // identical compositions collapse to one on-chain binding (the
        // registry's first-write-wins dedups them); the user never names it.
        const slug = deriveAssemblySlug(compositionHash);

        // EVERY CHECK BEFORE ANY WRITE. The pins are content addressing, not
        // chain writes; the simulations surface a typed revert before the
        // wallet opens. Only once the assembly's registration and every new
        // agreement's registration simulate clean is anything sent — so a
        // publish that would revert (a composition already anchored, a stake
        // mismatch) leaves no agreement registered and no stake placed.
        const ipfs = await DEFAULT_IPFS_SERVICE.publishJSON(JSON.parse(json));
        try {
            await client.simulateContract({
                address: registry,
                abi: ASSEMBLY_REGISTRY_ABI as Abi,
                functionName: "registerAssembly",
                args: [compositionHash, ipfs.uri],
                value: deposit,
                account: address,
            });
        } catch (err) {
            throw translatePublishRevert(err, slug);
        }

        // The agreements newly composed for this assembly: each one no
        // registry binds yet is pinned and simulated now, and registered
        // FIRST below (one stake each), so every agreement the assembly names
        // is readable the moment the assembly anchors. A key the registry
        // already binds is skipped — the same clauses always key to one
        // registration.
        const toRegister: { agreementKey: `0x${string}`; uri: string }[] = [];
        const newKeys = Object.keys(built.agreements) as `0x${string}`[];
        const agreementRegistry = getAgreementRegistry();
        let agreementDeposit = 0n;
        if (newKeys.length > 0) {
            if (!agreementRegistry) {
                throw new Error("AgreementRegistry address not configured (NEXT_PUBLIC_AGREEMENT_REGISTRY).");
            }
            agreementDeposit = await client.readContract({
                address: agreementRegistry,
                abi: AGREEMENT_REGISTRY_ABI,
                functionName: "registrationDeposit",
            });
            for (const agreementKey of newKeys) {
                if (await readAgreementBinding(agreementKey, client)) continue;
                const index = assembly.agreements.findIndex((s) => hexEqual(s.agreementKey, agreementKey));
                // The pinned document carries the designer's words beside the
                // clauses; the key is over the clauses alone.
                const doc: RegisteredAgreement = {
                    ...(assembly.name ? { name: `${assembly.name} · order ${index + 1}` } : {}),
                    clauses: built.agreements[agreementKey].clauses,
                };
                const pinned = await DEFAULT_IPFS_SERVICE.publishJSON(JSON.parse(canonicalize(doc)));
                try {
                    await client.simulateContract({
                        address: agreementRegistry,
                        abi: AGREEMENT_REGISTRY_ABI as Abi,
                        functionName: "registerAgreement",
                        args: [agreementKey, pinned.uri],
                        value: agreementDeposit,
                        account: address,
                    });
                } catch (err) {
                    throw translateAgreementRegisterRevert(err, agreementKey);
                }
                toRegister.push({ agreementKey, uri: pinned.uri });
            }
        }

        // The writes: agreements first, then the assembly. Each waits for a
        // `success` receipt (`publishTail`), so the UI never declares success
        // on a transaction the chain rejected.
        const agreements: PublishOutcome["agreements"] = [];
        for (const { agreementKey, uri } of toRegister) {
            const agreementTx = await publishTail({
                client,
                writeContractAsync,
                address: agreementRegistry!,
                abi: AGREEMENT_REGISTRY_ABI as Abi,
                functionName: "registerAgreement",
                args: [agreementKey, uri],
                value: agreementDeposit,
                account: address,
                translateRevert: (err) => translateAgreementRegisterRevert(err, agreementKey),
                failureMessage: "The agreement registration was not created.",
            });
            agreements.push({ agreementKey, hash: agreementTx, ipfsURI: uri });
        }

        const txHash = await publishTail({
            client,
            writeContractAsync,
            address: registry,
            abi: ASSEMBLY_REGISTRY_ABI as Abi,
            functionName: "registerAssembly",
            args: [compositionHash, ipfs.uri],
            value: deposit,
            account: address,
            translateRevert: (err) => translatePublishRevert(err, slug),
            failureMessage: "The composition binding was not created.",
        });

        return { hash: txHash, ipfsURI: ipfs.uri, slug, agreements };
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
