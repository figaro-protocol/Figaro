/**
 * sellerBrandingMetadata.ts — the seller's branding (identity / presentation).
 *
 * A distinct concern from the catalogue (the seller's items) and the profile.
 * Kept in its own file so branding never leaks into catalogue or profile types.
 */
export interface SellerBrandingMetadata {
    logoURI?: string;
}
