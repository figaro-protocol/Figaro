/**
 * sellers-onboarding.devnet.spec.ts
 *
 * SELLER ADOPTION (lifecycle Phase 2) — onboards every seller in the SELLER
 * ROSTER (`./seller-roster`) through the REAL registration wizard: each adopts
 * its assemblies, lists its products, and is pinned to IPFS + anchored on
 * `SellerRegistry`. Registration PERSISTS (no snapshot/revert) — exactly as a
 * seller onboards on testnet/mainnet — so the runtime specs (buyer-side) consume
 * these real sellers from chain→IPFS. No seed-replay; this REPLACES
 * `seed-devnet.mjs`'s direct-call seller seeding.
 *
 * This is step 2 of the full pipeline (see seller-roster.ts):
 *   authoring (publish assemblies) → onboarding (THIS) → runtime (buyer buys).
 *
 * Each seller is a distinct wallet (anvil index ≥5), disjoint from the buyer
 * (anvil[0]). Prerequisite: each adopted assembly is already anchored.
 *
 * Mainnet semantics: a seller registers ONCE and persists; the spec is idempotent
 * — if the wallet is already registered it skips the wizard and re-verifies.
 * Every seller is verified anchored + pinned + surfacing on /s and /discover.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + the adopted assemblies published.
 */
import { expect } from "@playwright/test";
import { test, gotoAsWallet } from "./devnet-multi-test";
import {
    createPublicClient,
    defineChain,
    http,
    parseAbi,
    type Hex,
} from "viem";
import {
    assertPinnedInIpfs,
    assertSellerOnDiscovery,
    assertSellerProfileSurfaces,
    readLocalDeploymentConfig,
} from "./devnet-helpers";
import { SELLER_ROSTER, type SellerSpec } from "./seller-roster";

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

/** Walk the registration wizard 1→6 as `spec`'s wallet and register on-chain. */
async function onboardViaWizard(page: import("@playwright/test").Page, spec: SellerSpec) {
    await gotoAsWallet(page, spec.address, "/sellers");
    await waitForSellersReady(page);
    await page.goto("/sellers/identity", { waitUntil: "domcontentloaded" });

    // Step 2 — Identity
    await expect(page.locator("#profile-name")).toBeVisible({ timeout: 30_000 });
    await page.locator("#profile-name").fill(spec.name);
    await page.locator("#profile-specialty").fill(spec.specialty);
    // Seller's home location → profile.location.geohash → the on-site checkout
    // reads it to locate the figaro-geo-v2 origin/destination on the flow graph.
    await page.locator("#profile-geohash").fill(spec.geohash);
    await page.getByRole("button", { name: /\+ MOCK$/ }).click();
    await page.locator('input[name="defaultTokenAddress"]').first().check();
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/sellers\/catalogue/);

    // Step 3 — Catalogue: the first product (the wizard starts with one empty
    // row; roster sellers currently list a single product).
    await page.locator('[id^="item-"][id$="-name"]').first().fill(spec.products[0].name);
    await page.locator('[id^="item-"][id$="-price"]').first().fill(spec.products[0].price);
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/sellers\/assemblies/);

    // Step 4 — Assemblies: adopt each roster assembly (each row is a Card keyed
    // `seller-assembly-row-<slug>` wrapping a checkbox).
    for (const slug of spec.assemblies) {
        const row = page.getByTestId(`seller-assembly-row-${slug}`);
        await row.waitFor({ state: "visible", timeout: 20_000 });
        await row.locator('input[type="checkbox"]').check();
    }
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/sellers\/agents/);

    // Step 5 — Agents: skip
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.waitForURL(/\/sellers\/review/, { timeout: 30_000 });

    // Step 6 — Review + publish (pin catalogue + profile → register tx)
    await expect(page.getByText(spec.name)).toBeVisible();
    await page.getByTestId("review-confirm-publish").click();
    await expect(page.getByRole("heading", { name: /Registered\.|Profile updated/i }))
        .toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: /Continue to dashboard/ }).click();
    await page.waitForURL(/\/sellers$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1, name: spec.name })).toBeVisible({ timeout: 15_000 });
}

// Wizard + IPFS pins + register tx + multi-page reads.
test.setTimeout(240_000);

for (const spec of SELLER_ROSTER) {
    test.describe(`seller adoption — ${spec.name} (devnet)`, () => {
        test(`onboards, adopts [${spec.assemblies.join(", ")}] + a product, persists, surfaces on /s and /discover`, async ({ page }) => {
            const config = readLocalDeploymentConfig();
            const sellerRegistry = (process.env.NEXT_PUBLIC_SELLER_REGISTRY
                ?? config.sellerRegistry) as Hex;
            const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

            const already = await publicClient.getContractEvents({
                address: sellerRegistry,
                abi: SELLER_REGISTRY_ABI,
                eventName: "SellerRegistered",
                args: { seller: spec.address },
                fromBlock: 0n,
            });

            // Mainnet: register ONCE and persist. Onboard only if absent.
            if (already.length === 0) {
                await onboardViaWizard(page, spec);
            }

            // ── Anchored on SellerRegistry, persisted ──────────────────────
            const events = await publicClient.getContractEvents({
                address: sellerRegistry,
                abi: SELLER_REGISTRY_ABI,
                eventName: "SellerRegistered",
                args: { seller: spec.address },
                fromBlock: 0n,
            });
            expect(events.length).toBeGreaterThanOrEqual(1);
            const profileURI = events[events.length - 1].args.metadataURI as string;
            expect(profileURI).toMatch(/^ipfs:\/\//);

            // ── Pinned in IPFS — proof of persistence (same check the assembly runs) ─
            await assertPinnedInIpfs(profileURI.slice("ipfs://".length));

            // ── Surfaces where a buyer finds it: its page + /discover ──────
            await assertSellerProfileSurfaces(page, spec.address, {
                name: spec.name,
                product: spec.products[0].name,
            });
            await assertSellerOnDiscovery(page, spec.name);
        });
    });
}
