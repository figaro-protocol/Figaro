/**
 * Shared IPFS transport and URI resolution.
 *
 * Owns JSON pinning, file uploads, URI construction, and gateway fetch
 * resolution so runtime surfaces do not duplicate Kubo HTTP wiring.
 */

import { safeJsonFromResponse, safeJsonParse, type SafeJsonResponse } from "@/lib/shared/safeJson";
import { readUserEndpoints } from "@/lib/shared/userEndpoints";

// Build-baked DEFAULTS only — a user's runtime endpoint override (their own
// node: they pay, they erase) wins at call time via the accessors below.
const IPFS_API_URL =
    process.env.NEXT_PUBLIC_IPFS_API_URL ?? "http://127.0.0.1:5001";

const IPFS_GATEWAY_URL =
    process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? "http://127.0.0.1:8080";

function activeIpfsApiUrl(): string {
    return readUserEndpoints().ipfsApiUrl ?? IPFS_API_URL;
}

/** Canonical Kubo gateway base URL at call time — the single source for
 *  IPFS gateway resolution (user override, else the build default). */
function activeIpfsGatewayUrl(): string {
    return readUserEndpoints().ipfsGatewayUrl ?? IPFS_GATEWAY_URL;
}

/**
 * Managed pinning service (testnet tier — `RELEASE_READINESS.md` Task 6.1).
 * When a JWT is baked into the deploy build, `add`/`unpin` target a service
 * speaking the Pinata-style pinning API instead of a Kubo node; gateway reads
 * are unaffected. A user's own runtime endpoint override still WINS — their
 * node, they pay. Dev and e2e builds carry no JWT and stay on Kubo (the JWT
 * rides the deploy command only, never a checked-in env file —
 * `docs/LOCAL_DEV.md`). `pinKeccakRawBlock` has no service equivalent (Kubo
 * `block/put` with a keccak multihash); in service mode without a user node
 * that publish stays best-effort-absent by its caller's own design
 * (`witnessContent.ts` — the on-chain fingerprint stays verifiable).
 */
function activePinService(): { api: string; jwt: string } | null {
    if (readUserEndpoints().ipfsApiUrl) return null;
    const jwt = process.env.NEXT_PUBLIC_IPFS_PIN_SERVICE_JWT ?? "";
    if (!jwt) return null;
    const api = process.env.NEXT_PUBLIC_IPFS_PIN_SERVICE_API ?? "https://api.pinata.cloud";
    return { api: api.replace(/\/$/, ""), jwt };
}

/**
 * The single resolver from a content URI to a gateway HTTP URL. Handles
 * `ipfs://CID`, `/ipfs/path`, `http(s)://` passthrough, and bare CIDv0/CIDv1.
 * Returns `null` for empty or unrecognised/unsafe schemes (javascript:, data:,
 * blob:, …). The `IpfsService.resolveFetchUrl` method delegates here; free
 * callers import this directly.
 */
export function resolveContentUri(uri: string, gatewayUrl: string = activeIpfsGatewayUrl()): string | null {
    if (!uri) return null;
    if (uri.startsWith("ipfs://")) return `${gatewayUrl}/ipfs/${uri.slice("ipfs://".length)}`;
    if (uri.startsWith("/ipfs/")) return `${gatewayUrl}${uri}`;
    if (uri.startsWith("http://") || uri.startsWith("https://")) return uri;
    // Bare CIDv0 (Qm…) / CIDv1 (bafy…) fallback.
    if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}/.test(uri) || /^bafy/.test(uri)) return `${gatewayUrl}/ipfs/${uri}`;
    // RA-2: reject unrecognised schemes.
    return null;
}

/**
 * Resolve a content URI for use as an IMAGE `src`, IPFS-only. Identical to
 * `resolveContentUri` EXCEPT a raw `http(s)://` locator returns `null` instead
 * of passing through. Permissionless seller/catalogue/branding data is
 * attacker-authorable, and a hotlinked `<img src="https://attacker/px.png">`
 * beacons every viewer's IP, User-Agent, and load timing to a host the attacker
 * picked — a tracking-pixel / deanonymization vector (frontend security audit
 * 2026-07-22, finding 3). Routing images through IPFS sends every fetch to the
 * user's OWN gateway instead, so the attacker never chooses the host. Callers
 * render their fallback (initials / neutral placeholder) when this returns null.
 */
