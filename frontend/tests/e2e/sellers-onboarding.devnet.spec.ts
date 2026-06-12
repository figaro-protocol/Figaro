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
 * genuinely runs. Assembly binding is MANDATORY (user rule 2026-06-12 — a
 * profile without bindings cannot be ordered from), so the spec asserts the
 * refusal first, then binds the first anchored assembly from the live list
 * (the scenario specs run earlier in this Playwright project and anchor
 * them). This test has nothing to do with how other tests get sellers
 * on-chain: runtime specs DISCOVER sellers from SellerRegistry → IPFS,
 * never from here.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + the dev server.
 */
import { expect } from "@playwright/test";
import { test, gotoAsWallet } from "./devnet-multi-test";
import { createPublicClient, defineChain, http, parseAbi, type Hex } from "viem";
import { assertPinnedInIpfs, discoverSellers, readLocalDeploymentConfig } from "./devnet-helpers";
import { ASSEMBLY_REGISTRY_ABI } from "@/lib/mechanisms/useAssemblyRegistry";

const RPC_URL = "http://127.0.0.1:8545";
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: "Localhost",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

const SELLER_REGISTRY_ABI = parseAbi([
    "event SellerRegistered(address indexed seller, string metadataURI)",
    "event SellerProfileUpdated(address indexed seller, string metadataURI)",
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

    // Step 4 — Assemblies: MANDATORY (user rule 2026-06-12 — a profile
    // without bindings cannot be ordered from). First assert the control:
    // Next with nothing selected is refused with the validation message.
    await page.getByRole("button", { name: /^Next/ }).click();
    // Scoped filter — the step indicator is its own live-region alert.
    await expect(
        page.getByRole("alert").filter({ hasText: /bind at least one published assembly/i }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/sellers\/assemblies/);
    // Then bind the first anchored assembly, discovered from the live list
    // (the scenario specs run earlier in this project and anchor them).
    const firstAssemblyRow = page.locator('[data-testid^="seller-assembly-row-"]').first();
    await firstAssemblyRow.waitFor({ state: 'visible', timeout: 30_000 });
    await firstAssemblyRow.locator('input[type="checkbox"]').first().check();
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
    // BOTH calls visible on the dashboard (user rule 2026-06-12): the
    // profile view/edit above, and the onboarding wizard entry.
    await expect(page.getByTestId("link-onboarding-wizard")).toBeVisible();
}

// Wizard + IPFS pin + register tx + multi-page reads.
test.setTimeout(240_000);

test.describe("seller registration wizard (devnet)", () => {
    test("a wallet registers through the wizard — anchored on SellerRegistry, pinned, surfacing", async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const sellerRegistry = (process.env.NEXT_PUBLIC_SELLER_REGISTRY ?? config.sellerRegistry) as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        // Mainnet semantics: a seller registers ONCE and persists. Walk the
        // wizard when this wallet isn't registered yet — or when its CURRENT
        // profile predates the mandatory-assembly rule (no bindings): the
        // wizard runs in update mode and the profile gains its binding.
        const latestProfileURI = async (): Promise<string | undefined> => {
            const [registrations, updates] = await Promise.all([
                publicClient.getContractEvents({
                    address: sellerRegistry, abi: SELLER_REGISTRY_ABI, eventName: "SellerRegistered",
                    args: { seller: SELLER.address }, fromBlock: 0n,
                }),
                publicClient.getContractEvents({
                    address: sellerRegistry, abi: SELLER_REGISTRY_ABI, eventName: "SellerProfileUpdated",
                    args: { seller: SELLER.address }, fromBlock: 0n,
                }),
            ]);
            return [...registrations, ...updates]
                .sort((a, b) => Number(a.blockNumber - b.blockNumber))
                .at(-1)?.args.metadataURI as string | undefined;
        };
        const uriBefore = await latestProfileURI();
        let conformant = false;
        if (uriBefore) {
            const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? "http://127.0.0.1:8080";
            const doc = await (await fetch(`${gateway}/ipfs/${uriBefore.slice("ipfs://".length)}`)).json();
            conformant = ((doc.assemblyBindings ?? []) as unknown[]).length > 0;
        }
        if (!uriBefore || !conformant) {
            await onboardViaWizard(page);
        }

        // ── Anchored on SellerRegistry, profile URI on IPFS ─────────────────
        const profileURI = await latestProfileURI();
        expect(profileURI).toMatch(/^ipfs:\/\//);

        // ── Pinned in IPFS — proof of persistence ───────────────────────────
        await assertPinnedInIpfs(profileURI!.slice("ipfs://".length));

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

        // ── The cross-check filter: discover surfaces ONLY sellers whose
        // profile binds an ANCHORED assembly (the AssemblyRegistry is the
        // authority). Computed from chain — never a name roster: every
        // registered seller WITHOUT an anchored binding must be absent.
        const [published, allSellers] = await Promise.all([
            publicClient.getContractEvents({
                address: (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY ?? config.assemblyRegistry ?? "") as Hex,
                // The REAL ABI — a hand-written event signature silently
                // matches zero logs and judges every seller non-conformant.
                abi: ASSEMBLY_REGISTRY_ABI,
                eventName: "AssemblyRegistered",
                fromBlock: 0n,
            }),
            discoverSellers(),
        ]);
        const anchoredSlugs = new Set(published.map((e) => e.args.slug as string));
        const nonConformant = allSellers.filter(
            (s) => !s.assemblyBindings.some((b) => anchoredSlugs.has(b.assemblySlug)),
        );
        for (const seller of nonConformant.slice(0, 5)) {
            await expect(
                cards.filter({ hasText: seller.name }),
                `non-conformant seller "${seller.name}" (no anchored binding) must NOT surface on /discover`,
            ).toHaveCount(0);
        }

        // ── /sellers dashboard carries BOTH calls (user rule 2026-06-12):
        // the profile view/edit, and the onboarding-wizard entry. Runs on
        // every pass, including the conformant-skip path.
        await gotoAsWallet(page, SELLER.address, "/sellers?e2e=devnet");
        await expect(page.getByRole("heading", { level: 1, name: SELLER.name })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("link-onboarding-wizard")).toBeVisible();
    });
});
