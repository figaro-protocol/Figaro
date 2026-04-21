import {
    InstitutionBindingRecord,
    RoleBindingRecord,
    SubjectKind,
    SubjectRecord,
    SubjectReference,
} from "@/lib/shared/runtimeIdentity";
import type { RuntimeServiceKey, ServiceBinding } from "@/lib/shared/institutionAssembly";

type UnknownRecord = Record<string, unknown>;

const SUBJECT_KINDS = new Set<SubjectKind>(["merchant", "participant", "operator", "builder", "institution"]);
const REFERENCE_KINDS = new Set<SubjectReference["refKind"]>(["metadata", "asset", "signature", "binding"]);
const ROLE_SCOPES = new Set<RoleBindingRecord["scope"]>(["institution", "process", "order", "mechanism"]);
const RUNTIME_SERVICE_KEYS = new Set<RuntimeServiceKey>([
    "identity",
    "catalogue",
    "discovery",
    "evidenceTransport",
    "coordinationMessaging",
    "handoffPersistence",
]);

function asRecord(value: unknown, path: string): UnknownRecord {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${path} must be an object.`);
    }

    return value as UnknownRecord;
}

function asString(value: unknown, path: string): string {
    if (typeof value !== "string") {
        throw new Error(`${path} must be a string.`);
    }

    return value;
}

function asOptionalString(value: unknown, path: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    return asString(value, path);
}

function asStringArray(value: unknown, path: string): string[] {
    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }

    return value.map((entry, index) => asString(entry, `${path}[${index}]`));
}

function asEnum<T extends string>(value: unknown, allowed: Set<T>, path: string): T {
    const stringValue = asString(value, path);
    if (!allowed.has(stringValue as T)) {
        throw new Error(`${path} must be one of: ${[...allowed].join(", ")}.`);
    }

    return stringValue as T;
}

function asAddress(value: unknown, path: string): `0x${string}` {
    const address = asString(value, path);
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        throw new Error(`${path} must be a 20-byte hex address.`);
    }
    return address as `0x${string}`;
}

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
        subjectKind: asEnum(record.subjectKind, SUBJECT_KINDS, `${sourceLabel}.subjectKind`),
        displayName: asOptionalString(record.displayName, `${sourceLabel}.displayName`),
        profileURI: asOptionalString(record.profileURI, `${sourceLabel}.profileURI`),
        bindingRefs: parseReferenceArray(record.bindingRefs, `${sourceLabel}.bindingRefs`),
        signatureRefs: parseReferenceArray(record.signatureRefs, `${sourceLabel}.signatureRefs`),
        version: asString(record.version, `${sourceLabel}.version`),
    };
}

export function parseInstitutionBindingDocument(value: unknown, sourceLabel = "institution binding"): InstitutionBindingRecord {
    const record = asRecord(value, sourceLabel);
    return {
        bindingId: asString(record.bindingId, `${sourceLabel}.bindingId`),
        subjectAddress: asAddress(record.subjectAddress, `${sourceLabel}.subjectAddress`),
        archetypeId: asString(record.archetypeId, `${sourceLabel}.archetypeId`),
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