"use client";

/**
 * usePublishMemberProfile — atomic publish flow for the member
 * wizard's final step. Mirrors `usePublishAssembly` in shape:
 *
 *   1. Pin the catalogue document to IPFS (skipped if a cached
 *      `cachedCatalogueURI` is supplied — useful on retry).
 *   2. Build the profile document with the catalogue URI embedded.
 *   3. Pin the profile document to IPFS.
 *   4. Read the on-chain `registrationDeposit` AND the wallet's
 *      registration status (`registered(wallet)`) ON DEMAND (NOT via a
 *      React hook whose `data` may still be undefined when the wizard's
 *      submit fires — the exact race that made the wizard call `register`
 *      on an already-registered wallet → `AlreadyRegistered` revert →
 *      a stuck receipt that never renders).
 *   5. Simulate the appropriate registry call (`register` for first-
 *      time, `updateProfile` for re-pin) BEFORE opening the wallet,
 *      so a wrong-deposit / unauthorised revert surfaces as a typed
 *      error instead of a silent on-chain failure post-submission.
 *   6. Submit via `writeContractAsync`.
 *   7. Explicitly wait for the receipt + verify status === "success".
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
import { verifyTxSuccess } from "@/lib/shared/verifyTxSuccess";
import { toError } from "@/lib/shared/errors";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import {
    parseMemberProfileDocument,
    type MemberProfileMetadata,
} from "@/lib/member/memberProfileMetadata";
import { publishMemberCatalogue } from "@/lib/member/cataloguePublisher";
import type {
    CatalogueItemMetadata,
    MemberCatalogueMetadata,
    UnitSystem,
} from "@/lib/member/memberCatalogueMetadata";
import { getMembersRegistry } from "@/lib/kernel/contracts";
import { MEMBERS_REGISTRY_ABI } from "@figaro/sdk";

export interface PublishMemberInput {
    /** Profile fields collected by the wizard, MINUS the catalogueURI
     *  (which the hook fills in after pinning the catalogue). */
    profileTemplate: Omit<MemberProfileMetadata, "catalogueURI">;
    /** Catalogue items to pin. Must be non-empty — the kernel doesn't
     *  enforce this but the onboarding UX expects it (see Step 3 gate). */
    items: CatalogueItemMetadata[];
    /** The member's preferred unit system; goes onto the catalogue doc. */
    unitSystem?: UnitSystem;
    /** Subject wallet — used as the catalogue's `subjectAddress`. */
    wallet: `0x${string}`;
    /** Idempotency cache: if the previous publish attempt pinned the
     *  catalogue but failed at the on-chain step, the caller can pass
     *  the prior URI to skip re-pinning. */
    cachedCatalogueURI?: string;
}

export interface PublishMemberOutcome {
    hash: `0x${string}`;
    profileURI: string;
    catalogueURI: string;
}

function translatePublishRevert(err: unknown): Error {
    const message = err instanceof Error ? err.message : String(err);
    // Detect the canonical reverts the registry can produce. Strings
    // come from Solidity's `revert("...")` and viem's error formatting.
    if (/insufficient.*deposit|wrong.*deposit|invalid.*deposit/i.test(message)) {
        return new Error(
            "Registration deposit mismatch — the on-chain `registrationDeposit` differs from what we submitted. Anvil may have been redeployed; reload and try again.",
        );
    }
    if (/already registered/i.test(message)) {
        return new Error(
            "This wallet is already registered. Use `updateProfile` instead, or switch to a fresh wallet.",
        );
    }
    if (/insufficient funds/i.test(message)) {
        return new Error("Insufficient ETH balance to cover the deposit + gas.");
    }
    return toError(err);
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
            throw new Error("No public client available to read the registration deposit.");
        }
        if (input.items.length === 0) {
            throw new Error("Catalogue is empty — add at least one item before publishing.");
        }

        // (a) Pin the catalogue document, unless a cached URI was passed.
        let catalogueURI = input.cachedCatalogueURI;
        if (!catalogueURI) {
            const catalogue: MemberCatalogueMetadata = {
                subjectAddress: input.wallet,
                items: input.items,
                version: "1.0.0",
                unitSystem: input.unitSystem,
            };
            const cataloguePin = await publishMemberCatalogue(catalogue);
            catalogueURI = cataloguePin.uri;
        }

        // (b) Build + validate the profile document with the catalogueURI embedded.
        const profile: MemberProfileMetadata = {
            ...input.profileTemplate,
            catalogueURI,
        };
        parseMemberProfileDocument(profile, "onboarding-publish");

        // (c) Pin the profile document.
        const profilePin = await DEFAULT_IPFS_SERVICE.publishJSON(
            profile as unknown as Record<string, unknown>,
        );
        const profileURI = profilePin.uri;

        // (d) Read the registration status + deposit ON DEMAND. A React
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
        let txHash: `0x${string}`;
        if (alreadyRegistered) {
            try {
                await client.simulateContract({
                    address: registry,
                    abi: MEMBERS_REGISTRY_ABI,
                    functionName: "updateProfile",
                    args: [profileURI],
                    account: input.wallet,
                });
            } catch (err) {
                throw translatePublishRevert(err);
            }
            txHash = await writeContractAsync({
                address: registry,
                abi: MEMBERS_REGISTRY_ABI,
                functionName: "updateProfile",
                args: [profileURI],
            });
        } else {
            const deposit = (await client.readContract({
                address: registry,
                abi: MEMBERS_REGISTRY_ABI,
                functionName: "registrationDeposit",
            })) as bigint;
            try {
                await client.simulateContract({
                    address: registry,
                    abi: MEMBERS_REGISTRY_ABI,
                    functionName: "register",
                    args: [profileURI],
                    value: deposit,
                    account: input.wallet,
                });
            } catch (err) {
                throw translatePublishRevert(err);
            }
            txHash = await writeContractAsync({
                address: registry,
                abi: MEMBERS_REGISTRY_ABI,
                functionName: "register",
                args: [profileURI],
                value: deposit,
            });
        }

        // (g) Wait for the receipt + verify status. `writeContractAsync`
        //     resolves once the tx is broadcast; without an explicit
        //     wait the UI could declare success on a tx that the chain
        //     ultimately reverted.
        await verifyTxSuccess(client, txHash, "The profile was not published.");

        return { hash: txHash, profileURI, catalogueURI };
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
