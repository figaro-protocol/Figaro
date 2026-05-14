/**
 * operators-onboarding.devnet.spec.ts
 *
 * Devnet happy-path walkthrough of the operator-registration wizard
 * against deployed contracts on local Anvil. Anvil account[0] walks
 * the wizard 1→6, pins to IPFS, dispatches register, and lands on
 * the registered dashboard at /operators.
 *
 * Requires:
 *   - Anvil up on http://127.0.0.1:8545
 *   - `./deploy-local.sh` complete (NEXT_PUBLIC_* in frontend/.env.local)
 *   - IPFS (Kubo) up on http://127.0.0.1:5001 with CORS allowing
 *     http://localhost:3100 (Playwright origin)
 */
import { expect } from "@playwright/test";
import { test, ANVIL_ACCOUNTS } from "./devnet-multi-test";
import { evmRevert, evmSnapshot } from "./devnet-helpers";

const OPERATOR = ANVIL_ACCOUNTS[0];

let chainSnapshot: string;
test.beforeAll(async () => {
    chainSnapshot = await evmSnapshot();
});
test.afterAll(async () => {
    await evmRevert(chainSnapshot);
});

// Wait until OperatorLanding's `mounted` is true and the welcome view
// has rendered. The Loading… card disappears once `mounted` flips.
async function waitForOperatorsReady(page: import("@playwright/test").Page) {
    await page.waitForFunction(
        () => {
            const bodyText = document.body.textContent || "";
            if (bodyText.includes("Loading…")) return false;
            return bodyText.includes("Register as an operator.")
                || bodyText.includes("View public profile");
        },
        null,
        { timeout: 60_000 },
    );
}

// Dev-mode Next.js compiles routes on first hit; the whole flow plus
// IPFS pin + register tx easily exceeds Playwright's 60s default. Give
// it room.
test.setTimeout(180_000);

test.describe("operator wizard — devnet happy path", () => {
    test("walks 1→6 and registers the wallet on-chain", async ({ page }) => {
        // Step 0: entry. /operators conditionally renders welcome
        // (unregistered) or dashboard (registered). Fresh Anvil = welcome.
        // Dev-mode compile of /operators on first hit can be slow (10-20s).
        await page.goto("/operators", { waitUntil: "domcontentloaded" });
        await waitForOperatorsReady(page);

        // Navigate to /operators/identity directly. Click-the-Begin-button
        // is flaky because <Link><Button> renders <a><button>, which is
        // invalid HTML; click bubbling doesn't navigate consistently. The
        // goto exercises the same client-side route.
        await page.goto("/operators/identity", { waitUntil: "domcontentloaded" });

        // ── Step 2: Identity ──
        // The form renders #profile-name only when isConnected. Waiting
        // for the input doubles as the wallet-ready check for this page.
        await expect(page.locator("#profile-name")).toBeVisible({ timeout: 30_000 });

        const name = `Test Operator ${Date.now()}`;
        await page.locator("#profile-name").fill(name);

        // Description (optional but helpful)
        await page.locator("#profile-description").fill("Devnet wizard happy-path test");

        // Specialty (optional)
        await page.locator("#profile-specialty").fill("e2e");

        // Add the deployed MOCK token via quick-add chip
        await page.getByRole("button", { name: /\+ MOCK$/ }).click();

        // Select the freshly-added MOCK token as the default pricing token.
        // Default-token radio buttons appear once at least one valid token
        // is on the form. The radio has name="defaultTokenAddress".
        await page.locator('input[name="defaultTokenAddress"]').first().check();

        // Next → /operators/catalogue
        await page.getByRole("button", { name: /^Next/ }).click();
        await expect(page).toHaveURL(/\/operators\/catalogue/);

        // ── Step 3: Catalogue ──
        // The form starts with one empty item row. Fill name + price.
        await page.locator('[id^="item-"][id$="-name"]').first().fill("Test item");
        await page.locator('[id^="item-"][id$="-price"]').first().fill("1");

        await page.getByRole("button", { name: /^Next/ }).click();
        await expect(page).toHaveURL(/\/operators\/assemblies/);

        // ── Step 4: Assemblies (optional, no published assemblies on a
        // fresh devnet) — proceed without selecting anything
        await page.getByRole("button", { name: /^Next/ }).click();
        await expect(page).toHaveURL(/\/operators\/agents/);

        // ── Step 5: Agents (optional, skip for human-driven wallet) ──
        await page.getByRole("button", { name: /^Next/ }).click();
        // /operators/review compiles on first hit — give dev server time.
        await page.waitForURL(/\/operators\/review/, { timeout: 30_000 });

        // ── Step 6: Review ──
        // Preview should show the operator name + accepted-token entry
        await expect(page.getByText("Preview · pending publish")).toBeVisible();
        await expect(page.getByText(name)).toBeVisible();
        await expect(page.getByText("MOCK")).toBeVisible();

        // Publish chain: pin catalogue → pin profile → simulate →
        // register tx → wait for receipt → render the receipt card.
        // The simulate step (see usePublishOperatorProfile) is what
        // makes a wrong-deposit failure surface as a typed error
        // instead of an indefinite hang on a silent on-chain revert.
        await page.getByTestId("review-confirm-publish").click();

        // Receipt card appears with the tx hash. The receipt persists
        // until the operator clicks Continue (no auto-redirect — the
        // operator needs to see the receipt before the page transitions).
        await expect(page.getByRole("heading", { name: /Registered\.|Profile updated/i })).toBeVisible({ timeout: 60_000 });
        await expect(page.getByText("Transaction")).toBeVisible();

        // Continue → dashboard
        await page.getByRole("button", { name: /Continue to dashboard/ }).click();
        await page.waitForURL(/\/operators$/, { timeout: 15_000 });

        // Dashboard shows the registered operator's name + "View public profile" link.
        await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole("link", { name: /View public profile/ })).toBeVisible();
        await expect(page.getByRole("link", { name: /View public profile/ })).toHaveAttribute(
            "href",
            `/m/${OPERATOR}`,
        );
    });
});
