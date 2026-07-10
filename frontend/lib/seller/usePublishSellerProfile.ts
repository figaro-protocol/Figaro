"use client";

/**
 * usePublishSellerProfile — atomic publish flow for the seller
 * wizard's final step. Mirrors `usePublishAssembly` in shape:
 *
 *   1. Pin the catalogue document to IPFS (skipped if a cached
 *      `cachedCatalogueURI` is supplied — useful on retry).
 *   2. Build the profile document with the catalogue URI embedded.
 *   3. Pin the profile document to IPFS.
 *   4. Read the on-chain `registrationDeposit` ON DEMAND
 *      (NOT via a React hook whose `data` may still be undefined when
 *      the wizard's submit fires).
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
 * receipt status itself.
 */

import { useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { toError } from "@/lib/shared/errors";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import {
    parseSellerProfileDocument,
    type SellerProfileMetadata,
} from "@/lib/seller/sellerProfileMetadata";
import { publishSellerCatalogue } from "@/lib/seller/cataloguePublisher";
import type {
    CatalogueItemMetadata,
    SellerCatalogueMetadata,
    UnitSystem,
} from "@/lib/seller/sellerCatalogueMetadata";
import { getSellerRegistry } from "@/lib/kernel/contracts";
import { SELLER_REGISTRY_ABI } from "@figaro/sdk";

export interface PublishSellerInput {
    /** Profile fields collected by the wizard, MINUS the catalogueURI
     *  (which the hook fills in after pinning the catalogue). */
    profileTemplate: Omit<SellerProfileMetadata, "catalogueURI">;
    /** Catalogue items to pin. Must be non-empty — the kernel doesn't
     *  enforce this but the seller UX expects it (see Step 3 gate). */
    items: CatalogueItemMetadata[];
    /** Seller's preferred unit system; goes onto the catalogue doc. */
    unitSystem?: UnitSystem;
    /** Subject wallet — used as the catalogue's `subjectAddress`. */
    wallet: `0x${string}`;
    /** `true` → call `updateProfile(uri)` (no deposit). `false` → call
     *  `register(uri)` payable with `registrationDeposit` wei. */
    isRegistered: boolean;
    /** Idempotency cache: if the previous publish attempt pinned the
     *  catalogue but failed at the on-chain step, the caller can pass
     *  the prior URI to skip re-pinning. */
    cachedCatalogueURI?: string;
}

export interface PublishSellerOutcome {
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

export function usePublishSellerProfile() {
    const client = usePublicClient();
    const { writeContractAsync, data: hash, isPending, error: writeError } =
        useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    async function publish(input: PublishSellerInput): Promise<PublishSellerOutcome> {
        const registry = getSellerRegistry();
        if (!registry) {
            throw new Error(
                "SellerRegistry address not configured (NEXT_PUBLIC_SELLER_REGISTRY).",
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
            const catalogue: SellerCatalogueMetadata = {
                subjectAddress: input.wallet,
                items: input.items,
                version: "1.0.0",
                unitSystem: input.unitSystem,
            };
            const cataloguePin = await publishSellerCatalogue(catalogue);
            catalogueURI = cataloguePin.uri;
        }

        // (b) Build + validate the profile document with the catalogueURI embedded.
        const profile: SellerProfileMetadata = {
            ...input.profileTemplate,
            catalogueURI,
        };
        parseSellerProfileDocument(profile, "onboarding-publish");

        // (c) Pin the profile document.
        const profilePin = await DEFAULT_IPFS_SERVICE.publishJSON(
            profile as unknown as Record<string, unknown>,
        );
        const profileURI = profilePin.uri;

        // (d) Read the deposit ON DEMAND. `useRegistrationDeposit`
        //     can be undefined when the wizard's submit fires; the
        //     prior `?? 0n` would silently revert on-chain because
        //     `register` requires `msg.value == registrationDeposit`.
        // (e) Simulate before opening the wallet, then submit. Split
        //     by branch so the non-payable `updateProfile` doesn't
        //     receive a `value` arg (wagmi's type would reject it).
        let txHash: `0x${string}`;
        if (input.isRegistered) {
            try {
                await client.simulateContract({
                    address: registry,
                    abi: SELLER_REGISTRY_ABI,
                    functionName: "updateProfile",
                    args: [profileURI],
                    account: input.wallet,
                });
            } catch (err) {
                throw translatePublishRevert(err);
            }
            txHash = await writeContractAsync({
                address: registry,
                abi: SELLER_REGISTRY_ABI,
                functionName: "updateProfile",
                args: [profileURI],
            });
        } else {
            const deposit = (await client.readContract({
                address: registry,
                abi: SELLER_REGISTRY_ABI,
                functionName: "registrationDeposit",
            })) as bigint;
            try {
                await client.simulateContract({
                    address: registry,
                    abi: SELLER_REGISTRY_ABI,
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
                abi: SELLER_REGISTRY_ABI,
                functionName: "register",
                args: [profileURI],
                value: deposit,
            });
        }

        // (g) Wait for the receipt + verify status. `writeContractAsync`
        //     resolves once the tx is broadcast; without an explicit
        //     wait the UI could declare success on a tx that the chain
        //     ultimately reverted.
        const receipt = await client.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status !== "success") {
            throw new Error(
                `Publish transaction reverted on-chain (tx ${txHash}).`,
            );
        }

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
