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

async function writeRegistry(registry: AgreementPublicationRegistry): Promise<void> {
    const filePath = getRegistryPath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
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
    const agreementHash = normalizeAgreementHash(input.agreementHash);
    const record: AgreementPublicationRecord = {
        agreementHash,
        uri: input.uri,
        cid: input.cid,
        updatedAt: new Date().toISOString(),
    };

    const registry = await readRegistry();
    registry.agreements[agreementHash] = record;
    await writeRegistry(registry);
    return record;
}