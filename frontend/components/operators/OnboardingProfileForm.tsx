"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, useChainId } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import {
    TokenAddressInput,
    addressIntegrity,
    classifyTokenError,
    isValidAddress,
    useTokenSymbol,
} from "@/components/operators/TokenAddressInput";
import { IpfsImageUpload } from "@/components/operators/IpfsImageUpload";
import { useMounted } from "@/lib/shared/useMounted";
import { useOnboardingState } from "@/lib/operators/onboardingState";
import type {
    OnboardingProfileDraft,
} from "@/lib/operators/onboardingState";
import type { AcceptedTokenMetadata } from "@/lib/shared/sellerCatalogueMetadata";
import { encodeGeohash } from "@/lib/handoff/manifest";
import { geocodeAddress, getDeviceLocation, type GeocodeFailureReason } from "@/lib/shared/geocode";
import { getCommonTokens, type CommonToken } from "@/lib/shared/commonTokens";

/**
 * Step 2 of the onboarding wizard. Collects the stable identity fields
 * that live on the operator profile document: name, slug, description,
 * specialty, location, logo, accepted-token list, default-pricing token.
 *
 * State is wallet-scoped and persisted to localStorage on every change
 * (via `useOnboardingState`). On Next, validates the required fields,
 * stamps the draft into the onboarding state, and routes to step 3.
 */

interface FormState {
    name: string;
    slug: string;
    description: string;
    specialty: string;
    geohash: string;
    addressText: string;
    geohashPrecision: 4 | 5 | 6 | 7 | 8;
    logoURI: string;
    acceptedTokens: Array<{ address: string; symbol: string }>;
    defaultTokenAddress: string;
}

const EMPTY_FORM: FormState = {
    name: "",
    slug: "",
    description: "",
    specialty: "",
    geohash: "",
    addressText: "",
    geohashPrecision: 6,
    logoURI: "",
    acceptedTokens: [{ address: "", symbol: "" }],
    defaultTokenAddress: "",
};

const PRECISION_LABELS: Record<FormState["geohashPrecision"], string> = {
    4: "4 chars (~20 km region)",
    5: "5 chars (~5 km)",
    6: "6 chars (~1 km — default)",
    7: "7 chars (~150 m)",
    8: "8 chars (~38 m)",
};

function geocodeErrorMessage(reason: GeocodeFailureReason): string {
    switch (reason) {
        case "empty-query":
            return "Type an address first.";
        case "no-match":
            return "Couldn't find that address. Try a more specific query.";
        case "http-error":
            return "Geocoder is rate-limiting or temporarily down. Wait a moment and try again.";
        case "network-error":
            return "Couldn't reach the geocoder. Check your connection (or browser extensions blocking the request) and try again.";
        case "malformed":
            return "Geocoder returned an unexpected response. Try a different query.";
    }
}

function slugify(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64);
}

function fromDraft(draft: OnboardingProfileDraft | undefined): FormState {
    if (!draft) return EMPTY_FORM;
    const storedGeohash = draft.location?.geohash ?? "";
    return {
        name: draft.name ?? "",
        slug: draft.slug ?? "",
        description: draft.description ?? "",
        specialty: draft.specialty ?? "",
        geohash: storedGeohash,
        addressText: draft.location?.addressText ?? "",
        geohashPrecision: (storedGeohash.length >= 4 && storedGeohash.length <= 8)
            ? (storedGeohash.length as FormState["geohashPrecision"])
            : 6,
        logoURI: draft.branding?.logoURI ?? "",
        acceptedTokens: draft.acceptedTokens && draft.acceptedTokens.length > 0
            ? draft.acceptedTokens.map((t) => ({ address: t.address, symbol: t.symbol }))
            : [{ address: "", symbol: "" }],
        defaultTokenAddress: draft.defaultTokenAddress ?? "",
    };
}

