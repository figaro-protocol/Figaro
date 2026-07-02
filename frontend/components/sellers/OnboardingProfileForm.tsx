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
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import {
    TokenAddressInput,
    classifyTokenError,
    useTokenSymbol,
} from "@/components/sellers/TokenAddressInput";
import { addressIntegrity, isValidAddress } from "@/lib/shared/evm";
import { IpfsImageUpload } from "@/components/sellers/IpfsImageUpload";
import { useMounted } from "@/hooks/useMounted";
import { useOnboardingState } from "@/lib/seller/onboardingState";
import type {
    OnboardingProfileDraft,
} from "@/lib/seller/onboardingState";
import type { AcceptedTokenMetadata } from "@/lib/seller/acceptedTokenMetadata";
import { encodeGeohash } from "@/lib/handoff/geohash";
import { geocodeAddress, getDeviceLocation, type GeocodeFailureReason } from "@/lib/seller/geocode";
import { getCommonTokens, type CommonToken } from "@/lib/seller/commonTokens";
import { hexEqual } from "@/lib/shared/evm";

/**
 * Step 2 of the onboarding wizard. Collects the stable identity fields
 * that live on the seller profile document: name, description,
 * specialty, location, logo, accepted-token list, default-pricing token.
 *
 * State is wallet-scoped and persisted to localStorage on every change
 * (via `useOnboardingState`). On Next, validates the required fields,
 * stamps the draft into the onboarding state, and routes to step 3.
 */

interface FormState {
    name: string;
    description: string;
    specialty: string;
    geohash: string;
    addressText: string;
    geohashPrecision: 9 | 10 | 11 | 12;
    logoURI: string;
    acceptedTokens: Array<{ address: string; symbol: string }>;
    defaultTokenAddress: string;
}

const EMPTY_FORM: FormState = {
    name: "",
    description: "",
    specialty: "",
    geohash: "",
    addressText: "",
    geohashPrecision: 10,
    logoURI: "",
    acceptedTokens: [{ address: "", symbol: "" }],
    defaultTokenAddress: "",
};

