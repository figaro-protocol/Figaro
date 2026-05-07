import {
    AssemblyBindingRecord,
    RoleBindingRecord,
    SubjectRecord,
    SubjectReference,
} from "@/lib/shared/runtimeIdentity";
import type { RuntimeServiceKey, ServiceBinding } from "@/lib/shared/assembly";
import {
    asAddress,
    asEnum,
    asOptionalString,
    asRecord,
    asString,
    asStringArray,
} from "@/lib/shared/parseHelpers";

const REFERENCE_KINDS = new Set<SubjectReference["refKind"]>(["metadata", "asset", "signature", "binding"]);
const ROLE_SCOPES = new Set<RoleBindingRecord["scope"]>(["assembly", "process", "order", "mechanism"]);
const RUNTIME_SERVICE_KEYS = new Set<RuntimeServiceKey>([
    "identity",
    "catalogue",
    "discovery",
    "evidenceTransport",
    "coordinationMessaging",
    "handoffPersistence",
    "tokenConversion",
]);

function parseSubjectReference(value: unknown, path: string): SubjectReference {
    const record = asRecord(value, path);
    return {
        refKind: asEnum(record.refKind, REFERENCE_KINDS, `${path}.refKind`),
        uri: asString(record.uri, `${path}.uri`),
        contentHash: asOptionalString(record.contentHash, `${path}.contentHash`),
    };
}

function parseReferenceArray(value: unknown, path: string): SubjectReference[] | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }

    return value.map((entry, index) => parseSubjectReference(entry, `${path}[${index}]`));
}

function parseRoleBinding(value: unknown, path: string): RoleBindingRecord {
    const record = asRecord(value, path);
    return {
        roleKind: asString(record.roleKind, `${path}.roleKind`),
        assemblyRoleKinds: record.assemblyRoleKinds === undefined
            ? undefined
            : asStringArray(record.assemblyRoleKinds, `${path}.assemblyRoleKinds`),
        scope: asEnum(record.scope, ROLE_SCOPES, `${path}.scope`),
        mechanismIds: record.mechanismIds === undefined ? undefined : asStringArray(record.mechanismIds, `${path}.mechanismIds`),
        notes: asOptionalString(record.notes, `${path}.notes`),
    };
}

function parseRoleBindingArray(value: unknown, path: string): RoleBindingRecord[] {
    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }

    return value.map((entry, index) => parseRoleBinding(entry, `${path}[${index}]`));
}

function parseServiceBinding(value: unknown, path: string): ServiceBinding {
    const record = asRecord(value, path);

    return {
        serviceKey: asEnum(record.serviceKey, RUNTIME_SERVICE_KEYS, `${path}.serviceKey`),
        providerKey: asString(record.providerKey, `${path}.providerKey`),
    };
}

function parseServiceBindingArray(value: unknown, path: string): ServiceBinding[] | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }

    return value.map((entry, index) => parseServiceBinding(entry, `${path}[${index}]`));
}

export function parseSubjectRecordDocument(value: unknown, sourceLabel = "subject record"): SubjectRecord {
    const record = asRecord(value, sourceLabel);
    return {
        subjectAddress: asAddress(record.subjectAddress, `${sourceLabel}.subjectAddress`),
        displayName: asOptionalString(record.displayName, `${sourceLabel}.displayName`),
        profileURI: asOptionalString(record.profileURI, `${sourceLabel}.profileURI`),
        bindingRefs: parseReferenceArray(record.bindingRefs, `${sourceLabel}.bindingRefs`),
        signatureRefs: parseReferenceArray(record.signatureRefs, `${sourceLabel}.signatureRefs`),
        version: asString(record.version, `${sourceLabel}.version`),
    };
}

export function parseAssemblyBindingDocument(value: unknown, sourceLabel = "institution binding"): AssemblyBindingRecord {
    const record = asRecord(value, sourceLabel);
    return {
        bindingId: asString(record.bindingId, `${sourceLabel}.bindingId`),
        subjectAddress: asAddress(record.subjectAddress, `${sourceLabel}.subjectAddress`),
        assemblySlug: asString(record.assemblySlug, `${sourceLabel}.assemblySlug`),
        networkTargets: asStringArray(record.networkTargets, `${sourceLabel}.networkTargets`),
        roleBindings: parseRoleBindingArray(record.roleBindings, `${sourceLabel}.roleBindings`),
        serviceBindings: parseServiceBindingArray(record.serviceBindings, `${sourceLabel}.serviceBindings`),
        metadataURI: asOptionalString(record.metadataURI, `${sourceLabel}.metadataURI`),
        metadataHash: asOptionalString(record.metadataHash, `${sourceLabel}.metadataHash`),
        assetURI: asOptionalString(record.assetURI, `${sourceLabel}.assetURI`),
        assetHash: asOptionalString(record.assetHash, `${sourceLabel}.assetHash`),
        effectiveFrom: asOptionalString(record.effectiveFrom, `${sourceLabel}.effectiveFrom`),
        version: asString(record.version, `${sourceLabel}.version`),
    };
}