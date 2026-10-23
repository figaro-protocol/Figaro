/**
 * sign-gate-design.devnet.spec.ts
 *
 * The sign gate reads the design an agreement names and refuses what it
 * cannot read or what changes the designer's values — on the counter-party's
 * sign (`/sign` → counter-sign → `acceptOrder` → `signAs`) and on the
 * broadcast of a fully signed payload (`/sign` → submit → `commitOrder`).
 *
 * A party hands the connected wallet a payload built and signed out of band —
 * a counterparty the wallet does not have to trust. Three payloads:
 *   - its agreement's provenance leaf names an assembly no registry anchors:
 *     the design cannot be fetched, and the gate refuses;
 *   - its agreement names an anchored assembly and carries one designer value
 *     (a `block.design.fills` field the assembly sets) the buyer changed: the
 *     gate refuses, naming the clause and the field;
 *   - its agreement names an anchored assembly and drops one clause of the
 *     registered agreement it names: the gate refuses, naming the clause and
 *     the assembly by slug and full hash.
 * The seller's own profile binds both assemblies the payloads name, so each
 * counter-sign reaches the design gate (a seller refuses an order under an
 * assembly it has not bound before any design is read —
 * `seller-binding.devnet.spec.ts`).
 * Each refusal is read on the screen (the review's verdict, then the error
 * the action raises), and out of band from the chain: no new OrderCommitted
 * for the buyer, and no token moved.
 *
 * Everything is discovered from chain → IPFS: the clause specs from
 * `ClauseRegistry`, the assemblies from `AssemblyRegistry` and each
 * registered agreement from `AgreementRegistry`, the candidate selected by
 * shape (a design fill the assembly sets, a forged value that still conforms
 * to its clause's spec) — no clause, assembly or field is named here.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { keccak256, toHex, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    buildDomain,
    fillCommerceClause,
    planAssemblyOrders,
    readUtilityTokenPin,
    reconstructOrdersFromAssembly,
    specDesignFills,
    validateCommitmentAgreement,
    computeCheckoutHash,
    buildCommitment,
    type Agreement,
    type Commitment,
    type HydratedAssembly,
} from '@figaro-protocol/sdk';
import { validateContent } from '@figaro-protocol/sdk/clauses';
import { serializeCommitmentPayload, type CommitmentPayload } from '@figaro-protocol/sdk/agent';
import { specSource } from '@/lib/shared/clauseSpecSource';
import { CORE_ABI } from '@/lib/kernel/contracts';
import {
    discoverAnchoredAssemblies,
    localPublicClient,
    primeRegisteredClauseSpecs,
    readLocalDeploymentConfig,
    seedRegisteredMember,
    waitForConnected,
    type DiscoveredAssembly,
} from './devnet-helpers';

// anvil[0] signs as the buyer out of band; anvil[1] is the seller it names.
const BUYER = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
const SELLER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const SELLER = privateKeyToAccount(SELLER_KEY);
const ERC20_ABI = [{
    type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'a', type: 'address' }], outputs: [{ name: '', type: 'uint256' }],
}] as const;

/** A value for `field` other than the designer's that its clause's spec still
 *  accepts — an enum's next value, a string one character longer, an integer
 *  one higher; undefined when none conforms. */
function forgedValue(clauseKey: Hex, data: Record<string, unknown>, field: string): unknown {
    const spec = specSource().get(clauseKey);
    const declared = spec?.fields?.find((f) => f.name === field) as { type?: string; values?: string[] } | undefined;
    const value = data[field];
    const candidates: unknown[] = [];
    if (declared?.values) candidates.push(...declared.values.filter((v) => v !== value));
    if (typeof value === 'string') candidates.push(`${value}x`, value.slice(0, -1));
    if (typeof value === 'number') candidates.push(value + 1);
    // A string array (the property-transfer clause's anticipated events): one more
    // item, or the first item changed.
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
        candidates.push([...value, 'forged'], value.map((v, i) => (i === 0 ? `${v}x` : v)));
    }
    return candidates.find((c) => spec && validateContent({ ...data, [field]: c }, spec).ok);
}

