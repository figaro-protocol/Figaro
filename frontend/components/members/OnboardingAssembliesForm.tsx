"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { isAddress } from "viem";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { ZERO_ADDRESS, hexEqual } from "@/lib/shared/evm";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { useMounted } from "@/hooks/useMounted";
import { useRegisteredCatalogs } from "@/lib/member/useRegisteredCatalogs";
import { findListingByAddress } from "@/lib/member/memberListing";
import { onboardingNextHref, onboardingPrevHref, useOnboardingState } from "@/lib/member/onboardingState";
import type {
    AssemblyBindingRecord,
    CoSellerBinding,
} from "@/lib/member/memberProfileMetadata";
import {
    type AssemblyChoice,
    requiredCoSellerClauses,
    useAssemblyChoices,
} from "@/lib/protocol/assemblyChoices";
import { AssemblyChoiceRow } from "@/components/members/AssemblyChoiceRow";
import { PinnedTokenNote } from "@/components/members/PinnedTokenNote";
import { ProfileClauseValues } from "@/components/members/ProfileClauseValues";
import { OnboardingLoadingCard, OnboardingStepFooter, finishStep, type OnboardingStepChromeProps, toggledSet, useSubjectHydration } from "@/components/members/OnboardingStepChrome";

/**
 * The assemblies step of the onboarding wizard. The member picks which published
 * assemblies they participate in. Each selected assembly becomes an
 * `AssemblyBindingRecord` on `state.assemblies`.
 *
 * Per-binding co-seller editing: assemblies whose hydrated assembly contains
 * a non-root order with a per-role process clause (e.g. a courier
 * sub-order carrying a co-seller's process clause) require the member
 * to designate at least one wallet for that role. The picker surfaces an
 * inline editor when those rows are checked. Without these addresses
 * the cart has nowhere to read the co-seller's seller field from at
 * checkout time. For each designated wallet the member may name one item
 * from that wallet's OWN catalog (`itemIds`, keyed by the lowercased
 * address), chosen from a live read of the catalog; checkout prices the
 * co-seller's sub-order from it. With none named, the co-seller's first
 * available item prices it.
 *
 * MANDATORY: at least one assembly binding is required — a member
 * profile with no binding cannot be ordered from (it surfaces to no
 * assembly-scoped discovery). Both the Next button and the publish
 * step block until one is bound.
 */

function buildBinding(
    wallet: `0x${string}`,
    choice: Pick<AssemblyChoice, "assemblyHash">,
    coSellerBindings: CoSellerBinding[],
): AssemblyBindingRecord {
    return {
        bindingId: `binding:${wallet.toLowerCase()}:${choice.assemblyHash.toLowerCase()}`,
        subjectAddress: wallet,
        assemblyHash: choice.assemblyHash,
        coSellerBindings: coSellerBindings.length > 0 ? coSellerBindings : undefined,
    };
}

/** Build the full bindings array from the live selection + co-seller
 *  state. Used both for the autosave effect and the submit handler so
 *  they can't drift. The selection and the co-seller state are keyed by
 *  each assembly's full assembly hash, lowercased — the identity a
 *  binding carries; the slug is only shown. */
// A draft made before a wallet connects carries this subject; the review step
// re-stamps every binding with the wallet that signs the registration.
const DRAFT_SUBJECT = ZERO_ADDRESS;

function buildBindings(
    wallet: `0x${string}`,
    selected: Set<string>,
    coSellersByAssembly: Map<string, CoSellerBinding[]>,
): AssemblyBindingRecord[] {
    // Built from the selection itself — the key IS the assembly hash — so a
    // binding never depends on whether its assembly's document was read.
    return Array.from(selected).map((key) =>
        buildBinding(wallet, { assemblyHash: key as `0x${string}` }, coSellersByAssembly.get(key) ?? []));
}

/** The key the selection is held under: the assembly's full assembly hash. */
function assemblyKey(choice: { assemblyHash: string }): string {
    return choice.assemblyHash.toLowerCase();
}

export interface OnboardingAssembliesFormProps extends OnboardingStepChromeProps {
    /**
     * Edit-mode override. When provided, the submit handler calls
     * `onSave(bindings)` instead of routing to the next wizard step.
     */
    onSave?: (bindings: AssemblyBindingRecord[]) => Promise<void>;
}

