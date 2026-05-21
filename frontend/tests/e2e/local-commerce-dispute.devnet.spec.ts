/**
 * local-commerce-dispute.devnet.spec.ts
 *
 * The dispute variant of the local-commerce scenario — Layer 3 of the
 * three-layer dispute model (figaro3e). Layers 1 (bonding) and 2 (peer
 * coordination) are kernel mechanisms; Layer 3 is the off-chain forum, and
 * the parties' agreement NAMES it. The buyer commits the local-commerce
 * process, then escalates from /audit/[processId] to the forum the
 * assembly's figaro-jurisdiction-v1 clause authored.
 *
 * The point of this spec is that the dispute is CLAUSE-DRIVEN: the recourse
 * forum surfaced — and the Kleros court the dispute is raised on — come from
 * the assembly's authored jurisdiction clause, not a global default.
 *   1. Buyer commits the local-commerce process (food + courier orders).
 *   2. /audit/[processId] surfaces the recourse the clause authored —
 *      Kleros, General Court (the local-commerce assembly's preselected
 *      default).
 *   3. Raise dispute → the createDispute arbitratorExtraData encodes
 *      subcourt 1 + 3 jurors — the clause's court, read off the committed
 *      agreement.
 *   4. Submit the audit-bundle as Kleros evidence.
 *
 * The merchant/courier coordination is covered by local-commerce-scenario;
 * this spec adds the Layer-3 recourse path on the multi-order process.
 *
 * Requires Anvil + ./deploy-local.sh + ./deploy-mock-kleros.sh + Kubo +
 * a seeded devnet.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import {
    createPublicClient,
    defineChain,
    encodeAbiParameters,
    http,
    parseAbi,
    type Hex,
} from 'viem';
import {
    ensureTokenApprovals,
    evmRevert,
    evmSnapshot,
    readLocalDeploymentConfig,
    waitForWalletConnected,
} from './devnet-helpers';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

// Buyer — anvil[0], the default ?e2e=devnet account.
const BUYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const BUYER_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
// Mercato General — seeded merchant, anvil[8]; bound to local-commerce.
const MERCATO_ADDR = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f' as const;

const catalogueFixture = JSON.parse(
    fs.readFileSync(
        path.resolve(__dirname, '../../scripts/fixtures/operator-catalogue.json'),
        'utf8',
    ),
) as { menu: Array<{ id: string }> };
const ITEM = catalogueFixture.menu[0];

const PROCESSES_ABI = parseAbi([
    'function processes(bytes32) view returns (address rootBuyer, address currency, uint256 cumulativeValue, uint32 activeOrderCount)',
]);
// MockKlerosArbitrableProxy — ERC-1497 event shapes + the disputes view.
const KLEROS_PROXY_EVENT_ABI = parseAbi([
    'event Dispute(address indexed arbitrator, uint256 indexed disputeID, uint256 metaEvidenceID, uint256 evidenceGroupID)',
    'event Evidence(address indexed arbitrator, uint256 indexed evidenceGroupID, address indexed party, string evidence)',
]);
const ARBITRABLE_PROXY_DISPUTES_ABI = parseAbi([
    'function disputes(uint256 _localID) view returns (bytes extraData, bool isRuled, uint256 ruling, uint256 disputeIDOnArbitratorSide)',
]);

// The local-commerce assembly's figaro-jurisdiction-v1 clause names Kleros
// General Court (subcourt 1); with no klerosMinJurors authored the resolver
// falls back to the court's schema default (3). arbitratorExtraData is
// abi.encode(uint96 subcourtID, uint96 minJurors).
const EXPECTED_EXTRA_DATA = encodeAbiParameters(
    [{ name: 'subcourtID', type: 'uint96' }, { name: 'minJurors', type: 'uint96' }],
    [1n, 3n],
);

function deployment(): { core: Hex; token: Hex } {
    const config = readLocalDeploymentConfig();
    return {
        core: (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex,
        token: (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex,
    };
}

const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

test.describe('Local-commerce dispute — Layer-3 recourse (devnet)', () => {
    let testSnapshot: string;
    let blockBefore: bigint;
    test.beforeEach(async () => {
        testSnapshot = await evmSnapshot();
        blockBefore = await publicClient.getBlockNumber();
    });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // Buyer commit (2 orders) + raise dispute + submit evidence (in-browser
    // audit-bundle PDF build).
    test.setTimeout(300_000);

    test('buyer commits local-commerce, then disputes via the clause-authored Kleros court', async ({ page }) => {
        const klerosProxy = process.env.NEXT_PUBLIC_KLEROS_ARBITRABLE_PROXY as Hex | undefined;
        if (!klerosProxy) {
            throw new Error('NEXT_PUBLIC_KLEROS_ARBITRABLE_PROXY not set — run ./deploy-mock-kleros.sh');
        }
        const { core, token } = deployment();

        await ensureTokenApprovals(core, token, BUYER_KEY);
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        // ── 1. Buyer commits the local-commerce process ──────────────
        await page.goto(`/m/${MERCATO_ADDR}?e2e=devnet`, { waitUntil: 'domcontentloaded' });
        const detailView = page.getByTestId('merchant-detail-view');
        try {
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        } catch {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        }
        const menuItem = page.getByTestId(`menu-item-${ITEM.id}`);
        try {
            await menuItem.waitFor({ state: 'visible', timeout: 15000 });
        } catch {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
            await menuItem.waitFor({ state: 'visible', timeout: 30000 });
        }
        await page.getByTestId(`btn-add-${ITEM.id}`).click();
        await expect(page.getByTestId(`cart-line-${ITEM.id}`)).toBeVisible({ timeout: 10000 });

        await expect(page.getByTestId('option-fulfilment-deliver:seller-assigned')).toHaveCount(1, { timeout: 20000 });
        await page.getByTestId('select-fulfilment-mode').selectOption('deliver:seller-assigned');
        await page.getByTestId('input-delivery-geohash').fill('dr5regw3pg');
        await page.getByTestId('input-delivery-address').fill('12 Market St, Apt 4B — ring bell');
        await page.getByTestId('btn-place-order').click();

        for (let i = 0; i < 2; i++) {
            const modal = page.getByTestId('agreement-preview-modal');
            await modal.waitFor({ state: 'visible', timeout: 45000 });
            await page.getByTestId('preview-confirm').click();
            await modal.waitFor({ state: 'hidden', timeout: 45000 });
        }

        await page.waitForURL(/\/orders\/0x[0-9a-fA-F]+/, { timeout: 90000 });
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        const processId = page.url().match(/\/orders\/(0x[0-9a-fA-F]+)/)![1] as Hex;

        const committed = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(committed[3]).toBe(2); // food + courier orders active

        // ── 2. Audit page — the recourse the clause authored ─────────
        await gotoAsWallet(page, BUYER_ADDR, `/audit/${processId}?e2e=devnet`);
        await waitForWalletConnected(page, BUYER_ADDR);
        const panel = page.getByTestId('audit-dispute-section');
        await panel.waitFor({ timeout: 30000 });

        // The dispute surface read the assembly's figaro-jurisdiction-v1
        // clause and surfaced its forum — Kleros, General Court.
        const recourse = page.getByTestId('dispute-recourse-kleros');
        await expect(recourse).toBeVisible({ timeout: 30000 });
        await expect(recourse).toContainText('General Court');

        // ── 3. Raise dispute — on the clause's court ─────────────────
        const raiseButton = panel.getByRole('button', { name: /Raise Dispute/i });
        await expect(raiseButton).toBeEnabled({ timeout: 15000 });
        await raiseButton.click();
        await expect(panel.getByText(/Pending ruling/i)).toBeVisible({ timeout: 90000 });

        const disputeEvents = await publicClient.getContractEvents({
            address: klerosProxy, abi: KLEROS_PROXY_EVENT_ABI, eventName: 'Dispute',
            fromBlock: blockBefore,
        });
        expect(disputeEvents.length).toBeGreaterThanOrEqual(1);

        // The dispute was raised on the court the CLAUSE named — not an env
        // default. Read the localID the panel persisted, then the proxy's
        // stored arbitratorExtraData for that dispute.
        const localId = await page.evaluate(
            (pid) => window.localStorage.getItem(`figaro:dispute:${pid}`),
            processId,
        );
        expect(localId, 'the panel persisted the dispute localID').toBeTruthy();
        const stored = await publicClient.readContract({
            address: klerosProxy, abi: ARBITRABLE_PROXY_DISPUTES_ABI,
            functionName: 'disputes', args: [BigInt(localId!)],
        });
        expect(
            (stored[0] as string).toLowerCase(),
            'createDispute used the jurisdiction-clause court (Kleros subcourt 1, 3 jurors)',
        ).toBe(EXPECTED_EXTRA_DATA.toLowerCase());

        // ── 4. Submit the audit-bundle as evidence ───────────────────
        const submitButton = panel.getByTestId('dispute-submit-evidence-button');
        await expect(submitButton).toBeEnabled({ timeout: 15000 });
        await submitButton.click();
        await expect(panel.getByText(/Last submission tx/i)).toBeVisible({ timeout: 120000 });

        const evidenceEvents = await publicClient.getContractEvents({
            address: klerosProxy, abi: KLEROS_PROXY_EVENT_ABI, eventName: 'Evidence',
            args: { party: BUYER_ADDR }, fromBlock: blockBefore,
        });
        expect(evidenceEvents.length).toBeGreaterThanOrEqual(1);
    });
});
