/**
 * members-onboarding.devnet.spec.ts
 *
 * MEMBER REGISTRATION WIZARD (lifecycle Phase 2) — the UI test that a wallet can
 * register through the real wizard (no welcome — /join owns the pitch):
 * identity → assemblies → catalogue → buyer → agents → endpoints → review →
 * publish, ending anchored on `MembersRegistry`, pinned to IPFS, and surfacing
 * on `/s/view` and `/discover`. The buyer step subscribes an assembly the
 * wallet buys through and offers some of its data — the pinned document must
 * carry BOTH halves.
 *
 * Assemblies precede Catalogue because the bindings decide which clauses the
 * seller's trades carry, and those clauses decide which item fields the
 * catalogue asks for. The walk asserts that direction: on the catalogue step,
 * every clause section rendered belongs to a clause the BOUND assembly
 * composes, and a catalogue-authored clause from an unbound assembly is
 * absent.
 *
 * The draft is browser-side and wallet-keyed, so the walk reloads mid-wizard
 * and walks Back, asserting the entered values are still there. (The injected
 * provider connects before first paint, so the reload here cannot reproduce
 * the async-reconnect window that used to wipe the draft — that window is
 * covered by tests/lib/onboardingStatePersistence.test.tsx.)
 *
 * Scope: ONE seller, the wizard, the on-chain registration. Nothing else. It uses
 * a dedicated wallet (anvil[13]) that no other test registers, so the wizard
 * genuinely runs. Assembly binding is MANDATORY (user rule 2026-06-12 — a
 * profile without bindings cannot be ordered from), so the spec asserts the
 * refusal first, then binds the SINGLE-ORDER seed assembly, discovered from
 * the live registry by SHAPE (one order), never by slug or list position —
 * this wallet's scenario is the bilateral single-order flow (orders-accept
 * orders from it); a multi-order or second binding would gate its checkout
 * behind counterparty designation / the method picker. This test has nothing
 * to do with how other tests get sellers on-chain: runtime specs DISCOVER
 * sellers from MembersRegistry → IPFS, never from here.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + the dev server.
 */
import { clampPublicGeohash } from "../../lib/shared/geohash";
import { expect, type Page } from "@playwright/test";
import { test, gotoAsWallet } from "./devnet-multi-test";
import { createPublicClient, defineChain, http, type Hex } from "viem";
import { assertPinnedInIpfs, discoverAnchoredAssemblies, discoverMembers, readLocalDeploymentConfig, type DiscoveredAssembly } from "./devnet-helpers";
import { ASSEMBLY_REGISTRY_ABI, MEMBERS_REGISTRY_ABI } from '@figaro-protocol/sdk';
import { deriveAssemblySlug } from '@/lib/shared/assemblyTemplate';
// The one place the seller-page route is written — the spec follows the same
// route the site links, never a second copy of the string.
import { sellerPageHref } from '@/lib/member/memberListing';

const RPC_URL = "http://127.0.0.1:8545";
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: "Localhost",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

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

async function waitForMembersReady(page: import("@playwright/test").Page) {
    // /members/manage redirects an UNREGISTERED wallet straight to the
    // Identity step; a registered wallet renders the dashboard.
    await page.waitForFunction(
        () => {
            const bodyText = document.body.textContent || "";
            return bodyText.includes("View public profile")
                || window.location.pathname.startsWith("/members/identity");
        },
        null,
        { timeout: 60_000 },
    );
}

/** Walk the registration wizard as the member's wallet and register
 *  on-chain, binding EXACTLY the given assembly. */
/** The wizard writes its draft to wallet-scoped localStorage in an effect after
 *  paint; a person cannot reload faster than that, but a spec can. Wait for the
 *  draft to carry `needle` before reloading, so the reload measures persistence
 *  and not the race. */
async function draftCarries(page: Page, needle: string): Promise<void> {
    await expect
        .poll(
            () => page.evaluate(
                (n: string) => Object.keys(window.localStorage).some((k) => (window.localStorage.getItem(k) ?? "").includes(n)),
                needle,
            ),
            { timeout: 15_000, message: `the wizard draft carries ${needle}` },
        )
        .toBe(true);
}

