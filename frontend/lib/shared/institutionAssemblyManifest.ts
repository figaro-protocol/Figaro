import {
    InstitutionAssembly,
    REFERENCE_ASSEMBLIES,
} from "@/lib/shared/institutionAssembly";
import {
    AssemblyValidationIssue,
    AssemblyValidationResult,
    validateInstitutionAssembly,
} from "@/lib/shared/institutionAssemblyValidation";

export interface AssemblyManifestEntry {
    slug: string;
    assembly: InstitutionAssembly;
}

export interface AssemblyManifestValidationResult extends AssemblyValidationResult {
    perAssembly: Array<{
        slug: string;
        result: AssemblyValidationResult;
    }>;
}

export const REFERENCE_ASSEMBLY_MANIFEST: AssemblyManifestEntry[] = REFERENCE_ASSEMBLIES.map((assembly) => ({
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

export function validateAssemblyManifest(entries: AssemblyManifestEntry[]): AssemblyManifestValidationResult {
    const issues: AssemblyValidationIssue[] = [];
    const perAssembly = entries.map(({ slug, assembly }) => ({
        slug,
        result: validateInstitutionAssembly(assembly),
    }));

    for (const duplicate of findDuplicates(entries.map((entry) => entry.slug))) {
        issues.push({
            severity: "error",
            path: "manifest.slug",
            message: `Duplicate manifest slug: ${duplicate}.`,
        });
    }

    for (const duplicate of findDuplicates(entries.map((entry) => entry.assembly.identity.id))) {
        issues.push({
            severity: "error",
            path: "manifest.identity.id",
            message: `Duplicate institution id across manifest: ${duplicate}.`,
        });
    }

    entries.forEach((entry, index) => {
        if (entry.slug !== entry.assembly.identity.slug) {
            issues.push({
                severity: "error",
                path: `manifest[${index}].slug`,
                message: `Manifest slug ${entry.slug} does not match assembly slug ${entry.assembly.identity.slug}.`,
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
