import { create } from "zustand";
import { OrderState } from "@figaro/core";

// Re-export so existing consumers keep working
export { OrderState };

// ---------------------------------------------------------------------------
// Domain types (exported for use in hooks, components, tests)
// ---------------------------------------------------------------------------

export interface Order {
    /** bytes32 commitment hash (content-addressed from EIP-712 struct). */
    id: string;
    processId: string; // bytes32 from contract
    buyer: string;
    seller: string;
    currency?: string;       // ERC-20 token address (from OrderCommitted event)
    agreementHash?: string;  // bytes32 — opaque off-chain agreement ref
    cumulativeValue: bigint;
    payment: bigint;
    state: OrderState;
    /** Computed: 2 × cumulativeValue. Not emitted in V5 events. */
    sellerBond: bigint;
    /** Computed: 2 × payment. Not emitted in V5 events. */
    buyerBond: bigint;
    /** Salt from the commitment (for full reconstruction at resolution). */
    salt: bigint;
    /** Deadline from the commitment (for full reconstruction at resolution). */
    deadline: bigint;
    /** Block number when OrderCommitted was mined (real mode). Date.now() in mock mode. */
    blockNumber?: number;
    timestamp?: number; // kept for mock-mode ordering; in real mode blockNumber is used
    /** Event-derived: block.timestamp from OrderResolved (seconds). */
    resolvedAt?: number;
}

export interface ProcessInfo {
    id: string; // bytes32
    orderHashes: string[];
    buyer: string;
    totalValue: bigint;
    totalPayment: bigint;
    resolved: boolean;
    createdAt: number;
}

// ---------------------------------------------------------------------------
// generateProcessId — standalone helper (used by mock path in useFigaroActions)
// ---------------------------------------------------------------------------

export function generateProcessId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString();
    return `0x${Array.from(
        new TextEncoder().encode(`process-${timestamp}-${random}`)
    )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 64)}`; // 32 bytes = 64 hex chars
}

// ---------------------------------------------------------------------------
// Zustand store — UI-only ephemeral state.
// On-chain order state lives in useProcessOrders (event-based).
// Contract and token addresses come from build-time env vars (CONTRACTS in
// lib/core/contracts.ts) — there is no factory; the singleton addresses are
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

