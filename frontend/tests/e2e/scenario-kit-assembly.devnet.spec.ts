/**
 * scenario-kit-assembly.devnet.spec.ts
 *
 * Authors the `kit-assembly` reference assembly through the real designer
 * canvas and publishes it on-chain — the first assembly whose TOPOLOGY is a
 * diamond (a fan-in join), closing the topology-coverage gap where no shipped
 * assembly had a node with more than one parent.
 *
 * The diamond is a topology-layer construct only — the core sees a linear
 * sequence of commits extending one cumulative-value accumulator and is
 * indifferent to the DAG shape. The four ORDERS (the buyer is the common
 * rootBuyer of all four, never a node) form:
 *
 *        A  (root)
 *       / \
 *      B   C        A→B, A→C, B→D, C→D
 *       \ /
 *        D  (join — figaro-topology-v1.parentOrderHashes = [B, C])
 *
 * Authored through the node click affordances on the canvas (the
 * keyboard-accessible companions to the drag-from-handle path):
 *   - each node's "+sub-order" button spawns a child of that node
 *     (onAddSubOrder);
 *   - each node's "add parent" picker adds an existing order as an
 *     additional parent (onAddParent → the join).
 * The agreement drawer's node-tab row then surfaces all four nodes for
 * per-node clause editing.
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
import type { Page } from '@playwright/test';
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

/** Current React Flow node ids on the canvas, in DOM order. Each node wrapper
 *  carries `data-id="<orderId>"`; the synthetic order id doubles as the
 *  topology parent reference. */
async function nodeIds(page: Page): Promise<string[]> {
    return page.locator('.react-flow__node').evaluateAll(
        (els) => els.map((e) => (e as HTMLElement).dataset.id ?? '').filter(Boolean),
    );
}

/** Click a node's "+sub-order" affordance → spawns a sub-order child of
 *  `parentId`. Returns the id of the newly-created node. */
async function addSubOrder(page: Page, parentId: string): Promise<string> {
    const before = new Set(await nodeIds(page));
    await page.getByTestId(`btn-add-suborder-${parentId}`).click();
    await expect(page.locator('.react-flow__node')).toHaveCount(before.size + 1, { timeout: 10000 });
    const after = await nodeIds(page);
    const created = after.find((id) => !before.has(id));
    if (!created) throw new Error(`add-sub on ${parentId} did not create a node`);
    return created;
}

/** Select `parentId` in `childId`'s add-parent picker → adds `parentId` as an
 *  additional parent of `childId` (the many-to-one merge / join). */
