/**
 * local-commerce-offset-runtime.devnet.spec.ts
 *
 * RUNTIME (lifecycle Phase 4) for the emissions-aware `local-commerce-offset`
 * scenario — a 2-node seller-assigned delivery sale where both sellers disclose
 * GHG emissions and the buyer retires them, every role through its own UI:
 *
 *   1. Buyer (anvil[0]) browses the onboarded merchant, picks the offset
 *      assembly — the food order and the courier order both commit, each
 *      carrying the GHG disclosure (its measurement companion is emitted at
 *      commit, never stored in the template).
 *   2. Merchant walks its ladder + witnesses proximity through the ONE
 *      clause-agnostic rail, then files its prep-emissions measurement in the
 *      GHG panel (typed grams input — a non-enum clause gets its own surface,
 *      not a rail button); the courier does the same for the delivery leg
 *      (runDeliveryCoordination with emissions).
 *   3. Buyer retires carbon offsets covering the process emissions through
 *      the offset ROUTER via the pre-resolve panel (approve → retire →
 *      record) — anchored on-chain by ProcessOffsetReceipt. The offset is a
 *      buyer→router interaction, NOT a bonded order: there is no "offset
 *      seller".
 *   4. Buyer co-witnesses proximity on both orders and resolves — atomic
 *      settlement.
 *
 * Consumes the sellers + assembly from chain→IPFS. PERSISTED, like mainnet:
 * no chain snapshot/revert; the receipt assertion is processId-scoped.
 *
 * Prerequisite: scenario-local-commerce-offset (anchors the assembly) and an
 * onboarded merchant whose profile binds it designating a courier, on this
 * devnet.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + the dev server.
 */
import { test, expect, ANVIL_ACCOUNTS, gotoAsWallet } from './devnet-multi-test';
import { keccak256, parseAbi, stringToHex, type Hex } from 'viem';
import { CORE_ABI, ATTESTATION_COORDINATOR_ABI } from '@figaro/core';
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
    runDeliveryCoordination,
    walkClauseAttestations,
} from './devnet-helpers';

const BUYER_ADDR = ANVIL_ACCOUNTS[0] as Hex;

const RECEIPT_ABI = parseAbi([
    'event ReceiptRecorded(bytes32 indexed processId, address indexed buyer, bytes32 indexed retirementTxHash, address aggregator, uint256 tonsRetired, address inputToken, uint256 inputAmount)',
]);

