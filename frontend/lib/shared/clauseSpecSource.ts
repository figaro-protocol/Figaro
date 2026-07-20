/**
 * Clause-spec source — the in-memory cache of clause specs, fed ONLY from
 * chain → IPFS.
 *
 * The on-chain `ClauseRegistry.ClauseRegistered` event carries the readable
 * `clauseId` and a `metadataURI` (IPFS) locator. `loadClauseSpec(clauseId, uri)`
 * fetches the spec from that locator, parses it, and caches it; every sync read
 * below resolves against that cache. There is NO bundled spec set and NO
 * fallback — a spec the chain doesn't point at is simply unknown. The
 * `useClauseSpecs` hook warms the cache at the app boundary (it reads the
 * registry events and loads each `metadataURI`), the same way assemblies load.
 *
 * Spec-derived reads (title, article, attestation tier, enum vocabulary, drawer
 * nesting) live here so there is one source and no parallel taxonomy module.
 */

import { parseClauseSpec, type ClauseSpec, type FieldSpec, type EnumFieldSpec, type SpecParseError } from "@figaro/sdk/clauses";
import type { ProjectionHints, ProjectionSpecView, SpecSource } from "@figaro/sdk";
import { canonicalContentHash } from "@/lib/shared/canonicalJson";
import { parseBlockBinding, type ClauseBlockBinding } from "@/lib/shared/clauseBlockBinding";
import { computeClauseKey } from "@figaro/sdk";
import { DEFAULT_IPFS_SERVICE, fetchCappedContent } from "@/lib/shared/ipfsService";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";

/** A clause spec plus its frontend-parsed `block` slice. The SDK `ClauseSpec` is
 *  content-only (`fields`/`stages`); the `block` binding is pure presentation the
 *  frontend owns (`clauseBlockBinding`), parsed off the same spec JSON at load. */
export type ClauseSpecWithBlock = ClauseSpec & { block?: ClauseBlockBinding };

/** Internal composite cache key — a clause's identity is (clauseId, version),
 *  matching the on-chain key keccak256(abi.encode(clauseId, version)). Names
 *  stay bare; `version` is a static field in the id. Never serialized or rendered. */
const specKey = (clauseId: string, version: number): string => `${clauseId}#${version}`;

const SPEC_CACHE = new Map<string, ClauseSpecWithBlock>();
const SPEC_LOAD_ERRORS = new Map<string, string>();

/** clauseId → the parent FIELD name it nests under in the drawer, read from the
 *  spec's `block.nestsUnder`. Populated as specs load. Drives the drawer's
 *  cross-clause nesting (e.g. a proximity policy renders nested under the
 *  handoff clause's `handoff` array field). Read from the spec; never a hardcoded tree.
 *
 *  `nestsUnder` names a field, and means "this clause REFINES that field" — a
 *  DIFFERENT job from `block.article`, which GROUPS co-equal clauses together. Do not
 *  reach for `nestsUnder` to say "these clauses belong together" (that's `article`); the
 *  target must be a STRUCTURED field (enum/array/object) a sub-clause elaborates, never a
 *  scalar. Enforced by scripts/lint-clause-nests-under-a-field.sh. */
const NESTS_UNDER = new Map<string, string>();

/** on-chain clause HASH (keccak256(abi.encode(clauseId, version)), as the
 *  Attestation event carries it) → the loaded spec's identity. Populated as
 *  specs load; the runtime attestation log keys on the hash, so a hash resolves
 *  to its EXACT version — two live versions of one name never conflate. */
const HASH_TO_ID = new Map<string, { clauseId: string; version: number }>();

// ── Loading (chain → IPFS) ───────────────────────────────────────────────────

/**
 * Fetcher hook — URI → raw JSON. Default resolves an `ipfs://` locator through
 * the gateway and fetches it; tests swap in a stub via `setClauseSpecFetcher`.
 */
export type ClauseSpecFetcher = (uri: string) => Promise<unknown>;

