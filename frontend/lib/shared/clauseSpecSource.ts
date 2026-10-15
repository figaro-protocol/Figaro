/**
 * Clause-spec source — the in-memory cache of clause specs, fed ONLY from
 * chain → IPFS.
 *
 * The on-chain `ClauseRegistry.ClauseRegistered` event carries the clause KEY
 * — `keccak256` of the spec's pinned canonical bytes — and a `contentURI`
 * (IPFS) locator. `loadClauseSpec(clauseKey, uri)` fetches the BYTES at that
 * locator, checks they hash to the key, parses them, and caches the spec under
 * the key; every sync read below names a key and resolves against that cache.
 * The spec's own `clauseId` and `version` are its presentation fields — a
 * title and a lineage counter a reader shows — never an identity: two specs
 * with one name are two clauses. There is NO bundled spec set and NO fallback
 * — a spec the chain doesn't point at is simply unknown. The `useClauseSpecs`
 * hook warms the cache at the app boundary (it reads the registry events and
 * loads each `contentURI`), the same way assemblies load.
 *
 * Spec-derived reads (title, article, attestation tier, enum vocabulary, drawer
 * nesting) live here so there is one source and no parallel taxonomy module.
 */

import { parseClauseSpec, type ClauseSpec, type FieldSpec, type EnumFieldSpec, type SpecParseError } from "@figaro-protocol/sdk/clauses";
import type { Hex, ProjectionHints, ProjectionSpecView, SpecSource } from "@figaro-protocol/sdk";
import { parseBlockBinding, type ClauseBlockBinding } from "@/lib/shared/clauseBlockBinding";
import { PROVENANCE_LEAF_KEY, anchorClauseSpec, deriveAnchored, specIsMandatory, type Anchored } from "@figaro-protocol/sdk";
import { keccak256 } from "viem";
import { DEFAULT_IPFS_SERVICE, fetchCappedBinary } from "@/lib/shared/ipfsService";
import { truncateHex } from "@/lib/shared/formatHex";

/** A loaded clause spec: the SDK `ClauseSpec` (content-only — `fields`/`stages`),
 *  its frontend-parsed `block` slice (pure presentation the frontend owns —
 *  `clauseBlockBinding`, parsed off the same verified bytes at load), and the
 *  clause KEY it was loaded under — the hash of those bytes. */
export type ClauseSpecWithBlock = ClauseSpec & { clauseKey: Hex; block?: ClauseBlockBinding };

/** Every map below is keyed by the lower-cased clause key. */
const norm = (clauseKey: string): string => clauseKey.toLowerCase();

/** Only a spec read out of bytes that hashed to its registry key enters: the
 *  cache holds `Anchored` specs, so a load path that skips the check does not
 *  compile. */
const SPEC_CACHE = new Map<string, Anchored<ClauseSpecWithBlock>>();
/** Permanent load failures, keyed like the spec cache by clause key. */
const SPEC_LOAD_ERRORS = new Map<string, string>();

/** clause key → the parent FIELD name it nests under in the drawer, read from the
 *  spec's `block.design.nestsUnder`. Populated as specs load. Drives the drawer's
 *  cross-clause nesting (e.g. a proximity policy renders nested under the
 *  handoff clause's `handoff` array field). Read from the spec; never a hardcoded tree.
 *
 *  `nestsUnder` names a field, and means "this clause REFINES that field" — a
 *  DIFFERENT job from `block.design.article`, which GROUPS co-equal clauses together. Do not
 *  reach for `nestsUnder` to say "these clauses belong together" (that's `article`); the
 *  target must be a STRUCTURED field (enum/array/object) a sub-clause elaborates, never a
 *  scalar. Enforced by scripts/lint-clause-nests-under-a-field.sh. */
const NESTS_UNDER = new Map<string, string>();

/** The registrations whose stake is live (`isLiveRegistration`), keyed like
 *  the spec cache — read from the same `ClauseRegistry` scan the drawer
 *  offers clauses from and replaced whole on every read. The spec cache
 *  itself NEVER filters on it: a committed agreement keeps reading a
 *  withdrawn clause's spec. Only `liveSpecSource().list()`, the set a NEW
 *  template's mandatory fold draws from, holds just these. */
