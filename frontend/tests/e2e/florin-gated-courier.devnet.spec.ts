/**
 * florin-gated-courier.devnet.spec.ts — A FLORIN-GATED TWIN
 * (`assemblies/courier-delivery-florin.json`), end to end.
 *
 * The scenario: one courier delivery over the courier-delivery agreement,
 * unchanged, plus `figaro-utility-token` composed at assembly scope and
 * filled by the designer with the deployment's own FlorinToken (the written
 * file names the record's `florinToken` entry, `deployTimeCurrency`; the
 * seeding fills that address into the pin before anchoring). The florin is
 * the door to the process: checkout takes the commitment's token from the
 * pin, so no token picker renders even for a seller that accepts the devnet
 * mock token too, and every value leg moves in florins. The open original —
 * the same agreement, no pin — stays registered beside it in any token.
 *
 *   discover → the twin is identified by IDENTITY (processDesignHash → slug),
 *              hashed from the written file with the record's florin filled
 *              into the pin, the fill the seeding performs
 *   bind     → a fresh member registers (accepting florins AND the mock
 *              token, florins its default) and binds the twin
 *   commit   → the buyer checks out; no picker; the OrderCommitted token,
 *              read from chain, is the florin
 *   evidence → the committed agreement (IPFS) carries the pin leaf, whose
 *              currency is the florin the OrderCommitted event names
 *   resolve  → the buyer resolves; the bonds lock and the payment moves in
 *              florins, read from chain; the seller's mock-token balance
 *              never moves
 *
 * Runs in the Playwright `devnet` project (testMatch `*.devnet.spec.ts`).
 * Depends on the devnet deploy (scripts/deploy-local.sh, which anchors the
 * references with DEPLOYMENT_RECORD) and populate-test-data, run before
 * Playwright by test:e2e:devnet. The florin has no open mint, so the spec
 * funds both parties' florins from the devnet treasury (script/Deploy.s.sol
 * mints it 300M; its placeholder owners are anvil[0..2]).
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, gotoAsWallet, ANVIL_ACCOUNTS } from './devnet-multi-test';
import { createWalletClient, encodeFunctionData, http, parseAbi, parseEther, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { calculateBonds } from '@figaro-protocol/sdk';
import {
    discoverAnchoredAssemblies,
    referenceAssemblySlugWithLiveCurrency,
    readLocalDeploymentConfig,
    seedRegisteredMember,
    memberProfileBindings,
    pinJSONToIPFS,
    assertPinnedInIpfs,
    localPublicClient,
    LOCAL_ANVIL,
    RPC_URL,
    keyOf,
    primeRegisteredClauseSpecs,
    anchoredProcessDesignHash,
    isBindingOf,
    waitForConnected,
} from './devnet-helpers';
import { ANVIL_KEYS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/core/contracts';

// Clause keys are located by the names their specs carry (`keyOf`), over
// the specs the chain registered — primed once per file.
test.beforeAll(async () => {
    await primeRegisteredClauseSpecs();
});

const ERC20_ABI = parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
]);
const TWIN = 'courier-delivery-florin.json';
const ITEM_ID = 'parcel-delivery';
// anvil[0] — the fixture's default buyer, the devnet deployer holding the
// deploy's florins.
const BUYER = ANVIL_ACCOUNTS[0] as Hex;
// anvil[38] — dedicated to this scenario: it holds the member profile this
// spec writes, and no other spec registers it.
const SELLER_KEY = ANVIL_KEYS[38] as Hex;
const SELLER = privateKeyToAccount(SELLER_KEY).address as Hex;

const TREASURY_ABI = parseAbi([
    'function nonce() view returns (uint256)',
    'function transactionHash(address to, uint256 value, bytes data, uint256 nonce) view returns (bytes32)',
    'function propose(address to, uint256 value, bytes data) returns (bytes32)',
    'function approveHash(bytes32 txHash)',
    'function execute(address to, uint256 value, bytes data, uint256 nonce)',
]);

/** Move `amount` florins from the devnet treasury (`daoTreasury` in the
 *  devnet record, `src/mocks/MockTreasuryMultisig.sol`, 2-of-3 over
 *  anvil[0..2]) to `to`: anvil[0] proposes, anvil[1] approves, anvil[0]
 *  executes. The devnet deploy's other florins sit with a throwaway deployer
 *  key no spec holds. */
