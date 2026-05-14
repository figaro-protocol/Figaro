import { SellerCatalogueMetadata } from '@/lib/shared/sellerCatalogueMetadata';
import { parseSellerCatalogueDocument } from '@/lib/shared/sellerCatalogueMetadataParser';
import {
    AssemblyBindingRecord,
    OperatorProfileMetadata,
    parseAssemblyBindingDocument,
    parseOperatorProfileDocument,
} from '@/lib/shared/operatorProfileMetadata';
import {
    listSubjectProvenanceRecords,
    SubjectProvenanceRecord,
    SubjectRecord,
} from '@/lib/shared/runtimeIdentity';
import {
    parseSubjectRecordDocument,
} from '@/lib/shared/runtimeIdentityParser';
import {
    RuntimeAssetDocument,
    RuntimeIdentityDataSource,
    RuntimeIdentitySourceMetadata,
} from '@/lib/shared/runtimeDataSource';
import {
    asArray,
    asOptionalString,
    asRecord,
    asString,
    type UnknownRecord,
} from '@/lib/shared/parseHelpers';

export type RuntimeIdentityDocumentValidationSeverity = 'error' | 'warning';

export type RuntimeIdentityDocumentValidationCode =
    | 'duplicate-subject-address'
    | 'duplicate-binding-id'
    | 'binding-subject-missing'
    | 'missing-assembly-role-kinds'
    | 'merchant-metadata-subject-missing'
    | 'merchant-metadata-binding-missing'
    | 'binding-ref-binding-mismatch'
    | 'missing-binding-refs'
    | 'missing-signature-refs'
    | 'unlinked-binding-refs';

export interface RuntimeIdentityDocumentValidationIssue {
    severity: RuntimeIdentityDocumentValidationSeverity;
    code: RuntimeIdentityDocumentValidationCode;
    message: string;
    subjectAddress?: `0x${string}`;
    bindingId?: string;
}

export interface RuntimeIdentityDocument {
    version: string;
    subjects: unknown[];
    assemblyBindings: unknown[];
    sellerCatalogueMetadata?: unknown[];
    assetDocuments?: unknown[];
}

export interface ParsedRuntimeIdentityDocument {
    version: string;
    subjects: SubjectRecord[];
    assemblyBindings: AssemblyBindingRecord[];
    /** Operator profile records — identity, branding, accepted tokens. */
    operatorProfileMetadata: OperatorProfileMetadata[];
    /** Catalogue records — items only. */
    sellerCatalogueMetadata: SellerCatalogueMetadata[];
    assetDocuments: RuntimeAssetDocument[];
    subjectProvenance: SubjectProvenanceRecord[];
    validationIssues: RuntimeIdentityDocumentValidationIssue[];
}


export function parseRuntimeAssetDocument(value: unknown, sourceLabel = 'runtime asset document'): RuntimeAssetDocument {
    const record = asRecord(value, sourceLabel);
    const branding = record.branding === undefined ? undefined : asRecord(record.branding, `${sourceLabel}.branding`);
    const assets = record.assets === undefined ? undefined : asRecord(record.assets, `${sourceLabel}.assets`);

    return {
        assetURI: asString(record.assetURI, `${sourceLabel}.assetURI`),
        name: asOptionalString(record.name, `${sourceLabel}.name`),
        branding: branding ? {
            displayName: asOptionalString(branding.displayName, `${sourceLabel}.branding.displayName`),
            logoURI: asOptionalString(branding.logoURI, `${sourceLabel}.branding.logoURI`),
            heroImageURI: asOptionalString(branding.heroImageURI, `${sourceLabel}.branding.heroImageURI`),
            accentColor: asOptionalString(branding.accentColor, `${sourceLabel}.branding.accentColor`),
            themeClass: asOptionalString(branding.themeClass, `${sourceLabel}.branding.themeClass`),
        } : undefined,
        assets: assets ? {
            cssURI: asOptionalString(assets.cssURI, `${sourceLabel}.assets.cssURI`),
            imageBaseURI: asOptionalString(assets.imageBaseURI, `${sourceLabel}.assets.imageBaseURI`),
        } : undefined,
        version: asString(record.version, `${sourceLabel}.version`),
    };
}

function normalizeAddress(address: string) {
    return address.toLowerCase();
}

function extractBindingReferenceToken(bindingId: string) {
    const [, bindingToken] = bindingId.split(':');
    return bindingToken ?? bindingId;
}

function extractBindingReferenceName(uri: string) {
    const lastPathSegment = uri.split('/').pop() ?? uri;

    return lastPathSegment.replace(/\.binding\.json$/i, '').replace(/\.[^.]+$/i, '');
}

function tokenizeBindingName(value: string) {
    return value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 0);
}