test.describe('local-commerce-offset runtime — emissions disclosed, offsets retired, resolve (devnet)', () => {
    // Commit (2 orders) + coordinate + 2 emissions measurements + 3-step offset
    // retirement + witnesses + resolve — every role through its UI.
    test.setTimeout(540_000);

    test('buyer commits, both sellers disclose emissions, buyer retires offsets via the router, process resolves — all through the UI', async ({ page }) => {
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;
        const receipts = process.env.NEXT_PUBLIC_PROCESS_OFFSET_RECEIPT as Hex | undefined;
        if (!receipts) throw new Error('NEXT_PUBLIC_PROCESS_OFFSET_RECEIPT not set — deploy the offset contracts');
        const publicClient = localPublicClient();

        // Discover the sellers the mainnet way: the offset merchant designates
        // its courier on-chain (seller-assigned base).
        const sellers = await discoverSellers();
        const merchant = await discoverSellerByAssembly('local-commerce-offset', { withCourier: true }, sellers);
        const courierAddr = courierAddressFor(merchant, 'local-commerce-offset');
        const courier = sellers.find((s) => s.address.toLowerCase() === courierAddr.toLowerCase());
        expect(courier, `courier ${courierAddr} (designated by ${merchant.name}) must be a registered seller`).toBeTruthy();

        await ensureTokenApprovalsByAddress(coreAddress, tokenAddress, BUYER_ADDR, merchant.address, courier!.address);

        // ── 1. Buyer commits the food + courier orders (each GHG-bearing) ───
        await placeBilateralOrderUI(page, {
            seller: merchant.address,
            fulfilmentMode: 'deliver:seller-assigned',
        });
        const processId = await acceptOrderInInboxUI(page, merchant.address);
        await acceptOrderInInboxUI(page, courier!.address);

        const committed = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(committed[0].toLowerCase()).toBe(BUYER_ADDR.toLowerCase()); // rootBuyer
        expect(committed[3]).toBe(2); // food + courier

        // Resolve each order's hash by its seller, for the per-seller emissions.
        const orders = await publicClient.getContractEvents({
            address: coreAddress, abi: CORE_ABI, eventName: 'OrderCommitted',
            args: { processId }, fromBlock: 0n,
        });
        expect(orders.length).toBe(2);
        const merchantOrder = orders.find(
            (e) => (e.args.seller as string).toLowerCase() === merchant.address.toLowerCase(),
        )!.args.orderHash as Hex;
        const courierOrder = orders.find(
            (e) => (e.args.seller as string).toLowerCase() === courier!.address.toLowerCase(),
        )!.args.orderHash as Hex;

        // ── 2. Coordinate + each seller files its GHG measurement inline ────
        // The merchant the emissions of preparing the goods, the courier the
        // emissions of the delivery — each in its own warm session.
        await runDeliveryCoordination(page, {
            processId, merchant: merchant.address, courier: courier!.address,
            emissions: {
                merchant: { orderHash: merchantOrder, grams: '820' },
                courier: { orderHash: courierOrder, grams: '1340' },
            },
        });

        // ── 3. Buyer co-witnesses proximity (both orders) ───────────────────
        await walkClauseAttestations(page, {
            wallet: BUYER_ADDR, processId, clicks: 2, who: 'buyer',
        });

        // ── 4. Buyer retires carbon offsets through the router ──────────────
        const offsetPanel = page.getByTestId('pre-resolve-offset-panel');
        await offsetPanel.waitFor({ state: 'visible', timeout: 30_000 });
        const approve = page.getByTestId('offset-step-approve');
        await approve.waitFor({ state: 'visible', timeout: 30_000 });
        await approve.click();
        const retire = page.getByTestId('offset-step-retire');
        await retire.waitFor({ state: 'visible', timeout: 60_000 });
        await retire.click();
        const record = page.getByTestId('offset-step-record');
        await record.waitFor({ state: 'visible', timeout: 60_000 });
        await record.click();
        await page.getByTestId('offset-done').waitFor({ state: 'visible', timeout: 60_000 });

        // The offset receipt is anchored on-chain against THIS process (router
        // retirement recorded by ProcessOffsetReceipt) — out-of-band confirmation.
        const receiptEvents = await publicClient.getContractEvents({
            address: receipts, abi: RECEIPT_ABI, eventName: 'ReceiptRecorded',
            args: { processId }, fromBlock: 0n,
        });
        expect(receiptEvents.length).toBe(1);

        // ── 5. Buyer resolves → atomic settlement of both orders ────────────
        await gotoAsWallet(page, BUYER_ADDR, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ state: 'visible', timeout: 30000 });
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await resolveBtn.waitFor({ state: 'visible', timeout: 30000 });
        await resolveBtn.click();
        await expect(page.getByTestId('order-status-pill')).toHaveText(/Completed/i, { timeout: 90000 });

        const resolved = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(Number(resolved[3])).toBe(0);

        // Both sellers' measurements really landed (out-of-band): a
        // GHG-measurement attestation per seller against THIS process.
        const ghgClauseId = keccak256(stringToHex('figaro-ghg-measurement-v1'));
        const coordinator = process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR as Hex;
        const attestations = await publicClient.getContractEvents({
            address: coordinator, abi: ATTESTATION_COORDINATOR_ABI, eventName: 'Attestation',
            args: { processId }, fromBlock: 0n,
        });
        const ghgFilings = attestations.filter((a) => (a.args.clauseId as string).toLowerCase() === ghgClauseId.toLowerCase());
        expect(ghgFilings.length, 'one GHG measurement per seller').toBe(2);
    });
});
