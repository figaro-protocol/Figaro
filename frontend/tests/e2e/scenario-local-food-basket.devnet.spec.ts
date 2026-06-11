/**
 * scenario-local-food-basket.devnet.spec.ts
 *
 * SCENARIO — `local-food-basket` (4 nodes, aggregated multi-producer)
 *
 *   Models: a local-food hub takes a basket order and coordinates independent
 *   producers — a farm (produce) and a bakery (bread) — plus a courier who
 *   delivers the assembled basket. Each producer is a distinct bonded
 *   relationship the buyer commits to (kernel star-shape). The designer draws
 *   all four nodes; the FIRST multi-contributor scenario.
 *
 *   Template (what the designer publishes; commerce/topology are added at
 *   commit by the projection, not stored here):
 *
 *     order[0]  buyer ↔ hub      parents: []
 *       figaro-modalities-v1        { modality: delivery }
 *       figaro-coordination-v1     { coordination: seller-assigned }
 *       figaro-merchant-process-v1
 *     order[1]  buyer ↔ farm     parents: [order-0]   (bare supply order — collected)
 *     order[2]  buyer ↔ bakery   parents: [order-0]   (bare supply order — collected)
 *     order[3]  buyer ↔ courier  parents: [order-0]
 *       figaro-courier-process-v1
 *       figaro-handoff-v1           { handoff: [face-to-face] }
 *       figaro-proximity-policy-v1  { bands: [zone-wifi] }
 *
 *   The bare producer orders compose NO registry clauses — a supply order is
 *   just a bonded relationship (commerce + topology, both added at commit).
 *
 * PHASE 1 of the 2× e2e convention — the design-canvas test. Drives the real
 * designer UI all the way to the IPFS pin AND the on-chain anchor. The publish
 * PERSISTS; the runtime test consumes it via registry → IPFS.
 *
 * Drawer contract (chain→IPFS): clause checkboxes render only after the spec
 * cache warms from ClauseRegistry → IPFS, so every checkbox is awaited into
 * existence before it is checked — same contract as the permissionless specs.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo.
 */
import { test, expect } from './devnet-multi-test';
import type { Page } from '@playwright/test';
import { createPublicClient, http, keccak256, toHex, type Hex } from 'viem';
import {
    addSubOrder,
    assertAssemblyOnInventory,
    assertPinnedInIpfs,
    assemblyAnchored,
    nodeIds,
    readLocalDeploymentConfig,
    LOCAL_ANVIL,
    RPC_URL,
} from './devnet-helpers';
import { ASSEMBLY_REGISTRY_ABI } from '@/lib/mechanisms/useAssemblyRegistry';

const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? 'http://127.0.0.1:8080';

/** Compose one clause (and its field selections) in the open drawer — each
 *  control awaited into existence first (chain→IPFS spec warm; field controls
 *  are spec-gated and may render only after the parent selection). */
async function composeClause(page: Page, clause: string, fields: readonly string[] = []) {
    const box = page.getByTestId(`drawer-registry-clause-${clause}`);
    await expect(box, `drawer surfaces ${clause}`).toHaveCount(1, { timeout: 20000 });
    await box.check();
    for (const field of fields) {
        const control = page.getByTestId(field);
        await expect(control, `drawer surfaces ${field}`).toHaveCount(1, { timeout: 10000 });
        await control.check();
    }
}

test.describe('Author + publish the local-food-basket assembly (devnet)', () => {
    // 4-node draw + multi-route nav + IPFS pin + on-chain tx. NO snapshot —
    // the publish must PERSIST for the runtime test (and /assemblies) to consume.
    test.setTimeout(240_000);

    test('designer canvas authors + publishes local-food-basket; it persists, anchored + pinned', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const assemblyRegistry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY
            ?? config.assemblyRegistry) as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        const slug = 'local-food-basket';
        const draftName = 'Local Food Basket';
        const slugHash = keccak256(toHex(slug));

        if (!(await assemblyAnchored(slug))) {
            // ── Author via the real designer canvas + publish (pin + anchor) ──
            await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
            await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
            await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

            // Blank seed = one root order (the hub). DRAW the three sub-orders
            // under it: farm, bakery, courier — the designer draws every node.
            const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
            await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
            const [rootId] = await nodeIds(page);
            const farmId = await addSubOrder(page, rootId);
            const bakeryId = await addSubOrder(page, rootId);
            const courierId = await addSubOrder(page, rootId);
            await expect(orderNodes).toHaveCount(4, { timeout: 10000 });
            // The bare producer orders need no drawer visit at all.
            void farmId; void bakeryId;

            // ── Compose the HUB order: delivery (seller-assigned) + the
            //    merchant-process lifecycle anchor ──────────────────────────
            await page.getByTestId(`order-node-${rootId}`).click();
            await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
            await page.getByTestId('drawer-tab-registry').click();
            await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
            await composeClause(page, 'figaro-modalities-v1', [
                'drawer-field-figaro-modalities-v1-modality-delivery',
            ]);
            await composeClause(page, 'figaro-coordination-v1', [
                'drawer-field-figaro-coordination-v1-coordination-seller-assigned',
            ]);
            await composeClause(page, 'figaro-merchant-process-v1');

            // ── Compose the COURIER order: courier-process + the courier→buyer
            //    hand-off + its proximity certification ────────────────────────
            await page.getByTestId(`drawer-node-tab-${courierId}`).click();
            await page.getByTestId('drawer-tab-registry').click();
            await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
            await composeClause(page, 'figaro-courier-process-v1');
            await composeClause(page, 'figaro-handoff-v1', ['drawer-field-figaro-handoff-v1-handoff-face-to-face']);
            await composeClause(page, 'figaro-proximity-policy-v1', ['drawer-field-figaro-proximity-policy-v1-bands-zone-wifi']);
            await expect(orderNodes, 'composing clauses never draws nodes').toHaveCount(4, { timeout: 10000 });

            // Name + publish (fixed slug → "local-food-basket").
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

        // ── It is the correct no-hash 4-node template ──────────────────────
        const assemblyTemplate = await (await fetch(`${IPFS_GATEWAY}/ipfs/${cid}`)).json() as {
            slug: string;
            name: string;
            orders: Array<{
                id: string;
                clauses: Record<string, Record<string, unknown>>;
            }>;
        };
        expect(assemblyTemplate.slug).toBe(slug);
        expect(assemblyTemplate.orders).toHaveLength(4);
        const [root, farm, bakery, courier] = assemblyTemplate.orders;

        // order[0] — the hub: delivery (seller-assigned) + merchant-process.
        expect(root.clauses['figaro-topology-v1']).toEqual({ parentOrderIds: [] });
        expect(Object.keys(root.clauses).sort()).toEqual([
            'figaro-coordination-v1',
            'figaro-merchant-process-v1',
            'figaro-modalities-v1',
            'figaro-topology-v1',
        ]);
        expect(root.clauses['figaro-modalities-v1'].modality).toBe('delivery');
        expect(root.clauses['figaro-coordination-v1'].coordination).toBe('seller-assigned');

        // order[1] + order[2] — the producers: BARE bonded relationships
        // (topology only; commerce joins at commit via the projection).
        for (const producer of [farm, bakery]) {
            expect(producer.clauses['figaro-topology-v1']).toEqual({ parentOrderIds: ['order-0'] });
            expect(Object.keys(producer.clauses).sort()).toEqual(['figaro-topology-v1']);
        }

        // order[3] — the courier: courier-process + the courier→buyer hand-off,
        // proximity-certified.
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
