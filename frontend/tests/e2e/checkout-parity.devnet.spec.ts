/**
 * checkout-parity.devnet.spec.ts — what the buyer reads at checkout, for every
 * seller, the bound assembly and every composed clause of a process, against
 * the figures the test computes from the payments alone, and then against the
 * chain.
 *
 * The bond rule (CLAUDE.md § "The Core's rules", rule 1): the buyer locks
 * twice the payment of each order; each seller locks twice the running total
 * of the trade, the sum of the payments of every order committed so far, in
 * commit order, its own included. Three sellers priced 3, 2 and 1 make every
 * figure of the rule distinct: running totals 3, 5, 6; buyer bonds 6, 4, 2;
 * seller bonds 6, 10, 12; 12 locked by the buyer in all.
 *
 *   bind      the freelancer-value-chain reference (anchored by the seeding,
 *             found by shape) is bound by a lead whose binding designates two
 *             contributors; each of the three lists one item at its own price.
 *   checkout  the screen names the bound assembly, prices each seller's row
 *             from its own catalog, totals the rows, locks twice the total,
 *             and lists every order of the assembly under its seller with
 *             every clause the order composes (and every assembly-scoped
 *             clause) — each read against the assembly hydrated from the
 *             chain and IPFS, never a list in this file.
 *   sign      each order's preview names its seller, its payment, the running
 *             total, the buyer bond and the seller bond; the expected figures
 *             are computed here from the payments, in the commit order the
 *             signed running totals fix (the lead's root order first).
 *   chain     each seller accepts in that order: every OrderCommitted carries
 *             the payment and running total the preview showed, and every
 *             balance moves by the bonds the preview showed.
 *   resolve   one resolution pays each seller its payment and returns the
 *             escrow to its baseline.
 *
 * Wallets: four keys this spec derives from its own name (every anvil index
 * 0..46 is some spec's already), funded by `fundDevnetWallets` and signed for
 * in the browser through the local-key signer bridge (`local-signer.ts`). A
 * re-run signs as the same four wallets; the seeding rewrites the three
 * profiles each run.
 *
 * Requires Anvil + ./scripts/devup.sh (deploy + populate) + Kubo + :3100.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createPublicClient, formatUnits, http, keccak256, parseAbi, parseUnits, stringToHex, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    LOCAL_ANVIL,
    RPC_URL,
    confirmAgreementPreviews,
    discoverAnchoredAssemblies,
    fillFreelancerChainCheckout,
    findFreelancerChainAssembly,
    fundDevnetWallets,
    isBindingOf,
    keyOf,
    memberProfileBindings,
    pinJSONToIPFS,
    primeRegisteredClauseSpecs,
    readLocalDeploymentConfig,
    seedRegisteredMember,
    waitForConnected,
} from './devnet-helpers';
import { attachLocalSigner } from './local-signer';
import { CORE_ABI } from '@/lib/core/contracts';

const ERC20_ABI = parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
]);

const walletKey = (role: string) => keccak256(stringToHex(`checkout-parity.devnet.spec.ts:${role}`));
const BUYER_KEY = walletKey('buyer');
const SELLERS = [
    { role: 'lead', key: walletKey('lead'), name: 'Parity lead', item: 'Lead deliverable', price: '3' },
    { role: 'contributor-1', key: walletKey('contributor-1'), name: 'Parity contributor one', item: 'Edit pass', price: '2' },
    { role: 'contributor-2', key: walletKey('contributor-2'), name: 'Parity contributor two', item: 'Translation', price: '1' },
].map((s) => ({ ...s, address: privateKeyToAccount(s.key).address }));

/** The raw integer an AgreementReview row states beside its figure: "(raw: N — …)". */
function rawOf(text: string | null): bigint {
    const m = text?.match(/raw: (\d+)/);
    expect(m, `the row states its raw amount: ${text}`).toBeTruthy();
    return BigInt(m![1]);
}

