"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { IpfsImageUpload } from "@/components/sellers/IpfsImageUpload";
import { useMounted } from "@/hooks/useMounted";
import { useOnboardingState } from "@/lib/seller/onboardingState";
import { parseCatalogueCsv } from "@/lib/seller/parseCatalogueCsv";
import type {
    CatalogueItemMetadata,
    UnitSystem,
} from "@/lib/seller/sellerCatalogueMetadata";
import {
    gramsToInput,
    massUnitLabel,
    mlToInput,
    parseInputToGrams,
    parseInputToMl,
    volumeUnitLabel,
} from "@/lib/seller/unitConversion";
import { hexEqual } from "@/lib/shared/evm";

/**
 * Step 3 of the onboarding wizard. Collects the catalogue items —
 * the volatile sales-context payload that gets pinned to IPFS as
 * `SellerCatalogueMetadata { subjectAddress, items, version }`.
 *
 * Each item: id (auto), name (required), price (required), category
 * (required), description (optional), image (optional, via IPFS
 * upload), available (default true). Pricing is denominated in the
 * profile's `defaultTokenAddress` (set on step 2).
 *
 * Audit fix B7: every change is persisted to localStorage on the spot
 * via `useOnboardingState`. Items don't disappear on refresh, on
 * cross-screen navigation, or when the wallet disconnects briefly.
 * The "Add item" button just appends a fresh blank row; the previous
 * rows are already saved.
 */

interface FormItem {
    id: string;
    name: string;
    description: string;
    price: string;
    category: string;
    image: string;
    available: boolean;
    /** Editor input — in the catalogue's `unitSystem`. Parsed to metric at save. */
    mass: string;
    /** Editor input — in the catalogue's `unitSystem`. Parsed to metric at save. */
    volume: string;
}

function uid(): string {
    return Math.random().toString(36).slice(2, 10);
}

function emptyItem(): FormItem {
    return {
        id: uid(),
        name: "",
        description: "",
        price: "",
        category: "",
        image: "",
        available: true,
        mass: "",
        volume: "",
    };
}

function fromItem(item: CatalogueItemMetadata, unitSystem: UnitSystem): FormItem {
    return {
        id: item.id,
        name: item.name,
        description: item.description ?? "",
        price: item.price,
        category: item.category ?? "",
        image: item.image ?? "",
        available: item.available,
        mass: gramsToInput(item.massGrams, unitSystem),
        volume: mlToInput(item.volumeMl, unitSystem),
    };
}

function toItem(form: FormItem, unitSystem: UnitSystem): CatalogueItemMetadata {
    return {
        id: form.id,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        price: form.price.trim(),
        category: form.category.trim() || undefined,
        image: form.image || undefined,
        available: form.available,
        massGrams: parseInputToGrams(form.mass, unitSystem),
        volumeMl: parseInputToMl(form.volume, unitSystem),
    };
}

function isItemComplete(form: FormItem): boolean {
    return Boolean(form.name.trim()) && Boolean(form.price.trim());
}

export interface OnboardingCatalogueFormProps {
    /**
     * Edit-mode override. When provided, the submit handler calls
     * `onSave(items, unitSystem)` instead of routing to the next
     * wizard step. The caller assembles the SellerCatalogueMetadata
     * document with both, pins it, and chases with `updateProfile`.
     *
     * Resolves on success (caller redirects); rejects on failure
     * (caller surfaces the error via `externalError`).
     */
    onSave?: (items: CatalogueItemMetadata[], unitSystem: UnitSystem) => Promise<void>;
    /** Submit-button label override. Defaults to "Next →". */
    submitLabel?: string;
    /** Back-link href override. Defaults to "/sellers/identity". */
    backHref?: string;
    /** Back-link label override. Defaults to "← Back". */
    backLabel?: string;
    /** Whether the submit is currently in flight. Suppresses double-submission. */
    submitInFlight?: boolean;
    /** External error from `onSave` to render below the form. */
    externalError?: string | null;
}