let activeFetcher: ClauseSpecFetcher = async (uri) => {
    const url = DEFAULT_IPFS_SERVICE.resolveFetchUrl(uri);
    if (!url) throw new Error(`Cannot resolve clause spec URI: ${uri}`);
    // Size-capped fetch (F4): a permissionlessly-registered clause pointing at
    // a multi-GB pin aborts mid-stream instead of OOMing every clause surface —
    // the DoS sibling of the MAX_FIELD_DEPTH parse cap.
    const response = await fetchCappedContent(url);
    if (!response.ok) throw new Error(`Failed to fetch clause spec at ${uri}: ${response.status} ${response.statusText}`);
    const parsed = await safeJsonFromResponse(response);
    if (parsed === null) throw new Error(`Failed to parse clause spec at ${uri}: invalid JSON`);
    return parsed;
};

/** Replace the default fetcher (test-only). */
export function setClauseSpecFetcher(fetcher: ClauseSpecFetcher): void {
    activeFetcher = fetcher;
}

/** Register a loaded spec into the cache + the derived maps. Keyed by the full
 *  identity (clauseId, version): two live versions of one clause coexist as
 *  co-equal cache entries — a clause is a clause. */
function cacheSpec(spec: ClauseSpecWithBlock): void {
    SPEC_CACHE.set(specKey(spec.clauseId, spec.version), spec);
    HASH_TO_ID.set(computeClauseKey(spec.clauseId, spec.version).toLowerCase(), { clauseId: spec.clauseId, version: spec.version });
    const nestsUnder = spec.block?.nestsUnder;
    if (typeof nestsUnder === "string" && nestsUnder.length > 0) NESTS_UNDER.set(specKey(spec.clauseId, spec.version), nestsUnder);
}

/**
 * Async load — fetch a spec from its IPFS locator, parse, cache, and return it.
 * Idempotent: a spec already cached resolves immediately. Throws on parse /
 * network failure / clauseId mismatch / integrity mismatch (no silent
 * fallback). When `expectedContentHash` is provided (the `ClauseRegistered`
 * event's digest), the fetched document is verified by recomputing the
 * canonical content hash — a drifted or tampered pin never enters the cache.
 */
export async function loadClauseSpec(
    clauseId: string,
    version: number,
    uri: string,
    expectedContentHash?: `0x${string}`,
): Promise<ClauseSpecWithBlock> {
    const cached = SPEC_CACHE.get(specKey(clauseId, version));
    if (cached !== undefined) return cached;
    const raw = await activeFetcher(uri);
    if (expectedContentHash) {
        const recomputed = canonicalContentHash(raw);
        if (recomputed.toLowerCase() !== expectedContentHash.toLowerCase()) {
            const detail = `spec at ${uri} hashes to ${recomputed}, chain anchors ${expectedContentHash}`;
            SPEC_LOAD_ERRORS.set(clauseId, `integrity failure: ${detail}`);
            throw new Error(`Clause spec integrity failure: ${detail}`);
        }
    }
    const parsed = parseClauseSpec(raw);
    if (!parsed.ok) {
        const detail = parsed.errors.map((e) => `${e.path}: ${e.message}`).join("; ");
        SPEC_LOAD_ERRORS.set(clauseId, `spec at ${uri} failed to parse: ${detail}`);
        throw new Error(`Clause spec at ${uri} failed to parse: ${detail}`);
    }
    if (parsed.spec.clauseId !== clauseId) {
        throw new Error(`Clause spec at ${uri} declares clauseId "${parsed.spec.clauseId}", expected "${clauseId}"`);
    }
    if (parsed.spec.version !== version) {
        throw new Error(`Clause spec at ${uri} declares version ${parsed.spec.version}, expected ${version} (the registered version)`);
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
            SPEC_LOAD_ERRORS.set(clauseId, `spec at ${uri} block binding failed to parse: ${detail}`);
            throw new Error(`Clause spec at ${uri} block binding failed to parse: ${detail}`);
        }
        block = parsedBlock;
    }
    const spec: ClauseSpecWithBlock = block !== undefined ? { ...parsed.spec, block } : parsed.spec;
    cacheSpec(spec);
    return spec;
}

