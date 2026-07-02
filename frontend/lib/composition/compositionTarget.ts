/**
 * compositionTarget — the concrete `{ address, abi }` to invoke for a
 * composition, keyed by the standard interface a clause names
 * (`block.composes.interface`).
 *
 * A composition is invocable only for interfaces the runtime has a HANDLER for
 * (`useCompositionActions`): invoking an on-network contract needs integration
 * code — which function is the compose action, how `block.fields` map to its
 * args — which no ABI alone supplies. So this is a small registry of KNOWN
 * standard interfaces: the address is env-looked-up (a deployment fact), the ABI
 * is the standard's own shape (bundled beside the interface's handler). Adding a
 * standard interface is a new row here + a new handler + a new Solidity interface
 * — code, not config. A never-seen interface returns null (no handler, no call).
 */

import type { Abi } from "viem";

export interface CompositionTarget {
    address: `0x${string}`;
    abi: Abi;
}

/** Known standard interfaces, keyed by `block.composes.interface`. Currently
 *  EMPTY: the descending auction (the first tenant) was abandoned 2026-07-02;
 *  the next expected row is the emissions cluster's `carbon-aggregator`. */
const STANDARD_INTERFACES: Record<string, { address: () => `0x${string}` | null; abi: Abi }> = {};

/** The `{ address, abi }` to invoke for a composition interface, or null when
 *  the interface is unknown or its instance address is unavailable. */
export function compositionTarget(interfaceName: string): CompositionTarget | null {
    const std = STANDARD_INTERFACES[interfaceName];
    const address = std?.address() ?? null;
    if (!std || !address) return null;
    return { address, abi: std.abi };
}
