import { AuctionActionModule } from "@/components/modules/AuctionActionModule";
import { CoordinatorActionModule } from "@/components/modules/CoordinatorActionModule";
import { DeliveryAttestationModule } from "@/components/modules/DeliveryAttestationPanel";
import { DisclosureModule } from "@/components/modules/DisclosureModule";
import { EventTimelineModule } from "@/components/modules/EventTimelineModule";
import { HandoffDetailsModule } from "@/components/modules/HandoffDetailsModule";
import { HandoffKeyExchangeModule } from "@/components/modules/HandoffKeyExchangeModule";
import { HandoffTrackerModule } from "@/components/modules/HandoffTrackerModule";
import { OperatorRegistrationModule } from "@/components/modules/OperatorRegistrationModule";
import { OrderActionModule } from "@/components/modules/OrderActionModule";
import { OrderNodeModule } from "@/components/modules/OrderNodeModule";
import { ProcessCapitalSummaryModule } from "@/components/modules/ProcessCapitalSummaryModule";
import { ProcessGraphModule } from "@/components/modules/ProcessGraphModule";
import { SettlementBreakdownModule } from "@/components/modules/SettlementBreakdownModule";
import { useFigaroActions } from "@/lib/core/useFigaroActions";
import { useProcessOrders } from "@/hooks/core/useProcessOrders";
import { useWalletProcessIds } from "@/hooks/core/useWalletProcessIds";
import { useDeliveryAttestation } from "@/hooks/core/useDeliveryAttestation";
import {
    useDeliveryLifecycleActions,
    useDeliveryLifecycleSignals,
} from "@/lib/mechanisms/useDeliveryLifecycle";
import { useDutchAuction, useDutchAuctionActions } from "@/lib/mechanisms/useDutchAuction";
import {
    useGhgDisclosureActions,
    useOrderDisclosureTasks,
    useProcessDisclosureSummary,
} from "@/lib/mechanisms/useGHGDisclosure";
import { useAttestationCoordinatorActions } from "@/lib/mechanisms/useAttestationCoordinatorActions";
import {
    useAgentServices,
    useOperatorProfile,
    useRegisterOperator,
    useWithdrawDeposit,
} from "@/lib/mechanisms/useOperatorRegistry";
import { registerModule, type ModuleComponent } from "@/lib/shared/moduleRegistry";
import {
    ATTESTATION_MECHANISM_PACKAGE_METADATA,
    COORDINATOR_MECHANISM_PACKAGE_METADATA,
    CORE_MECHANISM_PACKAGE_METADATA,
    DISCLOSURE_MECHANISM_PACKAGE_METADATA,
    DUTCH_AUCTION_MECHANISM_PACKAGE_METADATA,
    getEffectiveMechanismCapabilityBindings as getEffectiveMechanismCapabilityBindingsFromMetadata,
    getEffectiveMechanismModuleBindings as getEffectiveMechanismModuleBindingsFromMetadata,
    getPackagedMechanismCapabilityBindings as getPackagedMechanismCapabilityBindingsFromMetadata,
    getPackagedMechanismModuleBindings as getPackagedMechanismModuleBindingsFromMetadata,
    mechanismClaimsCapability as mechanismClaimsCapabilityFromMetadata,
    OPERATOR_REGISTRY_MECHANISM_PACKAGE_METADATA,
} from "@/lib/mechanisms/packageDefaults";

export interface MechanismPackageModule {
    moduleId: string;
    component: ModuleComponent;
}

export interface MechanismPackage {
    kind: string;
    capabilityBindings?: readonly string[];
    capabilityPrefixes?: readonly string[];
    modules: readonly MechanismPackageModule[];
    hooks?: Readonly<Record<string, unknown>>;
}

export const DUTCH_AUCTION_MECHANISM_PACKAGE: MechanismPackage = {
    kind: DUTCH_AUCTION_MECHANISM_PACKAGE_METADATA.kind,
    capabilityBindings: DUTCH_AUCTION_MECHANISM_PACKAGE_METADATA.capabilityBindings,
    modules: [
        {
            moduleId: "auction-actions",
            component: AuctionActionModule,
        },
    ],
    hooks: {
        useDutchAuction,
        useDutchAuctionActions,
    },
};

export const CORE_MECHANISM_PACKAGE: MechanismPackage = {
    kind: CORE_MECHANISM_PACKAGE_METADATA.kind,
    capabilityBindings: CORE_MECHANISM_PACKAGE_METADATA.capabilityBindings,
    modules: [
        {
            moduleId: "process-graph",
            component: ProcessGraphModule,
        },
        {
            moduleId: "order-node",
            component: OrderNodeModule,
        },
        {
            moduleId: "order-actions",
            component: OrderActionModule,
        },
        {
            moduleId: "settlement-breakdown",
            component: SettlementBreakdownModule,
        },
        {
            moduleId: "event-timeline",
            component: EventTimelineModule,
        },
        {
            moduleId: "process-capital-summary",
            component: ProcessCapitalSummaryModule,
        },
    ],
    hooks: {
        useFigaroActions,
        useProcessOrders,
        useWalletProcessIds,
    },
};

