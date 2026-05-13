import fs from "node:fs";
import path from "node:path";
import { parseAssemblyDocument } from "@/lib/shared/assemblyParser";
import { Assembly, REFERENCE_ASSEMBLIES } from "@/lib/shared/assembly";
import {
    DraftPublicationReadiness,
    serializeAssemblyDocument,
    validateDraftPublicationReadiness,
} from "@/lib/shared/assemblyDraft";
import { extractErrorMessage } from "@/lib/shared/errors";

export interface AssemblyWorkspacePaths {
    assembliesDir: string;
    assemblyRegistryPath: string;
}

export interface PublishAssemblySuccess {
    ok: true;
    slug: string;
    assembly: Assembly;
    outputPath: string;
    registryPath: string;
    prototypePath: string;
}

export interface PublishAssemblyFailure {
    ok: false;
    issues: DraftPublicationReadiness["issues"];
}

export type PublishAssemblyResult = PublishAssemblySuccess | PublishAssemblyFailure;

export interface PublishAssemblyOptions {
    existingAssemblies?: Assembly[];
    paths?: AssemblyWorkspacePaths;
}

export interface UnpublishAssemblySuccess {
    ok: true;
    slug: string;
    outputPath: string;
    registryPath: string;
    deletedFile: boolean;
}

export interface UnpublishAssemblyFailure {
    ok: false;
    issues: DraftPublicationReadiness["issues"];
}

export type UnpublishAssemblyResult = UnpublishAssemblySuccess | UnpublishAssemblyFailure;

export interface UnpublishAssemblyOptions {
    deleteFile?: boolean;
    paths?: AssemblyWorkspacePaths;
}

function resolveAssemblyWorkspacePaths(rootDir = process.cwd()): AssemblyWorkspacePaths {
    return {
        assembliesDir: process.env.FIGARO_ASSEMBLIES_DIR
            ? path.resolve(process.env.FIGARO_ASSEMBLIES_DIR)
            : path.resolve(rootDir, "lib/shared/assemblies"),
        assemblyRegistryPath: process.env.FIGARO_ASSEMBLY_REGISTRY_PATH
            ? path.resolve(process.env.FIGARO_ASSEMBLY_REGISTRY_PATH)
            : path.resolve(rootDir, "lib/shared/assembly.ts"),
    };
}

function toIdentifierBase(slug: string): string {
    return slug
        .split("-")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("");
}

function buildJsonImport(slug: string) {
    const identifierBase = toIdentifierBase(slug);
    const importName = `${identifierBase.charAt(0).toLowerCase()}${identifierBase.slice(1)}Reference`;
    return {
        importName,
        line: `import ${importName} from "@/lib/shared/assemblies/${slug}.reference.json";`,
    };
}

function buildAssemblyExport(slug: string) {
    const constantName = `${slug.toUpperCase().replace(/-/g, "_")}_REFERENCE_ASSEMBLY`;
    const { importName } = buildJsonImport(slug);

    return {
        constantName,
        block: `export const ${constantName} = parseAssemblyDocument(\n    ${importName},\n    "${slug}.reference.json"\n);\n`,
    };
}

