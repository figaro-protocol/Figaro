/**
 * agreement-compose.devnet.spec.ts — a designer composes an assembly from a
 * REGISTERED agreement and a NEW one, publishes, and a process checked out
 * from it records usage under all three kinds.
 *
 *   ACTION (UI): on the canvas, the root agreement binds a registered
 *   agreement from the drawer's agreements tab (one row per live
 *   `AgreementRegistry` registration), and the sub-order composes a per-run
 *   probe clause — a new agreement. The review states each agreement's
 *   agreement key and the composition root; confirming registers the new
 *   agreement, then anchors the assembly.
 *
 *   REACTION (UI): the publish receipt names the agreement it registered.
 *
 *   A second test registers an agreement ON ITS OWN from the drawer — no
 *   assembly published: ACTION (UI) compose a probe clause on the root
 *   order and press "Register this agreement on its own"; REACTION (UI) the
 *   agreement now binds the registered key and the agreements tab lists it;
 *   CHAIN FACT the registry binds that key to the publishing wallet, and the
 *   pinned document hashes to it (the mandatory clauses folded in).
 *
 *   CHAIN FACTS, read out of band: the anchored assembly's root entry binds
 *   the registered agreement's key and its sub entry a key the registry now
 *   binds to the publishing wallet; a process walked from the hydrated
 *   assembly commits and resolves; each order's agreement names both keys
 *   in its provenance; and `UsageRecorded` lands under kind 0 (each clause),
 *   kind 2 (each registered agreement) and kind 1 (the assembly).
 */
import { createWalletClient, http, parseAbi, parseEther, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    ERC20_ABI,
    MEMBERS_REGISTRY_ABI,
    USAGE_COUNTER_ABI,
    USAGE_KIND_AGREEMENT,
    USAGE_KIND_ASSEMBLY,
    USAGE_KIND_CLAUSE,
    agreementKeyOf,
    calculateBonds,
    generateSalt,
    reconstructOrdersFromAssembly,
    assemblyCompositionHash,
} from '@figaro-protocol/sdk';
import { recordProcessUsage } from '@figaro-protocol/sdk/agent';
import { CORE_ABI } from '@/lib/kernel/contracts';
import { test, expect } from './devnet-multi-test';
import {
    LOCAL_ANVIL,
    RPC_URL,
    discoverAnchoredAssemblies,
    keyOf,
    localPublicClient,
    pinJSONToIPFS,
    primeRegisteredClauseSpecs,
    publishOrAdoptReviewed,
    readAgreementBinding,
    readLocalDeploymentConfig,
    referenceAssemblyBuilt,
    readRegisteredAgreementDocument,
    waitForConnected,
} from './devnet-helpers';
import { makeProbeSpec, registerProbeClause } from './probeAssembly';
import { ANVIL_ACCOUNTS, ANVIL_KEYS } from '../anvilAccounts';

// The buyer is anvil[0] (the minter); the seller is the data-market member
// A wallet (36) — registered if absent, never re-profiled, so the overlap is
// harmless to that spec.
const BUYER_KEY = ANVIL_KEYS[0] as Hex;
const SELLER_KEY = ANVIL_KEYS[36] as Hex;

