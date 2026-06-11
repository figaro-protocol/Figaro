/**
 * Test-only ergonomics: build the nested, spec-named `ClauseFields` shape
 * (clauseId → field values) from a concise flat input. Production builds the
 * nested shape directly — this adapter exists ONLY so test data stays readable
 * (`cf({ origin, modality })`) instead of spelling out the nesting
 * by hand. Do NOT use it in app code; the flat vocabulary is gone from the
 * commit path on purpose.
 */
import type { ClauseFields } from "@/lib/core/encoding";

// Tests may name clauses; production code may not (the registry defines the
// open set at runtime; lib/ finds sections by spec-declared fields). These
// literals mirror the canonical Layer-A example specs.
const GEO_CLAUSE_KEY = "figaro-geo-v2";
const MODALITIES_CLAUSE_KEY = "figaro-modalities-v1";
const COORDINATION_CLAUSE_KEY = "figaro-coordination-v1";
const HANDOFF_CLAUSE_KEY = "figaro-handoff-v1";
const PROXIMITY_POLICY_CLAUSE_KEY = "figaro-proximity-policy-v1";
const MERCHANT_PROCESS_CLAUSE_KEY = "figaro-merchant-process-v1";
const COURIER_PROCESS_CLAUSE_KEY = "figaro-courier-process-v1";
const ARBITRATION_KLEROS_CLAUSE_KEY = "figaro-arbitration-kleros-v1";
const APPLICABLE_LAW_CLAUSE_KEY = "figaro-applicable-law-v1";
const CONSENT_CLAUSE_KEY = "figaro-consent-v1";

export interface FlatClauseFields {
    /** Spec-named geo fields (figaro-geo-v2). The legacy origin/mass/class_
     *  vocabulary and its unit-string parsing died with the per-clause
     *  encoder map — tests compose what production composes. */
    originGeohash?: string;
    destinationGeohash?: string;
    massGrams?: number;
    volumeMl?: number;
    classOfService?: string;
    /** Single-select modality (figaro-modalities-v1). */
    modality?: string;
    /** Single-select coordination (figaro-coordination-v1). */
    coordination?: string;
    handoffPoints?: string[];
    proximityBands?: string[];
    /** clauseIds of the selected GHG disclosure clauses. */
    ghgStandards?: string[];
    merchantProcessIncluded?: boolean;
    courierProcessIncluded?: boolean;
    klerosCourt?: string;
    klerosMinJurors?: string | number;
    applicableLaw?: string;
    forum?: string;
    language?: string;
    consentDocuments?: Array<Record<string, string>>;
}

export function cf(flat: FlatClauseFields): ClauseFields {
    const out: ClauseFields = {};

    const geo: Record<string, unknown> = {};
    if (flat.originGeohash !== undefined) geo.originGeohash = flat.originGeohash;
    if (flat.destinationGeohash !== undefined) geo.destinationGeohash = flat.destinationGeohash;
    if (flat.massGrams !== undefined) geo.massGrams = flat.massGrams;
    if (flat.volumeMl !== undefined) geo.volumeMl = flat.volumeMl;
    if (flat.classOfService !== undefined) geo.classOfService = flat.classOfService;
    if (Object.keys(geo).length > 0) out[GEO_CLAUSE_KEY] = geo;

    if (flat.modality) out[MODALITIES_CLAUSE_KEY] = { modality: flat.modality };
    if (flat.coordination) out[COORDINATION_CLAUSE_KEY] = { coordination: flat.coordination };

    // hand-off is its own clause now (figaro-handoff-v1).
    if (flat.handoffPoints) out[HANDOFF_CLAUSE_KEY] = { handoff: flat.handoffPoints };
    if (flat.proximityBands) out[PROXIMITY_POLICY_CLAUSE_KEY] = { bands: flat.proximityBands };
    for (const clauseId of flat.ghgStandards ?? []) out[clauseId] = {};
    if (flat.merchantProcessIncluded) out[MERCHANT_PROCESS_CLAUSE_KEY] = {};
    if (flat.courierProcessIncluded) out[COURIER_PROCESS_CLAUSE_KEY] = {};

    if (flat.klerosCourt) {
        out[ARBITRATION_KLEROS_CLAUSE_KEY] = {
            klerosCourt: flat.klerosCourt,
            ...(flat.klerosMinJurors !== undefined ? { klerosMinJurors: flat.klerosMinJurors } : {}),
        };
    }
    if (flat.applicableLaw) {
        out[APPLICABLE_LAW_CLAUSE_KEY] = {
            applicableLaw: flat.applicableLaw,
            ...(flat.forum ? { forum: flat.forum } : {}),
            ...(flat.language ? { language: flat.language } : {}),
        };
    }
    if (flat.consentDocuments) out[CONSENT_CLAUSE_KEY] = { documents: flat.consentDocuments };

    return out;
}
