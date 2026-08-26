/**
 * lib/member/useMemberProfileEditor.ts
 *
 * Shared scaffold for the `/members/edit/*` surfaces. Each of those
 * re-uses a wizard Onboarding*Form to edit one slice of the wallet's
 * on-chain profile, and they all share the same lifecycle:
 *
 *   1. Fetch the wallet's current on-chain metadataURI (from the
 *      indexer's event-derived state) and the profile JSON behind
 *      it (from IPFS).
 *   2. Seed `useOnboardingState` with the fetched fields (the
 *      caller's `seed`) so the shared form hydrates pre-populated.
 *   3. The caller renders the form with an `onSave` that calls
 *      `useUpdateMemberProfile.save(...)` — pin merged JSON,
 *      dispatch `updateProfile`.
 *   4. On success, redirect back to `/members/manage`.
 *
 * Wallet-not-connected and wallet-not-registered cases redirect to
 * `/members/manage` (mirrors the redirect-on-miss pattern at
 * `/members` itself). The hook owns the redirect discipline and the
 * pre-form gate ladder (`gate`, rendered by `MemberEditGate`); the
 * caller owns seeding, `handleSave`, and the form JSX.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useMounted } from "@/hooks/useMounted";
import { useMemberProfile } from "@/lib/member/useMembersRegistry";
import {
    useOnboardingState,
    type UseOnboardingStateResult,
} from "@/lib/member/onboardingState";
import {
    useUpdateMemberProfile,
    type UseUpdateMemberProfileResult,
} from "@/lib/member/useUpdateMemberProfile";
import { fetchMemberProfile } from "@/lib/member/profileFetcher";
import type { MemberProfileMetadata } from "@/lib/member/memberProfileMetadata";

/** What `MemberEditGate` renders while the editor isn't ready. */
export type MemberEditGateState =
    | { kind: "waiting"; message: string }
    | { kind: "error"; message: string; explainer: string };

export interface UseMemberProfileEditorOptions {
    /**
     * Seed the wizard's localStorage-backed state with the fetched
     * profile so the shared form hydrates pre-populated. Runs exactly
     * once, after the profile is fetched, `useOnboardingState` reports
     * `loaded` (the form's hydration gate is honored), and any
     * `extraFetch` has settled.
     */
    seed: (
        profile: MemberProfileMetadata,
        update: UseOnboardingStateResult["update"],
    ) => void;
    /** Completes "editing ___ isn't safe" in the fetch-error explainer. */
    errorNoun?: string;
    /** What failed to load, in the fetch-error explainer. */
    sourceNoun?: string;
    /** What a blind save would clobber, in the fetch-error explainer. */
    clobberNoun?: string;
    /**
     * Extra in-flight state (e.g. a catalogue pin) that must also hold
     * off the redirect guard and be reflected in `saveInFlight`.
     */
    extraSaveInFlight?: boolean;
    /**
     * An extra fetch the caller performs before seeding can run (e.g.
     * the catalogue JSON behind `profile.catalogueURI`). While
     * `pending`, the gate shows `message` and seeding waits.
     */
    extraFetch?: { pending: boolean; message: string };
}

export interface UseMemberProfileEditorResult {
    address: `0x${string}` | undefined;
    /** The fetched on-chain profile JSON; null until fetched. */
    existingProfile: MemberProfileMetadata | null;
    /** The shared write path (merge → validate → pin → updateProfile). */
    updater: UseUpdateMemberProfileResult;
    /** True while any part of a save is in flight (pin, tx, extra). */
    saveInFlight: boolean;
    /** `updater.error` rendered for the form's `externalError` prop. */
    externalError: string | null;
    /** Report a fetch failure from a caller-owned fetch (e.g. catalogue). */
    setFetchError: (message: string) => void;
    /** Non-null while the form must not render; give it to `MemberEditGate`. */
    gate: MemberEditGateState | null;
}

