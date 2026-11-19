/**
 * A marketing page loads no wallet; an app page does (docs/FRONTEND.md
 * § "Wallet-provider scope per route", rule 3).
 *
 * `app/(marketing)/layout.tsx` mounts no `<Providers>`, so a wagmi hook
 * reached from a marketing page has no `WagmiProvider` above it. This test
 * walks the import graph, static imports and `import("…")` calls with a
 * literal specifier alike, from every layout and page under
 * `app/(marketing)/`, through `components/`, `hooks/` and `lib/`, and fails
 * when any file it reaches:
 *
 * - imports `app/providers.tsx` (the `Providers` stack that mounts
 *   `WagmiProvider`), or
 * - takes anything from the wallet package: `wagmi`, a subpath of it
 *   (`wagmi/connectors/injected`) or `@wagmi/…`, or
 * - imports an installed package whose dependencies, followed to the end,
 *   include the wallet package (its `package.json`: `dependencies` and the
 *   `peerDependencies` it does not mark optional).
 *
 * Those three are what can put the wallet package in a marketing page's
 * bundle, read without a Next build.
 *
 * Nothing on a marketing path is allowed the wallet package: the marketing
 * pages read the chain through the standalone `publicClient` of
 * `lib/shared/publicClient.ts`, which imports no wallet code, and wagmi's
 * config (`lib/shared/wagmi.ts`) and the connectors stay off the path. The
 * walk reaching `lib/shared/publicClient.ts` is the witness that it is not
 * empty.
 *
 * The other half: the `(app)` and `(tools)` layouts reach `Providers`, and
 * `Providers` takes `WagmiProvider` from `wagmi`.
 *
 * Proves: no import chain from a marketing layout or page reaches the wallet
 * provider or any module of the wallet package, in the tree or through a
 * package's declared dependencies. Does not prove: anything about an
 * `import()` whose specifier is computed (none is walked); a module a package
 * bundles inside its own files without declaring it; or that a page renders
 * without a console error (the `stranger` Playwright project reads the pages
 * in a browser). A dependency is not proof that its code reaches the bundle,
 * so the package half over-counts and never under-counts. Type-only imports
 * load nothing at runtime and are not walked.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(process.cwd());
const PROVIDERS = path.join(ROOT, "app", "providers.tsx");
const WALLET_PACKAGE = "wagmi";
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

/** Every .ts/.tsx source file under the given frontend directories. */
function sourceFiles(...dirs: string[]): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
            const full = path.join(dir, name);
            if (statSync(full).isDirectory()) walk(full);
            else if (/\.tsx?$/.test(name)) out.push(full);
        }
    };
    for (const d of dirs) walk(path.resolve(ROOT, d));
    return out;
}

interface StaticImport {
    specifier: string;
    /** The value names it takes (type-only names left out); null for a namespace, default-only or side-effect import. */
    names: string[] | null;
}

/** The static, value-carrying imports and re-exports of one file. */
function staticImports(file: string): StaticImport[] {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const out: StaticImport[] = [];
    for (const statement of source.statements) {
        if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
            const clause = statement.importClause;
            if (clause?.isTypeOnly) continue;
            const bindings = clause?.namedBindings;
            const names = bindings && ts.isNamedImports(bindings)
                ? bindings.elements.filter((e) => !e.isTypeOnly).map((e) => (e.propertyName ?? e.name).text)
                : null;
            // `import { type A, type B } from "x"` loads nothing.
            if (names && names.length === 0 && !clause?.name) continue;
            out.push({ specifier: statement.moduleSpecifier.text, names });
        } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
            if (statement.isTypeOnly) continue;
            const clause = statement.exportClause;
            const names = clause && ts.isNamedExports(clause)
                ? clause.elements.filter((e) => !e.isTypeOnly).map((e) => (e.propertyName ?? e.name).text)
                : null;
            if (names && names.length === 0) continue;
            out.push({ specifier: statement.moduleSpecifier.text, names });
        }
    }
    return out;
}

/** The `import("x")` calls anywhere in one file, with a literal specifier: a
 *  chunk the page loads when the call runs (`next/dynamic` included), so it is
 *  part of what the page can load in the browser. */
function dynamicImports(file: string): StaticImport[] {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const out: StaticImport[] = [];
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            const [arg] = node.arguments;
            if (arg && ts.isStringLiteralLike(arg)) out.push({ specifier: arg.text, names: null });
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return out;
}

/** Every import that loads code: static, re-exported and dynamic. */
const loadedImports = (file: string): StaticImport[] => [...staticImports(file), ...dynamicImports(file)];