/** Test-only — clear all caches. */
export function _resetClauseSpecCache_TESTING_ONLY(): void {
    SPEC_CACHE.clear();
    SPEC_LOAD_ERRORS.clear();
    NESTS_UNDER.clear();
    HASH_TO_ID.clear();
}

// ── Sync API (resolves against the loaded cache) ─────────────────────────────

/** Synchronous lookup — returns a cached spec, or `undefined` if not loaded.
 *  With `version` the lookup is exact (the full identity). Without it, the
 *  name resolves when unambiguous (one loaded version) and to the HIGHEST
 *  loaded version otherwise — a display convenience; semantic callers reading
 *  committed data pass the version that data carries. */
export function getClauseSpec(clauseId: string, version?: number): ClauseSpecWithBlock | undefined {
    if (version !== undefined) return SPEC_CACHE.get(specKey(clauseId, version));
    let best: ClauseSpecWithBlock | undefined;
    for (const spec of SPEC_CACHE.values()) {
        if (spec.clauseId !== clauseId) continue;
        if (best === undefined || spec.version > best.version) best = spec;
    }
    return best;
}

/** Resolve an on-chain clauseId HASH (keccak of name+version) back to its readable
 *  registry id, via the warmed cache. The inverse of `computeClauseKey`. Undefined
 *  until the spec is loaded. Attestation events carry the HASH, while the spec
 *  reads (`getClauseSpec` / `clauseIsProcessLog`) key on the readable id — callers
 *  holding a hash resolve it here first. */
export function clauseIdForHash(clauseIdHashHex: string): string | undefined {
    return HASH_TO_ID.get(clauseIdHashHex.toLowerCase())?.clauseId;
}

/** Resolve an on-chain clause hash to its EXACT loaded spec — hash → identity
 *  → cache. The version-precise sibling of `clauseIdForHash`; the runtime
 *  attestation reader (`describeAttestation`) resolves through this so two
 *  live versions never conflate. Internal — export when an outside reader
 *  holds a raw hash. */
function clauseSpecForHash(clauseIdHashHex: string): ClauseSpecWithBlock | undefined {
    const id = HASH_TO_ID.get(clauseIdHashHex.toLowerCase());
    return id ? SPEC_CACHE.get(specKey(id.clauseId, id.version)) : undefined;
}

/** Returns the load error for a clauseId, if any. */
export function getClauseSpecLoadError(clauseId: string): string | undefined {
    return SPEC_LOAD_ERRORS.get(clauseId);
}

/** Returns all currently-loaded clause NAMES, deduped — two live versions of
 *  one clause contribute one name. Version-blind by design; callers that need
 *  the full identity list use `listKnownClauses`. */
export function listKnownClauseIds(): readonly string[] {
    return Array.from(new Set(Array.from(SPEC_CACHE.values(), (s) => s.clauseId)));
}

/** Every loaded spec identity, one entry per (clauseId, version). */
export function listKnownClauses(): readonly { clauseId: string; version: number }[] {
    return Array.from(SPEC_CACHE.values(), (s) => ({ clauseId: s.clauseId, version: s.version }));
}

/** A cached spec as the SDK projection sees it: the Layer-A spec plus the
 *  hash-load-bearing `block` hints (article, catalogueSourced, profileSourced,
 *  terms). */
function toProjectionView(spec: ClauseSpecWithBlock): ProjectionSpecView {
    const hints: ProjectionHints = {};
    if (spec.block?.article !== undefined) hints.article = spec.block.article;
    if (spec.block?.catalogueSourced === true) hints.catalogueSourced = true;
    if (spec.block?.profileSourced !== undefined) hints.profileSourced = spec.block.profileSourced;
    if (spec.block?.terms !== undefined) hints.terms = spec.block.terms;
    return { ...spec, hints };
}

