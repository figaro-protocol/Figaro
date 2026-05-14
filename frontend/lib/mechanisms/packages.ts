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
import { useMerchantProcessActions } from "@/lib/mechanisms/useMerchantProcess";
import { useCourierProcessActions } from "@/lib/mechanisms/useCourierProcess";
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
    OPERATOR_REGISTRY_MECHANISM_PACKAGE_METADATA,
} from "@/lib/mechanisms/packageDefaults";

interface MechanismPackageModule {
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

const DUTCH_AUCTION_MECHANISM_PACKAGE: MechanismPackage = {
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

const CORE_MECHANISM_PACKAGE: MechanismPackage = {
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

const DISCLOSURE_MECHANISM_PACKAGE: MechanismPackage = {
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

const ATTESTATION_MECHANISM_PACKAGE: MechanismPackage = {
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
        useCourierProcessActions,
    },
};

const COORDINATOR_MECHANISM_PACKAGE: MechanismPackage = {
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
        useMerchantProcessActions,
        useCourierProcessActions,
    },
};

const OPERATOR_REGISTRY_MECHANISM_PACKAGE: MechanismPackage = {
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

export function registerMechanismPackage(pkg: MechanismPackage): void {
    for (const moduleEntry of pkg.modules) {
        registerModule(moduleEntry.moduleId, moduleEntry.component);
    }
}
