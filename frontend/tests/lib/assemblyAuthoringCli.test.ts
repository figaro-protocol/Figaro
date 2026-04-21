import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const tempDirs: string[] = [];

function makeTempFixture() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'figaro-assembly-cli-'));
    tempDirs.push(tempDir);

    const assembliesDir = path.join(tempDir, 'assemblies');
    fs.mkdirSync(assembliesDir, { recursive: true });

    const assemblyFilePath = path.join(assembliesDir, 'figaro-disclosure-review.reference.json');
    fs.writeFileSync(
        assemblyFilePath,
        JSON.stringify({ identity: { slug: 'figaro-disclosure-review' } }, null, 4),
        'utf8'
    );

    const registryPath = path.join(tempDir, 'institutionAssembly.ts');
    fs.writeFileSync(
        registryPath,
        `// BEGIN GENERATED ASSEMBLY IMPORTS
import figaroDisclosureReviewReference from "@/lib/shared/assemblies/figaro-disclosure-review.reference.json";
// END GENERATED ASSEMBLY IMPORTS
import { parseInstitutionAssemblyDocument } from "@/lib/shared/institutionAssemblyParser";

// BEGIN GENERATED ASSEMBLY EXPORTS
export const FIGARO_DISCLOSURE_REFERENCE_ASSEMBLY = parseInstitutionAssemblyDocument(
    figaroDisclosureReviewReference,
    "figaro-disclosure-review.reference.json"
);
// END GENERATED ASSEMBLY EXPORTS

// BEGIN GENERATED ASSEMBLY REGISTRY
export const REFERENCE_ASSEMBLIES = [
    FIGARO_DISCLOSURE_REFERENCE_ASSEMBLY,
];
// END GENERATED ASSEMBLY REGISTRY
`,
        'utf8'
    );

    return { tempDir, assembliesDir, assemblyFilePath, registryPath };
}

afterEach(() => {
    while (tempDirs.length > 0) {
        const tempDir = tempDirs.pop();
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }
});

describe('assembly authoring CLI', () => {
    it('unregisters an assembly and deletes its JSON document through temp fixtures', () => {
        const { assembliesDir, assemblyFilePath, registryPath } = makeTempFixture();
        const scriptPath = path.resolve(process.cwd(), 'scripts/create-assembly-template.mjs');

        execFileSync('node', [scriptPath, '--slug', 'figaro-disclosure-review', '--unregister', '--delete-file'], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                FIGARO_ASSEMBLIES_DIR: assembliesDir,
                FIGARO_INSTITUTION_ASSEMBLY_PATH: registryPath,
            },
            stdio: 'pipe',
        });

        expect(fs.existsSync(assemblyFilePath)).toBe(false);

        const registrySource = fs.readFileSync(registryPath, 'utf8');
        expect(registrySource).not.toContain('figaro-disclosure-review.reference.json');
        expect(registrySource).not.toContain('FIGARO_DISCLOSURE_REFERENCE_ASSEMBLY');
    });
});