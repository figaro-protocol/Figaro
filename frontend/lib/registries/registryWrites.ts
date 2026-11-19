/**
 * registryWrites — the one signal a registry WRITE sends to the readers that
 * derive from its events. A read-at-edge panel (the connected wallet's
 * registered clauses, derived from `ClauseRegistered` logs) has no way to know
 * that the form beside it just anchored one: the write goes to the chain and
 * the panel's scan ran before it (beta r9: "Registered … is now anchored"
 * beside "You haven't registered any clauses yet."). A write calls
 * `noteRegistryWrite()`; a reader takes `useRegistryWriteVersion()` and
 * refetches when it changes. Nothing is stored — the chain stays the source;
 * this only says "read it again".
 */
import { createVersionStore } from "@/lib/shared/versionStore";

const writes = createVersionStore();

/** Call once after a registry write is confirmed. */
export function noteRegistryWrite(): void {
    writes.bump();
}

/** Changes every time a registry write is confirmed in this tab. */
export function useRegistryWriteVersion(): number {
    return writes.useVersion();
}