export function resolveImageUri(uri: string): string | null {
    if (!uri) return null;
    if (uri.startsWith("http://") || uri.startsWith("https://")) return null;
    return resolveContentUri(uri);
}

/**
 * Extract the bare CID from an `ipfs://CID`, `/ipfs/CID` path, or bare CID.
 * Returns `null` for http(s) and unrecognised schemes — only IPFS content is
 * unpinnable, so this is the erasure path's admission check.
 */
export function extractIpfsCid(uri: string): string | null {
    if (!uri) return null;
    if (uri.startsWith("ipfs://")) return uri.slice("ipfs://".length).split("/")[0] || null;
    if (uri.startsWith("/ipfs/")) return uri.slice("/ipfs/".length).split("/")[0] || null;
    if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}/.test(uri) || /^bafy/.test(uri)) return uri.split("/")[0];
    return null;
}

// ── Capped document retrieval ────────────────────────────────────────────────

/**
 * Byte ceiling for a document body fetched from IPFS/HTTP. An attacker can pin
 * a multi-GB object at a CID and hand it to any reader; buffering it whole would
 * OOM the browser tab (or an agent process) BEFORE the content-hash check that
 * would reject it ever runs. Protocol documents — clause specs, agreements,
 * seller catalogues/profiles — are KB-scale; the 5 MB media-upload ceiling
 * (`MAX_FILE_SIZE`) is the largest artifact legitimately pinned, so 8 MB clears
 * every real document with margin while turning a hostile blob into a clean
 * rejection. Pairs with the clause-load depth cap (`MAX_FIELD_DEPTH`).
 */
export const MAX_IPFS_DOCUMENT_BYTES = 8 * 1024 * 1024;

function documentTooLargeError(bytes: number, cap: number): Error {
    return new Error(
        `IPFS document exceeds the maximum size of ${cap / (1024 * 1024)} MB` +
            ` (saw ${(bytes / (1024 * 1024)).toFixed(1)} MB)`,
    );
}

/** A fetched, size-capped body exposed in the `safeJsonFromResponse` shape, so
 *  callers keep piping through `safeJsonFromResponse` / `res.text()` unchanged. */
export interface CappedContentResponse extends SafeJsonResponse {
    status: number;
    statusText: string;
}

export interface CappedFetchOptions {
    /** Byte ceiling for the body; defaults to `MAX_IPFS_DOCUMENT_BYTES`. */
    cap?: number;
    /** Fetch override for injected transports / tests. Defaults to global `fetch`. */
    fetch?: (url: string, init?: RequestInit) => Promise<Response>;
}

/**
 * Stream a response body, counting bytes off the reader and aborting the moment
 * the running total crosses `cap` — before the full body is buffered. The
 * Content-Length header is only a fast-reject hint upstream; this is the actual
 * enforcement, because a hostile gateway can lie about (or omit) the header.
 */
