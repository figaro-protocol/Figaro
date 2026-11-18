"use client";

import { useAccount } from "wagmi";

/**
 * useCompositionActions — the ONE interface→handler dispatch seam for the fifth
 * noun (composition).
 *
 * The checkout surface is fully open-world: it discovers WHICH orders compose an
 * on-network contract by reading `block.design.composes` off the clause spec, renders
 * each composition's `block.runtime.fields` generically (one form, no interface name),
 * and hands the collected `{ interface, fieldValues }` here. This hook is the
 * single place a standard interface NAME maps to the concrete call — a
 * spec-routed dispatch, never a clause-id switch scattered through the UI.
 *
 * A handler added here carries the concrete `{ address, abi }` (the env-looked-up
 * deployment address and the standard's ABI) and the CALL-SHAPE (which function,
 * in what arg order) — integration code. The call-shape is the interface STANDARD; the trade-level coordination
 * is the ASSEMBLY. A never-seen clause still renders and collects its fields with
 * zero code here; INVOKING a contract needs a handler here — invocation is
 * per-standard-interface (code), not a config artifact.
 *
 * No handler is registered, so every interface refuses, naming itself. On a
 * checkout walk (`executeAssemblyCheckout`), an unbound sub-order whose clause
 * declares `block.design.composes` with runtime fields reaches this step
 * while the walk builds the orders, before the first signature, and the walk
 * stops there: no order of the checkout is signed while a declared
 * composition has nothing to invoke it. The step is kept as the place a
 * handler lands (`tests/lib/checkoutCompositionStep.test.tsx`).
 */

/** Context the checkout walk hands each composition invocation. All fields are
 *  DERIVED (order/process/currency) except `fieldValues` (the buyer's
 *  `block.runtime.fields` inputs). */
export interface ComposeContext {
    /** The standard interface named by the clause's `block.design.composes.interface`. */
    interface: string;
    /** The buyer's `block.runtime.fields` values for the composing clause, by field name. */
    fieldValues: Record<string, unknown>;
    processId: `0x${string}`;
    currency: `0x${string}`;
    tokenDecimals: number;
}



export function useCompositionActions() {
    const { address } = useAccount();

    const compose = async (ctx: ComposeContext): Promise<void> => {
        switch (ctx.interface) {
            default:
                throw new Error(
                    `No runtime handler for composition interface "${ctx.interface}". ` +
                    "A novel interface needs a registered handler here.",
                );
        }
    };

    return { compose, available: !!address };
}
