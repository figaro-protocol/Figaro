/**
 * The frontend's own tree, read at test time: the source files of a set of
 * folders, and the page routes of `app/` (docs/FRONTEND.md § "Routes": the
 * directory listing is the source of truth, never a kept list).
 */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

/** Every .ts and .tsx file under `dirs` (relative to `root`), declaration files left out. */
export function treeSourceFiles(root: string, dirs: readonly string[]): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
            const full = path.join(dir, name);
            if (statSync(full).isDirectory()) walk(full);
            else if (/\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push(full);
        }
    };
    for (const d of dirs) walk(path.join(root, d));
    return out;
}

/**
 * The URL segments of every `page.tsx` under `appDir`, route groups dropped
 * (they never appear in the URL). With `groups`, only the pages under those
 * top-level groups.
 */
export function pageRouteSegments(appDir: string, groups?: readonly string[]): string[][] {
    const out: string[][] = [];
    const walk = (dir: string, segments: string[]) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                const isGroup = entry.name.startsWith("(") && entry.name.endsWith(")");
                walk(path.join(dir, entry.name), isGroup ? segments : [...segments, entry.name]);
            } else if (entry.name === "page.tsx") {
                out.push(segments);
            }
        }
    };
    if (groups) for (const g of groups) walk(path.join(appDir, g), []);
    else walk(appDir, []);
    return out;
}

/** A route's path from its segments. */
export const routeOf = (segments: readonly string[]): string => "/" + segments.join("/");
