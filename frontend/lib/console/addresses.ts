/**
 * Maps frontend env vars to the SDK's FigaroAddresses interface.
 */
import type { FigaroAddresses } from "@figaro/core";
import { CONTRACTS } from "@/lib/core/contracts";

export function getFigaroAddresses(): FigaroAddresses {
    return {
        core: CONTRACTS.core,
        token: CONTRACTS.mockToken || undefined,
        attestationCoordinator: CONTRACTS.attestationCoordinator || undefined,
        schemaRegistry: CONTRACTS.schemaRegistry || undefined,
        dutchAuction: CONTRACTS.dutchAuction || undefined,
    };
}
