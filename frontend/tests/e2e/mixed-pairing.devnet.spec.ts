/**
 * mixed-pairing.devnet.spec.ts — HUMAN BUYER × AGENT CANDIDATE: the dispatch
 * race across BOTH worlds in one race, end to end.
 *
 * The parity claim, proven live: a human buyer's browser and an agent's
 * headless service exchange the SAME artifacts — only the transport differs
 * per candidate.
 *
 *   - The AGENT courier (anvil[12]) is a Node HTTP service run BY THIS SPEC —
 *     real key, real signatures, no browser, no UI. Its seller profile
 *     declares `services.rest`, which is what makes it an agent candidate:
 *     the buyer's race POSTs the unsigned draft to the endpoint (the
 *     HttpChannel wire: 200 = countersigned, 204 = declined) and the HTTP
 *     response IS the reply. It prices at 1.5 — the cheapest — so the AGENT
 *     wins a race that also has a human in it.
 *   - The HUMAN courier (anvil[10], posted 2) counter-signs on their own
 *     /sign tab over the wallet coordination channel — same race, other
 *     transport, proving coexistence.
 *   - The winner being an agent, the commit-ready payload (both signatures)
 *     is ALSO delivered to its endpoint; the agent approves its bond and
 *     BROADCASTS THE COMMIT ITSELF once the root lands — no browser ever
 *     acts for the agent wallet.
 *
 * Money legs from chain: agent nets exactly its posted price, the human
 * courier (who counter-signed and lost) nets exactly zero, escrow to
 * baseline.
 *
 * Cast: buyer anvil[14] · merchant anvil[6] (Aurora) · human courier
 * anvil[10] · AGENT courier anvil[12] (used by no other spec).
 *
 * No evmSnapshot/evmRevert — devnet is a mainnet rehearsal.
 * Requires Anvil + ./scripts/deploy-local.sh + populate-test-data + Kubo + :3100.
 */
import { createServer, type Server } from 'node:http';
import { test, expect, gotoAsWallet, newWalletPage } from './devnet-multi-test';
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, parseUnits, type Hex } from 'viem';
import { privateKeyToAccount, mnemonicToAccount } from 'viem/accounts';
import {
    confirmAgreementPreviews,
    DELIVERY_DEVICE,
    ensureDeliveryAssembly,
    fillDeliveryCheckout,
    pinJSONToIPFS,
    readLocalDeploymentConfig,
    seedRegisteredMember,
    memberProfileBindings,
    waitForConnected,
} from './devnet-helpers';
import { ANVIL_ACCOUNTS, ANVIL_KEYS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';
import { calculateBonds } from '@figaro/sdk';
import {
    makeHttpOfferResponder,
    makeSellerRaceHandler,
    deserializeCommitmentPayload,
    type CommitmentPayload,
    type OfferPolicy,
} from '@figaro/sdk/agent';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const ERC20_ABI = parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function mint(address to, uint256 amount)',
    'function approve(address spender, uint256 amount) returns (bool)',
]);

const BUYER = ANVIL_ACCOUNTS[14] as Hex;
const MERCHANT = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 6 }).address as Hex;
const HUMAN_COURIER = privateKeyToAccount(ANVIL_KEYS[29]).address as Hex;  // posted 2, countersigns in a tab
const AGENT_ACCOUNT = privateKeyToAccount(ANVIL_KEYS[30]);                 // posted 1.5, answers over HTTP
const AGENT_COURIER = AGENT_ACCOUNT.address as Hex;
const AGENT_PORT = 8993;
const AGENT_ENDPOINT = `http://127.0.0.1:${AGENT_PORT}`;

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, accept',
    'Access-Control-Allow-Private-Network': 'true',
} as const;

