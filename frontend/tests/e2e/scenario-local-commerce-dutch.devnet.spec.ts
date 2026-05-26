/**
 * scenario-local-commerce-dutch.devnet.spec.ts
 *
 * Authors the `local-commerce-dutch` reference assembly through the real
 * designer canvas and publishes it on-chain — the dutch-auction-coordination
 * variant of `local-commerce`.
 *
 * This spec MIGRATES the assembly off a hand-coded fixture: the seed's
 * `local-commerce-dutch.manifest.json` is now captured from the live
 * designer (FIGARO_CAPTURE_FIXTURES), exactly like `local-commerce` and
 * `direct-sale`. The two-node shape is identical to `scenario-local-commerce`;
 * the only difference is the courier coordination — `dutch-auction` (the
 * courier job is auctioned) rather than `seller-assigned`.
 *
 * Drives the 2-node shape, publishes, fetches the pinned AssemblyManifest
 * back, asserts both orders' clause sets, and captures / drift-guards the
 * `local-commerce-dutch` seed fixture.
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
    captureOrGuardAssemblyManifest,
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

test.describe('Author + publish the local-commerce-dutch assembly (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    test.setTimeout(180_000);

    test('designer canvas authors a two-node dutch-auction delivery assembly and publishes it', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const assemblyRegistry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY
            ?? config.assemblyRegistry) as Hex;

        const draftName = `Local Commerce Dutch ${Date.now()}`;
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

        // ── Root order: delivery modality + dutch-auction coordination ──
        await orderNodes.first().click();
        await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId('drawer-tab-fulfilment').click();
        await page.getByTestId('drawer-section-fulfilment').waitFor({ state: 'visible', timeout: 5000 });

        // Selecting `delivery` spawns the courier sub-order node.
        await page.getByTestId('drawer-fulfilment-modality-delivery').click();
        await expect(orderNodes).toHaveCount(2, { timeout: 10000 });

        // Coordination is required once `delivery` is offered. dutch-auction
        // = the courier job is auctioned; the courier is not pre-designated.
        await page.getByTestId('drawer-fulfilment-coordination-dutch-auction').click();

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

        // Author the courier handoff — a proximity band on the courier order.
        await page.getByTestId('drawer-tab-fulfilment').click();
        await page.getByTestId('drawer-proximity-band-zone-wifi').click();

        // ── Name + publish ────────────────────────────────────────────────
        await page.getByTestId('designer-name-input').fill(draftName);
        await expect(page.getByTestId('designer-publish')).toBeEnabled({ timeout: 5000 });
        await page.getByTestId('designer-publish').click();

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

        // ── On-chain: AssemblyRegistered, then fetch the manifest ─────────
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

        // ── Verify the published AssemblyManifest ─────────────────────────
        const cid = metadataURI.slice('ipfs://'.length);
        const manifest = await (await fetch(`${IPFS_GATEWAY}/ipfs/${cid}`)).json() as {
            slug: string;
            orders: Array<{ id: string; agreementHash: string }>;
            agreements: Record<string, {
                version: string;
                sections: Array<{ schema: string; data: Record<string, unknown> }>;
            }>;
        };

        // V5 AssemblyManifest — two orders: root (merchant) + courier sub-order.
        expect(manifest.slug).toBe(slug);
        expect(manifest.orders).toHaveLength(2);
        const [rootOrder, courierOrder] = manifest.orders;
        const rootAgreement = manifest.agreements[rootOrder.agreementHash];
        const courierAgreement = manifest.agreements[courierOrder.agreementHash];
        expect(rootAgreement?.version).toBe('a1');
        expect(courierAgreement?.version).toBe('a1');

        // Root order — delivery / dutch-auction, plus the merchant
        // operator-process clause. Geo is default-on by RPGF design.
        expect(rootAgreement.sections.map((s) => s.schema).sort()).toEqual([
            'figaro-arbitration-kleros-v1',
            'figaro-commerce-v1',
            'figaro-fulfilment-v2',
            'figaro-geo-v2',
            'figaro-merchant-process-v1',
            'figaro-topology-v1',
        ]);
        const fulfilment = rootAgreement.sections.find((s) => s.schema === 'figaro-fulfilment-v2');
        expect(fulfilment?.data.modalities).toEqual(['delivery']);
        expect(fulfilment?.data.coordinations).toEqual(['dutch-auction']);
        expect(fulfilment?.data.handoffPoints).toEqual(['face-to-face']);
        const rootTopology = rootAgreement.sections.find((s) => s.schema === 'figaro-topology-v1');
        expect(rootTopology?.data.topologyMode).toBe('root');

        // Courier sub-order — the courier operator-process clause, the
        // authored proximity-policy handoff clause + its proximity-proof
        // placeholder leaf, and a topology section linking back to the root.
        expect(courierAgreement.sections.map((s) => s.schema).sort()).toEqual([
            'figaro-arbitration-kleros-v1',
            'figaro-commerce-v1',
            'figaro-courier-process-v1',
            'figaro-geo-v2',
            'figaro-proximity-policy-v1',
            'figaro-proximity-proof-v1',
            'figaro-topology-v1',
        ]);
        const courierProximity = courierAgreement.sections.find((s) => s.schema === 'figaro-proximity-policy-v1');
        expect(courierProximity?.data.bands).toEqual(['zone-wifi']);
        const courierTopology = courierAgreement.sections.find((s) => s.schema === 'figaro-topology-v1');
        expect(courierTopology?.data.topologyMode).toBe('explicit');
        expect(courierTopology?.data.parentOrderHashes).toEqual([rootOrder.id]);

        // Capture this manifest as the seed fixture (FIGARO_CAPTURE_FIXTURES),
        // or drift-guard the live designer output against the committed one.
        const fixtureAgreements = captureOrGuardAssemblyManifest(manifest, {
            slug: 'local-commerce-dutch',
            name: 'Local Commerce (Dutch auction)',
        });
        expect(manifest.agreements).toEqual(fixtureAgreements);
    });
});
