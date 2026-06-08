/**
 * scenario-direct-sale.devnet.spec.ts
 *
 * SCENARIO — `direct-sale` (1 node, consume-onsite, tracked + proximity-verified)
 *
 *   Models: an on-premise sale — a café counter, a bar, a market stall where
 *   you consume on site. The buyer↔merchant handoff IS the certification edge:
 *   the merchant runs the prep-started → ready-for-pickup → handed-off
 *   lifecycle (figaro-merchant-process-v1; arrival/acceptance are core, not
 *   merchant-process events) and both parties attest proximity at handoff
 *   (figaro-proximity-policy-v1, face-to-face). The tracked, proximity-verified
 *   counterpart of `kiosk-sale` (the bare, no-process pickup).
 *
 *   Catalogues: the on-site seller (1).
 *
 *   Template (what the designer publishes; commerce/topology/geo are added at
 *   commit by the projection, not stored here):
 *
 *     order[0]  buyer ↔ seller  parents: []
 *       figaro-fulfilment-v2       { modalities: [consume-onsite], handoff: { points: [face-to-face] } }
 *       figaro-merchant-process-v1 { }
 *       figaro-proximity-policy-v1 { bands: [zone-wifi] }
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

test.describe('Author + publish the direct-sale assembly (devnet)', () => {
    // Multi-route nav + IPFS pin + on-chain tx. NO evmSnapshot/evmRevert — the
    // publish must PERSIST for the runtime test (and /assemblies) to consume it.
    test.setTimeout(180_000);

    test('designer canvas authors + publishes direct-sale; it persists, anchored on-chain + pinned in IPFS', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const assemblyRegistry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY
            ?? config.assemblyRegistry) as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        const slug = 'direct-sale';
        const draftName = 'Direct Sale';
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

            // Blank seed = one root order. Open its agreement drawer.
            const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
            await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
            await orderNodes.first().click();
            await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });

            // ── Compose clauses in the Registry tab ────────────────────────
            // consume-onsite is a physical modality (no courier sub-order — only
            // delivery spawns one); the proximity band on the root is the
            // buyer↔merchant handoff edge; merchant-process anchors the
            // consume-onsite lifecycle (prep-started → ready-for-pickup →
            // handed-off). The graph stays a single node.
            await page.getByTestId('drawer-tab-registry').click();
            await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });

            await page.getByTestId('drawer-registry-clause-figaro-fulfilment-v2').check();
            await page.getByTestId('drawer-field-figaro-fulfilment-v2-modalities-consume-onsite').check();

            // Hand-off is its own clause now; proximity nests under its handoff field.
            await page.getByTestId('drawer-registry-clause-figaro-handoff-v1').check();
            await page.getByTestId('drawer-field-figaro-handoff-v1-handoff-face-to-face').check();
            await page.getByTestId('drawer-registry-clause-figaro-proximity-policy-v1').check();
            await page.getByTestId('drawer-field-figaro-proximity-policy-v1-bands-zone-wifi').check();

            await page.getByTestId('drawer-registry-clause-figaro-merchant-process-v1').check();
            await expect(orderNodes).toHaveCount(1, { timeout: 10000 });

            // Name + publish (fixed slug → "direct-sale").
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

        // ── It is the correct no-hash template — the three composed clauses ─
        const assemblyDoc = await (await fetch(`${IPFS_GATEWAY}/ipfs/${cid}`)).json() as {
            slug: string;
            name: string;
            orders: Array<{
                id: string;
                clauses: Record<string, Record<string, unknown>>;
            }>;
        };
        expect(assemblyDoc.slug).toBe(slug);
        expect(assemblyDoc.orders).toHaveLength(1);
        const root = assemblyDoc.orders[0];
        // The DAG is a clause: root's figaro-topology-v1 carries empty parents.
        expect(root.clauses['figaro-topology-v1']).toEqual({ parentOrderIds: [] });
        expect(Object.keys(root.clauses).sort()).toEqual([
            'figaro-fulfilment-v2',
            'figaro-handoff-v1',
            'figaro-merchant-process-v1',
            'figaro-proximity-policy-v1',
            'figaro-topology-v1',
        ]);
        expect(root.clauses['figaro-fulfilment-v2'].modalities).toEqual(['consume-onsite']);
        expect(root.clauses['figaro-fulfilment-v2'].delivery).toBeUndefined();
        expect(root.clauses['figaro-fulfilment-v2'].handoff).toBeUndefined();
        expect(root.clauses['figaro-handoff-v1'].handoff).toEqual(['face-to-face']);
        expect(root.clauses['figaro-proximity-policy-v1'].bands).toEqual(['zone-wifi']);

        // ── It SURFACES on the marketing /assemblies inventory ─────────────
        await assertAssemblyOnInventory(page, slug);
    });
});