export function OnboardingCatalogueForm({
    onSave,
    submitLabel,
    backHref,
    backLabel,
    submitInFlight = false,
    externalError = null,
}: OnboardingCatalogueFormProps = {}) {
    const router = useRouter();
    const mounted = useMounted();
    const { address, isConnected } = useAccount();
    const { state, loaded, update } = useOnboardingState(address);

    const [items, setItems] = useState<FormItem[]>([emptyItem()]);
    const [unitSystem, setUnitSystem] = useState<UnitSystem>("metric");
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [hydrated, setHydrated] = useState(false);
    const [importErrors, setImportErrors] = useState<string[]>([]);
    const [importedCount, setImportedCount] = useState<number | null>(null);

    // Hydrate once the wallet-keyed state has actually been read from
    // localStorage (`loaded === true`). Gating on `state.catalogue`
    // alone races the hook's read-effect — for users with stored
    // items, hydration could fire against the EMPTY_STATE snapshot
    // and the persistence effect would then overwrite their saved
    // items with the local default `[emptyItem()]`.
    useEffect(() => {
        if (hydrated || !loaded) return;
        const storedUnitSystem = state.catalogue?.unitSystem ?? "metric";
        setUnitSystem(storedUnitSystem);
        const stored = state.catalogue?.items;
        if (stored && stored.length > 0) {
            setItems(stored.map((item) => fromItem(item, storedUnitSystem)));
        }
        setHydrated(true);
    }, [hydrated, loaded, state.catalogue]);

    // Persist on every form change.
    useEffect(() => {
        if (!hydrated || !isConnected) return;
        const validItems = items.filter(isItemComplete).map((it) => toItem(it, unitSystem));
        update({ catalogue: { items: validItems, unitSystem } });
    }, [items, unitSystem, hydrated, isConnected, update]);

    // Pricing-token symbol for the per-item price label.
    const defaultTokenSymbol = useMemo(() => {
        const addr = state.profile?.defaultTokenAddress;
        if (!addr || !state.profile?.acceptedTokens) return "";
        const token = state.profile.acceptedTokens.find(
            (t) => hexEqual(t.address, addr),
        );
        return token?.symbol ?? "";
    }, [state.profile]);

    function setItemField<K extends keyof FormItem>(index: number, key: K, value: FormItem[K]) {
        setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [key]: value } : it)));
    }

    function addItem() {
        setItems((prev) => [...prev, emptyItem()]);
    }

    function removeItem(index: number) {
        setItems((prev) => (prev.length === 1 ? [emptyItem()] : prev.filter((_, i) => i !== index)));
    }

    async function handleCsvImport(file: File) {
        setImportErrors([]);
        setImportedCount(null);
        try {
            const text = await file.text();
            const { items: parsed, errors } = parseCatalogueCsv(text);
            if (errors.length > 0) {
                setImportErrors(errors);
            }
            if (parsed.length === 0) {
                if (errors.length === 0) {
                    setImportErrors(["No items parsed from the file."]);
                }
                return;
            }
            const newRows = parsed.map((item) => fromItem(item, unitSystem));
            // If the only existing row is an empty placeholder, replace it;
            // otherwise append.
            setItems((prev) => {
                const hasOnlyEmpty = prev.length === 1 && !isItemComplete(prev[0]);
                return hasOnlyEmpty ? newRows : [...prev, ...newRows];
            });
            setImportedCount(parsed.length);
        } catch (err) {
            setImportErrors([err instanceof Error ? err.message : String(err)]);
        }
    }

    function validateAndContinue(e: React.FormEvent) {
        e.preventDefault();
        const completeItems = items.filter(isItemComplete);
        if (completeItems.length === 0) {
            setSubmitError("Add at least one item with a name and a price.");
            return;
        }
        setSubmitError(null);
        if (onSave) {
            // Edit mode: caller pins the catalogue + chases with
            // updateProfile. The wizard navigation is suppressed.
            onSave(completeItems.map((it) => toItem(it, unitSystem)), unitSystem).catch(() => {
                // The caller surfaces failures via `externalError`.
            });
            return;
        }
        router.push("/sellers/assemblies");
    }

    if (!mounted) {
        return <Card className="p-6 text-sm text-ink-faint">Loading…</Card>;
    }

    if (!isConnected) {
        return (
            <Card className="p-6 space-y-4">
                <p className="text-sm text-ink-body">
                    Connect a wallet to load your catalogue draft.
                </p>
                <Link href="/sellers/identity">
                    <Button variant="outline">← Back to profile</Button>
                </Link>
            </Card>
        );
    }

    if (!state.profile?.defaultTokenAddress) {
        return (
            <Card className="p-6 space-y-4">
                <p className="text-sm text-ink-body">
                    Your catalogue is priced in your profile&apos;s default token. Go back to step 2 and set it before adding items.
                </p>
                <Link href="/sellers/identity">
                    <Button variant="outline">← Set default token</Button>
                </Link>
            </Card>
        );
    }

    return (
        <form onSubmit={validateAndContinue} className="space-y-12">
            <Card className="p-4 text-sm text-ink-body space-y-4">
                <p>
                    Items are content, not commitments. Adding or editing items
                    here has no on-chain effect; prices are quoted from this
                    list and bonded only when a buyer commits.
                </p>
                <p>
                    Items are priced in <span className="font-semibold text-ink-heading">{defaultTokenSymbol || "your default token"}</span>.
                    Buyers paying in another accepted token see a converted price at commit time.
                </p>
                <div className="flex items-center gap-4">
                    <span className="text-xs font-semibold text-ink-heading uppercase tracking-wide">
                        Unit system
                    </span>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input
                            type="radio"
                            name="unit-system"
                            value="metric"
                            checked={unitSystem === "metric"}
                            onChange={() => setUnitSystem("metric")}
                            data-testid="unit-system-metric"
                        />
                        Metric (g, ml)
                    </label>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input
                            type="radio"
                            name="unit-system"
                            value="imperial"
                            checked={unitSystem === "imperial"}
                            onChange={() => setUnitSystem("imperial")}
                            data-testid="unit-system-imperial"
                        />
                        Imperial (oz, fl oz)
                    </label>
                    <p className="text-xs text-ink-faint">
                        Stored as metric; the editor + buyer-facing display use this preference.
                    </p>
                </div>
            </Card>

            <div className="space-y-6">
                {items.map((item, index) => (
                    <ItemRow
                        key={item.id}
                        item={item}
                        index={index}
                        priceSymbol={defaultTokenSymbol}
                        unitSystem={unitSystem}
                        onChange={(key, value) => setItemField(index, key, value)}
                        onRemove={items.length > 1 || isItemComplete(item) ? () => removeItem(index) : undefined}
                    />
                ))}
                <div className="flex items-center justify-between gap-4 pt-2">
                    <button
                        type="button"
                        onClick={addItem}
                        className="text-sm text-ink-faint hover:text-ink-heading transition-colors"
                    >
                        + Add item
                    </button>
                    <label className="text-xs text-ink-faint hover:text-ink-heading transition-colors cursor-pointer">
                        <input
                            type="file"
                            accept=".csv,text/csv"
                            className="hidden"
                            onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) await handleCsvImport(file);
                                e.target.value = "";
                            }}
                            data-testid="catalogue-csv-import"
                        />
                        Import CSV →
                    </label>
                </div>
                {importedCount !== null && importedCount > 0 && (
                    <p className="text-xs text-ink-body" data-testid="catalogue-csv-imported">
                        Imported {importedCount} item{importedCount === 1 ? "" : "s"} from CSV.
                    </p>
                )}
                {importErrors.length > 0 && (
                    <div className="text-xs text-red-600 space-y-1" role="alert">
                        <p className="font-semibold">CSV import problems:</p>
                        <ul className="list-disc pl-5">
                            {importErrors.map((e) => (<li key={e}>{e}</li>))}
                        </ul>
                        <p className="text-ink-faint">
                            Expected header columns: <code>name, price, description, category, image, available, massGrams, volumeMl</code> (case-insensitive, any order; <code>name</code> + <code>price</code> required).
                        </p>
                    </div>
                )}
            </div>

            {submitError && (
                <p className="text-sm text-red-600" role="alert">{submitError}</p>
            )}
            {externalError && (
                <p className="text-sm text-red-600" role="alert">{externalError}</p>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-default">
                <Link
                    href={backHref ?? "/sellers/identity"}
                    className="text-sm text-ink-faint hover:text-ink-heading transition-colors"
                >
                    {backLabel ?? "← Back"}
                </Link>
                <Button type="submit" disabled={submitInFlight}>
                    {submitInFlight ? "Saving…" : (submitLabel ?? "Next →")}
                </Button>
            </div>
        </form>
    );
}

