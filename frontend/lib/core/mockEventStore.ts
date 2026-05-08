/**
 * mockEventStore — module-level singleton for E2E mock mode.
 *
 * In mock mode (?e2e=mock) there is no real chain, so we simulate the on-chain
 * event stream with a simple in-memory pub/sub store.  `useFigaroActions` writes
 * to it via `mockEmitOrder`; `useProcessOrders` subscribes and re-renders.
 *
 * Live kernel: orders are Active at commit time (no Pending state, no accept/cancel).
 * No internal ledger (no credits/withdraw).
 */

import { Order, OrderState } from "./store";

type Listener = (orders: Order[]) => void;

let _orders: Order[] = [];
const _listeners = new Set<Listener>();

function notify(): void {
    _listeners.forEach((fn) => fn([..._orders]));
}

/** Add or replace an order by id.  Idempotent on duplicate ids. */
export function mockEmitOrder(order: Order): void {
    const idx = _orders.findIndex((o) => o.id === order.id);
    if (idx >= 0) {
        _orders = [..._orders.slice(0, idx), order, ..._orders.slice(idx + 1)];
    } else {
        _orders = [..._orders, order];
    }
    notify();
}

/**
 * resolveProcess mock: all Active orders in the process → Resolved.
 * Returns the ids of orders that were resolved.
 */
export function mockResolveProcess(processId: string, orderHashes?: string[]): string[] {
    const resolved: string[] = [];
    _orders = _orders.map((o) => {
        const resolveAll = orderHashes === undefined || orderHashes.length === 0;
        const inScope = o.processId === processId &&
            o.state === OrderState.Active &&
            (resolveAll || orderHashes.includes(o.id));
        if (inScope) {
            resolved.push(o.id);
            return { ...o, state: OrderState.Resolved };
        }
        return o;
    });
    notify();
    return resolved;
}

/**
 * Subscribe to the entire order list.
 * The listener is called immediately with the current snapshot, then on every
 * subsequent mutation.
 * Returns an unsubscribe function.
 */
export function mockSubscribe(fn: Listener): () => void {
    _listeners.add(fn);
    fn([..._orders]); // immediate snapshot
    return () => _listeners.delete(fn);
}

/** Return the current order list (snapshot, not live). */
export function mockGetOrders(): Order[] {
    return [..._orders];
}

/** Reset all state. */
export function mockClear(): void {
    _orders = [];
    notify();
}