async function fundFlorinsFromTreasury(florin: Hex, to: Hex, amount: bigint): Promise<void> {
    const record = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../.deployments/local.json'), 'utf8')) as { daoTreasury?: Hex };
    const treasury = record.daoTreasury;
    expect(treasury, 'the devnet record names the treasury').toMatch(/^0x[0-9a-fA-F]{40}$/);
    const publicClient = localPublicClient();
    const owner = (i: number) => createWalletClient({ account: privateKeyToAccount(ANVIL_KEYS[i] as Hex), chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const data = encodeFunctionData({ abi: ERC20_ABI, functionName: 'transfer', args: [to, amount] });
    const nonce = await publicClient.readContract({ address: treasury!, abi: TREASURY_ABI, functionName: 'nonce' });
    const txHash = await publicClient.readContract({ address: treasury!, abi: TREASURY_ABI, functionName: 'transactionHash', args: [florin, 0n, data, nonce] });
    for (const send of [
        () => owner(0).writeContract({ address: treasury!, abi: TREASURY_ABI, functionName: 'propose', args: [florin, 0n, data] }),
        () => owner(1).writeContract({ address: treasury!, abi: TREASURY_ABI, functionName: 'approveHash', args: [txHash] }),
        () => owner(0).writeContract({ address: treasury!, abi: TREASURY_ABI, functionName: 'execute', args: [florin, 0n, data, nonce] }),
    ]) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: await send() });
        expect(receipt.status, 'each treasury step succeeds').toBe('success');
    }
}

async function findTwin(mockToken: Hex): Promise<string> {
    // Identity, never a clause-shape heuristic: the slug is hashed from the
    // twin with the record's florin in its pin — `mockToken` is the
    // deployment's token, which this file's pin does NOT take.
    const slug = referenceAssemblySlugWithLiveCurrency(TWIN, mockToken);
    const anchored = (await discoverAnchoredAssemblies()).some((t) => t.slug === slug);
    expect(anchored, `the florin-gated twin (assemblies/${TWIN}) is anchored with the florin in its pin — run the devnet deploy`).toBe(true);
    return slug;
}

async function ensureTwinSeller(florin: Hex, mockToken: Hex): Promise<void> {
    const processDesignHash = await anchoredProcessDesignHash(await findTwin(mockToken));
    if ((await memberProfileBindings(SELLER)).some((b) => isBindingOf(b, processDesignHash))) return;
    const { uri: catalogURI } = await pinJSONToIPFS({
        subjectAddress: SELLER,
        version: '1.0.0',
        unitSystem: 'metric' as const,
        items: [{
            id: ITEM_ID,
            name: 'Parcel delivery — same day',
            description: 'One parcel carried to the door, for the florin-gated courier twin.',
            price: '1',
            category: 'parcel',
            available: true,
        }],
    });
    await seedRegisteredMember({
        walletKey: SELLER_KEY,
        profile: {
            name: 'Florin Express',
            description: 'Florin-gated courier reference seller — seeded by florin-gated-courier.devnet.spec.ts',
            catalogURI,
            // Two tokens accepted — the picker's own render condition holds —
            // so the pin is shown to suppress it.
            acceptedTokens: [
                { address: florin, symbol: 'FLORIN', chainId: 31337 },
                { address: mockToken, symbol: 'MOCK', chainId: 31337 },
            ],
            defaultTokenAddress: florin,
            processBindings: [{
                bindingId: 'courier-delivery-florin-reference',
                subjectAddress: SELLER,
                processDesignHash,
                coSellerBindings: [],
            }],
        },
    });
    await expect.poll(async () =>
        (await memberProfileBindings(SELLER)).some((b) => isBindingOf(b, processDesignHash)), {
        timeout: 60000, message: "the twin seller's pinned profile carries the binding",
    }).toBe(true);
}

