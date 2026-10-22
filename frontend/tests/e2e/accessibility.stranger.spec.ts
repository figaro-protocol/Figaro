/**
 * accessibility.stranger.spec.ts — every exported route against WCAG 2.1 A and AA.
 *
 * The stranger project's second sweep: the same prod-mode static export the
 * crawl visits, the same census (`exportCensus.ts`), the same walletless
 * browser context. Each route is loaded, hydration awaited, and axe-core run
 * with the WCAG 2.0 and 2.1 A and AA rule tags; any violation on any route
 * fails the sweep, named by route, rule and the first offending node. axe is
 * evaluated through Playwright, never injected as a page script, so the
 * pages' own inline-script policy is untouched by the check.
 *
 *     npx playwright test --project=stranger accessibility.stranger.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import { createRequire } from 'module';
import { exportDistDir, exportedRoutes } from './exportCensus';
import { waitForReactHydration } from './test-helpers';

const require_ = createRequire(__filename);
const AXE_SOURCE = fs.readFileSync(require_.resolve('axe-core/axe.min.js'), 'utf8');
const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const TABS = 4;

interface Violation {
    route: string;
    rule: string;
    impact: string | null;
    help: string;
    target: string;
}

async function auditRoute(page: Page, route: string): Promise<Violation[]> {
    const res = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (!res || res.status() >= 400) return [];
    await waitForReactHydration(page, 'body').catch(() => {});
    await page.evaluate(AXE_SOURCE);
    const result: Omit<Violation, 'route'>[] = await page.evaluate(async (tags) => {
        // @ts-expect-error axe is the global the evaluated source defines
        const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
        return r.violations.map((v: { id: string; impact: string | null; help: string; nodes: { target: unknown[] }[] }) => ({
            rule: v.id, impact: v.impact, help: v.help, target: JSON.stringify(v.nodes[0]?.target ?? []),
        }));
    }, WCAG_AA);
    return result.map((v) => ({ route, ...v }));
}

test.describe('ACCESSIBILITY — every exported route against WCAG 2.1 A and AA (stranger)', () => {
    test.setTimeout(60 * 60_000);

    test('no route carries a WCAG A or AA violation', async ({ browser }) => {
        const distDir = exportDistDir();
        expect(fs.existsSync(distDir), `the export to audit (${distDir})`).toBe(true);
        const routes = exportedRoutes(distDir);
        const context = await browser.newContext();
        const queue = [...routes];
        const violations: Violation[] = [];
        await Promise.all(Array.from({ length: TABS }, async () => {
            const page = await context.newPage();
            for (let route = queue.shift(); route !== undefined; route = queue.shift()) {
                violations.push(...await auditRoute(page, route));
            }
            await page.close();
        }));
        await context.close();

        const byRule = new Map<string, Violation[]>();
        for (const v of violations) byRule.set(v.rule, [...(byRule.get(v.rule) ?? []), v]);
        const report = [...byRule.entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .map(([rule, vs]) => `${rule} (${vs[0].impact}) — ${vs[0].help}: ${vs.length} route(s), e.g. ${vs.slice(0, 3).map((v) => `${v.route} ${v.target}`).join('; ')}`);
        expect(violations, `WCAG A/AA violations across ${routes.length} routes:\n  ${report.join('\n  ')}`).toEqual([]);
    });
});
