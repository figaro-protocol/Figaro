"use client";

import { useSyncExternalStore } from "react";

/**
 * Returns `true` once the component renders on the client. Use to gate
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
 * Hydration: returns false → renders Loading (matches), then React
 * re-renders with true before the user acts.
 * A component mounted after hydration (a client navigation): true from its
 * first render. React's `useSyncExternalStore` takes the server snapshot only
 * while hydrating.
 */
const subscribeNothing = () => () => {};
const onClient = () => true;
const onServer = () => false;

export function useMounted(): boolean {
    return useSyncExternalStore(subscribeNothing, onClient, onServer);
}
