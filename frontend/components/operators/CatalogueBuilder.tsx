"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import { publishMerchantCatalogue } from "@/lib/shared/cataloguePublisher";
import type {
    SellerCatalogueMetadata,
    CatalogueItemMetadata,
    AcceptedTokenMetadata,
} from "@/lib/shared/sellerCatalogueMetadata";
import { TokenAddressInput, isValidAddress } from "./TokenAddressInput";

/**
 * CatalogueBuilder — operator-facing form that emits a canonical
 * `SellerCatalogueMetadata` document. Routes through
 * `publishMerchantCatalogue`, which round-trip-validates against
 * `parseSellerCatalogueDocument` before pinning, so any document that
 * pins is one the buyer side will accept under strict parsing.
 *
 * On success, hands off to `/operators?catalogueURI=<ipfs-uri>` — the
 * operator-onboarding form picks the URI up via `useSearchParams` and
 * inlines it into the profile JSON pinned and registered on-chain via
 * `OperatorRegistry.register(role, profileURI, deposit)`.
 *
 * Required `SellerCatalogueMetadata` fields (per
 * `sellerCatalogueMetadataParser.parseSellerCatalogueDocument`):
 *
 *   subjectAddress   — connected wallet (read via `useAccount`)
 *   archetypeId      — operator picks via dropdown
 *   merchantId, slug — slugified from name
 *   name             — input
 *   fulfillmentModes — multi-checkbox, ≥1 required
 *   location.geohash — input
 *   menu             — ≥1 item with name + price required
 *   version          — hardcoded "1.0.0"
 *
 * Branding (logo upload), description, and acceptedTokens are also
 * collected — these populate the buyer-side surfaces (discover card
 * logo, merchant detail hero, token-accept badges).
 */

// ── Archetype dropdown ────────────────────────────────────────────────────────

const ARCHETYPES: ReadonlyArray<{ id: string; label: string; description: string }> = [
    { id: "merchant-one-hop-delivery", label: "Local commerce — delivery", description: "On-site / pickup / courier-routed delivery (food, retail, services)." },
    { id: "merchant-direct-sale", label: "Direct sale — counter", description: "On-site or pickup only; no delivery (cafe, market stall, kiosk)." },
    { id: "bonded-procurement-supplier", label: "Procurement supplier", description: "Industrial / parts / B2B fulfilment under bonded delivery contracts." },
    { id: "disclosure-review-operator", label: "Disclosure review", description: "Independent review / counter-attestation services (audit, compliance)." },
    { id: "equipment-rental-operator", label: "Equipment rental", description: "Time-based rental with deposit-bonded return condition." },
    { id: "freelance-operator", label: "Freelance / professional services", description: "Milestone-bonded knowledge work (translation, design, code, etc.)." },
];

// ── Fulfilment modes (mirror canonical enum) ─────────────────────────────────

type FulfillmentMode = SellerCatalogueMetadata["fulfillmentModes"][number];

const FULFILMENT_OPTIONS: ReadonlyArray<{ id: FulfillmentMode; label: string; description: string }> = [
    { id: "consume-onsite", label: "On-site", description: "Buyer consumes at your premises." },
    { id: "pickup", label: "Pickup", description: "Buyer collects from your location." },
    { id: "deliver:seller-assigned", label: "Delivery — you arrange", description: "You arrange delivery directly." },
    { id: "deliver:buyer-assigned", label: "Delivery — buyer arranges", description: "Buyer chooses their own courier." },
    { id: "deliver:dutch-auction", label: "Delivery — auction-routed", description: "Courier selected via Dutch auction." },
];

// ── Item shape (form-internal; richer than CatalogueItemMetadata for state) ─

interface FormItem {
    id: string;
    name: string;
    description: string;
    price: string;
    category: string;
    available: boolean;
}

interface FormToken {
    address: string;
    symbol: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string {
    return Math.random().toString(36).slice(2, 10);
}

function emptyItem(): FormItem {
    return { id: uid(), name: "", description: "", price: "", category: "", available: true };
}

function emptyToken(): FormToken {
    return { address: "", symbol: "" };
}

function slugify(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64);
}

