/**
 * Embedded protocol clause specs — TypeScript mirror of
 * `prover/clause/src/embedded.rs`.
 *
 * Bundles the 20 Figaro protocol spec JSONs from `./examples/` so SDK
 * consumers (agreement encoder, validator wrappers, etc.) can look up
 * a canonical spec by its human-readable clauseId without an
 * out-of-band fetch. Specs are parsed lazily on first lookup and
 * cached.
 *
 * The Layer-A source of truth is `sdk/src/clauses/examples/<clauseId>.json`
 * (the canonical specs `populate-clauses.mjs` pins to IPFS; the frontend
 * loads them chain→IPFS with no bundled copy). The Rust prover embeds the
 * same files directly via `include_str!`.
 */

import { parseClauseSpec, type ClauseSpec } from "./spec.js";

import applicableLawSpec from "./examples/figaro-applicable-law-v1.json" with { type: "json" };
import arbitrationKlerosSpec from "./examples/figaro-arbitration-kleros-v1.json" with { type: "json" };
import commerceSpec from "./examples/figaro-commerce-v1.json" with { type: "json" };
import consentSpec from "./examples/figaro-consent-v1.json" with { type: "json" };
import coordinationSpec from "./examples/figaro-coordination-v1.json" with { type: "json" };
import courierProcessSpec from "./examples/figaro-courier-process-v1.json" with { type: "json" };
import modalitiesSpec from "./examples/figaro-modalities-v1.json" with { type: "json" };
import handoffSpec from "./examples/figaro-handoff-v1.json" with { type: "json" };
import geoSpec from "./examples/figaro-geo-v2.json" with { type: "json" };
import ghgCustomSpec from "./examples/figaro-ghg-custom-v1.json" with { type: "json" };
import ghgEN16258Spec from "./examples/figaro-ghg-en-16258-v1.json" with { type: "json" };
import ghgISO14064Spec from "./examples/figaro-ghg-iso-14064-v1.json" with { type: "json" };
import ghgMeasurementSpec from "./examples/figaro-ghg-measurement-v1.json" with { type: "json" };
import ghgPAS2050Spec from "./examples/figaro-ghg-pas-2050-v1.json" with { type: "json" };
import ghgProtocolSpec from "./examples/figaro-ghg-protocol-v1.json" with { type: "json" };
import merchantProcessSpec from "./examples/figaro-merchant-process-v1.json" with { type: "json" };
import offsetPolicySpec from "./examples/figaro-offset-policy-v1.json" with { type: "json" };
import proximityPolicySpec from "./examples/figaro-proximity-policy-v1.json" with { type: "json" };
import proximityProofSpec from "./examples/figaro-proximity-proof-v1.json" with { type: "json" };
import topologySpec from "./examples/figaro-topology-v1.json" with { type: "json" };

const RAW_SPECS: Readonly<Record<string, unknown>> = {
    "figaro-applicable-law-v1": applicableLawSpec,
    "figaro-arbitration-kleros-v1": arbitrationKlerosSpec,
    "figaro-commerce-v1": commerceSpec,
    "figaro-consent-v1": consentSpec,
    "figaro-coordination-v1": coordinationSpec,
    "figaro-courier-process-v1": courierProcessSpec,
    "figaro-modalities-v1": modalitiesSpec,
    "figaro-handoff-v1": handoffSpec,
    "figaro-geo-v2": geoSpec,
    "figaro-ghg-custom-v1": ghgCustomSpec,
    "figaro-ghg-en-16258-v1": ghgEN16258Spec,
    "figaro-ghg-iso-14064-v1": ghgISO14064Spec,
    "figaro-ghg-measurement-v1": ghgMeasurementSpec,
    "figaro-ghg-pas-2050-v1": ghgPAS2050Spec,
    "figaro-ghg-protocol-v1": ghgProtocolSpec,
    "figaro-merchant-process-v1": merchantProcessSpec,
    "figaro-offset-policy-v1": offsetPolicySpec,
    "figaro-proximity-policy-v1": proximityPolicySpec,
    "figaro-proximity-proof-v1": proximityProofSpec,
    "figaro-topology-v1": topologySpec,
};

let PARSED_CACHE: Map<string, ClauseSpec> | null = null;

function buildCache(): Map<string, ClauseSpec> {
    const cache = new Map<string, ClauseSpec>();
    for (const [key, raw] of Object.entries(RAW_SPECS)) {
        const result = parseClauseSpec(raw);
        if (result.ok) {
            cache.set(key, result.spec);
        } else {
            // Embedded specs are committed to the repo and validated by
            // conformance tests — a parse failure here is a build-time
            // invariant break, not a runtime case to handle.
            throw new Error(
                `embedded spec for ${key} failed to parse: ${JSON.stringify(result.errors)}`,
            );
        }
    }
    return cache;
}

/**
 * Look up a parsed `ClauseSpec` by its human-readable clauseId.
 * Returns `undefined` for unknown clauseIds (third-party clauses not
 * embedded in the SDK).
 */
export function embeddedSpec(clauseId: string): ClauseSpec | undefined {
    if (!PARSED_CACHE) {
        PARSED_CACHE = buildCache();
    }
    return PARSED_CACHE.get(clauseId);
}

/**
 * Iterate over every embedded `(clauseId, spec)` pair. Useful for
 * conformance tests + drift checks against the Rust embedded set.
 */
export function allEmbeddedSpecs(): Array<[string, ClauseSpec]> {
    if (!PARSED_CACHE) {
        PARSED_CACHE = buildCache();
    }
    return Array.from(PARSED_CACHE.entries());
}
