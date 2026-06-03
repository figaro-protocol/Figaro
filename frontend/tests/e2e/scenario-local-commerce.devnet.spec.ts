/**
 * scenario-local-commerce.devnet.spec.ts
 *
 * SCENARIO — `local-commerce` (2 nodes, seller-assigned delivery)
 *
 *   Models: a merchant sells goods for delivery and arranges its OWN courier —
 *   a restaurant dispatching its own rider. The merchant picks the courier
 *   directly (seller-assigned: no auction, no buyer choice). Two bonded
 *   relationships the buyer commits to (kernel star-shape): the merchant order
 *   and the courier sub-order, each priced from its own seller's catalogue.
 *
 *   Catalogues: merchant (the goods) + courier (the delivery) — 2.
 *
 *   Template (what the designer publishes; commerce/topology/geo are added at
 *   commit by the projection, not stored here):
 *
 *     order[0]  buyer ↔ merchant  parents: []
 *       figaro-fulfilment-v2       { modalities: [delivery], coordinations: [seller-assigned], handoffPoints: [face-to-face] }
 *       figaro-merchant-process-v1 { }          ← ACTIVATED by selecting delivery
 *     order[1]  courier sub-order  parents: [order[0]]   ← SPAWNED by selecting delivery
 *       figaro-courier-process-v1  { }          ← ACTIVATED on the courier
 *       figaro-proximity-policy-v1 { bands: [zone-wifi] }
 *
 * PHASE 1 of the 2× e2e convention — the design-canvas test, FIRST time the
 * 2-node delivery assembly is authored through the real UI. Selecting the
 * delivery modality spawns the courier sub-order and materializes merchant-
 * process (root) + courier-process (courier) into the template (the canvas
 * delivery activation — see DesignerCanvas). It drives the designer ALL THE WAY
 * to the IPFS pin + on-chain anchor (`AssemblyRegistry.registerAssembly`),
 * exactly as a builder publishes on mainnet. **The publish PERSISTS** — no
 * snapshot/revert. The runtime test then CONSUMES this anchored + pinned
 * assembly via registry → IPFS.
 *
 * Mainnet semantics: slug FIXED (`local-commerce`), published ONCE. Fresh devnet
 * → authors + publishes; already-anchored → publish is a no-op and the test
 * re-verifies the persisted artifact (idempotent).
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo.
 */
import { test, expect } from './devnet-multi-test';
import { keccak256, toHex, type Hex } from 'viem';
import {
    ASSEMBLY_REGISTERED_EVENT_ABI,
    assertAssemblyOnInventory,
    assertPinnedInIpfs,
    captureOrGuardAssemblyDocument,
    localPublicClient,
    normalizeAssemblyTemplateOrders,
    readLocalDeploymentConfig,
} from './devnet-helpers';

const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? 'http://127.0.0.1:8080';

