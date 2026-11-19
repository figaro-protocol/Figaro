/**
 * syntheticDesignStore — localStorage persistence for the designer canvas.
 * Nothing here is keyed by a wallet: a draft belongs to the browser.
 *
 * Two layers:
 *   1. Autosaves — the canvas writes its whole state on every change, under
 *      the key of the design it holds, so a reload or a back navigation loses
 *      no work on either designer route:
 *        - the new design (/assemblies/designer/new):
 *          figaro:designer:autosave:new
 *        - a named draft (/assemblies/designer/edit?slug=<slug>):
 *          figaro:designer:autosave:drafts:<slug>
 *      Each design's unsaved work is kept apart, so opening one never writes
 *      over another's.
 *   2. Named drafts — what Save, Review or a fork writes. Listed on the
 *      designer landing page; keyed by slug under figaro:designer:drafts:<slug>;
 *      an index lives at figaro:designer:drafts.
 *
 * A draft opens its autosave when that autosave's `updatedAt` is later than
 * the saved draft's, and the saved draft otherwise (`resumeNamedDraft`).
 * `updatedAt` is this browser's clock at the write: it orders this browser's
 * own copies of one draft and is never part of what a party signs.
 */

import type { Order } from "@/lib/core/store";
import {
    readJsonStorage,
    readStorage,
    removeStorage,
    writeJsonStorage,
    writeStorage,
} from "@/lib/shared/storage";

const NEW_DESIGN_AUTOSAVE_KEY = "figaro:designer:autosave:new";
const DRAFT_AUTOSAVE_PREFIX = "figaro:designer:autosave:drafts:";
/** A key this store never writes: a value a browser holds under it is the
 *  new design's autosave, read once by `loadAutosave(null)` and moved to the
 *  new design's key. */
const UNOWNED_AUTOSAVE_KEY = "figaro:designer:current";
const DRAFT_PREFIX = "figaro:designer:drafts:";
const DRAFT_INDEX_KEY = "figaro:designer:drafts";

// ── Serialization (bigint round-trip) ───────────────────────────────────────

interface SerializedOrder {
    orderHash: string;
    processId: string;
    buyer: string;
    seller: string;
    token?: string;
    checkoutHash?: string;
    payment: string;
    state: number;
    salt: string;
    commitDeadline: string;
    blockNumber?: number;
    timestamp?: number;
    resolvedAt?: number;
}

function serializeOrder(o: Order): SerializedOrder {
    // Drafts are value-free: runningTotal/sellerBond/buyerBond are always
    // 0n on a synthetic Order and are NOT persisted. Destructured OUT (not
    // spread through) so the persisted draft carries no value field at all —
    // writeJsonStorage would otherwise write each bigint as its decimal string.
    const { runningTotal: _cv, sellerBond: _sb, buyerBond: _bb, ...rest } = o;
    return {
        ...rest,
        payment: o.payment.toString(),
        salt: o.salt.toString(),
        commitDeadline: o.commitDeadline.toString(),
    };
}

function deserializeOrder(s: SerializedOrder): Order {
    return {
        ...s,
        payment: BigInt(s.payment),
        salt: BigInt(s.salt),
        commitDeadline: BigInt(s.commitDeadline),
        // Value-free draft: the shared Order shape requires the fields. Also
        // overwrites the persisted strings in pre-cleanup drafts.
        runningTotal: 0n,
        sellerBond: 0n,
        buyerBond: 0n,
    };
}

// ── Public types ────────────────────────────────────────────────────────────

/**
 * `DesignSnapshot` is the in-memory shape of the designer canvas state.
 *
 * Lifecycle (these three terms refer to the same underlying shape, not
 * three different types):
 *  - **autosave** — the canvas's unsaved state, written by `saveAutosave`
 *    under its owner's key: the new design, or the named draft it opened.
 *  - **named draft** — a snapshot the user explicitly "Save"d, stored by
 *    slug via `saveNamedDraft`.
 *  - **published `ProcessDesign`** (`lib/protocol/useProcessRegistry`)
 *    — the IPFS-pinned, published version: one agreement per order, each
 *    binding a registered agreement by key. `assemblyToDraft`
 *    re-hydrates it (with its agreements) back into a `DesignSnapshot` for
 *    the editor.
 *
 * No "snapshot vs draft vs assembly" type duality — same shape, three
 * persistence states.
 */
