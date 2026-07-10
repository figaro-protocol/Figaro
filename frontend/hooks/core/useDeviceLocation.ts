"use client";

import { useCallback, useState } from "react";
import { encodeGeohash } from "@figaro/sdk/extensions";

type DeviceLocationStatus = "idle" | "requesting" | "granted" | "denied" | "unsupported" | "error";

interface DeviceLocationState {
    status: DeviceLocationStatus;
    geohash: string | null;
    latitude: number | null;
    longitude: number | null;
    error: string | null;
}

export interface UseDeviceLocationResult extends DeviceLocationState {
    /** Prompt the browser for location and encode it as a geohash. */
    request: () => void;
    /** Manually set a geohash (for users who want to type / paste a service area). */
    setManualGeohash: (geohash: string) => void;
    /** Clear current location. */
    clear: () => void;
}

/**
 * Hook that wraps `navigator.geolocation.getCurrentPosition` and projects
 * the result into a geohash at the requested precision. Caller drives the
 * permission prompt explicitly via `request()` — the hook does not
 * auto-request on mount.
 */
export function useDeviceLocation(precision = 5): UseDeviceLocationResult {
    const [state, setState] = useState<DeviceLocationState>({
        status: "idle",
        geohash: null,
        latitude: null,
        longitude: null,
        error: null,
    });

    const request = useCallback(() => {
        if (typeof window === "undefined" || !("geolocation" in navigator)) {
            setState({
                status: "unsupported",
                geohash: null,
                latitude: null,
                longitude: null,
                error: "Geolocation is not available in this browser.",
            });
            return;
        }

        setState((prev) => ({ ...prev, status: "requesting", error: null }));

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                setState({
                    status: "granted",
                    geohash: encodeGeohash(lat, lon, precision),
                    latitude: lat,
                    longitude: lon,
                    error: null,
                });
            },
            (err) => {
                setState({
                    status: err.code === err.PERMISSION_DENIED ? "denied" : "error",
                    geohash: null,
                    latitude: null,
                    longitude: null,
                    error: err.message,
                });
            },
            { timeout: 8000, maximumAge: 60_000 },
        );
    }, [precision]);

    const setManualGeohash = useCallback((geohash: string) => {
        setState({
            status: "granted",
            geohash: geohash.trim().toLowerCase(),
            latitude: null,
            longitude: null,
            error: null,
        });
    }, []);

    const clear = useCallback(() => {
        setState({
            status: "idle",
            geohash: null,
            latitude: null,
            longitude: null,
            error: null,
        });
    }, []);

    return { ...state, request, setManualGeohash, clear };
}