test.describe('AGREEMENTS — bind a registered agreement, compose a new one, publish, check out, record all three kinds (devnet)', () => {
    test.setTimeout(300_000);

    test('the assembly binds both agreements and its process records clause, agreement and assembly usage', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        await primeRegisteredClauseSpecs();
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const membersRegistry = config.membersRegistry as Hex;
        const usageCounter = config.usageCounter as Hex;
        expect(core && token && membersRegistry && usageCounter, 'full deployment record (run ./scripts/deploy-local.sh)').toBeTruthy();
        const publicClient = localPublicClient();
        const receipt = (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });

        // ── The registered agreement the root agreement binds: the point-of-sale
        //    reference's, derived as the seeding derives it and read BY KEY. ──
        const registeredKey = referenceAssemblyBuilt('pos.json').assembly.agreements[0].agreementKey;
        const registeredBinding = await readAgreementBinding(registeredKey);
        expect(registeredBinding, 'the reference agreement is registered — run populate-test-data first').not.toBeNull();
        expect(registeredBinding!.stakeWithdrawn, 'its stake is live, so the drawer offers it').toBe(false);

        // ── A per-run clause, so the sub-order composes a NEW agreement. ──
        const nonce = `${Date.now()}`;
        const probeKey = await registerProbeClause(makeProbeSpec(`figaro-probe-agreement-${nonce}`, `Agreement probe ${nonce}`));

        // ── ACTION: compose on the canvas. ──
        await page.goto('/assemblies/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });
        const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
        await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
        const rootId = (await orderNodes.first().getAttribute('data-testid'))!.replace('order-node-', '');
        await orderNodes.first().click();
        await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId(`btn-add-suborder-${rootId}`).click();
        await expect(orderNodes).toHaveCount(2, { timeout: 10000 });
        const subId = (await orderNodes.evaluateAll((els) =>
            els.map((el) => el.getAttribute('data-testid')!.replace('order-node-', ''))))
            .find((id) => id !== rootId)!;

        // Root: bind the registered agreement as is.
        await page.getByTestId(`drawer-node-tab-${rootId}`).click();
        await page.getByTestId('drawer-tab-agreements').click();
        await page.getByTestId('drawer-section-agreements').waitFor({ state: 'visible', timeout: 5000 });
        const registeredRow = page.getByTestId(`drawer-agreement-${registeredKey}`);
        await expect(registeredRow, 'the drawer lists the live registration').toBeVisible({ timeout: 30000 });
        await registeredRow.click();
        await expect(registeredRow).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByTestId('drawer-bound-agreement-key')).toHaveAttribute('title', registeredKey);

        // Sub-order: compose the probe clause — a new agreement.
        await page.getByTestId(`drawer-node-tab-${subId}`).click();
        await page.getByTestId('drawer-tab-registry').click();
        await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
        await page.getByTestId(`drawer-registry-clause-${probeKey}`).check();

        await page.getByTestId('designer-name-input').fill(`Bound and composed ${nonce}`);
        await page.getByTestId('designer-summary-input').fill('A registered agreement bound as is beside a newly composed one.');
        await page.getByTestId('designer-description-input').fill('Root agreement: a registered agreement. Sub-order: a new agreement composed for it.');
        await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
        await page.getByTestId('designer-review').click();
        await page.waitForURL(/\/assemblies\/designer\/view\/?\?slug=asm-/, { timeout: 15000 });
        const handle = page.url().match(/[?&]slug=(asm-[a-z0-9-]+)/)?.[1];

        const slug = await publishOrAdoptReviewed(page, handle!, async () => {
            // The review states each agreement's agreement key and the root.
            await expect(page.getByTestId('review-entry-0')).toHaveAttribute('data-agreement-key', registeredKey);
            await expect(page.getByTestId('review-entry-0')).toContainText('registered agreement, bound as is');
            await expect(page.getByTestId('review-entry-1')).toContainText('composed here');
            await expect(page.getByTestId('review-composition-root')).toHaveText(/^0x[0-9a-f]{64}$/);
        });

        // ── REACTION: the receipt names the agreement this publish registered. ──
        await expect(page.getByTestId('assembly-publish-receipt')).toContainText('Agreement 1 key');

        // ── CHAIN FACTS: the anchored assembly and both bindings, by key. ──
        const anchored = (await discoverAnchoredAssemblies()).find((a) => a.slug === slug);
        expect(anchored, 'the published assembly hydrates from chain → IPFS').toBeTruthy();
        expect(assemblyCompositionHash(anchored!.hydrated.assembly)).toBe(anchored!.compositionHash);
        const rootAgreement = anchored!.agreements.find((s) => s.agreementKey.toLowerCase() === registeredKey.toLowerCase());
        const subAgreement = anchored!.agreements.find((s) => s.agreementKey.toLowerCase() !== registeredKey.toLowerCase());
        expect(rootAgreement, 'an agreement binds the registered agreement').toBeTruthy();
        expect(subAgreement, 'another agreement binds a new agreement').toBeTruthy();
        expect(Object.keys(subAgreement!.clauses).map((k) => k.toLowerCase()), 'the new agreement composes the probe clause')
            .toContain(probeKey.toLowerCase());
        const newBinding = await readAgreementBinding(subAgreement!.agreementKey);
        expect(newBinding, 'the publish registered the new agreement on AgreementRegistry').not.toBeNull();
        await expect(page.getByTestId('assembly-publish-receipt')).toContainText(subAgreement!.agreementKey);

        // ── CHECK OUT a process from the hydrated assembly (the SDK's one
        //    assembly walk), commit, resolve. ──
        const buyer = privateKeyToAccount(BUYER_KEY);
        const seller = privateKeyToAccount(SELLER_KEY);
        const buyerWallet = createWalletClient({ account: buyer, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const sellerWallet = createWalletClient({ account: seller, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        if ((await publicClient.getBalance({ address: seller.address })) < parseEther('1')) {
            await receipt(await buyerWallet.sendTransaction({ to: seller.address, value: parseEther('50') }));
        }
        for (const [wallet, who] of [[buyerWallet, buyer], [sellerWallet, seller]] as const) {
            await receipt(await wallet.writeContract({
                address: token, abi: parseAbi(['function mint(address to, uint256 amount) external']), functionName: 'mint', args: [who.address, parseEther('100')],
            }));
        }
        // The counter counts only while the seller's stake is live.
        if (!(await publicClient.readContract({ address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, functionName: 'registered', args: [seller.address] }))) {
            const deposit = await publicClient.readContract({ address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, functionName: 'registrationDeposit' });
            const { uri } = await pinJSONToIPFS({ subjectAddress: seller.address, name: 'Skyline Survey Works', specialty: 'aerial survey flights' });
            await receipt(await sellerWallet.writeContract({
                address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, functionName: 'register', args: [uri], value: deposit,
            }));
        }

        const payment = parseEther('1');
        const chainNow = (await publicClient.getBlock({ blockTag: 'latest' })).timestamp;
        const orders = await reconstructOrdersFromAssembly(anchored!.hydrated, {
            buyer: buyer.address,
            currency: token,
            chainId: LOCAL_ANVIL.id,
            core,
            nodes: () => ({
                seller: seller.address,
                payment,
                overrides: {
                    [keyOf('figaro-commerce')]: {
                        currency: token,
                        payment: payment.toString(),
                        lineItems: [{ itemId: 'probe', name: 'Probe item', quantity: 1, unitPrice: payment.toString() }],
                    },
                },
            }),
            salt: () => generateSalt(),
            deadline: chainNow + 3600n,
        });
        expect(orders).toHaveLength(2);
        for (const order of orders) {
            const entry = anchored!.agreements.find((s) => s.id === order.nodeId)!;
            expect(order.agreement.provenance, 'each order names its registered agreement and the assembly')
                .toEqual({ agreementKey: entry.agreementKey, compositionHash: anchored!.compositionHash });
            const { buyerBond, sellerBond } = calculateBonds(order.cumulativeValue, order.payment);
            await receipt(await buyerWallet.writeContract({ address: token, abi: ERC20_ABI, functionName: 'approve', args: [core, buyerBond] }));
            await receipt(await sellerWallet.writeContract({ address: token, abi: ERC20_ABI, functionName: 'approve', args: [core, sellerBond] }));
            const buyerSig = await buyerWallet.signTypedData(order.typedData);
            const sellerSig = await sellerWallet.signTypedData(order.typedData);
            const committed = await receipt(await buyerWallet.writeContract({
                address: core, abi: CORE_ABI, functionName: 'commit', args: [order.commitment, buyerSig, sellerSig],
            }));
            expect(committed.status, `order ${order.nodeId} commits`).toBe('success');
        }
        // The root signs processId 0; every sub-order names the derived id.
        const processId = orders[orders.length - 1].processId as Hex;
        const resolved = await receipt(await buyerWallet.writeContract({
            address: core, abi: CORE_ABI, functionName: 'resolveProcess',
            args: [processId, orders.map((o) => o.commitment)],
        }));
        expect(resolved.status, 'the buyer resolves the process').toBe('success');

        // ── RECORD usage (permissionless) and read every kind back. ──
        const report = await recordProcessUsage(buyerWallet, publicClient as never, usageCounter, orders.map((o) => ({
            commitment: o.commitment, agreement: o.agreement, assembly: anchored!.hydrated.assembly,
        })));
        expect(report.failures, 'every usage leg lands').toEqual([]);
        const recorded = await publicClient.getContractEvents({
            address: usageCounter, abi: USAGE_COUNTER_ABI, eventName: 'UsageRecorded', args: { processId }, fromBlock: resolved.blockNumber,
        });
        const keysOf = (kind: number) => recorded
            .filter((e) => Number(e.args.kind) === kind)
            .map((e) => (e.args.clauseOrAssembly as string).toLowerCase());
        expect(keysOf(USAGE_KIND_CLAUSE), 'the probe clause is recorded under the clause kind').toContain(probeKey.toLowerCase());
        expect(keysOf(USAGE_KIND_AGREEMENT).sort(), 'both registered agreements are recorded under the agreement kind')
            .toEqual([registeredKey.toLowerCase(), subAgreement!.agreementKey.toLowerCase()].sort());
        expect(keysOf(USAGE_KIND_ASSEMBLY), 'the assembly is recorded under the assembly kind')
            .toEqual([anchored!.compositionHash.toLowerCase()]);
    });
    test('a designer registers an agreement on its own from the drawer, and any assembly can bind it', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        await primeRegisteredClauseSpecs();
        const nonce = `${Date.now()}`;
        const probeKey = await registerProbeClause(makeProbeSpec(`figaro-probe-alone-${nonce}`, `Alone probe ${nonce}`));

        // ── ACTION: compose the probe clause on the root order, then register
        //    the agreement on its own — no assembly is published. ──
        await page.goto('/assemblies/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });
        await waitForConnected(page);
        const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
        await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
        await orderNodes.first().click();
        await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
        // One order on the canvas: the drawer is already on it (the per-order
        // tab row renders only with two or more orders).
        await page.getByTestId('drawer-tab-registry').click();
        await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
        await page.getByTestId(`drawer-registry-clause-${probeKey}`).check();
        await page.getByTestId('designer-name-input').fill(`Alone ${nonce}`);

        await page.getByTestId('drawer-tab-agreements').click();
        await page.getByTestId('drawer-section-agreements').waitFor({ state: 'visible', timeout: 5000 });
        const register = page.getByTestId('drawer-register-agreement');
        await expect(register, 'the composed order offers to register its agreement on its own').toBeEnabled({ timeout: 10000 });
        await register.click();

        // ── REACTION: the agreement binds the registered key. ──
        const boundKey = page.getByTestId('drawer-bound-agreement-key');
        await expect(boundKey, 'the agreement binds the agreement it just registered').toBeVisible({ timeout: 60000 });
        const agreementKey = (await boundKey.getAttribute('title')) as Hex;
        expect(agreementKey).toMatch(/^0x[0-9a-f]{64}$/i);
        await expect(page.getByTestId('drawer-register-agreement-error')).toHaveCount(0);
        await expect(page.getByTestId(`drawer-agreement-${agreementKey}`), 'the live registry list now offers it to any assembly')
            .toBeVisible({ timeout: 30000 });

        // ── CHAIN FACTS: the registry binds the key to the publishing wallet,
        //    and the pinned document hashes to it with the mandatory fold. ──
        const read = await readRegisteredAgreementDocument(agreementKey);
        expect(read, 'AgreementRegistry binds the key').not.toBeNull();
        expect(read!.binding.registeredBy.toLowerCase()).toBe(ANVIL_ACCOUNTS[0].toLowerCase());
        expect(read!.binding.stakeWithdrawn).toBe(false);
        expect(agreementKeyOf(read!.document).toLowerCase(), 'the pinned document keys to the registry key').toBe(agreementKey.toLowerCase());
        const composedKeys = Object.keys(read!.document.clauses).map((k) => k.toLowerCase());
        expect(composedKeys, 'the probe clause is composed').toContain(probeKey.toLowerCase());
        expect(composedKeys, 'the mandatory commerce clause folded in').toContain(keyOf('figaro-commerce').toLowerCase());
        expect(composedKeys, 'the mandatory topology clause folded in').toContain(keyOf('figaro-topology').toLowerCase());
        expect(read!.document.name, 'the document carries the designer\'s name for it').toBe(`Alone ${nonce} · order 1`);
    });
});