export function useMemberProfileEditor(
    options: UseMemberProfileEditorOptions,
): UseMemberProfileEditorResult {
    const {
        seed,
        errorNoun = "it",
        sourceNoun = "profile",
        clobberNoun = "fields",
        extraSaveInFlight = false,
        extraFetch,
    } = options;

    const router = useRouter();
    const mounted = useMounted();
    const { address, isConnected } = useAccount();
    const { data: registryData, isLoading: registryLoading } = useMemberProfile(address);
    const { update, loaded } = useOnboardingState(address);

    const [existingProfile, setExistingProfile] = useState<MemberProfileMetadata | null>(null);
    const [fetchError, setFetchErrorState] = useState<string | null>(null);
    const [seeded, setSeeded] = useState(false);

    const updater = useUpdateMemberProfile(existingProfile, registryData?.[0] ?? null);
    const saveInFlight = updater.isPending || updater.isConfirming || extraSaveInFlight;

    // Redirect unregistered wallets to onboarding — but only on SETTLED
    // state: `!registryLoading && !registryData` is a completed scan that
    // found nothing (isLoading starts true in useMemberProfile), never a
    // still-hydrating window. And never navigate away mid-save — the
    // redirect unmounts the form and kills the in-flight pin/tx (the
    // 2026-07-09 e2e flake fired on exactly this, between Save and the
    // transaction dispatch).
    useEffect(() => {
        if (!mounted || saveInFlight) return;
        if (!isConnected) {
            router.replace("/members/manage");
            return;
        }
        if (!registryLoading && !registryData) {
            router.replace("/members/manage");
        }
    }, [mounted, saveInFlight, isConnected, registryLoading, registryData, router]);

    // Fetch the on-chain profile JSON.
    useEffect(() => {
        if (!registryData) return;
        const [metadataURI] = registryData;
        let cancelled = false;
        // The ONE cached profile read path (lib/member/profileFetcher).
        fetchMemberProfile(metadataURI)
            .then((parsed) => {
                if (cancelled) return;
                if (parsed) setExistingProfile(parsed);
                else setFetchErrorState("Couldn't fetch or parse the member profile.");
            })
            .catch(() => {
                if (!cancelled) setFetchErrorState("Couldn't fetch profile from IPFS.");
            });
        return () => {
            cancelled = true;
        };
    }, [registryData]);

    // Seed the wizard state once everything the caller's form reads is
    // fetched. The `seeded` flag makes the seed run exactly once even
    // though the caller's `seed` closure is a fresh identity per render.
    const extraFetchPending = extraFetch?.pending ?? false;
    useEffect(() => {
        if (seeded) return;
        if (!loaded) return;
        if (!existingProfile) return;
        if (extraFetchPending) return;
        seed(existingProfile, update);
        setSeeded(true);
    }, [seeded, loaded, existingProfile, extraFetchPending, seed, update]);

    // Redirect back to /members/manage on a confirmed update. No refetch
    // here: `useMemberProfile` is per-call-site local state, so refetching
    // this component's instance can't refresh /members/manage (which has its
    // own) — and the synchronous re-render + re-fetch it kicked raced the
    // router.push navigation. /members/manage reads fresh on mount regardless.
    useEffect(() => {
        if (updater.isSuccess) {
            router.push("/members/manage");
        }
    }, [updater.isSuccess, router]);

    const setFetchError = useCallback((message: string) => {
        setFetchErrorState(message);
    }, []);

    let gate: MemberEditGateState | null = null;
    if (!mounted) {
        gate = { kind: "waiting", message: "Loading…" };
    } else if (!isConnected) {
        gate = { kind: "waiting", message: "Redirecting…" };
    } else if (registryLoading || !registryData) {
        gate = { kind: "waiting", message: "Reading registry…" };
    } else if (fetchError) {
        gate = {
            kind: "error",
            message: fetchError,
            explainer: `Couldn't load the existing ${sourceNoun}, so editing ${errorNoun} isn't safe — saving without the existing ${clobberNoun} would clobber them.`,
        };
    } else if (!existingProfile) {
        gate = { kind: "waiting", message: "Fetching profile from IPFS…" };
    } else if (extraFetch?.pending) {
        gate = { kind: "waiting", message: extraFetch.message };
    } else if (!seeded) {
        gate = { kind: "waiting", message: "Setting up editor…" };
    }

    return {
        address,
        existingProfile,
        updater,
        saveInFlight,
        externalError: updater.error
            ? (updater.error.message ?? String(updater.error))
            : null,
        setFetchError,
        gate,
    };
}
