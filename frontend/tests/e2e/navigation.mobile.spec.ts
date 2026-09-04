/**
 * navigation.mobile.spec.ts — mock-mobile project.
 *
 * Exercises the MobileNav chrome on a narrow viewport (Pixel 5 via
 * playwright.config.ts mock-mobile project): hamburger is visible, desktop
 * nav is hidden, drawer opens and closes, sections are an accordion
 * (collapsed by default, the current route's section pre-expanded), and
 * navigation closes the drawer.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import { NAV_LINKS } from '../../components/shared/navLinks';
import { waitForReactHydration } from './test-helpers';

const hrefRe = (href: string) => new RegExp(`^${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`);

/**
 * Navigate to an app page and wait for the hamburger button to be
 * hydrated. `MobileNav` is a `"use client"` component — clicking the
 * hamburger before React attaches its `onClick` handler lands focus
 * on the button but never fires `setIsOpen`, leaving the drawer
 * unmounted and the test flaky.
 */
async function gotoAppNavHydrated(page: Page): Promise<void> {
    await page.goto('/orders?e2e=mock', { waitUntil: 'load' });
    await waitForReactHydration(page, 'button[aria-label="Toggle mobile menu"]');
}

/** Expand a drawer section and return its panel (the disclosure it controls). */
async function expandSection(drawer: Locator, name: string): Promise<Locator> {
    const trigger = drawer.getByRole('button', { name, exact: true });
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
        await trigger.click();
    }
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const panelId = await trigger.getAttribute('aria-controls');
    return drawer.locator(`#${panelId}`);
}

