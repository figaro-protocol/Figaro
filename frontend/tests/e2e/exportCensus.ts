/**
 * exportCensus.ts — the static export's own route list, read from the dist dir
 * the webServer built. The stranger crawl and the accessibility sweep read the
 * same census, so a route the export ships is a route both visit.
 */
import * as fs from 'fs';
import * as path from 'path';

/**
 * The dist dir the webServer serves: the export E2E_EXPORT_DIR names when it is
 * set (built beforehand, relative to frontend/), else the one the prod-mode
 * webServer builds into for the chain under test.
 */
export function exportDistDir(): string {
    const named = process.env.E2E_EXPORT_DIR;
    return path.resolve(__dirname, '../..', named || (process.env.E2E_CHAIN === 'sepolia' ? '.next-e2e-sepolia' : '.next-e2e'));
}

/**
 * The static export's own route census: every `index.html` under the dist
 * dir the webServer built (trailingSlash: true — directory-per-route).
 * `/404` (the not-found page — no link points at it by design) and the
 * typedoc bundle are not crawl targets. Nor is `/_not-found`: Next 16 exports
 * its own not-found page under that name as well, a route Next generates and
 * no page of the app declares.
 */
export function exportedRoutes(distDir: string): string[] {
    const routes: string[] = [];
    const walk = (dir: string, rel: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (rel === '' && (entry.name === '_next' || entry.name === 'sdk-api')) continue;
                walk(path.join(dir, entry.name), `${rel}/${entry.name}`);
            } else if (entry.name === 'index.html' && rel !== '/404' && rel !== '/_not-found') {
                routes.push(rel === '' ? '/' : rel);
            }
        }
    };
    walk(distDir, '');
    return routes.sort();
}