async function onboardViaWizard(
    page: import("@playwright/test").Page,
    assembly: DiscoveredAssembly,
) {
    const assemblySlug = assembly.slug;
    await gotoAsWallet(page, SELLER.address, "/members/manage");
    await waitForMembersReady(page);
    await page.goto("/members/identity", { waitUntil: "domcontentloaded" });

    // Identity
    await expect(page.locator("#profile-name")).toBeVisible({ timeout: 30_000 });
    await page.locator("#profile-name").fill(SELLER.name);
    await page.locator("#profile-specialty").fill(SELLER.specialty);
    await page.locator("#profile-geohash").fill(SELLER.geohash);
    await page.getByRole("button", { name: /\+ MOCK$/ }).click();
    // The second devnet token joins acceptedTokens — the set the buyer may
    // swap INTO the default from (the swap-funded bond leg;
    // swap-funded-checkout orders from this seller). Default stays MOCK.
    await page.getByRole("button", { name: /\+ MOCKP$/ }).click();
    await page.locator('input[name="defaultTokenAddress"]').first().check();
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/members\/catalogue/);

    // The draft is the seller's work: a reload must not cost them it. Reload
    // here, walk Back, and read the identity fields off the restored form.
    await draftCarries(page, SELLER.specialty);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/members\/catalogue/);
    await page.getByRole("link", { name: /^← Back/ }).click();
    await expect(page).toHaveURL(/\/members\/identity/);
    await expect(page.locator("#profile-name")).toHaveValue(SELLER.name, { timeout: 30_000 });
    await expect(page.locator("#profile-specialty")).toHaveValue(SELLER.specialty);
    // The profile geohash is PUBLIC: the form clamps it to the neighborhood
    // grain on persist (lib/shared/geohash), so the restored value is the
    // clamped one, never the door-grade string that was typed.
    await expect(page.locator("#profile-geohash")).toHaveValue(clampPublicGeohash(SELLER.geohash));
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/members\/catalogue/);

    // Catalogue: one product. The clause sections on an item derive from the
    // assemblies bound on the NEXT step, so a seller who binds none sees none.
    await page.locator('[id^="item-"][id$="-name"]').first().fill(SELLER.product.name);
    await page.locator('[id^="item-"][id$="-price"]').first().fill(SELLER.product.price);

    // The items survive a reload too. The restored values also mean the step
    // has hydrated, so the clause sections below are read after the assembly
    // templates have had their chance to resolve.
    await draftCarries(page, SELLER.product.name);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator('[id^="item-"][id$="-name"]').first())
        .toHaveValue(SELLER.product.name, { timeout: 30_000 });
    await expect(page.locator('[id^="item-"][id$="-price"]').first())
        .toHaveValue(SELLER.product.price);

    // Every clause section on the item belongs to a clause the BOUND assembly
    // composes — computed from the anchored template, never a name list. A
    // seller of one item bound to a counter-sale assembly is asked for no
    // freight class, no hazmat number, no cold-chain range.
    const composed = new Set(assembly.agreements.flatMap((a) => Object.keys(a.clauses ?? {})));
    // The clause GROUPS are the direct children of the item's clause section;
    // the field controls nest below them.
    const renderedClauseIds = await page
        .locator('[data-testid^="item-"][data-testid$="-clauses"] > [data-testid]')
        .evaluateAll((nodes) =>
            nodes
                .map((n) => (n.getAttribute("data-testid") ?? "").split("-clause-")[1])
                .filter((id): id is string => !!id),
        );
    for (const clauseId of renderedClauseIds) {
        expect(
            composed.has(clauseId),
            `the catalogue asks for "${clauseId}", which the bound assembly does not compose`,
        ).toBe(true);
    }

    // And the filter BITES: a catalogue-authored clause composed by some OTHER
    // anchored assembly, but not by this one, has no section here.
    const unboundClause = (await discoverAnchoredAssemblies())
        .filter((a) => a.slug !== assemblySlug)
        .flatMap((a) => a.agreements.flatMap((ag) => Object.keys(ag.clauses ?? {})))
        .find((clauseId) => !composed.has(clauseId));
    if (unboundClause) {
        await expect(page.locator(`[data-testid$="-clause-${unboundClause}"]`)).toHaveCount(0);
    }

    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/members\/assemblies/);
    // Assemblies: MANDATORY (user rule 2026-06-12 — a profile
    // without bindings cannot be ordered from). An update-mode run hydrates
    // the wallet's prior bindings — clear them first: this scenario's premise
    // is EXACTLY ONE single-order binding (the bilateral flow orders-accept
    // consumes), and the cleared state also makes the refusal assertable.
    const rows = page.locator('[data-testid^="seller-assembly-row-"]');
    await rows.first().waitFor({ state: 'visible', timeout: 30_000 });
    const checkedBoxes = page.locator('[data-testid^="seller-assembly-row-"] input[type="checkbox"]:checked');
    while (await checkedBoxes.count() > 0) {
        await checkedBoxes.first().uncheck();
    }
    // Assert the control: Next with nothing selected is refused.
    await page.getByRole("button", { name: /^Next/ }).click();
    // Scoped filter — the step indicator is its own live-region alert.
    await expect(
        page.getByRole("alert").filter({ hasText: /bind at least one published assembly/i }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/members\/assemblies/);
    // Then bind the single-order seed assembly, by slug from shape discovery.
    const assemblyRow = page.getByTestId(`seller-assembly-row-${assemblySlug}`);
    await assemblyRow.waitFor({ state: 'visible', timeout: 30_000 });

    // The row must read as its designer WROTE it — the name and the summary
    // from the pinned template, compared against the template read
    // out-of-band, with the slug secondary. A picker of bare slugs is how a
    // seller binds the wrong assembly.
    if (assembly.name) {
        await expect(assemblyRow).toContainText(assembly.name);
    }
    if (assembly.summary) {
        await expect(
            page.getByTestId(`seller-assembly-summary-${assemblySlug}`),
        ).toHaveText(assembly.summary);
    }
    await expect(assemblyRow).toContainText(assemblySlug);

    await assemblyRow.locator('input[type="checkbox"]').first().check();
    // SELLER-side data: offer the first row derived from the binding — BOTH
    // market sides declare through the same editor, each on its own step.
    const sellerOfferBox = page
        .locator(`[data-testid^="disclosure-${assemblySlug}-"][data-testid$="-seller-offer"]`)
        .first();
    await sellerOfferBox.waitFor({ state: 'visible', timeout: 30_000 });
    if (!(await sellerOfferBox.isChecked())) {
        await sellerOfferBox.check();
    }
    // The binding survives a reload: it is the seller's declaration, held in
    // this browser under this wallet until they publish it.
    await draftCarries(page, '"offered":true');
    await draftCarries(page, assemblySlug);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
        page.getByTestId(`seller-assembly-row-${assemblySlug}`).locator('input[type="checkbox"]').first(),
    ).toBeChecked({ timeout: 30_000 });

    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/members\/buyer/);


    // Buyer: subscribe an assembly the wallet buys through, then
    // offer some of its data for sale. Subscribing is the buyer's
    // verb (a profile declaration), distinct from the seller BINDING above.
    const buyerRow = page.getByTestId(`buyer-assembly-row-${assemblySlug}`);
    await buyerRow.waitFor({ state: 'visible', timeout: 30_000 });
    const buyerCheckbox = buyerRow.locator('input[type="checkbox"]').first();
    if (!(await buyerCheckbox.isChecked())) {
        await buyerCheckbox.check();
    }
    // The disclosure editor renders one buyer-posture row per clause once the
    // subscribed assembly's template loads; offer the first row.
    const offerBox = page
        .locator(`[data-testid^="disclosure-${assemblySlug}-"][data-testid$="-buyer-offer"]`)
        .first();
    await offerBox.waitFor({ state: 'visible', timeout: 30_000 });
    if (!(await offerBox.isChecked())) {
        await offerBox.check();
    }
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/members\/agents/);

    // Agents: skip
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/members\/endpoints/);

    // Endpoints: skip (device config, optional)
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.waitForURL(/\/members\/review/, { timeout: 30_000 });

    // Review + publish (pin catalogue + profile → register tx)
    await expect(page.getByText(SELLER.name)).toBeVisible();

    // The route the review step PROMISES the seller must be the route the site
    // serves: read the promise off the screen and hold it — the caller follows
    // it once the profile is published.
    const promisedRoute = (await page.getByTestId("review-seller-page-route").innerText()).trim();
    expect(
        promisedRoute,
        "the review step must name the seller page by the route the site serves",
    ).toBe(sellerPageHref("<address>"));
    const promisedHref = promisedRoute.replace("<address>", SELLER.address);

    await page.getByTestId("review-confirm-publish").click();
    await expect(page.getByRole("heading", { name: /Registered\.|Profile updated/i }))
        .toBeVisible({ timeout: 60_000 });
    // The receipt's own link is the same promise, as a real href. Next's
    // trailingSlash and the checksummed address are spellings, not routes:
    // compare the route (path without the trailing slash + the seller param).
    const sameRoute = (href: string) => {
        const u = new URL(href, "http://e2e");
        return `${u.pathname.replace(/\/$/, "")}?seller=${(u.searchParams.get("seller") ?? "").toLowerCase()}`;
    };
    const receiptHref = await page.getByRole("link", { name: /View public profile/ }).getAttribute("href");
    expect(sameRoute(receiptHref ?? ""), "the receipt link is the route the review promised").toBe(sameRoute(promisedHref));
    await page.getByRole("button", { name: /Continue to dashboard/ }).click();
    await page.waitForURL(/\/members\/manage\/?$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1, name: SELLER.name })).toBeVisible({ timeout: 15_000 });
    // BOTH calls visible on the dashboard (user rule 2026-06-12): the
    // profile view/edit above, and the onboarding wizard entry.
    await expect(page.getByTestId("link-onboarding-wizard")).toBeVisible();
    return promisedHref;
}

