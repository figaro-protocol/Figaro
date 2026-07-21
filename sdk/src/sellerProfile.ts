/**
 * sellerProfile.ts — the seller PROFILE document (Layer-A).
 *
 * The profile is the stable identity envelope a seller pins to IPFS and
 * points `SellerRegistry.metadataURI` at: name, branding, location,
 * accepted-token list, default pricing token, assembly bindings, agent
 * endpoints, and the URI of the volatile catalogue document. Item lists
 * live in the catalogue (`sellerCatalogue.ts`) so item edits re-pin one
 * small JSON instead of the whole identity envelope.
 *
 * Token acceptance is an identity declaration: each token signals which
 * value system the seller coordinates with — legal-system alignment
 * (stablecoins), community membership (DAO tokens), settlement-layer
 * alignment (ETH), or value anchoring (commodity-backed). It is not a
 * financial-market position.
 *
 * Carries no role / archetype / category / cuisine taxonomy field —
 * `specialty` below is free PROSE (a self-description), never a closed
 * vocabulary, and nothing dispatches on it. Buyers infer what the seller
 * does from the items in the catalogue; protocol-tier role attribution is
 * event-derived via the indexer.
 *
 * This module owns the document TYPES and the strict + lenient PARSERS.
 * After `reconstructDiscovery` hands you a `RegisteredSeller.metadataURI`,
 * fetch that JSON and call `parseSellerProfileDocument` (throwing) or
 * `tryParseSellerProfileDocument` (null on failure) to read it.
 */

import {
    asAddress,
    asOptionalAddress,
    asOptionalString,
    asRecord,
    asString,
    type UnknownRecord,
} from "./documentParse.js";

// ── Dependent identity types ──────────────────────────────────────────────────

/**
 * The tokens a seller accepts for settlement. Token acceptance IS identity —
 * the set of tokens a seller bonds in defines their coordination surface and
 * value system. Distinct from the catalogue (the seller's items).
 */
export interface AcceptedTokenMetadata {
    /** ERC-20 contract address. */
    address: `0x${string}`;
    /** Token symbol, e.g. "USDC", "FLORIN". */
    symbol: string;
    /** Human-readable name. */
    name?: string;
    /** URI (IPFS or HTTP) to the token logo. */
    logoURI?: string;
}

/**
 * The seller's branding (identity / presentation). A distinct concern from the
 * catalogue (the seller's items) and the rest of the profile.
 */
export interface SellerBrandingMetadata {
    logoURI?: string;
}

// ── Profile sub-types ─────────────────────────────────────────────────────────

/** Service endpoints an autonomous agent declares (ERC-8004 interop). */
export interface SellerAgentServices {
    mcp?: string;
    a2a?: string;
    rest?: string;
    did?: string;
    ens?: string;
}

/** Asset URIs associated with the seller's branding. */
export interface SellerAssetReferences {
    imageBaseURI?: string;
}

/** Geographic anchor for the seller. */
interface SellerLocation {
    geohash: string;
    addressText?: string;
}

/**
 * Designates the wallets the seller entrusts as counterparties on
 * this assembly's sub-orders, keyed by the sub-order's process clause.
 *
 * Example: a seller bound to `local-commerce-merchant-delivery` has
 * a `counterpartyBindings[{ clauseId: "figaro-courier-process",
 * addresses: [0xA, 0xB] }]` entry. At checkout, the cart fills the
 * courier sub-order's seller field from this list. Without this field
 * the cart has nowhere to read the counterparty's wallet from — the
 * assembly defines the topology, but the seller's profile binds it
 * to concrete wallets.
 */
export interface CounterpartyBinding {
    /** Process clause anchored on the sub-order this binding targets
     *  (e.g. a courier-process clause). The clauseId is the
     *  structural marker for what kind of off-chain seller the
     *  sub-order needs. */
    clauseId: string;
    /** Wallets the seller is willing to designate. Order is
     *  significant — checkout picks the first reachable one (or
     *  surfaces the list to the buyer). */
    addresses: `0x${string}`[];
}

