import {
    BUILT_IN_MECHANISM_PACKAGES,
    registerMechanismPackage,
} from "@/lib/mechanisms/packages";
import {
    registerModule,
    getAllRegisteredModuleIds,
} from "@/lib/shared/moduleRegistry";
import {
    registerBlock,
    assertBlockMetadataIntegrity,
    type BlockMetadata,
} from "@/lib/shared/blockMetadata";

// ── Shell / standalone modules ──────────────────────────────────────────────

import { RoleSwitcherModule } from "@/components/modules/RoleSwitcherModule";
import { CapabilityRailModule } from "@/components/modules/CapabilityRailModule";
import { MechanismInspectorModule } from "@/components/modules/MechanismInspectorModule";
import { SellerDiscoveryModule } from "@/components/modules/SellerDiscoveryModule";
import { CartModule } from "@/components/modules/CartModule";
import { JobMarketModule } from "@/components/modules/JobMarketModule";
import { CatalogueEditorModule } from "@/components/modules/CatalogueEditorModule";
import { IncomingOrdersModule } from "@/components/modules/IncomingOrdersModule";
import { MerchantFulfilmentModule } from "@/components/modules/MerchantFulfilmentModule";

// ── Mechanism-package modules (re-imported here so block metadata can reference them) ──

import { AuctionActionModule } from "@/components/modules/AuctionActionModule";
import { ProcessGraphModule } from "@/components/modules/ProcessGraphModule";
import { OrderNodeModule } from "@/components/modules/OrderNodeModule";
import { OrderActionModule } from "@/components/modules/OrderActionModule";
import { SettlementBreakdownModule } from "@/components/modules/SettlementBreakdownModule";
import { EventTimelineModule } from "@/components/modules/EventTimelineModule";
import { ProcessCapitalSummaryModule } from "@/components/modules/ProcessCapitalSummaryModule";
import { DisclosureModule } from "@/components/modules/DisclosureModule";
import { DeliveryAttestationModule } from "@/components/modules/DeliveryAttestationPanel";
import { CoordinatorActionModule } from "@/components/modules/CoordinatorActionModule";
import { HandoffDetailsModule } from "@/components/modules/HandoffDetailsModule";
import { HandoffTrackerModule } from "@/components/modules/HandoffTrackerModule";
import { HandoffKeyExchangeModule } from "@/components/modules/HandoffKeyExchangeModule";
import { OperatorRegistrationModule } from "@/components/modules/OperatorRegistrationModule";
import { DisputeStatusModule } from "@/components/modules/DisputeStatusModule";

let registered = false;

// ── Compatibility helpers ────────────────────────────────────────────────────

const ANY_ROLE = { roles: null, requiresMechanisms: [], requiresCapabilities: [] } as const;

// ── Shell blocks (runtime chrome, not draggable) ────────────────────────────

const SHELL_BLOCKS: readonly BlockMetadata[] = [
    {
        blockId: "role-switcher",
        displayName: "Role switcher",
        description: "Runtime chrome: role-selector affordance on the assembly surface.",
        category: "shell",
        modules: [{ moduleId: "role-switcher", component: RoleSwitcherModule }],
        compatibility: ANY_ROLE,
        excludeFromPalette: true,
    },
    {
        blockId: "capability-rail",
        displayName: "Capability rail",
        description: "Runtime chrome: surface of executable capabilities for the current role/order.",
        category: "shell",
        modules: [{ moduleId: "capability-rail", component: CapabilityRailModule }],
        compatibility: ANY_ROLE,
        excludeFromPalette: true,
    },
    {
        blockId: "mechanism-inspector",
        displayName: "Mechanism inspector",
        description: "Runtime chrome: dev surface inspecting visible mechanisms on an assembly.",
        category: "shell",
        modules: [{ moduleId: "mechanism-inspector", component: MechanismInspectorModule }],
        compatibility: ANY_ROLE,
        excludeFromPalette: true,
    },
];

// ── Standalone composition blocks (draggable) ───────────────────────────────