/** The SDK projection seam (`SpecSource`), backed by this live registry cache.
 *  A stable singleton that reads the cache at call time, so it inherits the
 *  cache's degradation semantics exactly: `get` is undefined while a spec is
 *  unloaded (defaults skipped, validation skipped, field lookups fall back to
 *  data-key presence), and warms as `useClauseSpecs` hydrates. */
const SPEC_SOURCE: SpecSource = {
    get(clauseId, version) {
        const spec = getClauseSpec(clauseId, version);
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

/** The field name a clause nests under in the drawer, or null if top-level. */
export function clauseNestsUnder(clauseId: string, version?: number): string | null {
    const spec = getClauseSpec(clauseId, version);
    return spec ? (NESTS_UNDER.get(specKey(spec.clauseId, spec.version)) ?? null) : null;
}

/** True if a clause is MANDATORY — on every order, composed by the build
 *  (commerce + topology), not a designer choice. Classified by its sole block
 *  article `mandatory` (one word for one concept — renamed from `structural`
 *  2026-07-14, which collided with the design/DAG sense); generic surfaces
 *  exclude mandatory clauses from selectable lists and fold them in
 *  automatically. ANY registered clause declaring `block.article: "mandatory"`
 *  participates — including one this codebase has never seen. */
export function clauseIsMandatory(clauseId: string, version?: number): boolean {
    return getClauseSpec(clauseId, version)?.block?.article === "mandatory";
}

/** True if a clause carries SPECIFIC T&Cs (`block.terms: "specific"` — consent
 *  today): the designer composes its field values into the template, tailoring
 *  a generic assembly for a specific application (ruled 2026-07-14). Every
 *  other clause is GENERAL — its fields are transaction particulars, filled at
 *  checkout; the designer only SELECTS it. ANY registered clause declaring the
 *  marker participates — including one this codebase has never seen. */
export function clauseIsSpecificTerms(clauseId: string, version?: number): boolean {
    return getClauseSpec(clauseId, version)?.block?.terms === "specific";
}

/** True if a clause is CATALOGUE-SOURCED — its content values are authored
 *  per-item on the seller's catalogue (product master data: freight class,
 *  hazmat, cold-chain), classified by its own `block.catalogueSourced` marker.
 *  Generic surfaces render a spec-driven authoring section per such clause on
 *  the catalogue item and fold the stored values onto the matching leaf at
 *  checkout. ANY registered clause declaring the marker participates —
 *  including one this codebase has never seen. */
export function clauseIsCatalogueSourced(clauseId: string, version?: number): boolean {
    return getClauseSpec(clauseId, version)?.block?.catalogueSourced === true;
}

/** Every loaded catalogue-sourced clause identity — the set a catalogue item's
 *  authoring section iterates. Derived from the live registry cache, never a
 *  bundled list; a newly registered product-property clause appears here with
 *  zero code change. */
export function listCatalogueSourcedClauses(): readonly { clauseId: string; version: number }[] {
    return listKnownClauses().filter((c) => clauseIsCatalogueSourced(c.clauseId, c.version));
}

/** True if a clause is PROFILE-SOURCED — its content values are SELLER master
 *  data, authored once on the seller's profile (a dim-weight divisor, a
 *  declared credential id), classified by its own `block.profileSourced`
 *  marker. The seller-level sibling of `clauseIsCatalogueSourced` (item master
 *  data): catalogue = what is sold, profile = who sells. ANY registered clause
 *  declaring the marker participates — including one this codebase has never
 *  seen. */
export function clauseIsProfileSourced(clauseId: string, version?: number): boolean {
    const marker = getClauseSpec(clauseId, version)?.block?.profileSourced;
    return marker === true || (Array.isArray(marker) && marker.length > 0);
}

/** Every loaded profile-sourced clause identity — the set the seller-profile
 *  authoring section iterates. Derived from the live registry cache, never a
 *  bundled list. */
export function listProfileSourcedClauses(): readonly { clauseId: string; version: number }[] {
    return listKnownClauses().filter((c) => clauseIsProfileSourced(c.clauseId, c.version));
}

/** The PROFILE-AUTHORED field names of a profile-sourced clause, read from its
 *  own `block.profileSourced` marker: the array form names the subset; `true`
 *  means every content field. Empty for clauses that are not profile-sourced.
 *  The profile editor renders exactly these fields; other fields belong to
 *  other sources (designer pins, checkout derivation). */
export function profileSourcedFields(clauseId: string, version?: number): readonly string[] {
    const spec = getClauseSpec(clauseId, version);
    const marker = spec?.block?.profileSourced;
    if (Array.isArray(marker)) return marker;
    if (marker === true && spec) return spec.fields.map((f) => f.name);
    return [];
}

/** The deep-link to a composed provider's OWN web UI, read from the clause's
 *  `block.composes.forumUrl` — the open-world replacement for a bundled
 *  clause-id→URL switch. Any clause that composes with a URL-only forum (a
 *  dispute-resolution provider like Kleros, or a never-seen
 *  `figaro-arbitration-<provider>`) declares its own forum URL in its spec and
 *  surfaces here with zero code change. Undefined when the clause composes with
 *  no forum, or its spec isn't loaded. */
export function composesForumUrl(clauseId: string): string | undefined {
    return getClauseSpec(clauseId)?.block?.composes?.forumUrl;
}

/** The STANDARD composition interface a clause binds to, from its
 *  `block.composes.interface` — the open-world discriminator for WHICH on-network
 *  contract an order composes with (e.g. "carbon-aggregator", "dispute-forum").
 *  Generic surfaces derive composition behaviour from this string, never a
 *  bundled clause-id. Undefined when the clause composes with nothing, or its
 *  spec isn't loaded.
 *  @public pending consumer: the composes-seam reader (kept by operator ruling
 *  2026-07-02); its next consumer is the emissions cluster's carbon-aggregator
 *  interface gate. */
export function composesInterface(clauseId: string): string | undefined {
    return getClauseSpec(clauseId)?.block?.composes?.interface;
}

/** A PROCESS-LOG clause — a runtime TRANSFER ladder the responsible party
 *  advances (merchant/courier today; a supply chain runs the same structure at
 *  length — factory→truck→port→customs→…, every transfer attested onto the
 *  timeline). Classified by the clause's OWN declared article — the semantic
 *  axis — never by field shape: "has an enum" is NOT "is a lifecycle", because
 *  every committed-choice clause (modalities, any bounded category) carries an
 *  enum too. `coordination`-article clauses declare WHICH scenario everyone
 *  runs; `attestations`-article clauses record the transfers that run it. A
 *  never-seen process-log clause participates by declaring the article. */
export function clauseIsProcessLog(clauseId: string, version?: number): boolean {
    return getClauseSpec(clauseId, version)?.block?.article === "attestations";
}

/** Whether a clause's spec declares a top-level field named `fieldName`.
 *  Field names — not clause ids — are the binding vocabulary generic surfaces
 *  look things up by: ANY registered clause carrying the field participates,
 *  including clauses this codebase has never seen. False while uncached. */
export function clauseDeclaresField(clauseId: string, fieldName: string, version?: number): boolean {
    return getClauseSpec(clauseId, version)?.fields.some((f) => f.name === fieldName) === true;
}

/** The first enum-type field of a clause — the runtime "stage ladder" (the
 *  `eventType` enum on merchant/courier, or any runtime clause's ladder).
 *  Returns the field name + its ordered values, or null when the clause has no
 *  enum field. The generic runtime engine reads this to advance ANY
 *  runtime-attestable clause without naming it. */
export function clauseLadderField(clauseId: string, version?: number): { name: string; values: readonly string[]; valueLabels?: Readonly<Record<string, string>> } | null {
    for (const field of getClauseSpec(clauseId, version)?.fields ?? []) {
        if (field.type === "enum") return { name: field.name, values: field.values, valueLabels: field.valueLabels };
    }
    return null;
}

/** The WITNESS stages a clause declares — its `spec.stages` entries, each a
 *  runtime attestation whose content differs from the committed content (a
 *  temperature record, measured grams, a detected band). Declaration IS the
 *  signal: any registered clause declaring `stages[N]` surfaces a runtime
 *  witness capability at N with a form generated from that stage's fields —
 *  including a clause this codebase has never seen. Empty for clauses that
 *  declare none (and while the spec is uncached). */
export function clauseWitnessStages(
    clauseId: string,
    version?: number,
): Array<{ stage: number; fields: readonly FieldSpec[] }> {
    const stages = getClauseSpec(clauseId, version)?.stages;
    if (!stages) return [];
    return Object.entries(stages).map(([key, fields]) => ({ stage: Number(key), fields }));
}

/** The ladder stages at which a PHYSICAL hand-off occurs, read from the
 *  clause's own `block.handoffStages` declaration. Executing one of these
 *  ladder stages pairs the witness stage of a co-composed clause nesting under
 *  `handoff` on the same order. Empty for clauses declaring none. */
export function clauseHandoffStages(clauseId: string, version?: number): readonly string[] {
    return getClauseSpec(clauseId, version)?.block?.handoffStages ?? [];
}

/** Derive a witness stage's values from the clause's COMMITTED content, for
 *  the one-action-two-attestations hand-off pairing: a required enum witness
 *  field resolves iff the committed data carries an array of the SAME enum
 *  vocabulary narrowed to exactly one element (e.g. a single committed
 *  proximity band); optional fields stay absent. Returns null when any
 *  required field is unresolvable — the pairing skips and the standalone
 *  witness capability (with its form) carries the choice instead. */
export function deriveStageValuesFromCommitted(
    clauseId: string,
    stage: number,
    committedData: Record<string, unknown> | undefined,
    version?: number,
): Record<string, unknown> | null {
    const spec = getClauseSpec(clauseId, version);
    const stageFields = spec?.stages?.[stage];
    if (!spec || !stageFields) return null;
    const out: Record<string, unknown> = {};
    for (const field of stageFields) {
        if (!field.required) continue;
        if (field.type !== "enum") return null;
        const committedMatch = spec.fields.find((f) =>
            f.type === "array" && f.items.type === "enum"
            && f.items.values.length === field.values.length
            && f.items.values.every((v) => field.values.includes(v)));
        const committed = committedMatch ? committedData?.[committedMatch.name] : undefined;
        if (!Array.isArray(committed) || committed.length !== 1) return null;
        out[field.name] = committed[0];
    }
    return out;
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

/** The enum field carrying `value` as a member — for labelling a raw value
 *  through its spec. Returns the enum (or array-of-enum item) field, or undefined. */
function enumFieldOf(field: FieldSpec): EnumFieldSpec | undefined {
    if (field.type === "enum") return field;
    if (field.type === "array" && field.items.type === "enum") return field.items;
    return undefined;
}

/** Label a raw enum value through its field's `valueLabels` — the spec is the
 *  SSoT for human-readable value display; falls back to the raw token when the
 *  spec declares no label (a never-labelled clause still renders). Internal —
 *  shared by the spec-derived readers below (`describeAttestation`,
 *  `renderFieldValues`) and by the capability deriver (the runtime action label). */
export function labelEnumValue(field: { valueLabels?: Readonly<Record<string, string>> } | null | undefined, value: string): string {
    return field?.valueLabels?.[value] ?? value;
}

/** Display text for a runtime attestation, read STRAIGHT from the clause spec:
 *  the title and the (labelled) enum value at `stage`. Callers pass DATA (the
 *  event's clauseId hash + uint8 stage) — no surface names a clause. Falls back
 *  to the short hash + stage when the clause is unknown (not yet loaded). */
export function describeAttestation(
    clauseIdHash: string,
    stage: number,
): { clauseTitle: string; eventLabel: string; eventCode: string } {
    // Accept EITHER the on-chain hash (resolve via the cache to the EXACT
    // version) or an already-readable id (use it directly — highest loaded) —
    // process-log groups now carry the readable id.
    const spec = clauseSpecForHash(clauseIdHash) ?? getClauseSpec(clauseIdHash);
    if (!spec) return { clauseTitle: `${clauseIdHash.slice(0, 10)}…`, eventLabel: `stage ${stage}`, eventCode: `stage-${stage}` };
    // A DECLARED witness stage (spec.stages[stage]) is not a ladder ordinal —
    // labelling it through the committed enum would misread (e.g. a cold-chain
    // record at stage 1 is not "refrigerated"). The witness's display name is
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
 *  clause degrades to its short hash + raw data. Only fields actually present in
 *  `data` are described. */
export interface ClauseDescription {
    clauseId: string;
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
export function describeClause(clauseId: string, data: Record<string, unknown> | undefined, version?: number): ClauseDescription {
    const spec = getClauseSpec(clauseId, version);
    const d = data ?? {};
    if (!spec) {
        return {
            clauseId,
            title: `${clauseId.slice(0, 10)}…`,
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
    return { clauseId, title: spec.title, fields };
}

/** Describe a runtime WITNESS attestation's decoded content through its
 *  declared stage fields — the stage-selected sibling of `describeClause`
 *  (same shape, same value rendering). Falls back to raw key/value pairs when
 *  the clause or stage is unknown — an unknown witness still renders. */
export function describeWitness(
    clauseId: string,
    stage: number,
    data: Record<string, unknown> | undefined,
    version?: number,
): ClauseDescription {
    const spec = getClauseSpec(clauseId, version);
    const stageFields = spec?.stages?.[stage];
    const d = data ?? {};
    if (!spec || !stageFields) {
        return {
            clauseId,
            title: spec?.title ?? `${clauseId.slice(0, 10)}…`,
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
    return { clauseId, title: spec.title, fields };
}

/** The FieldSpec at a dot-delimited path inside a clause's spec — the SSoT for
 *  a field's type, constraints, enum values, `default`, and `sentinel`. The
 *  generic build encoder walks `getClauseSpec(id).fields` directly; this
 *  path-lookup form serves form surfaces; undefined when the clause or path
 *  is unknown.
 *  @public pending consumer: the Layer-6 spec-driven drawer controls (render
 *  per-field inputs from the spec); remove the tag when that lands. */
export function clauseFieldSpec(clauseId: string, fieldPath: string): FieldSpec | undefined {
    let fields: readonly FieldSpec[] | undefined = getClauseSpec(clauseId)?.fields;
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
export function clauseEnumValues(clauseId: string, fieldPath: string): readonly string[] {
    const field = clauseFieldSpec(clauseId, fieldPath);
    if (field?.type === "enum") return field.values;
    if (field?.type === "array" && field.items.type === "enum") return field.items.values;
    return [];
}

interface ClauseArticleEntry {
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

/** THE single clause classification — every loaded clause grouped by its
 *  `block.article`, derived entirely from the specs. Articles appear in
 *  the order their first clause was loaded (chain/registration order); there is
 *  NO imposed sequence — no hardcoded article list, no alphabetical sort. Both
 *  the /clauses inventory and the designer drawer read this one function, so the
 *  two surfaces classify clauses identically. Clauses with no article fall to
 *  "(unclassified)". Sub-clause nesting is layered on top from `block.nestsUnder`
 *  (see `clauseNestsUnder`). */
export function groupClausesByArticle(): readonly ClauseArticleGroup[] {
    const byArticle = new Map<string, ClauseArticleEntry[]>();
    for (const spec of SPEC_CACHE.values()) {
        const article = spec.block?.article ?? "(unclassified)";
        const entry = { clauseId: spec.clauseId, version: spec.version, title: spec.title, description: spec.description };
        const bucket = byArticle.get(article);
        if (bucket) bucket.push(entry);
        else byArticle.set(article, [entry]);
    }
    // Insertion order = load order; the Map preserves it. No sort, no enum.
    return Array.from(byArticle.entries()).map(([article, clauses]) => ({ article, label: article, clauses }));
}
