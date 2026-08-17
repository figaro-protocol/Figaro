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
import { computeAgreementHash, parseClauseRegistryLogs, publicForm, type Agreement } from "@figaro/sdk";
import { DEFAULT_IPFS_SERVICE, extractIpfsCid, fetchCappedContent, type IpfsService } from "@/lib/shared/ipfsService";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";
import { getClauseSpec, loadClauseSpec, specSource } from "@/lib/shared/clauseSpecSource";
import { CONTRACTS, CLAUSE_REGISTRY_ABI } from "@/lib/kernel/contracts";
import { activeChain, publicClient } from "@/lib/shared/wagmi";
import { cachedGetContractEvents } from "@/lib/kernel/eventCache";
import { hexEqual } from "@/lib/shared/evm";

const URI_PREFIX = "figaro:agreement-uri:";
const uriKey = (h: Hex | string) => URI_PREFIX + h;
const canUseStorage = () => typeof window !== "undefined";

export interface AgreementFetchOptions {
    evidenceTransport?: Pick<IpfsService, "pinJSON" | "buildURI" | "resolveFetchUrl">;
}

const transport = (o?: AgreementFetchOptions) => o?.evidenceTransport ?? DEFAULT_IPFS_SERVICE;

/** Record the IPFS URI a wallet witnessed for an agreementHash (event-driven).
 *  Internal: the witnessed-URI pointer is written via `publishAgreement` and read
 *  via `fetchAgreement` — both in this file. */
function saveAgreementUri(agreementHash: Hex | string, uri: string): void {
    if (!canUseStorage() || !uri) return;
    try {
        localStorage.setItem(uriKey(agreementHash), uri);
    } catch { /* non-fatal */ }
}

function loadAgreementUri(agreementHash: Hex | string | undefined | null): string | null {
    if (!canUseStorage() || !agreementHash) return null;
    try {
        return localStorage.getItem(uriKey(agreementHash));
    } catch {
        return null;
    }
}

/** Drop the witnessed-URI pointer for a hash (the "forget" half of erasure). */
function forgetAgreementUri(agreementHash: Hex | string): void {
    if (!canUseStorage()) return;
    try {
        localStorage.removeItem(uriKey(agreementHash));
    } catch { /* non-fatal */ }
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
            // Size-capped: an attacker-pinned multi-GB body aborts mid-stream
            // (throws → the catch below → null) before the hash check buffers it.
            const res = await fetchCappedContent(fetchUrl);
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

/**
 * Erase a witnessed agreement pin: best-effort unpin the body from this
 * wallet's node and forget the local URI pointer (unpin + forget — the same
 * erasure symmetry as the member profile and device-evidence paths, and the
 * controller-erasure half of "author pins → author erases"). The committed
 * agreement carries the most participant-linkable content of any pin, and until
 * now it was the one high-PII artifact with no erasure affordance.
 *
 * Controller-initiated, never automatic: the committed agreement is the Layer-3
 * dispute record an off-chain forum receives, so it must outlive `resolveProcess`
 * — a party erases it deliberately, once the record is no longer needed.
 *
 * Best-effort and idempotent by design: content addressing means this erases
 * only THIS wallet's copy (a counterparty node or a gateway may still hold it);
 * an unpin failure is logged and swallowed; unpinning an absent pin or forgetting
 * an absent pointer is absence, not an error.
 */
export async function unpinAgreement(
    agreementHash: Hex | string,
    ipfs: Pick<IpfsService, "unpin"> = DEFAULT_IPFS_SERVICE,
): Promise<void> {
    const uri = loadAgreementUri(agreementHash);
    const cid = uri ? extractIpfsCid(uri) : null;
    if (cid) {
        try {
            await ipfs.unpin(cid);
        } catch (err) {
            console.warn(`[agreementFetch] unpin ${cid} failed (content stays pinned):`, err);
        }
    }
    forgetAgreementUri(agreementHash);
}

/** Warm the clause specs the agreement's sections reference into the module
 *  cache before `publicForm` decides what to withhold. `publicForm` is
 *  FAIL-CLOSED (an unknown clause is withheld), so a COLD private spec at pin
 *  time would over-redact a PUBLIC section — and, without this warm step on the
 *  RECEIVER re-pin leg (a wallet that never composed the agreement, so never
 *  loaded the clause through a disposition-aware input), a cold spec is the norm.
 *  Reads the registry once and loads only the specs actually missing (the common
 *  warm path short-circuits with zero I/O). Best-effort: if the registry read or
 *  a spec load fails, the fail-closed projection over-redacts rather than leaking
 *  — the correct privacy-first direction, never a plaintext-private pin. */
async function warmAgreementSpecs(agreement: Agreement): Promise<void> {
    const missing = agreement.sections.filter(
        (s) => getClauseSpec(s.clause, s.version) === undefined,
    );
    if (missing.length === 0) return;
    const addr = CONTRACTS.clauseRegistry;
    if (!addr || addr.length !== 42) return;
    let registered;
    try {
        // Minimal ClauseRegistered read via the standalone client + SDK log
        // parser (kernel-layer legal — no protocol/ import). The withdraw fold is
        // irrelevant here: a committed agreement resolves its clauses regardless
        // of whether the registration stake was later reclaimed.
        const logs = await cachedGetContractEvents(publicClient, publicClient.chain?.id ?? activeChain.id, {
            address: addr,
            abi: CLAUSE_REGISTRY_ABI,
            eventName: "ClauseRegistered",
        });
        registered = parseClauseRegistryLogs(logs as Parameters<typeof parseClauseRegistryLogs>[0]).registered;
    } catch {
        return; // can't warm → publicForm withholds the unknown specs (safe)
    }
    await Promise.allSettled(
        missing.map((s) => {
            const event = registered.find((r) => r.clauseId === s.clause && r.version === s.version);
            return event
                ? loadClauseSpec(s.clause, s.version, event.contentURI, event.contentHash)
                : Promise.resolve(undefined);
        }),
    );
}

/** Pin an agreement to IPFS (network SSoT) and remember its URI locally. */
export async function publishAgreement(
    agreement: Agreement,
    options: AgreementFetchOptions = {},
): Promise<PublishedAgreement> {
    const agreementHash = computeAgreementHash(agreement);
    const t = transport(options);
    // Withhold every `private`-disposition section from the PUBLIC pin — a paid-
    // edge value's plaintext never lands on public IPFS or in a shareable audit
    // bundle. The withheld leaf is identical, so `agreementHash` is unchanged and
    // any reader still verifies the root + every public section. The signed and
    // counterparty-relayed forms keep plaintext; only this standalone pin is
    // redacted. Warm the specs first so the FAIL-CLOSED projection is exact —
    // otherwise a cold private spec (common on the receiver re-pin) would leak.
    await warmAgreementSpecs(agreement);
    const cid = await t.pinJSON(publicForm(agreement, specSource()));
    const uri = t.buildURI(cid);
    saveAgreementUri(agreementHash, uri);
    return { agreementHash, cid, uri };
}
