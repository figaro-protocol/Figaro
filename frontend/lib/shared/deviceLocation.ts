"use client";

/**
 * deviceLocation — the ONE Geolocation-API read. Shared-layer because every
 * device-position consumer (the member wizard's geohash assist, the geohash
 * field input, hand-off evidence capture) is a different layer; the device is
 * below them all. Moved from `lib/registries/geocode.ts` (which keeps geocoding —
 * address → coordinates; a service lookup, not a device read).
 */

import { encodeGeohash } from "@figaro-protocol/sdk/derive";

/** What the device reported — position plus its accuracy radius. */
export interface DeviceLocation {
    lat: number;
    lon: number;
    /** Position accuracy radius in meters, as the Geolocation API reports it. */
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

/** What a geohash assist tells the party when the device gave no position. */
export const DEVICE_LOCATION_UNREAD = "Couldn't read device location. Permission denied or unavailable.";

/** The device's position as a geohash of `precision` characters, or null when
 *  the device gave no position (see `getDeviceLocation`). The page sees only
 *  the geohash, never the coordinates. */
export async function readDeviceGeohash(precision: number): Promise<string | null> {
    const position = await getDeviceLocation();
    return position ? encodeGeohash(position.lat, position.lon, precision) : null;
}
