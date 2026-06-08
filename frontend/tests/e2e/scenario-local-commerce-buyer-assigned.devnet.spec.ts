/**
 * scenario-local-commerce-buyer-assigned.devnet.spec.ts
 *
 * SCENARIO — `local-commerce-buyer-assigned` (2 nodes, buyer-assigned delivery)
 *
 *   Models: a merchant sells for delivery but lets the BUYER pick the courier at
 *   checkout — a restaurant that doesn't arrange the rider itself. Two co-equal
 *   bonded relationships the buyer commits to: the merchant order and the
 *   courier order (whose seller is the courier the buyer chose).
 *
 *   Catalogues: merchant (goods) + courier (delivery) — 2.
 *
 *   Template (what the designer publishes; commerce/topology are added at commit
 *   by the projection, not stored here):
 *
 *     order[0]  buyer ↔ merchant  parents: []
 *       figaro-fulfilment-v2       { modalities: [delivery],
 *                                    delivery: { coordination: [buyer-assigned] },
 *                                    handoff: [face-to-face] }
 *       figaro-merchant-process-v1 { }
 *     order[1]  buyer ↔ courier   parents: [order-0]   (value-topology edge; co-equal)
 *       figaro-courier-process-v1  { }
 *       figaro-proximity-policy-v1 { bands: [zone-wifi] }
 *
 *   SAME clauses + topology as `local-commerce`; the ONLY delta is the
 *   coordination — `buyer-assigned` instead of `seller-assigned` (the merchant's
 *   fulfilment-v2 records it). At checkout the buyer enters the courier's address
 *   rather than picking from the merchant's roster.
 *
 * PHASE 1 of the 2× e2e convention — the design-canvas test. Drives the real
 * designer UI all the way to the IPFS pin AND the on-chain anchor
 * (`AssemblyRegistry.registerAssembly`). The publish PERSISTS; the runtime test
 * (`local-commerce-buyer-assigned-runtime`) then CONSUMES this anchored + pinned
 * assembly via the registry → IPFS — it does NOT re-author or re-seed it.
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

test.describe('Author + publish the local-commerce-buyer-assigned assembly (devnet)', () => {
    // Multi-node draw + multi-route nav + IPFS pin + on-chain tx. NO snapshot —
    // the publish must PERSIST for the runtime test (and /assemblies) to consume.
    test.setTimeout(180_000);

    test('designer canvas authors + publishes local-commerce-buyer-assigned; it persists, anchored on-chain + pinned in IPFS', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const assemblyRegistry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY
            ?? config.assemblyRegistry) as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        const slug = 'local-commerce-buyer-assigned';
        const draftName = 'Local Commerce (buyer-assigned)';
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
            // the courier sub-order under it (the delivery leg — a co-equal order,
            // not a side-effect spawn).
            const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
            await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
            const rootTestId = await orderNodes.first().getAttribute('data-testid');
            const rootId = rootTestId!.replace('order-node-', '');

            await page.getByTestId(`btn-add-suborder-${rootId}`).click();
            await expect(orderNodes).toHaveCount(2, { timeout: 10000 });
            const allTestIds = await orderNodes.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
            const courierId = allTestIds.find((t) => t !== `order-node-${rootId}`)!.replace('order-node-', '');

            // ── Compose the MERCHANT order: delivery (buyer-assigned) + handoff,
            //    and the merchant-process lifecycle anchor ──────────────────────
            await page.getByTestId(`order-node-${rootId}`).click();
            await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
            await page.getByTestId('drawer-tab-registry').click();
            await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });

            await page.getByTestId('drawer-registry-clause-figaro-fulfilment-v2').check();
            await page.getByTestId('drawer-field-figaro-fulfilment-v2-modalities-delivery').check();
            // The delivery sub-clause (coordination) surfaces once delivery is the
            // chosen modality — gated by the spec, never hardcoded. THE ONLY DELTA
            // from `local-commerce`: buyer-assigned, not seller-assigned.
            const coordination = page.getByTestId('drawer-field-figaro-fulfilment-v2-delivery-coordination-buyer-assigned');
            await coordination.waitFor({ state: 'visible', timeout: 5000 });
            await coordination.check();
            // The merchant→courier hand-off + its proximity certification (proximity
            // nests under the hand-off clause's field).
            await page.getByTestId('drawer-registry-clause-figaro-handoff-v1').check();
            await page.getByTestId('drawer-field-figaro-handoff-v1-handoff-face-to-face').check();
            await page.getByTestId('drawer-registry-clause-figaro-proximity-policy-v1').check();
            await page.getByTestId('drawer-field-figaro-proximity-policy-v1-bands-zone-wifi').check();
            await page.getByTestId('drawer-registry-clause-figaro-merchant-process-v1').check();

            // ── Compose the COURIER order: courier-process + the courier→buyer
            //    hand-off + its proximity certification ────────────────────────
            await page.getByTestId(`drawer-node-tab-${courierId}`).click();
            await page.getByTestId('drawer-tab-registry').click();
            await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
            await page.getByTestId('drawer-registry-clause-figaro-courier-process-v1').check();
            await page.getByTestId('drawer-registry-clause-figaro-handoff-v1').check();
            await page.getByTestId('drawer-field-figaro-handoff-v1-handoff-face-to-face').check();
            await page.getByTestId('drawer-registry-clause-figaro-proximity-policy-v1').check();
            await page.getByTestId('drawer-field-figaro-proximity-policy-v1-bands-zone-wifi').check();
            await expect(orderNodes).toHaveCount(2, { timeout: 10000 });

            // Name + publish (fixed slug → "local-commerce-buyer-assigned").
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

        // ── It is PINNED in IPFS (proof of persistence, not a computed CID) ─
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

        // order[0] — the merchant: delivery (buyer-assigned) + merchant-process +
        // the merchant→courier hand-off, proximity-certified.
        expect(root.clauses['figaro-topology-v1']).toEqual({ parentOrderIds: [] });
        expect(Object.keys(root.clauses).sort()).toEqual([
            'figaro-fulfilment-v2',
            'figaro-handoff-v1',
            'figaro-merchant-process-v1',
            'figaro-proximity-policy-v1',
            'figaro-topology-v1',
        ]);
        expect(root.clauses['figaro-fulfilment-v2'].modalities).toEqual(['delivery']);
        // The defining delta from local-commerce: buyer-assigned coordination.
        expect(root.clauses['figaro-fulfilment-v2'].delivery).toEqual({ coordination: ['buyer-assigned'] });
        expect(root.clauses['figaro-fulfilment-v2'].handoff).toBeUndefined();
        expect(root.clauses['figaro-handoff-v1'].handoff).toEqual(['face-to-face']);
        expect(root.clauses['figaro-proximity-policy-v1'].bands).toEqual(['zone-wifi']);

        // order[1] — the courier: courier-process + the courier→buyer hand-off,
        // proximity-certified, parent = order-0.
        expect(courier.clauses['figaro-topology-v1']).toEqual({ parentOrderIds: ['order-0'] });
        expect(Object.keys(courier.clauses).sort()).toEqual([
            'figaro-courier-process-v1',
            'figaro-handoff-v1',
            'figaro-proximity-policy-v1',
            'figaro-topology-v1',
        ]);
        expect(courier.clauses['figaro-handoff-v1'].handoff).toEqual(['face-to-face']);
        expect(courier.clauses['figaro-proximity-policy-v1'].bands).toEqual(['zone-wifi']);

        // ── It SURFACES on the marketing /assemblies inventory ─────────────
        await assertAssemblyOnInventory(page, slug);
    });
});