// ── Layout primitives (kept local; small enough not to deserve extraction) ──

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="border-t border-gray-100 pt-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-6">
                {title}
            </p>
            <div className="space-y-6">{children}</div>
        </div>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-sm font-semibold text-black mb-1">{label}</label>
            {hint && <p className="text-xs text-gray-500 mb-2">{hint}</p>}
            {children}
        </div>
    );
}

function StatusBox({ type, message }: { type: "error" | "progress" | "success"; message: string }) {
    const styles = {
        error: "bg-red-50 border-red-200 text-red-700",
        progress: "bg-gray-50 border-gray-200 text-gray-600",
        success: "bg-green-50 border-green-200 text-green-700",
    };
    return (
        <div className={`border rounded px-4 py-3 text-sm ${styles[type]}`}>
            {message}
        </div>
    );
}

// ── Logo upload control ──────────────────────────────────────────────────────

function LogoUpload({
    logoURI,
    onChange,
    onError,
}: {
    logoURI: string;
    onChange: (uri: string) => void;
    onError: (message: string) => void;
}) {
    const [uploading, setUploading] = useState(false);

    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const result = await DEFAULT_IPFS_SERVICE.uploadFile(file);
            onChange(result.uri);
        } catch (err) {
            onError(err instanceof Error ? err.message : String(err));
        } finally {
            setUploading(false);
            e.target.value = ""; // allow re-uploading the same file
        }
    }

    return (
        <div className="flex items-center gap-4">
            {logoURI ? (
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <code className="text-xs text-gray-600 font-mono truncate flex-1">{logoURI}</code>
                    <button
                        type="button"
                        onClick={() => onChange("")}
                        className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                    >
                        Remove
                    </button>
                </div>
            ) : (
                <label className="cursor-pointer text-sm font-semibold text-black border border-gray-300 rounded px-4 py-2 hover:bg-gray-100 transition-colors">
                    {uploading ? "Uploading…" : "Upload logo"}
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                        onChange={handleFile}
                        disabled={uploading}
                        className="hidden"
                    />
                </label>
            )}
        </div>
    );
}

// ── Item row ──────────────────────────────────────────────────────────────────

function ItemRow({
    item,
    categories,
    onChange,
    onRemove,
}: {
    item: FormItem;
    categories: string[];
    onChange: (updated: FormItem) => void;
    onRemove: () => void;
}) {
    const inputClass =
        "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-black";

    return (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
                <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                            <input
                                required
                                type="text"
                                placeholder="e.g. your offering"
                                value={item.name}
                                onChange={(e) => onChange({ ...item, name: e.target.value })}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Price</label>
                            <input
                                type="text"
                                placeholder="e.g. 12.00"
                                value={item.price}
                                onChange={(e) => onChange({ ...item, price: e.target.value })}
                                className={inputClass}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                        <input
                            type="text"
                            placeholder="Optional. Shown to buyers."
                            value={item.description}
                            onChange={(e) => onChange({ ...item, description: e.target.value })}
                            className={inputClass}
                        />
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                            <input
                                type="text"
                                placeholder="e.g. category"
                                value={item.category}
                                onChange={(e) => onChange({ ...item, category: e.target.value })}
                                list={`cat-list-${item.id}`}
                                className={inputClass}
                            />
                            <datalist id={`cat-list-${item.id}`}>
                                {categories.map((c) => (
                                    <option key={c} value={c} />
                                ))}
                            </datalist>
                        </div>
                        <div className="flex-shrink-0 pt-5">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={item.available}
                                    onChange={(e) => onChange({ ...item, available: e.target.checked })}
                                    className="w-4 h-4 border-gray-300 rounded"
                                />
                                <span className="text-sm text-black">Available</span>
                            </label>
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onRemove}
                    className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none mt-1 flex-shrink-0"
                    aria-label="Remove item"
                >
                    &times;
                </button>
            </div>
        </div>
    );
}

// ── Token row ─────────────────────────────────────────────────────────────────