const LIVE_STAKE = new Set<string>();

// ── Loading (chain → IPFS) ───────────────────────────────────────────────────

/**
 * Fetcher hook — URI → the pinned BYTES (or their exact text). The key is the
 * hash of exactly the bytes pinned, so the fetcher hands them over unparsed.
 * Default resolves an `ipfs://` locator through the gateway and fetches it;
 * tests swap in a stub via `setClauseSpecFetcher`.
 */
export type ClauseSpecFetcher = (uri: string) => Promise<Uint8Array | string>;

let activeFetcher: ClauseSpecFetcher = async (uri) => {
    const url = DEFAULT_IPFS_SERVICE.resolveFetchUrl(uri);
    if (!url) throw new Error(`Cannot resolve clause spec URI: ${uri}`);
    // Size-capped fetch (F4): a permissionlessly-registered clause pointing at
    // a multi-GB pin aborts mid-stream instead of OOMing every clause surface —
    // the DoS sibling of the MAX_FIELD_DEPTH parse cap. Byte-exact: a text
    // decode round-trip could change what is hashed.
    const response = await fetchCappedBinary(url);
    if (!response.ok || response.bytes === null) throw new Error(`Failed to fetch clause spec at ${uri}: ${response.status} ${response.statusText}`);
    return response.bytes;
};

/** Replace the default fetcher (test-only). */
export function setClauseSpecFetcher(fetcher: ClauseSpecFetcher): void {
    activeFetcher = fetcher;
}

/** Register a loaded spec into the cache + the derived maps, under its key:
 *  two specs that share a name are two cache entries — two clauses. */
function cacheSpec(spec: Anchored<ClauseSpecWithBlock>): void {
    SPEC_CACHE.set(norm(spec.clauseKey), spec);
    const nestsUnder = spec.block?.design.nestsUnder;
    if (typeof nestsUnder === "string" && nestsUnder.length > 0) NESTS_UNDER.set(norm(spec.clauseKey), nestsUnder);
}

/**
 * Async load — fetch a spec's pinned bytes from its IPFS locator, verify they
 * hash to `clauseKey`, parse, cache, and return the spec. Idempotent: a spec
 * already cached resolves immediately. Throws on parse / network failure /
 * integrity mismatch (no silent fallback). PERMANENT failures — the bytes are
 * wrong, not merely not served yet: integrity mismatch, unparseable spec or
 * block — are recorded under `getClauseSpecLoadError`, so a re-reading
 * consumer can leave them alone; a network miss keeps nothing and is re-read.
 * The check runs on the bytes fetched (`anchorClauseSpec`) and
 * re-canonicalizes nothing — a drifted or tampered pin never enters the cache.
 */
export async function loadClauseSpec(clauseKey: Hex, uri: string): Promise<Anchored<ClauseSpecWithBlock>> {
    const cached = SPEC_CACHE.get(norm(clauseKey));
    if (cached !== undefined) return cached;
    const fetched = await activeFetcher(uri);
    const anchored = anchorClauseSpec(fetched, clauseKey);
    if (anchored === null) {
        const bytes = typeof fetched === "string" ? new TextEncoder().encode(fetched) : fetched;
        const detail = `bytes at ${uri} hash to ${keccak256(bytes)}, the clause key is ${clauseKey}`;
        SPEC_LOAD_ERRORS.set(norm(clauseKey), `integrity failure: ${detail}`);
        throw new Error(`Clause spec integrity failure: ${detail}`);
    }
    const spec = deriveAnchored(anchored, (raw) => specFromAnchoredDocument(raw, clauseKey, uri));
    cacheSpec(spec);
    return spec;
}

/** The spec and its `block` slice, read out of bytes already verified against
 *  the clause key. Throws, recording a permanent load error, when the bytes
 *  are not a well-formed spec. */
