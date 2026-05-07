/**
 * lib/shared/operatorProfileMetadata.ts
 *
 * Strict parser for the operator profile document — the JSON pinned to
 * IPFS by the operator-onboarding form and pointed to by
 * `OperatorRegistry.metadataURI`.
 *
 * Single source of truth for the document shape. Replaces the three
 * lenient parsers that previously inspected this document independently
 * (`tryParseOperatorProfile` in `operatorProfileAdapter`, `parseAgentServices`
 * in `useOperatorRegistry`, and `fetchMerchantBranding`'s passthrough
 * extraction in `merchantBranding`). Each call-site now projects the
 * fields it needs from the canonical parsed shape.
 *
 * Carries no role / archetype / category field — what an address does is
 * reconstructed from on-chain events via the indexer, never from a
 * metadata-document field. See `feedback_state_from_events.md`.
 */

import type { SellerBrandingMetadata } from "@/lib/shared/sellerCatalogueMetadata";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Service endpoints an autonomous agent declares (ERC-8004 interop). */
export interface OperatorAgentServices {
    mcp?: string;
    a2a?: string;
    rest?: string;
    did?: string;
    ens?: string;
}

/** Asset URIs associated with the operator's branding. */
export interface OperatorAssetReferences {
    cssURI?: string;
    imageBaseURI?: string;
}

/**
 * The operator profile document.
 *
 * `name` is required; everything else is optional. The form's submit
 * path writes only the fields the operator filled in.
 *
 * Note: `serviceTypes` is retained for backwards compatibility with
 * legacy fixtures that pre-date catalogue-derived fulfillment-mode
 * resolution. It is NOT a structured categorization of the operator;
 * it carries fulfillment hints only and will be dropped once the
 * catalogue's `fulfillmentModes` is wired through to discovery.
 */
export interface OperatorProfileMetadata {
    name: string;
    description?: string;
    location?: string;
    catalogueURI?: string;
    /** ERC-20 contract addresses the operator accepts for settlement. */
    acceptedTokens?: `0x${string}`[];
    /** Allocation mechanisms the operator declares (legacy; planned for removal). */
    mechanisms?: string[];
    /** ERC-8004 agent service endpoints (mcp, a2a, rest, did, ens). */
    services?: OperatorAgentServices;
    /** Free-form capability declarations for agent-flavoured operators. */
    capabilities?: string[];
    /** Branding (logo, hero, accent, theme class). */
    branding?: SellerBrandingMetadata;
    /** External asset references (CSS, image base URI). */
    assets?: OperatorAssetReferences;
    /** Legacy fulfillment-type hints (deprecated; will be dropped). */
    serviceTypes?: string[];
    /** Document-shape version. */
    version?: string;
}

// ── Validation primitives (mirror the catalogue parser's helpers) ──────────────

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown, path: string): UnknownRecord {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${path} must be an object.`);
    }
    return value as UnknownRecord;
}

function asString(value: unknown, path: string): string {
    if (typeof value !== "string") {
        throw new Error(`${path} must be a string.`);
    }
    return value;
}

function asOptionalString(value: unknown, path: string): string | undefined {
    if (value === undefined) return undefined;
    return asString(value, path);
}

function asOptionalStringArray(value: unknown, path: string): string[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }
    return value.map((entry, index) => asString(entry, `${path}[${index}]`));
}

function asAddress(value: unknown, path: string): `0x${string}` {
    const address = asString(value, path);
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        throw new Error(`${path} must be a 20-byte hex address.`);
    }
    return address as `0x${string}`;
}

function parseAcceptedTokenAddresses(value: unknown, path: string): `0x${string}`[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }
    return value.map((entry, index) => {
        if (typeof entry === "string") {
            return asAddress(entry, `${path}[${index}]`);
        }
        // Tolerate { address, ... } shapes pre-emptively — the form has
        // historically read either bare-string or object-with-address.
        if (entry && typeof entry === "object" && !Array.isArray(entry)) {
            const record = entry as UnknownRecord;
            return asAddress(record.address, `${path}[${index}].address`);
        }
        throw new Error(`${path}[${index}] must be a 20-byte hex address or an object with an address field.`);
    });
}

function parseAgentServicesField(value: unknown, path: string): OperatorAgentServices | undefined {
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
        displayName: asOptionalString(record.displayName, `${path}.displayName`),
        logoURI: asOptionalString(record.logoURI, `${path}.logoURI`),
        heroImageURI: asOptionalString(record.heroImageURI, `${path}.heroImageURI`),
        accentColor: asOptionalString(record.accentColor, `${path}.accentColor`),
        themeClass: asOptionalString(record.themeClass, `${path}.themeClass`),
    };
}

function parseAssetsField(value: unknown, path: string): OperatorAssetReferences | undefined {
    if (value === undefined) return undefined;
    const record = asRecord(value, path);
    return {
        cssURI: asOptionalString(record.cssURI, `${path}.cssURI`),
        imageBaseURI: asOptionalString(record.imageBaseURI, `${path}.imageBaseURI`),
    };
}

// ── Parsers ───────────────────────────────────────────────────────────────────

/**
 * Strict parse — throws on validation failure. Use when a malformed
 * document should surface as an explicit error (e.g. round-trip
 * validation in `publishOperatorProfile`).
 */
export function parseOperatorProfileDocument(
    value: unknown,
    sourceLabel = "operator profile metadata",
): OperatorProfileMetadata {
    const record = asRecord(value, sourceLabel);

    return {
        name: asString(record.name, `${sourceLabel}.name`),
        description: asOptionalString(record.description, `${sourceLabel}.description`),
        location: asOptionalString(record.location, `${sourceLabel}.location`),
        catalogueURI: asOptionalString(record.catalogueURI, `${sourceLabel}.catalogueURI`),
        acceptedTokens: parseAcceptedTokenAddresses(record.acceptedTokens, `${sourceLabel}.acceptedTokens`),
        mechanisms: asOptionalStringArray(record.mechanisms, `${sourceLabel}.mechanisms`),
        services: parseAgentServicesField(record.services, `${sourceLabel}.services`),
        capabilities: asOptionalStringArray(record.capabilities, `${sourceLabel}.capabilities`),
        branding: parseBrandingField(record.branding, `${sourceLabel}.branding`),
        assets: parseAssetsField(record.assets, `${sourceLabel}.assets`),
        serviceTypes: asOptionalStringArray(record.serviceTypes, `${sourceLabel}.serviceTypes`),
        version: asOptionalString(record.version, `${sourceLabel}.version`),
    };
}

/**
 * Lenient parse — returns null instead of throwing. Use in discovery
 * paths where a malformed operator should be silently dropped from the
 * surface (e.g. `discoveryService` building a restaurant list).
 */
export function tryParseOperatorProfileDocument(
    value: unknown,
    sourceLabel?: string,
): OperatorProfileMetadata | null {
    try {
        return parseOperatorProfileDocument(value, sourceLabel);
    } catch {
        return null;
    }
}

// ── Convenience projections (used by call-sites that need a subset) ───────────

export interface AgentServiceInfo {
    services: OperatorAgentServices;
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
    const services: OperatorAgentServices = {
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
