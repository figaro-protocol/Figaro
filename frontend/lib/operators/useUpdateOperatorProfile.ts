/**
 * lib/operators/useUpdateOperatorProfile.ts
 *
 * Shared edit-side write path for the four operator-managed
 * surfaces (profile / catalogue-link / assemblies / agents).
 * Each of these resolves on-chain through one mechanism —
 * `OperatorRegistry.updateProfile(metadataURI)` — so they share
 * the same workflow:
 *
 *   1. Take a partial draft of the fields the user just edited.
 *   2. Merge with the wallet's current on-chain profile so
 *      unchanged fields (catalogueURI, assemblyBindings,
 *      services, branding, etc.) survive the round-trip.
 *   3. Validate the merged document via `parseOperatorProfileDocument`
 *      so a malformed update fails before it leaves the browser.
 *   4. Pin the new JSON to IPFS.
 *   5. Call `updateProfile(newURI)` on the registry. Deposit and
 *      lock period are not touched (`updateProfile` is the
 *      caller-only metadata-only path, by contract design).
 *
 * Hook returns a `save(partial)` function plus progress state. The
 * caller is responsible for redirect / success UI; the hook only
 * owns the state of the write.
 */
"use client";

import { useEffect, useState } from "react";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import {
    parseOperatorProfileDocument,
    type OperatorProfileMetadata,
} from "@/lib/shared/operatorProfileMetadata";
import { useUpdateProfile } from "@/lib/mechanisms/useOperatorRegistry";

export type OperatorProfilePatch = Partial<OperatorProfileMetadata>;

export interface UseUpdateOperatorProfileResult {
    /**
     * Build the merged profile, validate, pin, and dispatch
     * `updateProfile`. Resolves once the on-chain transaction has
     * confirmed; rejects with a typed error otherwise.
     */
    save: (patch: OperatorProfilePatch) => Promise<void>;
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

export function useUpdateOperatorProfile(
    existingProfile: OperatorProfileMetadata | null,
): UseUpdateOperatorProfileResult {
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

    async function save(patch: OperatorProfilePatch): Promise<void> {
        if (!existingProfile) {
            throw new Error("Can't update profile: no existing profile loaded.");
        }
        setPinError(null);
        setPublishedURI(null);
        setPinning(true);

        let merged: OperatorProfileMetadata;
        try {
            merged = mergeProfile(existingProfile, patch);
            // Round-trip validation — throws if the document doesn't parse.
            parseOperatorProfileDocument(merged, "edit-profile");
        } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
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
            const e = err instanceof Error ? err : new Error(String(err));
            setPinError(e);
            setPinning(false);
            throw e;
        }

        try {
            await updateProfile(uri);
        } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
            setPinError(e);
            throw e;
        }
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
    existing: OperatorProfileMetadata,
    patch: OperatorProfilePatch,
): OperatorProfileMetadata {
    return {
        ...existing,
        ...Object.fromEntries(
            Object.entries(patch).filter(([, v]) => v !== undefined),
        ),
        // Preserve the wallet stamp — the patch never touches subjectAddress.
        subjectAddress: existing.subjectAddress,
        version: patch.version ?? existing.version ?? "1.0.0",
    };
}
