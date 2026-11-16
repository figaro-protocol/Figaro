/**
 * A marketing page loads no wallet; an app page does (docs/FRONTEND.md
 * § "Wallet-provider scope per route", rule 3).
 *
 * `app/(marketing)/layout.tsx` mounts no `<Providers>`, so a wagmi hook
 * called under a marketing page has no `WagmiProvider` above it. This test
 * walks the static import graph from every layout and page under
 * `app/(marketing)/`, through `app/`, `components/`, `hooks/` and `lib/`,
 * and follows only the code each step uses: from an imported module, the
 * names imported from it, then the top-level declarations those names refer
 * to, then the imports those declarations refer to. It fails when the code a
 * marketing page uses:
 *
 * - refers to anything in `app/providers.tsx` (the `Providers` stack that
 *   mounts `WagmiProvider`), or
 * - refers to `WagmiProvider` or a hook (`use…`) imported from `wagmi`.
 *
 * Allowed on a marketing path: `lib/shared/wagmi.ts`'s standalone
 * `publicClient` (it builds on `createConfig`, neither a provider nor a hook).
 *
 * The walk follows names, not whole files: it holds what a marketing page
 * calls. The stricter reading, by whole file, is
 * `marketingWalletScopeFileLevel.test.ts`: no module a marketing page
 * imports keeps a wallet hook beside the reads the page uses.
 *
 * The other half: the same walk from the `(app)` and `(tools)` layouts
 * reaches `Providers` and `WagmiProvider`.
 *
 * Proves: no code a marketing layout or page uses, by static import and
 * top-level reference, reaches the wallet provider or a wagmi hook. Does not
 * prove: anything reached by a dynamic `import()` (none is walked); and the
 * reference walk is per name at file scope, so it over-counts (a property
 * named like an import counts), never under-counts within a file.
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
const ALL = "*";

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

/** A value import: the module and the name taken from it (`default`, or `*` for a namespace). */
interface Binding { specifier: string; imported: string }

interface ModuleShape {
    /** Local name → the import it binds (type-only bindings left out). */
    imports: Map<string, Binding>;
    /** Top-level declared name → the statement that declares it. */
    decls: Map<string, ts.Node>;
    /** Exported name → local name, for `export { a as b }` and `export function b`. */
    localExports: Map<string, string>;
    /** Exported name → import it re-exports, for `export { a as b } from "x"`. */
    reExports: Map<string, Binding>;
    /** `export * from "x"`. */
    starExports: string[];
    /** Statements that run on load whatever is used: side-effect imports, expressions. */
    onLoad: ts.Node[];
    /** Side-effect imports (`import "x"`). */
    bareImports: string[];
}

const shapes = new Map<string, ModuleShape>();

function shapeOf(file: string): ModuleShape {
    const cached = shapes.get(file);
    if (cached) return cached;
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const shape: ModuleShape = {
        imports: new Map(), decls: new Map(), localExports: new Map(), reExports: new Map(),
        starExports: [], onLoad: [], bareImports: [],
    };
    const exported = (node: ts.Node) =>
        ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const isDefault = (node: ts.Node) =>
        ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    for (const st of source.statements) {
        if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
            const specifier = st.moduleSpecifier.text;
            const clause = st.importClause;
            if (!clause) { shape.bareImports.push(specifier); continue; }
            if (clause.isTypeOnly) continue;
            if (clause.name) shape.imports.set(clause.name.text, { specifier, imported: "default" });
            const b = clause.namedBindings;
            if (b && ts.isNamespaceImport(b)) shape.imports.set(b.name.text, { specifier, imported: ALL });
            if (b && ts.isNamedImports(b)) {
                for (const e of b.elements) {
                    if (e.isTypeOnly) continue;
                    shape.imports.set(e.name.text, { specifier, imported: (e.propertyName ?? e.name).text });
                }
            }
        } else if (ts.isExportDeclaration(st)) {
            if (st.isTypeOnly) continue;
            const spec = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : null;
            const clause = st.exportClause;
            if (!clause) { if (spec) shape.starExports.push(spec); continue; }
            if (ts.isNamespaceExport(clause)) { if (spec) shape.reExports.set(clause.name.text, { specifier: spec, imported: ALL }); continue; }
            for (const e of clause.elements) {
                if (e.isTypeOnly) continue;
                const from = (e.propertyName ?? e.name).text;
                if (spec) shape.reExports.set(e.name.text, { specifier: spec, imported: from });
                else shape.localExports.set(e.name.text, from);
            }
        } else if (ts.isExportAssignment(st)) {
            shape.decls.set("default", st);
            shape.localExports.set("default", "default");
        } else if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) {
            if (!st.name) { if (isDefault(st)) { shape.decls.set("default", st); shape.localExports.set("default", "default"); } continue; }
            shape.decls.set(st.name.text, st);
            if (exported(st)) shape.localExports.set(isDefault(st) ? "default" : st.name.text, st.name.text);
        } else if (ts.isVariableStatement(st)) {
            const names: string[] = [];
            const collect = (n: ts.BindingName) => {
                if (ts.isIdentifier(n)) names.push(n.text);
                else for (const el of n.elements) if (!ts.isOmittedExpression(el)) collect(el.name);
            };
            for (const d of st.declarationList.declarations) collect(d.name);
            for (const n of names) {
                shape.decls.set(n, st);
                if (exported(st)) shape.localExports.set(n, n);
            }
        } else if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isModuleDeclaration(st)) {
            continue;
        } else {
            shape.onLoad.push(st);
        }
    }
    shapes.set(file, shape);
    return shape;
}