function specFromAnchoredDocument(raw: unknown, clauseKey: Hex, uri: string): ClauseSpecWithBlock {
    const parsed = parseClauseSpec(raw);
    if (!parsed.ok) {
        const detail = parsed.errors.map((e) => `${e.path}: ${e.message}`).join("; ");
        SPEC_LOAD_ERRORS.set(norm(clauseKey), `spec at ${uri} failed to parse: ${detail}`);
        throw new Error(`Clause spec at ${uri} failed to parse: ${detail}`);
    }
    // Parse the `block` presentation slice off the SAME spec JSON (the SDK parser
    // ignores it — it's content-only). A malformed block is a hard parse failure,
    // same as a malformed content field: surfaced, never silently dropped.
    const rawBlock = (raw as { block?: unknown })?.block;
    let block: ClauseBlockBinding | undefined;
    if (rawBlock !== undefined) {
        const blockErrors: SpecParseError[] = [];
        const parsedBlock = parseBlockBinding(rawBlock, "$.block", blockErrors);
        if (parsedBlock === null) {
            const detail = blockErrors.map((e) => `${e.path}: ${e.message}`).join("; ");
            SPEC_LOAD_ERRORS.set(norm(clauseKey), `spec at ${uri} block binding failed to parse: ${detail}`);
            throw new Error(`Clause spec at ${uri} block binding failed to parse: ${detail}`);
        }
        block = parsedBlock;
    }
    const key = clauseKey.toLowerCase() as Hex;
    return block !== undefined ? { ...parsed.spec, clauseKey: key, block } : { ...parsed.spec, clauseKey: key };
}

/** Test-only — clear all caches. */
export function _resetClauseSpecCache_TESTING_ONLY(): void {
    SPEC_CACHE.clear();
    SPEC_LOAD_ERRORS.clear();
    NESTS_UNDER.clear();
    LIVE_STAKE.clear();
}

/** THE live-stake rule (K4): a registration surfaces for NEW compositions
 *  while its registrant has not reclaimed the stake. The drawer's offer, the
 *  assembly-terms panel, the registry counts and `liveSpecSource` all read
 *  this one predicate. */
export function isLiveRegistration(row: { stakeWithdrawn: boolean }): boolean {
    return !row.stakeWithdrawn;
}

/** Note each registration's live stake from a `ClauseRegistry` read. The
 *  read is the whole registry, so the set is replaced, never merged: a
 *  registration absent from it is not live. */
export function noteClauseStakes(rows: readonly { clauseKey: Hex; stakeWithdrawn: boolean }[]): void {
    LIVE_STAKE.clear();
    for (const row of rows) if (isLiveRegistration(row)) LIVE_STAKE.add(norm(row.clauseKey));
}

// ── Sync API (resolves against the loaded cache) ─────────────────────────────

/** Synchronous lookup — the cached spec of one clause key, or `undefined` if
 *  not loaded. Every read names the key the composition, agreement, order or
 *  attestation carries. The agreement format's provenance leaf
 *  (`PROVENANCE_LEAF_KEY`) is no clause and resolves to nothing here. */
export function getClauseSpec(clauseKey: string): ClauseSpecWithBlock | undefined {
    return SPEC_CACHE.get(norm(clauseKey));
}

/** Returns the permanent load error for one clause key, if any. */
export function getClauseSpecLoadError(clauseKey: string): string | undefined {
    return SPEC_LOAD_ERRORS.get(norm(clauseKey));
}

/** One loaded clause: its key, labeled by its spec's own `clauseId` and
 *  `version` (presentation — a reader shows them; nothing keys on them). */
export interface KnownClause {
    clauseKey: Hex;
    clauseId: string;
    version: number;
}

/** Every loaded clause, one entry per key. */
export function listKnownClauses(): readonly KnownClause[] {
    return Array.from(SPEC_CACHE.values(), (s) => ({ clauseKey: s.clauseKey, clauseId: s.clauseId, version: s.version }));
}

/** A cached spec as the SDK projection sees it: the off-chain spec plus the
 *  hash-load-bearing `block` hints (design.article, design.fills,
 *  checkout.catalogueFills, checkout.profileFills). */
