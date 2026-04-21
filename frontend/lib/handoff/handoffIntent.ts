import {
    DEFAULT_HANDOFF_PERSISTENCE_SERVICE,
    type HandoffPersistenceService,
    type PendingHandoffIntent,
} from "@/lib/shared/handoffPersistenceService";

export type { PendingHandoffIntent };

function resolveHandoffPersistenceService(options?: { service?: HandoffPersistenceService }) {
    return options?.service ?? DEFAULT_HANDOFF_PERSISTENCE_SERVICE;
}

export function savePendingHandoffIntent(
    address: string,
    intent: PendingHandoffIntent,
    options?: { service?: HandoffPersistenceService },
) {
    resolveHandoffPersistenceService(options).savePendingHandoffIntent(address, intent);
}

export function getPendingHandoffIntent(
    address: string,
    processId: string,
    originOrderId: string,
    options?: { service?: HandoffPersistenceService },
): PendingHandoffIntent | null {
    return resolveHandoffPersistenceService(options).getPendingHandoffIntent(address, processId, originOrderId);
}

export function removePendingHandoffIntent(
    address: string,
    processId: string,
    originOrderId: string,
    options?: { service?: HandoffPersistenceService },
) {
    resolveHandoffPersistenceService(options).removePendingHandoffIntent(address, processId, originOrderId);
}
