import { describe, expect, it } from 'vitest';

import {
    getInstitutionArtifactBySlug,
    getRegisteredAssemblyManifestValidation,
    listInstitutionSelectorCards,
    listInstitutionArtifacts,
} from '@/lib/shared/institutionAssemblyRegistry';
import { deriveInstitutionCapabilitiesFromRuntime } from '@/lib/semantic/deriveInstitutionCapabilitiesFromRuntime';
import { deriveSelectedOrderCapabilitiesFromRuntime } from '@/lib/semantic/deriveSelectedOrderCapabilitiesFromRuntime';
import {
    FIGARO_DISCLOSURE_REFERENCE_ASSEMBLY,
    FIGARO_EATS_REFERENCE_ASSEMBLY,
    FIGARO_EQUIPMENT_RENTAL_REFERENCE_ASSEMBLY,
    FIGARO_FREELANCE_REFERENCE_ASSEMBLY,
    FIGARO_PROCUREMENT_REFERENCE_ASSEMBLY,
} from '@/lib/shared/institutionAssembly';
import { deriveProcessModelFromRuntime } from '@/lib/semantic/deriveProcessModelFromRuntime';
import { OrderState, type Order } from '@/lib/core/store';
import type { ProcessSummary } from '@/hooks/core/useWalletProcessIds';
import { resolveRoleScopedMechanismSelection } from '@/lib/shared/runtimeResolution';

