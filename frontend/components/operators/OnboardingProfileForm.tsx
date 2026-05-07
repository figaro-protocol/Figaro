"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { TokenAddressInput, isValidAddress } from "@/components/operators/TokenAddressInput";
import { IpfsImageUpload } from "@/components/operators/IpfsImageUpload";
import { useMounted } from "@/lib/shared/useMounted";
import { useOnboardingState } from "@/lib/operators/onboardingState";
import type {
    OnboardingProfileDraft,
} from "@/lib/operators/onboardingState";
import type { AcceptedTokenMetadata } from "@/lib/shared/sellerCatalogueMetadata";

/**
 * Step 2 of the onboarding wizard. Collects the stable identity fields
 * that live on the operator profile document: name, slug, description,
 * specialty, location, logo, accepted-token list, default-pricing token.
 *
 * State is wallet-scoped and persisted to localStorage on every change
 * (via `useOnboardingState`). On Next, validates the required fields,
 * stamps the draft into the onboarding state, and routes to step 3.
 *
 * Branding (CSS, hero image, accent colour, theme class) and assets
 * (image base URI) are deferred to a later iteration; this commit
 * handles the most-used branding field (`logoURI`) only.
 */

interface FormState {
    name: string;
    slug: string;
    description: string;
    specialty: string;
    geohash: string;
    addressText: string;
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
    logoURI: "",
    acceptedTokens: [{ address: "", symbol: "" }],
    defaultTokenAddress: "",
};

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
    return {
        name: draft.name ?? "",
        slug: draft.slug ?? "",
        description: draft.description ?? "",
        specialty: draft.specialty ?? "",
        geohash: draft.location?.geohash ?? "",
        addressText: draft.location?.addressText ?? "",
        logoURI: draft.branding?.logoURI ?? "",
        acceptedTokens: draft.acceptedTokens && draft.acceptedTokens.length > 0
            ? draft.acceptedTokens.map((t) => ({ address: t.address, symbol: t.symbol }))
            : [{ address: "", symbol: "" }],
        defaultTokenAddress: draft.defaultTokenAddress ?? "",
    };
}

function toDraft(form: FormState): OnboardingProfileDraft {
    const validTokens: AcceptedTokenMetadata[] = form.acceptedTokens
        .filter((t) => isValidAddress(t.address) && t.symbol.trim())
        .map((t) => ({
            address: t.address as `0x${string}`,
            symbol: t.symbol.trim(),
        }));

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

export function OnboardingProfileForm() {
    const router = useRouter();
    const mounted = useMounted();
    const { address, isConnected } = useAccount();
    const { openConnectModal } = useConnectModal();
    const { state, update } = useOnboardingState(address);

    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [hydrated, setHydrated] = useState(false);

    // Hydrate from localStorage once the wallet-keyed state is available.
    useEffect(() => {
        if (hydrated) return;
        if (state.profile !== undefined || !isConnected) {
            setForm(fromDraft(state.profile));
            setHydrated(true);
        }
    }, [hydrated, state.profile, isConnected]);

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

    function autoSlug() {
        if (!form.slug.trim() && form.name.trim()) {
            setField("slug", slugify(form.name));
        }
    }

    function setTokenField(index: number, key: "address" | "symbol", value: string) {
        setForm((prev) => ({
            ...prev,
            acceptedTokens: prev.acceptedTokens.map((t, i) =>
                i === index ? { ...t, [key]: value } : t,
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

    function validateAndContinue(e: React.FormEvent) {
        e.preventDefault();
        const next: Record<string, string> = {};
        if (!form.name.trim()) next.name = "Name is required.";
        if (!form.slug.trim()) {
            next.slug = "URL handle is required.";
        } else if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]?$/.test(form.slug.trim())) {
            next.slug = "Use lowercase letters, digits, and hyphens. No spaces.";
        }
        if (validTokens.length > 0 && !form.defaultTokenAddress) {
            next.defaultTokenAddress = "Pick which accepted token your catalogue is priced in.";
        }
        setErrors(next);
        if (Object.keys(next).length === 0) {
            router.push("/operators/onboard/catalogue");
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

    return (
        <form onSubmit={validateAndContinue} className="space-y-12">
            {/* ── Identity ───────────────────────────────────────────── */}
            <section className="space-y-6">
                <h2 className="text-eyebrow uppercase text-ink-muted">Identity</h2>
                <FormField label="Name" inputId="profile-name" required error={errors.name}>
                    <Input
                        id="profile-name"
                        type="text"
                        placeholder="e.g. Bob's Pizza Palace"
                        value={form.name}
                        onChange={(e) => setField("name", e.target.value)}
                        onBlur={autoSlug}
                        hasError={!!errors.name}
                        required
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
                        onChange={(e) => setField("slug", e.target.value)}
                        hasError={!!errors.slug}
                        required
                        aria-required="true"
                    />
                    <p className="text-xs text-ink-faint mt-1">
                        Used in your public URL <code>/m/{form.slug || "your-handle"}</code>. Auto-derived from the name when blank.
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
                <FormField label="Geohash" inputId="profile-geohash">
                    <Input
                        id="profile-geohash"
                        type="text"
                        placeholder="e.g. dr5reg"
                        value={form.geohash}
                        onChange={(e) => setField("geohash", e.target.value)}
                    />
                    <p className="text-xs text-ink-faint mt-1">
                        Anchors your profile geographically. Use a 4–6 character geohash via{" "}
                        <a
                            href="https://geohash.softeng.co"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-ink-heading"
                        >
                            geohash.softeng.co
                        </a>{" "}
                        or your map tool of choice.
                    </p>
                </FormField>
                <FormField label="Address text" inputId="profile-address">
                    <Input
                        id="profile-address"
                        type="text"
                        placeholder="e.g. Lower Manhattan, NY"
                        value={form.addressText}
                        onChange={(e) => setField("addressText", e.target.value)}
                    />
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
            <section className="space-y-6">
                <h2 className="text-eyebrow uppercase text-ink-muted">Accepted tokens</h2>
                <p className="text-sm text-ink-body">
                    The set of ERC-20s you accept for settlement. This is the
                    seller&apos;s &ldquo;value-system flag&rdquo; — buyers pay in any one of these
                    at commit time. The frontend converts from your default
                    pricing token at quote time. Add at least one token if you
                    want to publish a catalogue.
                </p>
                <div className="space-y-3">
                    {form.acceptedTokens.map((token, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <div className="flex-1">
                                <TokenAddressInput
                                    value={token.address}
                                    onChange={(v) => setTokenField(index, "address", v)}
                                    onRemove={form.acceptedTokens.length > 1 ? () => removeTokenRow(index) : undefined}
                                />
                            </div>
                            <Input
                                type="text"
                                placeholder="symbol"
                                value={token.symbol}
                                onChange={(e) => setTokenField(index, "symbol", e.target.value)}
                                className="w-24"
                            />
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={addTokenRow}
                        className="text-sm text-ink-faint hover:text-ink-heading transition-colors"
                    >
                        + Add token
                    </button>
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
            <div className="flex items-center justify-between pt-4 border-t border-default">
                <Link
                    href="/operators/onboard"
                    className="text-sm text-ink-faint hover:text-ink-heading transition-colors"
                >
                    ← Back
                </Link>
                <Button type="submit">Next →</Button>
            </div>
        </form>
    );
}
