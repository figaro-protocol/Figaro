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

import applicableLawSpec from "./examples/figaro-applicable-law.json" with { type: "json" };
import arbitrationKlerosSpec from "./examples/figaro-arbitration-kleros.json" with { type: "json" };
import commerceSpec from "./examples/figaro-commerce.json" with { type: "json" };
import consentSpec from "./examples/figaro-consent.json" with { type: "json" };
import coordinationSpec from "./examples/figaro-coordination.json" with { type: "json" };
import courierProcessSpec from "./examples/figaro-courier-process.json" with { type: "json" };
import modalitiesSpec from "./examples/figaro-modalities.json" with { type: "json" };
import handoffSpec from "./examples/figaro-handoff.json" with { type: "json" };
import geoSpec from "./examples/figaro-geo.json" with { type: "json" };
import ghgCustomSpec from "./examples/figaro-ghg-custom.json" with { type: "json" };
import ghgEN16258Spec from "./examples/figaro-ghg-en-16258.json" with { type: "json" };
import ghgISO14064Spec from "./examples/figaro-ghg-iso-14064.json" with { type: "json" };
import ghgMeasurementSpec from "./examples/figaro-ghg-measurement.json" with { type: "json" };
import ghgPAS2050Spec from "./examples/figaro-ghg-pas-2050.json" with { type: "json" };
import ghgProtocolSpec from "./examples/figaro-ghg-protocol.json" with { type: "json" };
import merchantProcessSpec from "./examples/figaro-merchant-process.json" with { type: "json" };
import offsetPolicySpec from "./examples/figaro-offset-policy.json" with { type: "json" };
import proximityPolicySpec from "./examples/figaro-proximity-policy.json" with { type: "json" };
import proximityProofSpec from "./examples/figaro-proximity-proof.json" with { type: "json" };
import topologySpec from "./examples/figaro-topology.json" with { type: "json" };

const RAW_SPECS: Readonly<Record<string, unknown>> = {
    "figaro-applicable-law": applicableLawSpec,
    "figaro-arbitration-kleros": arbitrationKlerosSpec,
    "figaro-commerce": commerceSpec,
    "figaro-consent": consentSpec,
    "figaro-coordination": coordinationSpec,
    "figaro-courier-process": courierProcessSpec,
    "figaro-modalities": modalitiesSpec,
    "figaro-handoff": handoffSpec,
    "figaro-geo": geoSpec,
    "figaro-ghg-custom": ghgCustomSpec,
    "figaro-ghg-en-16258": ghgEN16258Spec,
    "figaro-ghg-iso-14064": ghgISO14064Spec,
    "figaro-ghg-measurement": ghgMeasurementSpec,
    "figaro-ghg-pas-2050": ghgPAS2050Spec,
    "figaro-ghg-protocol": ghgProtocolSpec,
    "figaro-merchant-process": merchantProcessSpec,
    "figaro-offset-policy": offsetPolicySpec,
    "figaro-proximity-policy": proximityPolicySpec,
    "figaro-proximity-proof": proximityProofSpec,
    "figaro-topology": topologySpec,
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
