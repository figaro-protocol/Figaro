/**
 * versionStore — the one in-tab "read it again" signal. A module that keeps
 * no React state (a cache, a storage-backed list, a write elsewhere) bumps a
 * counter when what it holds changes; a component takes `useVersion()` and
 * re-derives when the number moves. Nothing is stored beyond the counter.
 */
import { useSyncExternalStore } from "react";

export interface VersionStore {
    /** Move the counter and notify every subscriber. */
    bump(): void;
    /** `useSyncExternalStore`'s subscribe: returns the unsubscribe. */
    subscribe(listener: () => void): () => void;
    /** Changes every time `bump` runs in this tab. */
    useVersion(): number;
}

export function createVersionStore(): VersionStore {
    let version = 0;
    const listeners = new Set<() => void>();
    const getVersion = () => version;
    const subscribe = (listener: () => void) => {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    };
    return {
        bump() {
            version += 1;
            for (const l of listeners) l();
        },
        subscribe,
        useVersion: () => useSyncExternalStore(subscribe, getVersion, getVersion),
    };
}
