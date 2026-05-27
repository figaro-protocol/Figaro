/**
 * Synthetic example payloads for `OperatorCatalogueMetadata` and
 * `OperatorProfileMetadata`. Test-only — production code does not consume
 * these. Moved out of `lib/shared/` so the runtime bundle no longer carries
 * fixture data.
 *
 * The profile example's `subjectAddress` is deliberately not a standard
 * Anvil account so it can't collide with a developer's test wallet.
 */

import type { OperatorCatalogueMetadata } from "@/lib/shared/operatorCatalogueMetadata";
import type { OperatorProfileMetadata } from "@/lib/shared/operatorProfileMetadata";

export const SELLER_CATALOGUE_METADATA_EXAMPLE: OperatorCatalogueMetadata = {
    subjectAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    menu: [
        {
            id: "pizza1",
            name: "Margherita Pizza",
            description: "Classic tomato, mozzarella, and basil",
            price: "0.01",
            category: "Pizza",
            image: "ipfs://example/margherita.png",
            available: true,
            schemaAttestations: {
                "figaro-allergen-v1": {
                    allergenFree: ["gluten-free-crust-option"],
                    contains: ["dairy", "gluten"],
                },
            },
        },
        {
            id: "drink1",
            name: "Soft Drink",
            description: "Cola, Sprite, or Fanta",
            price: "0.002",
            category: "Drinks",
            image: "ipfs://example/drink.png",
            available: true,
        },
    ],
    version: "1.0.0",
};

export const OPERATOR_PROFILE_METADATA_EXAMPLE: OperatorProfileMetadata = {
    subjectAddress: "0xeXAMPLeeXAMPLeeXAMPLeeXAMPLeeXAMPLe0001" as `0x${string}`,
    name: "Example Merchant",
    description: "Synthetic operator profile used as a documentation example.",
    specialty: "Example specialty",
    location: {
        geohash: "dr5reg",
        addressText: "Example City, Example State",
    },
    branding: {
        displayName: "Example Merchant",
        logoURI: "ipfs://example/logo.png",
        heroImageURI: "ipfs://example/hero.png",
        accentColor: "#1f6feb",
        themeClass: "merchant-example",
    },
    assets: {
        cssURI: "ipfs://example/theme.css",
        imageBaseURI: "ipfs://example/assets/",
    },
    acceptedTokens: [
        { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", name: "USD Coin" },
    ],
    defaultTokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    catalogueURI: "ipfs://example/catalogue.json",
    version: "1.0.0",
};