/** The installed package a bare specifier names (`@scope/name/sub` → `@scope/name`). */
function packageName(specifier: string): string {
    const parts = specifier.split("/");
    return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** The directory of an installed package, found as Node finds it: the
 *  nearest `node_modules/<name>` from `fromDir` upward. Null for a Node
 *  built-in (`node:fs`) or a package not installed. */
function packageDir(name: string, fromDir: string): string | null {
    for (let dir = fromDir; ; dir = path.dirname(dir)) {
        const candidate = path.join(dir, "node_modules", name);
        if (existsSync(path.join(candidate, "package.json"))) return candidate;
        if (path.dirname(dir) === dir) return null;
    }
}

/** For each installed package, the chain of packages through which it
 *  depends on the wallet package, or null when none does: its
 *  `dependencies` and non-optional `peerDependencies`, followed to the end. A
 *  dependency is not proof that a module of it reaches the bundle, so this
 *  over-counts and never under-counts. */
const walletDependency = new Map<string, string[] | null>();
function walletDependencyChain(root: string): string[] | null {
    if (walletDependency.has(root)) return walletDependency.get(root)!;
    const chains = new Map<string, string[]>();
    const queue = [root];
    let found: string[] | null = null;
    while (queue.length > 0 && !found) {
        const dir = queue.shift()!;
        const manifest = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as {
            name: string;
            dependencies?: Record<string, string>;
            peerDependencies?: Record<string, string>;
            peerDependenciesMeta?: Record<string, { optional?: boolean }>;
        };
        const chain = [...(chains.get(dir) ?? []), manifest.name];
        const deps = [
            ...Object.keys(manifest.dependencies ?? {}),
            ...Object.keys(manifest.peerDependencies ?? {}).filter((d) => !manifest.peerDependenciesMeta?.[d]?.optional),
        ];
        for (const dep of deps) {
            if (isWalletPackage(dep)) { found = [...chain, dep]; break; }
            const depDir = packageDir(dep, dir);
            if (!depDir || chains.has(depDir) || depDir === root) continue;
            chains.set(depDir, chain);
            queue.push(depDir);
        }
    }
    walletDependency.set(root, found);
    return found;
}

/** The file an in-tree specifier names, or null for a package. */
function resolveLocal(from: string, specifier: string): string | null {
    let base: string;
    if (specifier.startsWith("@/")) base = path.join(ROOT, specifier.slice(2));
    else if (specifier.startsWith(".")) base = path.resolve(path.dirname(from), specifier);
    else return null;
    const candidates = [
        base,
        ...EXTENSIONS.map((ext) => base + ext),
        ...EXTENSIONS.map((ext) => path.join(base, `index${ext}`)),
    ];
    for (const c of candidates) if (existsSync(c) && statSync(c).isFile()) return c;
    throw new Error(`${path.relative(ROOT, from)}: cannot resolve "${specifier}"`);
}

/** The wallet entry points a file takes from the wallet package. */
function walletEntryPoints(imp: StaticImport): string[] {
    if (imp.specifier !== WALLET_PACKAGE) return [];
    // A namespace or default import of the package could reach any hook.
    if (imp.names === null) return ["* (whole module)"];
    return imp.names.filter((n) => n === "WagmiProvider" || /^use[A-Z]/.test(n));
}

/** Whether a specifier names the wallet package or one of its parts (`wagmi/connectors/injected`, `@wagmi/core`). */
const isWalletPackage = (specifier: string) =>
    specifier === WALLET_PACKAGE || specifier.startsWith(`${WALLET_PACKAGE}/`) || specifier.startsWith("@wagmi/");

/** Every file reachable by static or dynamic import from `entries`, with the chain that reached it. */
function reachable(entries: string[]): Map<string, string[]> {
    const chains = new Map<string, string[]>();
    const queue: string[] = [];
    for (const e of entries) {
        chains.set(e, [e]);
        queue.push(e);
    }
    while (queue.length > 0) {
        const file = queue.shift()!;
        if (!/\.(tsx?|jsx?|mjs)$/.test(file)) continue;
        for (const imp of loadedImports(file)) {
            const next = resolveLocal(file, imp.specifier);
            if (!next || chains.has(next)) continue;
            chains.set(next, [...chains.get(file)!, next]);
            queue.push(next);
        }
    }
    return chains;
}

const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
const isLayoutOrPage = (f: string) => /(^|[/\\])(layout|page)\.tsx?$/.test(f);

describe("wallet-provider scope per route", () => {
    it("no file reachable from a marketing layout or page imports the Providers stack or anything from the wallet package", () => {
        const entries = sourceFiles("app/(marketing)").filter(isLayoutOrPage);
        expect(entries.length, "the marketing tree has layouts and pages").toBeGreaterThan(0);
        const chains = reachable(entries);
        // The walk reaches the shared library, so an empty result is not an empty walk.
        expect([...chains.keys()].some((f) => rel(f).startsWith("components/")), "the walk reaches components/").toBe(true);
        expect([...chains.keys()].some((f) => rel(f).startsWith("lib/")), "the walk reaches lib/").toBe(true);
        expect([...chains.keys()].map(rel), "the walk reaches the standalone publicClient's module").toContain("lib/shared/publicClient.ts");

        const offenders: string[] = [];
        for (const [file, chain] of chains) {
            const route = chain.map(rel).join(" → ");
            if (file === PROVIDERS) offenders.push(`${route} (the Providers stack)`);
            for (const imp of loadedImports(file)) {
                if (isWalletPackage(imp.specifier)) {
                    const taken = imp.names === null ? "the whole module" : imp.names.join(", ");
                    offenders.push(`${route} takes ${taken} from "${imp.specifier}"`);
                    continue;
                }
                // A package the page loads brings its own dependencies into the bundle.
                if (resolveLocal(file, imp.specifier) !== null || isBuiltin(imp.specifier)) continue;
                const dir = packageDir(packageName(imp.specifier), path.dirname(file));
                if (!dir) {
                    offenders.push(`${route} imports "${imp.specifier}", which is not installed, so its dependencies cannot be read`);
                    continue;
                }
                const through = walletDependencyChain(dir);
                if (through) offenders.push(`${route} imports "${imp.specifier}", which depends on the wallet package: ${through.join(" → ")}`);
            }
        }
        expect(offenders).toEqual([]);
        // The walk parses every file the marketing tree reaches; under coverage it runs past the default limit.
    }, 60_000);

    it.each(["app/(app)/layout.tsx", "app/(tools)/layout.tsx"])("%s reaches the Providers stack, which mounts WagmiProvider", (layout) => {
        const chains = reachable([path.join(ROOT, layout)]);
        expect(chains.has(PROVIDERS), `${layout} imports app/providers.tsx`).toBe(true);
        const providerTakes = staticImports(PROVIDERS).flatMap(walletEntryPoints);
        expect(providerTakes).toContain("WagmiProvider");
    });
});
