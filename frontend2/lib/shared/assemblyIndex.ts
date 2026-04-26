import {
    Assembly,
    REFERENCE_ASSEMBLIES,
} from "@/lib/shared/assembly";
import {
    AssemblyValidationIssue,
    AssemblyValidationResult,
    validateAssembly,
} from "@/lib/shared/assemblyValidation";

export interface AssemblyIndexEntry {
    slug: string;
    assembly: Assembly;
}

export interface AssemblyIndexValidationResult extends AssemblyValidationResult {
    perAssembly: Array<{
        slug: string;
        result: AssemblyValidationResult;
    }>;
}

export const REFERENCE_ASSEMBLIES_INDEX: AssemblyIndexEntry[] = REFERENCE_ASSEMBLIES.map((assembly) => ({
    slug: assembly.identity.slug,
    assembly,
}));

function findDuplicates(values: string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const value of values) {
        if (seen.has(value)) {
            duplicates.add(value);
            continue;
        }

        seen.add(value);
    }

    return [...duplicates];
}

export function validateAssemblyIndex(entries: AssemblyIndexEntry[]): AssemblyIndexValidationResult {
    const issues: AssemblyValidationIssue[] = [];
    const perAssembly = entries.map(({ slug, assembly }) => ({
        slug,
        result: validateAssembly(assembly),
    }));

    for (const duplicate of findDuplicates(entries.map((entry) => entry.slug))) {
        issues.push({
            severity: "error",
            path: "index.slug",
            message: `Duplicate index slug: ${duplicate}.`,
        });
    }

    for (const duplicate of findDuplicates(entries.map((entry) => entry.assembly.identity.id))) {
        issues.push({
            severity: "error",
            path: "index.identity.id",
            message: `Duplicate assembly id across index: ${duplicate}.`,
        });
    }

    entries.forEach((entry, index) => {
        if (entry.slug !== entry.assembly.identity.slug) {
            issues.push({
                severity: "error",
                path: `index[${index}].slug`,
                message: `Index slug ${entry.slug} does not match assembly slug ${entry.assembly.identity.slug}.`,
            });
        }
    });

    issues.push(...perAssembly.flatMap(({ slug, result }) =>
        result.issues.map((issue) => ({
            ...issue,
            path: `${slug}.${issue.path}`,
        }))
    ));

    return {
        ok: !issues.some((issue) => issue.severity === "error"),
        issues,
        perAssembly,
    };
}
