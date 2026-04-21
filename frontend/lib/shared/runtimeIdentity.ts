import type { ServiceBinding } from "@/lib/shared/institutionAssembly";

export type SubjectKind = "merchant" | "participant" | "operator" | "builder" | "institution";

export type MetadataTruthClass =
    | "protocol-truth"
    | "derived-truth"
    | "signed-metadata"
    | "unsigned-metadata"
    | "presentation-only"
    | "ui-local";

export interface SubjectReference {
    refKind: "metadata" | "asset" | "signature" | "binding";
    uri: string;
    contentHash?: string;
}

export interface SubjectRecord {
    subjectAddress: `0x${string}`;
    subjectKind: SubjectKind;
    displayName?: string;
    profileURI?: string;
    bindingRefs?: SubjectReference[];
    signatureRefs?: SubjectReference[];
    version: string;
}

export interface RoleBindingRecord {
    roleKind: string;
    assemblyRoleKinds?: string[];
    scope: "institution" | "process" | "order" | "mechanism";
    mechanismIds?: string[];
    notes?: string;
}

export interface InstitutionBindingRecord {
    bindingId: string;
    subjectAddress: `0x${string}`;
    archetypeId: string;
    assemblySlug: string;
    networkTargets: string[];
    roleBindings: RoleBindingRecord[];
    serviceBindings?: ServiceBinding[];
    metadataURI?: string;
    metadataHash?: string;
    assetURI?: string;
    assetHash?: string;
    effectiveFrom?: string;
    version: string;
}

export interface ResolvedIdentityContext {
    subject: SubjectRecord;
    bindings: InstitutionBindingRecord[];
    selectedBinding?: InstitutionBindingRecord;
}

export type SubjectProvenanceQuality = "signed" | "referenced-only" | "unbound";

export type SubjectProvenanceIssue =
    | "missing-binding-refs"
    | "missing-signature-refs"
    | "unlinked-binding-refs";

export interface SubjectProvenanceRecord {
    subjectAddress: `0x${string}`;
    subjectKind: SubjectKind;
    displayName?: string;
    bindingIds: string[];
    referencedAssemblies: string[];
    referencedNetworks: string[];
    bindingRefs: SubjectReference[];
    signatureRefs: SubjectReference[];
    metadataRefs: SubjectReference[];
    assetRefs: SubjectReference[];
    hasSignatures: boolean;
    quality: SubjectProvenanceQuality;
    issues: SubjectProvenanceIssue[];
}

function normalizeAddress(address: string) {
    return address.toLowerCase();
}

export function listBindingsForAddress(
    address: string,
    bindings: InstitutionBindingRecord[],
    networkTarget?: string
): InstitutionBindingRecord[] {
    const normalizedAddress = normalizeAddress(address);

    return bindings.filter((binding) => {
        if (normalizeAddress(binding.subjectAddress) !== normalizedAddress) {
            return false;
        }

        if (networkTarget && !binding.networkTargets.includes(networkTarget)) {
            return false;
        }

        return true;
    });
}

export function resolveIdentityContext(
    address: string,
    subjects: SubjectRecord[],
    bindings: InstitutionBindingRecord[],
    networkTarget?: string
): ResolvedIdentityContext | undefined {
    const normalizedAddress = normalizeAddress(address);
    const subject = subjects.find((entry) => normalizeAddress(entry.subjectAddress) === normalizedAddress);

    if (!subject) {
        return undefined;
    }

    const matchingBindings = listBindingsForAddress(address, bindings, networkTarget);

    return {
        subject,
        bindings: matchingBindings,
        selectedBinding: matchingBindings[0],
    };
}

function dedupeReferences(references: SubjectReference[]) {
    const seen = new Set<string>();

    return references.filter((reference) => {
        const dedupeKey = `${reference.refKind}:${reference.uri}:${reference.contentHash ?? ""}`;
        if (seen.has(dedupeKey)) {
            return false;
        }

        seen.add(dedupeKey);
        return true;
    });
}

export function collectSubjectProvenance(
    subject: SubjectRecord,
    bindings: InstitutionBindingRecord[]
): SubjectProvenanceRecord {
    const bindingRefs = dedupeReferences(subject.bindingRefs ?? []);
    const signatureRefs = dedupeReferences(subject.signatureRefs ?? []);
    const metadataRefs = dedupeReferences(
        bindings
            .filter((binding) => binding.metadataURI)
            .map((binding) => ({
                refKind: "metadata" as const,
                uri: binding.metadataURI as string,
                contentHash: binding.metadataHash,
            }))
    );
    const assetRefs = dedupeReferences(
        bindings
            .filter((binding) => binding.assetURI)
            .map((binding) => ({
                refKind: "asset" as const,
                uri: binding.assetURI as string,
                contentHash: binding.assetHash,
            }))
    );
    const hasBindings = bindings.length > 0;
    const hasBindingRefs = bindingRefs.length > 0;
    const hasSignatureRefs = signatureRefs.length > 0;
    const hasAnyReferences = hasBindingRefs || hasSignatureRefs || metadataRefs.length > 0 || assetRefs.length > 0;
    const issues: SubjectProvenanceIssue[] = [];

    if (hasBindings && !hasBindingRefs) {
        issues.push("missing-binding-refs");
    }

    if (hasBindings && !hasSignatureRefs) {
        issues.push("missing-signature-refs");
    }

    if (!hasBindings && hasBindingRefs) {
        issues.push("unlinked-binding-refs");
    }

    const quality: SubjectProvenanceQuality = hasBindings && hasBindingRefs && hasSignatureRefs
        ? "signed"
        : hasBindings || hasAnyReferences
            ? "referenced-only"
            : "unbound";

    return {
        subjectAddress: subject.subjectAddress,
        subjectKind: subject.subjectKind,
        displayName: subject.displayName,
        bindingIds: bindings.map((binding) => binding.bindingId),
        referencedAssemblies: [...new Set(bindings.map((binding) => binding.assemblySlug))],
        referencedNetworks: [...new Set(bindings.flatMap((binding) => binding.networkTargets))],
        bindingRefs,
        signatureRefs,
        metadataRefs,
        assetRefs,
        hasSignatures: hasSignatureRefs,
        quality,
        issues,
    };
}

export function listSubjectProvenanceRecords(
    subjects: SubjectRecord[],
    bindings: InstitutionBindingRecord[]
): SubjectProvenanceRecord[] {
    return subjects.map((subject) => collectSubjectProvenance(
        subject,
        listBindingsForAddress(subject.subjectAddress, bindings)
    ));
}