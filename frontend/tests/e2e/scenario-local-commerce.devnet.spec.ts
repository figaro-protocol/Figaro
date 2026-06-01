/**
 * scenario-local-commerce.devnet.spec.ts
 *
 * Authors the `local-commerce` reference assembly through the real
 * designer canvas and publishes it on-chain.
 *
 * local-commerce is the multi-node scenario — buyer -> merchant -> courier.
 * The root order (merchant) carries delivery fulfilment; selecting
 * `delivery` spawns a courier sub-order node, whose agreement carries a
 * topology clause linking back to the root.
 *
 * Coordination: this base scenario uses `seller-assigned` delivery — the
 * merchant organizes the courier directly, no auction — matching the
 * retired reference's `defaultRootFulfilment: "deliver:seller-assigned"`.
 * `figaro-fulfilment-v2` requires a non-empty `coordinations` array once
 * `delivery` is a modality. The `dutch-auction` and `buyer-assigned`
 * coordinations are separate scenario cells.
 *
 * The agreement drawer carries a tab per graph node — the walk uses the
 * courier node's tab to author its handoff clause (a proximity band).
 * The handoff point is set on the root order's fulfilment clause.
 *
 * Drives the 2-node shape, publishes, then fetches the pinned
 * AssemblyDocument back and asserts both orders' clause sets — including
 * the courier sub-order's topology clause linking back to the root.
 *
 * A unique slug per run keeps the spec repeatable against the
 * first-write-wins AssemblyRegistry.
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

test.describe('Author + publish the local-commerce assembly (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    test.setTimeout(180_000);

    test('designer canvas authors a two-node seller-assigned delivery assembly and publishes it', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const assemblyRegistry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY
            ?? config.assemblyRegistry) as Hex;

        const draftName = `Local Commerce ${Date.now()}`;
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

        const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
        await expect(orderNodes).toHaveCount(1, { timeout: 10000 });

        // ── Root order: delivery modality + seller-assigned coordination ──
        await orderNodes.first().click();
        await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId('drawer-tab-fulfilment').click();
        await page.getByTestId('drawer-section-fulfilment').waitFor({ state: 'visible', timeout: 5000 });

        // Selecting `delivery` spawns the courier sub-order node.
        await page.getByTestId('drawer-fulfilment-modality-delivery').click();
        await expect(orderNodes).toHaveCount(2, { timeout: 10000 });

        // Coordination is required once `delivery` is offered. seller-assigned
        // = the merchant organizes the courier directly (no auction).
        await page.getByTestId('drawer-fulfilment-coordination-seller-assigned').click();

        // Handoff point — where the physical exchange occurs; a field on the
        // root order's figaro-fulfilment-v2 clause.
        await page.getByTestId('drawer-fulfilment-handoff-face-to-face').click();

        // ── Courier sub-order ─────────────────────────────────────────────
        // Each graph node has its own tab in the agreement drawer — the
        // node-tab row surfaces the spawned courier sub-order without a
        // canvas click.
        const nodeTabs = page.getByTestId('drawer-node-tabs');
        await nodeTabs.waitFor({ state: 'visible', timeout: 10000 });
        await expect(nodeTabs.locator('button')).toHaveCount(2);
        await nodeTabs.locator('button').nth(1).click();
        await expect(page.getByTestId('agreement-drawer')).toBeVisible();

        // Author the courier handoff — a proximity band on the courier
        // order. The selector is enabled on a courier sub-order (inherent
        // physical handoff); figaro-proximity-policy-v1 is the clause the
        // courier's runtime proximity proof checks against.
        await page.getByTestId('drawer-tab-fulfilment').click();
        await page.getByTestId('drawer-proximity-band-zone-wifi').click();

        // ── Name + publish ────────────────────────────────────────────────
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

        // ── On-chain: AssemblyRegistered, then fetch the assemblyDoc ─────────
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

        // ── Verify the published AssemblyDocument ─────────────────────────
        const cid = metadataURI.slice('ipfs://'.length);
        const assemblyDoc = await (await fetch(`${IPFS_GATEWAY}/ipfs/${cid}`)).json() as {
            slug: string;
            orders: Array<{ id: string; agreementHash: string }>;
            agreements: Record<string, {
                version: string;
                sections: Array<{ clause: string; data: Record<string, unknown> }>;
            }>;
        };

        // V5 AssemblyDocument — two orders: root (merchant) + courier sub-order.
        expect(assemblyDoc.slug).toBe(slug);
        expect(assemblyDoc.orders).toHaveLength(2);
        const [rootOrder, courierOrder] = assemblyDoc.orders;
        const rootAgreement = assemblyDoc.agreements[rootOrder.agreementHash];
        const courierAgreement = assemblyDoc.agreements[courierOrder.agreementHash];
        expect(rootAgreement?.version).toBe('a1');
        expect(courierAgreement?.version).toBe('a1');

        // Root order — delivery / seller-assigned, plus the merchant
        // seller-process clause. Geo is default-on by RPGF design (see
        // memory reference_analytics_graph_rpgf).
        expect(rootAgreement.sections.map((s) => s.clause).sort()).toEqual([
            'figaro-arbitration-kleros-v1',
            'figaro-commerce-v1',
            'figaro-fulfilment-v2',
            'figaro-geo-v2',
            'figaro-merchant-process-v1',
            'figaro-topology-v1',
        ]);
        const fulfilment = rootAgreement.sections.find((s) => s.clause === 'figaro-fulfilment-v2');
        expect(fulfilment?.data.modalities).toEqual(['delivery']);
        expect(fulfilment?.data.coordinations).toEqual(['seller-assigned']);
        expect(fulfilment?.data.handoffPoints).toEqual(['face-to-face']);
        const rootTopology = rootAgreement.sections.find((s) => s.clause === 'figaro-topology-v1');
        expect(rootTopology?.data.topologyMode).toBe('root');

        // Courier sub-order — the courier seller-process clause, the
        // authored proximity-policy handoff clause + its proximity-proof
        // placeholder leaf, and a topology section linking back to the root.
        expect(courierAgreement.sections.map((s) => s.clause).sort()).toEqual([
            'figaro-arbitration-kleros-v1',
            'figaro-commerce-v1',
            'figaro-courier-process-v1',
            'figaro-geo-v2',
            'figaro-proximity-policy-v1',
            'figaro-proximity-proof-v1',
            'figaro-topology-v1',
        ]);
        const courierProximity = courierAgreement.sections.find((s) => s.clause === 'figaro-proximity-policy-v1');
        expect(courierProximity?.data.bands).toEqual(['zone-wifi']);
        const courierTopology = courierAgreement.sections.find((s) => s.clause === 'figaro-topology-v1');
        expect(courierTopology?.data.topologyMode).toBe('explicit');
        expect(courierTopology?.data.parentOrderHashes).toEqual([rootOrder.id]);

        // Capture this assemblyDoc as the seed fixture (FIGARO_CAPTURE_FIXTURES),
        // or drift-guard the live designer output against the committed one.
        const fixtureAgreements = captureOrGuardAssemblyDocument(assemblyDoc, {
            slug: 'local-commerce',
            name: 'Local Commerce',
        });
        expect(assemblyDoc.agreements).toEqual(fixtureAgreements);
    });
});
