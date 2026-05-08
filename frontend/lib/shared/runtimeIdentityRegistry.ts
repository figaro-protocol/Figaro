import localRuntimeIdentityDocument from '@/lib/shared/runtime-fixtures/local-runtime-identity.json';
import { SellerCatalogueMetadata } from '@/lib/shared/sellerCatalogueMetadata';
import type { OperatorProfileMetadata } from '@/lib/shared/operatorProfileMetadata';
import {
    getSellerMetadataByAddressFromSource,
    listAssemblyBoundSubjectSummariesFromSource,
    resolveRuntimeSubjectByAddressFromSource,
    RuntimeIdentityDataSource,
} from '@/lib/shared/runtimeDataSource';
import { createRuntimeIdentityDataSourceFromDocument } from '@/lib/shared/runtimeIdentityDocument';

export type { AssemblyBoundSubjectSummary, RuntimeIdentityDataSource } from '@/lib/shared/runtimeDataSource';

const PARSED_RUNTIME_MANIFEST = createRuntimeIdentityDataSourceFromDocument(
    localRuntimeIdentityDocument,
    'local-runtime-identity.json',
    {
        sourceKind: 'bundled',
        sourceLabel: 'local-runtime-identity.json',
        transport: 'static',
    }
);

export const SELLER_CATALOGUE_METADATA_RECORDS: SellerCatalogueMetadata[] = PARSED_RUNTIME_MANIFEST.sellerCatalogueMetadata;

export const OPERATOR_PROFILE_METADATA_RECORDS: OperatorProfileMetadata[] = PARSED_RUNTIME_MANIFEST.operatorProfileMetadata;

export const FIXTURE_RUNTIME_IDENTITY_SOURCE: RuntimeIdentityDataSource = PARSED_RUNTIME_MANIFEST;

export function listRuntimeSubjectRecords(dataSource: RuntimeIdentityDataSource = FIXTURE_RUNTIME_IDENTITY_SOURCE) {
    return dataSource.listSubjectRecords();
}

export function listRuntimeAssemblyBindings(dataSource: RuntimeIdentityDataSource = FIXTURE_RUNTIME_IDENTITY_SOURCE) {
    return dataSource.listAssemblyBindings();
}

export function getSellerMetadataByAddress(
    address: string,
    dataSource: RuntimeIdentityDataSource = FIXTURE_RUNTIME_IDENTITY_SOURCE
) {
    return getSellerMetadataByAddressFromSource(address, dataSource);
}

export function resolveRuntimeSubjectByAddress(
    address: string,
    networkTarget?: string,
    dataSource: RuntimeIdentityDataSource = FIXTURE_RUNTIME_IDENTITY_SOURCE
) {
    return resolveRuntimeSubjectByAddressFromSource(address, networkTarget, dataSource);
}

export function listAssemblyBoundSubjectSummaries(
    assemblySlug: string,
    networkTarget?: string,
    dataSource: RuntimeIdentityDataSource = FIXTURE_RUNTIME_IDENTITY_SOURCE
) {
    return listAssemblyBoundSubjectSummariesFromSource(assemblySlug, networkTarget, dataSource);
}