export interface AssemblyBindingRecord {
    bindingId: string;
    subjectAddress: `0x${string}`;
    assemblySlug: string;
    counterpartyBindings?: CounterpartyBinding[];
}

/**
 * The seller profile document.
 *
 * `name` is required; everything else is optional. The form's submit
 * path writes only the fields the seller filled in. Discovery URLs
 * are address-shaped (`/s/<address>`) — the wallet is the seller's
 * canonical identifier, not a human-readable handle.
 */
export interface SellerProfileMetadata {
    /**
     * Wallet address that owns this profile. Optional in the on-chain-pinned
     * shape (the kernel binds wallet → metadataURI; the profile does not
     * need to repeat the wallet). Present when the profile is materialised
     * by an indexer or fixture loader, where multiple profiles live in a
     * single array and the address is the join key.
     */
    subjectAddress?: `0x${string}`;
    /** Human-readable name. */
    name: string;
    /** Free-form description. */
    description?: string;
    /** Free-form self-description ("Italian café", "immigration law", "bicycle repair"). Not a closed taxonomy. */
    specialty?: string;
    /** Geographic anchor — geohash plus optional human-readable address. */
    location?: SellerLocation;
    /** Branding (logo, hero, accent, theme class). Pinned on the profile so buyer frontends can skin against the seller's identity. */
    branding?: SellerBrandingMetadata;
    /** External asset references (CSS, image base URI). Pinned on the profile. */
    assets?: SellerAssetReferences;
    /**
     * The set of ERC-20s the seller accepts for settlement. Token
     * acceptance is an identity declaration: each token signals which
     * value system the seller coordinates with — stablecoins for
     * legal-system alignment, DAO governance tokens for community
     * membership in that DAO, ETH for settlement-layer alignment,
     * commodity-backed tokens for value anchoring. It is not a
     * financial-market position.
     */
    acceptedTokens?: AcceptedTokenMetadata[];
    /**
     * The token in which the catalogue is denominated. Must be the
     * address of one of the entries in `acceptedTokens`. Frontends
     * convert from this default to whatever accepted token the buyer
     * commits in via Uniswap quote at commit time.
     */
    defaultTokenAddress?: `0x${string}`;
    /**
     * PROFILE-authored clause values — SELLER master data for any registered
     * clause declaring `block.profileSourced` (the seller-level sibling of the
     * catalogue's per-item `clauseValues`): keyed clauseId → field → value,
     * restricted by each spec's declared profile-authored subset. Examples:
     * `figaro-dimweight`'s `divisor` (the seller's shipping convention, e.g.
     * ~5000 metric), `figaro-credential`'s `credentialId` (a declared license
     * number). Checkout folds these onto composed profile-sourced leaves.
     * Absent when the seller authors none.
     */
    profileClauseValues?: Record<string, Record<string, unknown>>;
    /**
     * Assembly bindings — one entry per assembly the wallet
     * participates in. Counterparty wallet designations live inside
     * each binding's `counterpartyBindings`. The role the seller
     * plays in an assembly is event-derived, not declared here. See
     * `AssemblyBindingRecord` above for the shape.
     */
    assemblyBindings?: AssemblyBindingRecord[];
    /** ERC-8004 agent service endpoints (mcp, a2a, rest, did, ens). */
    services?: SellerAgentServices;
    /** IPFS URI of the wallet's catalogue document. */
    catalogueURI?: string;
}

/** Parse the profile-authored clause-values map (clauseId → field → value).
 *  Shape-checked only — per-clause content validity is the Layer-A
 *  validator's job at the points that consume the values. */
function parseProfileClauseValues(
    value: unknown,
    path: string,
): Record<string, Record<string, unknown>> | undefined {
    if (value === undefined) return undefined;
    const record = asRecord(value, path);
    const out: Record<string, Record<string, unknown>> = {};
    for (const [clauseId, fields] of Object.entries(record)) {
        out[clauseId] = asRecord(fields, `${path}.${clauseId}`);
    }
    return out;
}