function toDraft(form: FormState): OnboardingProfileDraft {
    const seen = new Set<string>();
    const validTokens: AcceptedTokenMetadata[] = [];
    for (const t of form.acceptedTokens) {
        const integrity = addressIntegrity(t.address);
        const formatOk = integrity === "lowercase" || integrity === "checksum-valid";
        if (!formatOk || !t.symbol.trim()) continue;
        const lc = t.address.toLowerCase();
        if (seen.has(lc)) continue;
        seen.add(lc);
        validTokens.push({
            address: t.address as `0x${string}`,
            symbol: t.symbol.trim(),
        });
    }

    const defaultToken = validTokens.find(
        (t) => t.address.toLowerCase() === form.defaultTokenAddress.toLowerCase(),
    );

    return {
        name: form.name.trim() || undefined,
        slug: form.slug.trim() || undefined,
        description: form.description.trim() || undefined,
        specialty: form.specialty.trim() || undefined,
        location: form.geohash.trim() || form.addressText.trim()
            ? {
                geohash: form.geohash.trim(),
                addressText: form.addressText.trim() || undefined,
            }
            : undefined,
        branding: form.logoURI ? { logoURI: form.logoURI } : undefined,
        acceptedTokens: validTokens.length > 0 ? validTokens : undefined,
        defaultTokenAddress: defaultToken ? defaultToken.address : undefined,
    };
}

export interface OnboardingProfileFormProps {
    /**
     * When provided, the form's submit button calls this callback
     * with the assembled draft instead of routing to the next wizard
     * step. Used by the edit-profile page (`/operators/edit/profile`)
     * to wire submit through `OperatorRegistry.updateProfile` rather
     * than the wizard flow's `register`.
     *
     * Return a promise that rejects on failure; the form will surface
     * the error inline via the existing summary alert. Return resolved
     * to indicate success — the caller is responsible for any
     * post-success navigation.
     */
    onSave?: (draft: OnboardingProfileDraft) => Promise<void>;
    /** Submit-button label override. Defaults to "Next →". */
    submitLabel?: string;
    /** Back-link href override. Defaults to "/operators/onboard". */
    backHref?: string;
    /** Back-link label override. Defaults to "← Back". */
    backLabel?: string;
    /** Whether the submit is currently in flight. Suppresses double-submission. */
    submitInFlight?: boolean;
    /** External error from `onSave` to render alongside the form's own validation summary. */
    externalError?: string | null;
}

