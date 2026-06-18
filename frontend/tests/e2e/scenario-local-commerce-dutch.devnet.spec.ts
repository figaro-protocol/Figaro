/**
 * scenario-local-commerce-dutch.devnet.spec.ts
 *
 * SCENARIO — `local-commerce-dutch` (2 nodes, dutch-auction delivery)
 *
 *   Models: a merchant sells for delivery and the courier order is DEFERRED to a
 *   descending-price auction — same two co-equal bonded relationships as `local-commerce-seller-assigned`; the
 *   only delta is the courier-resolution mechanism (`delivery.coordination`).
 *
 *   Template (what the designer publishes; commerce/topology are added at commit
 *   by the projection, not stored here):
 *
 *     order[0]  buyer ↔ merchant  parents: []
 *       figaro-modalities       { modality: delivery }
 *       figaro-coordination     { coordination: dutch-auction }
 *       figaro-handoff          { handoff: [face-to-face] }
 *       figaro-merchant-process { }
 *       figaro-proximity-policy { bands: [zone-wifi] }
 *     order[1]  buyer ↔ courier   parents: [order-0]   (value-topology edge; co-equal)
 *       figaro-courier-process  { }
 *       figaro-handoff          { handoff: [face-to-face] }
 *       figaro-proximity-policy { bands: [zone-wifi] }
 *
 *   The adopting merchant's profile binds NO counterparty for the courier
 *   node — the courier order defers to the auction; the claiming seller
 *   commits it post-claim.
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
import { SCENARIO_SLUG } from './scenarioSlugs.mjs';
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

test.describe('Author + publish the local-commerce-dutch assembly (devnet)', () => {
    // Multi-node draw + multi-route nav + IPFS pin + on-chain tx. NO snapshot —
    // the publish must PERSIST for the runtime test (and /assemblies) to consume.
    test.setTimeout(180_000);

    test('designer canvas authors + publishes local-commerce-dutch; it persists, anchored + pinned', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const assemblyRegistry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY
            ?? config.assemblyRegistry) as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        const slug = SCENARIO_SLUG['local-commerce-dutch'];
        const slugHash = keccak256(toHex(slug));

        if (!(await assemblyAnchored(slug))) {
            // ── Author via the real designer canvas + publish (pin + anchor) ──
            await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
            await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
            await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

            // R2: name the published assembly — editorial, EXCLUDED from the content
            // hash, so the slug (SCENARIO_SLUG) is unchanged.
            await page.getByTestId('designer-name-input').fill('Local Commerce — Dutch Auction');

            // Blank seed = one root order (the merchant). DRAW the courier
            // sub-order under it.
            const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
            await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
            const [rootId] = await nodeIds(page);
            const courierId = await addSubOrder(page, rootId);
            await expect(orderNodes).toHaveCount(2, { timeout: 10000 });

            // ── Compose the MERCHANT order: delivery (dutch-auction) + handoff,
            //    and the merchant-process lifecycle anchor ──────────────────────
            await page.getByTestId(`order-node-${rootId}`).click();
            await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
            await page.getByTestId('drawer-tab-registry').click();
            await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });

            await composeClause(page, 'figaro-modalities', [
                'drawer-field-figaro-modalities-modality-delivery',
            ]);
            await composeClause(page, 'figaro-coordination', [
                'drawer-field-figaro-coordination-coordination-dutch-auction',
            ]);
            await composeClause(page, 'figaro-handoff', ['drawer-field-figaro-handoff-handoff-face-to-face']);
            await composeClause(page, 'figaro-proximity-policy', ['drawer-field-figaro-proximity-policy-bands-zone-wifi']);
            await composeClause(page, 'figaro-merchant-process');

            // ── Compose the COURIER order ────────────────────────────────────
            await page.getByTestId(`drawer-node-tab-${courierId}`).click();
            await page.getByTestId('drawer-tab-registry').click();
            await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
            await composeClause(page, 'figaro-courier-process');
            await composeClause(page, 'figaro-handoff', ['drawer-field-figaro-handoff-handoff-face-to-face']);
            await composeClause(page, 'figaro-proximity-policy', ['drawer-field-figaro-proximity-policy-bands-zone-wifi']);
            await expect(orderNodes, 'composing clauses never draws nodes').toHaveCount(2, { timeout: 10000 });

            await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
            await page.getByTestId('designer-review').click();

            await page.waitForURL(/\/builders\/designer\/view\/asm-/, { timeout: 15000 });
            // Post-40bbe6a the /view URL carries a RANDOM local draft handle; the
            // content-derived slug is anchored at confirm-publish. Capture the handle.
            const handle = page.url().match(/\/view\/(asm-[a-z0-9-]+)/)?.[1] ?? slug;
            await page.goto(
                `/builders/designer/view/${handle}?intent=publish&e2e=devnet`,
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
        expect(assemblyTemplate.orders).toHaveLength(2);
        // The editorial name is pinned in the document (but never in the hash).
        expect(assemblyTemplate.name).toBe('Local Commerce — Dutch Auction');
        const [root, courier] = assemblyTemplate.orders;

        expect(root.clauses['figaro-topology']).toEqual({ parentOrderIds: [] });
        expect(Object.keys(root.clauses).sort()).toEqual([
            'figaro-coordination',
            'figaro-handoff',
            'figaro-merchant-process',
            'figaro-modalities',
            'figaro-proximity-policy',
            'figaro-topology',
        ]);
        expect(root.clauses['figaro-modalities'].modality).toBe('delivery');
        expect(root.clauses['figaro-coordination'].coordination).toBe('dutch-auction');
        expect(root.clauses['figaro-handoff'].handoff).toEqual(['face-to-face']);
        expect(root.clauses['figaro-proximity-policy'].bands).toEqual(['zone-wifi']);

        expect(courier.clauses['figaro-topology']).toEqual({ parentOrderIds: ['order-0'] });
        expect(Object.keys(courier.clauses).sort()).toEqual([
            'figaro-courier-process',
            'figaro-handoff',
            'figaro-proximity-policy',
            'figaro-topology',
        ]);

        // ── It SURFACES on the marketing /assemblies inventory ─────────────
        await assertAssemblyOnInventory(page, slug);
    });
});
