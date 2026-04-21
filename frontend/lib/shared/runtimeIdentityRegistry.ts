import localRuntimeManifestDocument from '@/lib/shared/runtime-fixtures/local-runtime.manifest.json';
import { SellerCatalogueMetadata } from '@/lib/shared/sellerCatalogueMetadata';
import { InstitutionBindingRecord, SubjectRecord } from '@/lib/shared/runtimeIdentity';
import {
    getSellerMetadataByAddressFromSource,
    listAssemblyBoundSubjectSummariesFromSource,
    resolveRuntimeSubjectByAddressFromSource,
    RuntimeIdentityDataSource,
} from '@/lib/shared/runtimeDataSource';
import { createRuntimeIdentityDataSourceFromManifestDocument } from '@/lib/shared/runtimeManifest';

export type { AssemblyBoundSubjectSummary, RuntimeIdentityDataSource } from '@/lib/shared/runtimeDataSource';

const PARSED_RUNTIME_MANIFEST = createRuntimeIdentityDataSourceFromManifestDocument(
    localRuntimeManifestDocument,
    'local-runtime.manifest.json',
    {
        sourceKind: 'bundled',
        sourceLabel: 'local-runtime.manifest.json',
        transport: 'static',
    }
);

export const RUNTIME_SUBJECT_RECORDS: SubjectRecord[] = PARSED_RUNTIME_MANIFEST.subjects;

export const RUNTIME_INSTITUTION_BINDINGS: InstitutionBindingRecord[] = PARSED_RUNTIME_MANIFEST.institutionBindings;

export const SELLER_CATALOGUE_METADATA_RECORDS: SellerCatalogueMetadata[] = PARSED_RUNTIME_MANIFEST.sellerCatalogueMetadata;

export const FIXTURE_RUNTIME_IDENTITY_SOURCE: RuntimeIdentityDataSource = PARSED_RUNTIME_MANIFEST;

export function listRuntimeSubjectRecords(dataSource: RuntimeIdentityDataSource = FIXTURE_RUNTIME_IDENTITY_SOURCE) {
    return dataSource.listSubjectRecords();
}

export function listRuntimeInstitutionBindings(dataSource: RuntimeIdentityDataSource = FIXTURE_RUNTIME_IDENTITY_SOURCE) {
    return dataSource.listInstitutionBindings();
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