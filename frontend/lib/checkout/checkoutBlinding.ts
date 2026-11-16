/**
 * checkoutBlinding.ts — the blinding value of each private clause of each
 * order, drawn once per checkout draft and kept with it.
 *
 * A clause whose spec declares a private set carries a blinding field
 * (`blinding: true`): a random value the party that fills the set draws, so
 * that the clause's data hash cannot be confirmed by hashing guesses of a
 * value with few possibilities. At checkout the buyer fills the set, so the
 * checkout draws the value (`withClauseBlinding`). The draft is built more
 * than once before it is signed (the dispatch race's dry walk, then the
 * commit walk, each from the same fills), and each build must reproduce the
 * same `checkoutHash`; so the value is drawn the first time a draft meets the
 * clause and read back from `kept` every time after. Keyed on the spec's own
 * attribute, never on a clause id or a field name.
 */
import { agreementClauses, withClauseBlinding, type Hex, type HydratedAssembly, type SpecSource } from "@figaro-protocol/sdk";

/** A checkout's fills: assembly node id → clause key → field values. */
export type CheckoutFills = Record<string, Record<string, Record<string, unknown>>>;

/** The page's sentence where a private clause's value cannot be drawn. */
const BLINDING_UNAVAILABLE =
    "This order cannot be placed in this browser: a private term needs a random value drawn by the browser's Web Crypto, and this browser does not offer it.";

/**
 * The draft's own store for a new checkout attempt after one failed.
 *
 * With no race outcome, every order draws its values anew: an order the
 * failed attempt signed and relayed may already be in a seller's hands, so a
 * retried order, built with fresh salts, must share no private leaf with it.
 *
 * With a race outcome (`race`), the retry keeps the whole store. The race
 * fixed every order's salt and the deadline, and the winner countersigned the
 * raced order's struct, which names the process id (the root's
 * `checkoutHash`) and its parents' order hashes. A value drawn anew for any
 * order would change that order's `checkoutHash`, and so the raced struct,
 * and the walk would refuse to relay. Keeping every value rebuilds every
 * order's struct exactly as the failed attempt built it, so the retry signs
 * the same orders again and no second commitment exists. The raced order
 * keeps the winner's values (`race.blinding`).
 */
export function freshBlindingStore(
    kept: CheckoutFills,
    race: { nodeId: string; blinding: Record<string, Record<string, unknown>> } | null,
): CheckoutFills {
    if (!race) return {};
    return { ...kept, [race.nodeId]: { ...kept[race.nodeId], ...race.blinding } };
}

/**
 * `fills` with each private clause's blinding value of each order of
 * `hydrated` set from the draft's own store. A value is drawn the first time
 * this draft meets the clause and is written into `kept`, the draft's own
 * store, so a later call with the same store returns the same value. A value
 * the fills carry is drawn over: the fills fold in the design's values, and
 * a design is public and the same in every order, so only the draft's own
 * draw is kept (told apart by where it came from, never by the value). A clause whose
 * spec is not loaded is skipped and drawn once it loads. Entries of `fills`
 * that name no order of the assembly pass through unchanged. It runs while a
 * page renders, so it never throws: an order whose registered agreement the
 * hydrated assembly does not carry contributes the clauses its fills name
 * (the checkout walk refuses that order on its own), and where this browser
 * has no Web Crypto to draw from, the clause is left with no value (the sign
 * gate then refuses the order, so nothing is signed without one) and
 * `onRefusal`, when given, receives the sentence the page shows.
 */
export function withCheckoutBlinding(
    hydrated: HydratedAssembly,
    fills: CheckoutFills,
    specs: SpecSource,
    kept: CheckoutFills,
    onRefusal?: (sentence: string) => void,
): CheckoutFills {
    const out: CheckoutFills = { ...fills };
    let refused = false;
    const assemblyClauses = hydrated.assembly.assemblyClauses ?? {};
    hydrated.assembly.agreements.forEach((entry, i) => {
        const nodeId = String(entry.id ?? i);
        const nodeFills = fills[nodeId] ?? {};
        const keys = new Set([...Object.keys(assemblyClauses), ...registeredClauseKeys(hydrated, entry), ...Object.keys(nodeFills)]);
        let nodeOut = nodeFills;
        for (const clauseKey of keys) {
            if (!specs.get(clauseKey as Hex)) continue;
            const store = (kept[nodeId] ??= {});
            let drawn = store[clauseKey];
            if (drawn === undefined) {
                try {
                    drawn = store[clauseKey] = withClauseBlinding(specs, clauseKey as Hex, {});
                } catch {
                    if (!refused) onRefusal?.(BLINDING_UNAVAILABLE);
                    refused = true;
                    continue;
                }
            }
            if (Object.keys(drawn).length === 0) continue;
            if (nodeOut === nodeFills) nodeOut = { ...nodeFills };
            // The draft's own draw stands over whatever the fills carry: the
            // fills fold in values from the design (`mergeAssemblyTermFills`)
            // and the form offers no input for the field, so a value there
            // is never the buyer's own.
            nodeOut[clauseKey] = { ...nodeFills[clauseKey], ...drawn };
        }
        if (nodeOut !== nodeFills || nodeId in fills) out[nodeId] = nodeOut;
    });
    return out;
}

/**
 * `fills` with the blinding values of one order (`nodeId`) drawn anew, for a
 * draft that leaves this checkout: each candidate of a dispatch race gets a
 * draft of its own, so no two drafts share a value. Every other order keeps
 * the values `fills` carries. `drawn` is the new values of that order, in
 * the shape of the draft's own store (clause key → field → value): the
 * checkout keeps the winner's under its order, so the commit walk rebuilds
 * the struct the winner countersigned.
 */
export function redrawNodeBlinding(
    hydrated: HydratedAssembly,
    fills: CheckoutFills,
    nodeId: string,
    specs: SpecSource,
): { fills: CheckoutFills; drawn: Record<string, Record<string, unknown>> } {
    const kept: CheckoutFills = {};
    const redrawn = withCheckoutBlinding(hydrated, fills, specs, kept);
    return {
        fills: nodeId in redrawn ? { ...fills, [nodeId]: redrawn[nodeId] } : fills,
        drawn: kept[nodeId] ?? {},
    };
}

/** The clause keys of the registered agreement an assembly entry binds, or
 *  none when the hydrated assembly does not carry it. */
function registeredClauseKeys(hydrated: HydratedAssembly, entry: HydratedAssembly["assembly"]["agreements"][number]): string[] {
    try {
        return Object.keys(agreementClauses(hydrated, entry));
    } catch {
        return [];
    }
}
