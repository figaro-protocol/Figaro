/**
 * scenario-local-commerce-offset.devnet.spec.ts
 *
 * SCENARIO — `local-commerce-offset` (2 nodes, seller-assigned delivery +
 * GHG emissions disclosure)
 *
 *   Models: the seller-assigned local-commerce delivery, made emissions-aware —
 *   each order carries a GHG disclosure (figaro-ghg-iso-14064-v1), so the
 *   merchant discloses the emissions of preparing the goods and the courier the
 *   emissions of the delivery. The buyer can retire carbon offsets covering the
 *   process emissions before resolving.
 *
 *   Catalogues: merchant (goods) + courier (delivery) — 2.
 *
 *   Template (what the designer publishes; commerce/topology are added at commit
 *   by the projection, not stored here; the figaro-ghg-measurement-v1 companion
 *   is emitted at COMMIT from the disclosure's sisterClauseId, never selected in
 *   the drawer — so it is NOT in the template):
 *
 *     order[0]  buyer ↔ merchant  parents: []
 *       figaro-fulfilment-v2       { modalities: [delivery],
 *                                    delivery: { coordination: [seller-assigned] },
 *                                    handoff: [face-to-face] }
 *       figaro-merchant-process-v1 { }
 *       figaro-ghg-iso-14064-v1    { }       ← the emissions delta
 *     order[1]  buyer ↔ courier   parents: [order-0]
 *       figaro-courier-process-v1  { }
 *       figaro-proximity-policy-v1 { bands: [zone-wifi] }
 *       figaro-ghg-iso-14064-v1    { }       ← the emissions delta
 *
 *   SAME as `local-commerce` (seller-assigned) PLUS a GHG disclosure on each
 *   order. The `scope` field is optional, so the disclosure is composed bare.
 *
 * PHASE 1 of the 2× e2e convention — the design-canvas test. Drives the real
 * designer UI all the way to the IPFS pin AND the on-chain anchor. The publish
 * PERSISTS; the runtime test (`local-commerce-offset-runtime`) then CONSUMES this
 * anchored + pinned assembly via the registry → IPFS.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo.
 */
import { test, expect } from './devnet-multi-test';
import {
    createPublicClient,
    defineChain,
    http,
    keccak256,
    parseAbi,
    toHex,
    type Hex,
} from 'viem';
import {
    assertAssemblyOnInventory,
    assertPinnedInIpfs,
    captureOrGuardAssemblyDocument,
    normalizeAssemblyTemplateOrders,
    readLocalDeploymentConfig,
} from './devnet-helpers';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? 'http://127.0.0.1:8080';

const ASSEMBLY_REGISTRY_ABI = parseAbi([
    'event AssemblyRegistered(bytes32 indexed slugHash, address indexed author, string slug, bytes32 contentHash, string metadataURI)',
]);