test.describe('A FLORIN-GATED TWIN — courier delivery, priced in florins (devnet)', () => {
    test.setTimeout(180_000);

    test('the florin pin drives checkout, the commitment and resolution; no other token moves', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const florin = config.florinToken as Hex;
        const mockToken = config.tokenAddress as Hex;
        expect(florin, 'the devnet deploy names the florin (NEXT_PUBLIC_FLORIN_TOKEN_ADDRESS)').toMatch(/^0x[0-9a-fA-F]{40}$/);
        await ensureTwinSeller(florin, mockToken);
        const publicClient = localPublicClient();
        const balanceOf = (token: Hex, who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

        // The florin has no open mint: each party's bond is funded from the
        // devnet treasury, whose 2-of-3 placeholder owners are anvil[0..2].
        for (const party of [BUYER, SELLER]) {
            if ((await balanceOf(florin, party)) < parseEther('10')) await fundFlorinsFromTreasury(florin, party, parseEther('10'));
            expect(await balanceOf(florin, party), `${party} holds florins for its bond`).toBeGreaterThanOrEqual(parseEther('10'));
        }

        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
        });
        const committedBefore = (await queryCommitted()).length;
        const [buyerBefore, sellerBefore, coreBefore, sellerMockBefore] = await Promise.all([
            balanceOf(florin, BUYER), balanceOf(florin, SELLER), balanceOf(florin, core), balanceOf(mockToken, SELLER),
        ]);

        // ── Buyer — browse → cart → checkout ──
        await page.goto(`/s/view?seller=${SELLER}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('member-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });

        // ── (a) NO TOKEN PICKER: the pin decides the token. ──
        await expect(page.getByTestId('payment-token-picker'), 'the florin pin suppresses the picker').toHaveCount(0);
        await expect(page.getByTestId('payment-token-pinned'), 'the "denominated by design" notice renders instead')
            .toBeVisible({ timeout: 15000 });

        // The courier-delivery agreement's particulars, filled by the buyer.
        const field = (clause: string, suffix: string) =>
            page.locator(`[data-testid^="checkout-field-"][data-testid$="-${keyOf(clause)}-${suffix}"]`).first();
        await field('figaro-handoff', 'handoff-face-to-face').check();
        await field('figaro-proximity-policy', 'bands-zone-wifi').check();
        await field('figaro-geolocation', 'origin').fill('9q8yyk');
        await field('figaro-geolocation', 'destination').fill('9q8yym');
        await expect(page.getByTestId('checkout-missing-fills'), 'nothing required is left owed').toHaveCount(0, { timeout: 15000 });
        const place = page.getByTestId('btn-place-order');
        await expect(place).toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        // ── Seller accepts on /orders ──
        await gotoAsWallet(page, SELLER, '/orders?e2e=devnet');
        await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('btn-accept-order').first().click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();
        await expect.poll(async () => (await queryCommitted()).length, {
            timeout: 60000, message: 'a new OrderCommitted lands on-chain',
        }).toBe(committedBefore + 1);
        const committed = await queryCommitted();
        const event = committed[committed.length - 1];
        expect(event.args.seller?.toLowerCase(), 'committed against the twin seller').toBe(SELLER.toLowerCase());

        // ── (b) THE COMMITMENT'S TOKEN, read from chain, is the florin; the
        //    payment is the catalog price in florins. ──
        expect((event.args.token as string).toLowerCase(), 'the OrderCommitted token is the florin').toBe(florin.toLowerCase());
        expect(event.args.payment, 'the payment is the listed price, in florins').toBe(parseEther('1'));
        const processId = event.args.processId!;

        // Value leg at commit — the bond lock, in florins.
        const { buyerBond, sellerBond } = calculateBonds(event.args.runningTotal!, event.args.payment!);
        const [buyerAfterCommit, sellerAfterCommit, coreAfterCommit] = await Promise.all([
            balanceOf(florin, BUYER), balanceOf(florin, SELLER), balanceOf(florin, core),
        ]);
        expect(buyerBefore - buyerAfterCommit, 'the buyer locks its bond in florins').toBe(buyerBond);
        expect(sellerBefore - sellerAfterCommit, 'the seller locks its bond in florins').toBe(sellerBond);
        expect(coreAfterCommit - coreBefore, 'FigaroCore holds both bonds in florins').toBe(buyerBond + sellerBond);

        // ── (c) THE PIN LEAF, in the committed agreement on IPFS, names the
        //    florin the commitment names. ──
        const checkoutHash = event.args.checkoutHash as `0x${string}`;
        const agreementUri = await page.evaluate((key) => window.localStorage.getItem(key), `figaro:agreement-uri:${checkoutHash}`);
        expect(agreementUri, 'the committed agreement has a network (IPFS) locator').toMatch(/^ipfs:\/\//);
        const agreementCid = agreementUri!.replace(/^ipfs:\/\//, '');
        await assertPinnedInIpfs(agreementCid);
        const ipfsApi = process.env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
        const agreement = JSON.parse(await (await fetch(`${ipfsApi}/api/v0/cat?arg=${agreementCid}`, { method: 'POST' })).text()) as {
            clauses: { clause: string; data: Record<string, unknown> }[];
        };
        const pinLeaf = agreement.clauses.find((s) => s.clause.toLowerCase() === keyOf('figaro-utility-token'));
        expect(pinLeaf, 'the figaro-utility-token leaf is committed under checkoutHash').toBeTruthy();
        expect(String(pinLeaf!.data.currency).toLowerCase(), 'the pin leaf carries the florin').toBe(florin.toLowerCase());

        // ── Buyer resolves. ──
        const resolvedCount = async () => (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length;
        const resolvedBefore = await resolvedCount();
        await gotoAsWallet(page, BUYER, `/orders/view?process=${processId}&e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await resolveBtn.waitFor({ state: 'visible', timeout: 30000 });
        await expect(resolveBtn, 'the buyer can resolve the active process').toBeEnabled({ timeout: 30000 });
        await resolveBtn.click();
        await expect.poll(resolvedCount, { timeout: 60000, message: 'ProcessResolved lands on-chain' }).toBe(resolvedBefore + 1);

        // ── (d) RESOLUTION in florins: buyer net −payment, seller net
        //    +payment, escrow back to its baseline; the mock token never moved. ──
        const payment = event.args.payment!;
        const [buyerFinal, sellerFinal, coreFinal, sellerMockFinal] = await Promise.all([
            balanceOf(florin, BUYER), balanceOf(florin, SELLER), balanceOf(florin, core), balanceOf(mockToken, SELLER),
        ]);
        expect(buyerBefore - buyerFinal, 'the buyer paid exactly the payment, in florins').toBe(payment);
        expect(sellerFinal - sellerBefore, 'the seller earned exactly the payment, in florins').toBe(payment);
        expect(coreFinal, 'FigaroCore holds no florin of this process after resolution').toBe(coreBefore);
        expect(sellerMockFinal, "the seller's other accepted token never moved").toBe(sellerMockBefore);
    });
});