function toProjectionView(spec: ClauseSpecWithBlock): ProjectionSpecView {
    const hints: ProjectionHints = {};
    if (spec.block !== undefined) {
        hints.article = spec.block.design.article;
        if (spec.block.design.scope === "assembly") hints.scope = "assembly";
        if (spec.block.design.fills.length > 0) hints.designFills = spec.block.design.fills;
        if (spec.block.checkout.catalogueFills.length > 0) hints.catalogueFills = spec.block.checkout.catalogueFills;
        if (spec.block.checkout.profileFills.length > 0) hints.profileFills = spec.block.checkout.profileFills;
    }
    return { ...spec, hints };
}

/** The SDK projection seam (`SpecSource`), backed by this live registry cache.
 *  A stable singleton that reads the cache at call time, so it inherits the
 *  cache's degradation semantics exactly: `get` is undefined while a spec is
 *  unloaded (defaults skipped, validation skipped, field lookups fall back to
 *  data-key presence), and warms as `useClauseSpecs` hydrates. */
const SPEC_SOURCE: SpecSource = {
    get(clauseKey) {
        const spec = getClauseSpec(clauseKey);
        return spec ? toProjectionView(spec) : undefined;
    },
    list() {
        return Array.from(SPEC_CACHE.values(), toProjectionView);
    },
};

/** The live-cache `SpecSource` every SDK projection call site passes. */
export function specSource(): SpecSource {
    return SPEC_SOURCE;
}

/** The SpecSource a NEW composition is built from: `get` reads every loaded
 *  spec, exactly as `specSource()` (a stated pick resolves wherever it is
 *  bound), while `list` — the set `buildAssemblyTemplate`'s mandatory fold
 *  draws from — holds only registrations whose stake is live
 *  (`isLiveRegistration`), the same surfacing rule the drawer offers clauses
 *  under. */
const LIVE_SPEC_SOURCE: SpecSource = {
    get: SPEC_SOURCE.get,
    list() {
        return Array.from(SPEC_CACHE.values())
            .filter((spec) => LIVE_STAKE.has(norm(spec.clauseKey)))
            .map(toProjectionView);
    },
};

/** The live-stake `SpecSource` the template build passes. */
export function liveSpecSource(): SpecSource {
    return LIVE_SPEC_SOURCE;
}

/** The field name a clause nests under in the drawer, or null if top-level. */
export function clauseNestsUnder(clauseKey: string): string | null {
    return NESTS_UNDER.get(norm(clauseKey)) ?? null;
}

/** True if a clause is MANDATORY — on every order, composed by the build
 *  (commerce + topology), not a designer choice. The SDK's `specIsMandatory`
 *  is the one predicate (the template build's fold reads it too), applied to
 *  the clause at `clauseKey`; generic surfaces exclude mandatory clauses
 *  from selectable lists and fold them in automatically. ANY registered
 *  clause declaring `block.design.article: "mandatory"` participates —
 *  including one this codebase has never seen. */
export function clauseIsMandatory(clauseKey: string): boolean {
    const spec = SPEC_SOURCE.get(clauseKey as Hex);
    return spec !== undefined && specIsMandatory(spec);
}

/** True if a clause is ASSEMBLY-SCOPED (`block.design.scope: "assembly"`) —
 *  a term of the COMPOSITION itself (a denomination pin, a dispute forum):
 *  composed once at the assembly level of the designer, folded into EVERY
 *  agreement at checkout so every party signs it. ANY registered clause
 *  declaring the scope participates — including one this codebase has never
 *  seen. False = agreement-scoped (the default): a per-order term. */
export function clauseIsAssemblyScoped(clauseKey: string): boolean {
    return getClauseSpec(clauseKey)?.block?.design.scope === "assembly";
}

/** The content fields (by name) the DESIGNER fills into the assembly
 *  template, read from the clause's own `block.design.fills` — the tailoring
 *  that adapts a generic clause to a specific application (a pinned consent
 *  document, a pinned denomination). The drawer exposes field editors
 *  exactly for these; their values survive into the published template.
 *  Empty for clauses the designer only selects (whose fields are transaction
 *  particulars, filled by the buyer at checkout) — and while the spec is
 *  uncached. ANY registered clause declaring fills participates — including
 *  one this codebase has never seen. */
export function clauseDesignFills(clauseKey: string): readonly string[] {
    return getClauseSpec(clauseKey)?.block?.design.fills ?? [];
}

