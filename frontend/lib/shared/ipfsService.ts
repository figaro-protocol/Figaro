/**
 * Shared IPFS transport and URI resolution.
 *
 * Owns JSON pinning, file uploads, URI construction, and gateway fetch
 * resolution so runtime surfaces do not duplicate Kubo HTTP wiring.
 */

import { safeJsonFromResponse } from "@/lib/shared/safeJson";

const IPFS_API_URL =
    process.env.NEXT_PUBLIC_IPFS_API_URL ?? "http://127.0.0.1:5001";

const IPFS_GATEWAY_URL =
    process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? "http://127.0.0.1:8080";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_FILE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
]);

export interface IpfsPublishResult {
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
    private readonly apiUrl = IPFS_API_URL;
    private readonly gatewayUrl = IPFS_GATEWAY_URL.replace(/\/$/, "");

    async pinJSON(data: unknown): Promise<string> {
        const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
        const form = new FormData();
        form.append("file", blob);
        return this.add(form, "IPFS pin failed", "IPFS pin returned no CID");
    }

    async pinBlob(blob: Blob): Promise<string> {
        const form = new FormData();
        form.append("file", blob);
        return this.add(form, "IPFS pin failed", "IPFS pin returned no CID");
    }

    async publishJSON(data: unknown): Promise<IpfsPublishResult> {
        return buildPublishResult(this, await this.pinJSON(data));
    }

    async uploadFile(file: File): Promise<IpfsPublishResult> {
        validateUploadableFile(file);
        const form = new FormData();
        form.append("file", file);
        const cid = await this.add(form, "IPFS upload failed", "IPFS upload returned no CID");
        return buildPublishResult(this, cid);
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
        if (!uri) {
            return null;
        }

        if (uri.startsWith("ipfs://")) {
            return this.buildGatewayUrl(uri.slice("ipfs://".length));
        }

        if (uri.startsWith("/ipfs/")) {
            return `${this.gatewayUrl}${uri}`;
        }

        if (uri.startsWith("http://") || uri.startsWith("https://")) {
            return uri;
        }

        return null;
    }

    private async add(
        body: FormData,
        failureMessage: string,
        emptyCidMessage: string,
    ): Promise<string> {
        const res = await fetch(`${this.apiUrl}/api/v0/add?pin=true`, {
            method: "POST",
            body,
        });

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