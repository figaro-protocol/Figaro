/**
 * scenario-local-commerce-offset.devnet.spec.ts
 *
 * Authors the `local-commerce-offset` assembly through the real designer
 * canvas and publishes it on-chain.
 *
 * local-commerce-offset is the emissions-aware local-commerce scenario: the
 * seller-assigned two-node shape (buyer → merchant → courier), with a GHG
 * emissions-disclosure clause (`figaro-ghg-iso-14064-v1`) added to BOTH
 * sellers' orders — the merchant discloses the scope-1 emissions of
 * preparing the goods, the courier the emissions of the delivery.
 *
 * Carbon-offset retirement is NOT a designer clause — it is a runtime,
 * off-protocol, process-level action (the PreResolveOffsetPanel retires
 * offsets sized to the process's measurement attestations, anchored via
 * ProcessOffsetReceipt). The runtime spec exercises it; the assembly only
 * carries the emissions-disclosure clause that makes a process measurable.
 *
 * Drives the 2-node shape + the emissions article on each node, publishes,
 * then fetches the pinned AssemblyDocument and asserts both orders carry
 * the GHG clause.
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

const GHG_CLAUSE = 'figaro-ghg-iso-14064-v1';

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('Author + publish the local-commerce-offset assembly (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    test.setTimeout(180_000);

    test('designer canvas authors an emissions-aware local-commerce assembly and publishes it', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const assemblyRegistry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY
            ?? config.assemblyRegistry) as Hex;

        const draftName = `Local Commerce Offset ${Date.now()}`;
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

        // ── Root order: delivery / seller-assigned + emissions disclosure ──
        await orderNodes.first().click();
        await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId('drawer-tab-fulfilment').click();
        await page.getByTestId('drawer-section-fulfilment').waitFor({ state: 'visible', timeout: 5000 });

        // Selecting `delivery` spawns the courier sub-order node.
        await page.getByTestId('drawer-fulfilment-modality-delivery').click();
        await expect(orderNodes).toHaveCount(2, { timeout: 10000 });
        await page.getByTestId('drawer-fulfilment-coordination-seller-assigned').click();
        await page.getByTestId('drawer-fulfilment-handoff-face-to-face').click();

        // The merchant discloses the scope-1 emissions of preparing the goods.
        await page.getByTestId('drawer-tab-emissions').click();
        await page.getByTestId('drawer-section-emissions').waitFor({ state: 'visible', timeout: 5000 });
        await page.getByTestId(`drawer-emissions-standard-${GHG_CLAUSE}`).click();

        // ── Courier sub-order: handoff band + emissions disclosure ─────────
        const nodeTabs = page.getByTestId('drawer-node-tabs');
        await nodeTabs.waitFor({ state: 'visible', timeout: 10000 });
        await expect(nodeTabs.locator('button')).toHaveCount(2);
        await nodeTabs.locator('button').nth(1).click();
        await expect(page.getByTestId('agreement-drawer')).toBeVisible();

        await page.getByTestId('drawer-tab-fulfilment').click();
        await page.getByTestId('drawer-proximity-band-zone-wifi').click();

        // The courier discloses the scope-1 emissions of the delivery itself.
        await page.getByTestId('drawer-tab-emissions').click();
        await page.getByTestId('drawer-section-emissions').waitFor({ state: 'visible', timeout: 5000 });
        await page.getByTestId(`drawer-emissions-standard-${GHG_CLAUSE}`).click();

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

        expect(assemblyDoc.slug).toBe(slug);
        expect(assemblyDoc.orders).toHaveLength(2);
        const [rootOrder, courierOrder] = assemblyDoc.orders;
        const rootAgreement = assemblyDoc.agreements[rootOrder.agreementHash];
        const courierAgreement = assemblyDoc.agreements[courierOrder.agreementHash];
        expect(rootAgreement?.version).toBe('a1');
        expect(courierAgreement?.version).toBe('a1');

        // Root order — delivery / seller-assigned + the merchant
        // seller-process clause + the GHG emissions-disclosure clause.
        const rootClauses = rootAgreement.sections.map((s) => s.clause);
        for (const clause of [
            'figaro-commerce-v1',
            'figaro-fulfilment-v2',
            'figaro-merchant-process-v1',
            GHG_CLAUSE,
            // The disclosure standard is paired with its runtime measurement
            // clause so the seller can file grams and the buyer size offsets.
            'figaro-ghg-measurement-v1',
        ]) {
            expect(rootClauses).toContain(clause);
        }
        const fulfilment = rootAgreement.sections.find((s) => s.clause === 'figaro-fulfilment-v2');
        expect(fulfilment?.data.coordinations).toEqual(['seller-assigned']);

        // Courier sub-order — the courier seller-process clause, the
        // proximity-policy handoff clause, and the GHG emissions clause.
        const courierClauses = courierAgreement.sections.map((s) => s.clause);
        for (const clause of [
            'figaro-commerce-v1',
            'figaro-courier-process-v1',
            'figaro-proximity-policy-v1',
            GHG_CLAUSE,
            'figaro-ghg-measurement-v1',
        ]) {
            expect(courierClauses).toContain(clause);
        }

        // Capture this assemblyDoc as the seed fixture (FIGARO_CAPTURE_FIXTURES),
        // or drift-guard the live designer output against the committed one.
        const fixtureAgreements = captureOrGuardAssemblyDocument(assemblyDoc, {
            slug: 'local-commerce-offset',
            name: 'Local Commerce Offset',
        });
        expect(assemblyDoc.agreements).toEqual(fixtureAgreements);
    });
});
