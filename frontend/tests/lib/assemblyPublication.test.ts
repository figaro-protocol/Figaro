import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
    publishAssemblyToWorkspace,
    unregisterAssemblyFromWorkspace,
} from '@/lib/shared/assemblyPublication';
import { buildBlankAssembly, serializeAssemblyDocument } from '@/lib/shared/assemblyDraft';

const tempDirs: string[] = [];

function createTempWorkspace() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'figaro-assembly-publish-'));
    tempDirs.push(tempDir);

    const assembliesDir = path.join(tempDir, 'assemblies');
    const registryPath = path.join(tempDir, 'assembly.ts');

    fs.mkdirSync(assembliesDir, { recursive: true });
    fs.writeFileSync(
        registryPath,
        `// BEGIN GENERATED ASSEMBLY IMPORTS
// END GENERATED ASSEMBLY IMPORTS
import { parseAssemblyDocument } from "@/lib/shared/assemblyParser";

// BEGIN GENERATED ASSEMBLY EXPORTS
// END GENERATED ASSEMBLY EXPORTS

// BEGIN GENERATED ASSEMBLY REGISTRY
export const REFERENCE_ASSEMBLIES = [
];
// END GENERATED ASSEMBLY REGISTRY
`,
        'utf8'
    );

    return { tempDir, assembliesDir, registryPath };
}

afterEach(() => {
    while (tempDirs.length > 0) {
        const tempDir = tempDirs.pop();
        if (tempDir) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }
});

describe('assembly publication', () => {
    it('writes the assembly JSON document and registers it in assembly.ts', () => {
        const workspace = createTempWorkspace();
        const draft = buildBlankAssembly({
            name: 'Figaro Returns',
            slug: 'figaro-returns',
            description: 'Returns assembly.',
            assemblyClass: 'reference-returns',
            compositionLevel: 2,
        });

        const result = publishAssemblyToWorkspace(
            serializeAssemblyDocument(draft),
            {
                existingAssemblies: [],
                paths: {
                    assembliesDir: workspace.assembliesDir,
                    assemblyRegistryPath: workspace.registryPath,
                },
            }
        );

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        const documentPath = path.join(workspace.assembliesDir, 'figaro-returns.reference.json');
        const documentSource = fs.readFileSync(documentPath, 'utf8');
        const registrySource = fs.readFileSync(workspace.registryPath, 'utf8');

        expect(fs.existsSync(documentPath)).toBe(true);
        expect(documentSource).not.toContain('"componentKind": "RoleSwitcher"');
        expect(documentSource).not.toContain('"route": "/"');
        expect(documentSource).not.toContain('"contextsAccepted"');
        expect(documentSource).not.toContain('"moduleSlots"');
        expect(documentSource).not.toContain('"slot":');
        expect(registrySource).toContain('import figaroReturnsReference from "@/lib/shared/assemblies/figaro-returns.reference.json";');
        expect(registrySource).toContain('export const FIGARO_RETURNS_REFERENCE_ASSEMBLY = parseAssemblyDocument(');
        expect(registrySource).toContain('FIGARO_RETURNS_REFERENCE_ASSEMBLY,');
        expect(result.prototypePath).toBe('/builders/designer/edit/figaro-returns');
    });

    it('rejects publication when the slug is already registered', () => {
        const workspace = createTempWorkspace();
        const draft = buildBlankAssembly({
            name: 'Duplicate Eats',
            slug: 'local-commerce',
            description: 'Duplicate slug.',
            assemblyClass: 'reference-template',
            compositionLevel: 1,
        });

        const result = publishAssemblyToWorkspace(
            serializeAssemblyDocument(draft),
            {
                paths: {
                    assembliesDir: workspace.assembliesDir,
                    assemblyRegistryPath: workspace.registryPath,
                },
            }
        );

        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }

        expect(result.issues.some((issue) => issue.path === 'identity.slug')).toBe(true);
        expect(fs.readdirSync(workspace.assembliesDir)).toHaveLength(0);
    });

    it('unregisters an assembly and optionally deletes its authored document', () => {
        const workspace = createTempWorkspace();
        const draft = buildBlankAssembly({
            name: 'Figaro Returns',
            slug: 'figaro-returns',
            description: 'Returns assembly.',
            assemblyClass: 'reference-returns',
            compositionLevel: 2,
        });

        const publishResult = publishAssemblyToWorkspace(
            serializeAssemblyDocument(draft),
            {
                existingAssemblies: [],
                paths: {
                    assembliesDir: workspace.assembliesDir,
                    assemblyRegistryPath: workspace.registryPath,
                },
            }
        );

        expect(publishResult.ok).toBe(true);

        const unregisterResult = unregisterAssemblyFromWorkspace('figaro-returns', {
            deleteFile: true,
            paths: {
                assembliesDir: workspace.assembliesDir,
                assemblyRegistryPath: workspace.registryPath,
            },
        });

        expect(unregisterResult.ok).toBe(true);
        if (!unregisterResult.ok) {
            return;
        }

        const registrySource = fs.readFileSync(workspace.registryPath, 'utf8');

        expect(registrySource).not.toContain('figaro-returns.reference.json');
        expect(registrySource).not.toContain('FIGARO_RETURNS_REFERENCE_ASSEMBLY');
        expect(fs.existsSync(path.join(workspace.assembliesDir, 'figaro-returns.reference.json'))).toBe(false);
        expect(unregisterResult.deletedFile).toBe(true);
    });
});