"use client";

import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { activeChain } from "@/lib/shared/chains";
import { compositionTarget } from "@/lib/composition/compositionTarget";
import { parseToken } from "@/lib/shared/utils";

/**
 * useCompositionActions — the ONE interface→handler dispatch seam for the fifth
 * noun (composition).
 *
 * The checkout surface is fully open-world: it discovers WHICH orders compose an
 * on-network contract by reading `block.composes` off the clause spec, renders
 * each composition's `block.fields` generically (one form, no interface name),
 * and hands the collected `{ interface, fieldValues }` here. This hook is the
 * single place a standard interface NAME maps to the concrete call — a
 * spec-routed dispatch, never a clause-id switch scattered through the UI.
 *
 * The concrete `{ address, abi }` comes from `compositionTarget` (env address +
 * the standard's ABI), so this hook carries no bundled contract handle. What
 * stays here is the CALL-SHAPE (which function, in what arg order) — integration
 * code. The call-shape is the interface STANDARD; the trade-level coordination
 * is the ASSEMBLY. A never-seen clause still renders and collects its fields with
 * zero code here; INVOKING a contract needs a handler here — invocation is
 * per-standard-interface (code), not a config artifact.
 */

/** Context the checkout walk hands each composition invocation. All fields are
 *  DERIVED (order/process/currency) except `fieldValues` (the buyer's
 *  `block.fields` inputs). */
export interface ComposeContext {
    /** The standard interface named by the clause's `block.composes.interface`. */
    interface: string;
    /** The buyer's `block.fields` values for the composing clause, by field name. */
    fieldValues: Record<string, unknown>;
    processId: `0x${string}`;
    currency: `0x${string}`;
    tokenDecimals: number;
}



export function useCompositionActions() {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const { writeContractAsync } = useWriteContract();

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