async function readBodyBytesCapped(res: Response, cap: number, controller: AbortController): Promise<Uint8Array> {
    const reader = res.body?.getReader?.();
    if (!reader) {
        // No readable stream (e.g. a minimal test stub) — buffer, then enforce
        // the cap on what came back. Not the primary path in a real browser/undici.
        // arrayBuffer preferred: a text() round-trip corrupts binary bodies.
        const bytes = res.arrayBuffer
            ? new Uint8Array(await res.arrayBuffer())
            : new TextEncoder().encode(await res.text());
        if (bytes.byteLength > cap) throw documentTooLargeError(bytes.byteLength, cap);
        return bytes;
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            total += value.byteLength;
            if (total > cap) {
                controller.abort();
                await reader.cancel().catch(() => {});
                throw documentTooLargeError(total, cap);
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock?.();
    }

    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        joined.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return joined;
}

async function readBodyCapped(res: Response, cap: number, controller: AbortController): Promise<string> {
    return new TextDecoder().decode(await readBodyBytesCapped(res, cap, controller));
}

/**
 * Fetch a content-addressed document with a hard byte cap. Rejects early on a
 * declared Content-Length over the cap, and — never trusting the header —
 * counts bytes off the body stream and aborts mid-download the instant the cap
 * is crossed. Returns a `safeJsonFromResponse`-compatible result; a non-OK
 * response passes through as `{ ok: false }` with an empty body (the caller's
 * existing `!ok → null` branch handles it).
 */
export async function fetchCappedContent(
    url: string,
    options: CappedFetchOptions = {},
): Promise<CappedContentResponse> {
    const cap = options.cap ?? MAX_IPFS_DOCUMENT_BYTES;
    const doFetch = options.fetch ?? ((u: string, init?: RequestInit) => fetch(u, init));
    const controller = new AbortController();
    const res = await doFetch(url, { signal: controller.signal });

    if (!res.ok) {
        return { ok: false, status: res.status, statusText: res.statusText, text: async () => "" };
    }

    // Fast reject: a truthful Content-Length over the cap saves the download.
    const declared = Number(res.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > cap) {
        controller.abort();
        throw documentTooLargeError(declared, cap);
    }

    const body = await readBodyCapped(res, cap, controller);
    return { ok: true, status: res.status, statusText: res.statusText, text: async () => body };
}

/** A fetched, size-capped BINARY body — the byte-exact sibling of
 *  `fetchCappedContent` for content whose hash binds the raw bytes (a text
 *  decode round-trip would corrupt them). Same cap enforcement, same
 *  `{ ok: false }` pass-through on a non-OK response (`bytes` null there). */
export async function fetchCappedBinary(
    url: string,
    options: CappedFetchOptions = {},
): Promise<{ ok: boolean; status: number; statusText: string; bytes: Uint8Array | null }> {
    const cap = options.cap ?? MAX_IPFS_DOCUMENT_BYTES;
    const doFetch = options.fetch ?? ((u: string, init?: RequestInit) => fetch(u, init));
    const controller = new AbortController();
    const res = await doFetch(url, { signal: controller.signal });

    if (!res.ok) {
        return { ok: false, status: res.status, statusText: res.statusText, bytes: null };
    }

    const declared = Number(res.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > cap) {
        controller.abort();
        throw documentTooLargeError(declared, cap);
    }

    const bytes = await readBodyBytesCapped(res, cap, controller);
    return { ok: true, status: res.status, statusText: res.statusText, bytes };
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;

// A pin/upload must never block its caller indefinitely. An unbounded fetch to
// Kubo that connects but never responds would hang the checkout's order-share
// pin (`shareSignedOrder`) forever. Bound the request so a stalled pin rejects
// and the caller can surface the failure instead of hanging.
const IPFS_REQUEST_TIMEOUT_MS = 8000;

// A small payload keeps the 8s floor above; larger payloads (media up to
// MAX_FILE_SIZE) get a per-megabyte allowance on top, so a legitimate multi-MB
// upload to a slow Kubo isn't aborted mid-flight by the same budget that bounds
// a 2 KB agreement-JSON pin.
const IPFS_TIMEOUT_PER_MB_MS = 8000;

// Ceiling so an uncapped payload can't compute an arbitrarily long timeout —
// pinBlob enforces no size cap (only uploadFile checks MAX_FILE_SIZE), so a
// pathological blob would otherwise stretch the abort budget unbounded. Clamp
// at the budget for a MAX_FILE_SIZE upload.
const IPFS_MAX_REQUEST_TIMEOUT_MS =
    IPFS_REQUEST_TIMEOUT_MS + (MAX_FILE_SIZE / (1024 * 1024)) * IPFS_TIMEOUT_PER_MB_MS;

/** Size-aware request timeout: the 8s floor plus a per-megabyte allowance,
 *  clamped to the MAX_FILE_SIZE budget so an uncapped blob can't hang forever. */
export function ipfsTimeoutForBytes(bytes: number): number {
    return Math.round(
        Math.min(
            IPFS_REQUEST_TIMEOUT_MS + (bytes / (1024 * 1024)) * IPFS_TIMEOUT_PER_MB_MS,
            IPFS_MAX_REQUEST_TIMEOUT_MS,
        ),
    );
}

const ALLOWED_FILE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
    // Affixable DOCUMENTS (a consent clause anchors legal text by keccak256;
    // the artifact pins so a counterparty can verify by rehashing).
    "application/pdf",
    "text/plain",
    "text/markdown",
    "text/html",
]);

