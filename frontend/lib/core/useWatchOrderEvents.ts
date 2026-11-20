/**
 * useWatchOrderEvents — live order and process events, the wagmi half of the
 * Core's event reads. The history half (`getCoreEvents` and the cached
 * queries) is `@/lib/core/indexer`, which imports nothing from `wagmi`; this
 * hook takes wagmi's `useWatchContractEvent`, so it runs only under a wallet
 * provider.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useWatchContractEvent } from "wagmi";
import type { CoreEvents, ResolutionUniverse } from "@figaro-protocol/sdk";
import { CORE_ABI } from "./contracts";
import { ORDER_EMITTERS, parseCoreLogsByPath } from "./indexer";

/**
 * Live order and process events from every order emitter, parsed, delivered
 * to `onEvents` as they land. One watcher over the emitters' addresses and
 * the Core's ABI: a batch-path order reaches a reader exactly as a direct
 * one does. Each delivery is one path's events, named by `path`: the
 * emitter's address says which path a log is on. `onEvents` may change
 * between renders; the watcher holds the latest through a ref, because wagmi keys its watcher effect on `onLogs` and
 * a filter recreated every render drops the events that land between
 * recreations.
 */
export function useWatchOrderEvents(
    onEvents: (events: CoreEvents, path: ResolutionUniverse) => void,
    enabled = true,
): void {
    const onEventsRef = useRef(onEvents);
    useEffect(() => {
        onEventsRef.current = onEvents;
    }, [onEvents]);
    // A stable array per emitter set, so the watcher is not recreated per render.
    const emittersKey = ORDER_EMITTERS().filter((a) => !!a).join(",");
    const address = useMemo(
        () => (emittersKey ? (emittersKey.split(",") as `0x${string}`[]) : []),
        [emittersKey],
    );
    const onLogs = useCallback((logs: readonly unknown[]) => {
        for (const { path, events } of parseCoreLogsByPath({ committed: logs, resolved: logs, processResolved: logs })) {
            onEventsRef.current(events, path);
        }
    }, []);
    useWatchContractEvent({
        address: address.length > 0 ? address : undefined,
        abi: CORE_ABI,
        onLogs,
        enabled: enabled && address.length > 0,
    });
}
