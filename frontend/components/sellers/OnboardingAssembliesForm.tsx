"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { isAddress } from "viem";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { hexEqual } from "@/lib/shared/evm";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { useMounted } from "@/lib/shared/useMounted";
import { useOnboardingState } from "@/lib/seller/onboardingState";
import type { AssemblyBindingRecord, CounterpartyBinding } from "@/lib/seller/sellerProfileMetadata";
import {
    type AssemblyChoice,
    requiredCounterpartyClauses,
    useAssemblyChoices,
} from "@/lib/core/assemblyChoices";
import { AssemblyShapeLine } from "@/components/assemblies/AssemblyShapeLine";

/**
 * Step 5 of the onboarding wizard. Seller picks which published
 * assemblies they participate in. Each selected assembly becomes an
 * `AssemblyBindingRecord` on `state.assemblies`.
 *
 * Per-binding counterparty editing: assemblies whose assemblyTemplate contains
 * a non-root order with a per-role process clause (e.g. a courier
 * sub-order carrying a counterparty-process clause) require the seller
 * to designate at least one wallet for that role. The picker surfaces an
 * inline editor when those rows are checked. Without these addresses
 * the cart has nowhere to read the counterparty's seller field from at
 * checkout time.
 *
 * MANDATORY: at least one assembly binding is required — a seller
 * profile with no binding cannot be ordered from (it surfaces to no
 * assembly-scoped discovery). Both the Next button and the publish
 * step block until one is bound.
 */

function buildBinding(
    wallet: `0x${string}`,
    choice: AssemblyChoice,
    counterpartyBindings: CounterpartyBinding[],
): AssemblyBindingRecord {
    return {
        bindingId: `binding:${wallet.toLowerCase()}:${choice.slug}`,
        subjectAddress: wallet,
        assemblySlug: choice.slug,
        counterpartyBindings: counterpartyBindings.length > 0 ? counterpartyBindings : undefined,
    };
}

/** Build the full bindings array from the live selection + counterparty
 *  state. Used both for the autosave effect and the submit handler so
 *  they can't drift. */
function buildBindings(
    wallet: `0x${string}`,
    selected: Set<string>,
    choices: AssemblyChoice[],
    counterpartiesBySlug: Map<string, CounterpartyBinding[]>,
): AssemblyBindingRecord[] {
    return choices
        .filter((c) => selected.has(c.slug))
        .map((c) => buildBinding(wallet, c, counterpartiesBySlug.get(c.slug) ?? []));
}

export interface OnboardingAssembliesFormProps {
    /**
     * Edit-mode override. When provided, the submit handler calls
     * `onSave(bindings)` instead of routing to the next wizard step.
     */
    onSave?: (bindings: AssemblyBindingRecord[]) => Promise<void>;
    submitLabel?: string;
    backHref?: string;
    backLabel?: string;
    submitInFlight?: boolean;
    externalError?: string | null;
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
    const { state, loaded, update } = useOnboardingState(address);

    const { data: choicesData } = useAssemblyChoices();
    const choices: AssemblyChoice[] = choicesData ?? [];

    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [counterpartiesBySlug, setCounterpartiesBySlug] = useState<
        Map<string, CounterpartyBinding[]>
    >(new Map());
    const [hydrated, setHydrated] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    useEffect(() => {
        if (hydrated || !loaded) return;
        const existing = state.assemblies ?? [];
        setSelected(new Set(existing.map((b) => b.assemblySlug)));
        const cps = new Map<string, CounterpartyBinding[]>();
        for (const b of existing) {
            if (b.counterpartyBindings && b.counterpartyBindings.length > 0) {
                cps.set(b.assemblySlug, b.counterpartyBindings);
            }
        }
        setCounterpartiesBySlug(cps);
        setHydrated(true);
    }, [hydrated, loaded, state.assemblies]);

    useEffect(() => {
        if (!hydrated || !isConnected || !address) return;
        update({ assemblies: buildBindings(address, selected, choices, counterpartiesBySlug) });
    }, [selected, counterpartiesBySlug, hydrated, isConnected, address, choices, update]);

