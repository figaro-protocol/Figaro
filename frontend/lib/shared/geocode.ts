/**
 * lib/shared/geocode.ts
 *
 * Free-form address-text → lat/lon resolution. Backed by OpenStreetMap's
 * Nominatim public service: no API key, CORS-enabled for browsers, max
 * 1 request per second per Nominatim's usage policy.
 *
 * For a single user-initiated click ("Use this address" in the
 * onboarding form) this is well under the rate limit. Callers that
 * automate geocoding need to add their own throttling.
 *
 * Returns a discriminated outcome — callers can distinguish
 * "no match for this query" from "we couldn't reach the geocoder"
 * and surface a useful message.
 */

export interface GeocodeResult {
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

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/**
 * Resolve an address string to lat/lon. Returns a structured outcome;
 * the caller decides how to surface each failure reason.
 */
export async function geocodeAddress(query: string): Promise<GeocodeOutcome> {
    const trimmed = query.trim();
    if (!trimmed) return { ok: false, reason: "empty-query" };

    let res: Response;
    try {
        const url = `${NOMINATIM_URL}?q=${encodeURIComponent(trimmed)}&format=json&limit=1`;
        res = await fetch(url, {
            headers: { Accept: "application/json" },
        });
    } catch (err) {
        return {
            ok: false,
            reason: "network-error",
            detail: err instanceof Error ? err.message : String(err),
        };
    }

    if (!res.ok) {
        return { ok: false, reason: "http-error", detail: `HTTP ${res.status}` };
    }

    let data: unknown;
    try {
        data = await res.json();
    } catch (err) {
        return {
            ok: false,
            reason: "malformed",
            detail: err instanceof Error ? err.message : String(err),
        };
    }

    if (!Array.isArray(data)) {
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

/**
 * Resolve the device's current position via the Geolocation API.
 * Returns null on permission denial, no support, or any error.
 */
export function getDeviceLocation(): Promise<GeocodeResult | null> {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
        return Promise.resolve(null);
    }
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
        );
    });
}
