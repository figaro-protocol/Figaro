/**
 * orders-pending.devnet.spec.ts
 *
 * Buyer outbound-pending visibility on /orders. After a buyer signs and
 * relays a commitment, the order is in flight — signed, not yet
 * counter-signed, not on-chain. /orders must surface it (read off the
 * coordination channel via usePendingCommitments) and drop it once it
 * commits.
 *
 * Mirrors inbox-accept.devnet.spec.ts's XMTP-style arrival seeding: the
 * ?e2e=devnet session routes the coordination channel to the mock, so an
 * injected COMMITMENT_PAYLOAD replays into the buyer's subscription on
 * mount (simulateXmtpCommitmentArrival).
 *
 * Two cases:
 *   1. a buyerSig-only payload (not on-chain) → the pending row appears.
 *   2. the same order committed on-chain → the pending row is deduped
 *      away by order hash and the committed row shows instead.
 */
import { test, expect, ANVIL_ACCOUNTS, gotoAsWallet, seedAgreementForWallet, simulateXmtpCommitmentArrival } from './devnet-multi-test';
import {
    createPublicClient,
    defineChain,
    http,
    type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    createRootOrder,
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

const ZERO_PROCESS_ID = `0x${'0'.repeat(64)}` as Hex;

/** Hex-encode bigints the way CommitmentSharePanel.serializeCommitmentPayload does. */
const toHex = (v: bigint) => `0x${v.toString(16)}`;

test.describe('/orders outbound-pending (devnet)', () => {
    test.setTimeout(120_000);

    test('buyer sees an outbound-pending row from an XMTP-style arrival', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;

        const buyer = privateKeyToAccount(BUYER_KEY);
        const seller = privateKeyToAccount(SELLER_KEY);
        const payment = 1_000000000000000000n; // 1 token
        const agreement = merchantProcessAgreement(buyer.address as Hex, seller.address as Hex);
        const agreementHash = computeAgreementHash(agreement);
        const salt = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
        const chainNow = (await createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) }).getBlock({ blockTag: 'latest' })).timestamp;
        const deadline = chainNow + 3600n;

        // A buyer-signed, NOT-yet-counter-signed commitment — exactly what
        // useCommitmentFlow.initiate produces before relay. No on-chain commit.
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

        await seedAgreementForWallet(page, agreement);
        await simulateXmtpCommitmentArrival(page, {
            orderId: `pending-${salt.toString()}`,
            payload,
            senderIdentity: buyer.address,
        });

        await gotoAsWallet(page, BUYER_ADDR, '/orders?e2e=devnet');
        await page.getByTestId('buyer-orders-list').waitFor({ timeout: 30000 });

        await expect(page.getByTestId('buyer-order-pending-row')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('buyer-order-pending-status')).toHaveText('Awaiting acceptance');
    });

    test('a pending row is deduped once the order commits on-chain', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;

        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, SELLER_KEY);

        const buyer = privateKeyToAccount(BUYER_KEY);
        const seller = privateKeyToAccount(SELLER_KEY);
        const payment = 1_000000000000000000n;
        const agreement = merchantProcessAgreement(buyer.address as Hex, seller.address as Hex);

        // Commit the order on-chain first, then build the pending payload from
        // the SAME commitment so its order hash matches the committed row —
        // the buyer page must dedup it away (computeOrderHash == rootOrderHash).
        const { processId, commitment } = await createRootOrder({
            buyerKey: BUYER_KEY,
            sellerKey: SELLER_KEY,
            coreAddress,
            tokenAddress,
            payment,
            agreement,
        });
        const buyerSig = await signCommitment(commitment, BUYER_KEY, coreAddress);
        const payload = {
            commitment: {
                ...commitment,
                payment: toHex(commitment.payment),
                expectedCumulativeValue: toHex(commitment.expectedCumulativeValue),
                salt: toHex(commitment.salt),
                deadline: toHex(commitment.deadline),
            },
            buyerSig,
            agreement,
        };

        await seedAgreementForWallet(page, agreement);
        await simulateXmtpCommitmentArrival(page, {
            orderId: `pending-${commitment.salt.toString()}`,
            payload,
            senderIdentity: buyer.address,
        });

        await gotoAsWallet(page, BUYER_ADDR, '/orders?e2e=devnet');
        await page.getByTestId('buyer-orders-list').waitFor({ timeout: 30000 });

        // Wait for the committed row (indexer fetch populates rows), then the
        // pending row must be gone — its order hash matched a committed row.
        await page.getByTestId(`buyer-order-row-${processId}`).waitFor({ state: 'visible', timeout: 60000 });
        await expect(page.getByTestId('buyer-order-pending-row')).toHaveCount(0, { timeout: 30000 });
    });
});