/** Every identifier written inside `node` (types included: over-counting is safe). */
function identifiers(node: ts.Node, out: Set<string>) {
    if (ts.isIdentifier(node)) out.add(node.text);
    ts.forEachChild(node, (child) => identifiers(child, out));
}

interface Finding { chain: string[]; what: string }

/**
 * Walk from `entries` (every export of each used) and return each wallet
 * entry point the used code refers to, with the chain of files that reached it.
 */
function walletReach(entries: string[]): { findings: Finding[]; files: Set<string> } {
    const done = new Map<string, Set<string>>();
    const chains = new Map<string, string[]>();
    const findings: Finding[] = [];
    const queue: { file: string; name: string; chain: string[] }[] = entries.map((file) => ({ file, name: ALL, chain: [file] }));

    const take = (from: string, chain: string[], binding: Binding) => {
        if (binding.specifier === WALLET_PACKAGE) {
            const { imported } = binding;
            if (imported === ALL || imported === "default" || imported === "WagmiProvider" || /^use[A-Z]/.test(imported)) {
                findings.push({ chain, what: `${imported === ALL ? "the whole module" : imported} from "${WALLET_PACKAGE}"` });
            }
            return;
        }
        const next = resolveLocal(from, binding.specifier);
        if (!next) return;
        queue.push({ file: next, name: binding.imported, chain: [...chain, next] });
    };

    while (queue.length > 0) {
        const { file, name, chain } = queue.shift()!;
        if (!/\.(tsx?|jsx?|mjs)$/.test(file)) continue;
        const seen = done.get(file) ?? new Set<string>();
        if (seen.has(name) || seen.has(ALL)) continue;
        const firstVisit = seen.size === 0;
        seen.add(name);
        done.set(file, seen);
        if (!chains.has(file)) chains.set(file, chain);
        if (file === PROVIDERS) {
            findings.push({ chain, what: "the Providers stack (app/providers.tsx)" });
        }
        const shape = shapeOf(file);

        // What runs on load runs once, whatever is used.
        const roots: ts.Node[] = firstVisit ? [...shape.onLoad] : [];
        if (firstVisit) for (const spec of shape.bareImports) take(file, chain, { specifier: spec, imported: ALL });

        const wanted = name === ALL
            ? [...new Set([...shape.localExports.keys(), ...shape.reExports.keys()])]
            : [name];
        if (name === ALL) for (const spec of shape.starExports) take(file, chain, { specifier: spec, imported: ALL });
        for (const w of wanted) {
            const local = shape.localExports.get(w);
            if (local !== undefined) {
                const decl = shape.decls.get(local);
                if (decl) roots.push(decl);
                else { const imp = shape.imports.get(local); if (imp) take(file, chain, imp); }
                continue;
            }
            const re = shape.reExports.get(w);
            if (re) { take(file, chain, re); continue; }
            if (name !== ALL) for (const spec of shape.starExports) take(file, chain, { specifier: spec, imported: w });
        }

        // The closure over top-level declarations the roots refer to.
        const visited = new Set<ts.Node>();
        const usedImports = new Set<string>();
        const stack = [...roots];
        while (stack.length > 0) {
            const node = stack.pop()!;
            if (visited.has(node)) continue;
            visited.add(node);
            const ids = new Set<string>();
            identifiers(node, ids);
            for (const id of ids) {
                const decl = shape.decls.get(id);
                if (decl && !visited.has(decl)) stack.push(decl);
                if (shape.imports.has(id)) usedImports.add(id);
            }
        }
        for (const local of usedImports) take(file, chain, shape.imports.get(local)!);
    }
    return { findings, files: new Set(chains.keys()) };
}

const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
const isLayoutOrPage = (f: string) => /(^|[/\\])(layout|page)\.tsx?$/.test(f);
const describeFinding = (f: Finding) => `${f.chain.map(rel).join(" → ")} uses ${f.what}`;

describe("wallet-provider scope per route", () => {
    it("the code a marketing layout or page uses reaches no Providers stack, no WagmiProvider and no wagmi hook", () => {
        const entries = sourceFiles("app/(marketing)").filter(isLayoutOrPage);
        expect(entries.length, "the marketing tree has layouts and pages").toBeGreaterThan(0);
        const { findings, files } = walletReach(entries);
        // The walk reaches the shared library, so an empty result is not an empty walk.
        const reached = [...files].map(rel);
        expect(reached.some((f) => f.startsWith("components/")), "the walk reaches components/").toBe(true);
        expect(reached.some((f) => f.startsWith("lib/")), "the walk reaches lib/").toBe(true);
        expect(reached, "the walk reaches the standalone publicClient's module").toContain("lib/shared/wagmi.ts");
        expect(findings.map(describeFinding)).toEqual([]);
    });

    it.each(["app/(app)/layout.tsx", "app/(tools)/layout.tsx"])("the code %s uses reaches the Providers stack and WagmiProvider", (layout) => {
        const { findings } = walletReach([path.join(ROOT, layout)]);
        const what = findings.map((f) => f.what);
        expect(what).toContain("the Providers stack (app/providers.tsx)");
        expect(what).toContain(`WagmiProvider from "${WALLET_PACKAGE}"`);
    });
});
