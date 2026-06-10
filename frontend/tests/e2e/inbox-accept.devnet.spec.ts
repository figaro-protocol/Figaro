/**
 * inbox-accept.devnet.spec.ts
 *
 * Phase 2 C1 of the e2e remediation plan: the inbox's pending-orders
 * section + Accept flow had no devnet coverage. The existing
 * inbox.devnet covers active rows on /inbox; nothing exercised the
 * PendingOrderCard → click Accept → counter-sign → on-chain commit
 * → row migrates to active path.
 *
 * Seed shape (mimics the production XMTP-arrival path without
 * actually using XMTP):
 *   1. Off-chain: buyer signs a CommitmentPayload (just like
 *      useCommitmentFlow's `initiate` would have produced) carrying
 *      the agreement and buyerSig.
 *   2. Inject the payload into the mock CoordinationChannel's
 *      localStorage via Phase 0's simulateXmtpCommitmentArrival.
 *   3. Pre-populate the seller's localStorage with the agreement
 *      (via Phase 0's seedAgreementForWallet) so the broadcast step
 *      can hydrate inclusion proofs if needed.
 *
 * UI flow exercised:
 *   - Seller navigates to /inbox?e2e=devnet.
 *   - `subscribeAnyCommitmentPayload` replays the persisted message;
 *     the subscriber sees the buyer-signed payload, filters on
 *     `seller === address`, appends to `pending`.
 *   - PendingOrderCard renders (testid `inbox-pending-card`).
 *   - Click `btn-accept-order` → `useCommitmentFlow.counterSign`
 *     produces sellerSig → `broadcast` calls FigaroCore.commit →
 *     on-chain. The card disappears from pending; the active-section
 *     row appears for the new processId.
 *
 * First real exercise of the Phase 0 simulateXmtpCommitmentArrival
 * helper. If the mock channel's wiring is incomplete in devnet mode
 * the spec descopes to the pre-seeded-localStorage variant per the
 * plan.
 */
import { test, expect, ANVIL_ACCOUNTS, gotoAsWallet, seedAgreementForWallet, simulateXmtpCommitmentArrival } from './devnet-multi-test';
import {
    createPublicClient,
    defineChain,
    http,
    parseAbi,
    type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    ensureTokenApprovals,
    merchantProcessAgreement,
    readLocalDeploymentConfig,
    signCommitment,
} from './devnet-helpers';
import { computeAgreementHash } from '../../lib/core/agreement';
import { ANVIL_KEYS } from '../anvilAccounts';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

const BUYER_KEY = ANVIL_KEYS[0];
const SELLER_KEY = ANVIL_KEYS[1];
const BUYER_ADDR = ANVIL_ACCOUNTS[0];
const SELLER_ADDR = ANVIL_ACCOUNTS[1];

const ZERO_PROCESS_ID = `0x${'0'.repeat(64)}` as Hex;

const ORDER_COMMITTED_ABI = parseAbi([
    'event OrderCommitted(bytes32 indexed processId, bytes32 indexed orderHash, address indexed seller, address buyer, uint256 payment)',
]);
const CORE_VIEW_ABI = parseAbi([
    'function processes(bytes32 processId) view returns (address rootBuyer, address currency, uint256 cumulativeValue, uint32 activeOrderCount)',
]);


