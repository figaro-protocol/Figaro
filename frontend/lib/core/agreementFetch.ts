/**
 * agreementFetch.ts — get a committed agreement from the network.
 *
 * The chain stores only an agreement's 32-byte merkle hash; the body lives on
 * IPFS, the SSoT. `fetchAgreement` resolves the body by the URI that travelled
 * in the order's payload, then VERIFIES the fetched bytes against the on-chain
 * `agreementHash` before trusting them — so a tampered IPFS copy is rejected.
 *
 * No body cache, no store of record: the in-memory `useProcessAgreements`
 * singleton holds bodies for the session (pure UX), and re-fetches from IPFS
 * each load. The ONLY local state here is the witnessed-URI pointer — the kernel
 * never puts the URI on-chain, so "which URI for this hash" is event-driven
 * local knowledge of orders this wallet saw (like a draft: data not on the
 * network). A wallet that didn't witness an order has no URI and gets null —
 * correct: you can't fetch a body you were never pointed at.
 */
import type { Hex } from "viem";
import { computeAgreementHash, type Agreement } from "@figaro/core";
import { DEFAULT_IPFS_SERVICE, type IpfsService } from "@/lib/shared/ipfsService";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";
import { hexEqual } from "@/lib/shared/evm";

const URI_PREFIX = "figaro:agreement-uri:";
const uriKey = (h: Hex | string) => URI_PREFIX + h;
const canUseStorage = () => typeof window !== "undefined";

export interface AgreementFetchOptions {
    evidenceTransport?: Pick<IpfsService, "pinJSON" | "buildURI" | "resolveFetchUrl">;
}

const transport = (o?: AgreementFetchOptions) => o?.evidenceTransport ?? DEFAULT_IPFS_SERVICE;

/** Record the IPFS URI a wallet witnessed for an agreementHash (event-driven). */
export function saveAgreementUri(agreementHash: Hex | string, uri: string): void {
    if (!canUseStorage() || !uri) return;
    try {
        localStorage.setItem(uriKey(agreementHash), uri);
    } catch { /* non-fatal */ }
}

export function loadAgreementUri(agreementHash: Hex | string | undefined | null): string | null {
    if (!canUseStorage() || !agreementHash) return null;
    try {
        return localStorage.getItem(uriKey(agreementHash));
    } catch {
        return null;
    }
}

const inflight = new Map<string, Promise<Agreement | null>>();

/**
 * Fetch a committed agreement from IPFS and verify it against `agreementHash`.
 * `uri` defaults to the witnessed URI for the hash. Returns null when there is
 * no URI (un-witnessed) or the fetched bytes don't hash to `agreementHash`.
 * Concurrent calls for the same target share one in-flight fetch.
 */
export async function fetchAgreement(
    agreementHash: Hex | string | undefined | null,
    uri?: string | null,
    options: AgreementFetchOptions = {},
): Promise<Agreement | null> {
    if (!agreementHash) return null;
    const resolvedUri = uri ?? loadAgreementUri(agreementHash);
    const fetchUrl = resolvedUri ? transport(options).resolveFetchUrl(resolvedUri) : null;
    if (!fetchUrl) return null;

    const cacheKey = `${agreementHash}:${fetchUrl}`;
    const pending = inflight.get(cacheKey);
    if (pending) return pending;

    const run = (async () => {
        try {
            const res = await fetch(fetchUrl, { method: "GET" });
            const agreement = await safeJsonFromResponse<Agreement>(res);
            if (!agreement) return null;
            if (!hexEqual(computeAgreementHash(agreement), agreementHash)) return null;
            // Remember the URI we just proved good (witnessed-pointer only).
            if (resolvedUri) saveAgreementUri(agreementHash, resolvedUri);
            return agreement;
        } catch {
            return null;
        } finally {
            inflight.delete(cacheKey);
        }
    })();
    inflight.set(cacheKey, run);
    return run;
}

export interface PublishedAgreement {
    agreementHash: Hex;
    cid: string;
    uri: string;
}

/** Pin an agreement to IPFS (network SSoT) and remember its URI locally. */
export async function publishAgreement(
    agreement: Agreement,
    options: AgreementFetchOptions = {},
): Promise<PublishedAgreement> {
    const agreementHash = computeAgreementHash(agreement);
    const t = transport(options);
    const cid = await t.pinJSON(agreement);
    const uri = t.buildURI(cid);
    saveAgreementUri(agreementHash, uri);
    return { agreementHash, cid, uri };
}