function registerAssemblySource(source: string, slug: string): string {
    const { line: importLine } = buildJsonImport(slug);
    const { constantName, block } = buildAssemblyExport(slug);

    if (source.includes(importLine) || source.includes(`export const ${constantName} =`)) {
        throw new Error(`Assembly ${slug} already appears to be registered in lib/shared/assembly.ts`);
    }

    if (!source.includes("// END GENERATED ASSEMBLY IMPORTS")
        || !source.includes("// END GENERATED ASSEMBLY EXPORTS")
        || !source.includes("// END GENERATED ASSEMBLY REGISTRY")) {
        throw new Error("assembly.ts is missing generated assembly markers.");
    }

    let updated = source.replace(
        "// END GENERATED ASSEMBLY IMPORTS",
        `${importLine}\n// END GENERATED ASSEMBLY IMPORTS`
    );

    updated = updated.replace(
        "// END GENERATED ASSEMBLY EXPORTS",
        `${block}\n// END GENERATED ASSEMBLY EXPORTS`
    );

    updated = updated.replace(
        "];\n// END GENERATED ASSEMBLY REGISTRY",
        `    ${constantName},\n];\n// END GENERATED ASSEMBLY REGISTRY`
    );

    return updated;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findRegisteredAssemblyConstantName(source: string, slug: string): string | undefined {
    const fileName = `${slug}.reference.json`;
    const exportPattern = new RegExp(
        `export const ([A-Z0-9_]+) = parseAssemblyDocument\\(\\n\\s*\\w+,\\n\\s*"${escapeRegExp(fileName)}"`,
        "m"
    );
    const match = source.match(exportPattern);
    return match?.[1];
}

function unregisterAssemblySource(source: string, slug: string): string {
    const importPattern = new RegExp(`^import .*@/lib/shared/assemblies/${escapeRegExp(`${slug}.reference.json`)}";\\n`, "m");
    const constantName = findRegisteredAssemblyConstantName(source, slug);

    if (!constantName) {
        throw new Error(`Assembly ${slug} is not fully registered in lib/shared/assembly.ts`);
    }

    const exportPattern = new RegExp(
        `export const ${constantName} = parseAssemblyDocument\\([\\s\\S]*?\\n\\);\\n`,
        "m"
    );
    const registryLine = `    ${constantName},`;

    if (!importPattern.test(source) || !exportPattern.test(source) || !source.includes(registryLine)) {
        throw new Error(`Assembly ${slug} is not fully registered in lib/shared/assembly.ts`);
    }

    return source
        .replace(importPattern, "")
        .replace(exportPattern, "")
        .replace(`${registryLine}\n`, "");
}

function parseCandidateAssembly(documentJson: string): Assembly {
    const parsed = JSON.parse(documentJson) as unknown;
    return parseAssemblyDocument(parsed, "published institution assembly");
}

export function publishAssemblyToWorkspace(
    documentJson: string,
    options: PublishAssemblyOptions = {}
): PublishAssemblyResult {
    const assembly = parseCandidateAssembly(documentJson);
    const readiness = validateDraftPublicationReadiness(assembly, options.existingAssemblies ?? REFERENCE_ASSEMBLIES);

    if (!readiness.ok) {
        return {
            ok: false,
            issues: readiness.issues,
        };
    }

    const paths = options.paths ?? resolveAssemblyWorkspacePaths();
    const outputPath = path.join(paths.assembliesDir, `${assembly.identity.slug}.reference.json`);
    const registryPath = paths.assemblyRegistryPath;

    if (fs.existsSync(outputPath)) {
        return {
            ok: false,
            issues: [{
                severity: "error",
                path: "identity.slug",
                message: `Assembly document already exists at ${outputPath}.`,
            }],
        };
    }

    const registrySource = fs.readFileSync(registryPath, "utf8");
    const updatedRegistrySource = registerAssemblySource(registrySource, assembly.identity.slug);
    const renderedDocument = serializeAssemblyDocument(assembly);

    fs.mkdirSync(paths.assembliesDir, { recursive: true });
    fs.writeFileSync(outputPath, renderedDocument, "utf8");

    try {
        fs.writeFileSync(registryPath, updatedRegistrySource, "utf8");
    } catch (error) {
        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
        }
        throw error;
    }

    return {
        ok: true,
        slug: assembly.identity.slug,
        assembly,
        outputPath,
        registryPath,
        prototypePath: `/builders/designer/edit/${assembly.identity.slug}`,
    };
}

export function unregisterAssemblyFromWorkspace(
    slug: string,
    options: UnpublishAssemblyOptions = {}
): UnpublishAssemblyResult {
    const paths = options.paths ?? resolveAssemblyWorkspacePaths();
    const outputPath = path.join(paths.assembliesDir, `${slug}.reference.json`);
    const registryPath = paths.assemblyRegistryPath;

    let registrySource: string;
    try {
        registrySource = fs.readFileSync(registryPath, "utf8");
    } catch (error) {
        return {
            ok: false,
            issues: [{
                severity: "error",
                path: "registry",
                message: extractErrorMessage(error, String(error)),
            }],
        };
    }

    let updatedRegistrySource: string;
    try {
        updatedRegistrySource = unregisterAssemblySource(registrySource, slug);
    } catch (error) {
        return {
            ok: false,
            issues: [{
                severity: "error",
                path: "identity.slug",
                message: extractErrorMessage(error, String(error)),
            }],
        };
    }

    if (options.deleteFile && !fs.existsSync(outputPath)) {
        return {
            ok: false,
            issues: [{
                severity: "error",
                path: "identity.slug",
                message: `Assembly document does not exist: ${outputPath}`,
            }],
        };
    }

    fs.writeFileSync(registryPath, updatedRegistrySource, "utf8");

    let deletedFile = false;
    if (options.deleteFile) {
        fs.unlinkSync(outputPath);
        deletedFile = true;
    }

    return {
        ok: true,
        slug,
        outputPath,
        registryPath,
        deletedFile,
    };
}