function TokenRow({
    token,
    onChange,
    onRemove,
}: {
    token: FormToken;
    onChange: (next: FormToken) => void;
    onRemove: () => void;
}) {
    const inputClass =
        "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-black";

    return (
        <div className="flex items-start gap-2">
            <div className="flex-1 grid grid-cols-[1fr,140px] gap-2">
                <TokenAddressInput
                    value={token.address}
                    onChange={(v) => onChange({ ...token, address: v })}
                />
                <input
                    type="text"
                    placeholder="Symbol — USDC, FIG"
                    value={token.symbol}
                    onChange={(e) => onChange({ ...token, symbol: e.target.value })}
                    className={inputClass}
                />
            </div>
            <button
                type="button"
                onClick={onRemove}
                className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none mt-2 flex-shrink-0"
                aria-label="Remove token"
            >
                &times;
            </button>
        </div>
    );
}

// ── Published result panel ────────────────────────────────────────────────────

function PublishedPanel({ uri, onReset }: { uri: string; onReset: () => void }) {
    const [copied, setCopied] = useState(false);

    function copy() {
        navigator.clipboard.writeText(uri).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    return (
        <div className="space-y-4">
            <div className="border border-black rounded-lg px-6 py-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                    Step 1 complete
                </p>
                <p className="text-lg font-bold text-black mb-2">Catalogue published.</p>
                <p className="text-sm text-gray-600 mb-5">
                    Pinned to IPFS. Continue to step 2 — register on-chain — and the
                    catalogue URI will be inlined into your profile automatically.
                </p>

                <div className="bg-gray-50 border border-gray-200 rounded px-4 py-3 mb-4">
                    <p className="text-xs font-medium text-gray-500 mb-1">Catalogue URI</p>
                    <div className="flex items-center gap-3">
                        <code className="text-xs text-black font-mono break-all flex-1">{uri}</code>
                        <button
                            onClick={copy}
                            className="text-xs font-semibold text-black border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-100 flex-shrink-0"
                        >
                            {copied ? "Copied" : "Copy"}
                        </button>
                    </div>
                </div>

                <div className="flex gap-3 flex-wrap">
                    <a
                        href={`/operators?catalogueURI=${encodeURIComponent(uri)}`}
                        className="px-4 py-2 text-sm bg-black text-white rounded hover:bg-gray-800 transition-colors"
                    >
                        Continue to register &rarr;
                    </a>
                    <button
                        onClick={onReset}
                        className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                        Build another
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

type Status = { type: "idle" | "pinning" | "error"; message: string };

interface FormState {
    name: string;
    description: string;
    archetypeId: string;
    geohash: string;
    addressText: string;
    fulfillmentModes: FulfillmentMode[];
    logoURI: string;
    items: FormItem[];
    tokens: FormToken[];
}

const INITIAL_STATE: FormState = {
    name: "",
    description: "",
    archetypeId: ARCHETYPES[0].id,
    geohash: "",
    addressText: "",
    fulfillmentModes: ["consume-onsite"],
    logoURI: "",
    items: [emptyItem()],
    tokens: [emptyToken()],
};

export function CatalogueBuilder() {
    const { address } = useAccount();
    const { openConnectModal } = useConnectModal();
    const [form, setForm] = useState<FormState>(INITIAL_STATE);
    const [status, setStatus] = useState<Status>({ type: "idle", message: "" });
    const [publishedURI, setPublishedURI] = useState<string | null>(null);

    const inputClass =
        "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-black";
    const categories = [...new Set(form.items.map((i) => i.category).filter(Boolean))];

    function reset() {
        setForm(INITIAL_STATE);
        setStatus({ type: "idle", message: "" });
        setPublishedURI(null);
    }

    function toggleFulfilment(mode: FulfillmentMode) {
        setForm((prev) => ({
            ...prev,
            fulfillmentModes: prev.fulfillmentModes.includes(mode)
                ? prev.fulfillmentModes.filter((m) => m !== mode)
                : [...prev.fulfillmentModes, mode],
        }));
    }

    async function handlePublish(e: React.FormEvent) {
        e.preventDefault();
        if (!address) {
            // No wallet connected — open the RainbowKit modal rather than
            // erroring. After connection, the operator can resubmit.
            openConnectModal?.();
            return;
        }

        const trimmedName = form.name.trim();
        const slug = slugify(trimmedName);
        const validItems = form.items.filter((i) => i.name.trim() && i.price.trim());
        const validTokens = form.tokens.filter((t) => isValidAddress(t.address) && t.symbol.trim());

        if (!trimmedName) return setStatus({ type: "error", message: "Name is required." });
        if (!slug) return setStatus({ type: "error", message: "Name must contain at least one alphanumeric character." });
        if (!form.geohash.trim()) return setStatus({ type: "error", message: "Location geohash is required." });
        if (form.fulfillmentModes.length === 0) return setStatus({ type: "error", message: "At least one fulfilment mode is required." });
        if (validItems.length === 0) return setStatus({ type: "error", message: "At least one item with a name and price is required." });

        try {
            const menu: CatalogueItemMetadata[] = validItems.map((i) => ({
                id: i.id,
                name: i.name.trim(),
                description: i.description.trim() || undefined,
                price: i.price.trim(),
                category: i.category.trim() || "General",
                available: i.available,
            }));

            const acceptedTokens: AcceptedTokenMetadata[] | undefined =
                validTokens.length > 0
                    ? validTokens.map((t) => ({
                        address: t.address as `0x${string}`,
                        symbol: t.symbol.trim(),
                    }))
                    : undefined;

            const catalogue: SellerCatalogueMetadata = {
                subjectAddress: address,
                archetypeId: form.archetypeId,
                merchantId: slug,
                slug,
                name: trimmedName,
                description: form.description.trim() || undefined,
                fulfillmentModes: form.fulfillmentModes,
                location: {
                    geohash: form.geohash.trim(),
                    addressText: form.addressText.trim() || undefined,
                },
                menu,
                branding: form.logoURI
                    ? { displayName: trimmedName, logoURI: form.logoURI }
                    : undefined,
                acceptedTokens,
                version: "1.0.0",
            };

            setStatus({ type: "pinning", message: "Validating and pinning to IPFS…" });
            const { uri } = await publishMerchantCatalogue(catalogue);
            setPublishedURI(uri);
            setStatus({ type: "idle", message: "" });
        } catch (err) {
            setStatus({
                type: "error",
                message: err instanceof Error ? err.message : String(err),
            });
        }
    }

    if (publishedURI) {
        return <PublishedPanel uri={publishedURI} onReset={reset} />;
    }

    const busy = status.type === "pinning";

    return (
        <form onSubmit={handlePublish} className="space-y-0">
            {/* Section: Identity */}
            <FormSection title="Identity">
                <Field label="Name" hint="Shown to buyers on the discover page and the merchant detail page.">
                    <input
                        required
                        type="text"
                        placeholder="e.g. your service name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className={inputClass}
                    />
                </Field>
                <Field label="Description" hint="One or two sentences. Optional.">
                    <textarea
                        rows={2}
                        placeholder="What you do, in plain language."
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className={inputClass}
                    />
                </Field>
                <Field
                    label="Archetype"
                    hint="What kind of operator are you? Determines which assembly your catalogue routes through."
                >
                    <select
                        value={form.archetypeId}
                        onChange={(e) => setForm({ ...form, archetypeId: e.target.value })}
                        className={inputClass}
                    >
                        {ARCHETYPES.map((a) => (
                            <option key={a.id} value={a.id}>{a.label}</option>
                        ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-2">
                        {ARCHETYPES.find((a) => a.id === form.archetypeId)?.description}
                    </p>
                </Field>
            </FormSection>

            {/* Section: Branding */}
            <FormSection title="Branding">
                <Field
                    label="Logo"
                    hint="Optional. Pinned to IPFS. Shown on the discover card and the merchant page."
                >
                    <LogoUpload
                        logoURI={form.logoURI}
                        onChange={(uri) => setForm({ ...form, logoURI: uri })}
                        onError={(message) => setStatus({ type: "error", message })}
                    />
                </Field>
            </FormSection>

            {/* Section: Where */}
            <FormSection title="Where">
                <Field
                    label="Geohash"
                    hint="A geohash narrows the geographic match for buyers near you. Use a service like geohash.org if you don't already have one."
                >
                    <input
                        required
                        type="text"
                        placeholder="e.g. dr5reg"
                        value={form.geohash}
                        onChange={(e) => setForm({ ...form, geohash: e.target.value })}
                        className={inputClass}
                    />
                </Field>
                <Field label="Address" hint="Optional. Free-form text shown to buyers.">
                    <input
                        type="text"
                        placeholder="e.g. Lower Manhattan, NY"
                        value={form.addressText}
                        onChange={(e) => setForm({ ...form, addressText: e.target.value })}
                        className={inputClass}
                    />
                </Field>
            </FormSection>

            {/* Section: How */}
            <FormSection title="How — fulfilment">
                <Field label="Fulfilment modes" hint="At least one. Buyers will be able to filter by these.">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {FULFILMENT_OPTIONS.map((opt) => (
                            <label
                                key={opt.id}
                                className="flex items-start gap-3 border border-gray-200 rounded p-3 hover:bg-gray-50 cursor-pointer"
                            >
                                <input
                                    type="checkbox"
                                    checked={form.fulfillmentModes.includes(opt.id)}
                                    onChange={() => toggleFulfilment(opt.id)}
                                    className="mt-1 w-4 h-4"
                                />
                                <div>
                                    <p className="text-sm font-semibold text-black">{opt.label}</p>
                                    <p className="text-xs text-gray-500">{opt.description}</p>
                                </div>
                            </label>
                        ))}
                    </div>
                </Field>
            </FormSection>

            {/* Section: Items */}
            <FormSection title={`Items (${form.items.length})`}>
                <div className="space-y-3">
                    {form.items.map((item) => (
                        <ItemRow
                            key={item.id}
                            item={item}
                            categories={categories}
                            onChange={(updated) =>
                                setForm({
                                    ...form,
                                    items: form.items.map((i) => (i.id === item.id ? updated : i)),
                                })
                            }
                            onRemove={() =>
                                setForm({ ...form, items: form.items.filter((i) => i.id !== item.id) })
                            }
                        />
                    ))}
                </div>
                <button
                    type="button"
                    onClick={() => setForm({ ...form, items: [...form.items, emptyItem()] })}
                    className="text-sm text-gray-500 hover:text-black flex items-center gap-1.5 transition-colors"
                >
                    <span className="text-base leading-none">+</span>
                    Add item
                </button>
            </FormSection>

            {/* Section: Tokens */}
            <FormSection title="Accepted tokens">
                <p className="text-xs text-gray-500 -mt-2">
                    ERC-20 tokens you accept for settlement. Each row is one token —
                    contract address plus a short symbol (USDC, FIG, etc.). Optional.
                </p>
                <div className="space-y-2">
                    {form.tokens.map((token, i) => (
                        <TokenRow
                            key={i}
                            token={token}
                            onChange={(updated) =>
                                setForm({
                                    ...form,
                                    tokens: form.tokens.map((t, idx) => (idx === i ? updated : t)),
                                })
                            }
                            onRemove={() =>
                                setForm({ ...form, tokens: form.tokens.filter((_, idx) => idx !== i) })
                            }
                        />
                    ))}
                </div>
                <button
                    type="button"
                    onClick={() => setForm({ ...form, tokens: [...form.tokens, emptyToken()] })}
                    className="text-sm text-gray-500 hover:text-black flex items-center gap-1.5 transition-colors"
                >
                    <span className="text-base leading-none">+</span>
                    Add token
                </button>
            </FormSection>

            {/* Publish */}
            <div className="border-t border-gray-100 pt-8 space-y-4">
                <p className="text-xs text-gray-500">
                    Publishing pins the catalogue as an immutable IPFS document and validates
                    it against the canonical schema. The next step is registering on-chain.
                </p>

                {status.type === "error" && <StatusBox type="error" message={status.message} />}
                {status.type === "pinning" && <StatusBox type="progress" message={status.message} />}

                <button
                    type="submit"
                    disabled={busy}
                    className="w-full py-3 bg-black text-white text-sm font-semibold rounded hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                    {busy
                        ? "Publishing..."
                        : !address
                            ? "Connect wallet to publish"
                            : "Publish catalogue to IPFS"}
                </button>
            </div>
        </form>
    );
}
