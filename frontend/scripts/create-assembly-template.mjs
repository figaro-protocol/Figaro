import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    applyMechanismRenames,
    applyRoleRenames,
    buildAssemblyDocument,
    buildAssemblyExport,
    buildJsonImport,
    buildManifestSnippet,
    cloneAssemblyDocumentFromSource,
    parseRenameMappings,
    unregisterAssemblySource,
} from "./assembly-authoring.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assembliesDir = process.env.FIGARO_ASSEMBLIES_DIR
    ? path.resolve(process.env.FIGARO_ASSEMBLIES_DIR)
    : path.resolve(__dirname, "../lib/shared/assemblies");
const assemblyPath = process.env.FIGARO_ASSEMBLY_REGISTRY_PATH
    ? path.resolve(process.env.FIGARO_ASSEMBLY_REGISTRY_PATH)
    : path.resolve(__dirname, "../lib/shared/assembly.ts");

function printUsage() {
    console.log(`Usage:
  npm run create:assembly -- --name "Assembly Name" --slug assembly-slug [options]

Options:
  --name           Required. Assembly display name.
  --slug           Required. Kebab-case assembly slug.
    --from           Optional. Existing assembly slug to clone as a starting point.
  --description    Optional. Assembly description.
  --class          Optional. Builder assembly class. Default: reference-template.
  --level          Optional. Composition level (1, 2, or 3). Default: 1.
    --rename-role    Optional, repeatable. Rename a role kind after cloning. Format: old:new
    --rename-mechanism Optional, repeatable. Rename a mechanism id after cloning. Format: old:new
  --out            Optional. Output path. Default: lib/shared/assemblies/<slug>.reference.json
    --register       Optional. Register the new assembly in lib/shared/assembly.ts.
    --unregister     Optional. Remove an existing assembly from lib/shared/assembly.ts and optionally delete its JSON document.
    --delete-file    Optional. Only with --unregister. Delete lib/shared/assemblies/<slug>.reference.json after unregistering.
  --dry-run        Optional. Print the generated document and manifest entry without writing files.
`);
}

function parseArgs(argv) {
    const args = {};

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith("--")) {
            continue;
        }

        const key = token.slice(2);
        if (key === "dry-run") {
            args.dryRun = true;
            continue;
        }

        if (key === "register") {
            args.register = true;
            continue;
        }

        if (key === "unregister") {
            args.unregister = true;
            continue;
        }

        if (key === "delete-file") {
            args.deleteFile = true;
            continue;
        }

        if (key === "rename-role" || key === "rename-mechanism") {
            args[key] = [...(args[key] ?? []), argv[index + 1]];
            index += 1;
            continue;
        }

        const value = argv[index + 1];
        if (value === undefined || value.startsWith("--")) {
            throw new Error(`Missing value for --${key}.`);
        }

        args[key] = value;
        index += 1;
    }

    return args;
}

function loadSourceAssemblyDocument(sourceSlug) {
    const sourcePath = path.join(assembliesDir, `${sourceSlug}.reference.json`);

    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Unknown source assembly slug: ${sourceSlug}`);
    }

    return JSON.parse(fs.readFileSync(sourcePath, "utf8"));
}

function registerAssembly(slug, dryRun) {
    const source = fs.readFileSync(assemblyPath, "utf8");
    const { line: importLine } = buildJsonImport(slug);
    const { constantName, block } = buildAssemblyExport(slug);

    if (source.includes(importLine) || source.includes(`export const ${constantName} =`)) {
        throw new Error(`Assembly ${slug} already appears to be registered in lib/shared/assembly.ts`);
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

    if (dryRun) {
        console.log("Would update: lib/shared/assembly.ts");
        console.log(`Register import: ${importLine}`);
        console.log(`Register constant: ${constantName}`);
        return;
    }

    fs.writeFileSync(assemblyPath, updated, "utf8");
}

function unregisterAssembly(slug, outputPath, dryRun, deleteFile) {
    const source = fs.readFileSync(assemblyPath, "utf8");
    const updated = unregisterAssemblySource(source, slug);

    if (dryRun) {
        console.log("Would update: lib/shared/assembly.ts");
        if (deleteFile) {
            console.log(`Would delete: ${outputPath}`);
        }
        return;
    }

    fs.writeFileSync(assemblyPath, updated, "utf8");

    if (deleteFile) {
        if (!fs.existsSync(outputPath)) {
            throw new Error(`Assembly document does not exist: ${outputPath}`);
        }

        fs.unlinkSync(outputPath);
    }
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const name = args.name;
    const slug = args.slug;

    if ((!name && !args.unregister) || !slug) {
        printUsage();
        process.exitCode = 1;
        return;
    }

    if (args.register && args.unregister) {
        throw new Error("--register and --unregister cannot be used together.");
    }

    if (args.deleteFile && !args.unregister) {
        throw new Error("--delete-file can only be used with --unregister.");
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        throw new Error("--slug must be kebab-case using lowercase letters, numbers, and hyphens only.");
    }

    const compositionLevel = Number(args.level ?? "1");
    if (![1, 2, 3].includes(compositionLevel)) {
        throw new Error("--level must be 1, 2, or 3.");
    }

    const outputPath = args.out
        ? path.resolve(process.cwd(), args.out)
        : path.join(assembliesDir, `${slug}.reference.json`);

    if (args.unregister) {
        unregisterAssembly(slug, outputPath, Boolean(args.dryRun), Boolean(args.deleteFile));
        if (!args.dryRun) {
            console.log(`Unregistered ${slug} from lib/shared/assembly.ts`);
            if (args.deleteFile) {
                console.log(`Deleted ${path.relative(process.cwd(), outputPath)}`);
            }
        }
        return;
    }

    const description = args.description ?? `${name} reference assembly.`;
    const assemblyClass = args.class ?? "reference-template";
    const sourceSlug = args.from;
    const roleRenames = parseRenameMappings(args["rename-role"], "--rename-role");
    const mechanismRenames = parseRenameMappings(args["rename-mechanism"], "--rename-mechanism");

    let document = sourceSlug
        ? cloneAssemblyDocumentFromSource(loadSourceAssemblyDocument(sourceSlug), {
            name,
            slug,
            description,
            assemblyClass,
            compositionLevel,
            sourceSlug,
        })
        : buildAssemblyDocument({
            name,
            slug,
            description,
            assemblyClass,
            compositionLevel,
        });

    document = applyRoleRenames(document, roleRenames);
    document = applyMechanismRenames(document, mechanismRenames);

    const rendered = `${JSON.stringify(document, null, 4)}\n`;
    if (args.dryRun) {
        console.log(`Would write: ${outputPath}`);
        console.log(rendered);
        if (args.register) {
            registerAssembly(slug, true);
        } else {
            console.log("Manifest entry:");
            console.log(buildManifestSnippet(slug));
        }
        return;
    }

    if (fs.existsSync(outputPath)) {
        throw new Error(`Refusing to overwrite existing file: ${outputPath}`);
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, rendered, "utf8");

    if (args.register) {
        registerAssembly(slug, false);
    }

    console.log(`Created ${path.relative(process.cwd(), outputPath)}`);
    if (args.register) {
        console.log("Registered the assembly in lib/shared/assembly.ts");
    } else {
        console.log("Add this manifest entry:");
        console.log(buildManifestSnippet(slug));
    }
}

try {
    main();
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
