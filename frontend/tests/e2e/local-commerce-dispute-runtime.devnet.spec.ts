/**
 * local-commerce-dispute-runtime.devnet.spec.ts
 *
 * RUNTIME (lifecycle Phase 4) for the `local-commerce-dispute` scenario — the
 * Layer-3 recourse path of the three-layer dispute model. Layers 1 (bonding)
 * and 2 (peer coordination) are kernel mechanisms; Layer 3 is the off-chain
 * forum, and the parties' agreement NAMES it. The point of this spec is that
 * the dispute is CLAUSE-DRIVEN: the recourse forum offered — and the Kleros
 * court the dispute is raised on — come from the assembly's
 * figaro-arbitration-kleros clause, not a global default.
 *
 *   1. Buyer (anvil[0]) commits the local-commerce-dispute process (food +
 *      courier orders) from the onboarded merchant.
 *   2. /audit/[processId] surfaces the recourse the clause authored — Kleros,
 *      General Court.
 *   3. Raise dispute → createDispute's arbitratorExtraData encodes subcourt 1
 *      + 3 jurors (the clause's court, read off the committed agreement).
 *   4. Submit the audit-bundle as Kleros evidence.
 *
 * Merchant/courier coordination is covered by local-commerce-runtime; this
 * spec adds the Layer-3 recourse path on the multi-order process. Consumes
 * the sellers + assembly from chain→IPFS. PERSISTED, like mainnet: no chain
 * snapshot/revert; the dispute assertions are scoped to THIS run (fromBlock
 * watermark + per-process dispute key).
 *
 * Requires Anvil + ./scripts/deploy-local.sh + mock Kleros (devup wires it) +
 * Kubo + the dev server.
 */
import { test, expect, ANVIL_ACCOUNTS, gotoAsWallet } from './devnet-multi-test';
import { encodeAbiParameters, parseAbi, type Hex } from 'viem';
import {
    CORE_PROCESS_VIEW_ABI,
    courierAddressFor,
    discoverSellerByAssembly,
    discoverSellers,
    ensureTokenApprovalsByAddress,
    localPublicClient,
    acceptOrderInInboxUI,
    placeBilateralOrderUI,
    readLocalDeploymentConfig,
    waitForWalletConnected,
} from './devnet-helpers';
import { SCENARIO_SLUG } from './scenarioSlugs.mjs';

const BUYER_ADDR = ANVIL_ACCOUNTS[0] as Hex;

const KLEROS_PROXY_EVENT_ABI = parseAbi([
    'event Dispute(address indexed arbitrator, uint256 indexed disputeID, uint256 metaEvidenceID, uint256 evidenceGroupID)',
]);
const ARBITRABLE_PROXY_DISPUTES_ABI = parseAbi([
    'function disputes(uint256 _localID) view returns (bytes extraData, bool isRuled, uint256 ruling, uint256 disputeIDOnArbitratorSide)',
]);
// The clause names Kleros General Court (subcourt 1); with no klerosMinJurors
// authored the resolver falls back to the court default (3). arbitratorExtraData
// is abi.encode(uint96 subcourtID, uint96 minJurors).
const EXPECTED_EXTRA_DATA = encodeAbiParameters(
    [{ name: 'subcourtID', type: 'uint96' }, { name: 'minJurors', type: 'uint96' }],
    [1n, 3n],
);

