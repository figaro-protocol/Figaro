"use client";

/**
 * usePublishMemberProfile — atomic publish flow for the member
 * wizard's final step. Mirrors `usePublishAssembly` in shape:
 *
 *   1. Pin the catalog document to IPFS when the member lists items
 *      (content-addressed: the same items always pin to the same URI, so a
 *      retry costs nothing and a changed item always yields a new one). A
 *      member need not sell anything: with no item, no catalog is pinned.
 *   2. Build the profile document, with the catalog URI embedded when one
 *      was pinned.
 *   3. Pin the profile document to IPFS.
 *   4. Read the on-chain `registrationDeposit` AND the wallet's
 *      registration status (`registered(wallet)`) ON DEMAND (NOT via a
 *      React hook whose `data` may still be undefined when the wizard's
 *      submit fires — the exact race that made the wizard call `register`
 *      on an already-registered wallet → `AlreadyRegistered` revert →
 *      a stuck receipt that never renders).
 *   5. Simulate the appropriate registry call (`register` for first-
 *      time, `updateProfile` for re-pin) BEFORE opening the wallet,
 *      so a wrong-deposit / unauthorized revert surfaces as a typed
 *      error instead of a silent on-chain failure post-submission.
 *   6. Submit, with `chainId: activeChain.id`.
 *   7. Explicitly wait for the receipt + verify status === "success".
 *
 *   Steps 5–7 are the shared `simulateWriteVerify`; a revert is reported by
 *   the registry's error name (`membersRegistryRevertMessage`).
 *
 * Replaces the inline publish flow in `OnboardingReview` that read
 * the deposit from `useRegistrationDeposit()` (could be undefined →
 * `?? 0n` → on-chain revert), skipped simulation, and only relied on
 * `useWaitForTransactionReceipt`'s `isSuccess` without inspecting the
 * receipt status itself. The register-vs-update BRANCH is likewise read
 * on-demand from the chain, not passed in from a React query, for the
 * same undefined-when-submit-fires reason.
 */

import { useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import type { Abi } from "viem";
import { simulateWriteVerify } from "@/lib/shared/contractWrite";
import { membersRegistryRevertMessage, readRegistrationDeposit } from "@/lib/member/useMembersRegistry";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import {
    parseMemberProfileDocument,
    type MemberProfileMetadata,
} from "@/lib/member/memberProfileMetadata";
import { publishMemberCatalog } from "@/lib/member/catalogPublisher";
import type {
    CatalogItemMetadata,
    MemberCatalogMetadata,
    UnitSystem,
} from "@/lib/member/memberCatalogMetadata";
import { getMembersRegistry } from "@/lib/kernel/contracts";
import { MEMBERS_REGISTRY_ABI } from "@figaro-protocol/sdk";

export interface PublishMemberInput {
    /** Profile fields collected by the wizard, MINUS the catalogURI
     *  (which the hook fills in after pinning the catalog). */
    profileMetadata: Omit<MemberProfileMetadata, "catalogURI">;
    /** Catalog items to pin. Empty for a member that sells nothing: no
     *  catalog is pinned and the profile links none. */
    items: CatalogItemMetadata[];
    /** The member's preferred unit system; goes onto the catalog doc. */
    unitSystem?: UnitSystem;
    /** Subject wallet — used as the catalog's `subjectAddress`. */
    wallet: `0x${string}`;
}

export interface PublishMemberOutcome {
    hash: `0x${string}`;
    profileURI: string;
    /** The pinned catalog's URI; absent when the member lists no item. */
    catalogURI?: string;
}

export function usePublishMemberProfile() {
    const client = usePublicClient();
    const { writeContractAsync, data: hash, isPending, error: writeError } =
        useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    async function publish(input: PublishMemberInput): Promise<PublishMemberOutcome> {
        const registry = getMembersRegistry();
        if (!registry) {
            throw new Error(
                "MembersRegistry address not configured (NEXT_PUBLIC_MEMBERS_REGISTRY).",
            );
        }
        if (!client) {
            throw new Error("No public client available to read the registration stake.");
        }
        // (a) Pin the catalog document from the items in hand — none for a
        //     member that lists no item.
        let catalogURI: string | undefined;
        if (input.items.length > 0) {
            const catalog: MemberCatalogMetadata = {
                subjectAddress: input.wallet,
                items: input.items,
                version: "1.0.0",
                unitSystem: input.unitSystem,
            };
            catalogURI = (await publishMemberCatalog(catalog)).uri;
        }

        // (b) Build + validate the profile document, the catalogURI embedded
        //     when a catalog was pinned.
        const profile: MemberProfileMetadata = {
            ...input.profileMetadata,
            ...(catalogURI !== undefined && { catalogURI }),
        };
        parseMemberProfileDocument(profile, "onboarding-publish");

        // (c) Pin the profile document.
        const profilePin = await DEFAULT_IPFS_SERVICE.publishJSON(
            profile as unknown as Record<string, unknown>,
        );
        const profileURI = profilePin.uri;

        // (d) Read the registration status + stake ON DEMAND. A React
        //     query (`useMemberProfile` / `useRegistrationDeposit`) can be
        //     undefined when the wizard's submit fires — trusting a stale
        //     `false` would call `register` on an already-registered wallet
        //     and revert `AlreadyRegistered`; a stale deposit would revert
        //     on `msg.value`. The chain is the authority for both.
        // (e) Simulate before opening the wallet, then submit. Split
        //     by branch so the non-payable `updateProfile` doesn't
        //     receive a `value` arg (wagmi's type would reject it).
        const alreadyRegistered = (await client.readContract({
            address: registry,
            abi: MEMBERS_REGISTRY_ABI,
            functionName: "registered",
            args: [input.wallet],
        })) as boolean;
        // Simulate → write → verify (`simulateWriteVerify`, the one write
        // sequence): a mined-but-reverted tx must surface, not flow on as
        // success — `writeContractAsync` only confirms broadcast.
        let txHash: `0x${string}`;
        if (alreadyRegistered) {
            txHash = await simulateWriteVerify({
                client,
                writeContractAsync,
                address: registry,
                abi: MEMBERS_REGISTRY_ABI as Abi,
                functionName: "updateProfile",
                args: [profileURI],
                account: input.wallet,
                revertMessage: membersRegistryRevertMessage,
                failureMessage: "The profile was not published.",
            });
        } else {
            const deposit = await readRegistrationDeposit(client, registry);
            txHash = await simulateWriteVerify({
                client,
                writeContractAsync,
                address: registry,
                abi: MEMBERS_REGISTRY_ABI as Abi,
                functionName: "register",
                args: [profileURI],
                value: deposit,
                account: input.wallet,
                revertMessage: membersRegistryRevertMessage,
                failureMessage: "The profile was not published.",
            });
        }

        return { hash: txHash, profileURI, catalogURI };
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