export function OnboardingAssembliesForm({
    onSave,
    submitLabel,
    backHref,
    backLabel,
    submitInFlight = false,
    externalError = null,
}: OnboardingAssembliesFormProps = {}) {
    const router = useRouter();
    const mounted = useMounted();
    const { address, isConnected } = useAccount();
    const { state, loaded, subject, update } = useOnboardingState(address);

    // The published assemblies as a read: no choices and no autosave until
    // it is present — a failed read never stands for "nothing to bind" and
    // never writes `assemblies: []` over the draft.
    const { read: choicesRead } = useAssemblyChoices();
    const choicesLoaded = choicesRead.status === "present";
    const choices: AssemblyChoice[] = useMemo(
        () => (choicesRead.status === "present" ? choicesRead.value : []),
        [choicesRead],
    );

    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [coSellersByAssembly, setCoSellersByAssembly] = useState<
        Map<string, CoSellerBinding[]>
    >(new Map());
    const { hydrated, markHydrated } = useSubjectHydration(subject);
    const [submitError, setSubmitError] = useState<string | null>(null);

    useEffect(() => {
        if (hydrated || !loaded) return;
        const existing = state.assemblies ?? [];
        setSelected(new Set(existing.map(assemblyKey)));
        const cps = new Map<string, CoSellerBinding[]>();
        for (const b of existing) {
            if (b.coSellerBindings && b.coSellerBindings.length > 0) {
                cps.set(assemblyKey(b), b.coSellerBindings);
            }
        }
        setCoSellersByAssembly(cps);
        markHydrated();
    }, [hydrated, loaded, markHydrated, state.assemblies]);

    useEffect(() => {
        if (!hydrated || !choicesLoaded) return;
        update({
            assemblies: buildBindings(address ?? DRAFT_SUBJECT, selected, coSellersByAssembly),
        });
    }, [selected, coSellersByAssembly, hydrated, address, choicesLoaded, update]);

    function toggle(key: string) {
        setSelected((prev) => toggledSet(prev, key));
    }

    const updateCoSellers = useCallback(
        (key: string, clauseKey: `0x${string}`, addresses: `0x${string}`[], itemIds: Record<string, string>) => {
            setCoSellersByAssembly((prev) => {
                const next = new Map(prev);
                const existing = (next.get(key) ?? []).filter((cb) => !hexEqual(cb.clauseKey, clauseKey));
                if (addresses.length > 0) {
                    // An item is named only for a wallet the binding still
                    // designates (the profile parser refuses any other key).
                    const kept = Object.fromEntries(
                        Object.entries(itemIds).filter(([a]) => addresses.some((d) => hexEqual(d, a))),
                    );
                    existing.push({ clauseKey, addresses, ...(Object.keys(kept).length > 0 ? { itemIds: kept } : {}) });
                }
                if (existing.length > 0) next.set(key, existing);
                else next.delete(key);
                return next;
            });
        },
        [],
    );

    function handleNext(e: React.FormEvent) {
        e.preventDefault();
        // MANDATORY: a profile without assembly bindings cannot be ordered
        // from (checkout enables only for a bound profile) — neither the
        // wizard nor the edit surface may produce one.
        if (selected.size === 0) {
            setSubmitError("Bind at least one published assembly — a member profile without one cannot be ordered from.");
            return;
        }
        setSubmitError(null);
        finishStep(
            onSave && (() => onSave(buildBindings(address ?? DRAFT_SUBJECT, selected, coSellersByAssembly))),
            () => router.push(onboardingNextHref("assemblies")),
        );
    }

    if (!mounted) {
        return <OnboardingLoadingCard />;
    }


    return (
        <form onSubmit={handleNext} className="space-y-8">
            <Card className="p-6 space-y-3 text-sm text-ink-body">
                <p>
                    Pick the assemblies you sell through. Each binding publishes
                    onto your profile as part of the document pinned at publish.
                    At least one binding is required — a profile with no assembly
                    binding cannot be ordered from. You can add more later through
                    the member-edit surface.
                </p>
                <p>
                    Each row carries the designer&apos;s own name and summary for
                    the assembly, then its shape: how many agreements it composes
                    and which clauses they carry. Inspect opens the whole
                    composition. Read the summary first &mdash; it is the sentence
                    that says which trade the assembly is for.
                </p>
                <p>
                    Assemblies that include sub-orders you organize (e.g. a
                    delivery courier) prompt for the wallets you trust to fill
                    those sub-orders. Without those addresses the cart has
                    nowhere to read your co-sellers from at checkout time.
                </p>
            </Card>

            <div className="space-y-3">
                {choices.map((choice) => {
                    const isSelected = selected.has(assemblyKey(choice));
                    const requiredClauses =
                        choice.state === "loaded" && choice.hydratedAssembly
                            ? requiredCoSellerClauses(choice.hydratedAssembly)
                            : [];
                    const coSellers = coSellersByAssembly.get(assemblyKey(choice)) ?? [];
                    return (
                        <AssemblyChoiceRow
                            key={choice.assemblyHash}
                            choice={choice}
                            checked={isSelected}
                            onToggle={() => toggle(assemblyKey(choice))}
                            testIdPrefix="seller-assembly"
                        >
                            {/* What binding accepts, before the checkbox: a
                                designer-pinned token denominates every payment
                                and bond under the assembly. */}
                            {choice.state === "loaded" && choice.hydratedAssembly && (
                                <PinnedTokenNote assembly={choice.hydratedAssembly.assembly} slug={choice.slug} />
                            )}
                            {isSelected && requiredClauses.length > 0 && (
                                <div
                                    className="mt-4 pt-4 border-t border-default space-y-4"
                                    data-testid={`seller-assembly-co-sellers-${choice.slug}`}
                                >
                                    {requiredClauses.map((clauseKey) => {
                                        const entry = coSellers.find((cb) => hexEqual(cb.clauseKey, clauseKey));
                                        const addresses = entry?.addresses ?? [];
                                        const itemIds = entry?.itemIds ?? {};
                                        return (
                                            <CoSellerClauseEditor
                                                key={clauseKey}
                                                clauseKey={clauseKey}
                                                addresses={addresses}
                                                itemIds={itemIds}
                                                onChange={(next) =>
                                                    updateCoSellers(assemblyKey(choice), clauseKey as `0x${string}`, next, itemIds)
                                                }
                                                onItemChange={(next) =>
                                                    updateCoSellers(assemblyKey(choice), clauseKey as `0x${string}`, addresses, next)
                                                }
                                            />
                                        );
                                    })}
                                </div>
                            )}
                        </AssemblyChoiceRow>
                    );
                })}
            </div>

            {/* Profile-sourced clause values (a dim-weight divisor, a declared
                credential id) — the member's master data the bound assemblies read at
                checkout. Scoped to the clauses the assemblies selected above
                compose, exactly as the catalog step scopes its item
                properties; filled here, where a binding exists, never on
                Identity, where nothing is bound yet. Stored on the profile
                draft, which is the document they belong to. */}
            <ProfileClauseValues
                clauseKeys={[...new Set(
                    choices.filter((c) => selected.has(assemblyKey(c))).flatMap((c) => c.clauses ?? []),
                )]}
                values={state.profile?.profileClauseValues ?? {}}
                onChange={(next) =>
                    update({
                        profile: {
                            ...(state.profile ?? {}),
                            profileClauseValues: Object.keys(next).length > 0 ? next : undefined,
                        },
                    })
                }
            />

            {(submitError ?? externalError) && (
                <p className="text-sm text-error-fg" role="alert">{submitError ?? externalError}</p>
            )}

            <OnboardingStepFooter
                backHref={backHref}
                backLabel={backLabel}
                submitLabel={submitLabel}
                submitInFlight={submitInFlight}
                defaultBackHref={onboardingPrevHref("assemblies")}
            />
        </form>
    );
}

