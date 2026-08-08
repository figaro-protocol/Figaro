"use client";

import { useEffect, useMemo, useState } from "react";
import { extractErrorMessage } from "@/lib/shared/errors";
import Link from "next/link";
import { listRateQuantitySources } from "@figaro/sdk";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { IpfsImageUpload } from "@/components/members/IpfsImageUpload";
import type { OnboardingStepChromeProps } from "@/components/members/OnboardingStepChrome";
import { useMounted } from "@/hooks/useMounted";
import { useOnboardingState } from "@/lib/member/onboardingState";
import type { DisclosurePolicyEntry } from "@/lib/member/memberProfileMetadata";
import { parseCatalogueCsv } from "@/lib/member/parseCatalogueCsv";
import type {
    CatalogueItemMetadata,
    UnitSystem,
} from "@/lib/member/memberCatalogueMetadata";
import {
    gramsToInput,
    lengthUnitLabel,
    massUnitLabel,
    mlToInput,
    mmToInput,
    parseInputToGrams,
    parseInputToMl,
    parseInputToMm,
    volumeUnitLabel,
} from "@/lib/member/unitConversion";
import { hexEqual } from "@/lib/shared/evm";
import { truncateHex } from "@/lib/shared/formatHex";
import { FieldControl } from "@/components/runtime/FieldControl";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import { getClauseSpec, listCatalogueSourcedClauses } from "@/lib/shared/clauseSpecSource";
import { validateCatalogueClauseValues } from "@/lib/member/catalogueClauseValues";

/**
 * Step 3 of the onboarding wizard. Collects the catalogue items —
 * the volatile sales-context payload that gets pinned to IPFS as
 * `MemberCatalogueMetadata { subjectAddress, items, version }`.
 *
 * Each item: id (auto), name (required), price (required), category
 * (optional), description (optional), image (optional, via IPFS
 * upload), available (default true), pricing policy (fixed | rate —
 * a rate prices per `rateUnit`, quantity from `rateQuantitySource`). Pricing is denominated in the
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
    /** Parcel dimensions — editor input in the catalogue's `unitSystem`
     *  (mm metric / inches imperial). Parsed to metric mm at save. */
    length: string;
    width: string;
    height: string;
    /** Catalogue-sourced clause values (freight class, hazmat, cold-chain, …),
     *  keyed by clauseId → field values. Authored via spec-driven controls;
     *  empty entries stripped at save. */
    clauseValues: Record<string, Record<string, unknown>>;
    /** "fixed" (price = the item's price) or "rate" (price = a rate per
     *  `rateUnit`; payment resolves at checkout via `rateQuantitySource`). */
    pricingPolicy: "fixed" | "rate";
    rateUnit: string;
    rateQuantitySource: string;
    /** Encoded data-sold reference for a DATA-PRODUCT item —
     *  `compositionHash|clauseId|posture` of one of the member's own
     *  declared data offers, "" for an ordinary item. The
     *  disclosure policy declares the TERMS; this item is the PRICE. */
    dataSoldKey: string;
}

/** Encode the data reference as a stable select-option key. */
function dataSoldKeyOf(rc: NonNullable<CatalogueItemMetadata["dataSold"]>): string {
    return [rc.compositionHash, rc.clauseId, rc.posture].join("|");
}

function dataSoldFromKey(key: string): CatalogueItemMetadata["dataSold"] {
    const [compositionHash, clauseId, posture] = key.split("|");
    if (!compositionHash || !clauseId || (posture !== "buyer" && posture !== "seller")) {
        return undefined;
    }
    return { compositionHash: compositionHash as `0x${string}`, clauseId, posture };
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
        length: "",
        width: "",
        height: "",
        clauseValues: {},
        pricingPolicy: "fixed",
        rateUnit: "",
        rateQuantitySource: "checkout-quantity",
        dataSoldKey: "",
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
        length: mmToInput(item.lengthMm, unitSystem),
        width: mmToInput(item.widthMm, unitSystem),
        height: mmToInput(item.heightMm, unitSystem),
        clauseValues: item.clauseValues ?? {},
        pricingPolicy: item.pricingPolicy ?? "fixed",
        rateUnit: item.rateUnit ?? "",
        rateQuantitySource: item.rateQuantitySource ?? "checkout-quantity",
        dataSoldKey: item.dataSold ? dataSoldKeyOf(item.dataSold) : "",
    };
}

