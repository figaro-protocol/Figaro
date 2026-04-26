import { describe, expect, it } from 'vitest';

import { getEffectiveMechanismModuleBindings } from '@/lib/mechanisms/packageDefaults';
import {
    getMechanismPackage,
} from '@/lib/mechanisms/packages';
import { inferMechanismIdFromCapability } from '@/lib/semantic/assemblyCapabilityBinding';
import { getBuiltInModuleDefaults } from '@/lib/shared/builtInModuleDefaults';
import {
    MechanismAssembly,
    REFERENCE_ASSEMBLIES,
} from '@/lib/shared/assembly';
import {
    PACKAGE_BLOCKS,
    STANDALONE_BLOCKS,
    SHELL_BLOCKS,
} from '@/components/modules/registerAllModules';

const BUILT_IN_PACKAGE_MODULE_IDS: readonly string[] = PACKAGE_BLOCKS.flatMap((b) => b.modules.map((m) => m.moduleId));
const BUILT_IN_STANDALONE_MODULE_IDS: readonly string[] = STANDALONE_BLOCKS.flatMap((b) => b.modules.map((m) => m.moduleId));
const BUILT_IN_RUNTIME_SHELL_MODULE_IDS: readonly string[] = SHELL_BLOCKS.flatMap((b) => b.modules.map((m) => m.moduleId));
const BUILT_IN_ASSEMBLY_COMPOSITION_MODULE_IDS: readonly string[] = STANDALONE_BLOCKS.flatMap((b) => b.modules.map((m) => m.moduleId));
const BUILT_IN_MODULE_IDS: readonly string[] = [
    ...BUILT_IN_PACKAGE_MODULE_IDS,
    ...BUILT_IN_STANDALONE_MODULE_IDS,
    ...BUILT_IN_RUNTIME_SHELL_MODULE_IDS,
];
import { SUPPORTED_RENDER_MODULE_SLOTS } from '@/lib/shared/assemblyValidation';
import {
    getRegisteredAssemblyBySlug,
    listRegisteredAssemblies,
} from '@/lib/shared/assemblyRegistry';

