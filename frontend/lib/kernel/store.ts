import { create } from "zustand";
import { calculateBonds, OrderState, type Order as SdkOrder } from "@figaro-protocol/sdk";

// Re-export so existing consumers keep working
export { OrderState };

// ---------------------------------------------------------------------------
// Domain types (exported for use in hooks, components, tests)
// ---------------------------------------------------------------------------

// The UI projection of the SDK `Order` (@figaro-protocol/sdk): same field names,
// deliberately looser types (plain strings; optionals for designer drafts)
// plus UI-derived fields (bonds, topology edges, resolvedAt).
export interface Order {
    /** bytes32 commitment hash (content-addressed from EIP-712 struct). */
    orderHash: string;
    processId: string; // bytes32 from contract
    buyer: string;
    seller: string;
    currency?: string;       // ERC-20 token address (from OrderCommitted event)
    agreementHash?: string;  // bytes32 — opaque off-chain agreement ref
    /** Design-time first-class topology edges: this order's parent order hashes — the
     *  data of its topology clause. Set by the designer when edges
     *  are drawn, so topology is read straight from the order and never
     *  recovered by loading its agreement. Undefined for runtime/chain orders,
     *  whose topology lives in the committed agreement's topology section
     *  (reconstructed off-chain by the indexer). */
    parentOrderHashes?: string[];
    cumulativeValue: bigint;
    payment: bigint;
    state: OrderState;
    /** Computed: 2 × cumulativeValue. Not carried directly on the kernel event. */
    sellerBond: bigint;
    /** Computed: 2 × payment. Not carried directly on the kernel event. */
    buyerBond: bigint;
    /** Salt from the commitment (for full reconstruction at resolution). */
    salt: bigint;
    /** Deadline from the commitment (for full reconstruction at resolution). */
    deadline: bigint;
    /** Block number when OrderCommitted was mined. */
    blockNumber?: number;
    /** Event-derived: block.timestamp from OrderResolved (seconds). */
    resolvedAt?: number;
}

/**
 * Project the SDK fold's `Order` (what `reconstruct`/`Topology` build from
 * OrderCommitted/OrderResolved) into the UI shape above — the ONE mapping
 * every log-fed hook shares. Bonds are derived by the SDK's kernel math
 * (never read from args that don't exist, never a re-implemented 2× rule);
 * the fold-carried payout fields stay on the SDK order.
 */
export function orderFromSdk(order: SdkOrder): Order {
    // Destructured, NOT spread — calculateBonds also returns totalLocked,
    // which must not ride along as an extra bigint field on the Order.
    const { sellerBond, buyerBond } = calculateBonds(order.cumulativeValue, order.payment);
    return {
        orderHash: order.orderHash,
        processId: order.processId,
        buyer: order.buyer,
        seller: order.seller,
        currency: order.currency,
        agreementHash: order.agreementHash,
        payment: order.payment,
        cumulativeValue: order.cumulativeValue,
        state: order.state,
        sellerBond,
        buyerBond,
        salt: order.salt,
        deadline: order.deadline,
        blockNumber: order.blockNumber,
    };
}

interface ProcessInfo {
    id: string; // bytes32
    orderHashes: string[];
    buyer: string;
    totalValue: bigint;
    totalPayment: bigint;
    resolved: boolean;
    createdAt: number;
}

// ---------------------------------------------------------------------------
// Zustand store — UI-only ephemeral state.
// On-chain order state lives in useProcessOrders (event-based).
// Contract and token addresses come from build-time env vars (CONTRACTS in
// lib/kernel/contracts.ts) — there is no factory; the singleton addresses are
// baked in at build time and must not be stored here.
// ---------------------------------------------------------------------------

interface OrderStore {
    /** The processId currently displayed in the graph. Set after firstOrder succeeds
     *  (receipt parser) or when the user picks one from ProcessList.  Completely
     *  independent of the create-order form — the form always creates a NEW process. */
    viewedProcessId: string | null;

    /** Incremented whenever a confirmed TX should trigger a fresh getLogs re-scan
     *  in useProcessOrders. Lets any component force a reload without a processId change. */
    processReloadKey: number;

    setViewedProcessId: (id: string | null) => void;
    bumpProcessReload: () => void;
    clear: () => void;
}

export const useOrderStore = create<OrderStore>()((set) => ({
    viewedProcessId: null,
    processReloadKey: 0,
    setViewedProcessId: (id) => set({ viewedProcessId: id }),
    bumpProcessReload: () => set((s) => ({ processReloadKey: s.processReloadKey + 1 })),
    clear: () => set({ viewedProcessId: null }),
}));

