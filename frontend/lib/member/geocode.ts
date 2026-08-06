/**
 * lib/member/geocode.ts
 *
 * Free-form address-text → lat/lon resolution, straight from the
 * browser to a Nominatim-compatible geocoder — OpenStreetMap's public
 * instance by default, the user's own via the /settings override
 * (`lib/shared/userEndpoints`). There is no server in between: the
 * former `/api/geocode` proxy was retired (no-PP/ToS ruling,
 * 2026-07-09) so the typed address travels from the user's browser to
 * the third party and nowhere else — only on an explicit action,
 * disclosed at the input.
 *
 * Trade-off carried knowingly: some privacy extensions (uBlock
 * Origin, Privacy Badger, Brave Shields) block Nominatim as a
 * tracker. That failure surfaces as `network-error` and the form's
 * message names extensions as the likely cause; pointing the
 * geocoder override at another Nominatim-compatible endpoint is the
 * user-custody remedy.
 *
 * Returns a discriminated outcome — callers can distinguish
 * "no match for this query" from "we couldn't reach the geocoder" and
 * surface a useful message.
 */

import { extractErrorMessage } from "@/lib/shared/errors";
import { fetchCappedContent, type CappedContentResponse } from "@/lib/shared/ipfsService";
import { safeJsonParse } from "@/lib/shared/safeJson";
import { readUserEndpoints } from "@/lib/shared/userEndpoints";

interface GeocodeResult {
    lat: number;
    lon: number;
}

export type GeocodeFailureReason =
    /** The query was empty after trimming. */
    | "empty-query"
    /** Nominatim returned 0 results. */
    | "no-match"
    /** HTTP error (non-2xx response). */
    | "http-error"
    /** Network failure (CORS, DNS, offline, browser block). */
    | "network-error"
    /** Response wasn't an array, or first row had non-numeric lat/lon. */
    | "malformed";

export type GeocodeOutcome =
    | { ok: true; result: GeocodeResult }
    | { ok: false; reason: GeocodeFailureReason; detail?: string };

const DEFAULT_GEOCODER_URL = "https://nominatim.openstreetmap.org/search";

/** The Nominatim-compatible search endpoint at call time — the user's
 *  /settings override, else OpenStreetMap's public instance. */
function activeGeocoderUrl(): string {
    return readUserEndpoints().geocodeUrl ?? DEFAULT_GEOCODER_URL;
}

/**
 * Resolve an address string to lat/lon. Returns a structured outcome;
 * the caller decides how to surface each failure reason.
 */
export async function geocodeAddress(query: string): Promise<GeocodeOutcome> {
    const trimmed = query.trim();
    if (!trimmed) return { ok: false, reason: "empty-query" };

    let res: CappedContentResponse;
    try {
        const url = `${activeGeocoderUrl()}?q=${encodeURIComponent(trimmed)}&format=json&limit=1`;
        // Size-capped fetch (F4): the geocoder endpoint is user-configured —
        // an oversized response from a hostile override OOMs the same tab an
        // IPFS document would. Oversize throws → `network-error`, whose detail
        // names the cap.
        res = await fetchCappedContent(url, {
            fetch: (u, init) => fetch(u, { ...init, headers: { Accept: "application/json" } }),
        });
    } catch (err) {
        return {
            ok: false,
            reason: "network-error",
            detail: extractErrorMessage(err, String(err)),
        };
    }

    if (!res.ok) {
        return { ok: false, reason: "http-error", detail: `HTTP ${res.status}` };
    }

    let data: unknown;
    try {
        // Prototype-pollution-safe parse (finding 7): the response comes from a
        // user-configurable geocoding endpoint — untrusted network JSON.
        data = safeJsonParse(await res.text());
    } catch (err) {
        return {
            ok: false,
            reason: "malformed",
            detail: extractErrorMessage(err, String(err)),
        };
    }

    if (data === null || !Array.isArray(data)) {
        return { ok: false, reason: "malformed", detail: "expected array" };
    }
    if (data.length === 0) {
        return { ok: false, reason: "no-match" };
    }
    const first = data[0] as { lat?: string; lon?: string };
    const lat = first.lat ? parseFloat(first.lat) : NaN;
    const lon = first.lon ? parseFloat(first.lon) : NaN;
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
        return { ok: false, reason: "malformed", detail: "lat/lon not parseable" };
    }
    return { ok: true, result: { lat, lon } };
}

