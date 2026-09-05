/**
 * lib/member/onboardingState.ts
 *
 * Wallet-scoped localStorage state for the multi-screen seller
 * onboarding flow at `/members/*`. The state survives page reloads and
 * wallet reconnection, and unblocks per-step authoring: every step writes
 * as the seller types, and re-reads its own draft when the step mounts.
 *
 * Storage key shape: `figaro:onboarding:0x<wallet-address>`.
 *
 * Each top-level field is authored on the step of the same name; the order
 * of the steps is `ONBOARDING_STEPS` below and nothing else.
 *
 * The `complete` flag is set after the publish path runs successfully on the
 * review step, and used by the entry route to fast-forward returning users.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import type {
    AssemblyBindingRecord,
    BuyerAssemblySubscription,
    DisclosurePolicyEntry,
    MemberAgentServices,
    MemberAssetReferences,
} from "@/lib/member/memberProfileMetadata";
import type {
    CatalogueItemMetadata,
    UnitSystem,
} from "@/lib/member/memberCatalogueMetadata";
import type { AcceptedTokenMetadata } from "@/lib/member/acceptedTokenMetadata";
import type { MemberBrandingMetadata } from "@/lib/member/memberBrandingMetadata";

// ── Shape ────────────────────────────────────────────────────────────────────

export interface OnboardingProfileDraft {
    name?: string;
    description?: string;
    specialty?: string;
    location?: {
        geohash?: string;
        addressText?: string;
    };
    branding?: MemberBrandingMetadata;
    assets?: MemberAssetReferences;
    acceptedTokens?: AcceptedTokenMetadata[];
    defaultTokenAddress?: `0x${string}`;
    /** PROFILE-authored clause values (seller master data: dimweight's
     *  divisor, a declared credential id), clauseId → field → value —
     *  checkout folds them onto composed profile-sourced leaves. Absent when
     *  the seller authors none. */
    profileClauseValues?: Record<string, Record<string, unknown>>;
}

interface OnboardingCatalogueDraft {
    items?: CatalogueItemMetadata[];
    /** Seller's preferred unit system for editor + display. Storage of
     *  per-item mass / volume is always metric; this is a UI preference. */
    unitSystem?: UnitSystem;
}

interface OnboardingState {
    /** Wallet that owns this draft. Stamped on first write so reads can detect wallet-switch. */
    walletAddress?: `0x${string}`;
    profile?: OnboardingProfileDraft;
    catalogue?: OnboardingCatalogueDraft;
    /** Per-assembly bindings declared on the seller assemblies step. */
    assemblies?: AssemblyBindingRecord[];
    /** The buyer's assembly subscriptions, declared on the buyer step —
     *  which deal-shapes this wallet buys through and monetizes records
     *  from. Independent of `assemblies` (the seller's bindings). */
    buyerAssemblies?: BuyerAssemblySubscription[];
    /** Data-disclosure policy. One list; each entry carries the posture
     *  the member traded on. Seller-posture entries are edited on the
     *  assemblies step (classes derive from the bound assemblies);
     *  buyer-posture entries on the buyer step (classes derive from the
     *  subscriptions). */
    disclosurePolicy?: DisclosurePolicyEntry[];
    /** Agent endpoints declared on screen 6 (advanced; optional). */
    services?: MemberAgentServices;
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
     * `true` once the draft OF A KNOWN WALLET has been read from
     * localStorage. Forms must gate hydration on this flag — gating on
     * `state.X !== undefined` is unreliable because new users have no
     * draft (so `state` never transitions from `EMPTY_STATE`), and
     * returning users can have their hydration race the read.
     *
     * It stays `false` while `walletAddress` is undefined. On a page
     * reload the wallet reconnects asynchronously, so there is a window
     * where the wizard is mounted with no address: a form that hydrated
     * in that window would hydrate from `EMPTY_STATE`, latch its
     * `hydrated` flag, and then persist the empty form over the real
     * draft the moment the wallet arrived — a silent wipe of everything
     * typed. No wallet means no draft to speak of, so this reads
     * "not loaded" until the wallet the draft is keyed by is known.
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
        // Only a wallet-keyed read counts as loaded — see `loaded` above.
        setLoaded(walletAddress !== undefined);
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
    /** Stable id used in URLs and step-indicator keys. */
    id: "profile" | "catalogue" | "assemblies" | "buyer" | "agents" | "endpoints" | "review";
    /** 1-based step number for the visible indicator. */
    number: number;
    /** Human-readable label. */
    label: string;
    /** Sub-route under `/members/`. Always non-empty — the wizard opens on Identity. */
    path: string;
    /**
     * When true, the seller may ship without filling this step. The
     * step indicator treats optional-and-past as completed (opting out
     * IS the seller's resolution) so the indicator doesn't paint a
     * gap where the seller deliberately skipped.
     */
    optional: boolean;
}

