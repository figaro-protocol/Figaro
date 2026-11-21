/**
 * relay-transport.devnet.spec.ts — one trade on the batch path, every act in
 * the app's UI, sent through a relay the seller's profile names.
 *
 *   relay    → the relay this tree built, started with nothing and rebuilt
 *              from the chain (`startRelay`), proving under the mock prover
 *              the devnet verifier accepts
 *   design   → a designer publishes a single-order assembly carrying a
 *              per-run probe clause, through the canvas (`publishProbeAssembly`)
 *   bind     → the seller's profile binds that assembly with both paths
 *              declared (`paths: ["direct", "batch"]`) and lists the relay
 *              among its services (`services.relay`), registered on chain
 *   checkout → the buyer, in the UI, is offered both paths, picks the batch
 *              path, approves its bond to the batch verifier and signs for
 *              the verifier's domain; the order is relayed to the seller
 *   accept   → the seller, in the UI, approves its bond to the verifier,
 *              counter-signs, and the app sends the order to the relay, which
 *              the page reads from the seller's profile and checks against
 *              the chain
 *   attest   → the seller advances the probe ladder on the order page; the
 *              app signs under the verifier's domain and sends it to the relay
 *   resolve  → the buyer resolves on the order page, the same way
 *
 * Every chain fact is read OUT OF BAND, never from the screen: the bonds'
 * allowances to the verifier, the verifier's `OrderCommitted`, `Attestation`,
 * `OrderResolved` and `ProcessResolved`, FigaroCore's and the coordinator's
 * silence, and both parties' token balances.
 *
 * Skips when no relay binary is built, unless REQUIRE_BATCH_E2E=1 (the full
 * devnet suite in CI): a missing binary is then a failure. Requires Anvil +
 * ./scripts/devup.sh (deploy + populate) + Kubo + :3100.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import fs from 'node:fs';
import { createWalletClient, http, keccak256, parseAbi, stringToHex, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    LOCAL_ANVIL,
    RPC_URL,
    confirmAgreementPreviews,
    discoverAnchoredAssemblies,
    fundDevnetWallets,
    isBindingOf,
    localPublicClient,
    memberProfileBindings,
    pinJSONToIPFS,
    readLocalDeploymentConfig,
    seedRegisteredMember,
    waitForConnected,
} from './devnet-helpers';
import { attachLocalSigner } from './local-signer';
import { publishProbeAssembly } from './probeAssembly';
import { REQUIRE_RELAY, SEQUENCER_BIN, startRelay } from './relayProcess';
import { BATCH_VERIFIER_ABI, CORE_ABI, ERC20_ABI, calculateBonds } from '@figaro-protocol/sdk';
import { SequencerClient } from '@figaro-protocol/sdk/agent';

const RELAY_PORT = 3012;
const MINT_ABI = parseAbi(['function mint(address to, uint256 amount) external']);

// Keys this spec derives from its own name and the role (no anvil index: every
// one of 0..46 is some spec's), funded by `fundDevnetWallets` and signed for
// in the browser through the local-key signer bridge.
const keyFor = (role: string) => keccak256(stringToHex(`relay-transport.devnet.spec.ts:${role}`));
const DESIGNER_KEY = keyFor('designer');
const SELLER_KEY = keyFor('seller');
const BUYER_KEY = keyFor('buyer');
const RELAY_SIGNER_KEY = keyFor('relay');

test.describe('RELAY TRANSPORT — a trade on the batch path, every act in the UI (devnet)', () => {
    test.setTimeout(900_000);

    test('the buyer picks the batch path at checkout, the seller accepts, attests, and the buyer resolves, each through a checked relay; the verifier emits every event', async ({ page, baseURL }) => {
        if (REQUIRE_RELAY && !fs.existsSync(SEQUENCER_BIN)) {
            throw new Error(`REQUIRE_BATCH_E2E=1 but no sequencer binary is at ${SEQUENCER_BIN}`);
        }
        test.skip(!fs.existsSync(SEQUENCER_BIN), `no sequencer binary at ${SEQUENCER_BIN} (cargo build --release -p figaro-sequencer)`);
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const verifier = config.batchVerifier as Hex;
        const core = config.figaroCore as Hex;
        const coordinator = config.attestationCoordinator as Hex;
        const token = config.tokenAddress as Hex;
        expect(verifier, 'the devnet names its batch verifier').toMatch(/^0x[0-9a-fA-F]{40}$/);
        const publicClient = localPublicClient();

        const designer = privateKeyToAccount(DESIGNER_KEY);
        const seller = privateKeyToAccount(SELLER_KEY);
        const buyer = privateKeyToAccount(BUYER_KEY);
        const relaySigner = privateKeyToAccount(RELAY_SIGNER_KEY);
        await fundDevnetWallets([designer.address, seller.address, buyer.address, relaySigner.address]);
        await attachLocalSigner(page.context(), {
            accounts: [designer, seller, buyer], chain: LOCAL_ANVIL, rpcUrl: RPC_URL, defaultAccount: designer.address,
        });

        const balanceOf = (who: Hex) => publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;
        const allowanceToVerifier = (who: Hex) => publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'allowance', args: [who, verifier] }) as Promise<bigint>;
        const decimals = await publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'decimals' }) as number;
        // The one catalog item is priced at 1 token: the order's payment.
        const payment = 10n ** BigInt(decimals);
        const bonds = calculateBonds(payment, payment);
        const funder = createWalletClient({ account: relaySigner, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        for (const who of [buyer.address, seller.address]) {
            await publicClient.waitForTransactionReceipt({
                hash: await funder.writeContract({ address: token, abi: MINT_ABI, functionName: 'mint', args: [who, bonds.sellerBond * 2n] }),
            });
        }

        // The relay lets the app under test submit from the browser: its origin
        // is the one BROWSER_SUBMIT_ORIGINS entry.
        expect(baseURL, 'the devnet project names the app\'s base URL').toBeTruthy();
        const appOrigin = new URL(baseURL!).origin;
        const relay = await startRelay({ port: RELAY_PORT, signerKey: RELAY_SIGNER_KEY, scratchPrefix: 'figaro-relay-transport-', browserOrigins: [appOrigin] });
        try {
            // PRECONDITION, out of band: the relay proves with the program whose
            // key the devnet's verifier holds (the deploy pins the key the built
            // relay reports), and it lets the app's origin submit.
            const relayStatus = await new SequencerClient({ url: relay.url }).status();
            const pinnedKey = await publicClient.readContract({ address: verifier, abi: BATCH_VERIFIER_ABI, functionName: 'programVKey' }) as Hex;
            expect(relayStatus.program_vkey.toLowerCase(), 'the relay proves with the key the verifier holds: build the relay, then deploy the devnet').toBe(pinnedKey.toLowerCase());
            expect(relayStatus.batch_verifier.toLowerCase()).toBe(verifier.toLowerCase());
            expect(relayStatus.browser_submit_origins).toEqual([appOrigin]);
            // ── DESIGN: a single-order assembly with a per-run probe clause. ──
            await gotoAsWallet(page, designer.address, '/?e2e=devnet');
            const { slug, clauseKey: probeClauseKey } = await publishProbeAssembly(page);
            const anchored = (await discoverAnchoredAssemblies()).find((a) => a.slug === slug);
            expect(anchored, 'the published assembly hydrates from chain → IPFS').toBeTruthy();
            const processDesignHash = anchored!.processDesignHash;

            // ── BIND: both paths declared, the relay among the profile's services. ──
            const { uri: catalogURI } = await pinJSONToIPFS({
                subjectAddress: seller.address,
                version: '1.0.0',
                unitSystem: 'metric' as const,
                items: [{ id: 'relay-transport-item', name: 'Batch item', description: 'Sold on the batch path', price: '1', category: 'digital', available: true }],
            });
            await seedRegisteredMember({
                walletKey: SELLER_KEY,
                profile: {
                    name: 'Relay transport seller',
                    description: 'Seeded by relay-transport.devnet.spec.ts',
                    catalogURI,
                    acceptedTokens: [{ address: token, symbol: 'MOCK', chainId: LOCAL_ANVIL.id }],
                    defaultTokenAddress: token,
                    processBindings: [{
                        bindingId: `relay-transport-${slug}`,
                        subjectAddress: seller.address,
                        processDesignHash,
                        coSellerBindings: [],
                        paths: ['direct', 'batch'],
                    }],
                    services: { relay: relay.url },
                },
            });
            expect(
                (await memberProfileBindings(seller.address)).some((b) => isBindingOf(b, processDesignHash)),
                "the seller's pinned profile binds this run's assembly",
            ).toBe(true);

            const buyerBefore = await balanceOf(buyer.address);
            const sellerBefore = await balanceOf(seller.address);
            const committedAt = (address: Hex) => publicClient.getContractEvents({
                address, abi: BATCH_VERIFIER_ABI, eventName: 'OrderCommitted', args: { buyer: buyer.address }, fromBlock: 0n,
            });

            // ── CHECKOUT: the buyer is offered both paths and picks the batch path. ──
            await gotoAsWallet(page, buyer.address, `/s/view?seller=${seller.address}&e2e=devnet`);
            await page.getByTestId('member-detail-view').waitFor({ timeout: 30000 });
            await waitForConnected(page);
            const addBtn = page.locator('[data-testid^="btn-add-"]').first();
            await addBtn.waitFor({ state: 'visible', timeout: 20000 });
            await addBtn.click();
            await page.getByTestId('btn-review-order').click();
            await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
            await expect(page.getByTestId('checkout-path-option-direct'), 'the direct path is offered').toBeVisible({ timeout: 60000 });
            const batchOption = page.getByTestId('checkout-path-option-batch');
            await expect(batchOption, 'the batch path is offered once the profile\'s relay passes the check').toBeEnabled({ timeout: 60000 });
            await expect(page.getByTestId('checkout-relay-in-use'), 'the relay in use is the one the profile names').toContainText(relay.url, { timeout: 60000 });
            await batchOption.check();
            await expect(page.getByTestId('checkout-path-batch'), 'the order is signed for the verifier').toContainText(verifier, { ignoreCase: true });
            await page.locator(`[data-testid^="checkout-field-"][data-testid$="-${probeClauseKey}-probeStage-probe-opened"]`).check();
            const place = page.getByTestId('btn-place-order');
            await expect(place).toHaveText(/Place order/, { timeout: 20000 });
            await expect(place, 'the order is placed only once the path and the relay are read').toBeEnabled({ timeout: 60000 });
            await place.click();
            await confirmAgreementPreviews(page, 1);
            await page.getByTestId('send-commitment-xmtp').click();
            await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });
            // CHAIN FACT: the buyer's bond is approved to the verifier, not to FigaroCore.
            expect(await allowanceToVerifier(buyer.address), 'the buyer approved its bond to the batch verifier').toBeGreaterThanOrEqual(bonds.buyerBond);

            // ── ACCEPT: the seller counter-signs; the app sends the order to the relay. ──
            const committedBefore = (await committedAt(verifier)).length;
            await gotoAsWallet(page, seller.address, '/orders?e2e=devnet');
            await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
            await waitForConnected(page);
            await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30000 });
            await expect(page.getByTestId('orders-relay-in-use').first(), 'the card sends through the relay the profile names').toContainText(relay.url, { timeout: 60000 });
            const accept = page.getByTestId('btn-accept-order').first();
            await expect(accept, 'the accept opens once the order\'s path and the relay are read').toBeEnabled({ timeout: 60000 });
            await accept.click();
            await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
            await page.getByTestId('preview-confirm').click();
            await expect.poll(async () => (await committedAt(verifier)).length, {
                timeout: 180_000, message: 'the relay lands the batch that carries the commit',
            }).toBe(committedBefore + 1);
            expect(await committedAt(core), 'FigaroCore emitted no OrderCommitted for this buyer: the order is batch-only').toHaveLength(0);
            const committed = (await committedAt(verifier)).at(-1)!;
            expect(committed.args.seller?.toLowerCase(), 'committed against the bound seller').toBe(seller.address.toLowerCase());
            const processId = committed.args.processId as Hex;
            const orderHash = committed.args.orderHash as Hex;
            expect(await balanceOf(buyer.address), 'the verifier pulled the buyer bond').toBe(buyerBefore - bonds.buyerBond);
            expect(await balanceOf(seller.address), 'the verifier pulled the seller bond').toBe(sellerBefore - bonds.sellerBond);

            // ── ATTEST: the seller advances the probe ladder through the relay. ──
            const attestationsAt = (address: Hex) => publicClient.getContractEvents({
                address, abi: BATCH_VERIFIER_ABI, eventName: 'Attestation', args: { orderHash }, fromBlock: 0n,
            });
            await gotoAsWallet(page, seller.address, `/orders/view?process=${processId}&e2e=devnet`);
            await page.getByTestId('order-timeline-view').waitFor({ timeout: 60000 });
            await waitForConnected(page);
            await expect(page.getByTestId('order-relay-in-use'), 'the page sends through the relay the profile names').toContainText(relay.url, { timeout: 60000 });
            const ladder = page.locator(`[data-testid="capability-execute-submit-clause-attestation"][data-clause-key="${probeClauseKey}"]`);
            await expect(ladder, 'the seller is offered its ladder step on the batch path').toBeEnabled({ timeout: 60000 });
            await ladder.click();
            await expect.poll(async () => (await attestationsAt(verifier)).length, {
                timeout: 180_000, message: 'the relay lands the batch that carries the attestation',
            }).toBe(1);
            expect(await attestationsAt(coordinator), 'the coordinator emitted none: the attestation is batch-only').toHaveLength(0);

            // ── RESOLVE: the buyer resolves through the relay. ──
            const resolvedAt = (address: Hex) => publicClient.getContractEvents({
                address, abi: BATCH_VERIFIER_ABI, eventName: 'OrderResolved', args: { orderHash }, fromBlock: 0n,
            });
            const processResolvedAt = (address: Hex) => publicClient.getContractEvents({
                address, abi: BATCH_VERIFIER_ABI, eventName: 'ProcessResolved', args: { processId }, fromBlock: 0n,
            });
            await gotoAsWallet(page, buyer.address, `/orders/view?process=${processId}&e2e=devnet`);
            await page.getByTestId('order-timeline-view').waitFor({ timeout: 60000 });
            await waitForConnected(page);
            const resolveBtn = page.getByTestId('capability-execute-resolve-process');
            await expect(resolveBtn, 'the buyer can resolve the batched process').toBeEnabled({ timeout: 60000 });
            await resolveBtn.click();
            await expect.poll(async () => (await processResolvedAt(verifier)).length, {
                timeout: 180_000, message: 'the relay lands the batch that carries the resolution',
            }).toBe(1);
            expect(await resolvedAt(verifier), 'the verifier emitted the order\'s OrderResolved').toHaveLength(1);
            expect(await resolvedAt(core), 'FigaroCore emitted no OrderResolved').toHaveLength(0);
            const [coreRootBuyer] = await publicClient.readContract({ address: core, abi: CORE_ABI, functionName: 'processes', args: [processId] });
            expect(coreRootBuyer, 'FigaroCore never held the process').toMatch(/^0x0{40}$/);
            // VALUE LEGS, from the token: the buyer paid the payment, the seller received it, bonds back.
            expect(await balanceOf(buyer.address), 'the buyer\'s bond came back less the payment').toBe(buyerBefore - payment);
            expect(await balanceOf(seller.address), 'the seller received the payment and its bond back').toBe(sellerBefore + payment);
        } finally {
            await relay.stop();
        }
    });
});