interface IpfsPublishResult {
    cid: string;
    uri: string;
    path: string;
    gatewayUrl: string;
}

export interface IpfsService {
    pinJSON(data: unknown): Promise<string>;
    pinBlob(blob: Blob): Promise<string>;
    /** Pin raw bytes as a single RAW block multihashed with keccak-256, so the
     *  CID's digest IS `keccak256(bytes)` — an on-chain keccak fingerprint
     *  doubles as the content address, derivable by any reader with no
     *  registry or pointer. Returns the CID Kubo reports (base32); callers
     *  verify its digest against their own keccak256 before trusting the pin.
     *  Raw blocks cap at 1 MiB — callers pin KB-scale ABI payloads. */
    pinKeccakRawBlock(bytes: Uint8Array): Promise<string>;
    publishJSON(data: unknown): Promise<IpfsPublishResult>;
    uploadFile(file: File): Promise<IpfsPublishResult>;
    /** Remove the pin for a CID on the configured node — the erasure half of
     *  pinJSON/pinBlob (author pins → author erases). Resolves silently when
     *  the CID is already unpinned: erasing an absence is absence. */
    unpin(cid: string): Promise<void>;
    buildURI(cid: string): string;
    buildPath(cid: string): string;
    buildGatewayUrl(cid: string): string;
    resolveFetchUrl(uri: string): string | null;
}

function buildPublishResult(service: DefaultIpfsService, cid: string): IpfsPublishResult {
    return {
        cid,
        uri: service.buildURI(cid),
        path: service.buildPath(cid),
        gatewayUrl: service.buildGatewayUrl(cid),
    };
}

