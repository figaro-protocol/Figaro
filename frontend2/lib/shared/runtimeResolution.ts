import {
    getRegisteredAssemblyBySlug,
    RegisteredAssembly,
} from '@/lib/shared/assemblyRegistry';
import { deriveAssemblyCapabilities } from '@/lib/semantic/deriveAssemblyCapabilities';
import type { CapabilityModel, MechanismModel, RoleContext } from '@/lib/semantic/models';
import type { ResolvedMerchantBranding } from '@/lib/shared/merchantBranding';
import { resolveMerchantBrandingDocument, resolveMerchantBrandingFromSellerCatalogue } from '@/lib/shared/merchantBranding';
import type { Assembly } from '@/lib/shared/assembly';
import {
    AssemblyBoundSubjectSummary,
    RuntimeAssetDocument,
    getRuntimeIdentitySourceMetadataFromSource,
    listAssemblyBoundSubjectSummariesFromSource,
    listValidationIssuesFromSource,
    resolveRuntimeSubjectByAddressFromSource,
    RuntimeIdentitySourceMetadata,
    RuntimeIdentityDataSource,
} from '@/lib/shared/runtimeDataSource';
import type { IpfsService } from '@/lib/shared/ipfsService';
import { parseRuntimeAssetDocument } from '@/lib/shared/runtimeIdentityDocument';
import { safeJsonFromResponse } from '@/lib/shared/safeJson';
import type { SellerBrandingMetadata, SellerCatalogueMetadata } from '@/lib/shared/sellerCatalogueMetadata';
import type { RuntimeIdentityDocumentValidationIssue } from '@/lib/shared/runtimeIdentityDocument';
import { FIXTURE_RUNTIME_IDENTITY_SOURCE } from '@/lib/shared/runtimeIdentityRegistry';
import type { RuntimeServiceProviderKeys } from '@/lib/shared/runtimeServices';
import { resolveRuntimeServiceProviderKeys } from '@/lib/shared/runtimeServices';

interface RuntimeRoleLike {
    roleKind: string;
}

interface RuntimeRoleWithMechanismsLike extends RuntimeRoleLike {
    mechanismIds: string[];
}

interface RuntimeMechanismLike {
    id: string;
    recognizedRoles?: string[];
    moduleBindings?: string[];
}

export interface ResolvedAssemblyRuntimeContext {
    artifact: RegisteredAssembly;
    boundSubjects: AssemblyBoundSubjectSummary[];
    networkTarget?: string;
    validationIssues: RuntimeIdentityDocumentValidationIssue[];
    sourceMetadata: RuntimeIdentitySourceMetadata;
}

export interface ResolvedAssemblyShellPresentation {
    sourceKind: 'assembly-default' | 'runtime-bound';
    title: string;
    subtitle: string;
    subjectAddress?: `0x${string}`;
    bindingId?: string;
    metadataURI?: string;
    metadataHash?: string;
    assetURI?: string;
    assetHash?: string;
    assetDocument?: RuntimeAssetDocument;
    branding?: SellerBrandingMetadata;
    assets?: SellerCatalogueMetadata['assets'];
    sellerCatalogueMetadata?: SellerCatalogueMetadata;
}

export interface ResolvedAssemblySkinBundle {
    sourceKind: ResolvedAssemblyShellPresentation['sourceKind'];
    skinId: string;
    subjectAddress?: `0x${string}`;
    bindingId?: string;
    branding: ResolvedMerchantBranding;
}

export interface ResolvedRuntimeRoleSelection<RoleType extends RuntimeRoleLike> {
    matchedSubject?: AssemblyBoundSubjectSummary;
    availableRoles: RoleType[];
    preferredRoleKind?: string;
    roleHints: string[];
}

export interface ResolvedRoleScopedMechanismSelection<
    RoleType extends RuntimeRoleWithMechanismsLike,
    MechanismType extends RuntimeMechanismLike,
> {
    selectedRole?: RoleType;
    visibleMechanisms: MechanismType[];
}

