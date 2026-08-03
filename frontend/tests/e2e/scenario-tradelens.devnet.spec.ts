/**
 * scenario-tradelens.devnet.spec.ts
 *
 * TRADELENS GENESIS ASSEMBLY — the design-canvas scenario leg (families
 * 6 freight + 7 cold-chain/regulated + 10 cross-border + recourse; the
 * settled composition lives in the project_tradelens_assembly memory;
 * /papers/after-tradelens is NARRATIVE, never spec; shared vocabulary in
 * tradelensScenario.ts — the runtime leg consumes the same artifact).
 *
 * Six orders, importer-of-record as root buyer on every one (kernel star):
 *   order-0 root  shipper-of-record   cargo, incoterms, chain-of-custody,
 *                                     acceptance-criteria, applicable-law,
 *                                     arbitration-kleros, geolocation, modalities
 *   order-1 p:0   inspection service  merchant-process, acceptance-criteria
 *   order-2 p:0   freight forwarder   merchant-process, geolocation
 *   order-3 p:2   ocean carrier       courier-process, cold-chain, chain-of-custody,
 *                 (reefer)            emissions, freight-class, handoff,
 *                                     proximity-policy, geolocation
 *   order-4 p:3   customs agent       merchant-process, consent (affixed filing terms)
 *   order-5 p:4   inland carrier      courier-process, handoff, proximity-policy,
 *                                     geolocation
 *
 * This leg drives the REAL designer UI all the way to the IPFS pin +
 * AssemblyRegistry anchor (persisted — the same publish a builder performs on
 * mainnet; idempotent by SHAPE discovery, never a slug), onboards + binds the
 * six sellers, and checks out as the buyer through SIGN + relay with the
 * derived chain total asserted. The runtime leg
 * (tradelens-runtime.devnet.spec.ts) consumes the anchored artifact and
 * carries the value legs.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { planSubOrderSellers } from '@figaro/sdk';
import { mnemonicToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, type Hex } from 'viem';
import {
    LOCAL_ANVIL,
    RPC_URL,
    confirmAgreementPreviews,
    discoverAnchoredAssemblies,
    readLocalDeploymentConfig,
    memberProfileBindings,
    waitForConnected,
} from './devnet-helpers';
import {
    C,
    CARRIER,
    CUSTOMS,
    DEVICE,
    EXPECTED_TOTAL,
    FORWARDER,
    INLAND,
    INSPECTOR,
    SHIPPER,
    TRADELENS_BUYER as BUYER,
    fillTradelensCheckout,
    findTradelensAssembly,
    seedTradelensSellers,
} from './tradelensScenario';

const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

// Per-node clause plan, keyed by draw order (root first). Parents encode the
// chain: 1←0, 2←0, 3←2, 4←3, 5←4.
const NODE_PLAN: Array<{ parent: number | null; clauses: string[] }> = [
    { parent: null, clauses: [C.cargo, C.incoterms, C.custody, C.acceptance, C.geo, C.modalities] },
    { parent: 0, clauses: [C.merchant, C.acceptance] },
    { parent: 0, clauses: [C.merchant, C.geo] },
    { parent: 2, clauses: [C.courier, C.coldChain, C.custody, C.emissions, C.freightClass, C.handoff, C.proximity, C.geo] },
    { parent: 3, clauses: [C.merchant, C.consent] },
    { parent: 4, clauses: [C.courier, C.handoff, C.proximity, C.geo] },
];

const CONSENT_DOC_TEXT =
    'Customs filing terms — the importer authorizes the agent to file entries on their behalf; the parties accept by signing the agreement root.';

test.describe('TRADELENS SCENARIO — six bonded value-adders, authored on the canvas, anchored, bound, signed (devnet)', () => {
    test.setTimeout(600_000);

    test('the composition publishes once, the six sellers bind, and the buyer signs the whole chain', async ({ page, context }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        await context.grantPermissions(['geolocation']);
        await context.setGeolocation({ latitude: DEVICE.lat, longitude: DEVICE.lon });

        // ── AUTHOR (idempotent): discover by shape; absent → the real canvas. ──
        let slug = await findTradelensAssembly();
        if (!slug) {
            await page.addInitScript(() => {
                try {
                    window.localStorage.removeItem('figaro:designer:current');
                    window.localStorage.removeItem('figaro:designer:drafts');
                } catch { /* noop */ }
            });
            await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
            await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
            await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

            const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
            await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
            const nodeIds: string[] = [
                (await orderNodes.first().getAttribute('data-testid'))!.replace('order-node-', ''),
            ];
            const currentIds = async () => orderNodes.evaluateAll((els) =>
                els.map((el) => el.getAttribute('data-testid')!.replace('order-node-', '')));

            // Draw the five sub-orders in plan order — each add's new id is the
            // set difference, recorded so plan index i ↔ nodeIds[i].
            await orderNodes.first().click();
            await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
            for (let i = 1; i < NODE_PLAN.length; i++) {
                const parentId = nodeIds[NODE_PLAN[i].parent!];
                const before = new Set(await currentIds());
                await page.getByTestId(`btn-add-suborder-${parentId}`).click();
                await expect(orderNodes).toHaveCount(before.size + 1, { timeout: 10000 });
                const after = await currentIds();
                nodeIds.push(after.find((id) => !before.has(id))!);
            }

            // ASSEMBLY TERMS (design.scope: "assembly", ruled 2026-07-28):
            // the dispute clauses compose ONCE in the AssemblyTermsPanel and
            // the DESIGNER authors their values — terms of the composition's
            // identity, folded into every agreement at checkout; never
            // buyer-authored.
            await page.getByTestId(`assembly-terms-clause-${C.law}`).check();
            await page.getByTestId(`assembly-terms-field-${C.law}-applicableLaw`).fill('England-Wales');
            await page.getByTestId(`assembly-terms-clause-${C.kleros}`).check();
            await page.getByTestId(`assembly-terms-field-${C.kleros}-klerosCourt-general`).check();

            // Compose each node's clauses through the drawer's registry tab.
            for (let i = 0; i < NODE_PLAN.length; i++) {
                await page.getByTestId(`drawer-node-tab-${nodeIds[i]}`).click();
                await page.getByTestId('drawer-tab-registry').click();
                await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
                for (const clauseId of NODE_PLAN[i].clauses) {
                    await page.getByTestId(`drawer-registry-clause-${clauseId}`).check();
                }
                if (NODE_PLAN[i].clauses.includes(C.consent)) {
                    // The customs agent's filing terms — affixed through the
                    // repeater (pin → keccak anchor; the only fill path).
                    await page.getByTestId('drawer-field-figaro-consent-documents-add').click();
                    await page.getByTestId('drawer-field-figaro-consent-documents-0-documentHash-affix')
                        .setInputFiles({
                            name: 'customs-filing-terms.txt',
                            mimeType: 'text/plain',
                            buffer: Buffer.from(CONSENT_DOC_TEXT),
                        });
                    await page.getByTestId('drawer-field-figaro-consent-documents-0-documentHash')
                        .waitFor({ state: 'visible', timeout: 30000 });
                    await page.getByTestId('drawer-field-figaro-consent-documents-0-documentVersion').fill('1.0');
                    await page.getByTestId('drawer-field-figaro-consent-documents-0-documentTitle').fill('Customs filing terms');
                }
            }

            await page.getByTestId('designer-name-input').fill('Containerised import chain');
            await page.getByTestId('designer-summary-input').fill('Six bonded value-adders move a reefer container from shipper to consignee.');
            await page.getByTestId('designer-description-input').fill('The TradeLens perimeter as a permissionless bonded composition: shipper, pre-shipment inspection, freight forwarder, reefer ocean carrier, customs agent, and destination inland carrier — each independently bonded, settled atomically by the importer-of-record.');
            await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
            await page.getByTestId('designer-review').click();
            await page.waitForURL(/\/builders\/designer\/view\?slug=asm-/, { timeout: 15000 });
            const handle = page.url().match(/[?&]slug=(asm-[a-z0-9-]+)/)?.[1];
            expect(handle, 'review navigated to a draft handle').toBeTruthy();
            await page.goto(`/builders/designer/view?slug=${handle}&intent=publish&e2e=devnet`, { waitUntil: 'domcontentloaded' });
            const confirmBtn = page.getByTestId('review-confirm-publish');
            await confirmBtn.waitFor({ state: 'visible', timeout: 15000 });
            await waitForConnected(page);
            await confirmBtn.click();
            await page.getByTestId('assembly-publish-receipt').waitFor({ timeout: 60000 });

            slug = await findTradelensAssembly();
            expect(slug, 'the published Tradelens assembly is discoverable by shape').toBeTruthy();
        }

        // ── ONBOARD + BIND the six sellers (idempotent re-assert). ──
        const token = readLocalDeploymentConfig().tokenAddress!;
        expect(token, 'NEXT_PUBLIC_TOKEN_ADDRESS resolves — run ./deploy-local.sh').toBeTruthy();
        await seedTradelensSellers(slug!, token);

        // ── The binding cursor, asserted out-of-band before the UI leg: every
        //    sub-order's seller must resolve, in commit order, from the
        //    shipper's designations — a cursor mismatch stalls checkout with
        //    no visible error, so fail HERE with names instead. ──
        const anchored = (await discoverAnchoredAssemblies()).find((t) => t.slug === slug)!;
        const shipperBindings = await memberProfileBindings(SHIPPER.address as Hex);
        const plan = planSubOrderSellers({
            assemblyTemplate: anchored as never,
            counterpartyBindings: (shipperBindings.find((b) => b.assemblySlug === slug)?.counterpartyBindings ?? [])
                .map((cb) => ({ clauseId: cb.clauseId, addresses: cb.addresses as `0x${string}`[] })),
        });
        expect(plan.map((p) => p.seller?.toLowerCase()), 'five sub-order sellers resolve in commit order').toEqual([
            INSPECTOR.address, FORWARDER.address, CARRIER.address, CUSTOMS.address, INLAND.address,
        ].map((a) => a.toLowerCase()));

        page.on('pageerror', (err) => console.log(`[tradelens][pageerror] ${err.message}`));
        page.on('console', (msg) => {
            if (msg.type() === 'error') console.log(`[tradelens][console.error] ${msg.text()}`);
        });

        // ── FUND the buyer (solvency gate: payment + bond in MOCK). ──
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const minter = createWalletClient({
            account: mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 0 }), chain: LOCAL_ANVIL, transport: http(RPC_URL),
        });
        const mintHash = await minter.writeContract({
            address: token, abi: parseAbi(['function mint(address to, uint256 amount) external']),
            functionName: 'mint', args: [BUYER, parseUnits('1000', 18)],
        });
        await publicClient.waitForTransactionReceipt({ hash: mintHash });

        // ── CHECKOUT: the importer-of-record signs the whole chain. ──
        await gotoAsWallet(page, BUYER, `/s/view?seller=${SHIPPER.address}&e2e=devnet`);
        await page.getByTestId('seller-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        await waitForConnected(page);

        await fillTradelensCheckout(page);

        // The derived chain total the buyer signs — six fixed items.
        await expect(page.getByTestId('checkout-view')).toContainText('8.45', { timeout: 20000 });

        const place = page.getByTestId('btn-place-order');
        await expect(place, 'buyer connected + assembly bound → "Place order"').toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        try {
            await confirmAgreementPreviews(page, 6);
        } catch (cause) {
            // The sign gate rejects silently into a transient toast — surface
            // whatever error text the page holds before rethrowing.
            const alerts = await page.locator('[role="alert"], [data-testid*="error"]').allTextContents();
            const modalOpen = await page.getByTestId('agreement-preview-modal').isVisible().catch(() => false);
            console.log(`[tradelens][stall] modalOpen=${modalOpen} alerts=${JSON.stringify(alerts)}`);
            throw cause;
        }
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
        // Sub-orders auto-relay at sign; the ROOT relays from the share panel
        // — the leg's bar is sign + RELAY.
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });
        expect(EXPECTED_TOTAL).toBe(parseUnits('8.45', 18));
    });
});