function validateUploadableFile(file: File): void {
    if (file.size > MAX_FILE_SIZE) {
        throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB (max ${MAX_FILE_SIZE / 1024 / 1024} MB)`);
    }

    if (!ALLOWED_FILE_TYPES.has(file.type)) {
        throw new Error(`Unsupported file type: ${file.type}`);
    }
}

class DefaultIpfsService implements IpfsService {
    // Resolved per call, not at construction — a runtime endpoint override
    // must apply without a rebuild or reload.
    private get apiUrl(): string {
        return activeIpfsApiUrl();
    }

    private get gatewayUrl(): string {
        return activeIpfsGatewayUrl().replace(/\/$/, "");
    }

    async pinJSON(data: unknown): Promise<string> {
        const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
        const form = new FormData();
        form.append("file", blob);
        return this.add(form, "IPFS pin failed", "IPFS pin returned no CID", ipfsTimeoutForBytes(blob.size));
    }

    async pinBlob(blob: Blob): Promise<string> {
        const form = new FormData();
        form.append("file", blob);
        return this.add(form, "IPFS pin failed", "IPFS pin returned no CID", ipfsTimeoutForBytes(blob.size));
    }

    async pinKeccakRawBlock(bytes: Uint8Array): Promise<string> {
        const form = new FormData();
        form.append("file", new Blob([bytes as BlobPart]));
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ipfsTimeoutForBytes(bytes.byteLength));
        let res: Response;
        try {
            res = await fetch(
                `${this.apiUrl}/api/v0/block/put?cid-codec=raw&mhtype=keccak-256&mhlen=-1&pin=true`,
                { method: "POST", body: form, signal: controller.signal },
            );
        } finally {
            clearTimeout(timer);
        }

        if (!res.ok) {
            throw new Error(`IPFS block put failed: ${res.status} ${res.statusText}`);
        }

        const result = await safeJsonFromResponse<{ Key?: unknown }>(res);
        const cid = result?.Key;
        if (typeof cid !== "string" || cid.length === 0) {
            throw new Error("IPFS block put returned no CID");
        }
        return cid;
    }

    async publishJSON(data: unknown): Promise<IpfsPublishResult> {
        return buildPublishResult(this, await this.pinJSON(data));
    }

    async uploadFile(file: File): Promise<IpfsPublishResult> {
        validateUploadableFile(file);
        const form = new FormData();
        form.append("file", file);
        const cid = await this.add(form, "IPFS upload failed", "IPFS upload returned no CID", ipfsTimeoutForBytes(file.size));
        return buildPublishResult(this, cid);
    }

    async unpin(cid: string): Promise<void> {
        const service = activePinService();
        if (service) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), IPFS_REQUEST_TIMEOUT_MS);
            let res: Response;
            try {
                res = await fetch(`${service.api}/pinning/unpin/${encodeURIComponent(cid)}`, {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${service.jwt}` },
                    signal: controller.signal,
                });
            } finally {
                clearTimeout(timer);
            }
            // 404: already absent — the state unpin exists to reach. 403: the
            // scoped key cannot unpin (pin-only by intent) — the content stays
            // pinned on the service account; loud but non-fatal, cleanup is
            // account hygiene, not a user flow.
            if (res.ok || res.status === 404) return;
            if (res.status === 403) {
                console.warn(`[ipfs] pin service refused unpin of ${cid} (scoped key) — content stays pinned`);
                return;
            }
            throw new Error(`IPFS unpin failed: ${res.status} ${res.statusText}`);
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), IPFS_REQUEST_TIMEOUT_MS);
        let res: Response;
        try {
            res = await fetch(`${this.apiUrl}/api/v0/pin/rm?arg=${encodeURIComponent(cid)}`, {
                method: "POST",
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }

        if (!res.ok) {
            // Kubo answers 500 with a typed message when the pin is already
            // absent — that is the state unpin exists to reach, not an error.
            // (safeJsonFromResponse nulls on !ok, so parse the body directly.)
            const body = safeJsonParse<{ Message?: unknown }>(await res.text().catch(() => ""));
            const message = typeof body?.Message === "string" ? body.Message : "";
            if (message.includes("not pinned")) return;
            throw new Error(`IPFS unpin failed: ${res.status} ${res.statusText}${message ? ` — ${message}` : ""}`);
        }
    }

    buildURI(cid: string): string {
        return `ipfs://${cid}`;
    }

    buildPath(cid: string): string {
        return `/ipfs/${cid}`;
    }

    buildGatewayUrl(cid: string): string {
        return `${this.gatewayUrl}/ipfs/${cid}`;
    }

    resolveFetchUrl(uri: string): string | null {
        return resolveContentUri(uri, this.gatewayUrl);
    }

    private async add(
        body: FormData,
        failureMessage: string,
        emptyCidMessage: string,
        timeoutMs: number,
    ): Promise<string> {
        const service = activePinService();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let res: Response;
        try {
            res = service
                ? await fetch(`${service.api}/pinning/pinFileToIPFS`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${service.jwt}` },
                      body,
                      signal: controller.signal,
                  })
                : await fetch(`${this.apiUrl}/api/v0/add?pin=true`, {
                      method: "POST",
                      body,
                      signal: controller.signal,
                  });
        } finally {
            clearTimeout(timer);
        }

        if (!res.ok) {
            throw new Error(`${failureMessage}: ${res.status} ${res.statusText}`);
        }

        const result = await safeJsonFromResponse<{ Hash?: unknown; IpfsHash?: unknown }>(res);
        const cid = service ? result?.IpfsHash : result?.Hash;
        if (typeof cid !== "string" || cid.length === 0) {
            throw new Error(emptyCidMessage);
        }

        return cid;
    }
}

export const DEFAULT_IPFS_SERVICE: IpfsService = new DefaultIpfsService();