/** The root order of `found`, built through the SDK's assembly walk as a
 *  buyer would, its commerce terms filled and `forged` merged over the
 *  clauses it names. */
async function rootOrder(found: DiscoveredAssembly, forged: Record<string, Record<string, unknown>>) {
    const config = readLocalDeploymentConfig();
    const specs = specSource();
    const hydrated: HydratedAssembly = found.hydrated;
    const [root] = planAssemblyOrders(hydrated);
    const currency = (readUtilityTokenPin(root.clauses, specs) ?? config.tokenAddress) as Hex;
    const payment = 1_000_000n;
    const filled = fillCommerceClause(root.clauses, payment, currency, specs, [
        { itemId: 'sign-gate-design', name: 'Signed out of band', quantity: 1, unitPrice: payment.toString() },
    ]);
    const chainNow = (await localPublicClient().getBlock({ blockTag: 'latest' })).timestamp;
    const orders = await reconstructOrdersFromAssembly(hydrated, {
        buyer: BUYER.address, currency, chainId: 31337, core: config.figaroCore as Hex, specs,
        deadline: chainNow + 3600n,
        nodes: (planned) => ({
            seller: SELLER.address,
            payment,
            overrides: planned.index === 0 ? { ...filled, ...forged } : undefined,
        }),
    });
    return { order: orders[0], hydrated, currency };
}

async function signedPayload(agreement: Agreement, commitment: Commitment, both: boolean): Promise<CommitmentPayload> {
    const config = readLocalDeploymentConfig();
    const domain = buildDomain(31337, config.figaroCore as Hex);
    const { typedData } = buildCommitment({ ...commitment }, domain);
    const buyerSig = await BUYER.signTypedData(typedData as unknown as Parameters<typeof BUYER.signTypedData>[0]);
    const sellerSig = both ? await SELLER.signTypedData(typedData as unknown as Parameters<typeof SELLER.signTypedData>[0]) : undefined;
    return { commitment, agreement, buyerSig, ...(sellerSig ? { sellerSig } : {}) };
}

