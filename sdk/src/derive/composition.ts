/**
 * @figaro-protocol/sdk/derive — Composition projections (the fifth-noun trail)
 *
 * Graphs read from the on-network contracts a process record touches — a swap
 * venue, a multisender, a forum. The projection is PARAMETERIZED over venues:
 * the caller supplies already-parsed venue events with each venue's address
 * and ABI resolved from the deployment record or from clause fields; nothing
 * here imports or bundles a venue list, and a venue this code has never seen
 * feeds the same shape. (The swap coordinator deliberately emits nothing of
 * its own — the composed venue's events, e.g. a pool's Swap plus the ERC-20
 * transfers, ARE the trail.)
 *
 * The worked instance is the value-flow graph: nodes are tokens (the
 * denominations the settlement graph observed, plus caller-supplied utility-
 * token pins read via `readUtilityTokenPin`, plus any tokens the venue legs
 * touch), edges are per-denomination settlements and per-venue swap legs.
 * Each edge names its own truth boundary: a settlement edge is
 * protocol-enforced, a venue edge is composition-derived — true per the
 * composed contract's rules, outside the kernel's guarantees. The same
 * `VenueEvent` parameterization serves the multisender (fiscal-routing) and
 * forum-venue (rulings) overlays with their own payload types.
 *
 * Pure folds, no I/O.
 */

import type { Hex, Address } from "../types.js";
import { OrderState } from "../types.js";
import type { SettlementGraph } from "./graphs.js";

// ── The venue parameterization ──────────────────────────────────────────────

/** One event from a composed venue, parsed by the CALLER against the venue's
 *  own ABI (resolved from the deployment record or a clause field). The
 *  projection sees only this shape — venues are discovered, never bundled. */
export interface VenueEvent<TPayload> {
    /** The composed contract that emitted the event. */
    venue: Address;
    blockNumber: number;
    transactionHash: Hex | null;
    payload: TPayload;
}

/** A swap venue's leg: value leaving one denomination and entering another. */
export interface SwapLeg {
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    amountOut: bigint;
}

// ── Value-flow graph ────────────────────────────────────────────────────────

/** A token node: one denomination and what the record shows flowing in it. */
export interface ValueFlowNode {
    token: Address;
    /** Processes denominated in this token (every commitment signs its
     *  `currency`; a process is monotoken). */
    processCount: number;
    /** Resolved orders settled in this denomination. */
    settledOrderCount: number;
    /** Total value transferred at resolution in this denomination — the sum
     *  of resolved orders' payments (net transfer == payment). */
    settledVolume: bigint;
    /** True when the caller found a designer's utility-token pin for this
     *  token (via `readUtilityTokenPin` over its loaded templates). */
    pinned: boolean;
}

/** A value-flow edge, discriminated by its truth boundary: settlement edges
 *  aggregate the kernel's own per-denomination flow; venue edges aggregate a
 *  composed swap venue's legs between two denominations. */
export type ValueFlowEdge =
    | {
          basis: "protocol-enforced";
          /** The denomination this settlement flow moves in. */
          token: Address;
          settledOrderCount: number;
          settledVolume: bigint;
      }
    | {
          basis: "composition-derived";
          venue: Address;
          tokenIn: Address;
          tokenOut: Address;
          legCount: number;
          volumeIn: bigint;
          volumeOut: bigint;
      };

export interface ValueFlowGraph {
    boundary: "composition-derived";
    nodes: ValueFlowNode[];
    edges: ValueFlowEdge[];
}

/** Case-insensitive address key (addresses arrive checksummed or not). */
function addressKey(address: Address): string {
    return address.toLowerCase();
}

/**
 * Project the value-flow graph: fold the settlement graph's per-denomination
 * flows with caller-supplied swap-venue legs and utility-token pins. Nodes
 * cover every token any input names; a token with no settlements and no legs
 * but a pin still appears (the pin is a registered fact), with zero flow.
 */
export function projectValueFlow(
    settlement: SettlementGraph,
    swaps: readonly VenueEvent<SwapLeg>[] = [],
    pins: readonly Address[] = [],
): ValueFlowGraph {
    const nodes = new Map<string, ValueFlowNode>();
    const node = (token: Address): ValueFlowNode => {
        const key = addressKey(token);
        let n = nodes.get(key);
        if (!n) {
            n = { token, processCount: 0, settledOrderCount: 0, settledVolume: 0n, pinned: false };
            nodes.set(key, n);
        }
        return n;
    };

    // Settlement flows per denomination (protocol-enforced).
    const settlementEdges = new Map<string, ValueFlowEdge & { basis: "protocol-enforced" }>();
    for (const chain of settlement.chains.values()) {
        const n = node(chain.currency);
        n.processCount += 1;
        for (const order of chain.orders) {
            if (order.state !== OrderState.Resolved) continue;
            n.settledOrderCount += 1;
            n.settledVolume += order.payment;
            const key = addressKey(chain.currency);
            let edge = settlementEdges.get(key);
            if (!edge) {
                edge = { basis: "protocol-enforced", token: chain.currency, settledOrderCount: 0, settledVolume: 0n };
                settlementEdges.set(key, edge);
            }
            edge.settledOrderCount += 1;
            edge.settledVolume += order.payment;
        }
    }

    // Swap legs per (venue, tokenIn, tokenOut) (composition-derived).
    const venueEdges = new Map<string, ValueFlowEdge & { basis: "composition-derived" }>();
    for (const { venue, payload } of swaps) {
        node(payload.tokenIn);
        node(payload.tokenOut);
        const key = `${addressKey(venue)}|${addressKey(payload.tokenIn)}|${addressKey(payload.tokenOut)}`;
        let edge = venueEdges.get(key);
        if (!edge) {
            edge = {
                basis: "composition-derived",
                venue,
                tokenIn: payload.tokenIn,
                tokenOut: payload.tokenOut,
                legCount: 0,
                volumeIn: 0n,
                volumeOut: 0n,
            };
            venueEdges.set(key, edge);
        }
        edge.legCount += 1;
        edge.volumeIn += payload.amountIn;
        edge.volumeOut += payload.amountOut;
    }

    for (const pin of pins) {
        node(pin).pinned = true;
    }

    return {
        boundary: "composition-derived",
        nodes: [...nodes.values()],
        edges: [...settlementEdges.values(), ...venueEdges.values()],
    };
}
