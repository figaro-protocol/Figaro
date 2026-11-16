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

/**
 * `fills` with each private clause's blinding value of each order of
 * `hydrated` filled where the fills leave it absent. A value is drawn the
 * first time this draft meets the clause and is written into `kept`, the
 * draft's own store, so a later call with the same store returns the same
 * value; a value the fills already carry is never overwritten. A clause whose
 * spec is not loaded is skipped and drawn once it loads. Entries of `fills`
 * that name no order of the assembly pass through unchanged. It runs while a
 * page renders, so it never throws: an order whose registered agreement the
 * hydrated assembly does not carry contributes the clauses its fills name
 * (the checkout walk refuses that order on its own).
 */
export function withCheckoutBlinding(
    hydrated: HydratedAssembly,
    fills: CheckoutFills,
    specs: SpecSource,
    kept: CheckoutFills,
): CheckoutFills {
    const out: CheckoutFills = { ...fills };
    const assemblyClauses = hydrated.assembly.assemblyClauses ?? {};
    hydrated.assembly.agreements.forEach((entry, i) => {
        const nodeId = String(entry.id ?? i);
        const nodeFills = fills[nodeId] ?? {};
        const keys = new Set([...Object.keys(assemblyClauses), ...registeredClauseKeys(hydrated, entry), ...Object.keys(nodeFills)]);
        let nodeOut = nodeFills;
        for (const clauseKey of keys) {
            if (!specs.get(clauseKey as Hex)) continue;
            const store = (kept[nodeId] ??= {});
            const drawn = (store[clauseKey] ??= withClauseBlinding(specs, clauseKey as Hex, {}));
            if (Object.keys(drawn).length === 0) continue;
            if (nodeOut === nodeFills) nodeOut = { ...nodeFills };
            nodeOut[clauseKey] = { ...drawn, ...nodeFills[clauseKey] };
        }
        if (nodeOut !== nodeFills || nodeId in fills) out[nodeId] = nodeOut;
    });
    return out;
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
