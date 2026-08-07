/**
 * navigation.mobile.spec.ts — mock-mobile project.
 *
 * Exercises the MobileNav chrome on a narrow viewport (Pixel 5 via
 * playwright.config.ts mock-mobile project): hamburger is visible, desktop
 * nav is hidden, drawer opens and closes, and navigation closes the drawer.
 */
import { test, expect, type Page } from '@playwright/test';
import { NAV_LINKS } from '../../components/shared/navLinks';
import { waitForReactHydration } from './test-helpers';

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

test.describe('Mobile navigation (Pixel 5)', () => {
    test('hamburger is visible and desktop nav is hidden', async ({ page }) => {
        await gotoAppNavHydrated(page);

        const hamburger = page.getByRole('button', { name: 'Toggle mobile menu' });
        await expect(hamburger).toBeVisible();

        // Desktop nav container is CSS-hidden below the md breakpoint. Assert
        // it is ATTACHED first — toBeHidden() passes vacuously for a testid
        // that doesn't exist, which is how a rename made this assertion
        // meaningless once before (desktop-nav → desktop-nav-app).
        const desktopNav = page.getByTestId('desktop-nav-app');
        await expect(desktopNav).toBeAttached();
        await expect(desktopNav).toBeHidden();
    });

    test('clicking hamburger opens the drawer, close button closes it', async ({ page }) => {
        await gotoAppNavHydrated(page);

        const hamburger = page.getByRole('button', { name: 'Toggle mobile menu' });
        await hamburger.click();

        const drawer = page.getByRole('dialog', { name: 'Mobile navigation' });
        await expect(drawer).toBeVisible();

        // Drawer must list every registered nav link
        for (const link of NAV_LINKS) {
            await expect(drawer.getByRole('link', { name: link.label })).toHaveAttribute('href', link.href);
        }

        await page.getByRole('button', { name: 'Close menu' }).click();
        await expect(drawer).toBeHidden();
    });

    test('clicking a drawer link navigates and closes the drawer', async ({ page }) => {
        await gotoAppNavHydrated(page);

        await page.getByRole('button', { name: 'Toggle mobile menu' }).click();
        const drawer = page.getByRole('dialog', { name: 'Mobile navigation' });
        await expect(drawer).toBeVisible();

        await drawer.getByRole('link', { name: 'Clauses', exact: true }).click();

        await expect(page).toHaveURL(/\/clauses$/);
        // useEffect on pathname change closes the drawer
        await expect(drawer).toBeHidden({ timeout: 5000 });
    });

    // Wayfinding is comprehension. The marketing tier's desktop nav is the
    // three-doorway publication row; on mobile that row was the ONLY way in, so
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
        for (const [label, href] of [
            ['Physics', '/physics'],
            ['Papers', '/papers'],
            ['Clauses', '/clauses'],
            ['Agents', '/agents'],
        ] as const) {
            await expect(
                drawer.getByRole('link', { name: label }),
                `${label} is reachable from the marketing drawer`,
            ).toHaveAttribute('href', href);
        }

        // Section headers group the map (same shape as the (app) drawer).
        await expect(drawer.getByText('Protocol', { exact: true }).first()).toBeVisible();

        // And it navigates, closing behind itself.
        await drawer.getByRole('link', { name: 'Physics' }).click();
        await expect(page).toHaveURL(/\/physics$/);
        await expect(drawer).toBeHidden({ timeout: 5000 });
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
