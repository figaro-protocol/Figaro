/**
 * seller-binding.devnet.spec.ts
 *
 * A seller accepts only orders under an assembly its own profile binds.
 * Every process instantiates an assembly: the order's agreement names it in
 * its provenance leaf, and the seller's accept reads the seller's OWN profile
 * (MembersRegistry → metadataURI → IPFS) when it acts — never a value the
 * order carries — and refuses an order under an assembly the profile does not
 * bind, naming that assembly by its derived slug and its full composition
 * hash, before any signature.
 *
 * The seller is a registered member adopted by ADDRESS from the chain (its
 * profile binds a reference assembly); the buyer hands it an order, signed
 * out of band, under another anchored assembly — one the seller's profile, read
 * out of band here, does not bind. The seller opens `/sign`, reviews the
 * order, clicks counter-sign, and reads the refusal on the screen; no confirm
 * opens. Out of band from the chain: no new OrderCommitted for the buyer and
 * no token moved.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    buildCommitment,
    buildDomain,
    deriveAssemblySlug,
    fillCommerceClause,
    planAssemblyOrders,
    readUtilityTokenPin,
    reconstructOrdersFromAssembly,
} from '@figaro-protocol/sdk';
import { serializeCommitmentPayload } from '@figaro-protocol/sdk/agent';
import { specSource } from '@/lib/shared/clauseSpecSource';
import { CORE_ABI } from '@/lib/kernel/contracts';
import {
    discoverAnchoredAssemblies,
    discoverMembers,
    isBindingOf,
    localPublicClient,
    primeRegisteredClauseSpecs,
    readLocalDeploymentConfig,
    waitForConnected,
} from './devnet-helpers';
import { ANVIL_ACCOUNTS, ANVIL_KEYS } from '../anvilAccounts';

// anvil[0] signs as the buyer out of band.
const BUYER = privateKeyToAccount(ANVIL_KEYS[0] as Hex);
const ERC20_ABI = [{
    type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'a', type: 'address' }], outputs: [{ name: '', type: 'uint256' }],
}] as const;

test.describe('a seller refuses an order under an assembly it has not bound (devnet)', () => {
    test.setTimeout(240_000);

    test('/sign review → counter-sign → the refusal names the assembly; nothing commits', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const publicClient = localPublicClient();
        const committedForBuyer = async () => (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER.address }, fromBlock: 0n,
        })).length;
        const balanceOf = (who: Hex) => publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] });

        await primeRegisteredClauseSpecs();
        const anchored = await discoverAnchoredAssemblies();

        // The seller: a registered, anvil-held member whose profile binds an
        // anchored assembly — discovered from the chain, adopted by address.
        // The order: an anchored single-order assembly its profile does NOT
        // bind, read out of band.
        const anvil = new Set(ANVIL_ACCOUNTS.map((a) => a.toLowerCase()));
        const members = (await discoverMembers()).filter((m) =>
            anvil.has(m.address.toLowerCase()) && m.address.toLowerCase() !== BUYER.address.toLowerCase()
            && m.assemblyBindings.some((b) => anchored.some((a) => isBindingOf(b, a.assemblyHash))));
        let pair: { seller: Hex; notBound: (typeof anchored)[number] } | undefined;
        for (const m of members) {
            const notBound = anchored.find((a) => a.agreements.length === 1
                && !m.assemblyBindings.some((b) => isBindingOf(b, a.assemblyHash)));
            if (notBound) { pair = { seller: m.address, notBound }; break; }
        }
        expect(pair, 'a registered seller and an anchored single-order assembly its profile does not bind').toBeDefined();
        const SELLER = pair!.seller;
        const { notBound } = pair!;

        // The buyer's order under that assembly, built through the SDK's
        // assembly walk with its commerce terms filled, signed out of band.
        const specs = specSource();
        const [root] = planAssemblyOrders(notBound.hydrated);
        const currency = (readUtilityTokenPin(root.clauses, specs) ?? token) as Hex;
        const payment = 1_000_000n;
        const filled = fillCommerceClause(root.clauses, payment, currency, specs, [
            { itemId: 'seller-binding', name: 'Under an assembly the seller has not bound', quantity: 1, unitPrice: payment.toString() },
        ]);
        const chainNow = (await publicClient.getBlock({ blockTag: 'latest' })).timestamp;
        const [order] = await reconstructOrdersFromAssembly(notBound.hydrated, {
            buyer: BUYER.address, currency, chainId: 31337, core, specs, deadline: chainNow + 3600n,
            nodes: (planned) => ({ seller: SELLER, payment, overrides: planned.index === 0 ? filled : undefined }),
        });
        expect(order.agreement.provenance?.assemblyHash, 'the order names the assembly in its provenance leaf')
            .toBe(notBound.assemblyHash);
        const { typedData } = buildCommitment({ ...order.commitment }, buildDomain(31337, core));
        const buyerSig = await BUYER.signTypedData(typedData as unknown as Parameters<typeof BUYER.signTypedData>[0]);
        const payload = serializeCommitmentPayload({ commitment: order.commitment, agreement: order.agreement, buyerSig });

        const committedBefore = await committedForBuyer();
        const [buyerBefore, sellerBefore, coreBefore] = await Promise.all([balanceOf(BUYER.address), balanceOf(SELLER), balanceOf(core)]);

        // ── The seller reviews the order on /sign and counter-signs. ──
        await gotoAsWallet(page, SELLER, '/sign?e2e=devnet');
        await waitForConnected(page);
        await page.getByTestId('input-commitment-payload').fill(payload);
        await page.getByTestId('btn-parse-payload').click();
        await expect(page.getByTestId('agreement-review').or(page.getByTestId('sign-agreement-verified')).first(),
            'the order is up for review').toBeVisible({ timeout: 60000 });
        const counterSign = page.getByTestId('btn-counter-sign');
        const authorize = page.getByRole('button', { name: /Authorize Payment/ });
        await expect(counterSign.or(authorize)).toBeVisible({ timeout: 60000 });
        if (await authorize.isVisible()) await authorize.click();
        await counterSign.waitFor({ state: 'visible', timeout: 60000 });
        await counterSign.click();

        // ── The reaction: the refusal names the assembly by slug and hash. ──
        const refusal = page.getByTestId('sign-error');
        await expect(refusal, 'the seller refuses the order').toContainText('has not bound assembly', { timeout: 60000 });
        await expect(refusal).toContainText(deriveAssemblySlug(notBound.assemblyHash));
        await expect(refusal).toContainText(notBound.assemblyHash);
        await expect(page.getByTestId('agreement-preview-modal'), 'no confirm opens: nothing reaches a signature').toHaveCount(0);

        // ── Out of band: no order committed, no token moved. ──
        expect(await committedForBuyer(), 'no OrderCommitted for the buyer').toBe(committedBefore);
        const [buyerAfter, sellerAfter, coreAfter] = await Promise.all([balanceOf(BUYER.address), balanceOf(SELLER), balanceOf(core)]);
        expect(buyerAfter, 'the buyer bonded nothing').toBe(buyerBefore);
        expect(sellerAfter, 'the seller bonded nothing').toBe(sellerBefore);
        expect(coreAfter, 'FigaroCore holds nothing new').toBe(coreBefore);
    });
});