const STANDALONE_BLOCKS: readonly BlockMetadata[] = [
    {
        blockId: "seller-discovery",
        displayName: "Seller discovery",
        description: "Buyer-side marketplace listing — browse operators, filter by service, inspect catalogues.",
        category: "mechanism",
        modules: [{ moduleId: "seller-discovery", component: SellerDiscoveryModule }],
        compatibility: { roles: ["buyer"], requiresMechanisms: [], requiresCapabilities: ["commerce.discovery"] },
        paletteOrder: 10,
    },
    {
        blockId: "cart",
        displayName: "Shopping cart",
        description: "Buyer-side cart with line-item aggregation and checkout handoff to order commitment.",
        category: "mechanism",
        modules: [{ moduleId: "cart", component: CartModule }],
        compatibility: { roles: ["buyer"], requiresMechanisms: [], requiresCapabilities: ["commerce.cart"] },
        paletteOrder: 20,
    },
    {
        blockId: "job-market",
        displayName: "Job market",
        description: "Fulfiller-side discovery panel — open jobs, geohash filter, accept-into-auction.",
        category: "mechanism",
        modules: [{ moduleId: "job-market", component: JobMarketModule }],
        compatibility: { roles: ["courier", "fulfiller"], requiresMechanisms: ["dutch-auction"], requiresCapabilities: [] },
        paletteOrder: 30,
    },
    {
        blockId: "catalogue-editor",
        displayName: "Catalogue editor",
        description: "Seller-side editor for the merchant catalogue (items, prices, branding, accepted tokens).",
        category: "schema",
        modules: [{ moduleId: "catalogue-editor", component: CatalogueEditorModule }],
        compatibility: { roles: ["seller", "merchant"], requiresMechanisms: [], requiresCapabilities: ["commerce.catalogue"] },
        paletteOrder: 40,
    },
    {
        blockId: "incoming-orders",
        displayName: "Incoming orders",
        description: "Seller-side dashboard of incoming orders with accept / reject affordances.",
        category: "display",
        modules: [{ moduleId: "incoming-orders", component: IncomingOrdersModule }],
        compatibility: { roles: ["seller", "merchant"], requiresMechanisms: [], requiresCapabilities: [] },
        paletteOrder: 50,
    },
    {
        blockId: "merchant-fulfilment",
        displayName: "Merchant fulfilment",
        description: "Merchant-side post-acceptance event log: accepted, prep-started, ready-for-pickup, handed-off (figaro-merchant-process-v1).",
        category: "handoff",
        modules: [{ moduleId: "merchant-fulfilment", component: MerchantFulfilmentModule }],
        compatibility: { roles: ["merchant"], requiresMechanisms: [], requiresCapabilities: [] },
        paletteOrder: 60,
    },
];

// ── Mechanism-package blocks ─────────────────────────────────────────────────
//
// These blocks map one-to-one with entries in BUILT_IN_MECHANISM_PACKAGES.
// Modules are registered via registerMechanismPackage (which handles
// capability bindings). registerBlock is called with registerModule=undefined
// since modules are already registered.

