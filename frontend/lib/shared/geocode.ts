/**
 * lib/shared/geocode.ts
 *
 * Free-form address-text → lat/lon resolution. Calls the
 * `/api/geocode` server-side proxy, which forwards to OpenStreetMap
 * Nominatim with a project-identifying User-Agent. Routing through
 * our own origin avoids browser extensions (uBlock Origin, Privacy
 * Badger, Brave Shields) that block direct calls to Nominatim as a
 * tracker.
 *
 * Returns a discriminated outcome — callers can distinguish
 * "no match for this query" from "we couldn't reach the proxy" and
 * surface a useful message.
 */

import { extractErrorMessage } from "@/lib/shared/errors";

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

const PROXY_URL = "/api/geocode";

/**
 * Resolve an address string to lat/lon. Returns a structured outcome;
 * the caller decides how to surface each failure reason.
 */
export async function geocodeAddress(query: string): Promise<GeocodeOutcome> {
    const trimmed = query.trim();
    if (!trimmed) return { ok: false, reason: "empty-query" };

    let res: Response;
    try {
        const url = `${PROXY_URL}?q=${encodeURIComponent(trimmed)}`;
        res = await fetch(url, {
            headers: { Accept: "application/json" },
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
        data = await res.json();
    } catch (err) {
        return {
            ok: false,
            reason: "malformed",
            detail: extractErrorMessage(err, String(err)),
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