describe('institution artifact registry', () => {
    it('resolves more than one institution artifact from the registry', () => {
        const artifacts = listInstitutionArtifacts();
        const selectorCards = listInstitutionSelectorCards();
        const manifestValidation = getRegisteredAssemblyManifestValidation();

        expect(artifacts.map((artifact) => artifact.assembly.identity.slug)).toEqual(
            expect.arrayContaining(['figaro-eats', 'figaro-procurement', 'figaro-disclosure-review', 'figaro-equipment-rental', 'figaro-freelance'])
        );
        expect(artifacts.every((artifact) => artifact.validation.ok)).toBe(true);
        expect(selectorCards.map((card) => card.slug)).toEqual(
            expect.arrayContaining(['figaro-eats', 'figaro-procurement', 'figaro-disclosure-review', 'figaro-equipment-rental', 'figaro-freelance'])
        );
        expect(selectorCards.every((card) => card.validationOk)).toBe(true);
        expect(manifestValidation.ok).toBe(true);
    });

    it('resolves a builder artifact with derived roles, mechanisms, and risk boundaries', () => {
        const artifact = getInstitutionArtifactBySlug('figaro-eats');

        expect(artifact).toBeDefined();
        expect(artifact?.validation.ok).toBe(true);
        expect(artifact?.assembly.identity.id).toBe(FIGARO_EATS_REFERENCE_ASSEMBLY.identity.id);
        expect(artifact?.model.source.truthClass).toBe('institution-declared');
        expect(artifact?.model.availableNetworks).toEqual(FIGARO_EATS_REFERENCE_ASSEMBLY.identity.networkTargets);
        expect(artifact?.model.roles.map((role) => role.roleKind)).toEqual(['buyer', 'restaurant', 'driver']);
        expect(artifact?.model.roles.every((role) => role.prototype)).toBe(true);
        expect(artifact?.model.roles.every((role) => role.activeCapabilities.every((capability) => capability.action.executionType === 'prototype'))).toBe(true);

        const auctionMechanism = artifact?.model.mechanisms.find((mechanism) => mechanism.id === 'driver-auction');
        const coordinatorMechanism = artifact?.model.mechanisms.find((mechanism) => mechanism.id === 'delivery-coordinator');
        const operatorRegistryMechanism = artifact?.model.mechanisms.find((mechanism) => mechanism.id === 'operator-registration');
        expect(auctionMechanism).toBeDefined();
        expect(auctionMechanism?.recognizedRoles).toEqual(['driver']);
        expect(coordinatorMechanism?.recognizedRoles).toEqual(['buyer', 'restaurant', 'driver']);
        expect(operatorRegistryMechanism?.recognizedRoles).toEqual(['restaurant']);
        expect(auctionMechanism?.moduleBindings).toContain('auction-actions');
        expect(auctionMechanism?.attachments.some((attachment) => attachment.attachmentKind === 'module-binding')).toBe(true);
        expect(auctionMechanism?.attachments.some((attachment) => attachment.attachmentKind === 'contract-reference')).toBe(true);

        expect(artifact?.riskBoundaries['driver-auction']?.riskClass).toBe('high-risk-economic');
    });

    it('resolves a non-Eats procurement artifact through the same semantic contract', () => {
        const artifact = getInstitutionArtifactBySlug('figaro-procurement');

        expect(artifact).toBeDefined();
        expect(artifact?.validation.ok).toBe(true);
        expect(artifact?.assembly.identity.id).toBe(FIGARO_PROCUREMENT_REFERENCE_ASSEMBLY.identity.id);
        expect(artifact?.model.roles.map((role) => role.roleKind)).toEqual(['buyer', 'supplier', 'inspector']);

        const coordinator = artifact?.model.mechanisms.find((mechanism) => mechanism.id === 'fulfillment-coordinator');
        expect(coordinator?.contracts).toEqual(['core', 'fulfillmentCoordinator']);
        expect(coordinator?.recognizedRoles).toEqual(['supplier', 'inspector']);
        expect(artifact?.riskBoundaries['fulfillment-coordinator']?.riskClass).toBe('low-risk-coordinator');
    });

    it('resolves a disclosure-oriented artifact with non-coordinator role binding through the same registry', () => {
        const artifact = getInstitutionArtifactBySlug('figaro-disclosure-review');

        expect(artifact).toBeDefined();
        expect(artifact?.validation.ok).toBe(true);
        expect(artifact?.assembly.identity.id).toBe(FIGARO_DISCLOSURE_REFERENCE_ASSEMBLY.identity.id);
        expect(artifact?.model.roles.map((role) => role.roleKind)).toEqual(['buyer', 'seller', 'reviewer']);

        const disclosureMechanism = artifact?.model.mechanisms.find((mechanism) => mechanism.id === 'ghg-disclosure');
        expect(disclosureMechanism?.contracts).toEqual(['core', 'ghgReporting']);
        expect(disclosureMechanism?.recognizedRoles).toEqual(['seller', 'reviewer']);
        expect(disclosureMechanism?.moduleBindings).toContain('disclosure-actions');
        expect(artifact?.riskBoundaries['ghg-disclosure']?.riskClass).toBe('medium-risk-extension');
    });

    it('resolves an equipment-rental artifact with rental coordinator and two roles', () => {
        const artifact = getInstitutionArtifactBySlug('figaro-equipment-rental');

        expect(artifact).toBeDefined();
        expect(artifact?.validation.ok).toBe(true);
        expect(artifact?.assembly.identity.id).toBe(FIGARO_EQUIPMENT_RENTAL_REFERENCE_ASSEMBLY.identity.id);
        expect(artifact?.model.roles.map((role) => role.roleKind)).toEqual(['buyer', 'seller']);
        expect(artifact?.model.roles.find((role) => role.roleKind === 'buyer')?.prototype).toBe(true);
        expect(artifact?.model.roles.find((role) => role.roleKind === 'seller')?.prototype).toBe(true);

        const rentalCoordinator = artifact?.model.mechanisms.find((mechanism) => mechanism.id === 'rental-coordinator');
        expect(rentalCoordinator).toBeDefined();
        expect(rentalCoordinator?.contracts).toEqual(['core', 'rentalCoordinator']);
        expect(rentalCoordinator?.riskClass).toBe('low-risk-coordinator');

        expect(artifact?.riskBoundaries['rental-coordinator']?.riskClass).toBe('low-risk-coordinator');
        expect(artifact?.assembly.builderMetadata?.compositionLevel).toBe(2);
    });

    it('resolves a core-only freelance artifact with minimal composition', () => {
        const artifact = getInstitutionArtifactBySlug('figaro-freelance');

        expect(artifact).toBeDefined();
        expect(artifact?.validation.ok).toBe(true);
        expect(artifact?.assembly.identity.id).toBe(FIGARO_FREELANCE_REFERENCE_ASSEMBLY.identity.id);
        expect(artifact?.model.roles.map((role) => role.roleKind)).toEqual(['buyer', 'seller']);
        expect(artifact?.model.roles.find((role) => role.roleKind === 'buyer')?.prototype).toBe(true);
        expect(artifact?.model.roles.find((role) => role.roleKind === 'seller')?.prototype).toBe(true);

        // Core-only: no custom mechanisms beyond core-orders
        const mechanisms = artifact?.model.mechanisms ?? [];
        expect(mechanisms.every((m) => m.kind === 'core')).toBe(true);

        expect(artifact?.assembly.builderMetadata?.compositionLevel).toBe(1);
    });

    it('derives institution-scoped operator registration capabilities from visible mechanisms', () => {
        const artifact = getInstitutionArtifactBySlug('figaro-eats');
        const restaurantRole = artifact?.model.roles.find((role) => role.roleKind === 'restaurant');
        const buyerRole = artifact?.model.roles.find((role) => role.roleKind === 'buyer');

        expect(artifact).toBeDefined();
        expect(restaurantRole).toBeDefined();
        expect(buyerRole).toBeDefined();

        const restaurantMechanisms = resolveRoleScopedMechanismSelection(restaurantRole, artifact!.model.mechanisms).visibleMechanisms;
        const buyerMechanisms = resolveRoleScopedMechanismSelection(buyerRole, artifact!.model.mechanisms).visibleMechanisms;

        const restaurantCapabilities = deriveInstitutionCapabilitiesFromRuntime(
            artifact!.assembly.identity.id,
            restaurantRole!.roleKind,
            restaurantMechanisms,
        );
        const buyerCapabilities = deriveInstitutionCapabilitiesFromRuntime(
            artifact!.assembly.identity.id,
            buyerRole!.roleKind,
            buyerMechanisms,
        );

        expect(restaurantCapabilities).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    action: expect.objectContaining({
                        executionType: 'transaction',
                        kind: 'register-operator',
                        operatorRole: 1,
                    }),
                }),
            ])
        );
        expect(buyerCapabilities).toEqual([]);

        const registeredRestaurantCapabilities = deriveInstitutionCapabilitiesFromRuntime(
            artifact!.assembly.identity.id,
            restaurantRole!.roleKind,
            restaurantMechanisms,
            [1, true, 'ipfs://merchant/profile.json'],
        );

        expect(registeredRestaurantCapabilities).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    action: expect.objectContaining({
                        executionType: 'transaction',
                        kind: 'update-operator-profile',
                        operatorRole: 1,
                    }),
                }),
            ])
        );
    });

    it('derives selected-order disclosure capabilities only for the connected seller when disclosure is visible', () => {
        const artifact = getInstitutionArtifactBySlug('figaro-disclosure-review');
        const sellerRole = artifact?.model.roles.find((role) => role.roleKind === 'seller');
        const buyerRole = artifact?.model.roles.find((role) => role.roleKind === 'buyer');

        expect(artifact).toBeDefined();
        expect(sellerRole).toBeDefined();
        expect(buyerRole).toBeDefined();

        const sellerMechanisms = resolveRoleScopedMechanismSelection(sellerRole, artifact!.model.mechanisms).visibleMechanisms;
        const processId = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
        const sellerAddress = '0x00000000000000000000000000000000000000aa' as const;
        const buyerAddress = '0x00000000000000000000000000000000000000bb' as const;
        const order = {
            orderId: 'root-order',
            processId,
            buyer: buyerAddress,
            seller: sellerAddress,
            currency: '0x0000000000000000000000000000000000000c01' as const,
            payment: 100n,
            state: 'Active',
            parentOrderIds: [],
            attachments: [],
            capabilities: [],
            settlementBreakdown: undefined,
        };

        const sellerCapabilities = deriveSelectedOrderCapabilitiesFromRuntime(
            order,
            sellerRole!.roleKind,
            sellerMechanisms,
            sellerAddress,
        );
        const buyerCapabilities = deriveSelectedOrderCapabilitiesFromRuntime(
            order,
            buyerRole!.roleKind,
            sellerMechanisms,
            buyerAddress,
        );

        expect(sellerCapabilities).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    action: expect.objectContaining({
                        executionType: 'transaction',
                        kind: 'submit-disclosure-commitment',
                        orderHash: 'root-order',
                    }),
                }),
                expect.objectContaining({
                    action: expect.objectContaining({
                        executionType: 'transaction',
                        kind: 'submit-disclosure-inventory',
                        orderHash: 'root-order',
                    }),
                }),
            ])
        );
        expect(buyerCapabilities).toEqual([]);
    });

    it('derives selected-order coordinator signal capabilities only for the connected driver when coordinator is visible', () => {
        const artifact = getInstitutionArtifactBySlug('figaro-eats');
        const driverRole = artifact?.model.roles.find((role) => role.roleKind === 'driver');
        const restaurantRole = artifact?.model.roles.find((role) => role.roleKind === 'restaurant');

        expect(artifact).toBeDefined();
        expect(driverRole).toBeDefined();
        expect(restaurantRole).toBeDefined();

        const driverMechanisms = resolveRoleScopedMechanismSelection(driverRole, artifact!.model.mechanisms).visibleMechanisms;
        const restaurantMechanisms = resolveRoleScopedMechanismSelection(restaurantRole, artifact!.model.mechanisms).visibleMechanisms;
        const processId = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
        const driverAddress = '0x00000000000000000000000000000000000000cc' as const;
        const buyerAddress = '0x00000000000000000000000000000000000000dd' as const;
        const lifecycleOrder = {
            orderId: 'delivery-order',
            processId,
            buyer: buyerAddress,
            seller: driverAddress,
            currency: '0x0000000000000000000000000000000000000c01' as const,
            payment: 40n,
            state: 'Active',
            parentOrderIds: ['root-order'],
            attachments: [],
            capabilities: [],
            settlementBreakdown: undefined,
        };
        const auctionOrder = {
            orderId: 'auction-order',
            processId,
            buyer: buyerAddress,
            seller: '0x00000000000000000000000000000000000000ee' as const,
            currency: '0x0000000000000000000000000000000000000c01' as const,
            payment: 40n,
            state: 'Active',
            parentOrderIds: ['root-order'],
            attachments: [],
            capabilities: [],
            settlementBreakdown: undefined,
        };

        const driverLifecycleCapabilities = deriveSelectedOrderCapabilitiesFromRuntime(
            lifecycleOrder,
            driverRole!.roleKind,
            driverMechanisms,
            driverAddress,
        );
        const driverAuctionCapabilities = deriveSelectedOrderCapabilitiesFromRuntime(
            auctionOrder,
            driverRole!.roleKind,
            driverMechanisms,
            driverAddress,
        ).filter((capability) => capability.action.kind === 'claim-auction');

        const restaurantLifecycleCapabilities = deriveSelectedOrderCapabilitiesFromRuntime(
            lifecycleOrder,
            restaurantRole!.roleKind,
            restaurantMechanisms,
            driverAddress,
        );
        const restaurantAuctionCapabilities = deriveSelectedOrderCapabilitiesFromRuntime(
            auctionOrder,
            restaurantRole!.roleKind,
            restaurantMechanisms,
            driverAddress,
        ).filter((capability) => capability.action.kind === 'claim-auction');

        const driverSignalCapabilities = driverLifecycleCapabilities.filter((capability) => capability.action.kind === 'submit-delivery-lifecycle-signal');
        const restaurantSignalCapabilities = restaurantLifecycleCapabilities.filter((capability) => capability.action.kind === 'submit-delivery-lifecycle-signal');

        expect(driverSignalCapabilities).toHaveLength(3);
        expect(driverSignalCapabilities).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    action: expect.objectContaining({
                        executionType: 'transaction',
                        kind: 'submit-delivery-lifecycle-signal',
                        signal: 'declareEnRoute',
                        orderHash: 'delivery-order',
                    }),
                }),
                expect.objectContaining({
                    action: expect.objectContaining({
                        executionType: 'transaction',
                        kind: 'submit-delivery-lifecycle-signal',
                        signal: 'declarePickedUp',
                        orderHash: 'delivery-order',
                    }),
                }),
                expect.objectContaining({
                    action: expect.objectContaining({
                        executionType: 'transaction',
                        kind: 'submit-delivery-lifecycle-signal',
                        signal: 'declareDelivered',
                        orderHash: 'delivery-order',
                    }),
                }),
            ])
        );
        expect(driverAuctionCapabilities).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    action: expect.objectContaining({
                        executionType: 'transaction',
                        kind: 'claim-auction',
                        auctionId: 'auction-order',
                    }),
                }),
            ])
        );
        expect(restaurantSignalCapabilities).toEqual([]);
        expect(restaurantAuctionCapabilities).toEqual([]);
    });
});

