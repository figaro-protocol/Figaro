/**
 * userEndpoints — per-user runtime endpoint overrides.
 *
 * The build-baked NEXT_PUBLIC_* endpoints are only DEFAULTS: on a hosted
 * deploy they would otherwise seize every visitor onto the operator's RPC
 * provider key and IPFS node — the only traffic-scaling cost, and the
 * wrong custody (author pins → author pays → author erases; readers read
 * through their own provider). These overrides are the user's, stored in
 * localStorage, consulted at call time by the IpfsService seam and at
 * config creation by wagmi (an RPC change applies on reload).
 */
import { readJsonStorage, writeJsonStorage } from "@/lib/shared/storage";

const STORAGE_KEY = "figaro.user-endpoints";

export interface UserEndpointOverrides {
    /** JSON-RPC endpoint for chain reads (the user's own provider key). */
    rpcUrl?: string;
    /** Kubo API endpoint pins land on (the user's own node — they pay, they erase). */
    ipfsApiUrl?: string;
    /** IPFS gateway content is read through. */
    ipfsGatewayUrl?: string;
}

function sanitize(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    // Endpoints are http(s) base URLs — refuse anything else outright.
    if (!/^https?:\/\//.test(trimmed)) return undefined;
    return trimmed.replace(/\/$/, "");
}

export function readUserEndpoints(): UserEndpointOverrides {
    const raw = readJsonStorage<UserEndpointOverrides>(STORAGE_KEY, {});
    return {
        rpcUrl: sanitize(raw.rpcUrl),
        ipfsApiUrl: sanitize(raw.ipfsApiUrl),
        ipfsGatewayUrl: sanitize(raw.ipfsGatewayUrl),
    };
}

export function writeUserEndpoints(next: UserEndpointOverrides): void {
    writeJsonStorage(STORAGE_KEY, {
        rpcUrl: sanitize(next.rpcUrl),
        ipfsApiUrl: sanitize(next.ipfsApiUrl),
        ipfsGatewayUrl: sanitize(next.ipfsGatewayUrl),
    });
}