// ── Assembly-binding parser helpers ──────────────────────────────────────────

function parseCounterpartyBindingArray(value: unknown, path: string): CounterpartyBinding[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }
    return value.map((entry, index) => {
        const record = asRecord(entry, `${path}[${index}]`);
        const addressesRaw = record.addresses;
        if (!Array.isArray(addressesRaw)) {
            throw new Error(`${path}[${index}].addresses must be an array of addresses.`);
        }
        const addresses = addressesRaw.map((addr, j) =>
            asAddress(addr, `${path}[${index}].addresses[${j}]`),
        );
        return {
            clauseId: asString(record.clauseId, `${path}[${index}].clauseId`),
            addresses,
        };
    });
}

function parseAssemblyBindingDocument(value: unknown, sourceLabel = "institution binding"): AssemblyBindingRecord {
    const record = asRecord(value, sourceLabel);
    return {
        bindingId: asString(record.bindingId, `${sourceLabel}.bindingId`),
        subjectAddress: asAddress(record.subjectAddress, `${sourceLabel}.subjectAddress`),
        assemblySlug: asString(record.assemblySlug, `${sourceLabel}.assemblySlug`),
        counterpartyBindings: parseCounterpartyBindingArray(record.counterpartyBindings, `${sourceLabel}.counterpartyBindings`),
    };
}

// ── Type-specific parsers ────────────────────────────────────────────────────

function parseAcceptedToken(value: unknown, path: string): AcceptedTokenMetadata {
    const record = asRecord(value, path);
    return {
        address: asAddress(record.address, `${path}.address`),
        symbol: asString(record.symbol, `${path}.symbol`),
        name: asOptionalString(record.name, `${path}.name`),
        logoURI: asOptionalString(record.logoURI, `${path}.logoURI`),
    };
}

function parseAcceptedTokens(value: unknown, path: string): AcceptedTokenMetadata[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }
    return value.map((entry, index) => {
        // Tolerate bare-address strings from legacy profiles; upgrade in place.
        if (typeof entry === "string") {
            return {
                address: asAddress(entry, `${path}[${index}]`),
                symbol: "",
            };
        }
        return parseAcceptedToken(entry, `${path}[${index}]`);
    });
}

function parseLocation(value: unknown, path: string): SellerLocation | undefined {
    if (value === undefined) return undefined;
    // Tolerate legacy free-form string by wrapping into a stub geohash entry.
    if (typeof value === "string") {
        return value.trim() ? { geohash: "", addressText: value } : undefined;
    }
    const record = asRecord(value, path);
    return {
        geohash: asString(record.geohash, `${path}.geohash`),
        addressText: asOptionalString(record.addressText, `${path}.addressText`),
    };
}

function parseAgentServicesField(value: unknown, path: string): SellerAgentServices | undefined {
    if (value === undefined) return undefined;
    const record = asRecord(value, path);
    return {
        mcp: asOptionalString(record.mcp, `${path}.mcp`),
        a2a: asOptionalString(record.a2a, `${path}.a2a`),
        rest: asOptionalString(record.rest, `${path}.rest`),
        did: asOptionalString(record.did, `${path}.did`),
        ens: asOptionalString(record.ens, `${path}.ens`),
    };
}

function parseBrandingField(value: unknown, path: string): SellerBrandingMetadata | undefined {
    if (value === undefined) return undefined;
    const record = asRecord(value, path);
    return {
        logoURI: asOptionalString(record.logoURI, `${path}.logoURI`),
    };
}

function parseAssetsField(value: unknown, path: string): SellerAssetReferences | undefined {
    if (value === undefined) return undefined;
    const record = asRecord(value, path);
    return {
        imageBaseURI: asOptionalString(record.imageBaseURI, `${path}.imageBaseURI`),
    };
}