export interface ResolvedRoleScopedModuleSelection {
    visibleModuleIds: string[];
}

export interface ResolvedRuntimeBoundSubjectSnapshot {
    subject: AssemblyBoundSubjectSummary;
    shellPresentation: ResolvedAssemblyShellPresentation;
    serviceProviderKeys: RuntimeServiceProviderKeys;
}

export interface ResolveSemanticRuntimeSnapshotOptions {
    selectedBoundSubject?: AssemblyBoundSubjectSummary;
    roleKind?: string;
}

export interface ResolveSemanticRuntimeSnapshotForSubjectOptions {
    networkTarget?: string;
    roleKind?: string;
    dataSource?: RuntimeIdentityDataSource;
}

export interface ResolvedSemanticRuntimeSnapshot {
    assembly: RegisteredAssembly['assembly'];
    validation: RegisteredAssembly['validation'];
    model: RegisteredAssembly['model'];
    riskBoundaries: RegisteredAssembly['riskBoundaries'];
    runtime: {
        networkTarget?: string;
        sourceMetadata: RuntimeIdentitySourceMetadata;
        validationIssues: RuntimeIdentityDocumentValidationIssue[];
        boundSubjects: ResolvedRuntimeBoundSubjectSnapshot[];
        assemblyServiceProviderKeys: RuntimeServiceProviderKeys;
        selectedServiceProviderKeys: RuntimeServiceProviderKeys;
        selectedBindingId?: string;
        selectedSubjectAddress?: `0x${string}`;
        roleHints: string[];
        preferredRoleKind?: string;
        availableRoles: RoleContext[];
        selectedRole?: RoleContext;
        visibleMechanisms: MechanismModel[];
        visibleModuleIds: string[];
        assemblyCapabilities: CapabilityModel[];
        selectedShellPresentation: ResolvedAssemblyShellPresentation;
    };
}

export interface RuntimeAssetDocumentResponseLike {
    ok: boolean;
    status: number;
    statusText: string;
    /** Read body as text. Required so the runtime can route through
     *  `safeJsonParse` for prototype-pollution defense. Test stubs need
     *  to implement both `json()` (legacy) and `text()`. */
    text(): Promise<string>;
}

export type RuntimeAssetDocumentFetcher = (
    input: string,
    init?: RequestInit,
) => Promise<RuntimeAssetDocumentResponseLike>;

function normalizeAddress(address: string) {
    return address.toLowerCase();
}

function pickFirstText(...values: Array<string | undefined>): string | undefined {
    return values.find((value) => typeof value === 'string' && value.trim().length > 0);
}

function getDefaultRuntimeAssetDocumentFetcher(): RuntimeAssetDocumentFetcher {
    if (typeof fetch !== 'function') {
        throw new Error('No fetch implementation is available for runtime asset document loading.');
    }

    return fetch as RuntimeAssetDocumentFetcher;
}

export function resolveAssemblyShellPresentation(
    assembly: Assembly,
    matchedSubject?: AssemblyBoundSubjectSummary
): ResolvedAssemblyShellPresentation {
    const sellerCatalogueMetadata = matchedSubject?.sellerCatalogueMetadata;
    const title = pickFirstText(
        sellerCatalogueMetadata?.branding?.displayName,
        sellerCatalogueMetadata?.name,
        matchedSubject?.displayName,
        assembly.identity.name,
    ) ?? assembly.identity.name;
    const subtitle = pickFirstText(
        sellerCatalogueMetadata?.description,
        assembly.narrative?.assemblySummary,
    ) ?? '';

    return {
        sourceKind: matchedSubject ? 'runtime-bound' : 'assembly-default',
        title,
        subtitle,
        subjectAddress: matchedSubject?.subjectAddress,
        bindingId: matchedSubject?.bindingId,
        metadataURI: matchedSubject?.metadataURI,
        metadataHash: matchedSubject?.metadataHash,
        assetURI: matchedSubject?.assetURI,
        assetHash: matchedSubject?.assetHash,
        assetDocument: matchedSubject?.assetDocument,
        branding: sellerCatalogueMetadata?.branding,
        assets: sellerCatalogueMetadata?.assets,
        sellerCatalogueMetadata,
    };
}