async function addParent(page: Page, childId: string, parentId: string): Promise<void> {
    await page.getByTestId(`select-add-parent-${childId}`).selectOption(parentId);
}

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('Author + publish the kit-assembly diamond (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // Multi-node authoring + IPFS pin + on-chain tx.
    test.setTimeout(180_000);

    test('designer canvas authors a four-node diamond and publishes it', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const assemblyRegistry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY
            ?? config.assemblyRegistry) as Hex;

        const draftName = `Kit Assembly ${Date.now()}`;
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

        // Blank seed = one root order (A).
        const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
        await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
        const [a] = await nodeIds(page);

        // ── Author the diamond via the node click affordances ──────────────
        // A → B, A → C: two siblings off the root (each via A's +sub button).
        // B → D: D starts as B's child. Then merge C as D's second parent
        // through D's add-parent picker → the fan-in join.
        const b = await addSubOrder(page, a);
        const c = await addSubOrder(page, a);
        const d = await addSubOrder(page, b);
        await addParent(page, d, c);
        await expect(orderNodes).toHaveCount(4, { timeout: 10000 });
        // No merge rejection (self-loop / cycle / duplicate).
        await expect(page.getByTestId('designer-merge-notice')).toHaveCount(0);

        // ── Compose registry clauses across the four nodes via the drawer ──
        // The drawer's node-tab row surfaces all four orders (the per-node
        // authoring surface, not just the canvas). Each sub-order also gets a
        // DISTINCT counterparty-key clause so the checkout resolves its seller
        // from the seller's counterpartyBindings; the root's seller is the
        // browsed seller. The spread exercises the registry across one
        // assembly: commerce / fulfilment / geo / topology / arbitration on
        // every node, plus merchant-process (A), proximity (B + D), GHG (C).
        await page.getByTestId(`order-node-${a}`).click();
        await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
        const nodeTabs = page.getByTestId('drawer-node-tabs');
        await nodeTabs.waitFor({ state: 'visible', timeout: 10000 });
        await expect(nodeTabs.locator('button')).toHaveCount(4);

        // A (root): merchant lifecycle.
        await page.getByTestId(`drawer-node-tab-${a}`).click();
        await page.getByTestId('drawer-tab-attestations').click();
        await page.getByTestId('drawer-include-figaro-merchant-process-v1').click();

        // B: a proximity handoff clause. A physical modality (pickup — spawns
        // no sub-order) enables the proximity controls. (The merchant-process /
        // courier-process toggles are role-gated to the root and to
        // delivery-spawned courier orders respectively, so a generic
        // click-authored sub-order carries neither — proximity-policy is B's
        // distinct counterparty key.)
        await page.getByTestId(`drawer-node-tab-${b}`).click();
        await page.getByTestId('drawer-tab-fulfilment').click();
        await page.getByTestId('drawer-section-fulfilment').waitFor({ state: 'visible', timeout: 5000 });
        await page.getByTestId('drawer-fulfilment-modality-pickup').click();
        await page.getByTestId('drawer-fulfilment-handoff-face-to-face').click();
        await page.getByTestId('drawer-proximity-band-zone-wifi').click();

        // C: emissions disclosure (figaro-ghg-protocol-v1 pairs with its
        // measurement clause — the counterparty key for this node).
        await page.getByTestId(`drawer-node-tab-${c}`).click();
        await page.getByTestId('drawer-tab-emissions').click();
        await page.getByTestId('drawer-emissions-standard-figaro-ghg-protocol-v1').click();

        // D (join): a proximity handoff clause too. proximity-policy is the
        // counterparty key shared with B — the checkout's bindingCursor hands
        // B and D distinct wallets from the roster by commit order, so two
        // siblings can share one clause key without a per-node clause.
        await page.getByTestId(`drawer-node-tab-${d}`).click();
        await page.getByTestId('drawer-tab-fulfilment').click();
        await page.getByTestId('drawer-section-fulfilment').waitFor({ state: 'visible', timeout: 5000 });
        await page.getByTestId('drawer-fulfilment-modality-pickup').click();
        await page.getByTestId('drawer-fulfilment-handoff-face-to-face').click();
        await page.getByTestId('drawer-proximity-band-zone-wifi').click();

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
                .some((btn) => btn.textContent?.trim() === 'Connect Wallet'),
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

        // ── Verify the published AssemblyManifest topology ─────────────────
        const cid = metadataURI.slice('ipfs://'.length);
        const manifest = await (await fetch(`${IPFS_GATEWAY}/ipfs/${cid}`)).json() as {
            slug: string;
            orders: Array<{ id: string; agreementHash: string }>;
            agreements: Record<string, {
                version: string;
                sections: Array<{ clause: string; data: Record<string, unknown> }>;
            }>;
        };

        expect(manifest.slug).toBe(slug);
        expect(manifest.orders).toHaveLength(4);

        // Per-order topology parents (figaro-topology-v1.parentOrderHashes).
        const parentsByOrder = new Map<string, string[]>();
        for (const order of manifest.orders) {
            const ag = manifest.agreements[order.agreementHash];
            const topo = ag.sections.find((s) => s.clause === 'figaro-topology-v1');
            parentsByOrder.set(order.id, (topo?.data.parentOrderHashes as string[] | undefined) ?? []);
        }
        const parentCounts = [...parentsByOrder.values()].map((p) => p.length).sort();
        // The diamond's signature: one root (0), two middles (1 each), one join (2).
        expect(parentCounts).toEqual([0, 1, 1, 2]);

        const rootId = [...parentsByOrder.entries()].find(([, p]) => p.length === 0)![0];
        const middles = [...parentsByOrder.entries()].filter(([, p]) => p.length === 1).map(([id]) => id);
        const join = [...parentsByOrder.entries()].find(([, p]) => p.length === 2)!;
        // Both middles descend from the single root.
        for (const m of middles) {
            expect(parentsByOrder.get(m)).toEqual([rootId]);
        }
        // The join's two parents are exactly the two middles.
        expect([...join[1]].sort()).toEqual([...middles].sort());

        // Clause spread composed across the nodes — each runtime-attestable /
        // counterparty-key clause lands on exactly one node.
        const countWith = (clause: string) =>
            manifest.orders.filter((o) =>
                manifest.agreements[o.agreementHash].sections.some((s) => s.clause === clause),
            ).length;
        expect(countWith('figaro-merchant-process-v1')).toBe(1); // A — lifecycle
        expect(countWith('figaro-proximity-policy-v1')).toBe(2); // B + D — shared counterparty key
        expect(countWith('figaro-ghg-measurement-v1')).toBe(1);  // C — emissions

        // Capture this manifest as the seed fixture (FIGARO_CAPTURE_FIXTURES),
        // or drift-guard the live designer output against the committed one.
        const fixtureAgreements = captureOrGuardAssemblyManifest(manifest, {
            slug: 'kit-assembly',
            name: 'Kit Assembly',
        });
        expect(manifest.agreements).toEqual(fixtureAgreements);
    });
});
