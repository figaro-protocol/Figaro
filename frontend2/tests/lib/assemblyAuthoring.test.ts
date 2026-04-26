import { describe, expect, it } from 'vitest';

import figaroProcurementReference from '@/lib/shared/assemblies/figaro-procurement.reference.json';
import {
    applyMechanismRenames,
    applyRoleRenames,
    buildAssemblyDocument,
    buildAssemblyExport,
    buildJsonImport,
    buildManifestSnippet,
    cloneAssemblyDocumentFromSource,
    parseRenameMappings,
    toIdentifierBase,
    unregisterAssemblySource,
} from '../../scripts/assembly-authoring.mjs';

describe('assembly authoring helpers', () => {
    it('builds a blank template document with slug-derived ids and views', () => {
        const assembly = buildAssemblyDocument({
            name: 'Figaro Returns',
            slug: 'figaro-returns',
            description: 'Returns assembly.',
            assemblyClass: 'reference-returns',
            compositionLevel: 2,
        });

        expect(assembly.identity.id).toBe('figaro-returns-reference');
        expect(assembly.identity.slug).toBe('figaro-returns');
        expect(assembly.views[1]?.viewId).toBe('figaro-returns-dashboard');
        expect(assembly.views[0]).toEqual({
            viewId: 'assembly-overview',
            kind: 'overview',
            title: 'Assembly Overview',
        });
        expect(assembly.views[1]).toEqual({
            viewId: 'figaro-returns-dashboard',
            kind: 'role-dashboard',
            title: 'Role Dashboard',
        });
        expect(assembly.roles.map((role: any) => role.defaultLandingView)).toEqual(['figaro-returns-dashboard', 'figaro-returns-dashboard']);
        expect(assembly.mechanisms[0]?.displayName).toBe('FigaroReturns Core Coordination');
        expect(assembly.mechanisms[0]?.moduleBindings).toEqual([]);
        expect(assembly.modules[0]).toEqual({
            moduleId: 'role-switcher',
        });
    });

    it('clones an existing assembly and rewrites top-level identity-bound fields', () => {
        const assembly = cloneAssemblyDocumentFromSource(figaroProcurementReference, {
            name: 'Figaro Returns',
            slug: 'figaro-returns',
            description: 'Returns assembly.',
            assemblyClass: 'reference-returns',
            compositionLevel: 2,
            sourceSlug: 'figaro-procurement',
        });

        expect(assembly.identity.id).toBe('figaro-returns-reference');
        expect(assembly.identity.name).toBe('Figaro Returns');
        expect(assembly.identity.slug).toBe('figaro-returns');
        expect(assembly.contracts.map((contract: any) => contract.key)).toEqual(['core', 'fulfillmentCoordinator']);
        expect(assembly.roles.map((role: any) => role.roleKind)).toEqual(['buyer', 'supplier', 'inspector']);
        expect(assembly.narrative?.assemblySummary).toContain('Figaro Returns as a scaffold cloned from figaro-procurement');
        expect(assembly.builderMetadata.assemblyClass).toBe('reference-returns');
    });

    it('builds deterministic registration strings for generated assemblies', () => {
        expect(toIdentifierBase('figaro-returns')).toBe('FigaroReturns');
        expect(buildJsonImport('figaro-returns').line).toBe('import figaroReturnsReference from "@/lib/shared/assemblies/figaro-returns.reference.json";');
        expect(buildAssemblyExport('figaro-returns').constantName).toBe('FIGARO_RETURNS_REFERENCE_ASSEMBLY');
        expect(buildManifestSnippet('figaro-returns')).toBe('{ slug: FIGARO_RETURNS_REFERENCE_ASSEMBLY.identity.slug, assembly: FIGARO_RETURNS_REFERENCE_ASSEMBLY },');
    });

    it('applies role and mechanism renames to a cloned assembly', () => {
        let assembly = cloneAssemblyDocumentFromSource(figaroProcurementReference, {
            name: 'Figaro Returns',
            slug: 'figaro-returns',
            description: 'Returns assembly.',
            assemblyClass: 'reference-returns',
            compositionLevel: 2,
            sourceSlug: 'figaro-procurement',
        });

        assembly = applyRoleRenames(assembly, parseRenameMappings(['supplier:vendor'], '--rename-role'));
        assembly = applyMechanismRenames(assembly, parseRenameMappings(['fulfillment-coordinator:returns-coordinator'], '--rename-mechanism'));

        expect(assembly.roles.map((role: any) => role.roleKind)).toEqual(['buyer', 'vendor', 'inspector']);
        expect(assembly.roles.find((role: any) => role.roleKind === 'vendor')?.displayName).toBe('Vendor');
        expect(assembly.mechanisms.find((mechanism: any) => mechanism.mechanismId === 'returns-coordinator')).toBeDefined();
        expect(assembly.mechanisms.find((mechanism: any) => mechanism.mechanismId === 'fulfillment-coordinator')).toBeUndefined();
    });

    it('rejects malformed rename mappings', () => {
        expect(() => parseRenameMappings(['supplier'], '--rename-role')).toThrow(/Invalid --rename-role mapping/);
        expect(() => parseRenameMappings(['supplier:vendor:extra'], '--rename-role')).toThrow(/Invalid --rename-role mapping/);
    });

    it('removes a registered assembly from the source registry text', () => {
        const source = `// BEGIN GENERATED ASSEMBLY IMPORTS
import figaroReturnsReference from "@/lib/shared/assemblies/figaro-returns.reference.json";
// END GENERATED ASSEMBLY IMPORTS
// BEGIN GENERATED ASSEMBLY EXPORTS
export const FIGARO_RETURNS_REFERENCE_ASSEMBLY = parseAssemblyDocument(
    figaroReturnsReference,
    "figaro-returns.reference.json"
);

// END GENERATED ASSEMBLY EXPORTS
// BEGIN GENERATED ASSEMBLY REGISTRY
export const REFERENCE_ASSEMBLIES = [
    FIGARO_RETURNS_REFERENCE_ASSEMBLY,
];
// END GENERATED ASSEMBLY REGISTRY
`;

        const updated = unregisterAssemblySource(source, 'figaro-returns');

        expect(updated).not.toContain('figaroReturnsReference');
        expect(updated).not.toContain('FIGARO_RETURNS_REFERENCE_ASSEMBLY');
    });

    it('rejects unregistering a slug that is not fully registered', () => {
        expect(() => unregisterAssemblySource('export const REFERENCE_ASSEMBLIES = [];', 'figaro-returns')).toThrow(
            /is not fully registered/
        );
    });
});