test.describe('the sign gate reads the design an agreement names (devnet)', () => {
    test.setTimeout(360_000);

    test('refuses an agreement whose design cannot be fetched, one carrying a changed designer value, and one missing a clause of its design; nothing commits', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const publicClient = localPublicClient();
        const committedForBuyer = async () => (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER.address }, fromBlock: 0n,
        })).length;
        const balanceOf = (who: Hex) => publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] });

        await primeRegisteredClauseSpecs();
        const assemblies = await discoverAnchoredAssemblies();
        expect(assemblies.length, 'the devnet anchors assemblies').toBeGreaterThan(0);

        // The forged case, selected by shape: an assembly whose root order's
        // clauses carry a designer value the assembly sets, and a forged
        // value its spec still accepts. Prefer the one whose only refusal is
        // the designer value.
        type Forged = { found: DiscoveredAssembly; clauseKey: Hex; field: string; order: Awaited<ReturnType<typeof rootOrder>>['order']; hydrated: HydratedAssembly; onlyDesigner: boolean };
        let forgedCase: Forged | undefined;
        for (const found of assemblies) {
            const [root] = planAssemblyOrders(found.hydrated);
            for (const [clauseKey, data] of Object.entries(root.clauses) as [Hex, Record<string, unknown>][]) {
                const spec = specSource().get(clauseKey);
                if (!spec) continue;
                for (const field of specDesignFills(spec)) {
                    if (data[field] === undefined) continue;
                    const forged = forgedValue(clauseKey, data, field);
                    if (forged === undefined) continue;
                    let built: Awaited<ReturnType<typeof rootOrder>>;
                    try {
                        built = await rootOrder(found, { [clauseKey]: { ...data, [field]: forged } });
                    } catch {
                        continue; // the walk itself refuses (a pinned denomination forged) — not this case
                    }
                    const check = validateCommitmentAgreement(built.order.agreement, built.order.checkoutHash, specSource(), built.order.commitment, found.hydrated);
                    const designer = check.issues.filter((i) => i.path === field && /designer/.test(i.message));
                    if (designer.length === 0) continue;
                    const onlyDesigner = designer.length === check.issues.length;
                    if (!forgedCase || (onlyDesigner && !forgedCase.onlyDesigner)) {
                        forgedCase = { found, clauseKey, field, order: built.order, hydrated: found.hydrated, onlyDesigner };
                    }
                }
            }
        }
        expect(forgedCase, 'an anchored assembly sets a designer value a forged, spec-valid value can replace').toBeDefined();
        const forgedClauseId = specSource().get(forgedCase!.clauseKey)?.clauseId ?? forgedCase!.clauseKey;
        test.info().annotations.push({
            type: 'forged designer value',
            description: `assembly ${forgedCase!.found.slug} clause ${forgedClauseId} field ${forgedCase!.field} (only refusal: ${forgedCase!.onlyDesigner})`,
        });

        // The unfetchable case: the same root order, its provenance leaf
        // pointed at a assembly hash no registry anchors.
        const unread = forgedCase!.order.agreement;
        const unanchored = keccak256(toHex(`sign-gate-design:${Date.now()}`));
        const { order: cleanOrder } = await rootOrder(forgedCase!.found, {});
        const unreadAgreement: Agreement = { ...cleanOrder.agreement, provenance: { agreementHash: cleanOrder.agreement.provenance!.agreementHash, assemblyHash: unanchored } };
        const unreadCommitment: Commitment = { ...cleanOrder.commitment, checkoutHash: computeCheckoutHash(unreadAgreement) };
        expect(unread.provenance?.assemblyHash).toBe(forgedCase!.found.assemblyHash);

        // The seller binds both assemblies the payloads name — its own act,
        // through its own registry entry — so the counter-sign reaches the
        // design gate this spec is about.
        await seedRegisteredMember({
            walletKey: SELLER_KEY,
            profile: {
                name: 'Sign gate seller',
                description: 'Seeded by sign-gate-design.devnet.spec.ts',
                assemblyBindings: [forgedCase!.found.assemblyHash, unanchored].map((assemblyHash, i) => ({
                    bindingId: `sign-gate-design-${i}`, subjectAddress: SELLER.address, assemblyHash, coSellerBindings: [],
                })),
            },
        });

        const committedBefore = await committedForBuyer();
        const [buyerBefore, sellerBefore, coreBefore] = await Promise.all([balanceOf(BUYER.address), balanceOf(SELLER.address), balanceOf(core)]);

        /** Paste `payload` into /sign as `wallet`, read the review's verdict,
         *  click `action`, and read the refusal it raises. */
        const refuseOnSign = async (wallet: Hex, payload: CommitmentPayload, action: 'btn-counter-sign' | 'btn-broadcast', expected: RegExp) => {
            await gotoAsWallet(page, wallet, '/sign?e2e=devnet');
            await waitForConnected(page);
            await page.getByTestId('input-commitment-payload').fill(serializeCommitmentPayload(payload));
            await page.getByTestId('btn-parse-payload').click();
            await expect(page.getByTestId('sign-agreement-invalid'), 'the review names the refusal before any signature')
                .toContainText(expected, { timeout: 60000 });
            await expect(page.getByTestId('sign-agreement-verified')).toHaveCount(0);
            const button = page.getByTestId(action);
            if (action === 'btn-counter-sign') {
                const authorize = page.getByRole('button', { name: /Authorize Payment/ });
                await expect(button.or(authorize)).toBeVisible({ timeout: 60000 });
                if (await authorize.isVisible()) await authorize.click();
            }
            await button.waitFor({ state: 'visible', timeout: 60000 });
            await button.click();
            await expect(page.getByTestId('sign-error'), 'the action raises the gate\'s refusal')
                .toContainText(expected, { timeout: 60000 });
            await expect(page.getByTestId('agreement-preview-modal'), 'no confirm opens: nothing reaches a signature').toHaveCount(0);
        };

        const notRead = /was not read/;
        // The review names the clause by its key, the thrown refusal by its
        // spec's clauseId: either names the clause.
        const designerChanged = new RegExp(`(?:${forgedClauseId}|${forgedCase!.clauseKey}) ${forgedCase!.field}: .*designer`, 'i');

        // Counter-sign (the seller's sign step).
        await refuseOnSign(SELLER.address, await signedPayload(unreadAgreement, unreadCommitment, false), 'btn-counter-sign', notRead);
        await refuseOnSign(SELLER.address, await signedPayload(forgedCase!.order.agreement, forgedCase!.order.commitment, false), 'btn-counter-sign', designerChanged);
        // Broadcast of a fully signed payload.
        await refuseOnSign(BUYER.address, await signedPayload(unreadAgreement, unreadCommitment, true), 'btn-broadcast', notRead);
        await refuseOnSign(BUYER.address, await signedPayload(forgedCase!.order.agreement, forgedCase!.order.commitment, true), 'btn-broadcast', designerChanged);

        // The dropped-clause case, selected by shape: the clean root order
        // with one clause of its design removed and rehashed, preferring a
        // clause whose absence is the order's only refusal.
        let dropped: { clauseKey: Hex; agreement: Agreement; commitment: Commitment; onlyMissing: boolean } | undefined;
        for (const clauseEntry of cleanOrder.agreement.clauses) {
            const agreement: Agreement = { ...cleanOrder.agreement, clauses: cleanOrder.agreement.clauses.filter((s) => s !== clauseEntry) };
            const commitment: Commitment = { ...cleanOrder.commitment, checkoutHash: computeCheckoutHash(agreement) };
            const check = validateCommitmentAgreement(agreement, commitment.checkoutHash, specSource(), commitment, forgedCase!.found.hydrated);
            const missing = check.issues.filter((i) => i.clause.toLowerCase() === clauseEntry.clause.toLowerCase() && /does not carry this clause/.test(i.message));
            if (missing.length === 0) continue;
            const onlyMissing = missing.length === check.issues.length;
            if (!dropped || (onlyMissing && !dropped.onlyMissing)) dropped = { clauseKey: clauseEntry.clause as Hex, agreement, commitment, onlyMissing };
        }
        expect(dropped, 'the gate refuses the order with a clause of its design dropped').toBeDefined();
        const droppedClauseId = specSource().get(dropped!.clauseKey)?.clauseId ?? dropped!.clauseKey;
        test.info().annotations.push({
            type: 'dropped clause',
            description: `assembly ${forgedCase!.found.slug} clause ${droppedClauseId} (only refusal: ${dropped!.onlyMissing})`,
        });
        const hash = forgedCase!.found.assemblyHash;
        const notCarried = new RegExp(`(?:${droppedClauseId}|${dropped!.clauseKey}) clause: the order does not carry this clause, which assembly ${forgedCase!.found.slug} \\(${hash}\\) composes`, 'i');
        await refuseOnSign(SELLER.address, await signedPayload(dropped!.agreement, dropped!.commitment, false), 'btn-counter-sign', notCarried);
        await refuseOnSign(BUYER.address, await signedPayload(dropped!.agreement, dropped!.commitment, true), 'btn-broadcast', notCarried);

        // Out of band: the chain holds no new order for the buyer, and no
        // bond moved.
        expect(await committedForBuyer(), 'no OrderCommitted for the buyer').toBe(committedBefore);
        const [buyerAfter, sellerAfter, coreAfter] = await Promise.all([balanceOf(BUYER.address), balanceOf(SELLER.address), balanceOf(core)]);
        expect(buyerAfter, 'the buyer bonded nothing').toBe(buyerBefore);
        expect(sellerAfter, 'the seller bonded nothing').toBe(sellerBefore);
        expect(coreAfter, 'FigaroCore holds nothing new').toBe(coreBefore);
    });
});