describe('deriveProcessModelFromRuntime', () => {
    it('emits runtime attachments, link summaries, and capabilities for composed process topology', () => {
        const processId = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
        const address = '0x00000000000000000000000000000000000000b0';
        const currency = '0x0000000000000000000000000000000000000c01';

        const summary: ProcessSummary = {
            processId,
            orderCount: 3,
            hasActive: true,
            createdAt: 1,
            orders: [
                { id: '1', state: OrderState.Active },
                { id: '2', state: OrderState.Active },
                { id: '3', state: OrderState.Active },
            ],
        };

        const orders: Order[] = [
            {
                id: '1',
                processId,
                buyer: address,
                seller: '0x0000000000000000000000000000000000000051',
                currency,
                agreementHash: '0x1234000000000000000000000000000000000000000000000000000000000000',
                cumulativeValue: 100n,
                payment: 100n,
                state: OrderState.Active,
                sellerBond: 200n,
                buyerBond: 200n,
                salt: 1n,
                deadline: 9999999999n,
                blockNumber: 1,
                timestamp: 1,
            },
            {
                id: '2',
                processId,
                buyer: '0x0000000000000000000000000000000000000002',
                seller: address,
                currency,
                cumulativeValue: 150n,
                payment: 50n,
                state: OrderState.Active,
                sellerBond: 300n,
                buyerBond: 100n,
                salt: 2n,
                deadline: 9999999999n,
                blockNumber: 2,
                timestamp: 2,
            },
            {
                id: '3',
                processId,
                buyer: address,
                seller: '0x0000000000000000000000000000000000000003',
                currency,
                agreementHash: '0xabcd000000000000000000000000000000000000000000000000000000000000',
                cumulativeValue: 175n,
                payment: 25n,
                state: OrderState.Active,
                sellerBond: 350n,
                buyerBond: 50n,
                salt: 3n,
                deadline: 9999999999n,
                blockNumber: 3,
                timestamp: 3,
            },
        ];

        const process = deriveProcessModelFromRuntime(summary, orders, address, currency, false);

        expect(process.rootOrderId).toBe('1');
        expect(process.stateSummary).toContain('Active');
        expect(process.capabilities.map((capability) => capability.action.kind)).toEqual(
            expect.arrayContaining(['resolve-process'])
        );
        expect(process.capabilities).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    action: expect.objectContaining({
                        executionType: 'transaction',
                        kind: 'resolve-process',
                        processId,
                    }),
                }),
            ])
        );
        // Without explicit agreement topology, runtime falls back to linear cumulative progression.
        expect(process.upstreamLinks).toEqual(['1', '2']);
        expect(process.downstreamLinks).toEqual(['2', '3']);
        expect(process.attachments.map((attachment) => attachment.attachmentKind)).toEqual(
            expect.arrayContaining(['root-order', 'currency-binding', 'state-summary', 'topology-summary', 'actor-presence'])
        );

        const rootOrder = process.orders.find((order) => order.orderId === '1');
        const childOrder = process.orders.find((order) => order.orderId === '2');
        const subOrder3 = process.orders.find((order) => order.orderId === '3');

        expect(rootOrder?.capabilities).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    actionKind: 'open-sub-order-composer',
                    action: expect.objectContaining({
                        executionType: 'runtime',
                        kind: 'open-sub-order-composer',
                        parentOrderIds: ['1'],
                        currency,
                    }),
                }),
            ])
        );
        expect(childOrder?.capabilities).toEqual([]);
        expect(subOrder3?.capabilities).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    actionKind: 'open-sub-order-composer',
                    action: expect.objectContaining({
                        executionType: 'runtime',
                        kind: 'open-sub-order-composer',
                        parentOrderIds: ['3'],
                        currency,
                    }),
                }),
            ])
        );

        expect(rootOrder?.attachments.map((attachment) => attachment.attachmentKind)).toEqual(
            expect.arrayContaining(['topology-root', 'actor-participation', 'agreement-reference'])
        );
        expect(childOrder?.attachments.map((attachment) => attachment.attachmentKind)).toEqual(
            expect.arrayContaining(['topology-child', 'actor-participation'])
        );
        // Linear fallback still yields a single-parent child relationship for each sub-order.
        expect(subOrder3?.attachments.map((attachment) => attachment.attachmentKind)).toEqual(
            expect.arrayContaining(['topology-child', 'actor-participation', 'agreement-reference'])
        );

        // Linear fallback yields 2 declared edges (root→sub1, sub1→sub2) with fallback relation labels.
        expect(process.relations).toHaveLength(2);
        expect(process.relations.every((relation) => relation.relationKind === 'linear-fallback-reference')).toBe(true);
        expect(process.economicSummary).toBeDefined();
    });
});