test.describe('Author + publish the local-commerce-offset assembly (devnet)', () => {
    // Multi-node draw + multi-route nav + IPFS pin + on-chain tx. NO snapshot —
    // the publish must PERSIST for the runtime test (and /assemblies) to consume.
    test.setTimeout(180_000);

    test('designer canvas authors + publishes local-commerce-offset; it persists, anchored on-chain + pinned in IPFS', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const assemblyRegistry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY
            ?? config.assemblyRegistry) as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        const slug = 'local-commerce-offset';
        // Name must slugify to the slug (DesignerCanvas slugify(name)).
        const draftName = 'Local Commerce Offset';
        const slugHash = keccak256(toHex(slug));

        const alreadyAnchored = await publicClient.getContractEvents({
            address: assemblyRegistry,
            abi: ASSEMBLY_REGISTRY_ABI,
            eventName: 'AssemblyRegistered',
            args: { slugHash },
            fromBlock: 0n,
        });

        if (alreadyAnchored.length === 0) {
            // ── Author via the real designer canvas + publish (pin + anchor) ──
            await page.addInitScript(() => {
                try {
                    window.localStorage.removeItem('figaro:designer:current');
                    window.localStorage.removeItem('figaro:designer:drafts');
                } catch { /* noop */ }
            });
            await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
            await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
            await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

            // Blank seed = one root order (the merchant). Capture its id, then DRAW
            // the courier sub-order under it.
            const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
            await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
            const rootTestId = await orderNodes.first().getAttribute('data-testid');
            const rootId = rootTestId!.replace('order-node-', '');

            await page.getByTestId(`btn-add-suborder-${rootId}`).click();
            await expect(orderNodes).toHaveCount(2, { timeout: 10000 });
            const allTestIds = await orderNodes.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
            const courierId = allTestIds.find((t) => t !== `order-node-${rootId}`)!.replace('order-node-', '');

            // ── Compose the MERCHANT order: delivery (seller-assigned) + handoff +
            //    merchant-process + the GHG emissions disclosure ────────────────
            await page.getByTestId(`order-node-${rootId}`).click();
            await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
            await page.getByTestId('drawer-tab-registry').click();
            await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });

            await page.getByTestId('drawer-registry-clause-figaro-fulfilment-v2').check();
            await page.getByTestId('drawer-field-figaro-fulfilment-v2-modalities-delivery').check();
            const coordination = page.getByTestId('drawer-field-figaro-fulfilment-v2-delivery-coordination-seller-assigned');
            await coordination.waitFor({ state: 'visible', timeout: 5000 });
            await coordination.check();
            await page.getByTestId('drawer-registry-clause-figaro-handoff-v1').check();
            await page.getByTestId('drawer-field-figaro-handoff-v1-handoff-face-to-face').check();
            await page.getByTestId('drawer-registry-clause-figaro-proximity-policy-v1').check();
            await page.getByTestId('drawer-field-figaro-proximity-policy-v1-bands-zone-wifi').check();
            await page.getByTestId('drawer-registry-clause-figaro-merchant-process-v1').check();
            // The emissions disclosure (scope optional → composed bare). Its
            // figaro-ghg-measurement-v1 companion is emitted at COMMIT, not here.
            await page.getByTestId('drawer-registry-clause-figaro-ghg-iso-14064-v1').check();

            // ── Compose the COURIER order: courier-process + hand-off + proximity
            //    + the GHG emissions disclosure ─────────────────────────────────
            await page.getByTestId(`drawer-node-tab-${courierId}`).click();
            await page.getByTestId('drawer-tab-registry').click();
            await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
            await page.getByTestId('drawer-registry-clause-figaro-courier-process-v1').check();
            await page.getByTestId('drawer-registry-clause-figaro-handoff-v1').check();
            await page.getByTestId('drawer-field-figaro-handoff-v1-handoff-face-to-face').check();
            await page.getByTestId('drawer-registry-clause-figaro-proximity-policy-v1').check();
            await page.getByTestId('drawer-field-figaro-proximity-policy-v1-bands-zone-wifi').check();
            await page.getByTestId('drawer-registry-clause-figaro-ghg-iso-14064-v1').check();
            await expect(orderNodes).toHaveCount(2, { timeout: 10000 });

            // Name + publish (fixed slug → "local-commerce-offset").
            await page.getByTestId('designer-name-input').fill(draftName);
            await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
            await page.getByTestId('designer-review').click();

            await page.waitForURL(new RegExp(`/builders/designer/view/${slug}`), { timeout: 15000 });
            await page.goto(
                `/builders/designer/view/${slug}?intent=publish&e2e=devnet`,
                { waitUntil: 'domcontentloaded' },
            );

            const confirmBtn = page.getByTestId('review-confirm-publish');
            await confirmBtn.waitFor({ state: 'visible', timeout: 15000 });
            await page.waitForFunction(
                () => !Array.from(document.querySelectorAll('button'))
                    .some((b) => b.textContent?.trim() === 'Connect Wallet'),
                null,
                { timeout: 30000 },
            );
            await confirmBtn.click();
            await expect(page.getByText(/Published\b/i).first()).toBeVisible({ timeout: 60000 });
        }

        // ── It is anchored on-chain — PERSISTED, exactly one registration ──
        const events = await publicClient.getContractEvents({
            address: assemblyRegistry,
            abi: ASSEMBLY_REGISTRY_ABI,
            eventName: 'AssemblyRegistered',
            args: { slugHash },
            fromBlock: 0n,
        });
        expect(events.length).toBe(1);
        const metadataURI = events[0].args.metadataURI as string;
        expect(metadataURI).toMatch(/^ipfs:\/\//);

        // ── It is PINNED in IPFS ────────────────────────────────────────────
        const cid = metadataURI.slice('ipfs://'.length);
        await assertPinnedInIpfs(cid);

        // ── It is the correct no-hash 2-node template ──────────────────────
        const assemblyDoc = await (await fetch(`${IPFS_GATEWAY}/ipfs/${cid}`)).json() as {
            slug: string;
            name: string;
            orders: Array<{
                id: string;
                clauses: Record<string, Record<string, unknown>>;
            }>;
        };
        expect(assemblyDoc.slug).toBe(slug);
        expect(assemblyDoc.orders).toHaveLength(2);
        const [root, courier] = assemblyDoc.orders;

        // order[0] — the merchant: delivery (seller-assigned) + merchant-process +
        // hand-off + the GHG disclosure (NOT the measurement companion).
        expect(root.clauses['figaro-topology-v1']).toEqual({ parentOrderIds: [] });
        expect(Object.keys(root.clauses).sort()).toEqual([
            'figaro-fulfilment-v2',
            'figaro-ghg-iso-14064-v1',
            'figaro-handoff-v1',
            'figaro-merchant-process-v1',
            'figaro-proximity-policy-v1',
            'figaro-topology-v1',
        ]);
        expect(root.clauses['figaro-fulfilment-v2'].delivery).toEqual({ coordination: ['seller-assigned'] });

        // order[1] — the courier: courier-process + hand-off + proximity + the
        // GHG disclosure.
        expect(courier.clauses['figaro-topology-v1']).toEqual({ parentOrderIds: ['order-0'] });
        expect(Object.keys(courier.clauses).sort()).toEqual([
            'figaro-courier-process-v1',
            'figaro-ghg-iso-14064-v1',
            'figaro-handoff-v1',
            'figaro-proximity-policy-v1',
            'figaro-topology-v1',
        ]);

        // Drift-guard on the published template's SHAPE.
        const fixtureOrders = captureOrGuardAssemblyDocument(assemblyDoc, {
            slug: 'local-commerce-offset',
            name: 'Local Commerce Offset',
        });
        expect(normalizeAssemblyTemplateOrders(assemblyDoc.orders)).toEqual(fixtureOrders);

        // ── It SURFACES on the marketing /assemblies inventory ─────────────
        await assertAssemblyOnInventory(page, slug);
    });
});
