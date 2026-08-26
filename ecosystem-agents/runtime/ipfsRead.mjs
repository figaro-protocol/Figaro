/**
 * ipfsRead — the gateway read every runtime component shares.
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

const DEFAULT_TIMEOUT_MS = 30_000;
/** 8 MiB. A gateway can serve an arbitrarily large block; a reader that does
 *  not cap is a reader an attacker sizes. */
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

/** The configured gateways, in order, DEDUPED — `IPFS_GATEWAY_URL` first when
 *  set, then the fallback. Pointing both at the same host is a configuration
 *  the caller should not pay for twice. */
export function ipfsGateways(env = process.env) {
    const seen = new Set();
    return [env.IPFS_GATEWAY_URL, env.IPFS_FALLBACK_GATEWAY_URL ?? "https://ipfs.io"]
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
            const bytes = new Uint8Array(await res.arrayBuffer());
            if (bytes.byteLength > maxBytes) {
                failures.push(`${gateway} served ${bytes.byteLength} bytes over the ${maxBytes} cap`);
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