/** The content fields (by name) filled per-item on the member's CATALOG
 *  (item master data: freight class, hazmat, cold-chain), read from the
 *  clause's own `block.checkout.catalogueFills`. Generic surfaces render a
 *  spec-driven authoring section per such clause on the catalog item and
 *  fold the stored values onto the matching leaf at checkout. Empty for
 *  clauses with no catalog-filled fields — and while the spec is
 *  uncached. ANY registered clause declaring fills participates — including
 *  one this codebase has never seen. */
export function clauseCatalogFills(clauseKey: string): readonly string[] {
    return getClauseSpec(clauseKey)?.block?.checkout.catalogueFills ?? [];
}

/** Every loaded clause identity with catalog-filled fields — the set a
 *  catalog item's authoring section iterates. Derived from the live registry
 *  cache, never a bundled list; a newly registered product-property clause
 *  appears here with zero code change. */
export function listCatalogSourcedClauses(): readonly KnownClause[] {
    return listKnownClauses().filter((c) => clauseCatalogFills(c.clauseKey).length > 0);
}

/** The content fields (by name) filled ONCE on the member's PROFILE (the member's
 *  master data: a dim-weight divisor, a declared credential id), read from the
 *  clause's own `block.checkout.profileFills` — the seller-level sibling of
 *  `clauseCatalogFills` (item master data): catalog = what is sold,
 *  profile = who sells. The profile editor renders exactly these fields; other
 *  fields belong to other sources (designer fills, checkout derivation). Empty
 *  for clauses with no profile-filled fields — and while the spec is
 *  uncached. ANY registered clause declaring fills participates — including
 *  one this codebase has never seen. */
export function clauseProfileFills(clauseKey: string): readonly string[] {
    return getClauseSpec(clauseKey)?.block?.checkout.profileFills ?? [];
}

/** Every loaded clause identity with profile-filled fields — the set the
 *  member-profile authoring section iterates. Derived from the live registry
 *  cache, never a bundled list. */
export function listProfileSourcedClauses(): readonly KnownClause[] {
    return listKnownClauses().filter((c) => clauseProfileFills(c.clauseKey).length > 0);
}

/** The deep-link to a composed provider's OWN web UI, read from the clause's
 *  `block.design.composes.forumUrl` — the open-world replacement for a bundled
 *  clause-id→URL switch. Any clause that composes with a URL-only forum (a
 *  dispute-resolution provider like Kleros, or a never-seen
 *  `figaro-arbitration-<provider>`) declares its own forum URL in its spec and
 *  surfaces here with zero code change. Undefined when the clause composes with
 *  no forum, or its spec isn't loaded. */
export function composesForumUrl(clauseKey: string): string | undefined {
    return getClauseSpec(clauseKey)?.block?.design.composes?.forumUrl;
}

/** The STANDARD composition interface a clause binds to, from its
 *  `block.design.composes.interface` — the open-world discriminator for WHICH on-network
 *  contract an order composes with (e.g. an auction standard, an NFT credential
 *  check — never a dispute forum, which is `forumUrl`, a link and not a tenant).
 *  Generic surfaces derive composition behavior from this string, never a
 *  bundled clause-id. Undefined when the clause composes with nothing, or its
 *  spec isn't loaded.
 *  @public pending consumer: the composes-seam reader; its next consumer is
 *  the first on-chain-invoke tenant to land a handler in
 *  `useCompositionActions`. No such tenant is live today. */
export function composesInterface(clauseKey: string): string | undefined {
    return getClauseSpec(clauseKey)?.block?.design.composes?.interface;
}

/** A PROCESS-LOG clause — a runtime TRANSFER ladder the responsible party
 *  advances (merchant/courier today; a supply chain runs the same structure at
 *  length — factory→truck→port→customs→…, every transfer attested onto the
 *  timeline). Classified by the clause's OWN declared article — the semantic
 *  axis — never by field shape: "has an enum" is NOT "is a lifecycle", because
 *  every committed-choice clause (modalities, any bounded category) carries an
 *  enum too. `coordination`-article clauses declare WHICH scenario everyone
 *  runs; `attestations`-article clauses attest the transfers that run it. A
 *  never-seen process-log clause participates by declaring the article. */
