/**
 * lib/member/profileFetcher.ts
 *
 * Fetches the MemberProfileMetadata document from a member's on-chain
 * metadataURI (pointer → IPFS/HTTP → parsed profile) — the ONE cached
 * profile read path, shared by the listings hook and every profile-edit
 * surface.
 * The write path (pin + updateProfile) lives in `useUpdateMemberProfile`.
 * Backed by the generic `createUriFetcher` pipeline, sibling of
 * `catalogFetcher.ts`.
 *
 * Cache is keyed by URI: a profile update re-pins to a NEW URI, so reads
 * after a write are fresh without explicit invalidation.
 */

import type { MemberProfileMetadata } from "@/lib/member/memberProfileMetadata";
import { tryParseMemberProfileDocument } from "@/lib/member/memberProfileMetadata";
import { createUriFetcher } from "@/lib/member/uriFetcher";
import { getMemberMetadataURI } from "@/lib/protocol/membersRegistryIndexer";
import type { MemberProfileReader } from "@figaro-protocol/sdk";
import type { PublicClient } from "viem";

const profileFetcher = createUriFetcher<MemberProfileMetadata>({
    parse: (doc) => tryParseMemberProfileDocument(doc),
});

/** Fetch and parse a member profile document from a content URI. Null on
 *  empty URI, fetch failure, or unrecognized shape. Cached by URI — a
 *  profile update re-pins to a NEW URI, so no invalidation surface is
 *  needed (or exported). */
export const fetchMemberProfile = profileFetcher.fetch;

/** A member's OWN profile, read at the edge when it is needed — the
 *  `MemberProfileReader` a seller's accept gate takes
 *  (`checkSellerBindsAssembly`): MembersRegistry's current metadataURI for
 *  the member, folded from the registry's events on this read, then the
 *  pinned document through the cached parse above. Null when the member
 *  has no live profile, or when there is no chain connection. */
export function profileReaderForChain(client: PublicClient | undefined, chainId: number): MemberProfileReader {
    return async (member) => {
        if (!client) return null;
        const metadataURI = await getMemberMetadataURI(client, chainId, member);
        return metadataURI ? fetchMemberProfile(metadataURI) : null;
    };
}