// No welcome step (maintainer rule 2026-08-06): /join owns the membership
// pitch, so the wizard opens directly on Identity.
//
// Assemblies precede Catalogue because the authority runs that way: the
// assemblies a seller binds decide which clauses their trades carry, and the
// clauses decide which item fields exist to author (a freight class, a hazmat
// number, a cold-chain range). Ask for the items first and the catalogue has
// nothing to derive from, so it opens every registered logistics field to a
// seller of one mug. The same direction governs the data-product option on the
// catalogue step, which reads the disclosure entries the assemblies step
// derives.
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
    { id: "profile", number: 1, label: "Identity", path: "identity", optional: false },
    { id: "assemblies", number: 2, label: "Assemblies", path: "assemblies", optional: false },
    { id: "catalogue", number: 3, label: "Catalogue", path: "catalogue", optional: false },
    // The buyer page sits BEFORE agents so the agents step delegates
    // control of the member's whole profile — seller and buyer alike.
    { id: "buyer", number: 4, label: "Buyer", path: "buyer", optional: true },
    { id: "agents", number: 5, label: "Agents", path: "agents", optional: true },
    // The member's OWN infrastructure — device configuration, never part of
    // the pinned profile, which is why Review does not list it.
    { id: "endpoints", number: 6, label: "Endpoints", path: "endpoints", optional: true },
    { id: "review", number: 7, label: "Review", path: "review", optional: false },
];

/** The route of one wizard step — the one place a step's URL is written, so
 *  the order above is the only thing that decides where a step sits. */
export function onboardingStepHref(id: OnboardingStep["id"]): string {
    const step = ONBOARDING_STEPS.find((s) => s.id === id);
    return `/members${step?.path ? `/${step.path}` : ""}`;
}

/** The route of the step after `id`, or of the wizard's last step when `id`
 *  is already it. Forms route their "Next" through this rather than naming a
 *  sibling, so reordering `ONBOARDING_STEPS` reorders the walk. */
export function onboardingNextHref(id: OnboardingStep["id"]): string {
    const index = ONBOARDING_STEPS.findIndex((s) => s.id === id);
    const next = ONBOARDING_STEPS[Math.min(index + 1, ONBOARDING_STEPS.length - 1)];
    return onboardingStepHref(next.id);
}

/** How a step is named to the seller — "Step 3 (Catalogue)". Numbered from
 *  the order above, so a reorder renumbers the prose with it. */
export function onboardingStepLabel(id: OnboardingStep["id"]): string {
    const step = ONBOARDING_STEPS.find((s) => s.id === id);
    return step ? `Step ${step.number} (${step.label})` : "";
}

/** The route of the step before `id`, or of the first step when `id` is
 *  already it. The default target of every step's "← Back" link. */
export function onboardingPrevHref(id: OnboardingStep["id"]): string {
    const index = ONBOARDING_STEPS.findIndex((s) => s.id === id);
    const prev = ONBOARDING_STEPS[Math.max(index - 1, 0)];
    return onboardingStepHref(prev.id);
}

