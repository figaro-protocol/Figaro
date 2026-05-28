/**
 * scenario-local-commerce-pickup.devnet.spec.ts
 *
 * Authors the `local-commerce-pickup` reference assembly through the real
 * designer canvas and publishes it on-chain.
 *
 * Pickup is the one-node-with-handoff-certification scenario — buyer
 * collects the order from the merchant's premises. Structurally it sits
 * between direct-sale (one node, no handoff cert) and local-commerce
 * (two nodes — merchant + courier — handoff cert on the courier edge):
 *   - Topology:   one root order (no courier sub-order spawns for pickup).
 *   - Handoff:    the buyer↔merchant handoff IS the certification edge.
 *                 Proximity-policy + proximity-proof clauses anchor the
 *                 root order so both parties can attest at pickup time
 *                 via the existing primitives (attestAsBuyer for the
 *                 buyer's witness, signalWithProof for the merchant's).
 *   - Lifecycle:  the merchant runs the prep → ready → handed-off
 *                 lifecycle, so merchant-process is anchored too.
 *
 * Demonstrates the composition principle in CLAUDE.md "What Figaro Is":
 * the handoff/proximity blocks snap onto a 1-node graph just as they
 * snap onto the 2-node delivery graph — same primitives, different
 * counterparty pair.
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

test.describe('Author + publish the local-commerce-pickup assembly (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    test.setTimeout(180_000);

    test('designer canvas authors a one-node pickup-with-handoff-certification assembly and publishes it', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const assemblyRegistry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY
            ?? config.assemblyRegistry) as Hex;

        const draftName = `Local Commerce Pickup ${Date.now()}`;
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

        // ── Pickup modality + face-to-face handoff + proximity band ────────
        // Pickup is a physical modality, so proximity-applicable; selecting it
        // does NOT spawn a courier sub-order (only delivery does). The
        // proximity band on the root order is the buyer↔merchant handoff edge.
        await page.getByTestId('drawer-tab-fulfilment').click();
        await page.getByTestId('drawer-section-fulfilment').waitFor({ state: 'visible', timeout: 5000 });
        await page.getByTestId('drawer-fulfilment-modality-pickup').click();
        await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
        await page.getByTestId('drawer-fulfilment-handoff-face-to-face').click();
        await page.getByTestId('drawer-proximity-band-zone-wifi').click();

        // ── Anchor the merchant-process clause ─────────────────────────────
        // Pickup carries a merchant lifecycle (order-received → … →
        // handed-off) just as delivery does. Delivery auto-locks the
        // merchant-process toggle; pickup does not, so toggle it manually.
        await page.getByTestId('drawer-tab-attestations').click();
        await page.getByTestId('drawer-include-figaro-merchant-process-v1').click();

        // ── Name + publish ─────────────────────────────────────────────────
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

        // ── On-chain: AssemblyRegistered, then fetch the manifest ──────────
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

        // ── Verify the published AssemblyManifest ──────────────────────────
        const cid = metadataURI.slice('ipfs://'.length);
        const manifest = await (await fetch(`${IPFS_GATEWAY}/ipfs/${cid}`)).json() as {
            slug: string;
            orders: Array<{ id: string; agreementHash: string }>;
            agreements: Record<string, {
                version: string;
                sections: Array<{ schema: string; data: Record<string, unknown> }>;
            }>;
        };

        // V5 AssemblyManifest — one root order, one agreement. Shares the
        // handoff-cert stack with direct-sale (consume-onsite) — proximity-
        // policy + proximity-proof + merchant-process on a 1-node graph; the
        // two differ only by fulfilment modality (pickup vs consume-onsite).
        // Distinct from local-commerce (no courier sub-order). Demonstrates
        // the snap-together principle: proximity-policy + proximity-proof are
        // the same blocks the local-commerce courier carries, applied to a
        // 1-node graph.
        expect(manifest.slug).toBe(slug);
        expect(manifest.orders).toHaveLength(1);
        const agreement = manifest.agreements[manifest.orders[0].agreementHash];
        expect(agreement?.version).toBe('a1');
        expect(agreement.sections.map((s) => s.schema).sort()).toEqual([
            'figaro-arbitration-kleros-v1',
            'figaro-commerce-v1',
            'figaro-fulfilment-v2',
            'figaro-geo-v2',
            'figaro-merchant-process-v1',
            'figaro-proximity-policy-v1',
            'figaro-proximity-proof-v1',
            'figaro-topology-v1',
        ]);

        // One node, pickup modality, face-to-face handoff, zone-wifi band.
        const fulfilment = agreement.sections.find((s) => s.schema === 'figaro-fulfilment-v2');
        expect(fulfilment?.data.modalities).toEqual(['pickup']);
        expect(fulfilment?.data.coordinations).toBeUndefined();
        expect(fulfilment?.data.handoffPoints).toEqual(['face-to-face']);
        const proximity = agreement.sections.find((s) => s.schema === 'figaro-proximity-policy-v1');
        expect(proximity?.data.bands).toEqual(['zone-wifi']);
        const topology = agreement.sections.find((s) => s.schema === 'figaro-topology-v1');
        expect(topology?.data.topologyMode).toBe('root');

        // Capture this manifest as the seed fixture (FIGARO_CAPTURE_FIXTURES),
        // or drift-guard the live designer output against the committed one.
        const fixtureAgreements = captureOrGuardAssemblyManifest(manifest, {
            slug: 'local-commerce-pickup',
            name: 'Local Commerce Pickup',
        });
        expect(manifest.agreements).toEqual(fixtureAgreements);
    });
});
