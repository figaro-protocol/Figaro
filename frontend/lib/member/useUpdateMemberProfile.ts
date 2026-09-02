/**
 * lib/member/useUpdateMemberProfile.ts
 *
 * Shared edit-side write path for the four member-managed
 * surfaces (profile / catalogue-link / assemblies / agents).
 * Each of these resolves on-chain through one mechanism —
 * `MembersRegistry.updateProfile(metadataURI)` — so they share
 * the same workflow:
 *
 *   1. Take a partial draft of the fields the user just edited.
 *   2. Merge with the wallet's current on-chain profile so
 *      unchanged fields (catalogueURI, assemblyBindings,
 *      services, branding, etc.) survive the round-trip.
 *   3. Validate the merged document via `parseMemberProfileDocument`
 *      so a malformed update fails before it leaves the browser.
 *   4. Pin the new JSON to IPFS.
 *   5. Call `updateProfile(newURI)` on the registry. Deposit and
 *      lock period are not touched (`updateProfile` is the
 *      caller-only metadata-only path, by contract design).
 *   6. After the supersede confirms, best-effort unpin the prior
 *      profile CID and any authored artifact the successor
 *      no longer references (author pins → author erases; the
 *      erasure never fails a confirmed save).
 *
 * Hook returns a `save(partial)` function plus progress state. The
 * caller is responsible for redirect / success UI; the hook only
 * owns the state of the write.
 */
"use client";

import { useEffect, useState } from "react";
import { toError } from "@/lib/shared/errors";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import { unpinSupersededProfileArtifacts } from "@/lib/member/profileErasure";
import {
    parseMemberProfileDocument,
    type MemberProfileMetadata,
} from "@/lib/member/memberProfileMetadata";
import { useUpdateProfile } from "@/lib/member/useMembersRegistry";

type MemberProfilePatch = Partial<MemberProfileMetadata>;

interface SaveOptions {
    /**
     * Fields to explicitly clear in the merged profile. Useful for
     * destructive actions that remove a pointer (e.g. clearing
     * `catalogueURI` to delete the catalogue link from the profile)
     * without touching the rest of the document.
     *
     * `undefined` in `patch` means "leave existing alone"; this
     * `clear` list is the explicit "set to undefined" channel.
     */
    clear?: Array<keyof MemberProfileMetadata>;
}

export interface UseUpdateMemberProfileResult {
    /**
     * Build the merged profile, validate, pin, and dispatch
     * `updateProfile`. Resolves once the on-chain transaction has
     * confirmed; rejects with a typed error otherwise.
     */
    save: (patch: MemberProfilePatch, options?: SaveOptions) => Promise<void>;
    /** True while pinning OR while the on-chain transaction is in flight. */
    isPending: boolean;
    /** True only while the transaction is awaiting confirmation. */
    isConfirming: boolean;
    /** True after the transaction has confirmed. */
    isSuccess: boolean;
    /** Most-recent error from any phase (pin / parse / write / confirmation). */
    error: Error | null;
    /** Pinned IPFS URI from the most-recent successful save. */
    publishedURI: string | null;
}

export function useUpdateMemberProfile(
    existingProfile: MemberProfileMetadata | null,
    /** The registry metadataURI the save supersedes — its CID (and any
     *  authored artifact the successor drops) is unpinned after the
     *  on-chain update confirms. Omit when unknown; erasure is skipped. */
    priorProfileUri?: string | null,
): UseUpdateMemberProfileResult {
    const {
        updateProfile,
        isPending: writePending,
        isConfirming,
        isSuccess,
        error: writeError,
    } = useUpdateProfile();

    const [pinning, setPinning] = useState(false);
    const [pinError, setPinError] = useState<Error | null>(null);
    const [publishedURI, setPublishedURI] = useState<string | null>(null);

    // Reset transient errors whenever the underlying profile reference changes
    // (e.g. user navigates away and back). Keeps stale messages from leaking
    // into a fresh edit session.
    useEffect(() => {
        setPinError(null);
        setPublishedURI(null);
    }, [existingProfile]);

    async function save(patch: MemberProfilePatch, options?: SaveOptions): Promise<void> {
        if (!existingProfile) {
            throw new Error("Can't update profile: no existing profile loaded.");
        }
        setPinError(null);
        setPublishedURI(null);
        setPinning(true);

        let merged: MemberProfileMetadata;
        try {
            merged = mergeProfile(existingProfile, patch, options?.clear);
            // Round-trip validation — throws if the document doesn't parse.
            parseMemberProfileDocument(merged, "edit-profile");
        } catch (err) {
            const e = toError(err);
            setPinError(e);
            setPinning(false);
            throw e;
        }

        let uri: string;
        try {
            const result = await DEFAULT_IPFS_SERVICE.publishJSON(
                merged as unknown as Record<string, unknown>,
            );
            uri = result.uri;
            setPublishedURI(uri);
            setPinning(false);
        } catch (err) {
            const e = toError(err);
            setPinError(e);
            setPinning(false);
            throw e;
        }

        try {
            await updateProfile(uri);
        } catch (err) {
            const e = toError(err);
            setPinError(e);
            throw e;
        }

        // The supersede confirmed — erase what it replaced. Never throws.
        await unpinSupersededProfileArtifacts({
            ipfs: DEFAULT_IPFS_SERVICE,
            priorProfileUri,
            priorProfile: existingProfile,
            nextProfile: merged,
        });
    }

    const error = pinError ?? (writeError as Error | null) ?? null;
    return {
        save,
        isPending: pinning || writePending,
        isConfirming,
        isSuccess,
        error,
        publishedURI,
    };
}

/**
 * Field-by-field merge: the patch overrides the existing profile,
 * but `undefined` in the patch means "leave the existing value
 * alone". Use `null` (not currently allowed by the type but worth
 * noting) if a future contract allows explicit clearing.
 *
 * Required fields (`name`, `slug`) fall back to the existing
 * values if the patch leaves them undefined — the form should
 * always provide them, but the merge guards against accidentally
 * blanking the on-chain identity.
 */
function mergeProfile(
    existing: MemberProfileMetadata,
    patch: MemberProfilePatch,
    clear: Array<keyof MemberProfileMetadata> = [],
): MemberProfileMetadata {
    const merged = {
        ...existing,
        ...Object.fromEntries(
            Object.entries(patch).filter(([, v]) => v !== undefined),
        ),
        // Preserve the wallet stamp — the patch never touches subjectAddress.
        subjectAddress: existing.subjectAddress,
    } as MemberProfileMetadata;

    // Strip explicitly-cleared fields. `subjectAddress` is non-clearable
    // (it's the on-chain identity); silently drop attempts to clear it.
    for (const key of clear) {
        if (key === "subjectAddress") continue;
        if (key === "name") continue; // required field, can't be cleared
        delete (merged as unknown as Record<string, unknown>)[key];
    }

    return merged;
}
