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
 */

export interface GeocodeResult {
    lat: number;
    lon: number;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/**
 * Resolve an address string to lat/lon. Returns null on no match,
 * malformed response, or fetch failure.
 */
export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
    const trimmed = query.trim();
    if (!trimmed) return null;

    try {
        const url = `${NOMINATIM_URL}?q=${encodeURIComponent(trimmed)}&format=json&limit=1`;
        const res = await fetch(url, {
            headers: { Accept: "application/json" },
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) return null;
        const first = data[0] as { lat?: string; lon?: string };
        const lat = first.lat ? parseFloat(first.lat) : NaN;
        const lon = first.lon ? parseFloat(first.lon) : NaN;
        if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
        return { lat, lon };
    } catch {
        return null;
    }
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
