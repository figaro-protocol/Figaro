/**
 * lib/seller/profileFetcher.ts
 *
 * Fetches the SellerProfileMetadata document from a seller's on-chain
 * metadataURI (pointer → IPFS/HTTP → parsed profile) — the ONE cached
 * profile read path, shared by the listings hook and every seller-edit
 * surface (the surfaces previously each hand-rolled `fetch(url).json()`).
 * The write path (pin + updateProfile) lives in `useUpdateSellerProfile`.
 * Backed by the generic `createUriFetcher` pipeline, sibling of
 * `catalogueFetcher.ts`.
 *
 * Cache is keyed by URI: a profile update re-pins to a NEW URI, so reads
 * after a write are fresh without explicit invalidation.
 */

import type { SellerProfileMetadata } from "@/lib/seller/sellerProfileMetadata";
import { tryParseSellerProfileDocument } from "@/lib/seller/sellerProfileMetadata";
import { createUriFetcher } from "@/lib/seller/uriFetcher";

const profileFetcher = createUriFetcher<SellerProfileMetadata>({
    parse: (doc) => tryParseSellerProfileDocument(doc),
});

/** Fetch and parse a seller profile document from a content URI. Null on
 *  empty URI, fetch failure, or unrecognised shape. Cached by URI — a
 *  profile update re-pins to a NEW URI, so no invalidation surface is
 *  needed (or exported). */
export const fetchSellerProfile = profileFetcher.fetch;