test.describe('Author + publish the local-commerce assembly (devnet)', () => {
    // Multi-route nav + a 2-node canvas compose + IPFS pin + on-chain tx. NO
    // evmSnapshot/evmRevert — the publish must PERSIST for the runtime test
    // (and /assemblies) to consume it.
    test.setTimeout(180_000);

    test('designer canvas authors + publishes local-commerce (delivery spawns the courier); it persists, anchored + pinned', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const assemblyRegistry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY
            ?? config.assemblyRegistry) as Hex;
        const publicClient = localPublicClient();

        const slug = 'local-commerce';
        const draftName = 'Local Commerce';
        const slugHash = keccak256(toHex(slug));

        const alreadyAnchored = await publicClient.getContractEvents({
            address: assemblyRegistry,
            abi: ASSEMBLY_REGISTERED_EVENT_ABI,
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

            const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
            await expect(orderNodes).toHaveCount(1, { timeout: 10000 });

            // ── Root order: delivery + seller-assigned + face-to-face ─────────
            await orderNodes.first().click();
            await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
            await page.getByTestId('drawer-tab-registry').click();
            await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });

            await page.getByTestId('drawer-registry-clause-figaro-fulfilment-v2').check();
            // Selecting delivery spawns the courier sub-order AND materializes
            // merchant-process (root) + courier-process (courier) into the template.
            await page.getByTestId('drawer-field-figaro-fulfilment-v2-modalities-delivery').check();
            await expect(orderNodes).toHaveCount(2, { timeout: 10000 });
            await page.getByTestId('drawer-field-figaro-fulfilment-v2-coordinations-seller-assigned').check();
            await page.getByTestId('drawer-field-figaro-fulfilment-v2-handoffPoints-face-to-face').check();

            // ── Courier sub-order: proximity-policy { bands: [zone-wifi] } ────
            // Switch to the courier node via the drawer's node tabs (2nd tab);
            // courier-process is already activated on it.
            const courierTab = page.getByTestId('drawer-node-tabs')
                .locator('[data-testid^="drawer-node-tab-"]').nth(1);
            await courierTab.click();
            await page.getByTestId('drawer-tab-registry').click();
            await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
            await page.getByTestId('drawer-registry-clause-figaro-proximity-policy-v1').check();
            await page.getByTestId('drawer-field-figaro-proximity-policy-v1-bands-zone-wifi').check();

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

        // ── Anchored on-chain — PERSISTED, exactly one registration ─────────
        const events = await publicClient.getContractEvents({
            address: assemblyRegistry,
            abi: ASSEMBLY_REGISTERED_EVENT_ABI,
            eventName: 'AssemblyRegistered',
            args: { slugHash },
            fromBlock: 0n,
        });
        expect(events.length).toBe(1);
        const metadataURI = events[0].args.metadataURI as string;
        expect(metadataURI).toMatch(/^ipfs:\/\//);

        // ── Pinned in IPFS (proof of persistence, not a computed CID) ───────
        const cid = metadataURI.slice('ipfs://'.length);
        await assertPinnedInIpfs(cid);

        // ── The correct no-hash 2-node template ─────────────────────────────
        const assemblyDoc = await (await fetch(`${IPFS_GATEWAY}/ipfs/${cid}`)).json() as {
            slug: string;
            name: string;
            orders: Array<{
                id: string;
                parentOrderIds: string[];
                clauses: Record<string, Record<string, unknown>>;
            }>;
        };
        expect(assemblyDoc.slug).toBe(slug);
        expect(assemblyDoc.orders).toHaveLength(2);

        const root = assemblyDoc.orders.find((o) => o.parentOrderIds.length === 0);
        const courier = assemblyDoc.orders.find((o) => o.parentOrderIds.length > 0);
        expect(root, 'a root order (no parents)').toBeTruthy();
        expect(courier, 'a courier sub-order (parented to the root)').toBeTruthy();
        expect(courier!.parentOrderIds).toEqual([root!.id]);

        // Root: fulfilment-v2 (delivery/seller-assigned/face-to-face) + merchant-process.
        expect(Object.keys(root!.clauses).sort()).toEqual([
            'figaro-fulfilment-v2',
            'figaro-merchant-process-v1',
        ]);
        expect(root!.clauses['figaro-fulfilment-v2'].modalities).toEqual(['delivery']);
        expect(root!.clauses['figaro-fulfilment-v2'].coordinations).toEqual(['seller-assigned']);
        expect(root!.clauses['figaro-fulfilment-v2'].handoffPoints).toEqual(['face-to-face']);

        // Courier: courier-process + proximity-policy { bands: [zone-wifi] }.
        expect(Object.keys(courier!.clauses).sort()).toEqual([
            'figaro-courier-process-v1',
            'figaro-proximity-policy-v1',
        ]);
        expect(courier!.clauses['figaro-proximity-policy-v1'].bands).toEqual(['zone-wifi']);

        // Drift-guard on the published template SHAPE (an output check — NOT the
        // runtime's data source; the runtime reads this assembly from chain→IPFS).
        const fixtureOrders = captureOrGuardAssemblyDocument(assemblyDoc, {
            slug: 'local-commerce',
            name: 'Local Commerce',
        });
        expect(normalizeAssemblyTemplateOrders(assemblyDoc.orders)).toEqual(fixtureOrders);

        // ── Surfaces on the marketing /assemblies inventory ─────────────────
        await assertAssemblyOnInventory(page, slug);
    });
});
