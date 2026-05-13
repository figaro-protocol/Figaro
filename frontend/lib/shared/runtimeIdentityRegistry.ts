/**
 * Empty-state shim that used to load `local-runtime-identity.json`
 * (the bundled fixture manifest with ACME / Bob's Pizza / GreenLedger /
 * etc.). The fixture was retired with the reference-operator migration —
 * runtime discovery now reads from on-chain `OperatorRegistry` via
 * `useOperatorListings` / `useOperatorProfile`.
 *
 * This file stays alive as a transitional shim so that downstream
 * consumers (`runtimeResolution`, `runtimeIdentityService`) continue
 * to compile with their existing import shape. Each accessor returns
 * empty data; the consumers gracefully fall through to "no fixture
 * context" semantics.
 *
 * Final removal of this file is gated on the semantic-layer migration
 * to AssemblyManifest, which is the project that decommissions the
 * `Assembly` type infrastructure that still threads through
 * `runtimeResolution`.
 */

import { SellerCatalogueMetadata } from '@/lib/shared/sellerCatalogueMetadata';
import type { OperatorProfileMetadata } from '@/lib/shared/operatorProfileMetadata';
import {
    RuntimeIdentityDataSource,
} from '@/lib/shared/runtimeDataSource';

export type { AssemblyBoundSubjectSummary, RuntimeIdentityDataSource } from '@/lib/shared/runtimeDataSource';

const EMPTY_RUNTIME_IDENTITY_SOURCE: RuntimeIdentityDataSource = {
    listSubjectRecords: () => [],
    listAssemblyBindings: () => [],
    listOperatorProfileMetadata: () => [],
    listSellerCatalogueMetadata: () => [],
    listAssetDocuments: () => [],
    listSubjectProvenanceRecords: () => [],
    listValidationIssues: () => [],
    getSourceMetadata: () => ({
        sourceKind: 'unknown',
        sourceLabel: 'empty (fixtures retired)',
        transport: 'in-memory',
    }),
};

export const SELLER_CATALOGUE_METADATA_RECORDS: SellerCatalogueMetadata[] = [];

export const OPERATOR_PROFILE_METADATA_RECORDS: OperatorProfileMetadata[] = [];

export const FIXTURE_RUNTIME_IDENTITY_SOURCE: RuntimeIdentityDataSource = EMPTY_RUNTIME_IDENTITY_SOURCE;

export function listRuntimeSubjectRecords(dataSource: RuntimeIdentityDataSource = FIXTURE_RUNTIME_IDENTITY_SOURCE) {
    return dataSource.listSubjectRecords();
}

export function listRuntimeAssemblyBindings(dataSource: RuntimeIdentityDataSource = FIXTURE_RUNTIME_IDENTITY_SOURCE) {
    return dataSource.listAssemblyBindings();
}
