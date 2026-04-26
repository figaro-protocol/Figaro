import { SellerCatalogueMetadata } from '@/lib/shared/sellerCatalogueMetadata';
import type { ServiceBinding } from '@/lib/shared/assembly';
import type { RuntimeIdentityDocumentValidationIssue } from '@/lib/shared/runtimeIdentityDocument';
import {
    collectSubjectProvenance,
    AssemblyBindingRecord,
    RoleBindingRecord,
    resolveIdentityContext,
    SubjectProvenanceRecord,
    SubjectRecord,
} from '@/lib/shared/runtimeIdentity';
export { createRuntimeIdentityDataSourceFromDocument } from '@/lib/shared/runtimeIdentityDocument';

export interface RuntimeIdentitySourceMetadata {
    sourceKind: 'bundled' | 'remote' | 'injected' | 'unknown';
    sourceLabel: string;
    transport: 'static' | 'fetched' | 'in-memory';
    requestUrl?: string;
}

export interface RuntimeIdentityDataSource {
    listSubjectRecords(): SubjectRecord[];
    listAssemblyBindings(): AssemblyBindingRecord[];
    listSellerCatalogueMetadata(): SellerCatalogueMetadata[];
    listAssetDocuments?(): RuntimeAssetDocument[];
    listSubjectProvenanceRecords?(): SubjectProvenanceRecord[];
    listValidationIssues?(): RuntimeIdentityDocumentValidationIssue[];
    getSourceMetadata?(): RuntimeIdentitySourceMetadata;
}

export interface RuntimeAssetDocument {
    assetURI: string;
    name?: string;
    branding?: SellerCatalogueMetadata['branding'];
    assets?: SellerCatalogueMetadata['assets'];
    version: string;
}

export interface AssemblyBoundSubjectSummary {
    bindingId: string;
    assemblySlug: string;
    subjectAddress: `0x${string}`;
    subjectKind: SubjectRecord['subjectKind'];
    displayName: string;
    archetypeId: string;
    roleKinds: string[];
    assemblyRoleKinds: string[];
    roleBindings: Array<{
        roleKind: string;
        assemblyRoleKinds: string[];
        scope: RoleBindingRecord['scope'];
        mechanismIds: string[];
        notes?: string;
    }>;
    serviceBindings: ServiceBinding[];
    networkTargets: string[];
    metadataURI?: string;
    metadataHash?: string;
    assetURI?: string;
    assetHash?: string;
    assetDocument?: RuntimeAssetDocument;
    sellerCatalogueMetadata?: SellerCatalogueMetadata;
    provenance?: SubjectProvenanceRecord;
}

function normalizeAddress(address: string) {
    return address.toLowerCase();
}

function normalizeServiceBindings(serviceBindings: ServiceBinding[] | undefined): ServiceBinding[] {
    const seen = new Set<string>();

    return (serviceBindings ?? []).filter((binding) => {
        if (seen.has(binding.serviceKey)) {
            return false;
        }

        seen.add(binding.serviceKey);
        return true;
    }).map((binding) => ({
        serviceKey: binding.serviceKey,
        providerKey: binding.providerKey,
    }));
}

export function getSellerMetadataByAddressFromSource(
    address: string,
    dataSource: RuntimeIdentityDataSource
) {
    const normalizedAddress = normalizeAddress(address);

    return dataSource
        .listSellerCatalogueMetadata()
        .find((entry) => normalizeAddress(entry.subjectAddress) === normalizedAddress);
}

export function getAssetDocumentByUriFromSource(
    assetURI: string | undefined,
    dataSource: RuntimeIdentityDataSource
) {
    if (!assetURI || !dataSource.listAssetDocuments) {
        return undefined;
    }

    return dataSource.listAssetDocuments().find((entry) => entry.assetURI === assetURI);
}

export function resolveRuntimeSubjectByAddressFromSource(
    address: string,
    networkTarget: string | undefined,
    dataSource: RuntimeIdentityDataSource
) {
    return resolveIdentityContext(
        address,
        dataSource.listSubjectRecords(),
        dataSource.listAssemblyBindings(),
        networkTarget
    );
}