export function OnboardingProfileForm({
    onSave,
    submitLabel,
    backHref,
    backLabel,
    submitInFlight = false,
    externalError = null,
}: OnboardingProfileFormProps = {}) {
    const router = useRouter();
    const mounted = useMounted();
    const chainId = useChainId();
    const { address, isConnected } = useAccount();
    const { openConnectModal } = useConnectModal();
    const { state, loaded, update } = useOnboardingState(address);

    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [hydrated, setHydrated] = useState(false);
    const [slugTouched, setSlugTouched] = useState(false);
    const [locating, setLocating] = useState<"device" | "address" | null>(null);
    const [locateError, setLocateError] = useState<string | null>(null);

    const commonTokens = useMemo(
        () => getCommonTokens(chainId).filter(
            (t) => !form.acceptedTokens.some(
                (existing) => existing.address.toLowerCase() === t.address.toLowerCase(),
            ),
        ),
        [chainId, form.acceptedTokens],
    );

    // Hydrate from localStorage once the wallet-keyed state is available.
    // `loaded` (not `state.profile !== undefined`) is the correct gate:
    // new users have no draft, so `state.profile` never changes, and
    // the previous gate left them stuck unhydrated — which then
    // disabled the persistence effect below, so nothing they typed
    // ever reached localStorage.
    useEffect(() => {
        if (hydrated || !loaded) return;
        const next = fromDraft(state.profile);
        setForm(next);
        // If the loaded slug differs from the slug we'd derive from
        // the loaded name, treat the slug as user-edited so we don't
        // overwrite it later.
        if (next.slug && next.slug !== slugify(next.name)) {
            setSlugTouched(true);
        }
        setHydrated(true);
    }, [hydrated, loaded, state.profile]);

    // Persist on every form change so a refresh / navigation doesn't lose work.
    useEffect(() => {
        if (!hydrated || !isConnected) return;
        update({ profile: toDraft(form) });
    }, [form, hydrated, isConnected, update]);

    const validTokens = useMemo(
        () => form.acceptedTokens.filter((t) => isValidAddress(t.address) && t.symbol.trim()),
        [form.acceptedTokens],
    );

    function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    function setName(value: string) {
        setForm((prev) => ({
            ...prev,
            name: value,
            slug: slugTouched ? prev.slug : slugify(value),
        }));
    }

    function setSlug(value: string) {
        setSlugTouched(true);
        setField("slug", value);
    }

    async function locateFromDevice() {
        setLocating("device");
        setLocateError(null);
        try {
            const position = await getDeviceLocation();
            if (!position) {
                setLocateError("Couldn't read device location. Permission denied or unavailable.");
                return;
            }
            const hash = encodeGeohash(position.lat, position.lon, form.geohashPrecision);
            setField("geohash", hash);
        } finally {
            setLocating(null);
        }
    }

    async function locateFromAddress() {
        if (!form.addressText.trim()) {
            setLocateError("Type an address first.");
            return;
        }
        setLocating("address");
        setLocateError(null);
        try {
            const outcome = await geocodeAddress(form.addressText);
            if (!outcome.ok) {
                setLocateError(geocodeErrorMessage(outcome.reason));
                return;
            }
            const hash = encodeGeohash(outcome.result.lat, outcome.result.lon, form.geohashPrecision);
            setField("geohash", hash);
        } finally {
            setLocating(null);
        }
    }

    function setTokenField(index: number, key: "address" | "symbol", value: string) {
        setForm((prev) => ({
            ...prev,
            acceptedTokens: prev.acceptedTokens.map((t, i) =>
                i === index
                    ? key === "address"
                        // Address change resets the symbol; the row's
                        // useTokenSymbol effect will re-fetch.
                        ? { address: value, symbol: "" }
                        : { ...t, symbol: value }
                    : t,
            ),
        }));
    }

    function addTokenRow() {
        setForm((prev) => ({
            ...prev,
            acceptedTokens: [...prev.acceptedTokens, { address: "", symbol: "" }],
        }));
    }

    function removeTokenRow(index: number) {
        setForm((prev) => ({
            ...prev,
            acceptedTokens: prev.acceptedTokens.filter((_, i) => i !== index),
        }));
    }

    function quickAddToken(token: CommonToken) {
        setForm((prev) => {
            // Drop the leading empty row if present so the quick-add lands cleanly.
            const filtered = prev.acceptedTokens.filter(
                (t) => t.address.trim() || t.symbol.trim(),
            );
            return {
                ...prev,
                acceptedTokens: [
                    ...filtered,
                    { address: token.address, symbol: token.symbol },
                ],
            };
        });
    }

    function validateAndContinue(e: React.FormEvent) {
        e.preventDefault();
        const next: Record<string, string> = {};
        if (!form.name.trim()) next.name = "Name is required.";
        if (!form.slug.trim()) {
            next.slug = "URL handle is required.";
        } else if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]?$/.test(form.slug.trim())) {
            next.slug = "Use lowercase letters, digits, and hyphens. No spaces.";
        }
        if (validTokens.length === 0) {
            next.acceptedTokens = "Add at least one accepted token. Catalogue prices are denominated in your default token.";
        } else {
            // Reject zero-address, EIP-55 checksum mismatches, and
            // duplicate entries before letting the form pass — these
            // would either fail downstream or pin a corrupted profile.
            const seen = new Set<string>();
            let rowError: string | null = null;
            for (const t of form.acceptedTokens) {
                const integrity = addressIntegrity(t.address);
                if (integrity === "zero") {
                    rowError = "Remove the zero address from the accepted-token list.";
                    break;
                }
                if (integrity === "checksum-invalid") {
                    rowError = "Fix the address with the invalid EIP-55 checksum (highlighted below).";
                    break;
                }
                const lc = t.address.trim().toLowerCase();
                if (lc && seen.has(lc)) {
                    rowError = "Remove the duplicate token (highlighted below).";
                    break;
                }
                if (lc) seen.add(lc);
            }
            if (rowError) {
                next.acceptedTokens = rowError;
            } else if (!form.defaultTokenAddress) {
                next.defaultTokenAddress = "Pick which accepted token your catalogue is priced in.";
            }
        }
        setErrors(next);
        if (Object.keys(next).length === 0) {
            if (onSave) {
                // Edit mode: caller handles success/failure (re-pin + updateProfile).
                // We don't navigate; the caller decides when and where to redirect.
                onSave(toDraft(form)).catch(() => {
                    // The caller should have surfaced the error via externalError;
                    // we swallow here so React's unhandled-rejection logger stays quiet.
                });
            } else {
                router.push("/operators/onboard/catalogue");
            }
            return;
        }
        // Focus the first invalid field so the user sees the error
        // without having to scroll up the page.
        const firstErrorKey = ["name", "slug", "acceptedTokens", "defaultTokenAddress"].find((k) => next[k]);
        if (firstErrorKey) {
            // Radio group has no `id`; the accepted-tokens section
            // isn't a single field. Map the error key to a focus
            // target.
            const selector = firstErrorKey === "defaultTokenAddress"
                ? 'input[name="defaultTokenAddress"]'
                : firstErrorKey === "acceptedTokens"
                    ? "#accepted-tokens-section"
                    : `#profile-${firstErrorKey}`;
            const el = document.querySelector<HTMLElement>(selector);
            if (el) {
                el.focus({ preventScroll: false });
                el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }
    }

    if (!mounted) {
        return <Card className="p-6 text-sm text-ink-faint">Loading…</Card>;
    }

    if (!isConnected) {
        return (
            <Card className="p-6 space-y-4">
                <p className="text-sm text-ink-body">
                    Connect a wallet to start your profile draft. The wizard
                    saves your progress under that wallet&apos;s address; if you
                    switch wallets, you&apos;ll see that wallet&apos;s separate draft.
                </p>
                <Button onClick={() => openConnectModal?.()}>Connect wallet</Button>
            </Card>
        );
    }

    const errorCount = Object.keys(errors).length;

    return (
        <form onSubmit={validateAndContinue} className="space-y-12" noValidate>
            {/* ── Identity ───────────────────────────────────────────── */}
            <section className="space-y-6">
                <h2 className="text-eyebrow uppercase text-ink-muted">Identity</h2>
                <FormField label="Name" inputId="profile-name" required error={errors.name}>
                    <Input
                        id="profile-name"
                        type="text"
                        placeholder="e.g. Bob's Pizza Palace"
                        value={form.name}
                        onChange={(e) => setName(e.target.value)}
                        hasError={!!errors.name}
                        errorId={errors.name ? "profile-name-error" : undefined}
                        aria-required="true"
                    />
                </FormField>
                <FormField
                    label="URL handle (slug)"
                    inputId="profile-slug"
                    required
                    error={errors.slug}
                >
                    <Input
                        id="profile-slug"
                        type="text"
                        placeholder="bobs-pizza-palace"
                        value={form.slug}
                        onChange={(e) => setSlug(e.target.value)}
                        hasError={!!errors.slug}
                        errorId={errors.slug ? "profile-slug-error" : undefined}
                        aria-required="true"
                    />
                    <p className="text-xs text-ink-faint mt-1">
                        Used in your public URL <code>/m/{form.slug || "your-handle"}</code>. Auto-fills from the name as you type; edit to override.
                    </p>
                </FormField>
                <FormField label="Description" inputId="profile-description">
                    <textarea
                        id="profile-description"
                        rows={2}
                        placeholder="One or two sentences. Optional."
                        value={form.description}
                        onChange={(e) => setField("description", e.target.value)}
                        className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-black text-sm placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                    />
                </FormField>
                <FormField label="Specialty" inputId="profile-specialty">
                    <Input
                        id="profile-specialty"
                        type="text"
                        placeholder='e.g. "Italian café", "immigration law", "bicycle repair"'
                        value={form.specialty}
                        onChange={(e) => setField("specialty", e.target.value)}
                    />
                    <p className="text-xs text-ink-faint mt-1">
                        Free-form. What you specialise in, in your own words.
                    </p>
                </FormField>
            </section>

            {/* ── Location ──────────────────────────────────────────── */}
            <section className="space-y-6">
                <h2 className="text-eyebrow uppercase text-ink-muted">Location</h2>
                <FormField label="Address" inputId="profile-address">
                    <Input
                        id="profile-address"
                        type="text"
                        placeholder="e.g. 100 Bowery, Lower Manhattan, NY"
                        value={form.addressText}
                        onChange={(e) => setField("addressText", e.target.value)}
                    />
                    <p className="text-xs text-ink-faint mt-1">
                        Optional, public. Use a coarse description if you&apos;d rather not publish a precise address.
                    </p>
                </FormField>

                <FormField label="Geohash precision" inputId="profile-geohash-precision">
                    <select
                        id="profile-geohash-precision"
                        value={form.geohashPrecision}
                        onChange={(e) => setField("geohashPrecision", Number(e.target.value) as FormState["geohashPrecision"])}
                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-black text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                    >
                        {([4, 5, 6, 7, 8] as const).map((p) => (
                            <option key={p} value={p}>{PRECISION_LABELS[p]}</option>
                        ))}
                    </select>
                    <p className="text-xs text-ink-faint mt-1">
                        Coarser precision (4–5 chars) hides your exact location while still anchoring you to a region. Finer precision (7–8 chars) helps proximity-based discovery.
                    </p>
                </FormField>

                <FormField label="Geohash" inputId="profile-geohash">
                    <div className="flex flex-col gap-2">
                        <Input
                            id="profile-geohash"
                            type="text"
                            placeholder="e.g. dr5reg"
                            value={form.geohash}
                            onChange={(e) => setField("geohash", e.target.value)}
                        />
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={locateFromAddress}
                                disabled={locating !== null || !form.addressText.trim()}
                            >
                                {locating === "address" ? "Geocoding…" : "From address above"}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={locateFromDevice}
                                disabled={locating !== null}
                            >
                                {locating === "device" ? "Locating…" : "Use device location"}
                            </Button>
                        </div>
                        {locateError && (
                            <p className="text-xs text-red-600" role="alert">{locateError}</p>
                        )}
                        <p className="text-xs text-ink-faint">
                            Auto-fill from the address (geocoded via OpenStreetMap) or your device&apos;s location. You can also paste a geohash from any tool — the encoding is standard base32.
                        </p>
                    </div>
                </FormField>
            </section>

            {/* ── Branding ──────────────────────────────────────────── */}
            <section className="space-y-6">
                <h2 className="text-eyebrow uppercase text-ink-muted">Branding</h2>
                <FormField label="Logo">
                    <IpfsImageUpload
                        value={form.logoURI}
                        onChange={(uri) => setField("logoURI", uri)}
                        label="Upload logo"
                    />
                    <p className="text-xs text-ink-faint mt-1">
                        Optional. Pinned to IPFS. Shown on the discover card and the merchant detail page.
                    </p>
                </FormField>
            </section>

            {/* ── Tokens ────────────────────────────────────────────── */}
            <section id="accepted-tokens-section" tabIndex={-1} className="space-y-6 scroll-mt-20">
                <h2 className="text-eyebrow uppercase text-ink-muted">Accepted tokens</h2>
                <p className="text-sm text-ink-body">
                    The set of ERC-20s you accept for settlement. This is the
                    seller&apos;s &ldquo;value-system flag&rdquo; — buyers pay in any one of these
                    at commit time. The frontend converts from your default
                    pricing token at quote time. Add at least one token if you
                    want to publish a catalogue.
                </p>

                {commonTokens.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-ink-faint">Quick-add:</span>
                        {commonTokens.map((token) => (
                            <button
                                key={token.address}
                                type="button"
                                onClick={() => quickAddToken(token)}
                                className="text-xs px-3 py-1 rounded-full border border-default text-ink-heading hover:bg-paper-200 transition-colors"
                                title={`${token.name} — ${token.address}`}
                            >
                                + {token.symbol}
                            </button>
                        ))}
                    </div>
                )}

                <div className="space-y-3">
                    {form.acceptedTokens.map((token, index) => {
                        const lc = token.address.trim().toLowerCase();
                        const isDuplicate =
                            lc.length > 0 &&
                            form.acceptedTokens.some(
                                (other, i) => i !== index && other.address.trim().toLowerCase() === lc,
                            );
                        return (
                            <AcceptedTokenRow
                                key={index}
                                value={token}
                                onChange={(next) => setForm((prev) => ({
                                    ...prev,
                                    acceptedTokens: prev.acceptedTokens.map((t, i) => (i === index ? next : t)),
                                }))}
                                onRemove={form.acceptedTokens.length > 1 ? () => removeTokenRow(index) : undefined}
                                hasError={Boolean(errors.acceptedTokens) && !isValidAddress(token.address)}
                                isDuplicate={isDuplicate}
                            />
                        );
                    })}
                    <button
                        type="button"
                        onClick={addTokenRow}
                        className="text-sm text-ink-faint hover:text-ink-heading transition-colors"
                    >
                        + Add token
                    </button>
                    {commonTokens.length === 0 && form.acceptedTokens.every((t) => !t.address.trim()) && (
                        <p className="text-xs text-ink-faint">
                            No quick-add tokens registered for this network. Paste an ERC-20 address above to fetch its symbol from the contract.
                        </p>
                    )}
                    {errors.acceptedTokens && (
                        <p className="text-sm text-red-600" role="alert">{errors.acceptedTokens}</p>
                    )}
                </div>

                {validTokens.length > 0 && (
                    <FormField
                        label="Default pricing token"
                        required
                        error={errors.defaultTokenAddress}
                    >
                        <p className="text-xs text-ink-faint mb-2">
                            Your catalogue is priced in this token. Buyers paying
                            in another accepted token see a converted price (via
                            Uniswap) at the moment of commit.
                        </p>
                        <div className="space-y-2">
                            {validTokens.map((token) => (
                                <label
                                    key={token.address}
                                    className="flex items-center gap-3 cursor-pointer text-sm"
                                >
                                    <input
                                        type="radio"
                                        name="defaultTokenAddress"
                                        value={token.address}
                                        checked={form.defaultTokenAddress.toLowerCase() === token.address.toLowerCase()}
                                        onChange={() => setField("defaultTokenAddress", token.address)}
                                        aria-required="true"
                                    />
                                    <span className="font-semibold text-ink-heading">{token.symbol}</span>
                                    <code className="text-xs text-ink-faint font-mono">{token.address}</code>
                                </label>
                            ))}
                        </div>
                    </FormField>
                )}
            </section>

            {/* ── Nav ───────────────────────────────────────────────── */}
            <div className="space-y-3 pt-4 border-t border-default">
                {errorCount > 0 && (
                    <p className="text-sm text-red-600" role="alert">
                        {errorCount === 1
                            ? "Fix the highlighted field to continue."
                            : `Fix the ${errorCount} highlighted fields to continue.`}
                    </p>
                )}
                {externalError && (
                    <p className="text-sm text-red-600" role="alert">{externalError}</p>
                )}
                <div className="flex items-center justify-between">
                    <Link
                        href={backHref ?? "/operators/onboard"}
                        className="text-sm text-ink-faint hover:text-ink-heading transition-colors"
                    >
                        {backLabel ?? "← Back"}
                    </Link>
                    <Button type="submit" disabled={submitInFlight}>
                        {submitInFlight ? "Saving…" : (submitLabel ?? "Next →")}
                    </Button>
                </div>
            </div>
        </form>
    );
}