const PRECISION_LABELS: Record<FormState["geohashPrecision"], string> = {
    9: "9 chars (~4.8 m)",
    10: "10 chars (~1.2 m — default)",
    11: "11 chars (~15 cm)",
    12: "12 chars (~3.7 cm)",
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

function fromDraft(draft: OnboardingProfileDraft | undefined): FormState {
    if (!draft) return EMPTY_FORM;
    const storedGeohash = draft.location?.geohash ?? "";
    return {
        name: draft.name ?? "",
        description: draft.description ?? "",
        specialty: draft.specialty ?? "",
        geohash: storedGeohash,
        addressText: draft.location?.addressText ?? "",
        geohashPrecision: (storedGeohash.length >= 9 && storedGeohash.length <= 12)
            ? (storedGeohash.length as FormState["geohashPrecision"])
            : 10,
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
        (t) => hexEqual(t.address, form.defaultTokenAddress),
    );

    return {
        name: form.name.trim() || undefined,
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
     * step. Used by the edit-identity page (`/sellers/edit/identity`)
     * to wire submit through `SellerRegistry.updateProfile` rather
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
    /** Back-link href override. Defaults to "/sellers". */
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
    const [locating, setLocating] = useState<"device" | "address" | null>(null);
    const [locateError, setLocateError] = useState<string | null>(null);

    const commonTokens = useMemo(
        () => getCommonTokens(chainId).filter(
            (t) => !form.acceptedTokens.some(
                (existing) => hexEqual(existing.address, t.address),
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

    // Auto-select the first valid token as the default pricing token
    // when (a) nothing is selected yet, or (b) the previously-selected
    // default got removed and is no longer in the valid set. Without
    // this, the seller has to remember to click the radio that just
    // appeared — easy to miss when there's only one option visible.
    useEffect(() => {
        if (validTokens.length === 0) return;
        const stillValid = validTokens.some((t) => hexEqual(t.address, form.defaultTokenAddress));
        if (!form.defaultTokenAddress || !stillValid) {
            setForm((prev) => ({ ...prev, defaultTokenAddress: validTokens[0].address }));
        }
    }, [validTokens, form.defaultTokenAddress]);

    function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    function setName(value: string) {
        setField("name", value);
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
                router.push("/sellers/catalogue");
            }
            return;
        }
        // Focus the first invalid field so the user sees the error
        // without having to scroll up the page.
        const firstErrorKey = ["name", "acceptedTokens", "defaultTokenAddress"].find((k) => next[k]);
        if (firstErrorKey) {
            // Radio group has no `id`; the accepted-tokens section
            // isn't a single field. Map the error key to a focus
            // target.
            const selector = firstErrorKey === "defaultTokenAddress"
                ? 'input[name="defaultTokenAddress"]'
                : firstErrorKey === "acceptedTokens"
                    ? "#profile-section-accepted-tokens"
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
            <section
                id="profile-section-identity"
                tabIndex={-1}
                aria-labelledby="profile-heading-identity"
                className="space-y-6 scroll-mt-20"
            >
                <h3 id="profile-heading-identity" className="text-heading-h3 text-ink-heading">Identity</h3>
                <p className="text-sm text-ink-body">
                    Name, description, and specialty — the fields that resolve
                    when a buyer or another seller looks up your address on
                    the protocol. Everything in this section pins to IPFS in
                    at publish, as part of your identity envelope.
                </p>
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
                <FormField label="Description" inputId="profile-description">
                    <Textarea
                        id="profile-description"
                        rows={2}
                        placeholder="One or two sentences. Optional."
                        value={form.description}
                        onChange={(e) => setField("description", e.target.value)}
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
            <section
                id="profile-section-location"
                tabIndex={-1}
                aria-labelledby="profile-heading-location"
                className="space-y-6 scroll-mt-20"
            >
                <h3 id="profile-heading-location" className="text-heading-h3 text-ink-heading">Location</h3>
                <p className="text-sm text-ink-body">
                    Optional, public. The geohash anchors your handoff point
                    for proximity-proof attestations; metres-to-centimetres
                    precision is what those attestations expect. The
                    human-readable address is shown verbatim on your{" "}
                    <code>/m/&lt;address&gt;</code> page.
                </p>
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
                    <Select
                        id="profile-geohash-precision"
                        value={form.geohashPrecision}
                        onChange={(e) => setField("geohashPrecision", Number(e.target.value) as FormState["geohashPrecision"])}
                    >
                        {([9, 10, 11, 12] as const).map((p) => (
                            <option key={p} value={p}>{PRECISION_LABELS[p]}</option>
                        ))}
                    </Select>
                    <p className="text-xs text-ink-faint mt-1">
                        Higher precision anchors your location to within metres or centimetres — the resolution proximity-proof attestations need at handoff time. 10 chars (~1.2 m) is the default; 12 chars (~3.7 cm) gets you GPS-grade resolution.
                    </p>
                </FormField>

                <FormField label="Geohash" inputId="profile-geohash">
                    <div className="flex flex-col gap-2">
                        <Input
                            id="profile-geohash"
                            type="text"
                            placeholder="e.g. dr5regw3pp"
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
            <section
                id="profile-section-branding"
                tabIndex={-1}
                aria-labelledby="profile-heading-branding"
                className="space-y-6 scroll-mt-20"
            >
                <h3 id="profile-heading-branding" className="text-heading-h3 text-ink-heading">Branding</h3>
                <p className="text-sm text-ink-body">
                    Optional. The logo is shown on the discover card and on
                    your <code>/m/&lt;address&gt;</code> page. It pins
                    alongside the rest of your identity envelope, so changing
                    the logo re-pins the profile.
                </p>
                <FormField label="Logo">
                    <IpfsImageUpload
                        value={form.logoURI}
                        onChange={(uri) => setField("logoURI", uri)}
                        label="Upload logo"
                    />
                    <p className="text-xs text-ink-faint mt-1">
                        Optional. Pinned to IPFS. Shown on the discover card and the seller detail page.
                    </p>
                </FormField>
            </section>

            {/* ── Tokens ────────────────────────────────────────────── */}
            <section
                id="profile-section-accepted-tokens"
                tabIndex={-1}
                aria-labelledby="profile-heading-accepted-tokens"
                className="space-y-6 scroll-mt-20"
            >
                <h3 id="profile-heading-accepted-tokens" className="text-heading-h3 text-ink-heading">Accepted tokens</h3>
                <p className="text-sm text-ink-body">
                    Accepting a token is an identity declaration, not just a
                    payment choice. Each token you list says which value system
                    you coordinate with: a stablecoin signals legal-system
                    alignment, a DAO governance token signals community
                    membership in that DAO, ETH signals settlement-layer
                    alignment, a commodity-backed token signals value
                    anchoring. The accepted-token list is your brand — buyers
                    searching for aligned counterparties read it before they
                    read your catalogue.
                </p>
                <p className="text-sm text-ink-body">
                    Operationally: buyers pay in any one of the tokens listed
                    here at commit time, and the frontend converts from your
                    default pricing token at quote time. Add at least one
                    token if you want to publish a catalogue.
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
                                (other, i) => i !== index && hexEqual(other.address.trim(), lc),
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
                                        checked={hexEqual(form.defaultTokenAddress, token.address)}
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
                        href={backHref ?? "/sellers"}
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
 *      within this seller's own list.
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