const PACKAGE_BLOCKS: readonly BlockMetadata[] = [
    {
        blockId: "core-process",
        displayName: "Core process coordination",
        description: "FigaroCore process shell: graph, order cards, order actions, settlement breakdown, event timeline, capital summary.",
        category: "display",
        modules: [
            { moduleId: "process-graph", component: ProcessGraphModule },
            { moduleId: "order-node", component: OrderNodeModule },
            { moduleId: "order-actions", component: OrderActionModule },
            { moduleId: "settlement-breakdown", component: SettlementBreakdownModule },
            { moduleId: "event-timeline", component: EventTimelineModule },
            { moduleId: "process-capital-summary", component: ProcessCapitalSummaryModule },
        ],
        compatibility: ANY_ROLE,
        paletteOrder: 5,
        fixedBaseline: true,
        excludeFromPalette: true,
    },
    {
        blockId: "dutch-auction",
        displayName: "Dutch auction",
        description: "Descending-price allocation mechanism. Buyer-gated start; any fulfiller can accept.",
        category: "mechanism",
        modules: [{ moduleId: "auction-actions", component: AuctionActionModule }],
        compatibility: { roles: null, requiresMechanisms: [], requiresCapabilities: [] },
        paletteOrder: 100,
    },
    {
        blockId: "ghg-disclosure",
        displayName: "GHG disclosure",
        description: "Greenhouse-gas reporting clause. Lifecycle-staged environmental disclosures.",
        category: "schema",
        modules: [{ moduleId: "disclosure-actions", component: DisclosureModule }],
        compatibility: ANY_ROLE,
        paletteOrder: 110,
    },
    {
        blockId: "delivery-attestation",
        displayName: "Delivery attestation",
        description: "Lifecycle attestations for delivery handoff — pickup, in-transit, delivered signals.",
        category: "handoff",
        modules: [{ moduleId: "delivery-attestation", component: DeliveryAttestationModule }],
        compatibility: { roles: ["courier", "fulfiller", "buyer"], requiresMechanisms: [], requiresCapabilities: [] },
        paletteOrder: 120,
    },
    {
        blockId: "handoff-coordination",
        displayName: "Handoff coordination",
        description: "Physical-exchange coordination: mode (face-to-face / dead-drop / …), ECDH key exchange, tracker.",
        category: "handoff",
        modules: [
            { moduleId: "coordinator-actions", component: CoordinatorActionModule },
            { moduleId: "handoff-details", component: HandoffDetailsModule },
            { moduleId: "handoff-tracker", component: HandoffTrackerModule },
            { moduleId: "handoff-key-exchange", component: HandoffKeyExchangeModule },
        ],
        compatibility: ANY_ROLE,
        paletteOrder: 140,
    },
    {
        blockId: "operator-registry",
        displayName: "Operator registry",
        description: "Self-service operator registration (merchant / driver / both) with reclaimable ETH deposit.",
        category: "mechanism",
        modules: [{ moduleId: "operator-registration-panel", component: OperatorRegistrationModule }],
        compatibility: ANY_ROLE,
        paletteOrder: 150,
    },
    {
        blockId: "dispute-status",
        displayName: "Dispute status",
        description: "Per-process three-layer jurisdiction panel: Layer 1 bonded settlement (always active), Layer 2 Kleros (ruling state, arbitration cost, evidence submission — when proxy configured), Layer 3 State / ADR (applicable law / forum / language — when set in agreement).",
        category: "mechanism",
        modules: [{ moduleId: "dispute-status", component: DisputeStatusModule }],
        compatibility: ANY_ROLE,
        paletteOrder: 160,
    },
];

// ── Block-array exports — consume these via blockMetadata APIs in new code ──
//
// Tests and tooling that need the underlying ID arrays should derive them
// from the block arrays:
//   PACKAGE_BLOCKS.flatMap(b => b.modules.map(m => m.moduleId))
//   STANDALONE_BLOCKS.flatMap(...)
//   SHELL_BLOCKS.flatMap(...)
// or call `listBlocksByCategory(category)` / `listBlockMetadata()` from
// `@/lib/shared/blockMetadata`. The legacy `BUILT_IN_*_MODULE_IDS`
// re-exports were removed 2026-04-22.

export { PACKAGE_BLOCKS, STANDALONE_BLOCKS, SHELL_BLOCKS };

/**
 * Register all built-in modules and their block metadata. Call once at app
 * startup. Idempotent — safe to call multiple times.
 *
 * Registration order:
 *   1. MechanismPackage registration (modules + capability bindings)
 *   2. Block metadata (package blocks; modules already registered)
 *   3. Shell + standalone blocks (block metadata AND module registration)
 *   4. Dev-only integrity check: every registered moduleId has a block
 */
export function registerAllModules(): void {
    if (registered) return;
    registered = true;

    // 1. Mechanism packages — register modules + capability bindings via the existing path.
    for (const pkg of BUILT_IN_MECHANISM_PACKAGES) {
        registerMechanismPackage(pkg);
    }

    // 2. Block metadata for package-backed blocks — modules already registered above.
    for (const block of PACKAGE_BLOCKS) {
        registerBlock(block);
    }

    // 3. Shell and standalone blocks — register both metadata and modules.
    for (const block of [...SHELL_BLOCKS, ...STANDALONE_BLOCKS]) {
        registerBlock(block, registerModule);
    }

    // 4. Dev-only integrity check — catches modules registered outside a block.
    assertBlockMetadataIntegrity(getAllRegisteredModuleIds);
}