export function clauseIsProcessLog(clauseKey: string): boolean {
    return getClauseSpec(clauseKey)?.block?.design.article === "attestations";
}

/** Whether a clause's spec declares a top-level field named `fieldName`.
 *  Field names — not clause ids — are the binding vocabulary generic surfaces
 *  look things up by: ANY registered clause carrying the field participates,
 *  including clauses this codebase has never seen. False while uncached. */
export function clauseDeclaresField(clauseKey: string, fieldName: string): boolean {
    return getClauseSpec(clauseKey)?.fields.some((f) => f.name === fieldName) === true;
}

/** The first enum-type field of a clause — the runtime "stage ladder" (the
 *  `eventType` enum on merchant/courier, or any runtime clause's ladder).
 *  Returns the field name + its ordered values, or null when the clause has no
 *  enum field. The generic runtime engine reads this to advance ANY
 *  runtime-attestable clause without naming it. */
export function clauseLadderField(clauseKey: string): { name: string; values: readonly string[]; valueLabels?: Readonly<Record<string, string>> } | null {
    for (const field of getClauseSpec(clauseKey)?.fields ?? []) {
        if (field.type === "enum") return { name: field.name, values: field.values, valueLabels: field.valueLabels };
    }
    return null;
}

/** The WITNESS stages a clause declares — its `spec.stages` entries, each a
 *  runtime attestation whose content differs from the committed content (a
 *  temperature reading, measured grams, a detected band). Declaration IS the
 *  signal: any registered clause declaring `stages[N]` surfaces a runtime
 *  witness capability at N with a form generated from that stage's fields —
 *  including a clause this codebase has never seen. Empty for clauses that
 *  declare none (and while the spec is uncached). */
export function clauseWitnessStages(
    clauseKey: string,
): Array<{ stage: number; fields: readonly FieldSpec[] }> {
    const stages = getClauseSpec(clauseKey)?.stages;
    if (!stages) return [];
    return Object.entries(stages).map(([key, fields]) => ({ stage: Number(key), fields }));
}

// ── Spec-derived reads ───────────────────────────────────────────────────────

/** The first enum field on a spec — the eventType ladder (merchant / courier)
 *  or the band set (proximity). Looks through enum and enum-typed array fields. */
function firstEnumField(spec: ClauseSpec | undefined): EnumFieldSpec | undefined {
    for (const field of spec?.fields ?? []) {
        if (field.type === "enum") return field;
        if (field.type === "array" && field.items.type === "enum") return field.items;
    }
    return undefined;
}

/** The enum field carrying `value` as a member — for labeling a raw value
 *  through its spec. Returns the enum (or array-of-enum item) field, or undefined. */
function enumFieldOf(field: FieldSpec): EnumFieldSpec | undefined {
    if (field.type === "enum") return field;
    if (field.type === "array" && field.items.type === "enum") return field.items;
    return undefined;
}

/** Label a raw enum value through its field's `valueLabels` — the spec is the
 *  SSoT for human-readable value display; falls back to the raw token when the
 *  spec declares no label (a never-labeled clause still renders). Internal —
 *  shared by the spec-derived readers below (`describeAttestation`,
 *  `renderFieldValues`) and by the capability deriver (the runtime action label). */
export function labelEnumValue(field: { valueLabels?: Readonly<Record<string, string>> } | null | undefined, value: string): string {
    return field?.valueLabels?.[value] ?? value;
}

/** Display text for a runtime attestation, read STRAIGHT from the clause spec:
 *  the title and the (labeled) enum value at `stage`. Callers pass DATA (the
 *  event's clause key + uint8 stage); no surface names a clause. Falls back to
 *  the short key + stage when the clause is unknown (not yet loaded).
 *  The agreement format's provenance leaf is described as such. */