test.describe('Mobile navigation (Pixel 5)', () => {
    test('hamburger is visible and desktop nav is hidden', async ({ page }) => {
        await gotoAppNavHydrated(page);

        const hamburger = page.getByRole('button', { name: 'Toggle mobile menu' });
        await expect(hamburger).toBeVisible();

        // Desktop nav container is CSS-hidden below the md breakpoint. Assert
        // it is ATTACHED first — toBeHidden() passes vacuously for a testid
        // that doesn't exist, so a stray rename of `desktop-nav` elsewhere
        // would silently turn this into a no-op assertion instead of a failure.
        const desktopNav = page.getByTestId('desktop-nav');
        await expect(desktopNav).toBeAttached();
        await expect(desktopNav).toBeHidden();
    });

    test('clicking hamburger opens the drawer, close button closes it', async ({ page }) => {
        await gotoAppNavHydrated(page);

        const hamburger = page.getByRole('button', { name: 'Toggle mobile menu' });
        await hamburger.click();

        const drawer = page.getByRole('dialog', { name: 'Mobile navigation' });
        await expect(drawer).toBeVisible();

        // Every registered nav link lives behind the Publication section now —
        // the drawer opens collapsed, so the section is a tap away, not a scroll.
        const publication = await expandSection(drawer, 'Publication');
        for (const link of NAV_LINKS) {
            await expect(publication.getByRole('link', { name: link.label })).toHaveAttribute('href', hrefRe(link.href));
        }

        await page.getByRole('button', { name: 'Close menu' }).click();
        await expect(drawer).toBeHidden();
    });

    test('clicking a drawer link navigates and closes the drawer', async ({ page }) => {
        await gotoAppNavHydrated(page);

        await page.getByRole('button', { name: 'Toggle mobile menu' }).click();
        const drawer = page.getByRole('dialog', { name: 'Mobile navigation' });
        await expect(drawer).toBeVisible();

        // The (app) drawer lists the five publication doorways by their ruled
        // section labels — /build is the 'Build' doorway there (the
        // 'Specifications' page label exists only in the marketing drawer's map).
        const publication = await expandSection(drawer, 'Publication');
        await publication.getByRole('link', { name: 'Build', exact: true }).click();

        await expect(page).toHaveURL(/\/build\/?$/);
        // useEffect on pathname change closes the drawer
        await expect(drawer).toBeHidden({ timeout: 5000 });
    });

    // The visitor report (2026-08-24): the flat drawer ran well past the fold.
    // Closed, it is one row per section — the whole map fits the viewport with
    // nothing to scroll, which is the point of the accordion.
    test('the closed drawer fits the viewport without scrolling', async ({ page }) => {
        await page.goto('/', { waitUntil: 'load' });
        await waitForReactHydration(page, 'button[aria-label="Toggle mobile menu"]');
        await page.getByRole('button', { name: 'Toggle mobile menu' }).click();

        const drawer = page.getByRole('dialog', { name: 'Mobile navigation' });
        await expect(drawer).toBeVisible();

        // No section is expanded on the home route (no map entry holds "/").
        // Only the section triggers carry aria-expanded inside the drawer.
        const triggers = drawer.locator('button[aria-expanded]');
        expect(await triggers.count()).toBeGreaterThan(1);
        for (const trigger of await triggers.all()) {
            await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        }

        const overflow = await drawer.locator('nav').evaluate(
            (el) => el.scrollHeight - el.clientHeight,
        );
        expect(overflow, 'the collapsed section list does not overflow its scroll area').toBeLessThanOrEqual(0);
    });

    // Wayfinding is comprehension. The marketing tier's desktop nav is the
    // section-doorway publication row; on mobile that row was the ONLY way in, so
    // every page behind a doorway was reachable only by scrolling to the footer.
    // The drawer now carries the whole marketing map — a stranger's first visit
    // is usually a phone, so this is the entry path that has to work.
    test('the marketing drawer opens the whole map, not just the doorways', async ({ page }) => {
        await page.goto('/', { waitUntil: 'load' });
        await waitForReactHydration(page, 'button[aria-label="Toggle mobile menu"]');

        await page.getByRole('button', { name: 'Toggle mobile menu' }).click();
        const drawer = page.getByRole('dialog', { name: 'Mobile navigation' });
        await expect(drawer).toBeVisible();

        // A page from BEHIND each doorway — the ones the 3-link drawer stranded.
        // Labels track navLinks.ts (the one nav source): the invariants page is
        // labelled by its own metadata.title, and the papers are reached through
        // Working Groups — the corpus is unbounded, so the working-groups page
        // IS the index (maintainer-ruled 2026-08-12; no /papers index exists).
        for (const [section, label, href] of [
            ['Core', 'Invariants', '/invariants'],
            ['Research', 'Working Groups', '/working-groups'],
            ['Build', 'Clauses', '/clauses'],
            ['Agents', 'How agents work', '/agents/how'],
        ] as const) {
            const panel = await expandSection(drawer, section);
            await expect(
                panel.getByRole('link', { name: label }),
                `${label} is reachable from the marketing drawer`,
            ).toHaveAttribute('href', hrefRe(href));
        }

        // And it navigates, closing behind itself.
        const deal = await expandSection(drawer, 'Core');
        await deal.getByRole('link', { name: 'Invariants' }).click();
        await expect(page).toHaveURL(/\/invariants\/?$/);
        await expect(drawer).toBeHidden({ timeout: 5000 });
    });

    // The reader lands where they already are: reopening the drawer on a page
    // shows that page's own section already open, with the doorway marked.
    test('the drawer pre-expands the section holding the current route', async ({ page }) => {
        await page.goto('/invariants', { waitUntil: 'load' });
        await waitForReactHydration(page, 'button[aria-label="Toggle mobile menu"]');

        await page.getByRole('button', { name: 'Toggle mobile menu' }).click();
        const drawer = page.getByRole('dialog', { name: 'Mobile navigation' });
        const deal = drawer.getByRole('button', { name: 'Core', exact: true });
        await expect(deal).toHaveAttribute('aria-expanded', 'true');
        await expect(deal).toHaveAttribute('aria-current', 'true');
        await expect(drawer.getByRole('link', { name: 'Invariants' })).toHaveAttribute('aria-current', 'page');
        await expect(drawer.getByRole('button', { name: 'Build', exact: true })).toHaveAttribute('aria-expanded', 'false');
    });

    test('backdrop click closes the drawer', async ({ page }) => {
        await gotoAppNavHydrated(page);

        await page.getByRole('button', { name: 'Toggle mobile menu' }).click();
        const drawer = page.getByRole('dialog', { name: 'Mobile navigation' });
        await expect(drawer).toBeVisible();

        // The drawer (z-50) overlays the backdrop (z-40), so a real pointer
        // click at the backdrop's geometric center lands on the drawer.
        // dispatchEvent fires the React onClick handler directly on the
        // intended element regardless of z-order — matching the user
        // intent (tap outside the drawer to close).
        await page.getByTestId('mobile-nav-backdrop').dispatchEvent('click');
        await expect(drawer).toBeHidden();
    });
});
