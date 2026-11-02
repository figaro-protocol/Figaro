/**
 * ipfsRead — the content read every runtime component shares: `ipfs://`
 * through the configured gateways, `https://` from its host (`fetchUriBytes`).
 *
 * One reader, because there is one boundary: content-addressed bytes come
 * back from whatever gateway the host configured, size-capped, with the
 * absence case (`null`) distinguished from the failure case (a thrown
 * `Error` naming every gateway that was tried). Callers decide what absence
 * MEANS — a withheld payload, an erased pin, and a never-published one all
 * read the same way, and that is the correct answer, not an error.
 *
 * Nothing here frames anything: framing is `dataChannel.mjs`'s job, applied
 * by whoever hands the bytes to a model.
 */

import { readCappedBytes } from "@figaro-protocol/sdk";

const DEFAULT_TIMEOUT_MS = 30_000;
/** 8 MiB. A gateway can serve an arbitrarily large block; a reader that does
 *  not cap is a reader an attacker sizes. */
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

/** The configured gateways, in order, DEDUPED — `IPFS_GATEWAY_URL` first, then
 *  `IPFS_FALLBACK_GATEWAY_URL`. Only what the host configured: no gateway is
 *  assumed, so an unconfigured host reads no `ipfs://` content and says so. */
export function ipfsGateways(env = process.env) {
    const seen = new Set();
    return [env.IPFS_GATEWAY_URL, env.IPFS_FALLBACK_GATEWAY_URL]
        .filter(Boolean)
        .map((g) => g.replace(/\/$/, ""))
        .filter((g) => !seen.has(g) && seen.add(g));
}

/**
 * Status codes that mean "this gateway could not resolve the address" rather
 * than "this gateway is broken". Content addressing has no negative proof — an
 * unpinned CID typically times the gateway out (504/408) rather than 404-ing —
 * so an unresolved read is ABSENCE FROM THIS READER'S VANTAGE, which is the
 * honest thing to report and never the same claim as "it does not exist".
 */
const UNRESOLVED = new Set([404, 408, 410, 451, 504, 524]);

/** Strip an `ipfs://` scheme; anything else is already a bare CID. */
export function cidOf(uri) {
    return uri.startsWith("ipfs://") ? uri.slice("ipfs://".length) : uri;
}

/**
 * Fetch one CID's raw bytes. Returns `null` when a gateway ANSWERED but could
 * not resolve the address (see `UNRESOLVED`); throws when no gateway answered
 * at all, or every answer was a different kind of failure. The two are
 * different facts, and a caller that cannot tell them apart reports absence
 * for an outage.
 */
export async function fetchIpfsBytes(cid, { gateways = ipfsGateways(), timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES } = {}) {
    if (gateways.length === 0) throw new Error("no IPFS gateway configured (set IPFS_GATEWAY_URL)");
    const failures = [];
    let unresolved = false;
    for (const gateway of gateways) {
        try {
            const res = await fetch(`${gateway}/ipfs/${cid}`, { signal: AbortSignal.timeout(timeoutMs) });
            if (UNRESOLVED.has(res.status)) { unresolved = true; continue; }
            if (!res.ok) { failures.push(`${gateway} answered ${res.status}`); continue; }
            const bytes = await readCappedBytes(res, maxBytes);
            if (bytes === null) {
                failures.push(`${gateway} served more than the ${maxBytes}-byte cap`);
                continue;
            }
            return bytes;
        } catch (e) {
            failures.push(`${gateway}: ${e instanceof Error ? e.name : String(e)}`);
        }
    }
    if (unresolved && failures.length === 0) return null;
    throw new Error(`content ${cid} unreachable — ${failures.join("; ")}`);
}

/** The same read, decoded as UTF-8 text. `null` is absence, as above. */
export async function fetchIpfsText(cid, options = {}) {
    const bytes = await fetchIpfsBytes(cid, options);
    return bytes === null ? null : new TextDecoder().decode(bytes);
}

/**
 * A content URI's raw bytes, whatever service the publisher chose. A registry
 * stores a URI, never a promise that it is IPFS: `ipfs://` (or a bare CID) is
 * read through the configured gateways, `https://` from its own host, and any
 * other scheme is refused by name. The caller verifies the bytes against the
 * hash the chain holds, so where they were served from carries no trust.
 * `null` is absence, as for `fetchIpfsBytes`.
 */
export async function fetchUriBytes(uri, options = {}) {
    if (uri.startsWith("https://")) {
        const { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES } = options;
        let res;
        try {
            res = await fetch(uri, { signal: AbortSignal.timeout(timeoutMs) });
        } catch (e) {
            throw new Error(`content ${uri} unreachable — ${e instanceof Error ? e.name : String(e)}`);
        }
        if (UNRESOLVED.has(res.status)) return null;
        if (!res.ok) throw new Error(`content ${uri} unreachable — answered ${res.status}`);
        const bytes = await readCappedBytes(res, maxBytes);
        if (bytes === null) throw new Error(`content ${uri} unreachable — more than the ${maxBytes}-byte cap`);
        return bytes;
    }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(uri) && !uri.startsWith("ipfs://")) {
        throw new Error(`content ${uri}: the ${uri.split(":")[0]} scheme is not one this reader fetches (ipfs://, https://)`);
    }
    return fetchIpfsBytes(cidOf(uri), options);
}

/** The same read, decoded as UTF-8 text. `null` is absence. */
export async function fetchUriText(uri, options = {}) {
    const bytes = await fetchUriBytes(uri, options);
    return bytes === null ? null : new TextDecoder().decode(bytes);
}