/** Strip empty field-values and empty clauses; return undefined when nothing
 *  is authored (so the item omits the key rather than storing `{}`). */
function clauseValuesForSave(
    values: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> | undefined {
    const out: Record<string, Record<string, unknown>> = {};
    for (const [clauseId, data] of Object.entries(values)) {
        const kept = Object.fromEntries(
            Object.entries(data).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)),
        );
        if (Object.keys(kept).length) out[clauseId] = kept;
    }
    return Object.keys(out).length ? out : undefined;
}

function toItem(form: FormItem, unitSystem: UnitSystem): CatalogueItemMetadata {
    const clauseValues = clauseValuesForSave(form.clauseValues);
    const dataSold = form.dataSoldKey ? dataSoldFromKey(form.dataSoldKey) : undefined;
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
        lengthMm: parseInputToMm(form.length, unitSystem),
        widthMm: parseInputToMm(form.width, unitSystem),
        heightMm: parseInputToMm(form.height, unitSystem),
        ...(clauseValues && { clauseValues }),
        ...(dataSold && { dataSold }),
        ...(form.pricingPolicy === "rate"
            ? {
                pricingPolicy: "rate" as const,
                rateUnit: form.rateUnit.trim() || undefined,
                rateQuantitySource: form.rateQuantitySource,
            }
            : {}),
    };
}

function isItemComplete(form: FormItem): boolean {
    return Boolean(form.name.trim()) && Boolean(form.price.trim());
}

export interface OnboardingCatalogueFormProps extends OnboardingStepChromeProps {
    /**
     * Edit-mode override. When provided, the submit handler calls
     * `onSave(items, unitSystem)` instead of routing to the next
     * wizard step. The caller assembles the MemberCatalogueMetadata
     * document with both, pins it, and chases with `updateProfile`.
     *
     * Resolves on success (caller redirects); rejects on failure
     * (caller surfaces the error via `externalError`).
     */
    onSave?: (items: CatalogueItemMetadata[], unitSystem: UnitSystem) => Promise<void>;
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

    // Catalogue-sourced clauses (freight class, hazmat, cold-chain, …) — derived
    // live from the registry, never a bundled list. A newly registered
    // product-property clause surfaces an authoring section with zero change here.
    const { version: clauseSpecsVersion } = useClauseSpecs();
    const catalogueClauses = useMemo(
        () => listCatalogueSourcedClauses(),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [clauseSpecsVersion],
    );

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

