/**
 * tests/lib/__fixtures__/runtimeIdentity.ts
 *
 * Shared test fixtures for runtime-identity work. Replaces 4 hand-rolled
 * `RuntimeIdentityDataSource` mock implementations and ~36 repeated
 * `0xXXXX…` fake addresses scattered across test files.
 */

import type {
    RuntimeAssetDocument,
    RuntimeIdentityDataSource,
} from "@/lib/shared/runtimeDataSource";
import type {
    AssemblyBindingRecord,
    SubjectRecord,
} from "@/lib/shared/runtimeIdentity";
import type { OperatorProfileMetadata } from "@/lib/shared/operatorProfileMetadata";
import type { SellerCatalogueMetadata } from "@/lib/shared/sellerCatalogueMetadata";

// ── Named fake addresses ─────────────────────────────────────────────────────
// Six pre-defined 20-byte addresses for use across test fixtures. Each is a
// repeating-digit pattern so the address itself reads as the slot label
// (TEST_ADDR_A = 0x1111…1111). Use these instead of inlining new
// `0xXXXX…` literals.

export const TEST_ADDR_A = "0x1111111111111111111111111111111111111111" as const;
export const TEST_ADDR_B = "0x2222222222222222222222222222222222222222" as const;
export const TEST_ADDR_C = "0x3333333333333333333333333333333333333333" as const;
export const TEST_ADDR_D = "0x4444444444444444444444444444444444444444" as const;
export const TEST_ADDR_E = "0x5555555555555555555555555555555555555555" as const;
export const TEST_ADDR_F = "0x6666666666666666666666666666666666666666" as const;

// ── Mock RuntimeIdentityDataSource factory ───────────────────────────────────

export interface MockRuntimeIdentityParts {
    subjects?: SubjectRecord[];
    assemblyBindings?: AssemblyBindingRecord[];
    operatorProfiles?: OperatorProfileMetadata[];
    sellerCatalogues?: SellerCatalogueMetadata[];
    assetDocuments?: RuntimeAssetDocument[];
}

/**
 * Build a minimal `RuntimeIdentityDataSource` for tests. Each
 * `list*` method returns the corresponding `parts` array (or `[]`
 * when omitted). `listAssetDocuments` is only attached when
 * `assetDocuments` is supplied, matching the optional signature on
 * the production interface.
 */
export function createMockRuntimeIdentityDataSource(
    parts: MockRuntimeIdentityParts = {},
): RuntimeIdentityDataSource {
    const source: RuntimeIdentityDataSource = {
        listSubjectRecords: () => parts.subjects ?? [],
        listAssemblyBindings: () => parts.assemblyBindings ?? [],
        listOperatorProfileMetadata: () => parts.operatorProfiles ?? [],
        listSellerCatalogueMetadata: () => parts.sellerCatalogues ?? [],
    };
    if (parts.assetDocuments) {
        const docs = parts.assetDocuments;
        source.listAssetDocuments = () => docs;
    }
    return source;
}
