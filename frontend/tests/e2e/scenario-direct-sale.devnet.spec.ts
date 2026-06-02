/**
 * scenario-direct-sale.devnet.spec.ts
 *
 * Authors the `direct-sale` reference assembly through the real designer
 * canvas and publishes it on-chain — the canonical V5 authoring path
 * (designer DesignSnapshot -> buildAssemblyDocument -> AssemblyRegistry).
 * No hand-authored assemblyDoc: the canvas produces the AssemblyDocument, so
 * its shape is correct by construction.
 *
 * direct-sale is the one-node consume-onsite scenario — a single root
 * order, buyer <-> merchant, no courier, no sub-orders. The buyer↔merchant
 * handoff IS the certification edge: proximity-policy + proximity-proof
 * anchor the root order so both parties attest at handoff time, and the
 * merchant runs the order-received → … → handed-off lifecycle. Same
 * handoff-cert stack pickup carries (scenario-local-commerce-pickup),
 * applied to a consume-onsite order rather than a pickup one — the
 * snap-together principle: the handoff blocks attach to any physical
 * modality, not just pickup/delivery.
 *
 * Drives the canvas to that shape, publishes, then fetches the pinned
 * AssemblyDocument back and asserts its clause set: commerce, fulfilment
 * (consume-onsite + face-to-face handoff), geo, jurisdiction, proximity-
 * policy + proximity-proof, merchant-process, topology.
 *
 * A unique slug per run keeps the spec repeatable against the
 * first-write-wins AssemblyRegistry (mirrors designer-publish.devnet).
 *
 * Requires Anvil + ./deploy-local.sh + Kubo.
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
    captureOrGuardAssemblyDocument,
    normalizeAssemblyTemplateOrders,
    evmRevert,
    evmSnapshot,
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

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('Author + publish the direct-sale assembly (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // Multi-route nav + IPFS pin + on-chain tx.
    test.setTimeout(180_000);

    test('designer canvas authors a one-node consume-onsite-with-handoff-certification assembly and publishes it', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const assemblyRegistry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY
            ?? config.assemblyRegistry) as Hex;

        const draftName = `Direct Sale ${Date.now()}`;
        const slug = draftName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

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

        // ── Compose clauses in the Registry tab ────────────────────────────
        // The drawer is network-driven: every registered clause is a checkbox
        // grouped by its article; checking one reveals its single-select
        // design-time fields. consume-onsite is a physical modality (no courier
        // sub-order — only delivery spawns one); the proximity band on the root
        // is the buyer↔merchant handoff edge; merchant-process anchors the
        // consume-onsite lifecycle (order-received → … → handed-off).
        await page.getByTestId('drawer-tab-registry').click();
        await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });

        await page.getByTestId('drawer-registry-clause-figaro-fulfilment-v2').check();
        await page.getByTestId('drawer-field-figaro-fulfilment-v2-modalities-consume-onsite').check();
        await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
        await page.getByTestId('drawer-field-figaro-fulfilment-v2-handoffPoints-face-to-face').check();

        await page.getByTestId('drawer-registry-clause-figaro-proximity-policy-v1').check();
        await page.getByTestId('drawer-field-figaro-proximity-policy-v1-bands-zone-wifi').check();

        await page.getByTestId('drawer-registry-clause-figaro-merchant-process-v1').check();

        // Name + publish.
        await page.getByTestId('designer-name-input').fill(draftName);
        await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
        await page.getByTestId('designer-review').click();

        // Canvas navigates to /view/<slug>?intent=publish but drops the
        // ?e2e= param — re-goto with it appended (per designer-publish.devnet).
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

        // ── On-chain: AssemblyRegistered for the authored slug ──────────
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const events = await publicClient.getContractEvents({
            address: assemblyRegistry,
            abi: ASSEMBLY_REGISTRY_ABI,
            eventName: 'AssemblyRegistered',
            args: { slugHash: keccak256(toHex(slug)) },
            fromBlock: 0n,
        });
        expect(events.length).toBe(1);
        const metadataURI = events[0].args.metadataURI as string;
        expect(metadataURI).toMatch(/^ipfs:\/\//);

        // ── Verify the published AssemblyDocument ───────────────────────
        const cid = metadataURI.slice('ipfs://'.length);
        const assemblyDoc = await (await fetch(`${IPFS_GATEWAY}/ipfs/${cid}`)).json() as {
            slug: string;
            name: string;
            orders: Array<{
                id: string;
                buyer: string;
                seller: string;
                parentOrderIds: string[];
                clauses: Record<string, Record<string, unknown>>;
            }>;
        };

        // The published artifact is the no-hash TEMPLATE — one root order, no
        // agreements/hashes. It carries ONLY the designer's explicit clause
        // selections; commerce / topology / geo / proximity-proof are added at
        // commit time by the buildOrderAgreement projection, not baked here.
        expect(assemblyDoc.slug).toBe(slug);
        expect(assemblyDoc.orders).toHaveLength(1);
        const root = assemblyDoc.orders[0];
        expect(root.parentOrderIds).toEqual([]);

        // The three clauses composed in the Registry tab: consume-onsite
        // fulfilment + face-to-face handoff, the proximity-policy handoff edge,
        // and the merchant-process lifecycle anchor.
        expect(Object.keys(root.clauses).sort()).toEqual([
            'figaro-fulfilment-v2',
            'figaro-merchant-process-v1',
            'figaro-proximity-policy-v1',
        ]);
        expect(root.clauses['figaro-fulfilment-v2'].modalities).toEqual(['consume-onsite']);
        expect(root.clauses['figaro-fulfilment-v2'].coordinations).toBeUndefined();
        expect(root.clauses['figaro-fulfilment-v2'].handoffPoints).toEqual(['face-to-face']);
        expect(root.clauses['figaro-proximity-policy-v1'].bands).toEqual(['zone-wifi']);

        // Capture this template as the seed fixture (FIGARO_CAPTURE_FIXTURES),
        // or drift-guard the live designer output against the committed one
        // (normalized so per-run order ids don't register as drift).
        const fixtureOrders = captureOrGuardAssemblyDocument(assemblyDoc, {
            slug: 'direct-sale',
            name: 'Direct Sale',
        });
        expect(normalizeAssemblyTemplateOrders(assemblyDoc.orders)).toEqual(fixtureOrders);
    });
});
