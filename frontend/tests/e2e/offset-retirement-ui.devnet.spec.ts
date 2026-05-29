/**
 * offset-retirement-ui.devnet.spec.ts
 *
 * Phase 4 D1 of the e2e remediation plan: UI coverage of the
 * three-step Path A offset-retirement flow at the top of
 * `/orders/<processId>` (the `PreResolveOffsetPanel`).
 *
 * Steps the panel surfaces (mirror useOffsetRetirement):
 *   1. Approve USDC (mock token on devnet) to the mock aggregator.
 *   2. Retire `tonsToRetire` at the aggregator.
 *   3. Anchor the receipt on-chain via ProcessOffsetReceipt.record.
 *
 * Setup: a process with at least one `figaro-ghg-measurement-v1`
 * attestation so `totalActualGrams > 0`. The committed agreement
 * must carry the measurement-v1 section so the inclusion proof
 * opens at attest time (Cat-1 means the validator doesn't enforce
 * byte-equality with the committed sectionData, but the section
 * must EXIST in the agreement).
 *
 * The companion viem-only path is covered by G2 in the same
 * audit; this spec exercises the UI buttons.
 *
 * Requires Anvil + ./deploy-local.sh.
 */
import { test, expect, ANVIL_ACCOUNTS } from './devnet-multi-test';
import {
    createPublicClient,
    createWalletClient,
    defineChain,
    encodeAbiParameters,
    http,
    keccak256,
    parseAbi,
    stringToHex,
    type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    createRootOrder,
    ensureTokenApprovals,
    evmRevert,
    evmSnapshot,
    readLocalDeploymentConfig,
} from './devnet-helpers';
import {
    GHG_CLAUSE_KEY,
    GHG_MEASUREMENT_CLAUSE_KEY,
} from '@/lib/core/agreement';
import {
    ATTESTATION_COORDINATOR_ABI,
    buildSectionInclusionProof,
    getSectionDataBytes,
    type Agreement,
} from '@figaro/core';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

const BUYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const RESTAURANT_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;

const GHG_MEASUREMENT_CLAUSE_ID = keccak256(stringToHex(GHG_MEASUREMENT_CLAUSE_KEY));

const MEASUREMENT_STAGE_MEASURED = 0;

// 1.5 tonnes of CO2e → ceil-rounds to 2 tonnes at retirement.
const SEEDED_GRAMS = 1_500_000n;

