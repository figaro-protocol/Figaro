/**
 * A marketing page loads no wallet; an app page does (docs/FRONTEND.md
 * § "Wallet-provider scope per route", rule 3).
 *
 * `app/(marketing)/layout.tsx` mounts no `<Providers>`, so a wagmi hook
 * reached from a marketing page has no `WagmiProvider` above it. This test
 * walks the static import graph from every layout and page under
 * `app/(marketing)/`, through `components/`, `hooks/` and `lib/`, and fails
 * when any file it reaches:
 *
 * - imports `app/providers.tsx` (the `Providers` stack that mounts
 *   `WagmiProvider`), or
 * - takes `WagmiProvider` or a hook (`use…`) from `wagmi`.
 *
 * What stays allowed on a marketing path: `lib/shared/wagmi.ts`, whose
 * standalone `publicClient` the marketing pages read the chain with; it takes
 * `createConfig` from `wagmi`, which is neither a provider nor a hook.
 *
 * The other half: the `(app)` and `(tools)` layouts reach `Providers`, and
 * `Providers` takes `WagmiProvider` from `wagmi`.
 *
 * Proves: no static import chain from a marketing layout or page reaches the
 * wallet provider or a wagmi hook. Does not prove: anything about a dynamic
 * `import()` (none is walked), or that a page renders without a console
 * error (the `stranger` Playwright project reads the pages in a browser).
 * Type-only imports load nothing at runtime and are not walked.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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

/** Every file reachable by static import from `entries`, with the chain that reached it. */
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
        for (const imp of staticImports(file)) {
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
    it("no file reachable from a marketing layout or page imports the Providers stack, WagmiProvider or a wagmi hook", () => {
        const entries = sourceFiles("app/(marketing)").filter(isLayoutOrPage);
        expect(entries.length, "the marketing tree has layouts and pages").toBeGreaterThan(0);
        const chains = reachable(entries);
        // The walk reaches the shared library, so an empty result is not an empty walk.
        expect([...chains.keys()].some((f) => rel(f).startsWith("components/")), "the walk reaches components/").toBe(true);
        expect([...chains.keys()].some((f) => rel(f).startsWith("lib/")), "the walk reaches lib/").toBe(true);

        const offenders: string[] = [];
        for (const [file, chain] of chains) {
            const route = chain.map(rel).join(" → ");
            if (file === PROVIDERS) offenders.push(`${route} (the Providers stack)`);
            for (const imp of staticImports(file)) {
                const taken = walletEntryPoints(imp);
                if (taken.length > 0) offenders.push(`${route} takes ${taken.join(", ")} from "${WALLET_PACKAGE}"`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it.each(["app/(app)/layout.tsx", "app/(tools)/layout.tsx"])("%s reaches the Providers stack, which mounts WagmiProvider", (layout) => {
        const chains = reachable([path.join(ROOT, layout)]);
        expect(chains.has(PROVIDERS), `${layout} imports app/providers.tsx`).toBe(true);
        const providerTakes = staticImports(PROVIDERS).flatMap(walletEntryPoints);
        expect(providerTakes).toContain("WagmiProvider");
    });
});
