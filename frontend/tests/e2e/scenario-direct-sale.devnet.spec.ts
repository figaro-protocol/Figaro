/**
 * scenario-direct-sale.devnet.spec.ts
 *
 * Authors the `direct-sale` reference assembly through the real designer
 * canvas and publishes it on-chain — the canonical V5 authoring path
 * (designer DesignSnapshot -> buildAssemblyDocument -> AssemblyRegistry).
 * No hand-authored manifest: the canvas produces the AssemblyDocument, so
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

        // ── Consume-onsite modality + face-to-face handoff + proximity band ─
        // consume-onsite is a physical modality, so proximity-applicable
        // (AgreementDrawer gates proximity on `modality !== "virtual"`);
        // selecting it does NOT spawn a courier sub-order (only delivery
        // does). The proximity band on the root order is the buyer↔merchant
        // handoff edge — the same block pickup carries.
        await page.getByTestId('drawer-tab-fulfilment').click();
        await page.getByTestId('drawer-section-fulfilment').waitFor({ state: 'visible', timeout: 5000 });
        await page.getByTestId('drawer-fulfilment-modality-consume-onsite').click();
        await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
        await page.getByTestId('drawer-fulfilment-handoff-face-to-face').click();
        await page.getByTestId('drawer-proximity-band-zone-wifi').click();

        // ── Anchor the merchant-process clause ─────────────────────────────
        // consume-onsite carries a merchant lifecycle (order-received → … →
        // handed-off) just as pickup does. Delivery auto-locks the
        // merchant-process toggle; consume-onsite does not, so toggle it.
        await page.getByTestId('drawer-tab-attestations').click();
        await page.getByTestId('drawer-include-figaro-merchant-process-v1').click();

        // Name + publish.
        await page.getByTestId('designer-name-input').fill(draftName);
        await expect(page.getByTestId('designer-publish')).toBeEnabled({ timeout: 5000 });
        await page.getByTestId('designer-publish').click();

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
        const manifest = await (await fetch(`${IPFS_GATEWAY}/ipfs/${cid}`)).json() as {
            slug: string;
            orders: Array<{ agreementHash: string }>;
            agreements: Record<string, {
                version: string;
                sections: Array<{ clause: string; data: Record<string, unknown> }>;
            }>;
        };

        // V5 AssemblyDocument — one root order, one agreement.
        expect(manifest.slug).toBe(slug);
        expect(manifest.orders).toHaveLength(1);
        const agreement = manifest.agreements[manifest.orders[0].agreementHash];
        expect(agreement?.version).toBe('a1');

        // direct-sale's clause set — a consume-onsite root order with handoff
        // certification carries commerce + fulfilment + geo + jurisdiction +
        // proximity-policy + proximity-proof + merchant-process + topology.
        // Geo is default-on by RPGF design (clauses feeding the analytics
        // graphs are incentivised — see memory reference_analytics_graph_rpgf).
        // Distinct from pickup only by modality: the handoff-cert stack is
        // identical (proximity-* + merchant-process on a 1-node graph).
        expect(agreement.sections.map((s) => s.clause).sort()).toEqual([
            'figaro-arbitration-kleros-v1',
            'figaro-commerce-v1',
            'figaro-fulfilment-v2',
            'figaro-geo-v2',
            'figaro-merchant-process-v1',
            'figaro-proximity-policy-v1',
            'figaro-proximity-proof-v1',
            'figaro-topology-v1',
        ]);

        // One node, consume-onsite, face-to-face handoff, zone-wifi band —
        // no courier sub-order.
        const fulfilment = agreement.sections.find((s) => s.clause === 'figaro-fulfilment-v2');
        expect(fulfilment?.data.modalities).toEqual(['consume-onsite']);
        expect(fulfilment?.data.coordinations).toBeUndefined();
        expect(fulfilment?.data.handoffPoints).toEqual(['face-to-face']);
        const proximity = agreement.sections.find((s) => s.clause === 'figaro-proximity-policy-v1');
        expect(proximity?.data.bands).toEqual(['zone-wifi']);
        const topology = agreement.sections.find((s) => s.clause === 'figaro-topology-v1');
        expect(topology?.data.topologyMode).toBe('root');

        // Capture this manifest as the seed fixture (FIGARO_CAPTURE_FIXTURES),
        // or drift-guard the live designer output against the committed one.
        const fixtureAgreements = captureOrGuardAssemblyDocument(manifest, {
            slug: 'direct-sale',
            name: 'Direct Sale',
        });
        expect(manifest.agreements).toEqual(fixtureAgreements);
    });
});