/** Per-clause address editor — list of address inputs with add /
 *  remove. Maintains local "rows in progress" so the user can type
 *  partial values; the parent only sees validated addresses. Basic
 *  shape validation (viem `isAddress`) only; MembersRegistry-membership
 *  lookup is deferred. */
function CoSellerClauseEditor({
    clauseKey,
    addresses,
    itemIds,
    onChange,
    onItemChange,
}: {
    clauseKey: string;
    addresses: `0x${string}`[];
    /** The item named per designated wallet, keyed by its lowercased address. */
    itemIds: Record<string, string>;
    onChange: (next: `0x${string}`[]) => void;
    onItemChange: (next: Record<string, string>) => void;
}) {
    const heading = getClauseSpec(clauseKey)?.title ?? clauseKey;
    // The designated wallets' own catalogs, read live: only a present read
    // with offered items for a wallet shows that wallet's list.
    const { read: catalogsRead } = useRegisteredCatalogs();
    // Local rows include in-progress (typed but not yet valid) entries.
    // Always pad with one trailing empty row so the user has somewhere
    // to add a new address.
    const [rows, setRows] = useState<string[]>(() =>
        addresses.length > 0 ? [...addresses, ""] : [""],
    );

    function propagate(nextRows: string[]) {
        setRows(nextRows);
        const validAddresses = nextRows
            .map((r) => r.trim())
            .filter((r) => r && isAddress(r)) as `0x${string}`[];
        // Dedupe while preserving insertion order.
        const seen = new Set<string>();
        const deduped: `0x${string}`[] = [];
        for (const a of validAddresses) {
            const key = a.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(a);
        }
        // Only fire onChange if the validated set actually changed; otherwise
        // we'd re-trigger the parent's autosave effect on every keystroke.
        const same =
            deduped.length === addresses.length &&
            deduped.every((a, i) => hexEqual(a, addresses[i]));
        if (!same) onChange(deduped);
    }

    function updateRow(index: number, raw: string) {
        const next = [...rows];
        next[index] = raw;
        propagate(next);
    }

    function removeRow(index: number) {
        const next = rows.filter((_, i) => i !== index);
        // Keep at least one trailing empty row.
        if (next.length === 0) next.push("");
        propagate(next);
    }

    function addRow() {
        setRows((prev) => [...prev, ""]);
    }

    return (
        <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-ink-heading">
                    {heading}
                </span>
                <span className="text-[11px] text-ink-muted">
                    {addresses.length} saved
                </span>
            </div>
            <p className="text-[11px] text-ink-muted">
                Wallets you designate to fill this sub-order at checkout. Order is
                significant — the cart picks the first reachable wallet.
            </p>
            <div className="space-y-2">
                {rows.map((value, i) => {
                    const trimmed = value.trim();
                    const valid = trimmed === "" || isAddress(trimmed);
                    return (
                        <div key={i} className="flex items-center gap-2">
                            <Input
                                type="text"
                                placeholder="0x…"
                                value={value}
                                onChange={(e) => updateRow(i, e.target.value)}
                                className={`flex-1 text-xs font-mono px-2 py-1.5 rounded ${
                                    valid ? "border-default" : "border-error"
                                }`}
                                data-testid={`co-seller-${clauseKey}-input-${i}`}
                            />
                            {rows.length > 1 && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeRow(i)}
                                    className="text-xs text-ink-muted hover:text-error-fg"
                                    aria-label={`Remove address ${i + 1}`}
                                    data-testid={`co-seller-${clauseKey}-remove-${i}`}
                                >
                                    ×
                                </Button>
                            )}
                        </div>
                    );
                })}
                {addresses.map((address) => {
                    const key = address.toLowerCase();
                    const catalog = catalogsRead.status === "present"
                        ? findListingByAddress(catalogsRead.value, address)
                        : undefined;
                    const offered = (catalog?.items ?? []).filter((item) => item.available !== false);
                    if (offered.length === 0) return null;
                    const named = itemIds[key];
                    return (
                        <label key={key} className="block space-y-1 text-[11px] text-ink-muted">
                            <span>
                                The item from <span className="font-mono">{address}</span>&apos;s own catalog
                                that prices this sub-order.
                            </span>
                            <Select
                                value={named ?? ""}
                                onChange={(e) => {
                                    const next = { ...itemIds };
                                    if (e.target.value) next[key] = e.target.value;
                                    else delete next[key];
                                    onItemChange(next);
                                }}
                                className="text-xs"
                                data-testid={`co-seller-${clauseKey}-item-${key}`}
                            >
                                <option value="">No item named: the co-seller&apos;s first available item prices the order</option>
                                {offered.map((item) => (
                                    <option key={item.id} value={item.id}>{item.name} ({item.price})</option>
                                ))}
                                {named && !offered.some((item) => item.id === named) && (
                                    <option value={named}>{named}: no longer offered</option>
                                )}
                            </Select>
                        </label>
                    );
                })}
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addRow}
                    className="px-0 text-xs text-ink-muted hover:bg-transparent hover:text-ink-heading"
                    data-testid={`co-seller-${clauseKey}-add`}
                >
                    + Add another
                </Button>
            </div>
        </div>
    );
}

