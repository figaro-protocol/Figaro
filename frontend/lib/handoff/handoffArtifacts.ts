import {
    DEFAULT_HANDOFF_PERSISTENCE_SERVICE,
    type HandoffPersistenceService,
    type PersistHandoffArtifactsParams,
    type PersistedHandoffArtifacts,
    type OrderRef,
} from "@/lib/handoff/handoffPersistenceService";

export type {
    PersistHandoffArtifactsParams,
    PersistedHandoffArtifacts,
    OrderRef,
};

function resolveHandoffPersistenceService(options?: { service?: HandoffPersistenceService }) {
    return options?.service ?? DEFAULT_HANDOFF_PERSISTENCE_SERVICE;
}

export async function persistHandoffArtifactsForOrder(
    params: PersistHandoffArtifactsParams,
    options?: { service?: HandoffPersistenceService },
): Promise<PersistedHandoffArtifacts | null> {
    return resolveHandoffPersistenceService(options).persistHandoffArtifactsForOrder(params);
}

// ---------------------------------------------------------------------------
// Recovery
//
// v3 payloads use per-order random AES keys that are NOT derivable from
// a wallet signature. If localStorage is cleared, those keys are lost.
// This is acceptable because handoff keys are short-lived — the fulfiller
// already has the key once the job is claimed, and the key is meaningless
// after handoff is complete.
// ---------------------------------------------------------------------------

/**
 * Check handoff key records for orders. Returns the number of orders
 * whose keys are present in localStorage.
 *
 * With per-order random keys (v3), recovery from a wallet signature is
 * not possible. This function reports key availability rather than
 * attempting re-derivation.
 */
export async function recoverHandoffKeys(
    walletClient: unknown,
    address: `0x${string}`,
    orders: OrderRef[],
    options?: { service?: HandoffPersistenceService },
): Promise<number> {
    return resolveHandoffPersistenceService(options).recoverHandoffKeys(walletClient, address, orders);
}
