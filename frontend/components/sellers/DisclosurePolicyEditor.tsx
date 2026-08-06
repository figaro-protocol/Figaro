"use client";

import { useState } from "react";
import { isAddress } from "viem";
import { Card } from "@/components/ui/Card";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
import type { DisclosurePolicyEntry } from "@/lib/member/memberProfileMetadata";
import type { AssemblyChoice } from "@/lib/protocol/assemblyChoices";

/**
 * DisclosurePolicyEditor — the member's data-disclosure declaration,
 * edited beside the assembly bindings it derives from.
 *
 * Leaf classes are DERIVED, never a stored taxonomy: each row is the
 * pair (assembly compositionHash, clauseId) enumerated from the
 * assemblies the member is binding right now (the `choices` prop is
 * the live-registry selection), crossed with the two postures a member
 * holds — records co-produced AS A SELLER and AS A BUYER. The buyer
 * half is first-class: the same offer structure, the same terms.
 *
 * Checking a row declares the class offered (an entry with
 * `offered: true` on the profile). Unchecking removes the entry —
 * the paper-contract default: each party holds its own copy; absence
 * of a policy is not a policy of openness. Prices never live here —
 * a data product is priced as an item in the member's own catalogue
 * (fixed | rate), the item referencing the class via `recordClass`.
 */

const ALL_POSTURES = ["seller", "buyer"] as const;

function findEntry(
    entries: DisclosurePolicyEntry[],
    compositionHash: `0x${string}`,
    clauseId: string,
    posture: "buyer" | "seller",
): DisclosurePolicyEntry | undefined {
    return entries.find(
        (e) =>
            e.compositionHash === compositionHash &&
            e.clauseId === clauseId &&
            e.posture === posture,
    );
}

export interface DisclosurePolicyEditorProps {
    /** The assemblies whose record classes this mount governs — the
     *  seller step passes its selected BINDINGS, the buyer step its
     *  selected SUBSCRIPTIONS; both from the on-chain registry. */
    choices: AssemblyChoice[];
    entries: DisclosurePolicyEntry[];
    onChange: (next: DisclosurePolicyEntry[]) => void;
    /** Which side's rows this mount edits. The seller assemblies step
     *  passes ["seller"], the buyer step ["buyer"] — each side's classes
     *  derive from its own assembly list, so the two are never
     *  interleaved on one step. */
    postures?: readonly ("buyer" | "seller")[];
}

export function DisclosurePolicyEditor({ choices, entries, onChange, postures = ALL_POSTURES }: DisclosurePolicyEditorProps) {
    if (choices.length === 0) return null;

    function upsert(entry: DisclosurePolicyEntry) {
        const rest = entries.filter(
            (e) =>
                !(e.compositionHash === entry.compositionHash &&
                    e.clauseId === entry.clauseId &&
                    e.posture === entry.posture),
        );
        onChange([...rest, entry]);
    }

    function remove(compositionHash: `0x${string}`, clauseId: string, posture: "buyer" | "seller") {
        onChange(entries.filter(
            (e) =>
                !(e.compositionHash === compositionHash &&
                    e.clauseId === clauseId &&
                    e.posture === posture),
        ));
    }

    return (
        <section className="space-y-4" data-testid="disclosure-policy-editor">
            <h3 className="text-heading-h3 text-ink-heading">Data disclosure</h3>
            <Card className="p-6 space-y-3 text-sm text-ink-body">
                <p>
                    Optional. Every bonded process co-produces records — one per
                    clause, per order. The record classes below derive from the
                    assemblies you just bound. Checking a class offers it for
                    sale or disclosure; a whitelist narrows who may buy or see
                    it, and an embargo delays it until N days after settlement.
                </p>
                <p>
                    You hold both postures — records you co-produce as a seller
                    and records you co-produce as a buyer are equally yours to
                    offer. Prices never live here: a data product is priced as
                    an item in your own catalogue, like anything else you sell.
                    Leave everything unchecked for the default: each party
                    simply holds its own copy, and nothing is offered.
                </p>
            </Card>
            {choices.map((choice) => (
                <Card key={choice.compositionHash} className="p-4 space-y-4" data-testid={`disclosure-assembly-${choice.slug}`}>
                    <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold text-ink-heading truncate">{choice.name}</span>
                        <code className="text-xs text-ink-faint font-mono shrink-0">{choice.slug}</code>
                    </div>
                    {choice.clauses === null ? (
                        <p className="text-xs text-ink-faint">Loading the assembly&apos;s clause set…</p>
                    ) : (
                        choice.clauses.map((clauseId) => (
                            <div key={clauseId} className="space-y-2 pt-2 border-t border-default">
                                <span className="text-xs font-semibold text-ink-heading">
                                    {getClauseSpec(clauseId)?.title ?? clauseId}
                                </span>
                                {postures.map((posture) => (
                                    <PolicyLeafRow
                                        key={posture}
                                        slug={choice.slug}
                                        clauseId={clauseId}
                                        posture={posture}
                                        entry={findEntry(entries, choice.compositionHash, clauseId, posture)}
                                        onOffer={(offered) =>
                                            offered
                                                ? upsert({
                                                    compositionHash: choice.compositionHash,
                                                    clauseId,
                                                    posture,
                                                    offered: true,
                                                })
                                                : remove(choice.compositionHash, clauseId, posture)}
                                        onUpdate={upsert}
                                    />
                                ))}
                            </div>
                        ))
                    )}
                </Card>
            ))}
        </section>
    );
}