function hasMatchingBindingReference(subject: SubjectRecord, binding: AssemblyBindingRecord) {
    const bindingTokens = new Set(tokenizeBindingName(extractBindingReferenceToken(binding.bindingId)));

    return (subject.bindingRefs ?? []).some((reference) =>
        reference.refKind === 'binding'
        && tokenizeBindingName(extractBindingReferenceName(reference.uri)).every((token) => bindingTokens.has(token))
    );
}

function buildManifestValidationIssues(
    subjects: SubjectRecord[],
    assemblyBindings: AssemblyBindingRecord[],
    sellerCatalogueMetadata: SellerCatalogueMetadata[],
    subjectProvenance: SubjectProvenanceRecord[],
    sourceLabel: string
): RuntimeIdentityDocumentValidationIssue[] {
    const issues: RuntimeIdentityDocumentValidationIssue[] = [];
    const seenSubjectAddresses = new Set<string>();
    const seenBindingIds = new Set<string>();

    for (const subject of subjects) {
        const normalizedAddress = normalizeAddress(subject.subjectAddress);
        if (seenSubjectAddresses.has(normalizedAddress)) {
            issues.push({
                severity: 'error',
                code: 'duplicate-subject-address',
                message: `${sourceLabel} contains duplicate subject address ${subject.subjectAddress}.`,
                subjectAddress: subject.subjectAddress,
            });
            continue;
        }

        seenSubjectAddresses.add(normalizedAddress);
    }

    for (const binding of assemblyBindings) {
        if (seenBindingIds.has(binding.bindingId)) {
            issues.push({
                severity: 'error',
                code: 'duplicate-binding-id',
                message: `${sourceLabel} contains duplicate binding id ${binding.bindingId}.`,
                subjectAddress: binding.subjectAddress,
                bindingId: binding.bindingId,
            });
        } else {
            seenBindingIds.add(binding.bindingId);
        }

        const hasSubject = subjects.some(
            (subject) => normalizeAddress(subject.subjectAddress) === normalizeAddress(binding.subjectAddress)
        );

        if (!hasSubject) {
            issues.push({
                severity: 'error',
                code: 'binding-subject-missing',
                message: `${sourceLabel} binding ${binding.bindingId} references missing subject ${binding.subjectAddress}.`,
                subjectAddress: binding.subjectAddress,
                bindingId: binding.bindingId,
            });
        }

        for (const roleBinding of binding.roleBindings) {
            if (roleBinding.scope === 'assembly' && (roleBinding.assemblyRoleKinds?.length ?? 0) === 0) {
                issues.push({
                    severity: 'warning',
                    code: 'missing-assembly-role-kinds',
                    message: `${sourceLabel} binding ${binding.bindingId} role ${roleBinding.roleKind} is missing explicit assemblyRoleKinds mapping.`,
                    subjectAddress: binding.subjectAddress,
                    bindingId: binding.bindingId,
                });
            }
        }
    }

    for (const metadata of sellerCatalogueMetadata) {
        const hasSubject = subjects.some(
            (subject) => normalizeAddress(subject.subjectAddress) === normalizeAddress(metadata.subjectAddress)
        );
        if (!hasSubject) {
            issues.push({
                severity: 'error',
                code: 'merchant-metadata-subject-missing',
                message: `${sourceLabel} seller catalogue metadata references missing subject ${metadata.subjectAddress}.`,
                subjectAddress: metadata.subjectAddress,
            });
        }

        // Operator metadata must have at least one assembly binding (any
        // assembly), so the discovery surface can route the click-through.
        // Earlier this check was hard-coded to local-commerce; now that
        // metadata exists for procurement / disclosure-review / equipment-
        // rental / freelance operators, the assertion is broadened to "any
        // binding."
        const hasAnyBinding = assemblyBindings.some(
            (binding) => normalizeAddress(binding.subjectAddress) === normalizeAddress(metadata.subjectAddress)
        );
        if (!hasAnyBinding) {
            issues.push({
                severity: 'error',
                code: 'merchant-metadata-binding-missing',
                message: `${sourceLabel} seller catalogue metadata for ${metadata.subjectAddress} has no assembly binding.`,
                subjectAddress: metadata.subjectAddress,
            });
        }
    }

    for (const provenance of subjectProvenance) {
        for (const issueCode of provenance.issues) {
            issues.push({
                severity: 'warning',
                code: issueCode,
                message: `${sourceLabel} subject ${provenance.subjectAddress} has provenance issue ${issueCode}.`,
                subjectAddress: provenance.subjectAddress,
            });
        }
    }

    for (const subject of subjects) {
        const subjectBindings = assemblyBindings.filter(
            (binding) => normalizeAddress(binding.subjectAddress) === normalizeAddress(subject.subjectAddress)
        );

        for (const binding of subjectBindings) {
            if (!hasMatchingBindingReference(subject, binding)) {
                issues.push({
                    severity: 'warning',
                    code: 'binding-ref-binding-mismatch',
                    message: `${sourceLabel} subject ${subject.subjectAddress} has no bindingRef matching binding ${binding.bindingId}.`,
                    subjectAddress: subject.subjectAddress,
                    bindingId: binding.bindingId,
                });
            }
        }
    }

    return issues;
}

