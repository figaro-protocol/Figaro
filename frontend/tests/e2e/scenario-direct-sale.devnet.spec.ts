/**
 * scenario-direct-sale.devnet.spec.ts
 *
 * SCENARIO — `direct-sale` (1 node, consume-onsite, tracked + proximity-verified)
 *
 *   Models: an on-premise sale — a café counter, a bar, a market stall where
 *   you consume on site. The buyer↔merchant handoff IS the certification edge:
 *   the merchant runs the prep-started → ready-for-pickup → handed-off
 *   lifecycle (figaro-merchant-process; arrival/acceptance are core, not
 *   merchant-process events) and both parties attest proximity at handoff
 *   (figaro-proximity-policy, face-to-face). The tracked, proximity-verified
 *   counterpart of `kiosk-sale` (the bare, no-process pickup).
 *
 *   Catalogues: the on-site seller (1).
 *
 *   Template (what the designer publishes; commerce/topology/geo are added at
 *   commit by the projection, not stored here):
 *
 *     order[0]  buyer ↔ seller  parents: []
 *       figaro-modalities       { modality: consume-onsite }
 *       figaro-handoff          { handoff: [face-to-face] }
 *       figaro-merchant-process { }
 *       figaro-proximity-policy { bands: [zone-wifi] }
 *
 * PHASE 1 of the 2× e2e convention — the design-canvas test. It drives the real
 * designer UI ALL THE WAY THROUGH to the IPFS pin AND the on-chain anchor
 * (`AssemblyRegistry.registerAssembly`), exactly as a builder publishes on
 * testnet/mainnet. **The publish PERSISTS** — there is no snapshot/revert. The
 * runtime test (`direct-sale-runtime`) then CONSUMES this anchored + pinned
 * assembly via the registry → IPFS, as a participant would on mainnet — it does
 * NOT re-author or re-seed it.
 *
 * Mainnet semantics: the slug is FIXED (`direct-sale`) and an assembly is
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
import { SCENARIO_SLUG } from './scenarioSlugs.mjs';
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

/** The composed clauses, in drawer order. Nested clauses (proximity under the
 *  hand-off field) only render once their parent is checked, so order matters. */
const COMPOSE_STEPS: ReadonlyArray<{ clause: string; field?: string }> = [
    { clause: 'figaro-modalities', field: 'drawer-field-figaro-modalities-modality-consume-onsite' },
    { clause: 'figaro-handoff', field: 'drawer-field-figaro-handoff-handoff-face-to-face' },
    { clause: 'figaro-proximity-policy', field: 'drawer-field-figaro-proximity-policy-bands-zone-wifi' },
    { clause: 'figaro-merchant-process' },
];

test.describe('Author + publish the direct-sale assembly (devnet)', () => {
    // Multi-route nav + IPFS pin + on-chain tx. NO evmSnapshot/evmRevert — the
    // publish must PERSIST for the runtime test (and /assemblies) to consume it.
    test.setTimeout(180_000);

    test('designer canvas authors + publishes direct-sale; it persists, anchored on-chain + pinned in IPFS', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const assemblyRegistry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY
            ?? config.assemblyRegistry) as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        const slug = SCENARIO_SLUG['direct-sale'];
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

            // ── Compose clauses in the Registry tab ────────────────────────
            // consume-onsite is a physical modality (no courier sub-order — only
            // delivery spawns one); the proximity band on the root is the
            // buyer↔merchant handoff edge (proximity nests under hand-off);
            // merchant-process anchors the consume-onsite lifecycle
            // (prep-started → ready-for-pickup → handed-off). One node throughout.
            await page.getByTestId('drawer-tab-registry').click();
            await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });

            for (const step of COMPOSE_STEPS) {
                // The checkbox exists only once the clause's spec has loaded
                // chain→IPFS (and, for nested clauses, once the parent is
                // checked) — await it into existence before acting.
                const box = page.getByTestId(`drawer-registry-clause-${step.clause}`);
                await expect(box, `drawer surfaces ${step.clause}`).toHaveCount(1, { timeout: 20000 });
                await box.check();
                if (step.field) {
                    const field = page.getByTestId(step.field);
                    await expect(field, `drawer surfaces ${step.field}`).toHaveCount(1, { timeout: 10000 });
                    await field.check();
                }
            }
            await expect(orderNodes, 'composing clauses never draws nodes').toHaveCount(1, { timeout: 10000 });

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

        // ── It is the correct no-hash template — the composed clauses ─────
        const assemblyTemplate = await (await fetch(`${IPFS_GATEWAY}/ipfs/${cid}`)).json() as {
            slug: string;
            name: string;
            orders: Array<{
                id: string;
                clauses: Record<string, Record<string, unknown>>;
            }>;
        };
        expect(assemblyTemplate.orders).toHaveLength(1);
        const root = assemblyTemplate.orders[0];
        // The DAG is a clause: root's figaro-topology carries empty parents.
        expect(root.clauses['figaro-topology']).toEqual({ parentOrderIds: [] });
        expect(Object.keys(root.clauses).sort()).toEqual([
            'figaro-handoff',
            'figaro-merchant-process',
            'figaro-modalities',
            'figaro-proximity-policy',
            'figaro-topology',
        ]);
        expect(root.clauses['figaro-modalities'].modality).toBe('consume-onsite');
        expect(root.clauses['figaro-handoff'].handoff).toEqual(['face-to-face']);
        expect(root.clauses['figaro-proximity-policy'].bands).toEqual(['zone-wifi']);

        // ── It SURFACES on the marketing /assemblies inventory ─────────────
        await assertAssemblyOnInventory(page, slug);
    });
});
