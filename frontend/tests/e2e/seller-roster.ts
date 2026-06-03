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

interface SellerProductSpec {
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
    /** Seller's home location as a precision-9 geohash. Written to the profile
     *  at onboarding (profile.location.geohash); the on-site checkout reads it
     *  to populate the figaro-geo-v2 origin/destination so the exchange is
     *  located on the flow graph. Required for any seller adopting a geo-bearing
     *  assembly. */
    geohash: string;
    /** Assembly slugs this seller adopts at onboarding. Each must already be
     *  published (anchored) by its scenario authoring spec — adoption references
     *  the slug; it does not re-pin the assembly. */
    assemblies: string[];
    /** Per-assembly courier designations — the counterparty bindings the wizard's
     *  OnboardingAssembliesForm captures when an adopted assembly has a courier
     *  sub-order (figaro-courier-process-v1). Keyed by assembly slug → the courier
     *  wallet addresses this seller (a merchant) trusts to fill the delivery
     *  sub-order. The checkout reads them to resolve the courier order's seller.
     *  Omit for sellers that designate no couriers (e.g. the courier itself). */
    courierAddresses?: Record<string, `0x${string}`[]>;
    /** Catalogue products (at least one). */
    products: SellerProductSpec[];
}

export const SELLER_ROSTER: readonly SellerSpec[] = [
    {
        addressIndex: 5,
        address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
        name: "Kiosk Corner",
        specialty: "kiosk",
        geohash: "9q8yyk8yu",
        assemblies: ["kiosk-sale"],
        products: [{ name: "Newspaper", price: "1" }],
    },
    {
        addressIndex: 6,
        address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
        name: "Aurora Café",
        specialty: "café",
        geohash: "9q8yyk8yt",
        assemblies: ["direct-sale"],
        products: [{ name: "Espresso", price: "1" }],
    },
    // local-commerce (2-node seller-assigned delivery): a merchant that arranges
    // its own courier. Rosa's Kitchen (anvil[7]) sells the goods and designates
    // Cardinal Couriers (anvil[8]) as its trusted courier for the delivery
    // sub-order; the courier prices the delivery from its own catalogue. Both
    // bind local-commerce — the merchant fills the root order, the courier the
    // figaro-courier-process-v1 sub-order. One neighbourhood (9q8yyk8y* cells).
    {
        addressIndex: 7,
        address: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
        name: "Rosa's Kitchen",
        specialty: "prepared food, own delivery",
        geohash: "9q8yyk8yv",
        assemblies: ["local-commerce"],
        courierAddresses: { "local-commerce": ["0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"] },
        products: [{ name: "Margherita pizza", price: "1" }],
    },
    {
        addressIndex: 8,
        address: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
        name: "Cardinal Couriers",
        specialty: "last-mile delivery",
        geohash: "9q8yyk8yw",
        assemblies: ["local-commerce"],
        products: [{ name: "Standard delivery", price: "1" }],
    },
];
