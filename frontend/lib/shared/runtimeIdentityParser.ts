import {
    SubjectRecord,
    SubjectReference,
} from "@/lib/shared/runtimeIdentity";
import {
    asAddress,
    asEnum,
    asOptionalString,
    asRecord,
    asString,
} from "@/lib/shared/parseHelpers";

const REFERENCE_KINDS = new Set<SubjectReference["refKind"]>(["metadata", "asset", "signature", "binding"]);

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
