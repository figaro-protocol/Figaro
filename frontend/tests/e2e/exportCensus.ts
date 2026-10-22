/**
 * exportCensus.ts — the static export's own route list, read from the dist dir
 * the webServer built. The stranger crawl and the accessibility sweep read the
 * same census, so a route the export ships is a route both visit.
 */
import * as fs from 'fs';
import * as path from 'path';

/** The dist dir the prod-mode webServer builds into for the chain under test. */
export function exportDistDir(): string {
    return path.resolve(__dirname, '../..', process.env.E2E_CHAIN === 'sepolia' ? '.next-e2e-sepolia' : '.next-e2e');
}

/**
 * The static export's own route census: every `index.html` under the dist
 * dir the webServer built (trailingSlash: true — directory-per-route).
 * `/404` (the not-found page — no link points at it by design) and the
 * typedoc bundle are not crawl targets.
 */
export function exportedRoutes(distDir: string): string[] {
    const routes: string[] = [];
    const walk = (dir: string, rel: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (rel === '' && (entry.name === '_next' || entry.name === 'sdk-api')) continue;
                walk(path.join(dir, entry.name), `${rel}/${entry.name}`);
            } else if (entry.name === 'index.html' && rel !== '/404') {
                routes.push(rel === '' ? '/' : rel);
            }
        }
    };
    walk(distDir, '');
    return routes.sort();
}
