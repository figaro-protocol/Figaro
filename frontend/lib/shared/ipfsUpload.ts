/**
 * Compatibility wrapper over the shared IPFS transport service.
 */

import { DEFAULT_IPFS_SERVICE, type IpfsService } from "@/lib/shared/ipfsService";

function resolveEvidenceTransport(options?: { service?: IpfsService }) {
    return options?.service ?? DEFAULT_IPFS_SERVICE;
}

/**
 * Upload a file to IPFS and return its `ipfs://<CID>` URI.
 *
 * @throws if the file exceeds MAX_FILE_SIZE or has a disallowed MIME type.
 */
export async function uploadFileToIPFS(file: File, options?: { service?: IpfsService }): Promise<string> {
    const result = await resolveEvidenceTransport(options).uploadFile(file);
    return result.uri;
}