test.describe('local-commerce-dispute runtime — Layer-3 clause-driven Kleros recourse (devnet)', () => {
    // Buyer commit (2 orders) + raise dispute on the clause's court + submit
    // evidence (in-browser audit-bundle PDF build).
    test.setTimeout(300_000);

    test('buyer commits, then disputes via the clause-authored Kleros court, and submits evidence — all through the UI', async ({ page }) => {
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;
        const publicClient = localPublicClient();

        // The Kleros proxy must have code on THIS chain — a stale env var survives a
        // redeploy, so presence alone isn't enough (else a code-less call times out
        // 90s later at an opaque "Pending ruling").
        const klerosProxy = process.env.NEXT_PUBLIC_KLEROS_ARBITRABLE_PROXY as Hex | undefined;
        if (!klerosProxy) throw new Error('NEXT_PUBLIC_KLEROS_ARBITRABLE_PROXY not set — devup wires mock Kleros');
        const klerosCode = await publicClient.getCode({ address: klerosProxy });
        if (!klerosCode || klerosCode === '0x') {
            throw new Error(`Mock Kleros proxy ${klerosProxy} has no code on the devnet chain — re-run devup`);
        }

        // Discover the sellers the mainnet way: the dispute merchant designates
        // its courier on-chain (seller-assigned base).
        const sellers = await discoverSellers();
        const merchant = await discoverSellerByAssembly(SCENARIO_SLUG['local-commerce-dispute'], { withCourier: true }, sellers);
        const courierAddr = courierAddressFor(merchant, SCENARIO_SLUG['local-commerce-dispute']);
        const courier = sellers.find((s) => s.address.toLowerCase() === courierAddr.toLowerCase());
        expect(courier, `courier ${courierAddr} (designated by ${merchant.name}) must be a registered seller`).toBeTruthy();

        await ensureTokenApprovalsByAddress(coreAddress, tokenAddress, BUYER_ADDR, merchant.address, courier!.address);
        const blockBefore = await publicClient.getBlockNumber();

        // ── 1. Buyer commits the local-commerce-dispute process ─────────────
        await placeBilateralOrderUI(page, {
            seller: merchant.address,
            method: 'deliver:seller-assigned',
        });
        const processId = await acceptOrderInInboxUI(page, merchant.address);
        await acceptOrderInInboxUI(page, courier!.address);

        const committed = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(committed[0].toLowerCase()).toBe(BUYER_ADDR.toLowerCase()); // rootBuyer
        expect(committed[3]).toBe(2); // food + courier

        // ── 2. Audit page — the recourse the clause authored (General Court) ─
        await gotoAsWallet(page, BUYER_ADDR, `/audit/${processId}?e2e=devnet`);
        await waitForWalletConnected(page, BUYER_ADDR);
        const panel = page.getByTestId('audit-dispute-section');
        await panel.waitFor({ timeout: 30000 });
        const recourse = page.getByTestId('dispute-recourse-kleros');
        await expect(recourse).toBeVisible({ timeout: 30000 });
        await expect(recourse).toContainText('General Court');

        // ── 3. Raise dispute — on the clause's court ────────────────────────
        const raiseButton = panel.getByRole('button', { name: /Raise Dispute/i });
        await expect(raiseButton).toBeEnabled({ timeout: 15000 });
        await raiseButton.click();
        await expect(panel.getByText(/Pending ruling/i)).toBeVisible({ timeout: 90000 });

        const disputeEvents = await publicClient.getContractEvents({
            address: klerosProxy, abi: KLEROS_PROXY_EVENT_ABI, eventName: 'Dispute', fromBlock: blockBefore,
        });
        expect(disputeEvents.length).toBeGreaterThanOrEqual(1);

        // The dispute was raised on the court the CLAUSE named — not an env default.
        const localId = await page.evaluate(
            (pid) => window.localStorage.getItem(`figaro:dispute:${pid}`), processId,
        );
        expect(localId, 'the panel persisted the dispute localID').toBeTruthy();
        const stored = await publicClient.readContract({
            address: klerosProxy, abi: ARBITRABLE_PROXY_DISPUTES_ABI, functionName: 'disputes', args: [BigInt(localId!)],
        });
        expect(
            (stored[0] as string).toLowerCase(),
            'createDispute used the jurisdiction-clause court (Kleros subcourt 1, 3 jurors)',
        ).toBe(EXPECTED_EXTRA_DATA.toLowerCase());

        // ── 4. Submit the audit-bundle as evidence ──────────────────────────
        const submitButton = panel.getByTestId('dispute-submit-evidence-button');
        await expect(submitButton).toBeEnabled({ timeout: 15000 });
        await submitButton.click();
        await expect(panel.getByText(/Last submission tx/i)).toBeVisible({ timeout: 120000 });
    });
});