function slugifySkinId(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function resolveAssemblySkinBundle(
    shellPresentation: ResolvedAssemblyShellPresentation,
): ResolvedAssemblySkinBundle | undefined {
    const branding = shellPresentation.assetDocument
        ? resolveMerchantBrandingDocument({
            name: shellPresentation.assetDocument.name,
            branding: shellPresentation.assetDocument.branding,
            assets: shellPresentation.assetDocument.assets,
        })
        : resolveMerchantBrandingFromSellerCatalogue(shellPresentation.sellerCatalogueMetadata);

    if (!branding) {
        return undefined;
    }

    const skinId = shellPresentation.bindingId
        ? slugifySkinId(shellPresentation.bindingId)
        : slugifySkinId(shellPresentation.subjectAddress ?? shellPresentation.title);

    return {
        sourceKind: shellPresentation.sourceKind,
        skinId,
        subjectAddress: shellPresentation.subjectAddress,
        bindingId: shellPresentation.bindingId,
        branding,
    };
}

export async function fetchRuntimeAssetDocument(
    assetURI: string,
    evidenceTransport: Pick<IpfsService, 'resolveFetchUrl'>,
    options: {
        fetcher?: RuntimeAssetDocumentFetcher;
        requestInit?: RequestInit;
        sourceLabel?: string;
    } = {},
): Promise<RuntimeAssetDocument | null> {
    const fetchUrl = evidenceTransport.resolveFetchUrl(assetURI);

    if (!fetchUrl) {
        return null;
    }

    const fetcher = options.fetcher ?? getDefaultRuntimeAssetDocumentFetcher();
    const response = await fetcher(fetchUrl, options.requestInit);

    // The RuntimeAssetDocumentResponseLike interface now requires `.text()`
    // (Web2 adversarial-audit 🟡 Priority 3, 2026-04-26) so we route through
    // safeJsonFromResponse and strip prototype-pollution keys at the parse
    // boundary, matching the rest of the network-fetched JSON sites.
    const assetDocument = await safeJsonFromResponse(response);
    if (!assetDocument) {
        return null;
    }

    return parseRuntimeAssetDocument(assetDocument, options.sourceLabel ?? assetURI);
}

export async function resolveAssemblySkinBundleFromTransport(
    shellPresentation: ResolvedAssemblyShellPresentation,
    evidenceTransport: Pick<IpfsService, 'resolveFetchUrl'>,
    options: {
        fetcher?: RuntimeAssetDocumentFetcher;
        requestInit?: RequestInit;
        sourceLabel?: string;
    } = {},
): Promise<ResolvedAssemblySkinBundle | undefined> {
    const baseSkinBundle = resolveAssemblySkinBundle(shellPresentation);

    if (shellPresentation.assetDocument || !shellPresentation.assetURI) {
        return baseSkinBundle;
    }

    try {
        const assetDocument = await fetchRuntimeAssetDocument(
            shellPresentation.assetURI,
            evidenceTransport,
            options,
        );

        if (!assetDocument) {
            return baseSkinBundle;
        }

        return resolveAssemblySkinBundle({
            ...shellPresentation,
            assetDocument,
        });
    } catch {
        return baseSkinBundle;
    }
}

export function resolveRuntimeRoleSelection<RoleType extends RuntimeRoleLike>(
    address: string | undefined,
    boundSubjects: AssemblyBoundSubjectSummary[],
    availableRoles: RoleType[]
): ResolvedRuntimeRoleSelection<RoleType> {
    if (!address) {
        return {
            availableRoles,
            roleHints: [],
        };
    }

    const matchedSubject = boundSubjects.find(
        (subject) => normalizeAddress(subject.subjectAddress) === normalizeAddress(address)
    );

    if (!matchedSubject) {
        return {
            availableRoles,
            roleHints: [],
        };
    }

    const roleHints = [
        ...new Set(
            matchedSubject.roleBindings.flatMap((binding) => binding.assemblyRoleKinds)
        ),
    ];
    const matchedRoles = availableRoles.filter((role) => roleHints.includes(role.roleKind));

    return {
        matchedSubject,
        availableRoles: matchedRoles.length > 0 ? matchedRoles : availableRoles,
        preferredRoleKind: matchedRoles[0]?.roleKind,
        roleHints,
    };
}

export function resolveRoleScopedMechanismSelection<
    RoleType extends RuntimeRoleWithMechanismsLike,
    MechanismType extends RuntimeMechanismLike,
>(
    selectedRole: RoleType | undefined,
    mechanisms: MechanismType[]
): ResolvedRoleScopedMechanismSelection<RoleType, MechanismType> {
    if (!selectedRole) {
        return {
            selectedRole,
            visibleMechanisms: mechanisms,
        };
    }

    const visibleMechanisms = mechanisms.filter((mechanism) => {
        if (selectedRole.mechanismIds.includes(mechanism.id)) {
            return true;
        }

        if (mechanism.recognizedRoles?.includes(selectedRole.roleKind)) {
            return true;
        }

        return false;
    });

    return {
        selectedRole,
        visibleMechanisms: visibleMechanisms.length > 0 ? visibleMechanisms : mechanisms,
    };
}

export function resolveRoleScopedModuleSelection(
    selectedViewModuleIds: string[],
    visibleMechanisms: RuntimeMechanismLike[],
    alwaysVisibleModuleIds: string[] = ['role-switcher', 'capability-rail']
): ResolvedRoleScopedModuleSelection {
    const mechanismModuleIds = new Set(visibleMechanisms.flatMap((mechanism) => mechanism.moduleBindings ?? []));
    const alwaysVisibleModuleIdSet = new Set(alwaysVisibleModuleIds);

    return {
        visibleModuleIds: selectedViewModuleIds.filter(
            (moduleId) => alwaysVisibleModuleIdSet.has(moduleId) || mechanismModuleIds.has(moduleId)
        ),
    };
}

export function resolveAssemblyRuntimeContext(
    slug: string,
    networkTarget?: string,
    dataSource: RuntimeIdentityDataSource = FIXTURE_RUNTIME_IDENTITY_SOURCE
): ResolvedAssemblyRuntimeContext | undefined {
    const artifact = getRegisteredAssemblyBySlug(slug);
    if (!artifact) {
        return undefined;
    }

    const boundSubjects = listAssemblyBoundSubjectSummariesFromSource(slug, networkTarget, dataSource);
    const boundSubjectAddresses = new Set(boundSubjects.map((subject) => normalizeAddress(subject.subjectAddress)));

    return {
        artifact,
        boundSubjects,
        networkTarget,
        validationIssues: listValidationIssuesFromSource(dataSource).filter((issue) =>
            issue.subjectAddress ? boundSubjectAddresses.has(normalizeAddress(issue.subjectAddress)) : false
        ),
        sourceMetadata: getRuntimeIdentitySourceMetadataFromSource(dataSource),
    };
}

export function requireAssemblyRuntimeContext(
    slug: string,
    networkTarget?: string,
    dataSource: RuntimeIdentityDataSource = FIXTURE_RUNTIME_IDENTITY_SOURCE
): ResolvedAssemblyRuntimeContext {
    const resolved = resolveAssemblyRuntimeContext(slug, networkTarget, dataSource);
    if (!resolved) {
        throw new Error(`Unknown assembly: ${slug}`);
    }

    return resolved;
}

export function resolveSemanticRuntimeSnapshot(
    context: ResolvedAssemblyRuntimeContext,
    options: ResolveSemanticRuntimeSnapshotOptions = {},
): ResolvedSemanticRuntimeSnapshot {
    const selectedBoundSubject = options.selectedBoundSubject;
    const roleSelection = resolveRuntimeRoleSelection(
        selectedBoundSubject?.subjectAddress,
        context.boundSubjects,
        context.artifact.model.roles,
    );
    const selectedRole = options.roleKind
        ? roleSelection.availableRoles.find((role) => role.roleKind === options.roleKind)
        : roleSelection.preferredRoleKind
            ? roleSelection.availableRoles.find((role) => role.roleKind === roleSelection.preferredRoleKind)
            : undefined;
    const scopedMechanismSelection = resolveRoleScopedMechanismSelection(
        selectedRole,
        context.artifact.model.mechanisms,
    );
    const selectedViewModuleIds = context.artifact.assembly.views
        .filter((view) =>
            view.viewId === 'assembly-overview'
            || (selectedRole?.defaultLandingView ? view.viewId === selectedRole.defaultLandingView : false)
        )
        .flatMap((view) => view.moduleSlots);
    const scopedModuleSelection = resolveRoleScopedModuleSelection(
        selectedViewModuleIds,
        scopedMechanismSelection.visibleMechanisms,
    );

    return {
        assembly: context.artifact.assembly,
        validation: context.artifact.validation,
        model: context.artifact.model,
        riskBoundaries: context.artifact.riskBoundaries,
        runtime: {
            networkTarget: context.networkTarget,
            sourceMetadata: context.sourceMetadata,
            validationIssues: context.validationIssues,
            boundSubjects: context.boundSubjects.map((subject) => ({
                subject,
                shellPresentation: resolveAssemblyShellPresentation(context.artifact.assembly, subject),
                serviceProviderKeys: resolveRuntimeServiceProviderKeys(context.artifact.assembly, subject),
            })),
            assemblyServiceProviderKeys: resolveRuntimeServiceProviderKeys(context.artifact.assembly),
            selectedServiceProviderKeys: resolveRuntimeServiceProviderKeys(context.artifact.assembly, selectedBoundSubject),
            selectedBindingId: selectedBoundSubject?.bindingId,
            selectedSubjectAddress: selectedBoundSubject?.subjectAddress,
            roleHints: roleSelection.roleHints,
            preferredRoleKind: roleSelection.preferredRoleKind,
            availableRoles: roleSelection.availableRoles,
            selectedRole,
            visibleMechanisms: scopedMechanismSelection.visibleMechanisms,
            visibleModuleIds: scopedModuleSelection.visibleModuleIds,
            assemblyCapabilities: deriveAssemblyCapabilities(
                context.artifact.assembly.identity.id,
                selectedRole?.roleKind,
                scopedMechanismSelection.visibleMechanisms,
            ),
            selectedShellPresentation: resolveAssemblyShellPresentation(
                context.artifact.assembly,
                selectedBoundSubject,
            ),
        },
    };
}

export function resolveSemanticRuntimeSnapshotForSubjectAddress(
    subjectAddress: string | undefined,
    options: ResolveSemanticRuntimeSnapshotForSubjectOptions = {},
): ResolvedSemanticRuntimeSnapshot | undefined {
    if (!subjectAddress) {
        return undefined;
    }

    const dataSource = options.dataSource ?? FIXTURE_RUNTIME_IDENTITY_SOURCE;
    const subjectContext = resolveRuntimeSubjectByAddressFromSource(
        subjectAddress,
        options.networkTarget,
        dataSource,
    );
    const selectedBinding = subjectContext?.selectedBinding;

    if (!selectedBinding) {
        return undefined;
    }

    const runtimeContext = resolveAssemblyRuntimeContext(
        selectedBinding.assemblySlug,
        options.networkTarget ?? selectedBinding.networkTargets[0],
        dataSource,
    );

    if (!runtimeContext) {
        return undefined;
    }

    const selectedBoundSubject = runtimeContext.boundSubjects.find(
        (subject) => subject.bindingId === selectedBinding.bindingId,
    );

    if (!selectedBoundSubject) {
        return undefined;
    }

    return resolveSemanticRuntimeSnapshot(runtimeContext, {
        selectedBoundSubject,
        roleKind: options.roleKind,
    });
}