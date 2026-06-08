/**
 * sellers-onboarding.devnet.spec.ts
 *
 * SELLER REGISTRATION WIZARD (lifecycle Phase 2) — the UI test that a wallet can
 * register as a seller through the real 6-step wizard: identity → catalogue →
 * assemblies → agents → review → publish, ending anchored on `SellerRegistry`,
 * pinned to IPFS, and surfacing on `/s/[seller]` and `/discover`.
 *
 * Scope: ONE seller, the wizard, the on-chain registration. Nothing else. It uses
 * a dedicated wallet (anvil[13]) that no other test registers, so the wizard
 * genuinely runs, and it adopts NO assembly — which keeps it standalone (no
 * scenario/assembly prerequisite). This test has nothing to do with how other
 * tests get sellers on-chain: runtime specs DISCOVER sellers from SellerRegistry
 * → IPFS, never from here.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + the dev server.
 */
import { expect } from "@playwright/test";
import { test, gotoAsWallet } from "./devnet-multi-test";
import { createPublicClient, defineChain, http, parseAbi, type Hex } from "viem";
import { assertPinnedInIpfs, readLocalDeploymentConfig } from "./devnet-helpers";

const RPC_URL = "http://127.0.0.1:8545";
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: "Localhost",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

const SELLER_REGISTRY_ABI = parseAbi([
    "event SellerRegistered(address indexed seller, string metadataURI)",
]);

// The wizard-test seller — this test's own input data. anvil[13]: an unlocked
// signer outside the buyer range (0..4) and outside every other test's seller
// set, so the wizard always runs (the wallet is never pre-registered elsewhere).
const SELLER = {
    address: "0x1cbd3b2770909d4e10f157cabc84c7264073c9ec" as Hex,
    name: "Wizard Test Bakery",
    specialty: "test bakery",
    geohash: "9q8yyk8yu",
    product: { name: "Sourdough loaf", price: "1" },
};

async function waitForSellersReady(page: import("@playwright/test").Page) {
    await page.waitForFunction(
        () => {
            const bodyText = document.body.textContent || "";
            if (bodyText.includes("Loading…")) return false;
            return bodyText.includes("Register as an seller.")
                || bodyText.includes("View public profile");
        },
        null,
        { timeout: 60_000 },
    );
}

/** Walk the registration wizard 1→6 as the seller's wallet and register on-chain. */
async function onboardViaWizard(page: import("@playwright/test").Page) {
    await gotoAsWallet(page, SELLER.address, "/sellers");
    await waitForSellersReady(page);
    await page.goto("/sellers/identity", { waitUntil: "domcontentloaded" });

    // Step 2 — Identity
    await expect(page.locator("#profile-name")).toBeVisible({ timeout: 30_000 });
    await page.locator("#profile-name").fill(SELLER.name);
    await page.locator("#profile-specialty").fill(SELLER.specialty);
    await page.locator("#profile-geohash").fill(SELLER.geohash);
    await page.getByRole("button", { name: /\+ MOCK$/ }).click();
    await page.locator('input[name="defaultTokenAddress"]').first().check();
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/sellers\/catalogue/);

    // Step 3 — Catalogue: one product
    await page.locator('[id^="item-"][id$="-name"]').first().fill(SELLER.product.name);
    await page.locator('[id^="item-"][id$="-price"]').first().fill(SELLER.product.price);
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/sellers\/assemblies/);

    // Step 4 — Assemblies: adopt none (standalone wizard test — no scenario dep)
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/sellers\/agents/);

    // Step 5 — Agents: skip
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.waitForURL(/\/sellers\/review/, { timeout: 30_000 });

    // Step 6 — Review + publish (pin catalogue + profile → register tx)
    await expect(page.getByText(SELLER.name)).toBeVisible();
    await page.getByTestId("review-confirm-publish").click();
    await expect(page.getByRole("heading", { name: /Registered\.|Profile updated/i }))
        .toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: /Continue to dashboard/ }).click();
    await page.waitForURL(/\/sellers$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1, name: SELLER.name })).toBeVisible({ timeout: 15_000 });
}

// Wizard + IPFS pin + register tx + multi-page reads.
test.setTimeout(240_000);

test.describe("seller registration wizard (devnet)", () => {
    test("a wallet registers through the wizard — anchored on SellerRegistry, pinned, surfacing", async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const sellerRegistry = (process.env.NEXT_PUBLIC_SELLER_REGISTRY ?? config.sellerRegistry) as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        // Mainnet semantics: a seller registers ONCE and persists. Walk the wizard
        // only if this wallet isn't already registered (re-runnable on a persisted devnet).
        const already = await publicClient.getContractEvents({
            address: sellerRegistry, abi: SELLER_REGISTRY_ABI, eventName: "SellerRegistered",
            args: { seller: SELLER.address }, fromBlock: 0n,
        });
        if (already.length === 0) {
            await onboardViaWizard(page);
        }

        // ── Anchored on SellerRegistry, profile URI on IPFS ─────────────────
        const events = await publicClient.getContractEvents({
            address: sellerRegistry, abi: SELLER_REGISTRY_ABI, eventName: "SellerRegistered",
            args: { seller: SELLER.address }, fromBlock: 0n,
        });
        expect(events.length).toBeGreaterThanOrEqual(1);
        const profileURI = events[events.length - 1].args.metadataURI as string;
        expect(profileURI).toMatch(/^ipfs:\/\//);

        // ── Pinned in IPFS — proof of persistence ───────────────────────────
        await assertPinnedInIpfs(profileURI.slice("ipfs://".length));

        // ── Surfaces where a buyer finds it: its page + /discover ───────────
        await page.goto(`/s/${SELLER.address}?e2e=devnet`, { waitUntil: "domcontentloaded" });
        const detail = page.getByTestId("seller-detail-view");
        try {
            await detail.waitFor({ state: "visible", timeout: 30000 });
        } catch {
            await page.reload({ waitUntil: "domcontentloaded" });
            await detail.waitFor({ state: "visible", timeout: 30000 });
        }
        await expect(detail).toContainText(SELLER.name);
        await expect(detail).toContainText(SELLER.product.name);

        await page.goto("/discover?e2e=devnet", { waitUntil: "domcontentloaded" });
        const cards = page.getByTestId("seller-card");
        await expect(cards.first()).toBeVisible({ timeout: 30000 });
        await expect(
            cards.filter({ hasText: SELLER.name }).first(),
            `seller "${SELLER.name}" should surface on /discover`,
        ).toBeVisible({ timeout: 15000 });
    });
});
