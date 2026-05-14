import type { ResolvedMerchantBranding } from '@/lib/shared/merchantBranding';
import { resolveMerchantBrandingDocument, resolveMerchantBrandingFromSellerCatalogue } from '@/lib/shared/merchantBranding';
import type { Assembly, ServiceBinding } from '@/lib/shared/assembly';
import type { IpfsService } from '@/lib/shared/ipfsService';
import { slugify } from '@/lib/shared/slug';
import { parseRuntimeAssetDocument, type RuntimeAssetDocument } from '@/lib/shared/runtimeIdentityDocument';
import { safeJsonFromResponse } from '@/lib/shared/safeJson';
import type { SellerBrandingMetadata, SellerCatalogueMetadata } from '@/lib/shared/sellerCatalogueMetadata';
import type {
    OperatorAssetReferences,
    OperatorProfileMetadata,
    RoleBindingRecord,
} from '@/lib/shared/operatorProfileMetadata';

export interface AssemblyBoundSubjectSummary {
    bindingId: string;
    assemblySlug: string;
    subjectAddress: `0x${string}`;
    displayName: string;
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
    operatorProfile?: OperatorProfileMetadata;
    sellerCatalogueMetadata?: SellerCatalogueMetadata;
}

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
    assets?: OperatorAssetReferences;
    operatorProfile?: OperatorProfileMetadata;
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
    const operatorProfile = matchedSubject?.operatorProfile;
    const sellerCatalogueMetadata = matchedSubject?.sellerCatalogueMetadata;
    const title = pickFirstText(
        operatorProfile?.branding?.displayName,
        operatorProfile?.name,
        matchedSubject?.displayName,
        assembly.identity.name,
    ) ?? assembly.identity.name;
    const subtitle = pickFirstText(
        operatorProfile?.description,
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
        branding: operatorProfile?.branding,
        assets: operatorProfile?.assets,
        operatorProfile,
        sellerCatalogueMetadata,
    };
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
        : resolveMerchantBrandingFromSellerCatalogue(shellPresentation.operatorProfile);

    if (!branding) {
        return undefined;
    }

    const skinId = shellPresentation.bindingId
        ? slugify(shellPresentation.bindingId)
        : slugify(shellPresentation.subjectAddress ?? shellPresentation.title);

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