export interface DesignSnapshot {
    /** URL-safe identifier; the user picks this when saving a named draft. */
    slug: string;
    /** Editorial name — the designer's own words (free-form prose, NOT a
     *  taxonomy). Carried into the assembly but EXCLUDED from the
     *  content hash, so the slug stays composition-derived. Empty = unnamed
     *  (display falls back to the slug). */
    name: string;
    /** Editorial one-line gloss; optional. Hash-excluded, like `name`. */
    summary?: string;
    /** Editorial long-form description; optional. Hash-excluded, like `name`. */
    description?: string;
    /** Synthetic process id this design lives under. */
    processId: string;
    /** Counter for generating new order ids — preserved across saves. */
    nextOrderIndex: number;
    /** Counter for generating placeholder seller addresses. */
    nextSellerIndex: number;
    /** All orders in the design. */
    orders: Order[];
    /** Per-order clause selection — keyed by order id, then clause key → the
     *  composed values (design.fills clauses only — consent's affix; other
     *  clauses carry `{}`). Drives the assembly's
     *  per-order `clauses`; the build strips general values regardless. */
    clausesByOrderId?: Record<string, Record<string, Record<string, unknown>>>;
    /** Per-order REGISTERED agreement — keyed by order id, the
     *  `AgreementRegistry` key the agreement binds as is. An order named
     *  here composes no clauses of its own (`clausesByOrderId`); the build
     *  refuses an agreement that does both. */
    registeredByOrderId?: Record<string, `0x${string}`>;
    /** ASSEMBLY-SCOPED composition — clauses declaring
     *  `design.scope: "assembly"`, composed once for the whole design
     *  (clause key → the designer's design.fills values; other clauses `{}`).
     *  Drives the assembly's `assemblyClauses`. */
    assemblyClauses?: Record<string, Record<string, unknown>>;
    /** Unix ms. */
    createdAt: number;
    /** Unix ms, this browser's clock at the write. Decides whether a draft
     *  opens its autosave or its saved copy (`resumeNamedDraft`). */
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

function serializeSnapshot(snap: DesignSnapshot): SerializedSnapshot {
    return { ...snap, orders: snap.orders.map(serializeOrder) };
}

function deserializeSnapshot(s: SerializedSnapshot): DesignSnapshot {
    return { ...s, orders: s.orders.map(deserializeOrder) };
}

/** Whether two snapshots hold the same design: every field but the slug and
 *  the two timestamps, an absent map read as an empty one. */
function sameDesign(a: DesignSnapshot, b: DesignSnapshot): boolean {
    const content = (s: DesignSnapshot) => {
        const serialized = serializeSnapshot(s);
        return {
            name: serialized.name,
            summary: serialized.summary ?? "",
            description: serialized.description ?? "",
            processId: serialized.processId,
            nextOrderIndex: serialized.nextOrderIndex,
            nextSellerIndex: serialized.nextSellerIndex,
            orders: serialized.orders,
            clausesByOrderId: serialized.clausesByOrderId ?? {},
            registeredByOrderId: serialized.registeredByOrderId ?? {},
            assemblyClauses: serialized.assemblyClauses ?? {},
        };
    };
    // Keys sorted at every depth, so the order fields were written in does not count.
    const canonical = (v: unknown) => JSON.stringify(v, (_k, val: unknown) =>
        val && typeof val === "object" && !Array.isArray(val)
            ? Object.fromEntries(Object.entries(val).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))
            : val);
    return canonical(content(a)) === canonical(content(b));
}