test.describe('/inbox pending → accept → on-chain commit (devnet)', () => {

    // counterSign + broadcast + indexer poll for the active row.
    test.setTimeout(180_000);

    test('seller sees pending card from XMTP-style arrival, clicks Accept, on-chain commit lands', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;

        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, SELLER_KEY);

        // Build a buyer-signed CommitmentPayload. Mirrors what
        // useCommitmentFlow.initiate would have produced if the buyer
        // had walked the commitment-share flow.
        const buyer = privateKeyToAccount(BUYER_KEY);
        const seller = privateKeyToAccount(SELLER_KEY);
        const payment = 1_000000000000000000n; // 1 ETH
        const agreement = merchantProcessAgreement(buyer.address as Hex, seller.address as Hex);
        const agreementHash = computeAgreementHash(agreement);
        const salt = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
        // Deadline from CHAIN time (see devnet-helpers — the devnet clock
        // may be far ahead of wall time on the persisted chain).
        const chainNow = (await createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) }).getBlock({ blockTag: 'latest' })).timestamp;
        const deadline = chainNow + 3600n;

        const commitment = {
            processId: ZERO_PROCESS_ID,
            buyer: buyer.address as Hex,
            seller: seller.address as Hex,
            currency: tokenAddress,
            payment,
            expectedCumulativeValue: payment,
            agreementHash,
            salt,
            deadline,
        };
        const buyerSig = await signCommitment(commitment, BUYER_KEY, coreAddress);

        // CommitmentPayload serialization shape: `serializePayload` in
        // CommitmentSharePanel.tsx:34-39 encodes bigints as hex strings
        // (`0x...`); `deserializePayload` only converts back to bigint
        // when the value starts with `0x`. Decimal strings would
        // survive the parse as strings and crash downstream code
        // (PendingOrderCard's calculateBonds call). Match the production
        // encoding exactly.
        const toHex = (v: bigint) => `0x${v.toString(16)}`;
        const payload = {
            commitment: {
                ...commitment,
                payment: toHex(payment),
                expectedCumulativeValue: toHex(payment),
                salt: toHex(salt),
                deadline: toHex(deadline),
            },
            buyerSig,
            agreement,
        };

        // Phase 0 fixtures: inject into mock channel localStorage so
        // the subscriber's onAnyCommitmentPayload replay sees it on
        // page mount. Also seed the agreement so broadcast can write
        // the URI map without round-tripping IPFS.
        const orderIdKey = `pending-${salt.toString()}`;
        await seedAgreementForWallet(page, agreement);
        await simulateXmtpCommitmentArrival(page, {
            orderId: orderIdKey,
            payload,
            senderIdentity: buyer.address,
        });

        // Block watermark BEFORE the accept — the devnet persists across runs,
        // so this seller's inbox carries history; the accept is confirmed by
        // the commit THIS accept lands, never by row-set counting.
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const fromBlock = (await publicClient.getBlockNumber()) + 1n;

        await gotoAsWallet(page, SELLER_ADDR, '/inbox?e2e=devnet');
        await page.getByTestId('inbox').waitFor({ timeout: 30000 });

        // PendingOrderCard renders for the seeded payload.
        const pendingCard = page.getByTestId('inbox-pending-card');
        await expect(pendingCard).toBeVisible({ timeout: 30000 });

        // Click Accept → counter-sign → broadcast. Accept any
        // window.confirm the broadcast flow may surface.
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });
        await page.getByTestId('btn-accept-order').click();

        // Counter-sign gates on the AgreementPreviewModal (Web2 audit
        // Priority-4 fix) — signCommitment always posts the preview; confirm
        // it to proceed to the actual signing prompt.
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 15000 });
        await page.getByTestId('preview-confirm').click();

        // Post-broadcast: the pending card is removed from `pending`
        // (handleAccept's filter at Inbox.tsx:210). The empty
        // state returns OR the active row appears — both are valid
        // success signals.
        await expect(pendingCard).toHaveCount(0, { timeout: 60000 });

        // On-chain commit landed: read the processId out-of-band from the
        // OrderCommitted event THIS accept broadcast (the block watermark
        // scopes it to this run), then assert that exact row reaches the
        // seller's inbox — never row-set counting on a persisted chain.
        let processId = '' as Hex | '';
        await expect
            .poll(async () => {
                const logs = await publicClient.getContractEvents({
                    address: coreAddress, abi: ORDER_COMMITTED_ABI, eventName: 'OrderCommitted',
                    fromBlock, toBlock: 'latest',
                });
                const mine = logs.find((l) => {
                    const args = l.args as { seller?: string };
                    return !!args.seller && args.seller.toLowerCase() === SELLER_ADDR.toLowerCase();
                });
                processId = ((mine?.args as { processId?: Hex } | undefined)?.processId ?? '') as Hex | '';
                return processId;
            }, { timeout: 60000, message: 'the counter-signed commit lands on-chain' })
            .not.toBe('');

        await page.getByTestId(`inbox-active-row-${processId}`).waitFor({ state: 'visible', timeout: 60000 });

        const processState = await publicClient.readContract({
            address: coreAddress,
            abi: CORE_VIEW_ABI,
            functionName: 'processes',
            args: [processId as Hex],
        });
        expect(processState[0].toLowerCase()).toBe(BUYER_ADDR.toLowerCase()); // rootBuyer
        expect(processState[2]).toBe(payment); // cumulativeValue
        expect(processState[3]).toBe(1); // activeOrderCount
    });
});