export function parseRuntimeIdentityDocument(
    value: unknown,
    sourceLabel = 'runtime identity document'
): ParsedRuntimeIdentityDocument {
    const record = asRecord(value, sourceLabel);
    const subjects = asArray(record.subjects, `${sourceLabel}.subjects`);
    const assemblyBindings = asArray(record.assemblyBindings, `${sourceLabel}.assemblyBindings`);
    const sellerCatalogueMetadataRaw = record.sellerCatalogueMetadata ?? record.eatsMerchantMetadata;
    const assetDocumentsRaw = record.assetDocuments;
    const sellerCatalogueMetadata = sellerCatalogueMetadataRaw === undefined
        ? []
        : asArray(sellerCatalogueMetadataRaw, `${sourceLabel}.sellerCatalogueMetadata`);
    const assetDocuments = assetDocumentsRaw === undefined
        ? []
        : asArray(assetDocumentsRaw, `${sourceLabel}.assetDocuments`);

    const parsedSubjects = subjects.map((entry, index) => parseSubjectRecordDocument(entry, `${sourceLabel}.subjects[${index}]`));
    const parsedAssemblyBindings = assemblyBindings.map((entry, index) => parseAssemblyBindingDocument(entry, `${sourceLabel}.assemblyBindings[${index}]`));
    /**
     * Fixture records are "fat" — they pre-date the profile/catalogue
     * split and conflate identity (name, branding, accepted tokens) with
     * the items list. Project them into both arrays:
     *   - profile parser pulls name, branding, location, accepted tokens
     *   - catalogue parser pulls only {subjectAddress, menu, version}
     */
    const parsedOperatorProfileMetadata = sellerCatalogueMetadata.map(
        (entry, index) => parseOperatorProfileDocument(entry, `${sourceLabel}.sellerCatalogueMetadata[${index}]`)
    );
    const parsedSellerCatalogueMetadata = sellerCatalogueMetadata.map((entry, index) => {
        const record = (entry ?? {}) as UnknownRecord;
        return parseSellerCatalogueDocument({
            subjectAddress: record.subjectAddress,
            menu: record.menu,
            version: record.version,
        }, `${sourceLabel}.sellerCatalogueMetadata[${index}]`);
    });
    const parsedAssetDocuments = assetDocuments.map((entry, index) => parseRuntimeAssetDocument(entry, `${sourceLabel}.assetDocuments[${index}]`));
    const subjectProvenance = listSubjectProvenanceRecords(parsedSubjects, parsedAssemblyBindings);
    const validationIssues = buildManifestValidationIssues(
        parsedSubjects,
        parsedAssemblyBindings,
        parsedSellerCatalogueMetadata,
        subjectProvenance,
        sourceLabel
    );
    const errorIssue = validationIssues.find((issue) => issue.severity === 'error');

    if (errorIssue) {
        throw new Error(errorIssue.message);
    }

    return {
        version: asString(record.version, `${sourceLabel}.version`),
        subjects: parsedSubjects,
        assemblyBindings: parsedAssemblyBindings,
        operatorProfileMetadata: parsedOperatorProfileMetadata,
        sellerCatalogueMetadata: parsedSellerCatalogueMetadata,
        assetDocuments: parsedAssetDocuments,
        subjectProvenance,
        validationIssues,
    };
}

export function createRuntimeIdentityDataSourceFromDocument(
    value: unknown,
    sourceLabel = 'runtime identity document',
    sourceMetadata?: RuntimeIdentitySourceMetadata
): RuntimeIdentityDataSource & ParsedRuntimeIdentityDocument {
    const parsedManifest = parseRuntimeIdentityDocument(value, sourceLabel);

    return {
        ...parsedManifest,
        listSubjectRecords: () => parsedManifest.subjects,
        listAssemblyBindings: () => parsedManifest.assemblyBindings,
        listOperatorProfileMetadata: () => parsedManifest.operatorProfileMetadata,
        listSellerCatalogueMetadata: () => parsedManifest.sellerCatalogueMetadata,
        listAssetDocuments: () => parsedManifest.assetDocuments,
        listSubjectProvenanceRecords: () => parsedManifest.subjectProvenance,
        listValidationIssues: () => parsedManifest.validationIssues,
        getSourceMetadata: () => sourceMetadata ?? {
            sourceKind: 'unknown',
            sourceLabel,
            transport: 'in-memory',
        },
    };
}