    // Data-for-sale options: the member's declared data offers
    // (offered entries, both postures) — an item referencing one is the
    // PRICED form of that offer. Empty until the member declares some
    // on the assemblies (seller side) or buyer step.
    const dataSoldOptions = useMemo(
        () => (state.disclosurePolicy ?? []).filter((e) => e.offered),
        [state.disclosurePolicy],
    );

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
            setImportErrors([extractErrorMessage(err, "Importing the catalogue failed.")]);
        }
    }

    function validateAndContinue(e: React.FormEvent) {
        e.preventDefault();
        const completeItems = items.filter(isItemComplete);
        if (completeItems.length === 0) {
            setSubmitError("Add at least one item with a name and a price.");
            return;
        }
        const savedItems = completeItems.map((it) => toItem(it, unitSystem));
        // Layer-A gate: catalogue-sourced clause values must conform to each
        // clause's registered spec before publish (reuses the sign/attest validator).
        const clauseErrors = savedItems.flatMap(validateCatalogueClauseValues);
        if (clauseErrors.length > 0) {
            setSubmitError(`Fix the logistics classifications — ${clauseErrors.join("; ")}`);
            return;
        }
        setSubmitError(null);
        if (onSave) {
            // Edit mode: caller pins the catalogue + chases with
            // updateProfile. The wizard navigation is suppressed.
            onSave(savedItems, unitSystem).catch(() => {
                // The caller surfaces failures via `externalError`.
            });
            return;
        }
        router.push("/members/assemblies");
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
                <Link href="/members/identity">
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
                <Link href="/members/identity">
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
                        catalogueClauses={catalogueClauses}
                        dataSoldOptions={dataSoldOptions}
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
                            Expected header columns: <code>name, price, description, category, image, available, massGrams, volumeMl, lengthMm, widthMm, heightMm, pricingPolicy, rateUnit, rateQuantitySource</code> (case-insensitive, any order; <code>name</code> + <code>price</code> required).
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
                    href={backHref ?? "/members/identity"}
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
    /** Catalogue-sourced clauses to author on this item (freight class, hazmat,
     *  cold-chain, …), derived live from the registry by the parent. */
    catalogueClauses: readonly { clauseId: string; version: number }[];
    /** The member's declared data offers (offered entries) — the
     *  options a data-product item can reference for its price. */
    dataSoldOptions: readonly DisclosurePolicyEntry[];
    onChange: <K extends keyof FormItem>(key: K, value: FormItem[K]) => void;
    onRemove?: () => void;
}

