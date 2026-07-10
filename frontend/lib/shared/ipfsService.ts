/**
 * Shared IPFS transport and URI resolution.
 *
 * Owns JSON pinning, file uploads, URI construction, and gateway fetch
 * resolution so runtime surfaces do not duplicate Kubo HTTP wiring.
 */

import { safeJsonFromResponse, safeJsonParse } from "@/lib/shared/safeJson";
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
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let res: Response;
        try {
            res = await fetch(`${this.apiUrl}/api/v0/add?pin=true`, {
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

        const result = await safeJsonFromResponse<{ Hash?: unknown }>(res);
        const cid = result?.Hash;
        if (typeof cid !== "string" || cid.length === 0) {
            throw new Error(emptyCidMessage);
        }

        return cid;
    }
}

export const DEFAULT_IPFS_SERVICE: IpfsService = new DefaultIpfsService();