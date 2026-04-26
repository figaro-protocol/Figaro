import fs from "node:fs/promises";
import path from "node:path";

export interface AgreementPublicationRecord {
    agreementHash: `0x${string}`;
    uri: string;
    cid?: string;
    updatedAt: string;
}

interface AgreementPublicationRegistry {
    agreements: Record<string, AgreementPublicationRecord>;
}

const AGREEMENT_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const AGREEMENT_URI_PATTERN = /^(ipfs:\/\/|\/ipfs\/|https?:\/\/)/;

/**
 * Storage-quota cap on the registry file (Web2 audit 🟡 Priority 1).
 * The registry is local-dev infrastructure and per-IP rate-limited at the
 * route layer, but a slow drip past the rate limiter could fill the disk
 * in any production exposure. 10 MB is an order of magnitude beyond any
 * realistic local-dev usage (~10k records of ~1 KB each) and gives the
 * operator clear breathing room before the 503.
 */
const MAX_REGISTRY_FILE_BYTES = 10 * 1024 * 1024;
/** Per-record cap so an attacker can't bypass the file cap with one giant URI. */
const MAX_URI_BYTES = 4 * 1024;

/** Thrown by `upsertAgreementPublication` when the storage cap would be
 *  exceeded. Routes should map to HTTP 503 (Service Unavailable). */
export class AgreementRegistryFullError extends Error {
    constructor(public readonly currentBytes: number, public readonly maxBytes: number) {
        super(`Agreement publication registry is full (${currentBytes}/${maxBytes} bytes); rotate or clean up before publishing more.`);
        this.name = "AgreementRegistryFullError";
    }
}

/** Thrown when an individual record (URI etc.) exceeds the per-record cap.
 *  Routes should map to HTTP 413 (Payload Too Large). */
export class AgreementRecordTooLargeError extends Error {
    constructor(public readonly fieldBytes: number, public readonly maxBytes: number) {
        super(`Agreement publication URI exceeds the ${maxBytes}-byte cap (${fieldBytes} bytes provided).`);
        this.name = "AgreementRecordTooLargeError";
    }
}

function getRegistryPath(rootDir = process.cwd()): string {
    return process.env.FIGARO_PUBLIC_AGREEMENT_REGISTRY_FILE
        ? path.resolve(process.env.FIGARO_PUBLIC_AGREEMENT_REGISTRY_FILE)
        : path.resolve(rootDir, ".figaro/agreement-publications.json");
}

export function isValidAgreementHash(value: string): value is `0x${string}` {
    return AGREEMENT_HASH_PATTERN.test(value);
}

export function isValidAgreementUri(value: string): boolean {
    return AGREEMENT_URI_PATTERN.test(value);
}

export function normalizeAgreementHash(value: string): `0x${string}` {
    return value.toLowerCase() as `0x${string}`;
}

async function readRegistry(): Promise<AgreementPublicationRegistry> {
    const filePath = getRegistryPath();

    try {
        const raw = await fs.readFile(filePath, "utf8");
        const parsed = JSON.parse(raw) as Partial<AgreementPublicationRegistry>;
        return {
            agreements: parsed.agreements ?? {},
        };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return { agreements: {} };
        }
        throw error;
    }
}

async function writeRegistryRaw(serialized: string): Promise<void> {
    const filePath = getRegistryPath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, serialized, "utf8");
}

export async function lookupAgreementPublication(
    agreementHash: string,
): Promise<AgreementPublicationRecord | null> {
    if (!isValidAgreementHash(agreementHash)) {
        return null;
    }

    const registry = await readRegistry();
    return registry.agreements[normalizeAgreementHash(agreementHash)] ?? null;
}

export async function upsertAgreementPublication(input: {
    agreementHash: string;
    uri: string;
    cid?: string;
}): Promise<AgreementPublicationRecord> {
    // Per-record cap — defends against one-giant-URI bypass of the file cap.
    const uriBytes = Buffer.byteLength(input.uri, "utf8");
    if (uriBytes > MAX_URI_BYTES) {
        throw new AgreementRecordTooLargeError(uriBytes, MAX_URI_BYTES);
    }

    const agreementHash = normalizeAgreementHash(input.agreementHash);
    const record: AgreementPublicationRecord = {
        agreementHash,
        uri: input.uri,
        cid: input.cid,
        updatedAt: new Date().toISOString(),
    };

    const registry = await readRegistry();
    registry.agreements[agreementHash] = record;

    // Storage-quota cap — refuse to grow the file past the limit. Upserts to
    // existing keys never push past the cap from below (size only stays the
    // same or shrinks), but new keys can. We compute the prospective size
    // and bail before the write so the registry never enters a partial state.
    const serialized = `${JSON.stringify(registry, null, 2)}\n`;
    const prospectiveBytes = Buffer.byteLength(serialized, "utf8");
    if (prospectiveBytes > MAX_REGISTRY_FILE_BYTES) {
        throw new AgreementRegistryFullError(prospectiveBytes, MAX_REGISTRY_FILE_BYTES);
    }

    await writeRegistryRaw(serialized);
    return record;
}