/** One leaf-class × posture row: the offer toggle, and (when offered)
 *  the whitelist + settlement-embargo refinements. */
function PolicyLeafRow({
    slug,
    clauseId,
    posture,
    entry,
    onOffer,
    onUpdate,
}: {
    slug: string;
    clauseId: string;
    posture: "buyer" | "seller";
    entry: DisclosurePolicyEntry | undefined;
    onOffer: (offered: boolean) => void;
    onUpdate: (entry: DisclosurePolicyEntry) => void;
}) {
    const offered = entry?.offered === true;
    // Raw whitelist text stays local so partially-typed addresses don't
    // vanish; only valid, deduped addresses propagate to the entry
    // (the CounterpartyClauseEditor idiom).
    const [whitelistText, setWhitelistText] = useState<string>(
        () => (entry?.whitelist ?? []).join(", "),
    );
    const rowId = `disclosure-${slug}-${clauseId}-${posture}`;

    function propagateWhitelist(raw: string) {
        setWhitelistText(raw);
        if (!entry) return;
        const seen = new Set<string>();
        const addresses: `0x${string}`[] = [];
        for (const part of raw.split(/[\s,]+/)) {
            const trimmed = part.trim();
            if (!trimmed || !isAddress(trimmed)) continue;
            const key = trimmed.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            addresses.push(trimmed as `0x${string}`);
        }
        onUpdate({
            ...entry,
            whitelist: addresses.length > 0 ? addresses : undefined,
        });
    }

    function propagateEmbargo(raw: string) {
        if (!entry) return;
        const days = raw.trim() === "" ? undefined : Number(raw);
        const valid = days !== undefined && Number.isFinite(days) && days >= 0;
        onUpdate({
            ...entry,
            calendar: valid ? { embargoDaysAfterSettlement: days } : undefined,
        });
    }

    return (
        <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-ink-body">
                <input
                    type="checkbox"
                    checked={offered}
                    onChange={(e) => onOffer(e.target.checked)}
                    className="accent-accent"
                    data-testid={`${rowId}-offer`}
                />
                <span>
                    Offer records I co-produce{" "}
                    <span className="font-semibold">as {posture === "seller" ? "a seller" : "a buyer"}</span>
                </span>
            </label>
            {offered && (
                <div className="ml-6 space-y-2">
                    <div className="space-y-1">
                        <input
                            type="text"
                            placeholder="Whitelist — 0x…, 0x… (empty = any counterparty)"
                            value={whitelistText}
                            onChange={(e) => propagateWhitelist(e.target.value)}
                            className="w-full text-xs font-mono px-2 py-1.5 rounded border border-default min-h-9"
                            data-testid={`${rowId}-whitelist`}
                        />
                        <p className="text-[11px] text-ink-faint">
                            {entry?.whitelist?.length
                                ? `${entry.whitelist.length} wallet${entry.whitelist.length === 1 ? "" : "s"} whitelisted.`
                                : "No whitelist — any counterparty may buy or see this class."}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min={0}
                            placeholder="0"
                            value={entry?.calendar?.embargoDaysAfterSettlement ?? ""}
                            onChange={(e) => propagateEmbargo(e.target.value)}
                            className="w-24 text-xs px-2 py-1.5 rounded border border-default min-h-9"
                            data-testid={`${rowId}-embargo`}
                        />
                        <span className="text-[11px] text-ink-faint">
                            days after settlement before disclosure opens (empty = immediately).
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
