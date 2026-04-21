import type { Hex } from "viem";
import { DEFAULT_IPFS_SERVICE, type IpfsService } from "@/lib/shared/ipfsService";
import {
    canonicalizeAgreement,
    computeAgreementHash,
    type Agreement,
} from "@/lib/core/agreementManifest";

const STORE_PREFIX = "figaro:agreement:";
const URI_PREFIX = "figaro:agreement-uri:";
const PUBLIC_REGISTRY_BASE = "/api/semantic/agreements";

const inflightHydrations = new Map<string, Promise<Agreement | null>>();

export interface PublishedAgreement {
    agreementHash: Hex;
    cid: string;
    uri: string;
}

export interface AgreementStoreOptions {
    evidenceTransport?: Pick<IpfsService, "pinJSON" | "buildURI" | "resolveFetchUrl">;
}

interface RegisteredAgreementPublication {
    agreementHash: Hex;
    uri: string;
    cid?: string;
    updatedAt?: string;
}

function getAgreementKey(agreementHash: Hex | string): string {
    return STORE_PREFIX + agreementHash;
}

function getAgreementUriKey(agreementHash: Hex | string): string {
    return URI_PREFIX + agreementHash;
}

function canUseStorage(): boolean {
    return typeof window !== "undefined";
}

async function registerPublishedAgreement(publication: PublishedAgreement): Promise<void> {
    if (typeof window === "undefined") {
        return;
    }

    try {
        await fetch(PUBLIC_REGISTRY_BASE, {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify(publication),
        });
    } catch {
        // Ignore registry write failures. The agreement still has a local/IPFS path.
    }
}

async function discoverPublishedAgreementUri(
    agreementHash: Hex | string,
): Promise<string | null> {
    if (typeof window === "undefined") {
        return null;
    }

    try {
        const res = await fetch(`${PUBLIC_REGISTRY_BASE}/${agreementHash}`, {
            method: "GET",
            cache: "no-store",
        });
        if (!res.ok) {
            return null;
        }
        const publication = await res.json() as RegisteredAgreementPublication;
        if (!publication?.uri) {
            return null;
        }
        saveAgreementUri(agreementHash, publication.uri);
        return publication.uri;
    } catch {
        return null;
    }
}

export function saveAgreement(
    agreement: Agreement,
    options?: { uri?: string | null },
): Hex {
    const agreementHash = computeAgreementHash(agreement);

    if (!canUseStorage()) {
        return agreementHash;
    }

    try {
        localStorage.setItem(getAgreementKey(agreementHash), canonicalizeAgreement(agreement));
        if (options?.uri) {
            localStorage.setItem(getAgreementUriKey(agreementHash), options.uri);
        }
    } catch {
        // Ignore localStorage failures. The on-chain commitment remains valid.
    }

    return agreementHash;
}

export function loadAgreement(agreementHash: Hex | string | undefined | null): Agreement | null {
    if (!canUseStorage() || !agreementHash) {
        return null;
    }

    try {
        const raw = localStorage.getItem(getAgreementKey(agreementHash));
        if (!raw) return null;
        return JSON.parse(raw) as Agreement;
    } catch {
        return null;
    }
}

export function saveAgreementUri(agreementHash: Hex | string, uri: string): void {
    if (!canUseStorage() || !uri) return;

    try {
        localStorage.setItem(getAgreementUriKey(agreementHash), uri);
    } catch {
        // Ignore localStorage failures. Retrieval can still happen from inline payloads.
    }
}

export function loadAgreementUri(agreementHash: Hex | string | undefined | null): string | null {
    if (!canUseStorage() || !agreementHash) {
        return null;
    }

    try {
        return localStorage.getItem(getAgreementUriKey(agreementHash));
    } catch {
        return null;
    }
}

function resolveEvidenceTransport(
    options?: AgreementStoreOptions,
): Pick<IpfsService, "pinJSON" | "buildURI" | "resolveFetchUrl"> {
    return options?.evidenceTransport ?? DEFAULT_IPFS_SERVICE;
}

export async function publishAgreement(
    agreement: Agreement,
    options: AgreementStoreOptions = {},
): Promise<PublishedAgreement> {
    const agreementHash = computeAgreementHash(agreement);
    const evidenceTransport = resolveEvidenceTransport(options);
    const cid = await evidenceTransport.pinJSON(agreement);
    const uri = evidenceTransport.buildURI(cid);
    saveAgreement(agreement, { uri });
    const publication = { agreementHash, cid, uri };
    await registerPublishedAgreement(publication);
    return publication;
}

export async function hydrateAgreement(
    agreementHash: Hex | string | undefined | null,
    explicitUri?: string | null,
    options: AgreementStoreOptions = {},
): Promise<Agreement | null> {
    if (!agreementHash) {
        return null;
    }

    const cached = loadAgreement(agreementHash);
    if (cached) {
        return cached;
    }

    const uri = explicitUri
        ?? loadAgreementUri(agreementHash)
        ?? await discoverPublishedAgreementUri(agreementHash);
    const evidenceTransport = resolveEvidenceTransport(options);
    const fetchUrl = uri ? evidenceTransport.resolveFetchUrl(uri) : null;
    if (!fetchUrl) {
        return null;
    }

    const cacheKey = `${agreementHash}:${fetchUrl}`;
    const inflight = inflightHydrations.get(cacheKey);
    if (inflight) {
        return inflight;
    }

    const pending = (async () => {
        try {
            const res = await fetch(fetchUrl, { method: "GET" });
            if (!res.ok) {
                return null;
            }
            const agreement = await res.json() as Agreement;
            const computedHash = computeAgreementHash(agreement);
            if (computedHash.toLowerCase() !== agreementHash.toLowerCase()) {
                return null;
            }
            saveAgreement(agreement, { uri });
            return agreement;
        } catch {
            return null;
        } finally {
            inflightHydrations.delete(cacheKey);
        }
    })();

    inflightHydrations.set(cacheKey, pending);
    return pending;
}

export async function primeAgreementArtifact(params: {
    agreementHash: Hex | string;
    agreement?: Agreement | null;
    agreementUri?: string | null;
}, options: AgreementStoreOptions = {}): Promise<Agreement | null> {
    const { agreementHash, agreement, agreementUri } = params;

    if (agreement) {
        const computedHash = computeAgreementHash(agreement);
        if (computedHash.toLowerCase() !== agreementHash.toLowerCase()) {
            throw new Error("Shared agreement artifact does not match commitment agreementHash");
        }
        saveAgreement(agreement, { uri: agreementUri });
        return agreement;
    }

    if (agreementUri) {
        saveAgreementUri(agreementHash, agreementUri);
        return hydrateAgreement(agreementHash, agreementUri, options);
    }

    return loadAgreement(agreementHash);
}

export function deleteAgreement(agreementHash: Hex): void {
    if (!canUseStorage()) return;
    localStorage.removeItem(getAgreementKey(agreementHash));
    localStorage.removeItem(getAgreementUriKey(agreementHash));
}
