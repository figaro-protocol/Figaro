import type { Hex } from "viem";
import { DEFAULT_IPFS_SERVICE, type IpfsService } from "@/lib/shared/ipfsService";
import { safeJsonFromResponse, safeJsonParse } from "@/lib/shared/safeJson";
import { hexEqual } from "@/lib/shared/evm";
import {
    canonicalizeAgreement,
    computeAgreementHash,
    type Agreement,
} from "@/lib/core/agreementManifest";

const STORE_PREFIX = "figaro:agreement:";
const URI_PREFIX = "figaro:agreement-uri:";

const inflightHydrations = new Map<string, Promise<Agreement | null>>();

export interface PublishedAgreement {
    agreementHash: Hex;
    cid: string;
    uri: string;
}

export interface AgreementStoreOptions {
    evidenceTransport?: Pick<IpfsService, "pinJSON" | "buildURI" | "resolveFetchUrl">;
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
        // localStorage is our own write surface, but parsing through
        // safeJsonParse costs nothing and protects against an attacker who
        // gains storage write access (e.g. via XSS in another extension).
        return safeJsonParse<Agreement>(raw);
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
    return { agreementHash, cid, uri };
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

    // Event-driven lookup: the URI travels in the CommitmentPayload (see
    // useCommitmentFlow's `agreementUri` field) and is saved to localStorage
    // on receipt. A wallet that didn't witness the order (e.g., a
    // non-participant indexer query) won't have the URI and the hydrate
    // returns null — that's correct event-driven behavior; you can't
    // hydrate what you didn't witness.
    const uri = explicitUri ?? loadAgreementUri(agreementHash);
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
            const agreement = await safeJsonFromResponse<Agreement>(res);
            if (!agreement) {
                return null;
            }
            const computedHash = computeAgreementHash(agreement);
            if (!hexEqual(computedHash, agreementHash)) {
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
        if (!hexEqual(computedHash, agreementHash)) {
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