interface AcceptedTokenRowProps {
    value: { address: string; symbol: string };
    onChange: (next: { address: string; symbol: string }) => void;
    onRemove?: () => void;
    hasError?: boolean;
    isDuplicate?: boolean;
}

/**
 * One accepted-token row: just the address input. Symbol is fetched
 * from the contract via `useTokenSymbol(address)` and persisted to
 * state when it resolves. Replaces the previous two-input layout
 * (manual address + manual symbol) — the chain already knows the
 * symbol; users shouldn't have to type it.
 *
 * Validation surfaces in the symbolHint line below the input. Three
 * categories, in priority order:
 *   1. Format / integrity (caught locally): empty, malformed, zero
 *      address, mixed-case with bad EIP-55 checksum, or duplicate
 *      within this operator's own list.
 *   2. On-chain check (caught by `useTokenSymbol`): contract doesn't
 *      exist or doesn't expose `symbol()` → not an ERC-20.
 *   3. Success: symbol shown.
 *
 * No central token registry — the chain is the registry. The
 * `symbol()` read is the registry lookup.
 */
function AcceptedTokenRow({ value, onChange, onRemove, hasError = false, isDuplicate = false }: AcceptedTokenRowProps) {
    const integrity = addressIntegrity(value.address);
    const formatOk = integrity === "lowercase" || integrity === "checksum-valid";
    // Only fetch symbol() once the address passes local checks AND
    // isn't a flagged duplicate — saves an RPC call per bad row.
    const { data: resolvedSymbol, isLoading, error } = useTokenSymbol(formatOk && !isDuplicate ? value.address : "");
    const errorKind = classifyTokenError(error);

    // When the on-chain symbol resolves, persist it. Guard avoids loops.
    useEffect(() => {
        if (!resolvedSymbol) return;
        if (resolvedSymbol === value.symbol) return;
        onChange({ ...value, symbol: resolvedSymbol });
    }, [resolvedSymbol, value, onChange]);

    let symbolHint: React.ReactNode = null;
    if (integrity === "not-address" && value.address.length > 0) {
        symbolHint = <span className="text-red-600">Not a valid 20-byte hex address.</span>;
    } else if (integrity === "zero") {
        symbolHint = <span className="text-red-600">Zero address can&apos;t be a token. Use a real ERC-20 contract address.</span>;
    } else if (integrity === "checksum-invalid") {
        symbolHint = <span className="text-red-600">Mixed-case address with invalid EIP-55 checksum — likely a typo. Re-paste from the source, or use the all-lowercase form.</span>;
    } else if (isDuplicate) {
        symbolHint = <span className="text-red-600">You already added this token. Remove one of the duplicate rows.</span>;
    } else if (formatOk) {
        if (isLoading) {
            symbolHint = "Reading symbol from contract…";
        } else if (resolvedSymbol) {
            symbolHint = <>Symbol: <span className="font-semibold text-ink-heading">{resolvedSymbol}</span></>;
        } else if (errorKind === "no-rpc") {
            symbolHint = (
                <span className="text-red-600">
                    Can&apos;t verify — chain RPC unreachable. Make sure your wallet is connected to a chain that&apos;s running (devnet: <code>./deploy-local.sh</code>).
                </span>
            );
        } else {
            symbolHint = <span className="text-red-600">Address is not an ERC-20 (no <code>symbol()</code>) on the connected chain. Remove or correct.</span>;
        }
    }

    const rowHasError =
        hasError ||
        integrity === "zero" ||
        integrity === "checksum-invalid" ||
        isDuplicate;

    return (
        <div className="space-y-1">
            <TokenAddressInput
                value={value.address}
                onChange={(addr) => onChange({ address: addr, symbol: "" })}
                onRemove={onRemove}
                hasError={rowHasError}
            />
            {symbolHint && <p className="text-xs text-ink-faint">{symbolHint}</p>}
        </div>
    );
}