export const DISCLOSURE_MECHANISM_PACKAGE: MechanismPackage = {
    kind: DISCLOSURE_MECHANISM_PACKAGE_METADATA.kind,
    capabilityBindings: DISCLOSURE_MECHANISM_PACKAGE_METADATA.capabilityBindings,
    modules: [
        {
            moduleId: "disclosure-actions",
            component: DisclosureModule,
        },
    ],
    hooks: {
        useGhgDisclosureActions,
        useOrderDisclosureTasks,
        useProcessDisclosureSummary,
    },
};

export const ATTESTATION_MECHANISM_PACKAGE: MechanismPackage = {
    kind: ATTESTATION_MECHANISM_PACKAGE_METADATA.kind,
    capabilityBindings: ATTESTATION_MECHANISM_PACKAGE_METADATA.capabilityBindings,
    modules: [
        {
            moduleId: "delivery-attestation",
            component: DeliveryAttestationModule,
        },
    ],
    hooks: {
        useAttestationCoordinatorActions,
        useDeliveryAttestation,
        useDeliveryLifecycleSignals,
    },
};

export const COORDINATOR_MECHANISM_PACKAGE: MechanismPackage = {
    kind: COORDINATOR_MECHANISM_PACKAGE_METADATA.kind,
    capabilityBindings: COORDINATOR_MECHANISM_PACKAGE_METADATA.capabilityBindings,
    capabilityPrefixes: COORDINATOR_MECHANISM_PACKAGE_METADATA.capabilityPrefixes,
    modules: [
        {
            moduleId: "coordinator-actions",
            component: CoordinatorActionModule,
        },
        {
            moduleId: "handoff-details",
            component: HandoffDetailsModule,
        },
        {
            moduleId: "handoff-tracker",
            component: HandoffTrackerModule,
        },
        {
            moduleId: "handoff-key-exchange",
            component: HandoffKeyExchangeModule,
        },
    ],
    hooks: {
        useDeliveryLifecycleActions,
        useDeliveryLifecycleSignals,
    },
};

export const OPERATOR_REGISTRY_MECHANISM_PACKAGE: MechanismPackage = {
    kind: OPERATOR_REGISTRY_MECHANISM_PACKAGE_METADATA.kind,
    capabilityBindings: OPERATOR_REGISTRY_MECHANISM_PACKAGE_METADATA.capabilityBindings,
    modules: [
        {
            moduleId: "operator-registration-panel",
            component: OperatorRegistrationModule,
        },
    ],
    hooks: {
        useRegisterOperator,
        useWithdrawDeposit,
        useOperatorProfile,
        useAgentServices,
    },
};

export const BUILT_IN_MECHANISM_PACKAGES = [
    CORE_MECHANISM_PACKAGE,
    DUTCH_AUCTION_MECHANISM_PACKAGE,
    DISCLOSURE_MECHANISM_PACKAGE,
    ATTESTATION_MECHANISM_PACKAGE,
    COORDINATOR_MECHANISM_PACKAGE,
    OPERATOR_REGISTRY_MECHANISM_PACKAGE,
] as const satisfies readonly MechanismPackage[];

const MECHANISM_PACKAGE_MAP = new Map<string, MechanismPackage>(
    BUILT_IN_MECHANISM_PACKAGES.map((pkg) => [pkg.kind, pkg] as const),
);

export function registerMechanismPackage(pkg: MechanismPackage): void {
    MECHANISM_PACKAGE_MAP.set(pkg.kind, pkg);
    for (const moduleEntry of pkg.modules) {
        registerModule(moduleEntry.moduleId, moduleEntry.component);
    }
}

export function getMechanismPackage(kind: string): MechanismPackage | undefined {
    return MECHANISM_PACKAGE_MAP.get(kind);
}

export function getPackagedMechanismModuleBindings(kind: string): string[] {
    return getPackagedMechanismModuleBindingsFromMetadata(kind);
}

export function getEffectiveMechanismModuleBindings(mechanism: {
    kind: string;
    moduleBindings?: readonly string[];
}, knownModuleIds?: Iterable<string>): string[] {
    return getEffectiveMechanismModuleBindingsFromMetadata(mechanism, knownModuleIds);
}

export function getPackagedMechanismCapabilityBindings(kind: string): string[] {
    return getPackagedMechanismCapabilityBindingsFromMetadata(kind);
}

export function getEffectiveMechanismCapabilityBindings(mechanism: {
    kind: string;
    capabilityBindings?: readonly string[];
}): string[] {
    return getEffectiveMechanismCapabilityBindingsFromMetadata(mechanism);
}

export function mechanismClaimsCapability(mechanism: {
    kind: string;
    capabilityBindings?: readonly string[];
}, capabilityKind: string): boolean {
    return mechanismClaimsCapabilityFromMetadata(mechanism, capabilityKind);
}