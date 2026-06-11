/**
 * scenario-local-commerce.devnet.spec.ts
 *
 * SCENARIO — `local-commerce` (2 nodes, seller-assigned delivery)
 *
 *   Models: a merchant sells for delivery and arranges its OWN courier — a
 *   restaurant dispatching its own rider (seller-assigned). Two co-equal bonded
 *   relationships the buyer commits to: the merchant order and the courier order.
 *
 *   Catalogues: merchant (goods) + courier (delivery) — 2.
 *
 *   Template (what the designer publishes; commerce/topology are added at commit
 *   by the projection, not stored here):
 *
 *     order[0]  buyer ↔ merchant  parents: []
 *       figaro-modalities-v1       { modality: delivery }
 *       figaro-coordination-v1     { coordination: seller-assigned }
 *       figaro-handoff-v1          { handoff: [face-to-face] }
 *       figaro-merchant-process-v1 { }
 *       figaro-proximity-policy-v1 { bands: [zone-wifi] }
 *     order[1]  buyer ↔ courier   parents: [order-0]   (value-topology edge; co-equal)
 *       figaro-courier-process-v1  { }
 *       figaro-handoff-v1          { handoff: [face-to-face] }
 *       figaro-proximity-policy-v1 { bands: [zone-wifi] }
 *
 *   Delivery is expressed by the TOPOLOGY (a second courier order carrying
 *   courier-process), NOT by a side-effect spawn — the designer DRAWS the courier
 *   node. The merchant's modalities clause records the delivery modality; its
 *   seller-assigned coordination; the courier order IS the delivery.
 *
 * PHASE 1 of the 2× e2e convention — the design-canvas test. Drives the real
 * designer UI all the way to the IPFS pin AND the on-chain anchor
 * (`AssemblyRegistry.registerAssembly`). The publish PERSISTS; the runtime test
 * (`local-commerce-runtime`) then CONSUMES this anchored + pinned assembly via
 * the registry → IPFS — it does NOT re-author or re-seed it.
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

test.describe('Author + publish the local-commerce assembly (devnet)', () => {
    // Multi-node draw + multi-route nav + IPFS pin + on-chain tx. NO snapshot —
    // the publish must PERSIST for the runtime test (and /assemblies) to consume.
    test.setTimeout(180_000);

    test('designer canvas authors + publishes local-commerce; it persists, anchored on-chain + pinned in IPFS', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const assemblyRegistry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY
            ?? config.assemblyRegistry) as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        const slug = 'local-commerce';
        const draftName = 'Local Commerce';
        const slugHash = keccak256(toHex(slug));

        if (!(await assemblyAnchored(slug))) {
            // ── Author via the real designer canvas + publish (pin + anchor) ──
            await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
            await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
            await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

            // Blank seed = one root order (the merchant). DRAW the courier
            // sub-order under it (the delivery leg — a co-equal order, not a
            // side-effect spawn).
            const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
            await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
            const [rootId] = await nodeIds(page);
            const courierId = await addSubOrder(page, rootId);
            await expect(orderNodes).toHaveCount(2, { timeout: 10000 });

            // ── Compose the MERCHANT order: delivery (seller-assigned) + handoff,
            //    and the merchant-process lifecycle anchor ──────────────────────
            await page.getByTestId(`order-node-${rootId}`).click();
            await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
            await page.getByTestId('drawer-tab-registry').click();
            await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });

            // The delivery sub-clause (coordination) surfaces once delivery is
            // the chosen modality — gated by the spec, never hardcoded.
            await composeClause(page, 'figaro-modalities-v1', [
                'drawer-field-figaro-modalities-v1-modality-delivery',
            ]);
            await composeClause(page, 'figaro-coordination-v1', [
                'drawer-field-figaro-coordination-v1-coordination-seller-assigned',
            ]);
            // The merchant→courier hand-off + its proximity certification
            // (proximity nests under the hand-off clause's field).
            await composeClause(page, 'figaro-handoff-v1', ['drawer-field-figaro-handoff-v1-handoff-face-to-face']);
            await composeClause(page, 'figaro-proximity-policy-v1', ['drawer-field-figaro-proximity-policy-v1-bands-zone-wifi']);
            await composeClause(page, 'figaro-merchant-process-v1');

            // ── Compose the COURIER order: courier-process + the courier→buyer
            //    hand-off + its proximity certification ────────────────────────
            await page.getByTestId(`drawer-node-tab-${courierId}`).click();
            await page.getByTestId('drawer-tab-registry').click();
            await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
            await composeClause(page, 'figaro-courier-process-v1');
            await composeClause(page, 'figaro-handoff-v1', ['drawer-field-figaro-handoff-v1-handoff-face-to-face']);
            await composeClause(page, 'figaro-proximity-policy-v1', ['drawer-field-figaro-proximity-policy-v1-bands-zone-wifi']);
            await expect(orderNodes, 'composing clauses never draws nodes').toHaveCount(2, { timeout: 10000 });

            // Name + publish (fixed slug → "local-commerce").
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
        const assemblyTemplate = await (await fetch(`${IPFS_GATEWAY}/ipfs/${cid}`)).json() as {
            slug: string;
            name: string;
            orders: Array<{
                id: string;
                clauses: Record<string, Record<string, unknown>>;
            }>;
        };
        expect(assemblyTemplate.slug).toBe(slug);
        expect(assemblyTemplate.orders).toHaveLength(2);
        const [root, courier] = assemblyTemplate.orders;

        // order[0] — the merchant: delivery (seller-assigned) + merchant-process +
        // the merchant→courier hand-off, proximity-certified.
        expect(root.clauses['figaro-topology-v1']).toEqual({ parentOrderIds: [] });
        expect(Object.keys(root.clauses).sort()).toEqual([
            'figaro-coordination-v1',
            'figaro-handoff-v1',
            'figaro-merchant-process-v1',
            'figaro-modalities-v1',
            'figaro-proximity-policy-v1',
            'figaro-topology-v1',
        ]);
        expect(root.clauses['figaro-modalities-v1'].modality).toBe('delivery');
        expect(root.clauses['figaro-coordination-v1'].coordination).toBe('seller-assigned');
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
