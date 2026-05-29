/**
 * syntheticDesignStore — localStorage persistence for the designer canvas.
 *
 * Two layers:
 *   1. Current session — autosaved on every change so refresh doesn't lose
 *      work. Single key: figaro:designer:current
 *   2. Named drafts — the user explicitly snapshots the current session
 *      with a name. Listed on the designer landing page; can be loaded back
 *      via the canvas. Keyed by slug under figaro:designer:drafts:<slug>;
 *      an index lives at figaro:designer:drafts.
 *
 * Synthetic agreements (saved by syntheticProcess via saveAgreement) live
 * separately under figaro:agreement:<hash> and are NOT garbage-collected
 * here — they're keyed by content-hash so duplication is cheap, and the
 * topology / lens lookups assume they're available.
 */

import type { Order } from "@/lib/core/store";

const CURRENT_KEY = "figaro:designer:current";
const DRAFT_PREFIX = "figaro:designer:drafts:";
const DRAFT_INDEX_KEY = "figaro:designer:drafts";

// ── Serialization (bigint round-trip) ───────────────────────────────────────

interface SerializedOrder {
    id: string;
    processId: string;
    buyer: string;
    seller: string;
    currency?: string;
    agreementHash?: string;
    cumulativeValue: string;
    payment: string;
    state: number;
    sellerBond: string;
    buyerBond: string;
    salt: string;
    deadline: string;
    blockNumber?: number;
    timestamp?: number;
    resolvedAt?: number;
}

function serializeOrder(o: Order): SerializedOrder {
    return {
        ...o,
        cumulativeValue: o.cumulativeValue.toString(),
        payment: o.payment.toString(),
        sellerBond: o.sellerBond.toString(),
        buyerBond: o.buyerBond.toString(),
        salt: o.salt.toString(),
        deadline: o.deadline.toString(),
    };
}

function deserializeOrder(s: SerializedOrder): Order {
    return {
        ...s,
        cumulativeValue: BigInt(s.cumulativeValue),
        payment: BigInt(s.payment),
        sellerBond: BigInt(s.sellerBond),
        buyerBond: BigInt(s.buyerBond),
        salt: BigInt(s.salt),
        deadline: BigInt(s.deadline),
    };
}

// ── Public types ────────────────────────────────────────────────────────────

/**
 * `DesignSnapshot` is the in-memory shape of the designer canvas state.
 *
 * Lifecycle (these three terms refer to the same underlying shape, not
 * three different types):
 *  - **autosave session** — the current canvas, written to a single
 *    localStorage key by `saveCurrentSession`. Last edit wins; not
 *    addressable by slug.
 *  - **named draft** — a snapshot the user explicitly "Save"d, stored by
 *    slug via `saveNamedDraft`. Survives across canvas resets.
 *  - **AssemblyDocument** (`lib/mechanisms/useAssemblyRegistry`) — the
 *    IPFS-pinned, published version. Structurally a superset of
 *    `DesignSnapshot` (carries inlined agreement bodies; bigint fields
 *    serialized as decimal strings). `assemblyDocumentToDraft` re-hydrates it
 *    back into a `DesignSnapshot` for the editor.
 *
 * No "snapshot vs draft vs manifest" type duality — same shape, three
 * persistence states.
 */
export interface DesignSnapshot {
    /** URL-safe identifier; the user picks this when saving a named draft. */
    slug: string;
    /** Human-readable name. */
    name: string;
    /** Synthetic process id this design lives under. */
    processId: string;
    /** Counter for generating new order ids — preserved across saves. */
    nextOrderIndex: number;
    /** Counter for generating placeholder seller addresses. */
    nextSellerIndex: number;
    /** All orders in the design. */
    orders: Order[];
    /** Unix ms. */
    createdAt: number;
    /** Unix ms. */
    updatedAt: number;
}

export interface DraftIndexEntry {
    slug: string;
    name: string;
    updatedAt: number;
    orderCount: number;
}

// ── Internal helpers ────────────────────────────────────────────────────────

interface SerializedSnapshot extends Omit<DesignSnapshot, "orders"> {
    orders: SerializedOrder[];
}

function canStore(): boolean {
    return typeof window !== "undefined" && !!window.localStorage;
}

function serializeSnapshot(snap: DesignSnapshot): SerializedSnapshot {
    return { ...snap, orders: snap.orders.map(serializeOrder) };
}

function deserializeSnapshot(s: SerializedSnapshot): DesignSnapshot {
    return { ...s, orders: s.orders.map(deserializeOrder) };
}

function readJson<T>(key: string): T | null {
    if (!canStore()) return null;
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function writeJson(key: string, value: unknown): void {
    if (!canStore()) return;
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage quota exceeded or serialization failed — silently drop;
        // designer remains functional in-memory.
    }
}

function removeKey(key: string): void {
    if (!canStore()) return;
    try {
        window.localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

// ── Current-session API ─────────────────────────────────────────────────────

export function saveCurrentSession(snap: DesignSnapshot): void {
    writeJson(CURRENT_KEY, serializeSnapshot(snap));
}

export function loadCurrentSession(): DesignSnapshot | null {
    const data = readJson<SerializedSnapshot>(CURRENT_KEY);
    return data ? deserializeSnapshot(data) : null;
}

export function clearCurrentSession(): void {
    removeKey(CURRENT_KEY);
}

// ── Named drafts API ────────────────────────────────────────────────────────

function readIndex(): DraftIndexEntry[] {
    return readJson<DraftIndexEntry[]>(DRAFT_INDEX_KEY) ?? [];
}

function writeIndex(entries: DraftIndexEntry[]): void {
    writeJson(DRAFT_INDEX_KEY, entries);
}

export function saveNamedDraft(snap: DesignSnapshot): void {
    writeJson(`${DRAFT_PREFIX}${snap.slug}`, serializeSnapshot(snap));
    const index = readIndex().filter((e) => e.slug !== snap.slug);
    index.push({
        slug: snap.slug,
        name: snap.name,
        updatedAt: snap.updatedAt,
        orderCount: snap.orders.length,
    });
    index.sort((a, b) => b.updatedAt - a.updatedAt);
    writeIndex(index);
}

export function loadNamedDraft(slug: string): DesignSnapshot | null {
    const data = readJson<SerializedSnapshot>(`${DRAFT_PREFIX}${slug}`);
    return data ? deserializeSnapshot(data) : null;
}

export function listNamedDrafts(): DraftIndexEntry[] {
    return readIndex();
}

export function deleteNamedDraft(slug: string): void {
    removeKey(`${DRAFT_PREFIX}${slug}`);
    writeIndex(readIndex().filter((e) => e.slug !== slug));
}

/**
 * Find a slug that doesn't collide with any existing named draft.
 *
 * Returns `base` if it's free, else appends `-2`, `-3`, … until unique.
 * `excludeSlug` (optional) is treated as "not a collision" — used when
 * renaming the currently-loaded draft (the rename target may equal the
 * current slug, and that's a no-op, not a self-collision).
 *
 * Callers:
 *  - PublishedList / ViewAssembly fork — pass `${slug}-fork` as base.
 *  - DesignerCanvas save/publish — pass `slugify(name)` as base, and
 *    pass the currently-loaded slug as `excludeSlug`.
 */
export function uniqueDraftSlug(base: string, excludeSlug?: string | null): string {
    const taken = new Set(
        listNamedDrafts()
            .map((d) => d.slug)
            .filter((s) => s !== excludeSlug),
    );
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
}
