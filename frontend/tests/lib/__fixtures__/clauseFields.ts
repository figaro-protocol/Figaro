/**
 * Test-only ergonomics: build the nested, spec-named `ClauseFields` shape
 * (clauseId → field values) from a concise flat input. Production builds the
 * nested shape directly — this adapter exists ONLY so test data stays readable
 * (`cf({ origin, fulfilmentModalities })`) instead of spelling out the nesting
 * by hand. Do NOT use it in app code; the flat vocabulary is gone from the
 * commit path on purpose.
 */
import type { ClauseFields } from "@/lib/core/encoding";
import {
    GEO_CLAUSE_KEY,
    FULFILMENT_V2_CLAUSE_KEY,
    PROXIMITY_POLICY_CLAUSE_KEY,
    MERCHANT_PROCESS_CLAUSE_KEY,
    COURIER_PROCESS_CLAUSE_KEY,
    ARBITRATION_KLEROS_CLAUSE_KEY,
    APPLICABLE_LAW_CLAUSE_KEY,
    CONSENT_CLAUSE_KEY,
} from "@/lib/core/agreement";

export interface FlatClauseFields {
    origin?: string;
    destination?: string;
    mass?: string;
    volume?: string;
    class_?: string;
    fulfilmentModalities?: string[];
    fulfilmentCoordinations?: string[];
    fulfilmentHandoffPoints?: string[];
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
    if (flat.origin !== undefined) geo.origin = flat.origin;
    if (flat.destination !== undefined) geo.destination = flat.destination;
    if (flat.mass !== undefined) geo.mass = flat.mass;
    if (flat.volume !== undefined) geo.volume = flat.volume;
    if (flat.class_ !== undefined) geo.class_ = flat.class_;
    if (Object.keys(geo).length > 0) out[GEO_CLAUSE_KEY] = geo;

    const ful: Record<string, unknown> = {};
    if (flat.fulfilmentModalities) ful.modalities = flat.fulfilmentModalities;
    if (flat.fulfilmentCoordinations) ful.coordinations = flat.fulfilmentCoordinations;
    if (flat.fulfilmentHandoffPoints) ful.handoffPoints = flat.fulfilmentHandoffPoints;
    if (Object.keys(ful).length > 0) out[FULFILMENT_V2_CLAUSE_KEY] = ful;

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
