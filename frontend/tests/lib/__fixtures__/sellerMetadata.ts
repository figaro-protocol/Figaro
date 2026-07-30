/**
 * Synthetic example payloads for `SellerCatalogueMetadata` and
 * `MemberProfileMetadata`. Test-only — production code does not consume
 * these. Moved out of `lib/shared/` so the runtime bundle no longer carries
 * fixture data.
 *
 * The profile example's `subjectAddress` is deliberately not a standard
 * Anvil account so it can't collide with a developer's test wallet — but it
 * IS valid hex: an invalid-hex example teaches consumers that garbage passes,
 * and any address-validating reader would reject the whole fixture.
 */

import type { MemberProfileMetadata } from "@/lib/seller/memberProfileMetadata";

export const SELLER_PROFILE_METADATA_EXAMPLE: MemberProfileMetadata = {
    subjectAddress: "0x00000000000000000000000000000000000e0001",
    name: "Example Seller",
    description: "Synthetic seller profile used as a documentation example.",
    specialty: "Example specialty",
    location: {
        geohash: "dr5reg",
        addressText: "Example City, Example State",
    },
    branding: {
        logoURI: "ipfs://example/logo.png",
    },
    assets: {
        imageBaseURI: "ipfs://example/assets/",
    },
    acceptedTokens: [
        { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", name: "USD Coin" },
    ],
    defaultTokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    catalogueURI: "ipfs://example/catalogue.json",
};
