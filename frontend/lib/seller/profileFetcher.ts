/**
 * lib/seller/profileFetcher.ts
 *
 * Fetches the MemberProfileMetadata document from a seller's on-chain
 * metadataURI (pointer → IPFS/HTTP → parsed profile) — the ONE cached
 * profile read path, shared by the listings hook and every seller-edit
 * surface (the surfaces previously each hand-rolled `fetch(url).json()`).
 * The write path (pin + updateProfile) lives in `useUpdateMemberProfile`.
 * Backed by the generic `createUriFetcher` pipeline, sibling of
 * `catalogueFetcher.ts`.
 *
 * Cache is keyed by URI: a profile update re-pins to a NEW URI, so reads
 * after a write are fresh without explicit invalidation.
 */

import type { MemberProfileMetadata } from "@/lib/seller/memberProfileMetadata";
import { tryParseMemberProfileDocument } from "@/lib/seller/memberProfileMetadata";
import { createUriFetcher } from "@/lib/seller/uriFetcher";

const profileFetcher = createUriFetcher<MemberProfileMetadata>({
    parse: (doc) => tryParseMemberProfileDocument(doc),
});

/** Fetch and parse a seller profile document from a content URI. Null on
 *  empty URI, fetch failure, or unrecognised shape. Cached by URI — a
 *  profile update re-pins to a NEW URI, so no invalidation surface is
 *  needed (or exported). */
export const fetchMemberProfile = profileFetcher.fetch;