// ── Autosave API ────────────────────────────────────────────────────────────

/** Whose unsaved work an autosave holds: the new design (`null`) or the
 *  named draft with this slug. */
export type AutosaveOwner = string | null;

function autosaveKey(owner: AutosaveOwner): string {
    return owner === null ? NEW_DESIGN_AUTOSAVE_KEY : `${DRAFT_AUTOSAVE_PREFIX}${owner}`;
}

export function saveAutosave(owner: AutosaveOwner, snap: DesignSnapshot): void {
    writeJsonStorage(autosaveKey(owner), serializeSnapshot(snap));
}

/** The owner's autosave. For the new design, a value held under
 *  `figaro:designer:current` is moved first to the new design's key when that
 *  key holds nothing, and `figaro:designer:current` is removed. */
export function loadAutosave(owner: AutosaveOwner): DesignSnapshot | null {
    if (owner === null) {
        const unowned = readStorage(UNOWNED_AUTOSAVE_KEY);
        if (unowned !== null) {
            if (readStorage(NEW_DESIGN_AUTOSAVE_KEY) === null) writeStorage(NEW_DESIGN_AUTOSAVE_KEY, unowned);
            removeStorage(UNOWNED_AUTOSAVE_KEY);
        }
    }
    const data = readJsonStorage<SerializedSnapshot | null>(autosaveKey(owner), null);
    return data ? deserializeSnapshot(data) : null;
}

export function clearAutosave(owner: AutosaveOwner): void {
    removeStorage(autosaveKey(owner));
}

/** Whether `snap` holds the same design as `saved` (the slug and the
 *  timestamps aside). The canvas writes no autosave for a design its saved
 *  draft already holds. */
export function matchesSaved(snap: DesignSnapshot, saved: DesignSnapshot | null): boolean {
    return saved !== null && sameDesign(snap, saved);
}

/** A named draft as the edit route opens it: `open` is its autosave when that
 *  autosave was written later than the saved draft, else the saved draft.
 *  Null when no draft by that slug is saved in this browser. */
export function resumeNamedDraft(slug: string): { saved: DesignSnapshot; open: DesignSnapshot } | null {
    const saved = loadNamedDraft(slug);
    if (!saved) return null;
    const autosave = loadAutosave(slug);
    return { saved, open: autosave && autosave.updatedAt > saved.updatedAt ? autosave : saved };
}

// ── Named drafts API ────────────────────────────────────────────────────────

function readIndex(): DraftIndexEntry[] {
    return readJsonStorage<DraftIndexEntry[] | null>(DRAFT_INDEX_KEY, null) ?? [];
}

function writeIndex(entries: DraftIndexEntry[]): void {
    writeJsonStorage(DRAFT_INDEX_KEY, entries);
}

export function saveNamedDraft(snap: DesignSnapshot): void {
    writeJsonStorage(`${DRAFT_PREFIX}${snap.slug}`, serializeSnapshot(snap));
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
    const data = readJsonStorage<SerializedSnapshot | null>(`${DRAFT_PREFIX}${slug}`, null);
    return data ? deserializeSnapshot(data) : null;
}

export function listNamedDrafts(): DraftIndexEntry[] {
    return readIndex();
}

/** Remove a named draft, its index entry and its autosave. */
export function deleteNamedDraft(slug: string): void {
    removeStorage(`${DRAFT_PREFIX}${slug}`);
    clearAutosave(slug);
    writeIndex(readIndex().filter((e) => e.slug !== slug));
}

/** After a draft is published: remove the draft and its autosave, and the
 *  new design's autosave when it holds the same design (a Review from
 *  /assemblies/designer/new leaves the work there too). A new design's
 *  autosave of other work stays. */
export function discardPublishedDraft(published: DesignSnapshot): void {
    deleteNamedDraft(published.slug);
    const newDesign = loadAutosave(null);
    if (newDesign && sameDesign(newDesign, published)) clearAutosave(null);
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
