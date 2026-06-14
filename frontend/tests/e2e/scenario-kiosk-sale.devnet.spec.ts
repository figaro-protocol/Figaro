/**
 * scenario-kiosk-sale.devnet.spec.ts
 *
 * SCENARIO — `kiosk-sale` (1 node, pickup, no process, no proof)
 *
 *   Models: a street vendor / kiosk / newsstand — you collect the item and go.
 *   No tracked lifecycle, no proximity proof. The bare, no-merchant-process
 *   pickup; the only design-time selection is the modality. The
 *   deliberate counterpart of `direct-sale` (the tracked, proximity-verified
 *   consume-onsite case).
 *
 *   Catalogues: the kiosk (1).
 *
 *   Template (what the designer publishes; commerce/topology are added at commit
 *   by the projection, not stored here):
 *
 *     order[0]  buyer ↔ seller  parents: []
 *       figaro-modalities  { modality: pickup }
 *
 * PHASE 1 of the 2× e2e convention — the design-canvas test. It drives the real
 * designer UI ALL THE WAY THROUGH to the IPFS pin AND the on-chain anchor
 * (`AssemblyRegistry.registerAssembly`), exactly as a builder publishes on
 * testnet/mainnet. **The publish PERSISTS** — there is no snapshot/revert. The
 * runtime test (`kiosk-runtime`) then CONSUMES this anchored + pinned assembly
 * via the registry → IPFS, as a participant would on mainnet — it does NOT
 * re-author or re-seed it.
 *
 * Mainnet semantics: the slug is FIXED (`kiosk-sale`) and an assembly is
 * published ONCE. On a fresh devnet this authors + publishes; on a non-fresh
 * devnet where it's already anchored, the publish is a no-op and the test just
 * re-verifies the persisted artifact (idempotent — like mainnet, you don't
 * republish an existing assembly).
 *
 * Drawer contract (chain→IPFS): clause checkboxes render only after the spec
 * cache warms from ClauseRegistry → IPFS, so every checkbox is awaited into
 * existence before it is checked — same contract as the permissionless specs.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo.
 */
import { test, expect } from './devnet-multi-test';
import { createPublicClient, http, keccak256, toHex, type Hex } from 'viem';
import {
    assertAssemblyOnInventory,
    assertPinnedInIpfs,
    assemblyAnchored,
    readLocalDeploymentConfig,
    LOCAL_ANVIL,
    RPC_URL,
} from './devnet-helpers';
import { ASSEMBLY_REGISTRY_ABI } from '@/lib/mechanisms/useAssemblyRegistry';

const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? 'http://127.0.0.1:8080';

test.describe('Author + publish the kiosk-sale assembly (devnet)', () => {
    // Multi-route nav + IPFS pin + on-chain tx. NO evmSnapshot/evmRevert — the
    // publish must PERSIST for the runtime test (and /assemblies) to consume it.
    test.setTimeout(180_000);

    test('designer canvas authors + publishes kiosk-sale; it persists, anchored on-chain + pinned in IPFS', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const assemblyRegistry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY
            ?? config.assemblyRegistry) as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        const slug = 'kiosk-sale';
        const draftName = 'Kiosk Sale';
        const slugHash = keccak256(toHex(slug));

        if (!(await assemblyAnchored(slug))) {
            // ── Author via the real designer canvas + publish (pin + anchor) ──
            await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
            await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
            await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

            // Blank seed = one root order. Open its agreement drawer.
            const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
            await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
            await orderNodes.first().click();
            await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });

            // kiosk-sale's ONLY design-time selection: the pickup modality. No
            // handoff point, no proximity-policy, no merchant-process. pickup is a
            // physical modality that does NOT spawn a courier (only delivery does),
            // so the graph stays a single node. The checkbox exists only once the
            // clause's spec has loaded chain→IPFS — await it into existence.
            await page.getByTestId('drawer-tab-registry').click();
            await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
            const modalitiesBox = page.getByTestId('drawer-registry-clause-figaro-modalities');
            await expect(modalitiesBox, 'drawer surfaces figaro-modalities').toHaveCount(1, { timeout: 20000 });
            await modalitiesBox.check();
            const pickupField = page.getByTestId('drawer-field-figaro-modalities-modality-pickup');
            await expect(pickupField, 'drawer surfaces the pickup modality').toHaveCount(1, { timeout: 10000 });
            await pickupField.check();
            await expect(orderNodes, 'composing clauses never draws nodes').toHaveCount(1, { timeout: 10000 });

            // Name + publish (fixed slug → "kiosk-sale").
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

        // ── It is the correct no-hash template ─────────────────────────────
        const assemblyTemplate = await (await fetch(`${IPFS_GATEWAY}/ipfs/${cid}`)).json() as {
            slug: string;
            name: string;
            orders: Array<{
                id: string;
                clauses: Record<string, Record<string, unknown>>;
            }>;
        };
        expect(assemblyTemplate.slug).toBe(slug);
        expect(assemblyTemplate.orders).toHaveLength(1);
        const root = assemblyTemplate.orders[0];
        // The DAG is a clause: root's figaro-topology carries empty parents.
        expect(root.clauses['figaro-topology']).toEqual({ parentOrderIds: [] });
        expect(Object.keys(root.clauses).sort()).toEqual(['figaro-modalities', 'figaro-topology']);
        expect(root.clauses['figaro-modalities'].modality).toBe('pickup');

        // ── It SURFACES on the marketing /assemblies inventory — the reader
        //    that was empty when publishes got reverted. (Navigates the page.) ─
        await assertAssemblyOnInventory(page, slug);
    });
});