export function describeAttestation(
    clauseKey: string,
    stage: number,
): { clauseTitle: string; eventLabel: string; eventCode: string } {
    // The agreement FORMAT's reserved leaf — the link from the order to the
    // assembly it instantiated — is told by comparing to the format constant,
    // never by a clause name; it has no spec.
    if (norm(clauseKey) === norm(PROVENANCE_LEAF_KEY)) {
        return { clauseTitle: "Assembly provenance", eventLabel: "provenance attested", eventCode: "provenance-leaf" };
    }
    const spec = getClauseSpec(clauseKey);
    if (!spec) return { clauseTitle: truncateHex(clauseKey, { head: 10, tail: 0 }), eventLabel: `stage ${stage}`, eventCode: `stage-${stage}` };
    // A DECLARED witness stage (spec.stages[stage]) is not a ladder ordinal —
    // labeling it through the committed enum would misread (e.g. a cold-chain
    // reading at stage 1 is not "refrigerated"). The witness's display name is
    // the clause's own title; its stable code is the stage number.
    if (spec.stages?.[stage] !== undefined) {
        return { clauseTitle: spec.title, eventLabel: spec.title, eventCode: `stage-${stage}` };
    }
    const ladder = firstEnumField(spec);
    const value = ladder?.values[stage];
    // eventLabel is the HUMANIZED display text (valueLabels); eventCode is the
    // STABLE raw enum value for targeting (data-testid / data-event-code), the
    // same split the capability rail uses (73d0e22) — the label can evolve
    // without breaking e2e.
    return {
        clauseTitle: spec.title,
        eventLabel: value ? labelEnumValue(ladder, value) : `stage ${stage}`,
        eventCode: value ?? `stage-${stage}`,
    };
}

/** A field's rendered contribution to a clause description: the field's display
 *  label (spec `label` → field name) and its selected value(s) rendered through
 *  the spec's `valueLabels` (raw token when no label is declared). Internal —
 *  consumers receive it structurally as `ClauseDescription.fields[]`. */
interface ClauseFieldDescription {
    name: string;
    label: string;
    values: string[];
}

/** A human description of a composed clause, derived ENTIRELY from its spec +
 *  data — the SSoT reader for display (drawer / canvas / checkout) and future
 *  analysis surfaces. Names no clause; an unknown (unloaded / permissionless)
 *  clause degrades to its short key + raw data. Only fields actually present in
 *  `data` are described. */
export interface ClauseDescription {
    clauseKey: string;
    title: string;
    fields: ClauseFieldDescription[];
}


function renderFieldValues(field: FieldSpec, raw: unknown): string[] {
    const enumField = enumFieldOf(field);
    const label = (v: unknown) => labelEnumValue(enumField, String(v));
    // Array-of-object: one line per entry, its child values in declaration
    // order joined " · " (a consent document renders "Terms of Service · 1.0
    // · 0x… · ipfs://…") — read from the spec, no per-clause shape.
    if (field.type === "array" && field.items.type === "object") {
        const itemFields = field.items.fields;
        return (Array.isArray(raw) ? raw : [])
            .filter((item) => item != null && typeof item === "object")
            .map((item) => itemFields
                .map((child) => (item as Record<string, unknown>)[child.name])
                .filter((v) => v != null && v !== "")
                .map(String)
                .join(" · "))
            .filter((line) => line.length > 0);
    }
    if (Array.isArray(raw)) return raw.filter((v) => v != null && v !== "").map(label);
    if (raw == null || raw === "") return [];
    return [label(raw)];
}

/** Describe a composed clause from its spec + data — the one generic, identity-
 *  blind reader every display/analysis surface shares. */
export function describeClause(clauseKey: string, data: Record<string, unknown> | undefined): ClauseDescription {
    const spec = getClauseSpec(clauseKey);
    const d = data ?? {};
    if (!spec) {
        return {
            clauseKey,
            title: truncateHex(clauseKey, { head: 10, tail: 0 }),
            fields: Object.entries(d)
                .map(([name, v]) => ({ name, label: name, values: Array.isArray(v) ? v.map(String) : v == null || v === "" ? [] : [String(v)] }))
                .filter((f) => f.values.length > 0),
        };
    }
    const fields: ClauseFieldDescription[] = [];
    for (const field of spec.fields) {
        const values = renderFieldValues(field, d[field.name]);
        if (values.length === 0) continue;
        fields.push({ name: field.name, label: field.label ?? field.name, values });
    }
    return { clauseKey, title: spec.title, fields };
}

