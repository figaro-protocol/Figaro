/**
 * Every in-tree link names a route that exists (docs/FRONTEND.md § "Routes":
 * the directory listing is the source of truth).
 *
 * The routes are read from `app/` at test time: each `page.tsx`, its route
 * groups dropped, a `[segment]` matching any one segment. A file a link may
 * name is read from `public/`, from a metadata route of `app/` (`sitemap.ts`,
 * `robots.ts`), or is a paper's PDF, which the build writes beside the paper's
 * page (`/papers/<slug>/<slug>.pdf`, `frontend/scripts/build-paper-pdfs.mjs`).
 *
 * The links are read from every source file under `app/`, `components/` and
 * `lib/`, parsed, never matched as text: a string, or a backquoted string,
 * whose value is an `href` (a JSX attribute, or an object's `href` property,
 * the shape of the one nav source `components/shared/navLinks.ts` and of the
 * breadcrumbs), and the path a link helper returns (a function named
 * `…Href`, such as `sellerPageHref` and `processAuditHref`). The section
 * map's landing pages (`lib/shared/sections.json`) are read too. A link
 * counts by its path, up to its first `?` or `#`; a `${…}` that follows a `/`
 * is one segment of any value, and one glued to the text before it ends the
 * path there.
 *
 * Out of the tree by design, and so not checked: `/docs/…`, the docs-site, a
 * separate build served under `/docs` on the same host; `/sdk-api/…`, the
 * typedoc bundle generated into the export.
 *
 * Proves: no in-tree link written as a string names a route or a file the
 * tree does not hold. Does not prove: a link whose path other code computes
 * (a variable passed through), or that a query value names something on the
 * network.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { pageRouteSegments, routeOf, treeSourceFiles } from "./__fixtures__/sourceTree";

const ROOT = path.resolve(process.cwd());
const APP = path.join(ROOT, "app");
const PUBLIC = path.join(ROOT, "public");

/** A computed part of a link: one segment whose value the code supplies. */
const COMPUTED = "…";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Each page route of the tree, with a pattern over a pathname. */
const PAGES = pageRouteSegments(APP).map((segments) => ({
    route: routeOf(segments),
    pattern: new RegExp(`^/${segments.map((s) => (/^\[\.\.\..+\]$/.test(s) ? ".+" : /^\[.+\]$/.test(s) ? "[^/]+" : escape(s))).join("/")}$`),
}));

/** The URL path a metadata route of `app/` answers, by its file name. */
const METADATA_ROUTES: Record<string, string> = { "sitemap.ts": "/sitemap.xml", "robots.ts": "/robots.txt" };

function fileExists(pathname: string): boolean {
    const inPublic = path.join(PUBLIC, pathname);
    if (existsSync(inPublic) && statSync(inPublic).isFile()) return true;
    if (Object.entries(METADATA_ROUTES).some(([file, url]) => url === pathname && existsSync(path.join(APP, file)))) return true;
    const pdf = pathname.match(/^\/papers\/([^/]+)\/([^/]+)\.pdf$/);
    if (!pdf || pdf[1] !== pdf[2]) return false;
    // A computed slug names whichever paper the page is; a written one names its own page.
    return PAGES.some((p) => (pdf[1] === COMPUTED ? p.route.startsWith("/papers/") : p.route === `/papers/${pdf[1]}`));
}

/** The text of a string, or of a backquoted string with each `${…}` read as above; null for any other expression. */
function linkText(node: ts.Expression): string | null {
    if (ts.isStringLiteral(node)) return node.text;
    const source = node.getText();
    if (!source.startsWith("`") || !source.endsWith("`")) return null;
    const parts = source.slice(1, -1).split(/\$\{[^}]*\}/);
    let text = parts[0];
    for (const part of parts.slice(1)) {
        if (!text.endsWith("/")) break;
        text += COMPUTED + part;
    }
    return text;
}

/** The expressions a link may take its value from: the branches of a conditional, the operand of a cast. */
function valuesOf(node: ts.Expression): ts.Expression[] {
    if (ts.isConditionalExpression(node)) return [...valuesOf(node.whenTrue), ...valuesOf(node.whenFalse)];
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return valuesOf(node.expression);
    return [node];
}

interface Link { at: string; href: string }

function linksIn(file: string): Link[] {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const out: Link[] = [];
    const take = (expr: ts.Expression | undefined) => {
        if (!expr) return;
        for (const value of valuesOf(expr)) {
            const text = linkText(value);
            if (text !== null && text.startsWith("/") && !text.startsWith("//")) {
                out.push({ at: `${path.relative(ROOT, file)}:${source.getLineAndCharacterOfPosition(value.getStart()).line + 1}`, href: text });
            }
        }
    };
    const visit = (node: ts.Node) => {
        if (ts.isJsxAttribute(node) && node.name.getText() === "href" && node.initializer) {
            if (ts.isStringLiteral(node.initializer)) take(node.initializer);
            else if (ts.isJsxExpression(node.initializer)) take(node.initializer.expression);
        }
        if (ts.isPropertyAssignment(node) && node.name.getText() === "href") take(node.initializer);
        if (ts.isReturnStatement(node)) {
            let fn: ts.Node | undefined = node.parent;
            while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
            const name = fn && ts.isFunctionDeclaration(fn) ? fn.name?.getText() : fn && ts.isVariableDeclaration(fn.parent) ? fn.parent.name.getText() : undefined;
            if (name && /Href$/.test(name)) take(node.expression);
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return out;
}

/** A link's path: no query, no fragment, no trailing slash. */
const pathOf = (href: string): string => {
    const p = href.split(/[?#]/)[0].replace(/\/+$/, "");
    return p === "" ? "/" : p;
};

const OUTSIDE_THE_TREE = /^\/(docs|sdk-api)(\/|$)/;

describe("every in-tree link names a route or a file the tree holds", () => {
    const doors = JSON.parse(readFileSync(path.join(ROOT, "lib/shared/sections.json"), "utf8")) as { landings: Record<string, string> };
    const links: Link[] = [
        ...treeSourceFiles(ROOT, ["app", "components", "lib"]).flatMap(linksIn),
        ...Object.values(doors.landings).map((href) => ({ at: "lib/shared/sections.json (landings)", href })),
    ];

    it("reads the links it checks", () => {
        // The nav source alone carries dozens; a reader that found none would pass vacuously.
        expect(links.filter((l) => l.at.startsWith("components/shared/navLinks.ts")).length).toBeGreaterThan(20);
        expect(links.some((l) => l.href.startsWith("/s/view?seller="))).toBe(true);
    });

    it("no link names a route or a file that does not exist", () => {
        const dead = links
            .filter((l) => !OUTSIDE_THE_TREE.test(pathOf(l.href)))
            .filter((l) => {
                const p = pathOf(l.href);
                if (/\.[a-z0-9]{2,5}$/i.test(p)) return !fileExists(p);
                return !PAGES.some((r) => r.pattern.test(p));
            })
            .map((l) => `${l.at}: ${l.href}`);
        expect(dead).toEqual([]);
    });
});