test.describe('MIXED PAIRING — a human buyer races an agent service and a human courier together (devnet)', () => {
    test.setTimeout(480_000);

    test('agent candidate replies over HTTP, beats the human courier, receives the commit-ready payload, and broadcasts itself', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const agentWallet = createWalletClient({ account: AGENT_ACCOUNT, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

        await page.context().grantPermissions(['geolocation']);
        await page.context().setGeolocation({ latitude: DELIVERY_DEVICE.lat, longitude: DELIVERY_DEVICE.lon });

        // ── THE AGENT: a real headless service holding anvil[12]'s key.
        //    Race drafts hit the SDK responder (counterSignDraft behind the
        //    two floors); the commit-ready payload (both sigs) is stashed for
        //    the broadcast step. Shape-dispatch exactly as the operator doc
        //    describes. ──
        const policy: OfferPolicy = { currencyAllowlist: [token], maxValue: parseUnits('1000', 18) };
        const respondToRaceDraft = makeHttpOfferResponder(
            makeSellerRaceHandler(agentWallet, { chainId: 31337, core }, { accept: () => true, policy }),
        );
        let commitReady: CommitmentPayload | null = null;
        const agentServer: Server = createServer((req, res) => {
            if (req.method === 'OPTIONS') {
                res.writeHead(204, CORS_HEADERS);
                res.end();
                return;
            }
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
                void (async () => {
                    try {
                        const payload = deserializeCommitmentPayload(body);
                        if (payload.buyerSig && payload.sellerSig) {
                            // The winner's commit-ready delivery.
                            commitReady = payload;
                            res.writeHead(200, { ...CORS_HEADERS, 'content-type': 'application/json' });
                            res.end('{}');
                            return;
                        }
                        const out = await respondToRaceDraft(body);
                        res.writeHead(out.status, { ...CORS_HEADERS, 'content-type': 'application/json' });
                        res.end(out.body);
                    } catch {
                        res.writeHead(400, CORS_HEADERS);
                        res.end();
                    }
                })();
            });
        });
        await new Promise<void>((resolve) => agentServer.listen(AGENT_PORT, resolve));

        try {
            // ── GATES (idempotent): assembly, Aurora's undesignated binding,
            //    the two couriers (human posted 2 / agent posted 1.5 +
            //    services.rest), funding. ──
            const deliverySlug = await ensureDeliveryAssembly(page);
            if (!(await memberProfileBindings(MERCHANT)).some((b) => b.assemblySlug === deliverySlug)) {
                await gotoAsWallet(page, MERCHANT, '/sellers/edit/assemblies?e2e=devnet');
                const row = page.getByTestId(`seller-assembly-row-${deliverySlug}`);
                await row.waitFor({ state: 'visible', timeout: 30000 });
                await row.locator('input[type="checkbox"]').first().check();
                await page.getByRole('button', { name: 'Save changes' }).click();
                await expect.poll(async () =>
                    (await memberProfileBindings(MERCHANT)).some((b) => b.assemblySlug === deliverySlug), {
                    timeout: 60000, message: "the merchant's binding lands",
                }).toBe(true);
            }
            const seedCourier = async (
                walletKey: `0x${string}`, address: Hex, name: string, price: string,
                services?: { rest: string },
            ) => {
                const { uri: catalogueURI } = await pinJSONToIPFS({
                    subjectAddress: address,
                    version: '1.0.0',
                    unitSystem: 'metric' as const,
                    items: [{
                        id: `race-delivery-${address.slice(2, 8).toLowerCase()}`,
                        name: 'Raced delivery',
                        description: `Posted delivery rate (${price} MOCK)`,
                        price,
                        category: 'delivery',
                        image: '🚲',
                        available: true,
                    }],
                });
                await seedRegisteredMember({
                    walletKey,
                    profile: {
                        name,
                        description: 'Courier seeded for the market-formation specs',
                        catalogueURI,
                        acceptedTokens: [{ address: token, symbol: 'MOCK', chainId: 31337 }],
                        defaultTokenAddress: token,
                        assemblyBindings: [{
                            bindingId: `race-binding-${address.slice(2, 8).toLowerCase()}`,
                            subjectAddress: address,
                            assemblySlug: deliverySlug,
                            counterpartyBindings: [],
                        }],
                        ...(services ? { services } : {}),
                    },
                });
            };
            await seedCourier(ANVIL_KEYS[29], HUMAN_COURIER, 'Race Courier (cheap)', '2');
            await seedCourier(ANVIL_KEYS[30], AGENT_COURIER, 'Race Courier (agent)', '1.5', { rest: AGENT_ENDPOINT });
            const minter = createWalletClient({
                account: privateKeyToAccount(ANVIL_KEYS[0]), chain: LOCAL_ANVIL, transport: http(RPC_URL),
            });
            for (const who of [BUYER, HUMAN_COURIER, AGENT_COURIER]) {
                const hash = await minter.writeContract({
                    address: token, abi: ERC20_ABI, functionName: 'mint', args: [who, parseUnits('1000', 18)],
                });
                await publicClient.waitForTransactionReceipt({ hash });
            }

            const queryCommitted = () => publicClient.getContractEvents({
                address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
            });
            const committedBefore = (await queryCommitted()).length;
            const [buyer0, merchant0, agent0, human0, core0] = await Promise.all([
                balanceOf(BUYER), balanceOf(MERCHANT), balanceOf(AGENT_COURIER), balanceOf(HUMAN_COURIER), balanceOf(core),
            ]);

            // ── CHECKOUT + RACE: the agent's reply arrives over HTTP with no
            //    tab anywhere; the human counter-signs on /sign. ──
            await gotoAsWallet(page, BUYER, `/s/view?seller=${MERCHANT}&e2e=devnet`);
            await page.getByTestId('seller-detail-view').waitFor({ timeout: 30000 });
            await waitForConnected(page);
            const addBtn = page.locator('[data-testid^="btn-add-"]').first();
            await addBtn.waitFor({ state: 'visible', timeout: 20000 });
            await addBtn.click();
            await page.getByTestId('btn-review-order').click();
            await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
            const methodSelect = page.getByTestId('select-method');
            if (await methodSelect.isVisible().catch(() => false)) {
                await methodSelect.selectOption(deliverySlug);
            }
            await expect(page.getByTestId('race-panel')).toBeVisible({ timeout: 30000 });
            await fillDeliveryCheckout(page);
            await page.getByTestId('race-start').click();

            const agentRow = page.getByTestId(`race-candidate-${AGENT_COURIER.toLowerCase()}`);
            const humanRow = page.getByTestId(`race-candidate-${HUMAN_COURIER.toLowerCase()}`);
            await agentRow.waitFor({ state: 'visible', timeout: 60000 });
            await humanRow.waitFor({ state: 'visible', timeout: 15000 });

            // THE mixed-pairing assert: the agent replied over HTTP — no
            // browser, no tab, no channel — before any human acted.
            await expect.poll(async () => agentRow.getAttribute('data-replied'), {
                timeout: 30000, message: "the AGENT's countersignature arrives over its HTTP endpoint",
            }).toBe('true');

            // The human courier counter-signs on their own tab — the OTHER
            // transport, same race.
            const humanTab = await newWalletPage(page.context());
            humanTab.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
            await gotoAsWallet(humanTab, HUMAN_COURIER, '/sign?e2e=devnet');
            await waitForConnected(humanTab);
            await humanTab.getByTestId('agreement-review').waitFor({ state: 'visible', timeout: 60000 });
            const returnBtn = humanTab.getByTestId('btn-counter-sign-return');
            const approveBond = humanTab.getByRole('button', { name: /Authorize Payment/ });
            await expect(returnBtn.or(approveBond)).toBeVisible({ timeout: 60000 });
            if (await approveBond.isVisible().catch(() => false)) {
                await approveBond.click();
            }
            await returnBtn.waitFor({ state: 'visible', timeout: 60000 });
            await returnBtn.click();
            await humanTab.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
            await humanTab.getByTestId('preview-confirm').click();
            await humanTab.getByTestId('sign-offer-returned').waitFor({ state: 'visible', timeout: 60000 });
            await expect.poll(async () => humanRow.getAttribute('data-replied'), {
                timeout: 60000, message: "the human courier's countersignature lands too",
            }).toBe('true');

            // Cheapest AVAILABLE wins: the agent at 1.5 beats the human at 2.
            await page.getByTestId('race-select-now').click();
            const winner = page.getByTestId('race-winner');
            await winner.waitFor({ state: 'visible', timeout: 15000 });
            expect((await winner.getAttribute('data-seller'))!.toLowerCase(), 'the AGENT wins the mixed race')
                .toBe(AGENT_COURIER.toLowerCase());

            // ── PLACE; the commit-ready payload is delivered to the agent's
            //    endpoint (dual delivery — the channel relay also goes out). ──
            const place = page.getByTestId('btn-place-order');
            await expect(place).toHaveText(/Place order/, { timeout: 20000 });
            await place.click();
            await confirmAgreementPreviews(page, 2);
            await page.getByTestId('send-commitment-xmtp').click();
            await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });
            await expect.poll(() => commitReady !== null, {
                timeout: 60000, message: "the agent's endpoint receives the commit-ready payload (both signatures)",
            }).toBe(true);
            expect(commitReady!.buyerSig, 'the delivered payload carries the buyer signature').toBeTruthy();
            expect(commitReady!.sellerSig, "…and the agent's own countersignature").toBeTruthy();

            // ── ROOT accept (merchant, human UI). ──
            await gotoAsWallet(page, MERCHANT, '/orders?e2e=devnet');
            await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
            await waitForConnected(page);
            await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30000 });
            await page.getByTestId('btn-accept-order').first().click();
            await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
            await page.getByTestId('preview-confirm').click();
            await expect.poll(async () => (await queryCommitted()).length, {
                timeout: 60000, message: 'the root commits',
            }).toBe(committedBefore + 1);
            const rootEvent = (await queryCommitted())[committedBefore];
            const processId = rootEvent.args.processId!;
            const rootBonds = calculateBonds(rootEvent.args.cumulativeValue!, rootEvent.args.payment!);

            // ── THE AGENT BROADCASTS ITSELF: approve the bond, submit the
            //    commit — headless, its own key, its own gas. ──
            const c = commitReady!.commitment;
            // calculateBonds(cumulativeValue, payment): seller bonds 2× the
            // CUMULATIVE value at this depth, not 2× its own payment.
            const agentBond = calculateBonds(c.expectedCumulativeValue, c.payment).sellerBond;
            await agentWallet.writeContract({
                address: token, abi: ERC20_ABI, functionName: 'approve', args: [core, agentBond],
            }).then((h) => publicClient.waitForTransactionReceipt({ hash: h }));
            const commitReceipt = await agentWallet.writeContract({
                address: core, abi: CORE_ABI, functionName: 'commit',
                args: [c, commitReady!.buyerSig!, commitReady!.sellerSig!],
            }).then((h) => publicClient.waitForTransactionReceipt({ hash: h }));
            expect(commitReceipt.status, "the agent's own broadcast lands").toBe('success');

            const courierEvent = (await queryCommitted())[committedBefore + 1];
            expect(courierEvent.args.processId, 'the raced order extends the same process').toBe(processId);
            expect(courierEvent.args.seller?.toLowerCase(), 'the committed seller IS the agent wallet')
                .toBe(AGENT_COURIER.toLowerCase());
            expect(courierEvent.args.payment, "committed at the agent's posted 1.5").toBe(parseUnits('1.5', 18));
            const agentBonds = calculateBonds(courierEvent.args.cumulativeValue!, courierEvent.args.payment!);
            {
                const [b, a, cc] = await Promise.all([balanceOf(BUYER), balanceOf(AGENT_COURIER), balanceOf(core)]);
                expect(buyer0 - b, 'buyer down by both buyer bonds').toBe(rootBonds.buyerBond + agentBonds.buyerBond);
                expect(agent0 - a, 'the agent bonded 2× the cumulative value from its own wallet').toBe(agentBonds.sellerBond);
                expect(cc - core0, 'escrow holds all four bonds').toBe(
                    rootBonds.buyerBond + rootBonds.sellerBond + agentBonds.buyerBond + agentBonds.sellerBond,
                );
            }

            // ── RESOLVE + settlement: the agent nets its price; the human
            //    who counter-signed and lost nets exactly zero. ──
            const resolvedBefore = (await publicClient.getContractEvents({
                address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
            })).length;
            await gotoAsWallet(page, BUYER, `/orders/view?process=${processId}&e2e=devnet`);
            await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
            await waitForConnected(page);
            const resolveBtn = page.getByTestId('capability-execute-resolve-process');
            await expect(resolveBtn).toBeEnabled({ timeout: 30000 });
            await resolveBtn.click();
            await expect.poll(async () => (await publicClient.getContractEvents({
                address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
            })).length, { timeout: 60000, message: 'ProcessResolved lands' }).toBe(resolvedBefore + 1);
            const [buyerF, merchantF, agentF, humanF, coreF] = await Promise.all([
                balanceOf(BUYER), balanceOf(MERCHANT), balanceOf(AGENT_COURIER), balanceOf(HUMAN_COURIER), balanceOf(core),
            ]);
            expect(buyerF, 'buyer net paid meal + the agent delivery')
                .toBe(buyer0 - rootEvent.args.payment! - courierEvent.args.payment!);
            expect(merchantF - merchant0).toBe(rootEvent.args.payment!);
            expect(agentF - agent0, 'the AGENT net earned exactly its posted price (bond returned)')
                .toBe(courierEvent.args.payment!);
            expect(humanF - human0, "the losing HUMAN courier's balance is untouched").toBe(0n);
            expect(coreF, 'escrow returned to baseline').toBe(core0);
        } finally {
            await new Promise<void>((resolve) => agentServer.close(() => resolve()));
        }
    });
});