describe('analytical modules in assembly schema', () => {
    it('all reference assemblies include event-timeline and process-capital-summary modules', () => {
        const assemblies = REFERENCE_ASSEMBLIES;

        for (const assembly of assemblies) {
            const moduleIds = assembly.modules.map((m) => m.moduleId);
            expect(moduleIds).toContain('event-timeline');
            expect(moduleIds).toContain('process-capital-summary');
        }
    });

    it('all shipped reference assemblies declare only built-in runtime modules', () => {
        const builtInModuleIds = new Set(BUILT_IN_MODULE_IDS);

        for (const assembly of REFERENCE_ASSEMBLIES) {
            for (const module of assembly.modules) {
                expect(builtInModuleIds.has(module.moduleId)).toBe(true);
            }
        }
    });

    it('all built-in runtime modules resolve default component metadata', () => {
        for (const moduleId of BUILT_IN_MODULE_IDS) {
            const defaults = getBuiltInModuleDefaults(moduleId);

            expect(defaults).toBeDefined();
            expect(defaults?.componentKind).toBeTruthy();
            expect(defaults?.semanticInput).toBeTruthy();
        }
    });

    it('package-owned modules and standalone composition modules remain disjoint runtime sets', () => {
        expect(BUILT_IN_PACKAGE_MODULE_IDS).not.toContain('catalogue-editor');
        expect(BUILT_IN_STANDALONE_MODULE_IDS).toContain('catalogue-editor');
        expect(BUILT_IN_PACKAGE_MODULE_IDS.some((moduleId) => BUILT_IN_STANDALONE_MODULE_IDS.includes(moduleId))).toBe(false);
    });

    it('standalone modules are explicitly split into runtime-shell and assembly-composition surfaces', () => {
        expect(BUILT_IN_RUNTIME_SHELL_MODULE_IDS).toEqual([
            'role-switcher',
            'capability-rail',
            'mechanism-inspector',
        ]);
        expect(BUILT_IN_ASSEMBLY_COMPOSITION_MODULE_IDS).toEqual([
            'seller-discovery',
            'cart',
            'job-market',
            'catalogue-editor',
            'incoming-orders',
        ]);
        expect(BUILT_IN_RUNTIME_SHELL_MODULE_IDS.some((moduleId) => BUILT_IN_ASSEMBLY_COMPOSITION_MODULE_IDS.includes(moduleId))).toBe(false);
    });

    it('all shipped reference assemblies use only runtime-rendered module slots', () => {
        const supportedSlots = new Set(SUPPORTED_RENDER_MODULE_SLOTS);

        for (const assembly of REFERENCE_ASSEMBLIES) {
            for (const module of assembly.modules) {
                expect(supportedSlots.has(module.slot as (typeof SUPPORTED_RENDER_MODULE_SLOTS)[number])).toBe(true);
            }
        }
    });

    it('event-timeline is bound to core-orders mechanism in all assemblies', () => {
        const artifacts = listRegisteredAssemblies();

        for (const artifact of artifacts) {
            const coreOrders = artifact.assembly.mechanisms.find(
                (m) => m.mechanismId === 'core-orders'
            );
            expect(coreOrders).toBeDefined();
            expect(getEffectiveMechanismModuleBindings(coreOrders!)).toContain('event-timeline');
            expect(getEffectiveMechanismModuleBindings(coreOrders!)).toContain('process-capital-summary');
        }
    });

    it('event-timeline module has ProcessModel semantic input', () => {
        const artifact = getRegisteredAssemblyBySlug('figaro-eats');
        const timelineModule = artifact?.assembly.modules.find(
            (m) => m.moduleId === 'event-timeline'
        );

        expect(timelineModule).toBeDefined();
        expect(timelineModule?.semanticInput).toBe('ProcessModel');
        expect(timelineModule?.slot).toBe('main');
    });

    it('process-capital-summary module is assigned to sidebar slot', () => {
        const artifact = getRegisteredAssemblyBySlug('figaro-eats');
        const capitalModule = artifact?.assembly.modules.find(
            (m) => m.moduleId === 'process-capital-summary'
        );

        expect(capitalModule).toBeDefined();
        expect(capitalModule?.semanticInput).toBe('ProcessModel');
        expect(capitalModule?.slot).toBe('sidebar');
    });

    it('the built-in auction mechanism package declares its default module and capability binding', () => {
        const auctionPackage = getMechanismPackage('auction');

        expect(auctionPackage).toBeDefined();
        expect(auctionPackage?.capabilityBindings).toContain('claim-auction');
        expect(auctionPackage?.modules.map((module) => module.moduleId)).toContain('auction-actions');
        expect(auctionPackage?.hooks).toMatchObject({
            useDutchAuction: expect.any(Function),
            useDutchAuctionActions: expect.any(Function),
        });
    });

    it('the built-in core mechanism package declares its default modules and capability bindings', () => {
        const corePackage = getMechanismPackage('core');

        expect(corePackage?.capabilityBindings).toEqual([
            'create-order',
            'resolve-process',
            'withdraw',
            'accept-offer',
            'open-sub-order-composer',
        ]);
        expect(corePackage?.modules.map((module) => module.moduleId)).toEqual([
            'process-graph',
            'order-node',
            'order-actions',
            'settlement-breakdown',
            'event-timeline',
            'process-capital-summary',
        ]);
        expect(corePackage?.hooks).toMatchObject({
            useFigaroActions: expect.any(Function),
            useProcessOrders: expect.any(Function),
            useWalletProcessIds: expect.any(Function),
        });
    });

    it('the built-in disclosure, attestation, coordinator, and registry mechanism packages declare their default modules and capability bindings', () => {
        const disclosurePackage = getMechanismPackage('disclosure');
        const attestationPackage = getMechanismPackage('attestation');
        const coordinatorPackage = getMechanismPackage('coordinator');
        const registryPackage = getMechanismPackage('registry');

        expect(disclosurePackage?.capabilityBindings).toEqual([
            'submit-disclosure-commitment',
            'submit-disclosure-inventory',
        ]);
        expect(disclosurePackage?.modules.map((module) => module.moduleId)).toContain('disclosure-actions');
        expect(disclosurePackage?.hooks).toMatchObject({
            useGhgDisclosureActions: expect.any(Function),
            useOrderDisclosureTasks: expect.any(Function),
            useProcessDisclosureSummary: expect.any(Function),
        });

        expect(attestationPackage?.capabilityBindings).toEqual([
            'submit-delivery-lifecycle-proof',
        ]);
        expect(attestationPackage?.modules.map((module) => module.moduleId)).toContain('delivery-attestation');
        expect(attestationPackage?.hooks).toMatchObject({
            useAttestationCoordinatorActions: expect.any(Function),
            useDeliveryAttestation: expect.any(Function),
            useDeliveryLifecycleSignals: expect.any(Function),
        });

        expect(coordinatorPackage?.capabilityBindings).toEqual([
            'submit-delivery-lifecycle-signal',
        ]);
        expect(coordinatorPackage?.capabilityPrefixes).toEqual([
            'declare-',
        ]);
        expect(coordinatorPackage?.modules.map((module) => module.moduleId)).toEqual([
            'coordinator-actions',
            'handoff-details',
            'handoff-tracker',
            'handoff-key-exchange',
        ]);
        expect(coordinatorPackage?.hooks).toMatchObject({
            useDeliveryLifecycleActions: expect.any(Function),
            useDeliveryLifecycleSignals: expect.any(Function),
        });

        // Web2-strip (2026-04-26): updateProfile binding replaced with
        // withdraw-operator-deposit; switching role/metadata is withdraw + re-register.
        expect(registryPackage?.capabilityBindings).toEqual([
            'register-operator',
            'withdraw-operator-deposit',
        ]);
        expect(registryPackage?.modules.map((module) => module.moduleId)).toEqual([
            'operator-registration-panel',
        ]);
        expect(registryPackage?.hooks).toMatchObject({
            useRegisterOperator: expect.any(Function),
            useWithdrawDeposit: expect.any(Function),
            useOperatorProfile: expect.any(Function),
            useAgentServices: expect.any(Function),
        });
    });

    it('registered mechanism packages can resolve capability ownership without explicit assembly bindings', () => {
        const mechanisms: MechanismAssembly[] = [
            {
                mechanismId: 'core-orders',
                kind: 'core',
                displayName: 'Core Orders',
                riskClass: 'read-only-inherited',
                enabled: true,
                visibility: 'primary',
                moduleBindings: [],
            },
            {
                mechanismId: 'delivery-auction',
                kind: 'auction',
                displayName: 'Delivery Auction',
                riskClass: 'low-risk-coordinator',
                enabled: true,
                visibility: 'secondary',
                moduleBindings: ['auction-actions'],
            },
        ];

        expect(inferMechanismIdFromCapability('claim-auction', mechanisms)).toBe('delivery-auction');
        expect(inferMechanismIdFromCapability('resolve-process', mechanisms)).toBe('core-orders');
        expect(inferMechanismIdFromCapability('open-sub-order-composer', mechanisms)).toBe('core-orders');
    });

    it('packaged disclosure, attestation, FIG, coordinator, and registry mechanisms can resolve capability ownership without explicit assembly bindings', () => {
        const mechanisms: MechanismAssembly[] = [
            {
                mechanismId: 'delivery-attestation',
                kind: 'attestation',
                displayName: 'Delivery Attestation Evidence',
                riskClass: 'low-risk-coordinator',
                enabled: true,
                visibility: 'secondary',
                moduleBindings: [],
            },
            {
                mechanismId: 'fig-token-system',
                kind: 'fig',
                displayName: 'FIG Token',
                riskClass: 'read-only-inherited',
                enabled: true,
                visibility: 'secondary',
                moduleBindings: [],
            },
            {
                mechanismId: 'delivery-coordinator',
                kind: 'coordinator',
                displayName: 'Delivery Coordinator',
                riskClass: 'low-risk-coordinator',
                enabled: true,
                visibility: 'secondary',
                moduleBindings: [],
            },
            {
                mechanismId: 'ghg-disclosure',
                kind: 'disclosure',
                displayName: 'GHG Disclosure',
                riskClass: 'read-only-inherited',
                enabled: true,
                visibility: 'secondary',
                moduleBindings: [],
            },
            {
                mechanismId: 'operator-registration',
                kind: 'registry',
                displayName: 'Operator Registration',
                riskClass: 'low-risk-coordinator',
                enabled: true,
                visibility: 'secondary',
                moduleBindings: [],
            },
        ];

        expect(inferMechanismIdFromCapability('submit-delivery-lifecycle-proof', mechanisms)).toBe('delivery-attestation');
        expect(inferMechanismIdFromCapability('claim-airdrop', mechanisms)).toBe('fig-token-system');
        expect(inferMechanismIdFromCapability('claim-vesting', mechanisms)).toBe('fig-token-system');
        expect(inferMechanismIdFromCapability('submit-delivery-lifecycle-signal', mechanisms)).toBe('delivery-coordinator');
        expect(inferMechanismIdFromCapability('declare-ready-for-pickup', mechanisms)).toBe('delivery-coordinator');
        expect(inferMechanismIdFromCapability('declare-picked-up', mechanisms)).toBe('delivery-coordinator');
        expect(inferMechanismIdFromCapability('submit-disclosure-commitment', mechanisms)).toBe('ghg-disclosure');
        expect(inferMechanismIdFromCapability('register-operator', mechanisms)).toBe('operator-registration');
    });

    it('reference assemblies retain assembly-specific module deltas while inheriting packaged defaults', () => {
        const artifact = getRegisteredAssemblyBySlug('figaro-eats');

        const coreOrders = artifact?.assembly.mechanisms.find((m) => m.mechanismId === 'core-orders');
        const deliveryCoordinator = artifact?.assembly.mechanisms.find((m) => m.mechanismId === 'delivery-coordinator');

        expect(coreOrders?.moduleBindings).toEqual(['seller-discovery', 'cart', 'job-market']);
        // incoming-orders belongs to delivery-coordinator (restaurant/driver only), not core-orders
        expect(getEffectiveMechanismModuleBindings(coreOrders!)).toEqual(expect.arrayContaining([
            'process-graph',
            'order-node',
            'order-actions',
            'settlement-breakdown',
            'event-timeline',
            'process-capital-summary',
            'seller-discovery',
            'cart',
            'job-market',
        ]));
        expect(deliveryCoordinator?.moduleBindings).toEqual(['mechanism-inspector', 'incoming-orders']);
        expect(getEffectiveMechanismModuleBindings(deliveryCoordinator!)).toEqual(expect.arrayContaining([
            'coordinator-actions',
            'handoff-details',
            'handoff-tracker',
            'handoff-key-exchange',
            'mechanism-inspector',
        ]));
    });

    it('catalogue-editor remains an assembly-specific discovery surface rather than a registry package default', () => {
        const eatsArtifact = getRegisteredAssemblyBySlug('figaro-eats');
        const eatsRegistry = eatsArtifact?.assembly.mechanisms.find((m) => m.mechanismId === 'operator-registration');
        const registryPackage = getMechanismPackage('registry');

        expect(REFERENCE_ASSEMBLIES.filter((assembly) =>
            assembly.modules.some((module) => module.moduleId === 'catalogue-editor')
        ).map((assembly) => assembly.identity.slug)).toEqual(['figaro-eats']);
        expect(eatsRegistry?.moduleBindings).toEqual(['catalogue-editor']);
        expect(getEffectiveMechanismModuleBindings(eatsRegistry!)).toEqual(expect.arrayContaining([
            'operator-registration-panel',
            'catalogue-editor',
        ]));
        expect(registryPackage?.modules.map((module) => module.moduleId)).not.toContain('catalogue-editor');
    });

    it('figaro-eats binds delivery attestation through the attestation mechanism package', () => {
        const artifact = getRegisteredAssemblyBySlug('figaro-eats');
        const attestationMechanism = artifact?.assembly.mechanisms.find(
            (mechanism) => mechanism.kind === 'attestation'
        );

        expect(attestationMechanism).toBeDefined();
        expect(getEffectiveMechanismModuleBindings(attestationMechanism!)).toContain('delivery-attestation');
        expect(
            inferMechanismIdFromCapability(
                'submit-delivery-lifecycle-proof',
                artifact?.assembly.mechanisms ?? []
            )
        ).toBe(attestationMechanism?.mechanismId);
    });

    it('all assemblies validate cleanly after adding analytical modules', () => {
        const artifacts = listRegisteredAssemblies();
        expect(artifacts.length).toBeGreaterThanOrEqual(4);
        expect(artifacts.every((a) => a.validation.ok)).toBe(true);
    });
});
