/**
 * notification-pending.devnet.spec.ts
 *
 * The header bell raises a "New order to sign" notification when a
 * commitment awaiting THIS wallet's counter-sign arrives over the
 * coordination channel, and that notification deep-links to /inbox.
 *
 * NotificationBell (mounted in the (app) header) subscribes via
 * usePendingCommitments(awaitsMyCounterSign); ?e2e=devnet routes the
 * channel to the mock, so an injected COMMITMENT_PAYLOAD replays in
 * (simulateXmtpCommitmentArrival, same as inbox-accept). The seller is
 * landed on /orders — NOT /inbox — to prove the deep-link navigates.
 */
import { test, expect, ANVIL_ACCOUNTS, gotoAsWallet, seedAgreementForWallet, simulateXmtpCommitmentArrival } from './devnet-multi-test';
import { createPublicClient, defineChain, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { merchantProcessAgreement, readLocalDeploymentConfig, signCommitment } from './devnet-helpers';
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
const SELLER_ADDR = ANVIL_ACCOUNTS[1];
const ZERO_PROCESS_ID = `0x${'0'.repeat(64)}` as Hex;
const toHex = (v: bigint) => `0x${v.toString(16)}`;

test.describe('pending-commitment notification (devnet)', () => {
    test.setTimeout(120_000);

    test('a pending arrival raises a bell notification that deep-links to /inbox', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;

        const buyer = privateKeyToAccount(BUYER_KEY);
        const seller = privateKeyToAccount(SELLER_KEY);
        const payment = 1_000000000000000000n;
        const agreement = merchantProcessAgreement(buyer.address as Hex, seller.address as Hex);
        const agreementHash = computeAgreementHash(agreement);
        const salt = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
        const chainNow = (await createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) }).getBlock({ blockTag: 'latest' })).timestamp;
        const deadline = chainNow + 3600n;

        // A buyer-signed commitment whose seller is the connected wallet —
        // awaitsMyCounterSign(seller) is true, so the bell must notify.
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

        // Land on /orders (NOT /inbox) — the header bell must still fire, and
        // its deep-link must take the seller to /inbox.
        await gotoAsWallet(page, SELLER_ADDR, '/orders?e2e=devnet');

        // The bell badge flips to unread once the arrival is notified.
        const bell = page.getByRole('button', { name: /notifications: [1-9]/i });
        await bell.waitFor({ state: 'visible', timeout: 30000 });
        await bell.click();

        await page.getByLabel(/unread notification: new order to sign/i).click();
        await expect(page).toHaveURL(/\/inbox/, { timeout: 15000 });
    });
});
