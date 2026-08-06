"use client";

/**
 * deviceLocation — the ONE Geolocation-API read. Shared-layer because every
 * device-position consumer (seller onboarding's geohash assist, the geohash
 * field input, hand-off evidence capture) is a different layer; the device is
 * below them all. Moved from `lib/member/geocode.ts` (which keeps geocoding —
 * address → coordinates; a service lookup, not a device read).
 */

/** What the device reported — position plus its accuracy radius. */
export interface DeviceLocation {
    lat: number;
    lon: number;
    /** Position accuracy radius in metres, as the Geolocation API reports it. */
    accuracyM: number;
}

/**
 * Resolve the device's current position via the Geolocation API.
 * Returns null on permission denial, no support, or any error.
 */
export function getDeviceLocation(): Promise<DeviceLocation | null> {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
        return Promise.resolve(null);
    }
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracyM: pos.coords.accuracy }),
            () => resolve(null),
            { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
        );
    });
}