/** Describe a runtime WITNESS attestation's decoded content through its
 *  declared stage fields — the stage-selected sibling of `describeClause`
 *  (same shape, same value rendering). Falls back to raw key/value pairs when
 *  the clause or stage is unknown — an unknown witness still renders. */
export function describeWitness(
    clauseKey: string,
    stage: number,
    data: Record<string, unknown> | undefined,
): ClauseDescription {
    const spec = getClauseSpec(clauseKey);
    const stageFields = spec?.stages?.[stage];
    const d = data ?? {};
    if (!spec || !stageFields) {
        return {
            clauseKey,
            title: spec?.title ?? truncateHex(clauseKey, { head: 10, tail: 0 }),
            fields: Object.entries(d)
                .map(([name, v]) => ({ name, label: name, values: Array.isArray(v) ? v.map(String) : v == null || v === "" ? [] : [String(v)] }))
                .filter((f) => f.values.length > 0),
        };
    }
    const fields: ClauseFieldDescription[] = [];
    for (const field of stageFields) {
        const values = renderFieldValues(field, d[field.name]);
        if (values.length === 0) continue;
        fields.push({ name: field.name, label: field.label ?? field.name, values });
    }
    return { clauseKey, title: spec.title, fields };
}

/** Module-internal: `clauseEnumValues` below needs it. */
function clauseFieldSpec(clauseKey: string, fieldPath: string): FieldSpec | undefined {
    let fields: readonly FieldSpec[] | undefined = getClauseSpec(clauseKey)?.fields;
    const segments = fieldPath.split(".");
    for (let i = 0; i < segments.length; i++) {
        const field = fields?.find((f) => f.name === segments[i]);
        if (!field) return undefined;
        if (i === segments.length - 1) return field;
        if (field.type !== "object") return undefined;
        fields = field.fields;
    }
    return undefined;
}

/** The enum values a clause field admits, read STRAIGHT from the spec — the SSoT
 *  for which strings are valid. `fieldPath` is dot-delimited for nested object
 *  fields; the leaf may be an enum or an array-of-enum. Empty when absent.
 *  @public pending consumer: the Layer-6 spec-driven drawer controls (its
 *  prior consumers, the ALLOWED_* filters, were absorbed by the generic build
 *  walk); remove the tag when that lands. */
export function clauseEnumValues(clauseKey: string, fieldPath: string): readonly string[] {
    const field = clauseFieldSpec(clauseKey, fieldPath);
    if (field?.type === "enum") return field.values;
    if (field?.type === "array" && field.items.type === "enum") return field.items.values;
    return [];
}

interface ClauseArticleEntry {
    clauseKey: Hex;
    clauseId: string;
    version: number;
    title: string;
    description: string;
}

export interface ClauseArticleGroup {
    article: string;
    label: string;
    clauses: readonly ClauseArticleEntry[];
}

/** THE single clause grouping — every loaded clause grouped by its
 *  `block.design.article` (the drawer heading), derived entirely from the
 *  specs. Articles appear in the order their first clause was loaded
 *  (chain/registration order); there is NO imposed sequence — no hardcoded
 *  article list, no alphabetical sort. Both the /clauses inventory and the
 *  designer drawer read this one function, so the two surfaces group clauses
 *  identically. Clauses with no block fall to "(unclassified)". Sub-clause
 *  nesting is layered on top from `block.design.nestsUnder` (see
 *  `clauseNestsUnder`). */
export function groupClausesByArticle(): readonly ClauseArticleGroup[] {
    const byArticle = new Map<string, ClauseArticleEntry[]>();
    for (const spec of SPEC_CACHE.values()) {
        const article = spec.block?.design.article ?? "(unclassified)";
        const entry = { clauseKey: spec.clauseKey, clauseId: spec.clauseId, version: spec.version, title: spec.title, description: spec.description };
        const bucket = byArticle.get(article);
        if (bucket) bucket.push(entry);
        else byArticle.set(article, [entry]);
    }
    // Insertion order = load order; the Map preserves it. No sort, no enum.
    return Array.from(byArticle.entries()).map(([article, clauses]) => ({ article, label: article, clauses }));
}
