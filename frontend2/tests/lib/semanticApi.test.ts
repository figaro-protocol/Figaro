import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { GET as getRuntimeSnapshot } from '@/app/api/semantic/runtime/route';
import {
    getRegisteredAssemblyBySlug,
    listRegisteredAssemblies,
} from '@/lib/shared/assemblyRegistry';

/**
 * Unit tests for the structured semantic API data contract.
 * These validate the shape that GET /api/semantic/assemblies returns,
 * testing the underlying functions directly (no HTTP needed).
 */
describe('semantic API data contract', () => {
    it('lists all registered assemblies with summary fields', () => {
        const artifacts = listRegisteredAssemblies();

        expect(artifacts.length).toBeGreaterThanOrEqual(4);

        for (const artifact of artifacts) {
            expect(artifact.assembly.identity.slug).toBeTruthy();
            expect(artifact.assembly.identity.name).toBeTruthy();
            expect(artifact.assembly.identity.version).toBeTruthy();
            expect(artifact.validation.ok).toBe(true);
            expect(artifact.assembly.mechanisms.length).toBeGreaterThan(0);
            expect(artifact.assembly.roles.length).toBeGreaterThan(0);
            expect(artifact.assembly.contracts.length).toBeGreaterThan(0);
        }
    });

    it('resolves a single assembly artifact with full model', () => {
        const artifact = getRegisteredAssemblyBySlug('figaro-eats');

        expect(artifact).toBeDefined();
        expect(artifact?.assembly.identity.slug).toBe('figaro-eats');
        expect(artifact?.model).toBeDefined();
        expect(artifact?.model.roles.length).toBeGreaterThan(0);
        expect(artifact?.model.mechanisms.length).toBeGreaterThan(0);
        expect(artifact?.riskBoundaries).toBeDefined();
    });

    it('returns undefined for unknown slugs', () => {
        const artifact = getRegisteredAssemblyBySlug('nonexistent-assembly');
        expect(artifact).toBeUndefined();
    });

    it('exposes mechanism risk classes for each assembly', () => {
        const artifact = getRegisteredAssemblyBySlug('figaro-eats');

        const auctionBoundary = artifact?.riskBoundaries['driver-auction'];
        expect(auctionBoundary).toBeDefined();
        expect(auctionBoundary?.riskClass).toBe('high-risk-economic');

        const coordinatorBoundary = artifact?.riskBoundaries['delivery-coordinator'];
        expect(coordinatorBoundary).toBeDefined();
        expect(coordinatorBoundary?.riskClass).toBe('low-risk-coordinator');
    });

    it('exposes analytical module bindings through the model', () => {
        const artifact = getRegisteredAssemblyBySlug('figaro-eats');

        const coreOrders = artifact?.model.mechanisms.find((m) => m.id === 'core-orders');
        expect(coreOrders?.moduleBindings).toContain('event-timeline');
        expect(coreOrders?.moduleBindings).toContain('process-capital-summary');
    });

    it('serves a resolved runtime snapshot for agent consumers', async () => {
        const response = await getRuntimeSnapshot(new NextRequest(
            'http://localhost/api/semantic/runtime?slug=figaro-eats&networkTarget=local-anvil&bindingId=binding:bobs-pizza-palace:local-anvil'
        ));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.runtime.networkTarget).toBe('local-anvil');
        expect(body.runtime.selectedBindingId).toBe('binding:bobs-pizza-palace:local-anvil');
        expect(body.runtime.selectedRole.roleKind).toBe('restaurant');
        expect(body.runtime.selectedShellPresentation.title).toBe("Bob's Pizza Palace");
        expect(body.runtime.boundSubjects[0].subject.bindingId).toBe('binding:bobs-pizza-palace:local-anvil');
        expect(body.runtime.boundSubjects[0].serviceProviderKeys.catalogue).toBe('default-catalogue');
    });

    it('rejects role selections that are not available in the selected runtime context', async () => {
        const response = await getRuntimeSnapshot(new NextRequest(
            'http://localhost/api/semantic/runtime?slug=figaro-eats&networkTarget=local-anvil&bindingId=binding:bobs-pizza-palace:local-anvil&roleKind=buyer'
        ));
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body).toEqual({
            error: 'Role not available for the selected runtime context',
        });
    });
});