const PROCESS_OFFSET_RECEIPT_ABI = parseAbi([
    'event ReceiptRecorded(bytes32 indexed processId, address indexed buyer, bytes32 indexed retirementTxHash, address aggregator, uint256 tonsRetired, address inputToken, uint256 inputAmount)',
]);

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('Offset retirement UI (devnet)', () => {
    let testSnapshot: string;
    let blockBefore: bigint;

    test.beforeEach(async () => {
        testSnapshot = await evmSnapshot();
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        blockBefore = await publicClient.getBlockNumber();
    });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // Order commit + page mount + 3 sequential txs + receipt waits.
    test.setTimeout(240_000);

    test('buyer walks through approve → retire → record; ReceiptRecorded event emits', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;
        const coordinator = (process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR ?? config.attestationCoordinator) as Hex;
        const receiptsAnchor = process.env.NEXT_PUBLIC_PROCESS_OFFSET_RECEIPT as Hex | undefined;
        if (!coreAddress || !tokenAddress || !coordinator || !receiptsAnchor) {
            throw new Error('Missing FIGARO_CORE / TOKEN_ADDRESS / ATTESTATION_COORDINATOR / PROCESS_OFFSET_RECEIPT env');
        }

        const buyer = privateKeyToAccount(BUYER_KEY);
        const restaurant = privateKeyToAccount(RESTAURANT_KEY);
        const buyerAddr = ANVIL_ACCOUNTS[0] as Hex;
        expect(buyer.address.toLowerCase()).toBe(buyerAddr.toLowerCase());

        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, RESTAURANT_KEY);

        // Agreement carrying both the protocol-level commitment clause
        // (Cat-2, `figaro-ghg-iso-14064-v1`) and the runtime measurement
        // clause (Cat-1, `figaro-ghg-measurement-v1`). Measurement-v1's
        // inclusion proof opens against this agreement.
        const agreement: Agreement = {
            version: 'a1',
            buyer: buyer.address as Hex,
            seller: restaurant.address as Hex,
            sections: [
                { clause: GHG_CLAUSE_KEY, data: { standard: 'iso-14064-1', scope: 1 } },
                { clause: GHG_MEASUREMENT_CLAUSE_KEY, data: {} },
            ],
        };

        const { processId, commitment } = await createRootOrder({
            buyerKey: BUYER_KEY,
            sellerKey: RESTAURANT_KEY,
            coreAddress,
            tokenAddress,
            payment: 1_000_000_000_000_000_000n,
            agreement,
        });

        // Pre-attest a measurement-v1 inventory for the restaurant so the
        // PreResolveOffsetPanel sees `totalActualGrams > 0` and renders.
        // Cat-1: content is `abi.encode(uint256 grams)`; sectionData is
        // canonical-JSON of `{}` (the committed section.data).
        const measurementSection = agreement.sections.find((s) => s.clause === GHG_MEASUREMENT_CLAUSE_KEY)!;
        const sectionData = getSectionDataBytes(measurementSection);
        const { proof } = buildSectionInclusionProof(agreement, GHG_MEASUREMENT_CLAUSE_KEY);
        const gramsContent = encodeAbiParameters([{ type: 'uint256' }], [SEEDED_GRAMS]);

        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const restaurantClient = createWalletClient({ account: restaurant, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const { request: attestReq } = await publicClient.simulateContract({
            account: restaurant.address,
            address: coordinator,
            abi: ATTESTATION_COORDINATOR_ABI,
            functionName: 'attestAsSeller',
            args: [
                commitment,
                commitment,
                GHG_MEASUREMENT_CLAUSE_ID,
                MEASUREMENT_STAGE_MEASURED,
                sectionData,
                proof,
                gramsContent,
            ],
        });
        await publicClient.waitForTransactionReceipt({
            hash: await restaurantClient.writeContract(attestReq),
        });

        // Default page fixture is anvil[0] (the buyer) — exactly what we
        // want, since PreResolveOffsetPanel.record() asserts caller ==
        // rootBuyer.
        await page.goto(`/orders/${processId}?e2e=devnet`, { waitUntil: 'domcontentloaded' });

        const panel = page.getByTestId('pre-resolve-offset-panel');
        await panel.waitFor({ state: 'visible', timeout: 30_000 });

        // The hook auto-selects the first provider on mount; quote loads
        // asynchronously. Wait for the Step 1 button to appear (gated on
        // `status === "ready" && requiresApproval`).
        const approveButton = page.getByTestId('offset-step-approve');
        await approveButton.waitFor({ state: 'visible', timeout: 30_000 });
        await approveButton.click();

        // Once approve tx confirms, status flips to "approved" and the
        // step-retire button replaces step-approve.
        const retireButton = page.getByTestId('offset-step-retire');
        await retireButton.waitFor({ state: 'visible', timeout: 60_000 });
        await retireButton.click();

        const recordButton = page.getByTestId('offset-step-record');
        await recordButton.waitFor({ state: 'visible', timeout: 60_000 });
        await recordButton.click();

        // status === "done" surfaces the offset-done card with the tx
        // hash. The on-chain ReceiptRecorded event is the system-of-
        // record assertion.
        await page.getByTestId('offset-done').waitFor({ state: 'visible', timeout: 60_000 });

        const events = await publicClient.getContractEvents({
            address: receiptsAnchor,
            abi: PROCESS_OFFSET_RECEIPT_ABI,
            eventName: 'ReceiptRecorded',
            args: { processId, buyer: buyer.address as Hex },
            fromBlock: blockBefore,
        });
        expect(events.length).toBe(1);
        expect(events[0].args.aggregator).toBeTruthy();
        // 1.5 tonnes ceiling = 2 tonnes (fixed-point 1e18).
        expect(events[0].args.tonsRetired).toBe(2_000_000_000_000_000_000n);
    });
});
