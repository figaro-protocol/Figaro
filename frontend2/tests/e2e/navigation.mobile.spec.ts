/**
 * navigation.mobile.spec.ts — mock-mobile project.
 *
 * Exercises the MobileNav chrome on a narrow viewport (Pixel 5 via
 * playwright.config.ts mock-mobile project): hamburger is visible, desktop
 * nav is hidden, drawer opens and closes, and navigation closes the drawer.
 */
import { test, expect } from '@playwright/test';
import { NAV_LINKS } from '../../components/shared/navLinks';

test.describe('Mobile navigation (Pixel 5)', () => {
    test('hamburger is visible and desktop nav is hidden', async ({ page }) => {
        await page.goto('/terminal?e2e=mock', { waitUntil: 'load' });

        const hamburger = page.getByRole('button', { name: 'Toggle mobile menu' });
        await expect(hamburger).toBeVisible();

        // Desktop nav container is CSS-hidden below the md breakpoint.
        await expect(page.getByTestId('desktop-nav')).toBeHidden();
    });

    test('clicking hamburger opens the drawer, close button closes it', async ({ page }) => {
        await page.goto('/terminal?e2e=mock', { waitUntil: 'load' });

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
        await page.goto('/terminal?e2e=mock', { waitUntil: 'load' });

        await page.getByRole('button', { name: 'Toggle mobile menu' }).click();
        const drawer = page.getByRole('dialog', { name: 'Mobile navigation' });
        await expect(drawer).toBeVisible();

        await drawer.getByRole('link', { name: 'Builders' }).click();

        await expect(page).toHaveURL(/\/builders$/);
        // useEffect on pathname change closes the drawer
        await expect(drawer).toBeHidden({ timeout: 5000 });
    });

    test('backdrop click closes the drawer', async ({ page }) => {
        await page.goto('/terminal?e2e=mock', { waitUntil: 'load' });

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
