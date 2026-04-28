import {
    DEFAULT_HANDOFF_PERSISTENCE_SERVICE,
    HANDOFF_KEY_STORAGE_KEY,
    type HandoffPersistenceService,
    type HandoffKeyRecord,
} from "@/lib/shared/handoffPersistenceService";

export type { HandoffKeyRecord };
export { HANDOFF_KEY_STORAGE_KEY };

function resolveHandoffPersistenceService(options?: { service?: HandoffPersistenceService }) {
    return options?.service ?? DEFAULT_HANDOFF_PERSISTENCE_SERVICE;
}

export function saveHandoffKey(
    address: string,
    record: HandoffKeyRecord,
    options?: { service?: HandoffPersistenceService },
) {
    resolveHandoffPersistenceService(options).saveHandoffKey(address, record);
}

export function getHandoffKey(
    address: string,
    processId: string,
    orderId: string,
    options?: { service?: HandoffPersistenceService },
): HandoffKeyRecord | null {
    return resolveHandoffPersistenceService(options).getHandoffKey(address, processId, orderId);
}

export function removeHandoffKey(
    address: string,
    processId: string,
    orderId: string,
    options?: { service?: HandoffPersistenceService },
) {
    resolveHandoffPersistenceService(options).removeHandoffKey(address, processId, orderId);
}
