/**
 * equipment-hire.devnet.spec.ts — THE UTILITY-TOKEN REFERENCE
 * (`assemblies/equipment-hire.json`), end to end.
 *
 * The scenario: a renter books a piece of equipment from an owner directly —
 * the same one-order shape as the POS reference (commerce + topology +
 * modalities + geolocation), PLUS `figaro-utility-token` composed at ASSEMBLY
 * scope: the designer's own ERC-20 pin. When a composition carries that pin,
 * checkout writes it straight into the commerce section's currency and no
 * token picker renders — even for a seller who accepts more than one token —
 * and the kernel commitment mirrors it. The provenance the clause exists to
 * record: the commerce leaf and the pin leaf, both committed under the same
 * agreementHash, carrying the SAME address.
 *
 *   discover → the reference is identified by IDENTITY (compositionHash →
 *              slug), computed from the checked-in template with its
 *              ZERO_ADDRESS currency sentinel substituted for the live
 *              deployment's token address — the exact substitution
 *              populate-test-data performs before anchoring (the sentinel
 *              exists because `assemblies/*.json` is checked in once but a
 *              fresh devnet deploys a new token address every time)
 *   bind     → a fresh seller registers (accepting BOTH devnet tokens, so
 *              the picker would normally render) and binds the reference
 *   commit   → the buyer checks out; no picker; the commitment currency is
 *              the pin, read back from the OrderCommitted event
 *   evidence → the committed agreement (network SSoT, IPFS-pinned) carries
 *              the commerce leaf and the figaro-utility-token leaf with the
 *              SAME currency — the provenance pair
 *   resolve  → buyer dominance settles the process; every value leg — bond
 *              lock at commit, net payment at resolve — moves in the pinned
 *              token, read from chain
 *
 * Depends on populate-test-data (clauses + the equipment-hire reference +
 * sellers), run before Playwright by test:e2e:devnet.
 */
import { test, expect, gotoAsWallet, ANVIL_ACCOUNTS } from './devnet-multi-test';
import { createWalletClient, http, parseAbi, parseEther, type Hex } from 'viem';
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
} from './devnet-helpers';
import { ANVIL_KEYS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';
import type { Page } from '@playwright/test';

async function waitForConnected(page: Page) {
    await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
        null,
        { timeout: 30000 },
    );
}

const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);
// anvil[0] — the fixture's default buyer.
const BUYER = ANVIL_ACCOUNTS[0] as Hex;
// anvil[22] — dedicated to this scenario (unused elsewhere: 22, 23, 24, 33
// were the free indices as of this spec's authoring).
const SELLER = privateKeyToAccount(ANVIL_KEYS[22] as Hex).address as Hex;

async function findEquipmentHireAssembly(tokenAddress: Hex): Promise<string> {
    // Identity, never a clause-shape heuristic (several single-order
    // compositions share the pos/freelancer/equipment-hire shape) — the
    // slug is hashed from the SUBSTITUTED template, mirroring exactly what
    // populate-test-data anchored under.
    const slug = referenceAssemblySlugWithLiveCurrency('equipment-hire.json', tokenAddress);
    const anchored = (await discoverAnchoredAssemblies()).some((t) => t.slug === slug);
    expect(anchored, 'the equipment-hire reference (assemblies/equipment-hire.json) is anchored — run populate-test-data').toBe(true);
    return slug;
}

async function ensureEquipmentHireSeller(mockToken: Hex, permitToken: Hex): Promise<Hex> {
    const slug = await findEquipmentHireAssembly(mockToken);
    const bound = (await memberProfileBindings(SELLER)).some((b) => b.assemblySlug === slug);
    if (!bound) {
        const { uri: catalogueURI } = await pinJSONToIPFS({
            subjectAddress: SELLER,
            version: '1.0.0',
            unitSystem: 'metric' as const,
            items: [{
                id: 'camera-kit-day-rate',
                name: 'Camera kit — day rate',
                description: 'A mirrorless camera kit, hired for the equipment-hire reference scenario.',
                price: '1',
                category: 'equipment',
                available: true,
            }],
        });
        await seedRegisteredMember({
            walletKey: ANVIL_KEYS[22] as Hex,
            profile: {
                name: 'Focal Point Rentals',
                description: 'Equipment-hire reference seller — seeded by equipment-hire.devnet.spec.ts',
                catalogueURI,
                // BOTH devnet tokens accepted — the picker would normally
                // render (more than one accepted token); the assembly's pin
                // must suppress it regardless. The default is deliberately
                // the OTHER token, so the pin is shown to override the
                // seller's own default too, not just coincide with it.
                acceptedTokens: [
                    { address: mockToken, symbol: 'MOCK', chainId: 31337 },
                    { address: permitToken, symbol: 'MPMT', chainId: 31337 },
                ],
                defaultTokenAddress: permitToken,
                assemblyBindings: [{
                    bindingId: 'equipment-hire-reference',
                    subjectAddress: SELLER,
                    assemblySlug: slug,
                    counterpartyBindings: [],
                }],
            },
        });
        await expect.poll(async () =>
            (await memberProfileBindings(SELLER)).some((b) => b.assemblySlug === slug), {
            timeout: 60000, message: "the equipment-hire seller's pinned profile carries the binding",
        }).toBe(true);
    }
    return SELLER;
}

