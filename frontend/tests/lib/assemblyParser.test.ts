import { describe, expect, it } from 'vitest';

import { parseAssemblyDocument } from '@/lib/shared/assemblyParser';
import figaroDisclosureReviewReference from '@/lib/shared/assemblies/figaro-disclosure-review.reference.json';

describe('assembly parser', () => {
    it('parses a valid authored assembly document', () => {
        const assembly = parseAssemblyDocument(
            figaroDisclosureReviewReference,
            'figaro-disclosure-review.reference.json'
        );

        expect(assembly.identity.slug).toBe('figaro-disclosure-review');
        expect(assembly.mechanisms[1]?.kind).toBe('disclosure');
        expect(assembly.mechanisms[1]?.capabilityBindings).toEqual([
            'submit-disclosure',
            'replace-disclosure',
            'review-disclosure',
        ]);
        expect(assembly.modules[0]?.componentKind).toBe('CapabilityRail');
        expect(assembly.modules[0]?.semanticInput).toBe('CapabilityModel[]');
        expect(assembly.visibilityDefaults.showAuditMode).toBe(true);
    });

    it('defaults built-in view and module metadata when authored JSON omits it', () => {
        const assembly = parseAssemblyDocument({
            ...figaroDisclosureReviewReference,
            views: [
                {
                    viewId: 'assembly-overview',
                    kind: 'overview',
                    title: 'Assembly Overview',
                },
                {
                    viewId: 'role-dashboard',
                    kind: 'role-dashboard',
                    title: 'Role Dashboard',
                },
            ],
            modules: [
                {
                    moduleId: 'role-switcher',
                },
                {
                    moduleId: 'capability-rail',
                },
                {
                    moduleId: 'process-graph',
                },
                {
                    moduleId: 'order-node',
                },
                {
                    moduleId: 'order-actions',
                },
                {
                    moduleId: 'mechanism-inspector',
                },
            ],
        }, 'defaulted-view-module.json');

        expect(assembly.views).toEqual([
            {
                viewId: 'assembly-overview',
                kind: 'overview',
                title: 'Assembly Overview',
                route: '/',
                contextsAccepted: ['assembly'],
                moduleSlots: ['capability-rail', 'mechanism-inspector'],
            },
            {
                viewId: 'role-dashboard',
                kind: 'role-dashboard',
                title: 'Role Dashboard',
                route: undefined,
                contextsAccepted: ['role', 'process', 'order'],
                moduleSlots: ['role-switcher', 'capability-rail', 'process-graph', 'order-node'],
            },
        ]);

        expect(assembly.modules.find((module) => module.moduleId === 'order-actions')).toEqual(
            {
                moduleId: 'order-actions',
                componentKind: 'OrderActionPanel',
                semanticInput: 'CapabilityModel[]',
                slot: 'main',
                priority: 3,
                displayOptions: undefined,
            },
        );
    });

    it('rejects partial built-in layout overrides', () => {
        expect(() => parseAssemblyDocument({
            ...figaroDisclosureReviewReference,
            modules: [
                {
                    moduleId: 'role-switcher',
                    slot: 'sidebar',
                },
            ],
        }, 'partial-layout.json')).toThrow(/must declare both slot and priority when overriding built-in layout/);
    });

    it('rejects missing required fields', () => {
        expect(() => parseAssemblyDocument({
            contracts: [],
            mechanisms: [],
            roles: [],
            views: [],
            modules: [],
            capabilityPresentation: [],
            visibilityDefaults: {
                showGraphByDefault: false,
                showAdvancedMechanisms: false,
                showRiskBoundaries: false,
                showGuarantees: false,
                showEconomicBreakdowns: false,
                showBuilderMode: false,
                showAuditMode: false,
            },
            builderMetadata: {
                assemblyClass: 'test',
                compositionLevel: 1,
                requiresCustomModules: false,
            },
        }, 'invalid.json')).toThrow(/invalid\.json\.identity must be an object/);
    });

    it('rejects invalid enum values in authored documents', () => {
        expect(() => parseAssemblyDocument({
            ...figaroDisclosureReviewReference,
            mechanisms: [
                {
                    ...figaroDisclosureReviewReference.mechanisms[0],
                    riskClass: 'not-a-risk-class',
                },
            ],
        }, 'invalid-risk.json')).toThrow(/invalid-risk\.json\.mechanisms\[0\]\.riskClass must be one of/);
    });

    it('rejects invalid service binding keys in authored documents', () => {
        expect(() => parseAssemblyDocument({
            ...figaroDisclosureReviewReference,
            serviceBindings: [
                {
                    serviceKey: 'not-a-service',
                    providerKey: 'default-provider',
                },
            ],
        }, 'invalid-service.json')).toThrow(/invalid-service\.json\.serviceBindings\[0\]\.serviceKey must be one of/);
    });
});