interface ItemRowProps {
    item: FormItem;
    index: number;
    priceSymbol: string;
    unitSystem: UnitSystem;
    onChange: <K extends keyof FormItem>(key: K, value: FormItem[K]) => void;
    onRemove?: () => void;
}

function ItemRow({ item, index, priceSymbol, unitSystem, onChange, onRemove }: ItemRowProps) {
    const idPrefix = `item-${item.id}`;
    return (
        <Card className="p-5 space-y-4">
            <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-ink-heading">Item {index + 1}</h3>
                {onRemove && (
                    <button
                        type="button"
                        onClick={onRemove}
                        className="text-xs text-ink-faint hover:text-red-600 transition-colors"
                    >
                        Remove
                    </button>
                )}
            </div>

            <FormField label="Name" inputId={`${idPrefix}-name`} required>
                <Input
                    id={`${idPrefix}-name`}
                    type="text"
                    placeholder="e.g. Bike tune-up"
                    value={item.name}
                    onChange={(e) => onChange("name", e.target.value)}
                />
            </FormField>

            <FormField label="Description" inputId={`${idPrefix}-description`}>
                <Textarea
                    id={`${idPrefix}-description`}
                    rows={2}
                    placeholder="Optional. One short sentence."
                    value={item.description}
                    onChange={(e) => onChange("description", e.target.value)}
                />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
                <FormField label={`Price${priceSymbol ? ` (${priceSymbol})` : ""}`} inputId={`${idPrefix}-price`} required>
                    <Input
                        id={`${idPrefix}-price`}
                        type="text"
                        inputMode="decimal"
                        placeholder="0.01"
                        value={item.price}
                        onChange={(e) => onChange("price", e.target.value)}
                    />
                </FormField>
                <FormField label="Category" inputId={`${idPrefix}-category`}>
                    <Input
                        id={`${idPrefix}-category`}
                        type="text"
                        placeholder="e.g. Service"
                        value={item.category}
                        onChange={(e) => onChange("category", e.target.value)}
                    />
                </FormField>
            </div>

            <FormField label="Image">
                <IpfsImageUpload
                    value={item.image}
                    onChange={(uri) => onChange("image", uri)}
                    label="Upload item image"
                />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
                <FormField label={`Mass (${massUnitLabel(unitSystem)})`} inputId={`${idPrefix}-mass`}>
                    <Input
                        id={`${idPrefix}-mass`}
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={item.mass}
                        onChange={(e) => onChange("mass", e.target.value)}
                        data-testid={`${idPrefix}-mass`}
                    />
                </FormField>
                <FormField label={`Volume (${volumeUnitLabel(unitSystem)})`} inputId={`${idPrefix}-volume`}>
                    <Input
                        id={`${idPrefix}-volume`}
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={item.volume}
                        onChange={(e) => onChange("volume", e.target.value)}
                        data-testid={`${idPrefix}-volume`}
                    />
                </FormField>
            </div>

            <label className="flex items-center gap-2 text-sm text-ink-body cursor-pointer">
                <input
                    type="checkbox"
                    checked={item.available}
                    onChange={(e) => onChange("available", e.target.checked)}
                />
                Available now
            </label>
        </Card>
    );
}