test.describe('THE UTILITY-TOKEN REFERENCE — equipment hire, denominated by design (devnet)', () => {
    test.setTimeout(180_000);

    test('no picker renders; the pin drives commerce, the commitment, and settlement', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const mockToken = config.tokenAddress as Hex;
        const permitToken = config.permitTokenAddress as Hex;
        const SELLER_ADDR = await ensureEquipmentHireSeller(mockToken, permitToken);
        const publicClient = localPublicClient();
        const balanceOf = (token: Hex, who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

        // The seller sits past Deploy.s.sol's mint range (anvil[0..19]) — mint
        // enough MOCK to lock its 2× bond (the pin's token; permissionless
        // MockERC20.mint). Without this the accept reverts on the bond pull.
        {
            const minter = createWalletClient({ account: privateKeyToAccount(ANVIL_KEYS[0] as Hex), chain: LOCAL_ANVIL, transport: http(RPC_URL) });
            const h = await minter.writeContract({
                address: mockToken, abi: parseAbi(['function mint(address to, uint256 amount) external']),
                functionName: 'mint', args: [SELLER_ADDR, parseEther('1000')],
            });
            await publicClient.waitForTransactionReceipt({ hash: h });
        }

        const committedBefore = await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
        });
        // Bond escrow baseline, in the PIN's token — the token every leg
        // below must move in, regardless of what the seller's accepted array
        // or default happens to be.
        const [buyerBefore, sellerBefore, coreBefore] = await Promise.all([
            balanceOf(mockToken, BUYER), balanceOf(mockToken, SELLER_ADDR), balanceOf(mockToken, core),
        ]);

        // ── Buyer — browse → cart → checkout ──
        await page.goto(`/s/view?seller=${SELLER_ADDR}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('member-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });

        // ── (a) NO TOKEN PICKER: the seller accepts two tokens (the picker's
        //    own render condition is satisfied), but the assembly's pin
        //    hides it — the "denominated by design" notice shows instead. ──
        await expect(
            page.getByTestId('payment-token-picker'),
            'the pin suppresses the picker even though the seller accepts more than one token',
        ).toHaveCount(0);
        await expect(
            page.getByTestId('payment-token-pinned'),
            'the "denominated by design" notice renders in the picker\'s place',
        ).toBeVisible({ timeout: 15000 });

        // The equipment-hire reference's transaction particulars: pickup —
        // the renter collects, origin = destination.
        await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-modalities-modality-pickup"]').first().check();
        await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-geolocation-origin"]').first().fill('9q8yyk');
        await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-geolocation-destination"]').first().fill('9q8yyk');
        const place = page.getByTestId('btn-place-order');
        await expect(place, 'buyer connected + order ready → "Place order"').toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        // ── Seller accepts on /orders ──
        await gotoAsWallet(page, SELLER_ADDR, '/orders?e2e=devnet');
        await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('btn-accept-order').first().click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();

        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
        });
        await expect.poll(async () => (await queryCommitted()).length, {
            timeout: 60000, message: 'a new OrderCommitted lands on-chain',
        }).toBe(committedBefore.length + 1);
        const committed = await queryCommitted();
        const event = committed[committed.length - 1];
        expect(event.args.seller?.toLowerCase(), 'committed against the equipment-hire seller').toBe(SELLER_ADDR.toLowerCase());

        // ── (b) THE COMMITMENT'S CURRENCY, read back from chain, is the pin. ──
        expect(
            (event.args.currency as string).toLowerCase(),
            'the OrderCommitted currency is the assembly\'s pinned token',
        ).toBe(mockToken.toLowerCase());

        const processId = event.args.processId!;

        // Value leg at commit — the bond LOCK, in the pin's token.
        const { buyerBond, sellerBond } = calculateBonds(event.args.cumulativeValue!, event.args.payment!);
        const [buyerAfterCommit, sellerAfterCommit, coreAfterCommit] = await Promise.all([
            balanceOf(mockToken, BUYER), balanceOf(mockToken, SELLER_ADDR), balanceOf(mockToken, core),
        ]);
        expect(buyerBefore - buyerAfterCommit, 'buyer balance decreased by the buyer bond, in the pinned token').toBe(buyerBond);
        expect(sellerBefore - sellerAfterCommit, 'seller balance decreased by the seller bond, in the pinned token').toBe(sellerBond);
        expect(coreAfterCommit - coreBefore, 'FigaroCore escrow increased by both bonds, in the pinned token').toBe(buyerBond + sellerBond);

        // ── (c) THE PROVENANCE PAIR: the committed agreement (network SSoT,
        //    IPFS-pinned) carries the commerce leaf AND the figaro-utility-token
        //    leaf, both with the SAME currency as the pin. ──
        const agreementHash = event.args.agreementHash as `0x${string}`;
        const agreementUri = await page.evaluate(
            (key) => window.localStorage.getItem(key),
            `figaro:agreement-uri:${agreementHash}`,
        );
        expect(agreementUri, 'the committed agreement has a network (IPFS) locator').toMatch(/^ipfs:\/\//);
        const agreementCid = agreementUri!.replace(/^ipfs:\/\//, '');
        await assertPinnedInIpfs(agreementCid);
        const ipfsApi = process.env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
        const agreementJson = await (await fetch(`${ipfsApi}/api/v0/cat?arg=${agreementCid}`, { method: 'POST' })).text();
        const agreement = JSON.parse(agreementJson) as {
            sections: { clause: string; data: Record<string, unknown> }[];
        };
        const commerceLeaf = agreement.sections.find((s) => s.clause === 'figaro-commerce');
        const pinLeaf = agreement.sections.find((s) => s.clause === 'figaro-utility-token');
        expect(commerceLeaf, 'the commerce leaf is committed under agreementHash').toBeTruthy();
        expect(pinLeaf, 'the figaro-utility-token leaf is committed under agreementHash').toBeTruthy();
        expect(String(commerceLeaf!.data.currency).toLowerCase(), 'the commerce leaf carries the pinned currency')
            .toBe(mockToken.toLowerCase());
        expect(String(pinLeaf!.data.currency).toLowerCase(), 'the pin leaf matches — the designer-determined provenance')
            .toBe(mockToken.toLowerCase());

        // ── Buyer resolves (BUYER DOMINANCE, atomic). ──
        const resolvedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length;
        await gotoAsWallet(page, BUYER, `/orders/view?process=${processId}&e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await resolveBtn.waitFor({ state: 'visible', timeout: 30000 });
        await expect(resolveBtn, 'the buyer can resolve the active process').toBeEnabled({ timeout: 30000 });
        await resolveBtn.click();
        await expect.poll(async () => (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length, { timeout: 60000, message: 'ProcessResolved lands on-chain' }).toBe(resolvedBefore + 1);

        // ── (d) FULL-CYCLE SETTLEMENT: buyer NET −payment, seller NET
        //    +payment, escrow returns to baseline — ALL in the pinned token. ──
        const payment = event.args.payment!;
        const [buyerFinal, sellerFinal, coreFinal] = await Promise.all([
            balanceOf(mockToken, BUYER), balanceOf(mockToken, SELLER_ADDR), balanceOf(mockToken, core),
        ]);
        expect(buyerBefore - buyerFinal, 'buyer net paid exactly the payment, in the pinned token').toBe(payment);
        expect(sellerFinal - sellerBefore, 'seller net earned exactly the payment, in the pinned token').toBe(payment);
        expect(coreFinal, 'FigaroCore escrow returned to its baseline').toBe(coreBefore);
        // The seller's permit-token balance never moved — the pin, not the
        // seller's default, governed settlement end to end.
        expect(await balanceOf(permitToken, SELLER_ADDR), 'the seller\'s OTHER accepted token is untouched')
            .toBe(0n);

        // ── Audit: the financial statements render for the resolved process. ──
        await page.goto(`/audit/view?process=${processId}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('audit-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await expect(
            page.getByTestId('financials-view'),
            'the audit package renders the process financials',
        ).toBeVisible({ timeout: 30000 });
        await expect(
            page.getByTestId('document-financial-statements-process'),
            'the consolidated financial statement renders',
        ).toBeVisible({ timeout: 30000 });
    });
});