export function listSubjectProvenanceRecordsFromSource(
    dataSource: RuntimeIdentityDataSource
): SubjectProvenanceRecord[] {
    if (dataSource.listSubjectProvenanceRecords) {
        return dataSource.listSubjectProvenanceRecords();
    }

    const bindings = dataSource.listAssemblyBindings();

    return dataSource
        .listSubjectRecords()
        .map((subject) => collectSubjectProvenance(subject, bindings.filter(
            (binding) => normalizeAddress(binding.subjectAddress) === normalizeAddress(subject.subjectAddress)
        )));
}

export function getSubjectProvenanceByAddressFromSource(
    address: string,
    dataSource: RuntimeIdentityDataSource
) {
    const normalizedAddress = normalizeAddress(address);

    return listSubjectProvenanceRecordsFromSource(dataSource).find(
        (entry) => normalizeAddress(entry.subjectAddress) === normalizedAddress
    );
}

export function listValidationIssuesFromSource(
    dataSource: RuntimeIdentityDataSource
): RuntimeIdentityDocumentValidationIssue[] {
    return dataSource.listValidationIssues ? dataSource.listValidationIssues() : [];
}

export function getRuntimeIdentitySourceMetadataFromSource(
    dataSource: RuntimeIdentityDataSource
): RuntimeIdentitySourceMetadata {
    return dataSource.getSourceMetadata
        ? dataSource.getSourceMetadata()
        : {
            sourceKind: 'unknown',
            sourceLabel: 'runtime-data-source',
            transport: 'in-memory',
        };
}

export function listAssemblyBoundSubjectSummariesFromSource(
    assemblySlug: string,
    networkTarget: string | undefined,
    dataSource: RuntimeIdentityDataSource
): AssemblyBoundSubjectSummary[] {
    const subjects = dataSource.listSubjectRecords();
    const bindings = dataSource.listAssemblyBindings();

    return bindings
        .filter((binding) => binding.assemblySlug === assemblySlug)
        .filter((binding) => !networkTarget || binding.networkTargets.includes(networkTarget))
        .map((binding) => {
            const subject = subjects.find(
                (entry) => normalizeAddress(entry.subjectAddress) === normalizeAddress(binding.subjectAddress)
            );
            const sellerCatalogueMetadata = getSellerMetadataByAddressFromSource(binding.subjectAddress, dataSource);
            const assetDocument = getAssetDocumentByUriFromSource(binding.assetURI, dataSource);
            const provenance = getSubjectProvenanceByAddressFromSource(binding.subjectAddress, dataSource);

            return {
                bindingId: binding.bindingId,
                assemblySlug: binding.assemblySlug,
                subjectAddress: binding.subjectAddress,
                subjectKind: subject?.subjectKind ?? 'participant',
                displayName: subject?.displayName ?? sellerCatalogueMetadata?.name ?? binding.subjectAddress,
                archetypeId: binding.archetypeId,
                roleKinds: [...new Set(binding.roleBindings.map((entry) => entry.roleKind))],
                assemblyRoleKinds: [
                    ...new Set(
                        binding.roleBindings.flatMap((entry) => entry.assemblyRoleKinds ?? [])
                    ),
                ],
                roleBindings: binding.roleBindings.map((entry) => ({
                    roleKind: entry.roleKind,
                    assemblyRoleKinds: [...new Set(entry.assemblyRoleKinds ?? [])],
                    scope: entry.scope,
                    mechanismIds: [...new Set(entry.mechanismIds ?? [])],
                    notes: entry.notes,
                })),
                serviceBindings: normalizeServiceBindings(binding.serviceBindings),
                networkTargets: binding.networkTargets,
                metadataURI: binding.metadataURI,
                metadataHash: binding.metadataHash,
                assetURI: binding.assetURI,
                assetHash: binding.assetHash,
                assetDocument,
                sellerCatalogueMetadata,
                provenance,
            };
        });
}