function parseAssemblyBindings(value: unknown, path: string): AssemblyBindingRecord[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }
    return value.map((entry, index) =>
        parseAssemblyBindingDocument(entry, `${path}[${index}]`)
    );
}

// ── Parsers ───────────────────────────────────────────────────────────────────

/**
 * Strict parse — throws on validation failure. Use when a malformed
 * document should surface as an explicit error (e.g. round-trip
 * validation before pinning a profile).
 */
export function parseSellerProfileDocument(
    value: unknown,
    sourceLabel = "seller profile metadata",
): SellerProfileMetadata {
    const record = asRecord(value, sourceLabel);

    return {
        subjectAddress: record.subjectAddress === undefined
            ? undefined
            : asAddress(record.subjectAddress, `${sourceLabel}.subjectAddress`),
        name: asString(record.name, `${sourceLabel}.name`),
        description: asOptionalString(record.description, `${sourceLabel}.description`),
        specialty: asOptionalString(record.specialty, `${sourceLabel}.specialty`),
        location: parseLocation(record.location, `${sourceLabel}.location`),
        branding: parseBrandingField(record.branding, `${sourceLabel}.branding`),
        assets: parseAssetsField(record.assets, `${sourceLabel}.assets`),
        acceptedTokens: parseAcceptedTokens(record.acceptedTokens, `${sourceLabel}.acceptedTokens`),
        defaultTokenAddress: asOptionalAddress(record.defaultTokenAddress, `${sourceLabel}.defaultTokenAddress`),
        profileClauseValues: parseProfileClauseValues(record.profileClauseValues, `${sourceLabel}.profileClauseValues`),
        assemblyBindings: parseAssemblyBindings(record.assemblyBindings, `${sourceLabel}.assemblyBindings`),
        services: parseAgentServicesField(record.services, `${sourceLabel}.services`),
        catalogueURI: asOptionalString(record.catalogueURI, `${sourceLabel}.catalogueURI`),
    };
}

/**
 * Lenient parse — returns null instead of throwing. Use in discovery
 * paths where a malformed seller should be silently dropped from the
 * surface (e.g. building a seller-catalogue list).
 */
export function tryParseSellerProfileDocument(
    value: unknown,
    sourceLabel?: string,
): SellerProfileMetadata | null {
    try {
        return parseSellerProfileDocument(value, sourceLabel);
    } catch {
        return null;
    }
}

// ── Convenience projections (used by call-sites that need a subset) ───────────

export interface AgentServiceInfo {
    services: SellerAgentServices;
    capabilities: string[];
    isAgent: boolean;
}

/**
 * Project agent-service fields from a profile-shaped document. Tolerates
 * partial documents (the caller may have fetched something that is not a
 * full profile but still carries `services`) AND tolerates malformed
 * individual service fields (non-string values are dropped rather than
 * causing the whole projection to fail). Returns `isAgent: false` when
 * no `services` object is present or the document is not an object.
 */
export function projectAgentServices(value: unknown): AgentServiceInfo {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { services: {}, capabilities: [], isAgent: false };
    }
    const record = value as UnknownRecord;
    const rawServices = record.services;
    if (!rawServices || typeof rawServices !== "object" || Array.isArray(rawServices)) {
        return { services: {}, capabilities: [], isAgent: false };
    }

    const s = rawServices as UnknownRecord;
    const services: SellerAgentServices = {
        mcp: typeof s.mcp === "string" ? s.mcp : undefined,
        a2a: typeof s.a2a === "string" ? s.a2a : undefined,
        rest: typeof s.rest === "string" ? s.rest : undefined,
        did: typeof s.did === "string" ? s.did : undefined,
        ens: typeof s.ens === "string" ? s.ens : undefined,
    };
    const capabilities = Array.isArray(record.capabilities)
        ? (record.capabilities as unknown[]).filter((c): c is string => typeof c === "string")
        : [];

    return {
        services,
        capabilities,
        isAgent: true,
    };
}