    function toggle(slug: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(slug)) next.delete(slug);
            else next.add(slug);
            return next;
        });
    }

    const updateCounterparties = useCallback(
        (slug: string, clauseId: string, addresses: `0x${string}`[]) => {
            setCounterpartiesBySlug((prev) => {
                const next = new Map(prev);
                const existing = (next.get(slug) ?? []).filter((cb) => cb.clauseId !== clauseId);
                if (addresses.length > 0) {
                    existing.push({ clauseId, addresses });
                }
                if (existing.length > 0) next.set(slug, existing);
                else next.delete(slug);
                return next;
            });
        },
        [],
    );

    function handleNext(e: React.FormEvent) {
        e.preventDefault();
        // MANDATORY: a profile without assembly bindings cannot be ordered
        // from (checkout enables only for a bound profile) — neither the
        // wizard nor the edit surface may produce one (user rule 2026-06-12).
        if (selected.size === 0) {
            setSubmitError("Bind at least one published assembly — a seller profile without one cannot be ordered from.");
            return;
        }
        setSubmitError(null);
        if (onSave) {
            if (!address) return;
            onSave(buildBindings(address, selected, choices, counterpartiesBySlug)).catch(() => {
                // Caller surfaces the error via `externalError`.
            });
            return;
        }
        router.push("/sellers/agents");
    }

    if (!mounted) {
        return <Card className="p-6 text-sm text-ink-faint">Loading…</Card>;
    }

    if (!isConnected) {
        return (
            <Card className="p-6 space-y-4">
                <p className="text-sm text-ink-body">
                    Connect a wallet to load your assembly bindings draft.
                </p>
                <Link href="/sellers/identity">
                    <Button variant="outline">← Back</Button>
                </Link>
            </Card>
        );
    }

    return (
        <form onSubmit={handleNext} className="space-y-8">
            <Card className="p-6 space-y-3 text-sm text-ink-body">
                <p>
                    Pick the assemblies you participate in. Each binding publishes
                    onto your profile as part of the document pinned at publish.
                    At least one binding is required — a profile with no assembly
                    binding cannot be ordered from. You can add more later through
                    the seller-edit surface.
                </p>
                <p>
                    Assemblies that include sub-orders you organize (e.g. a
                    delivery courier) prompt for the wallets you trust to fill
                    those sub-orders. Without those addresses the cart has
                    nowhere to read your counterparties from at checkout time.
                </p>
            </Card>

            <div className="space-y-3">
                {choices.map((choice) => {
                    const isSelected = selected.has(choice.slug);
                    const requiredClauses =
                        choice.state === "loaded" && choice.assemblyTemplate
                            ? requiredCounterpartyClauses(choice.assemblyTemplate)
                            : [];
                    const counterparties = counterpartiesBySlug.get(choice.slug) ?? [];
                    return (
                        <Card
                            key={choice.slug}
                            className={`p-4 transition-colors ${isSelected ? "border-ink-heading" : ""}`}
                            data-testid={`seller-assembly-row-${choice.slug}`}
                        >
                            <div className="flex items-start gap-3">
                                <label className="flex items-start gap-3 cursor-pointer flex-1 min-w-0">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggle(choice.slug)}
                                        className="mt-1 accent-accent"
                                    />
                                    <div className="flex-1 min-w-0 space-y-1">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <span className="font-semibold text-ink-heading truncate">
                                                {choice.name}
                                            </span>
                                            <code className="text-xs text-ink-faint font-mono shrink-0">
                                                {choice.slug}
                                            </code>
                                        </div>
                                        <AssemblyShapeLine
                                            choice={choice}
                                            className="text-[11px]"
                                            testId={`seller-assembly-shape-${choice.slug}`}
                                        />
                                        <p className="text-xs text-ink-faint">
                                            Networks: {choice.networkTargets.join(", ")}
                                        </p>
                                    </div>
                                </label>
                                <Link
                                    href={`/builders/designer/view/${encodeURIComponent(choice.slug)}`}
                                    target="_blank"
                                    rel="noopener"
                                    className="text-xs px-3 py-1.5 rounded border border-neutral-300 bg-white hover:border-neutral-500 text-neutral-700 text-center shrink-0"
                                    data-testid={`seller-assembly-inspect-${choice.slug}`}
                                >
                                    Inspect ↗
                                </Link>
                            </div>
                            {isSelected && requiredClauses.length > 0 && (
                                <div
                                    className="mt-4 pt-4 border-t border-default space-y-4"
                                    data-testid={`seller-assembly-counterparties-${choice.slug}`}
                                >
                                    {requiredClauses.map((clauseId) => {
                                        const entry = counterparties.find((cb) => cb.clauseId === clauseId);
                                        const addresses = entry?.addresses ?? [];
                                        return (
                                            <CounterpartyClauseEditor
                                                key={clauseId}
                                                clauseId={clauseId}
                                                addresses={addresses}
                                                onChange={(next) =>
                                                    updateCounterparties(choice.slug, clauseId, next)
                                                }
                                            />
                                        );
                                    })}
                                </div>
                            )}
                        </Card>
                    );
                })}
            </div>

            {(submitError ?? externalError) && (
                <p className="text-sm text-red-600" role="alert">{submitError ?? externalError}</p>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-default">
                <Link
                    href={backHref ?? "/sellers/catalogue"}
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

/** Per-clause address editor — list of address inputs with add /
 *  remove. Maintains local "rows in progress" so the user can type
 *  partial values; the parent only sees validated addresses. Basic
 *  shape validation (viem `isAddress`) only; SellerRegistry-membership
 *  lookup is deferred. */
function CounterpartyClauseEditor({
    clauseId,
    addresses,
    onChange,
}: {
    clauseId: string;
    addresses: `0x${string}`[];
    onChange: (next: `0x${string}`[]) => void;
}) {
    const heading = getClauseSpec(clauseId)?.title ?? clauseId;
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
                <span className="text-[11px] text-ink-faint">
                    {addresses.length} saved
                </span>
            </div>
            <p className="text-[11px] text-ink-faint">
                Wallets you designate to fill this sub-order at checkout. Order is
                significant — the cart picks the first reachable wallet.
            </p>
            <div className="space-y-2">
                {rows.map((value, i) => {
                    const trimmed = value.trim();
                    const valid = trimmed === "" || isAddress(trimmed);
                    return (
                        <div key={i} className="flex items-center gap-2">
                            <input
                                type="text"
                                placeholder="0x…"
                                value={value}
                                onChange={(e) => updateRow(i, e.target.value)}
                                className={`flex-1 text-xs font-mono px-2 py-1.5 rounded border min-h-9 ${
                                    valid ? "border-default" : "border-red-400"
                                }`}
                                data-testid={`counterparty-${clauseId}-input-${i}`}
                            />
                            {rows.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => removeRow(i)}
                                    className="text-xs text-ink-faint hover:text-red-600 px-2"
                                    aria-label={`Remove address ${i + 1}`}
                                    data-testid={`counterparty-${clauseId}-remove-${i}`}
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    );
                })}
                <button
                    type="button"
                    onClick={addRow}
                    className="text-xs text-ink-faint hover:text-ink-heading"
                    data-testid={`counterparty-${clauseId}-add`}
                >
                    + Add another
                </button>
            </div>
        </div>
    );
}