test.describe('CHECKOUT PARITY — every seller, the bound assembly, every composed clause, and the bond rule on screen (devnet)', () => {
    test.setTimeout(480_000);

    test('the checkout and each preview state the figures the payments fix, and the chain moves exactly those', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;
        const decimals = Number(await publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'decimals' }));
        const symbol = String(await publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'symbol' }));
        const figure = (amount: bigint) => formatUnits(amount, decimals);

        const buyer = privateKeyToAccount(BUYER_KEY);
        const [lead, ...contributors] = SELLERS;
        await fundDevnetWallets([buyer.address, ...SELLERS.map((s) => s.address)]);
        await attachLocalSigner(page.context(), {
            accounts: [buyer, ...SELLERS.map((s) => privateKeyToAccount(s.key))],
            chain: LOCAL_ANVIL, rpcUrl: RPC_URL, defaultAccount: buyer.address,
        });

        // ── THE ASSEMBLY, from the chain: the reference found by shape, then
        //    hydrated (every agreement read by key and verified). ──
        await primeRegisteredClauseSpecs();
        const contentClause = keyOf('figaro-content-handoff');
        const slug = await findFreelancerChainAssembly();
        const assembly = (await discoverAnchoredAssemblies()).find((a) => a.slug === slug)!;
        expect(assembly, 'the reference hydrates from chain → IPFS').toBeTruthy();
        const processDesignHash = assembly.processDesignHash;
        const root = assembly.agreements.find((a) => a.follows.length === 0)!;
        expect(root, 'the assembly has one root order').toBeTruthy();

        // ── BIND: each seller lists one item at its own price and binds the
        //    assembly; the lead designates the two contributors by the content
        //    clause the sub-orders compose (the per-clause cursor). ──
        for (const s of SELLERS) {
            const { uri: catalogURI } = await pinJSONToIPFS({
                subjectAddress: s.address,
                version: '1.0.0',
                unitSystem: 'metric' as const,
                items: [{
                    id: `parity-${s.role}`, name: s.item, description: `${s.item}, priced for the checkout parity spec`,
                    price: s.price, category: 'digital', available: true,
                }],
            });
            await seedRegisteredMember({
                walletKey: s.key,
                profile: {
                    name: s.name,
                    description: `${s.role}, seeded by checkout-parity.devnet.spec.ts`,
                    catalogURI,
                    acceptedTokens: [{ address: token, symbol, chainId: LOCAL_ANVIL.id }],
                    defaultTokenAddress: token,
                    processBindings: [{
                        bindingId: `parity-${s.role}`,
                        subjectAddress: s.address,
                        processDesignHash,
                        coSellerBindings: s === lead
                            ? [{ clauseKey: contentClause, addresses: contributors.map((c) => c.address) }]
                            : [],
                    }],
                },
            });
            expect(
                (await memberProfileBindings(s.address)).some((b) => isBindingOf(b, processDesignHash)),
                `${s.role}'s pinned profile binds the assembly`,
            ).toBe(true);
        }

        // The figures the rule fixes, computed from the payments alone, in
        // commit order (the lead's root first, then the contributors).
        const payments = SELLERS.map((s) => parseUnits(s.price, decimals));
        const total = payments.reduce((a, b) => a + b, 0n);

        // ── BASELINES (deltas, never absolutes). ──
        const base = new Map<string, bigint>();
        for (const who of [buyer.address, core, ...SELLERS.map((s) => s.address)]) {
            base.set(who.toLowerCase(), await balanceOf(who));
        }
        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: buyer.address }, fromBlock: 0n,
        });
        const committedBefore = (await queryCommitted()).length;

        // ── CHECKOUT: the buyer orders the lead's item. ──
        await gotoAsWallet(page, buyer.address, `/s/view?seller=${lead.address}&e2e=devnet`);
        await page.getByTestId('member-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        await waitForConnected(page);

        // The bound assembly: the lead binds one, so the method line names it.
        await expect(page.getByTestId('method-static'), 'the method line names the bound assembly')
            .toHaveAttribute('data-method', slug, { timeout: 30000 });

        // Every seller: one row each, named by its profile, priced from its own catalog.
        const breakdown = page.getByTestId('cart-contributor-breakdown');
        await expect(breakdown, 'the checkout prices each seller in its own row').toBeVisible({ timeout: 30000 });
        await expect(breakdown.locator('[data-testid^="kit-row-payment-"]'), 'one priced row per seller').toHaveCount(SELLERS.length);
        for (const [i, s] of SELLERS.entries()) {
            await expect(
                breakdown.getByText(s.name, { exact: true }).locator('xpath=..').locator('[data-testid^="kit-row-payment-"]'),
                `${s.role}'s row states its own catalog price`,
            ).toHaveText(figure(payments[i]), { timeout: 30000 });
        }
        await expect(page.getByTestId('cart-kit-total'), 'the total is the sum of the payments').toHaveText(figure(total));
        await expect(page.getByTestId('checkout-locked-total'), 'the buyer locks twice the total').toHaveText(figure(2n * total));
        await expect(page.getByTestId('checkout-bond-arithmetic'), 'the doubling is stated on one line').toContainText(
            `${figure(2n * total)} ${symbol} = twice the total: ${figure(total)} transfers to the sellers when you resolve, and ${figure(total)} is your bond`,
        );

        // Every order and every composed clause, under the seller it is
        // assigned to, read against the hydrated assembly.
        const terms = page.getByTestId('checkout-agreement-terms');
        await expect(terms).toBeVisible({ timeout: 30000 });
        const sellerLabels: string[] = [];
        for (const order of assembly.agreements) {
            const group = terms.getByTestId(`agreement-order-${order.id}`);
            await expect(group, `order ${order.id} is listed for review`).toBeVisible({ timeout: 30000 });
            const clauseKeys = Object.keys(order.clauses);
            expect(clauseKeys.length, `order ${order.id} composes clauses`).toBeGreaterThan(0);
            for (const clauseKey of clauseKeys) {
                await expect(group.getByTestId(`agreement-clause-${clauseKey}`), `order ${order.id} lists ${clauseKey}`).toHaveCount(1);
            }
            await expect(group.locator('li[data-testid^="agreement-clause-"]'), `order ${order.id} lists no clause it does not compose`)
                .toHaveCount(clauseKeys.length);
            const label = ((await group.locator('p').first().textContent()) ?? '').trim();
            if (order === root) expect(label, 'the root order is the lead\'s').toBe(lead.name);
            sellerLabels.push(label);
        }
        expect([...sellerLabels].sort(), 'each order is assigned one of the three sellers, each seller once')
            .toEqual(SELLERS.map((s) => s.name).sort());
        const assemblyClauseKeys = Object.keys(assembly.hydrated.assembly.assemblyClauses ?? {});
        for (const clauseKey of assemblyClauseKeys) {
            await expect(
                terms.getByTestId('agreement-order-assembly').getByTestId(`agreement-clause-${clauseKey}`),
                `the assembly-scoped clause ${clauseKey} is listed for review`,
            ).toHaveCount(1);
        }

        // ── SIGN: each preview read before its confirm, in the order they open. ──
        await fillFreelancerChainCheckout(page);
        const place = page.getByTestId('btn-place-order');
        await expect(place, 'the buyer connected and every term filled → "Place order"').toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        const previews: Array<{ seller: string; payment: bigint; runningTotal: bigint; buyerBond: bigint; sellerBond: bigint }> = [];
        await confirmAgreementPreviews(page, SELLERS.length, async () => {
            previews.push({
                seller: ((await page.getByTestId('preview-seller').textContent()) ?? '').trim().toLowerCase(),
                payment: rawOf(await page.getByTestId('preview-payment').textContent()),
                runningTotal: rawOf(await page.getByTestId('preview-cumulative').textContent()),
                buyerBond: rawOf(await page.getByTestId('preview-buyer-bond').textContent()),
                sellerBond: rawOf(await page.getByTestId('preview-seller-bond').textContent()),
            });
        });
        expect(previews.map((p) => p.seller).sort(), 'one preview per seller')
            .toEqual(SELLERS.map((s) => s.address.toLowerCase()).sort());
        // Commit order is the order of the signed running totals (the Core
        // admits each order only at the standing running total plus its own
        // payment); the previews may open in another order.
        previews.sort((a, b) => (a.runningTotal < b.runningTotal ? -1 : a.runningTotal > b.runningTotal ? 1 : 0));
        expect(previews[0].seller, 'the root order, the lead\'s, commits first').toBe(lead.address.toLowerCase());
        let runningTotal = 0n;
        for (const p of previews) {
            const s = SELLERS.find((x) => x.address.toLowerCase() === p.seller)!;
            const payment = parseUnits(s.price, decimals);
            runningTotal += payment;
            expect(p.payment, `${s.role}'s preview states its catalog price`).toBe(payment);
            expect(p.runningTotal, `${s.role}'s preview states the sum of the payments through its order`).toBe(runningTotal);
            expect(p.buyerBond, `${s.role}'s preview: the buyer bonds twice the payment`).toBe(2n * payment);
            expect(p.sellerBond, `${s.role}'s preview: the seller bonds twice the running total`).toBe(2n * runningTotal);
        }
        expect(runningTotal, 'the last running total is the total').toBe(total);
        expect(previews.reduce((a, p) => a + p.buyerBond, 0n), 'the buyer bonds sum to the locked total').toBe(2n * total);
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        // ── CHAIN: each seller accepts in commit order; each commit
        //    carries the previewed figures and moves exactly the previewed bonds. ──
        let processId: Hex | undefined;
        let buyerBonds = 0n;
        let escrow = 0n;
        for (const p of previews) {
            const s = SELLERS.find((x) => x.address.toLowerCase() === p.seller)!;
            const before = (await queryCommitted()).length;
            await gotoAsWallet(page, s.address, '/orders?e2e=devnet');
            await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
            await waitForConnected(page);
            await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30000 });
            await page.getByTestId('btn-accept-order').first().click();
            await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
            await page.getByTestId('preview-confirm').click();
            await expect.poll(async () => (await queryCommitted()).length, {
                timeout: 60000, message: `${s.role}'s accept lands OrderCommitted`,
            }).toBe(before + 1);
            const event = (await queryCommitted()).at(-1)!;
            expect(event.args.seller?.toLowerCase(), `${s.role} committed`).toBe(p.seller);
            if (!processId) processId = event.args.processId as Hex;
            else expect(event.args.processId, `${s.role} extends the same process`).toBe(processId);
            expect(event.args.payment, `${s.role}'s commit carries the previewed payment`).toBe(p.payment);
            expect(event.args.runningTotal, `${s.role}'s commit carries the previewed running total`).toBe(p.runningTotal);
            buyerBonds += p.buyerBond;
            escrow += p.buyerBond + p.sellerBond;
            const [b, sb, c] = await Promise.all([balanceOf(buyer.address), balanceOf(s.address), balanceOf(core)]);
            expect(base.get(buyer.address.toLowerCase())! - b, `after ${s.role}: the buyer is down by the previewed buyer bonds`).toBe(buyerBonds);
            expect(base.get(s.address.toLowerCase())! - sb, `${s.role} is down by its previewed seller bond`).toBe(p.sellerBond);
            expect(c - base.get(core.toLowerCase())!, 'the escrow holds every previewed bond so far').toBe(escrow);
        }
        expect((await queryCommitted()).length, 'exactly three orders committed').toBe(committedBefore + SELLERS.length);

        // ── RESOLVE: one resolution pays every seller its payment. ──
        await gotoAsWallet(page, buyer.address, `/orders/view?process=${processId}&e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await expect(resolveBtn, 'the buyer can resolve the process').toBeEnabled({ timeout: 30000 });
        await resolveBtn.click();
        await expect.poll(async () => (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { processId }, fromBlock: 0n,
        })).length, { timeout: 60000, message: 'ProcessResolved lands on-chain' }).toBe(1);
        for (const [i, s] of SELLERS.entries()) {
            expect((await balanceOf(s.address)) - base.get(s.address.toLowerCase())!, `${s.role} is paid exactly its payment`)
                .toBe(payments[i]);
        }
        expect(base.get(buyer.address.toLowerCase())! - (await balanceOf(buyer.address)), 'the buyer paid exactly the total')
            .toBe(total);
        expect(await balanceOf(core), 'the escrow is back at its baseline').toBe(base.get(core.toLowerCase())!);
    });
});