function ItemRow({ item, index, priceSymbol, unitSystem, catalogueClauses, dataSoldOptions, onChange, onRemove }: ItemRowProps) {
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

            {/* Data product: reference one of the member's declared
                data offers — the policy declared the terms, this
                item is where the class gets its price. Ordinary items
                leave it at "Not a data product". */}
            {(dataSoldOptions.length > 0 || item.dataSoldKey) && (
                <FormField label="Data for sale" inputId={`${idPrefix}-data-sold`}>
                    <select
                        id={`${idPrefix}-data-sold`}
                        value={item.dataSoldKey}
                        onChange={(e) => onChange("dataSoldKey", e.target.value)}
                        className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
                        data-testid={`${idPrefix}-data-sold`}
                    >
                        <option value="">Not a data product</option>
                        {dataSoldOptions.map((rc) => {
                            const key = [rc.compositionHash, rc.clauseId, rc.posture].join("|");
                            const title = getClauseSpec(rc.clauseId)?.title ?? rc.clauseId;
                            return (
                                <option key={key} value={key}>
                                    {title} — as {rc.posture} ({truncateHex(rc.compositionHash, { head: 10, tail: 0 })})
                                </option>
                            );
                        })}
                        {item.dataSoldKey &&
                            !dataSoldOptions.some(
                                (rc) => [rc.compositionHash, rc.clauseId, rc.posture].join("|") === item.dataSoldKey,
                            ) && (
                            <option value={item.dataSoldKey}>
                                (no longer declared) {item.dataSoldKey.split("|")[1]}
                            </option>
                        )}
                    </select>
                </FormField>
            )}

            {/* Pricing policy: fixed (the price IS the item price) or a RATE per
                unit — the payment resolves at checkout as rate × quantity, the
                quantity read from the declared source (billed per started unit). */}
            <div className="grid grid-cols-3 gap-4">
                <FormField label="Pricing" inputId={`${idPrefix}-pricing-policy`}>
                    <select
                        id={`${idPrefix}-pricing-policy`}
                        value={item.pricingPolicy}
                        onChange={(e) => onChange("pricingPolicy", e.target.value as FormItem["pricingPolicy"])}
                        className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
                        data-testid={`${idPrefix}-pricing-policy`}
                    >
                        <option value="fixed">Fixed price</option>
                        <option value="rate">Rate (price per unit)</option>
                    </select>
                </FormField>
                {item.pricingPolicy === "rate" && (
                    <>
                        <FormField label="Per unit" inputId={`${idPrefix}-rate-unit`}>
                            <Input
                                id={`${idPrefix}-rate-unit`}
                                type="text"
                                placeholder="e.g. km, hour"
                                value={item.rateUnit}
                                onChange={(e) => onChange("rateUnit", e.target.value)}
                                data-testid={`${idPrefix}-rate-unit`}
                            />
                        </FormField>
                        <FormField label="Quantity from" inputId={`${idPrefix}-rate-source`}>
                            {/* The options ARE the SDK's rate-quantity registry —
                                a permissionlessly registered tenant surfaces here
                                with zero picker changes; nothing is hardcoded. */}
                            <select
                                id={`${idPrefix}-rate-source`}
                                value={item.rateQuantitySource}
                                onChange={(e) => onChange("rateQuantitySource", e.target.value)}
                                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
                                data-testid={`${idPrefix}-rate-source`}
                            >
                                {listRateQuantitySources().map(({ source, label }) => (
                                    <option key={source} value={source}>{label}</option>
                                ))}
                            </select>
                        </FormField>
                    </>
                )}
            </div>

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

            {/* Parcel dimensions (L/W/D) — optional, shipping only. Feeds
                dimensional-weight derivation; volume derives from these when set. */}
            <div className="grid grid-cols-3 gap-4">
                {(["length", "width", "height"] as const).map((dim) => (
                    <FormField
                        key={dim}
                        label={`${dim[0].toUpperCase()}${dim.slice(1)} (${lengthUnitLabel(unitSystem)})`}
                        inputId={`${idPrefix}-${dim}`}
                    >
                        <Input
                            id={`${idPrefix}-${dim}`}
                            type="text"
                            inputMode="decimal"
                            placeholder="0"
                            value={item[dim]}
                            onChange={(e) => onChange(dim, e.target.value)}
                            data-testid={`${idPrefix}-${dim}`}
                        />
                    </FormField>
                ))}
            </div>

            {/* Catalogue-sourced clause values (freight class / hazmat / cold-chain
                / any registered product-property clause) — one spec-driven group
                per clause, rendered from the registry, never hardcoded. Optional:
                a shippable/regulated item authors them; everything else leaves
                them blank. */}
            {catalogueClauses.length > 0 && (
                <div className="space-y-4 border-t border-neutral-200 pt-3" data-testid={`${idPrefix}-clauses`}>
                    <p className="text-xs text-ink-muted">Logistics classifications (optional — for shippable / regulated goods)</p>
                    {catalogueClauses.map(({ clauseId }) => {
                        const spec = getClauseSpec(clauseId);
                        if (!spec) return null;
                        const data = item.clauseValues[clauseId] ?? {};
                        const setField = (fieldName: string, next: unknown) => {
                            const nextData = { ...data };
                            if (next === undefined) delete nextData[fieldName];
                            else nextData[fieldName] = next;
                            const nextMap = { ...item.clauseValues };
                            if (Object.keys(nextData).length) nextMap[clauseId] = nextData;
                            else delete nextMap[clauseId];
                            onChange("clauseValues", nextMap);
                        };
                        return (
                            <div key={clauseId} className="space-y-2" data-testid={`${idPrefix}-clause-${clauseId}`}>
                                <p className="text-xs font-medium text-ink-body">{spec.title}</p>
                                {spec.fields.map((field) => (
                                    <FieldControl
                                        key={field.name}
                                        field={field}
                                        value={data[field.name]}
                                        mode="runtime"
                                        testId={`${idPrefix}-clause-${clauseId}-${field.name}`}
                                        onChange={(next) => setField(field.name, next)}
                                    />
                                ))}
                            </div>
                        );
                    })}
                </div>
            )}

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
