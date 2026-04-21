/**
 * Compatibility wrapper over the shared IPFS transport service.
 */

import { DEFAULT_IPFS_SERVICE, type IpfsService } from "@/lib/shared/ipfsService";

function resolveEvidenceTransport(options?: { service?: IpfsService }) {
    return options?.service ?? DEFAULT_IPFS_SERVICE;
}

/**
 * Pin a JSON object to IPFS via the Kubo `/api/v0/add` endpoint.
 *
 * @returns The CID (v0 by default, e.g. "QmXyz...")
 */
export async function pinJSON(data: unknown, options?: { service?: IpfsService }): Promise<string> {
    return resolveEvidenceTransport(options).pinJSON(data);
}

/**
 * Build an IPFS URI from a CID (for Kleros evidence/metaevidence URIs).
 */
export function ipfsURI(cid: string, options?: { service?: IpfsService }): string {
    return resolveEvidenceTransport(options).buildPath(cid);
}

/**
 * Build a gateway URL for retrieving an IPFS object.
 */
export function ipfsGatewayURL(cid: string, options?: { service?: IpfsService }): string {
    return resolveEvidenceTransport(options).buildGatewayUrl(cid);
}