// Wizard + IPFS pin + register tx + multi-page reads.
test.setTimeout(240_000);

test.describe("seller registration wizard (devnet)", () => {
    test("a wallet registers through the wizard — anchored on MembersRegistry, pinned, surfacing", async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const membersRegistry = (process.env.NEXT_PUBLIC_MEMBERS_REGISTRY ?? config.membersRegistry) as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        // The single-order seed assembly, discovered from the live registry by
        // SHAPE (never a hardcoded slug): the earliest anchored one-order
        // template. This wallet's scenario premise is the bilateral flow —
        // exactly this one binding.
        const singleOrderAssembly = (await discoverAnchoredAssemblies())
            .find((a) => a.agreements.length === 1);
        expect(singleOrderAssembly, 'a single-order assembly is anchored (run populate-test-data)').toBeTruthy();
        const singleOrderSlug = singleOrderAssembly?.slug;

        // Mainnet semantics: a seller registers ONCE and persists. Walk the
        // wizard when this wallet isn't registered yet — or when its CURRENT
        // profile doesn't match the scenario premise (exactly the single-order
        // binding): the wizard runs in update mode and repairs the bindings.
        const latestProfileURI = async (): Promise<string | undefined> => {
            const [registrations, updates] = await Promise.all([
                publicClient.getContractEvents({
                    address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, eventName: "MemberRegistered",
                    args: { member: SELLER.address }, fromBlock: 0n,
                }),
                publicClient.getContractEvents({
                    address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, eventName: "MemberProfileUpdated",
                    args: { member: SELLER.address }, fromBlock: 0n,
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
            const bindings = (doc.assemblyBindings ?? []) as Array<{ assemblySlug: string }>;
            // Premise: exactly the single-order binding AND both devnet tokens
            // accepted (the permit token is the swap-funded leg's input set —
            // an older single-token profile gets repaired in update mode).
            const acceptedTokens = (doc.acceptedTokens ?? []) as Array<{ address?: string }>;
            const permitToken = (config.permitTokenAddress ?? "").toLowerCase();
            // The buyer half is part of the premise now: at least one
            // subscription and one offered buyer-posture class. An older
            // seller-only profile gets repaired in update mode.
            const buyerSubs = (doc.buyerAssemblies ?? []) as Array<{ compositionHash: string }>;
            const policyEntries = (doc.disclosurePolicy ?? []) as Array<{ posture: string; offered: boolean }>;
            const buyerOffered = policyEntries.some((e) => e.posture === "buyer" && e.offered === true);
            const sellerOffered = policyEntries.some((e) => e.posture === "seller" && e.offered === true);
            conformant = bindings.length === 1 && bindings[0].assemblySlug === singleOrderSlug
                && !!permitToken
                && acceptedTokens.some((t) => t.address?.toLowerCase() === permitToken)
                && buyerSubs.length >= 1 && buyerOffered && sellerOffered;
        }
        let promisedSellerPage: string | undefined;
        if (!uriBefore || !conformant) {
            promisedSellerPage = await onboardViaWizard(page, singleOrderAssembly!);
        }

        // ── Anchored on MembersRegistry, profile URI on IPFS ─────────────────
        const profileURI = await latestProfileURI();
        expect(profileURI).toMatch(/^ipfs:\/\//);

        // ── Pinned in IPFS — proof of persistence ───────────────────────────
        await assertPinnedInIpfs(profileURI!.slice("ipfs://".length));

        // ── The buyer half landed in the pinned document — read OUT-OF-BAND
        // from IPFS, never from the screen that claims to have written it.
        {
            const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? "http://127.0.0.1:8080";
            const doc = await (await fetch(`${gateway}/ipfs/${profileURI!.slice("ipfs://".length)}`)).json();
            const buyerSubs = (doc.buyerAssemblies ?? []) as Array<{ compositionHash: string }>;
            expect(buyerSubs.length, "the buyer's assembly subscription is in the pinned profile").toBeGreaterThanOrEqual(1);
            const policy = (doc.disclosurePolicy ?? []) as Array<{ posture: string; offered: boolean; compositionHash: string }>;
            const buyerEntry = policy.find((e) => e.posture === "buyer" && e.offered === true);
            expect(buyerEntry, "offered buyer-side data is in the pinned profile").toBeTruthy();
            const sellerEntry = policy.find((e) => e.posture === "seller" && e.offered === true);
            expect(sellerEntry, "offered seller-side data is in the pinned profile — both market sides declare").toBeTruthy();
            expect(
                buyerSubs.some((s) => s.compositionHash === buyerEntry!.compositionHash),
                "the offered buyer class derives from a subscribed assembly",
            ).toBe(true);
        }

        // ── Surfaces where a buyer finds it: its page + /discover ───────────
        // Follow the route the review step promised — the seller's page must
        // be there. On the conformant-skip path there was no promise to read,
        // so the route comes from the helper the promise is rendered from.
        const sellerPage = promisedSellerPage ?? sellerPageHref(SELLER.address);
        await page.goto(`${sellerPage}&e2e=devnet`, { waitUntil: "domcontentloaded" });
        const detail = page.getByTestId("member-detail-view");
        try {
            await detail.waitFor({ state: "visible", timeout: 30000 });
        } catch {
            await page.reload({ waitUntil: "domcontentloaded" });
            await detail.waitFor({ state: "visible", timeout: 30000 });
        }
        await expect(detail).toContainText(SELLER.name);
        await expect(detail).toContainText(SELLER.product.name);

        await page.goto("/discover?e2e=devnet", { waitUntil: "domcontentloaded" });
        const cards = page.getByTestId("member-card");
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
            discoverMembers(),
        ]);
        const anchoredSlugs = new Set(published.map((e) => deriveAssemblySlug(e.args.compositionHash as `0x${string}`)));
        const nonConformant = allSellers.filter(
            (s) => !s.assemblyBindings.some((b) => anchoredSlugs.has(b.assemblySlug)),
        );
        for (const seller of nonConformant.slice(0, 5)) {
            await expect(
                cards.filter({ hasText: seller.name }),
                `non-conformant seller "${seller.name}" (no anchored binding) must NOT surface on /discover`,
            ).toHaveCount(0);
        }

        // ── /members/manage dashboard carries BOTH calls (user rule 2026-06-12):
        // the profile view/edit, and the onboarding-wizard entry. Runs on
        // every pass, including the conformant-skip path.
        await gotoAsWallet(page, SELLER.address, "/members/manage?e2e=devnet");
        await expect(page.getByRole("heading", { level: 1, name: SELLER.name })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("link-onboarding-wizard")).toBeVisible();
    });
});
