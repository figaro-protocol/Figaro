/**
 * lib/operators/onboardingState.ts
 *
 * Wallet-scoped localStorage state for the multi-screen operator
 * onboarding flow at `/operators/onboard/*`. The state survives page
 * reloads (B7 — "items don't persist" was the user's complaint about the
 * old single-form catalogue builder) and unblocks per-step authoring.
 *
 * Storage key shape: `figaro:onboarding:0x<wallet-address>`.
 *
 * Each top-level field maps to a step in the seven-screen flow:
 *   - profile   → screen 2
 *   - catalogue → screen 3
 *   - link      → screen 4 (computed; not user-authored)
 *   - assemblies → screen 5
 *   - services  → screen 6
 *
 * The `complete` flag is set after the publish path runs successfully on
 * screen 4 (or screen 7) and used by the entry route to fast-forward
 * returning users past the welcome screen.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import type {
    AssemblyBindingRecord,
    OperatorAgentServices,
    OperatorAssetReferences,
} from "@/lib/shared/operatorProfileMetadata";
import type {
    AcceptedTokenMetadata,
    CatalogueItemMetadata,
    SellerBrandingMetadata,
    UnitSystem,
} from "@/lib/shared/sellerCatalogueMetadata";

// ── Shape ────────────────────────────────────────────────────────────────────

export interface OnboardingProfileDraft {
    name?: string;
    slug?: string;
    description?: string;
    specialty?: string;
    location?: {
        geohash?: string;
        addressText?: string;
    };
    branding?: SellerBrandingMetadata;
    assets?: OperatorAssetReferences;
    acceptedTokens?: AcceptedTokenMetadata[];
    defaultTokenAddress?: `0x${string}`;
}

export interface OnboardingCatalogueDraft {
    items?: CatalogueItemMetadata[];
    /** Operator's preferred unit system for editor + display. Storage of
     *  per-item mass / volume is always metric; this is a UI preference. */
    unitSystem?: UnitSystem;
}

export interface OnboardingState {
    /** Wallet that owns this draft. Stamped on first write so reads can detect wallet-switch. */
    walletAddress?: `0x${string}`;
    profile?: OnboardingProfileDraft;
    catalogue?: OnboardingCatalogueDraft;
    /** Per-assembly bindings declared on screen 5. */
    assemblies?: AssemblyBindingRecord[];
    /** Agent endpoints declared on screen 6 (advanced; optional). */
    services?: OperatorAgentServices;
    /** IPFS URI of the published profile, set on screen 4 success. */
    publishedProfileURI?: string;
    /** IPFS URI of the published catalogue, set on screen 3 success. */
    publishedCatalogueURI?: string;
    /** True when the on-chain register/updateProfile transaction has confirmed. */
    complete?: boolean;
    /** ISO timestamp of last write (for staleness checks). */
    updatedAt?: string;
}

const EMPTY_STATE: OnboardingState = {};

// ── Storage primitives ───────────────────────────────────────────────────────

function storageKeyFor(wallet: string | undefined): string | null {
    if (!wallet) return null;
    return `figaro:onboarding:${wallet.toLowerCase()}`;
}

function readState(wallet: string | undefined): OnboardingState {
    if (typeof window === "undefined") return EMPTY_STATE;
    const key = storageKeyFor(wallet);
    if (!key) return EMPTY_STATE;
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return EMPTY_STATE;
        return JSON.parse(raw) as OnboardingState;
    } catch {
        return EMPTY_STATE;
    }
}

function writeState(wallet: string | undefined, state: OnboardingState): void {
    if (typeof window === "undefined") return;
    const key = storageKeyFor(wallet);
    if (!key) return;
    try {
        const stamped: OnboardingState = {
            ...state,
            walletAddress: wallet as `0x${string}`,
            updatedAt: new Date().toISOString(),
        };
        window.localStorage.setItem(key, JSON.stringify(stamped));
    } catch {
        // localStorage may be disabled / full; silently drop the write.
    }
}

function removeState(wallet: string | undefined): void {
    if (typeof window === "undefined") return;
    const key = storageKeyFor(wallet);
    if (!key) return;
    try {
        window.localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface UseOnboardingStateResult {
    state: OnboardingState;
    /**
     * `true` once the localStorage read for `walletAddress` has run.
     * Forms must gate hydration on this flag — gating on
     * `state.X !== undefined` is unreliable because new users have no
     * draft (so `state` never transitions from `EMPTY_STATE`), and
     * returning users can have their hydration race the read.
     */
    loaded: boolean;
    /** Replace the entire state. */
    setState: (next: OnboardingState) => void;
    /** Merge a partial update. */
    update: (patch: Partial<OnboardingState>) => void;
    /** Clear state (used after successful publish + final-step navigation). */
    clear: () => void;
}

/**
 * Wallet-scoped onboarding-state hook. Reads the current draft for
 * `walletAddress` from localStorage on mount and on wallet switch;
 * writes back on every update. Returns `EMPTY_STATE` when no wallet is
 * connected.
 */
export function useOnboardingState(walletAddress: `0x${string}` | undefined): UseOnboardingStateResult {
    const [state, setStateInternal] = useState<OnboardingState>(EMPTY_STATE);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        setLoaded(false);
        setStateInternal(readState(walletAddress));
        setLoaded(true);
    }, [walletAddress]);

    const setState = useCallback((next: OnboardingState) => {
        setStateInternal(next);
        writeState(walletAddress, next);
    }, [walletAddress]);

    const update = useCallback((patch: Partial<OnboardingState>) => {
        setStateInternal((prev) => {
            const next = { ...prev, ...patch };
            writeState(walletAddress, next);
            return next;
        });
    }, [walletAddress]);

    const clear = useCallback(() => {
        setStateInternal(EMPTY_STATE);
        removeState(walletAddress);
    }, [walletAddress]);

    return { state, loaded, setState, update, clear };
}

// ── Step progress ────────────────────────────────────────────────────────────

export interface OnboardingStep {
    /** Stable slug used in URLs and step-indicator keys. */
    id: "welcome" | "profile" | "catalogue" | "link" | "assemblies" | "agents" | "done";
    /** 1-based step number for the visible indicator. */
    number: number;
    /** Human-readable label. */
    label: string;
    /** Sub-route under `/operators/onboard/`. Empty string for the welcome screen. */
    path: string;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
    { id: "welcome", number: 1, label: "Welcome", path: "" },
    { id: "profile", number: 2, label: "Profile", path: "profile" },
    { id: "catalogue", number: 3, label: "Catalogue", path: "catalogue" },
    { id: "link", number: 4, label: "Link", path: "link" },
    { id: "assemblies", number: 5, label: "Assemblies", path: "assemblies" },
    { id: "agents", number: 6, label: "Agents", path: "agents" },
    { id: "done", number: 7, label: "Done", path: "done" },
];

/**
 * Determine which steps the current state has completed. Used by the
 * step indicator to render check-marks and by the navigation guards to
 * prevent skipping ahead past unfilled steps.
 */
export function completedSteps(state: OnboardingState): Set<OnboardingStep["id"]> {
    const out = new Set<OnboardingStep["id"]>();
    out.add("welcome");
    if (state.profile?.name && state.profile?.slug) out.add("profile");
    if (state.catalogue?.items && state.catalogue.items.length > 0) out.add("catalogue");
    if (state.publishedProfileURI && state.publishedCatalogueURI) out.add("link");
    if (state.assemblies && state.assemblies.length > 0) out.add("assemblies");
    if (state.services && Object.values(state.services).some((v) => Boolean(v))) out.add("agents");
    if (state.complete) out.add("done");
    return out;
}
