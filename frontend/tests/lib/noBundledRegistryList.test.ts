/**
 * The network and the bundle (CLAUDE.md § "The frontend's seams", 6;
 * docs/OPEN_WORLD.md § 1): a page renders what it read from the chain, the
 * registries and IPFS, and no list is bundled.
 *
 * The repository's seed sets of the four registries' objects
 * (`clauses/`, `agreements/`, `assemblies/`, `members/` at the repository
 * root) are the seeding's source, registered on the network like any
 * stranger's. No module of the app imports one of them, and the site's
 * public folder serves none, so the only way a page meets a clause, an
 * agreement, an assembly or a member is a read of the network. The spec cache
 * every page reads starts empty (`tests/lib/clauseSpecSource.test.ts`,
 * "starts empty — no bundled specs").
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { treeSourceFiles } from "./__fixtures__/sourceTree";

const FRONTEND = process.cwd();
const REPO = path.resolve(FRONTEND, "..");
/** The repository's seed sets, one per registry. */
const SEED_SETS = ["clauses", "agreements", "assemblies", "members"].map((d) => path.join(REPO, d));
/** The app's own modules: what the build bundles. */
const APP_DIRS = ["app", "components", "lib", "hooks", "types"].filter((d) => existsSync(path.join(FRONTEND, d)));

/** Every module specifier a source names: static and dynamic imports, re-exports, requires. */
function specifiers(source: string): string[] {
    const out: string[] = [];
    for (const re of [/\bfrom\s+["']([^"']+)["']/g, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g, /^\s*import\s+["']([^"']+)["']/gm]) {
        for (const m of source.matchAll(re)) out.push(m[1]);
    }
    return out;
}

/** Where a specifier points on disk, for a relative or `@/` one; null for a package. */
function resolveSpecifier(file: string, spec: string): string | null {
    if (spec.startsWith("@/")) return path.resolve(FRONTEND, spec.slice(2));
    if (spec.startsWith(".")) return path.resolve(path.dirname(file), spec);
    return null;
}

const insideSeedSet = (target: string): boolean =>
    SEED_SETS.some((dir) => target === dir || target.startsWith(dir + path.sep));

function filesUnder(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name);
        return statSync(full).isDirectory() ? filesUnder(full) : [full];
    });
}

describe("no list is bundled: a page meets the registries' objects only through the network", () => {
    it("the scan reads the app's modules", () => {
        expect(treeSourceFiles(FRONTEND, APP_DIRS).length).toBeGreaterThan(100);
    });

    it("no module of the app imports the repository's clauses, agreements, assemblies or members", () => {
        const found: string[] = [];
        for (const file of treeSourceFiles(FRONTEND, APP_DIRS)) {
            for (const spec of specifiers(readFileSync(file, "utf8"))) {
                const target = resolveSpecifier(file, spec);
                if (target !== null && insideSeedSet(target)) found.push(`${path.relative(FRONTEND, file)} imports ${spec}`);
            }
        }
        expect(found).toEqual([]);
    });

    it("the site's public folder serves no clause, agreement, assembly or member document", () => {
        const names = new Set(
            SEED_SETS.flatMap((dir) => filesUnder(dir)).map((f) => path.basename(f)).filter((n) => n.endsWith(".json")),
        );
        expect(names.size).toBeGreaterThan(0);
        const served = filesUnder(path.join(FRONTEND, "public")).filter((f) => names.has(path.basename(f)));
        expect(served.map((f) => path.relative(FRONTEND, f))).toEqual([]);
    });

    it("the scan finds an import into a seed set when one is written", () => {
        const file = path.join(FRONTEND, "lib", "shared", "example.ts");
        const planted = specifiers(`import spec from "../../../clauses/figaro-commerce.json";\nconst m = await import("../../../assemblies/pos.json");`);
        expect(planted.map((s) => resolveSpecifier(file, s)).every((t) => t !== null && insideSeedSet(t))).toBe(true);
    });
});
