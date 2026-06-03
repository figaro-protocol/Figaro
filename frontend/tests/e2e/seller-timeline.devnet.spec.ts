/**
 * seller-timeline.devnet.spec.ts
 *
 * Phase 1a of the e2e remediation plan (backlog 2026-05-19): adds
 * UI-tier coverage for the seller side of `/orders/[processId]`.
 * `delivery-lifecycle.devnet` fires merchant-process signals via the
 * AttestationCoordinator with viem (`restaurantPrepSignals` in
 * devnet-helpers) — that's contract-tier; the click→hook→contract
 * wiring through the four `btn-merchant-next-*` buttons had no
 * devnet test.
 *
 * What this exercises:
 *   - Seller wallet (anvil[1]) navigates to /orders/<processId>.
 *   - Header renders "You are the seller" (role-discriminator
 *     branch in OrderTimelineView.tsx:437).
 *   - Click through the post-commit merchant-process sequence:
 *     prep-started → ready-for-pickup → handed-off. Each click →
 *     `handleMerchantNext` → `useMerchantProcessActions.signal` →
 *     AttestationCoordinator.attestAsSeller. After each, assert the
 *     on-chain Attestation event for that stage exists. Arrival and
 *     acceptance are core (the commit), not merchant-process events, so
 *     the seeded committed order opens directly on the "Accepted" status.
 *
 * Doesn't try to fire from the buyer's wallet (different role
 * branch — covered by delivery-lifecycle / lifecycle.devnet) or
 * exercise spectator view (Phase 1b).
 *
 * Requires Anvil + ./deploy-local.sh + Kubo for the merchant agreement
 * pin path.
 */
import { test, expect, ANVIL_ACCOUNTS, gotoAsWallet, seedAgreementForWallet } from './devnet-multi-test';
import {
    createPublicClient,
    defineChain,
    http,
    keccak256,
    stringToHex,
    type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    createRootOrder,
    ensureTokenApprovals,
    evmRevert,
    evmSnapshot,
    merchantProcessAgreement,
    readLocalDeploymentConfig,
} from './devnet-helpers';
import { ATTESTATION_COORDINATOR_ABI } from '@figaro/core';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

const BUYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const SELLER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const SELLER_ADDR = ANVIL_ACCOUNTS[1];

const MERCHANT_PROCESS_CLAUSE_ID = keccak256(stringToHex('figaro-merchant-process-v1'));

/** Post-commit merchant-process events the UI walks in order. Stage indices
 *  match the validator's uint8 enum (the core-owned order-received=0 /
 *  accepted=1 stages are NOT surfaced as CTAs; see useMerchantProcess.ts and
 *  OrderTimelineView's HAPPY_PATH_EVENTS). */
const HAPPY_PATH: Array<{ event: string; stage: number }> = [
    { event: 'prep-started', stage: 2 },
    { event: 'ready-for-pickup', stage: 3 },
    { event: 'handed-off', stage: 4 },
];

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('OrderTimelineView seller side (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // Three sequential signs + tx confirms; 60s isn't enough.
    test.setTimeout(180_000);

    test('seller walks the post-commit merchant-process path through the btn-merchant-next-* buttons', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;
        const coordinatorAddress = (process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR
            ?? config.attestationCoordinator) as Hex;

        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, SELLER_KEY);

        const buyer = privateKeyToAccount(BUYER_KEY);
        const seller = privateKeyToAccount(SELLER_KEY);

        // Seed: root order buyer→seller with the merchant-process agreement
        // clause committed (required so the inclusion proof opens at attest
        // time per AttestationCoordinator._validateContent).
        const agreement = merchantProcessAgreement(buyer.address as Hex, seller.address as Hex);
        const { processId, orderHash } = await createRootOrder({
            buyerKey: BUYER_KEY,
            sellerKey: SELLER_KEY,
            coreAddress,
            tokenAddress,
            payment: 1_000000000000000000n,
            agreement,
        });

        // Simulate XMTP arrival on the seller's side: in production the
        // buyer's CommitmentPayload carries the agreement and the seller's
        // useCommitmentFlow writes it to localStorage. The viem seed
        // bypasses that path; without this pre-populate, the page surfaces
        // "Agreement assemblyDoc unavailable for 0x... — cannot generate
        // inclusion proof" and the merchantActions.signal fails before
        // simulate.
        await seedAgreementForWallet(page, agreement);

        // Navigate AS the seller so wagmi mounts already connected to anvil[1].
        await gotoAsWallet(page, SELLER_ADDR, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });

        // Role-discriminator branch: the header should read "You are the seller".
        await expect(page.getByTestId('order-timeline-view')).toContainText(/You are the seller/);

        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        // Walk the happy path. After each click, accept any window.confirm
        // (none currently fire for merchant-next, but a persistent
        // handler is defensive — see reference_e2e_flake_patterns #8).
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        // The seller advances the lifecycle through the ONE capability rail.
        // The plain merchant-process-signal capability rotates prep-started →
        // ready-for-pickup → handed-off (this seed carries no proximity policy,
        // so the handoff is a plain signal too) under one testid.
        const signalBtn = page.getByTestId('capability-execute-submit-merchant-process-signal');
        for (const step of HAPPY_PATH) {
            await expect(signalBtn).toBeEnabled({ timeout: 30000 });
            await signalBtn.click();

            // The on-chain Attestation for this stage is the "tx landed" signal.
            await expect.poll(async () => {
                const events = await publicClient.getContractEvents({
                    address: coordinatorAddress,
                    abi: ATTESTATION_COORDINATOR_ABI,
                    eventName: 'Attestation',
                    args: { orderHash, attester: seller.address as Hex },
                    fromBlock: 0n,
                });
                return events.filter(
                    (e) => e.args.clauseId === MERCHANT_PROCESS_CLAUSE_ID && e.args.stage === step.stage,
                ).length;
            }, { timeout: 30000, message: `expected one Attestation for stage ${step.stage} (${step.event})` }).toBe(1);

            // The event surfaces on the generic timeline (labelled from the
            // clause spec) — proof the page re-derived and the capability advanced.
            await expect(page.getByTestId(`timeline-event-${step.event}`)).toBeVisible({ timeout: 30000 });
        }

        // After handed-off, no merchant capability remains.
        await expect(page.locator('[data-testid^="capability-execute-submit-merchant-process-signal"]')).toHaveCount(0);
    });
});
