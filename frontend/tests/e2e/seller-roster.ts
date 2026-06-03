/**
 * SELLER ROSTER — the single source of truth for the sellers our e2e scenarios
 * need on the network.
 *
 * The `sellers-onboarding` spec iterates this list and onboards each seller
 * through the REAL registration wizard (pinned to IPFS, anchored on
 * SellerRegistry, PERSISTED), idempotently. This REPLACES `seed-devnet.mjs`'s
 * direct-call `SELLERS` seeding — sellers are created the mainnet way, not
 * fabricated. Grow this roster as each scenario lands; do NOT add sellers
 * piecemeal inside individual runtime specs.
 *
 * ┌─ THE FULL MAINNET-COMPLIANT E2E PIPELINE (per fresh devnet) ──────────────┐
 * │ 1. scenario-<slug> authoring specs → publish each assembly                │
 * │                                       (UI → IPFS pin → on-chain anchor,    │
 * │                                        PERSISTED — no snapshot/revert)     │
 * │ 2. sellers-onboarding spec         → onboard each ROSTER seller, bound to  │
 * │                                       its assemblies + products (UI wizard,│
 * │                                       pinned + anchored, PERSISTED)        │
 * │ 3. <scenario> runtime specs        → BUYER consumes the seller + assembly  │
 * │                                       from chain→IPFS (browse → cart →     │
 * │                                       checkout → commit → resolve)         │
 * │                                                                            │
 * │ devnet == mainnet-on-a-laptop. No seed-replay, no re-pinning, no           │
 * │ fabricated state. Every published artifact is verified anchored + pinned   │
 * │ + surfacing (assertPinnedInIpfs / assertSellerProfileSurfaces /            │
 * │ assertSellerOnDiscovery / assertAssemblyOnInventory in devnet-helpers).    │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * See memory: project_mainnet_test_pipeline, feedback_all_tests_mainnet_compliant.
 */

export interface SellerProductSpec {
    name: string;
    /** Decimal-string price in the default token. */
    price: string;
}

export interface SellerSpec {
    /** Anvil index — MUST be ≥5 (disjoint from the buyer/test range anvil[0..4],
     *  so a seller never collides with a buyer or an "unregistered wallet" check). */
    addressIndex: number;
    address: `0x${string}`;
    name: string;
    specialty: string;
    /** Assembly slugs this seller adopts at onboarding. Each must already be
     *  published (anchored) by its scenario authoring spec — adoption references
     *  the slug; it does not re-pin the assembly. */
    assemblies: string[];
    /** Catalogue products (at least one). */
    products: SellerProductSpec[];
}

export const SELLER_ROSTER: readonly SellerSpec[] = [
    {
        addressIndex: 5,
        address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
        name: "Kiosk Corner",
        specialty: "kiosk",
        assemblies: ["kiosk-sale"],
        products: [{ name: "Newspaper", price: "1" }],
    },
    {
        addressIndex: 6,
        address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
        name: "Aurora Café",
        specialty: "café",
        assemblies: ["direct-sale"],
        products: [{ name: "Espresso", price: "1" }],
    },
];
