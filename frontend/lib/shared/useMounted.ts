"use client";

import { useEffect, useState } from "react";

/**
 * Returns `true` after the component mounts on the client. Use to gate
 * rendering of wagmi-dependent / window-dependent / localStorage-dependent
 * UI so the server-rendered HTML matches the first client render
 * (and only diverges on subsequent client-only updates).
 *
 * Standard pattern:
 *
 *   const mounted = useMounted();
 *   if (!mounted) return <Loading />;
 *   if (!isConnected) return <ConnectPrompt />;
 *   return <Form />;
 *
 * Server: returns false → renders Loading.
 * Client first render: returns false → renders Loading (matches).
 * Client after effect: true → re-renders with the actual UI.
 */
export function useMounted(): boolean {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    return mounted;
}
