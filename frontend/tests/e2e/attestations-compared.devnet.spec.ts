/**
 * attestations-compared.devnet.spec.ts — the order page's comparison of the
 * parties' attestations under one stage, end to end.
 *
 * `/orders/view` mounts `StageAttestationComparison` under the timeline. For
 * a clause whose spec declares it assembly-scoped and declares a witness
 * stage, it compares every party's filing under that stage, field by field,
 * from the attestation log and the content each fingerprint resolves to.
 * The component is covered alone by
 * `tests/components/StageAttestationComparison.test.tsx`; this spec drives the
 * page over the chain and IPFS.
 *
 *   commit   → two orders, one per process, buyer anvil[0] and seller
 *              anvil[14], each agreement composing the commerce clause and the
 *              property-transfer clause (assembly-scoped, stage 1 a witness
 *              stage), located by name over the clauses the chain registered;
 *              signed by both and committed on FigaroCore
 *   attest   → on each, the buyer and the seller attest stage 1 of the
 *              property-transfer clause on the AttestationCoordinator, the
 *              content encoded by the registered spec and pinned at the
 *              address its fingerprint names (`pinWitnessBytes`)
 *              - process A: both file the same values
 *              - process B: the seller files another revised-terms fingerprint
 *   evidence → OUT OF BAND: the coordinator's two Attestation events per
 *              process, each naming its attester, stage 1 and the fingerprint
 *   read     → /orders/view, as the buyer: process A's comparison says
 *              "agree"; process B's says it differs on the revised-terms
 *              field, by the label the registered spec gives it; each lists
 *              both parties' filings
 *   close    → the buyer resolves both processes (ProcessResolved, out of band)
 *
 * Wallets: anvil[0] (the suite's fixture buyer) and anvil[14] (a counterparty
 * across the suite, seeded with no profile), as batch-events uses them. The
 * spec mints its own bond tokens; fresh salts keep re-runs independent.
 *
 * Requires Anvil + ./scripts/devup.sh (deploy + populate) + Kubo + :3100.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createWalletClient, http, keccak256, parseAbi, stringToHex, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    ATTESTATION_COORDINATOR_ABI,
    ERC20_ABI,
    buildCommitment,
    buildDomain,
    buildOrderAgreement,
    buildSignedClauseInclusionProof,
    calculateBonds,
    generateSalt,
    hashClauseData,
} from '@figaro-protocol/sdk';
import { encodeContentFromSpec } from '@figaro-protocol/sdk/clauses';
import { getClauseSpec, specSource } from '@/lib/shared/clauseSpecSource';
import { CORE_ABI } from '@/lib/core/contracts';
import { LOCAL_ANVIL, RPC_URL, keyOf, localPublicClient, pinWitnessBytes, primeRegisteredClauseSpecs, readLocalDeploymentConfig } from './devnet-helpers';
import { ANVIL_KEYS } from '../anvilAccounts';

const MINT_ABI = parseAbi(['function mint(address to, uint256 amount) external']);
const BUYER = privateKeyToAccount(ANVIL_KEYS[0] as Hex);
const SELLER = privateKeyToAccount(ANVIL_KEYS[14] as Hex);
const PAYMENT = 10n ** 18n;
const STAGE = 1;

test.describe('ATTESTATIONS COMPARED — the order page compares the parties\' filings under one stage (devnet)', () => {
    test.setTimeout(300_000);

    test('buyer and seller attest the same stage: the page says agree when the values match and names the field when they differ', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const coordinator = config.attestationCoordinator as Hex;
        const token = config.tokenAddress as Hex;
        expect(coordinator, 'the devnet names its attestation coordinator').toMatch(/^0x[0-9a-fA-F]{40}$/);
        const publicClient = localPublicClient();
        const wallet = (account: typeof BUYER) => createWalletClient({ account, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const send = async (who: typeof BUYER, args: Parameters<ReturnType<typeof wallet>['writeContract']>[0]) => {
            const receipt = await publicClient.waitForTransactionReceipt({ hash: await wallet(who).writeContract(args) });
            expect(receipt.status, `${String(args.functionName)} succeeded`).toBe('success');
            return receipt;
        };

        // ── The clauses, located by name over what the chain registered. ──
        await primeRegisteredClauseSpecs();
        const COMMERCE = keyOf('figaro-commerce');
        const TRANSFER = keyOf('figaro-property-transfer');
        const transferSpec = getClauseSpec(TRANSFER);
        expect(transferSpec, 'the property-transfer clause is registered and its spec loads').toBeTruthy();
        expect((transferSpec!.block as { design?: { scope?: string } }).design?.scope, 'its spec declares it assembly-scoped').toBe('assembly');
        const stageFields = transferSpec!.stages?.[STAGE];
        expect(stageFields, 'its spec declares stage 1 a witness stage').toBeTruthy();
        const revisedTermsLabel = stageFields!.find((f) => f.name === 'revisedTermsHash')?.label;
        expect(revisedTermsLabel, 'the stage declares the revised-terms field, with its label').toBeTruthy();

        /** Commit one order on FigaroCore, both parties signing; returns what an attestation names. */
        const openTrade = async (label: string) => {
            const { agreement, checkoutHash } = buildOrderAgreement(BUYER.address, SELLER.address, {
                [COMMERCE]: { lineItems: [{ itemId: `compared-${label}`, name: `Consignment ${label}`, quantity: 1, unitPrice: PAYMENT.toString() }] },
                [TRANSFER]: { anticipatedEvents: ['Cargo resold in transit'] },
            }, specSource());
            const { commitment, typedData } = buildCommitment({
                processId: `0x${'0'.repeat(64)}` as Hex,
                buyer: BUYER.address,
                seller: SELLER.address,
                currency: token,
                payment: PAYMENT,
                expectedCumulativeValue: PAYMENT,
                checkoutHash,
                salt: generateSalt(),
                deadline: BigInt((await publicClient.getBlock()).timestamp) + 3600n,
            }, buildDomain(LOCAL_ANVIL.id, core));
            const bonds = calculateBonds(PAYMENT, PAYMENT);
            await send(BUYER, { address: token, abi: MINT_ABI, functionName: 'mint', args: [BUYER.address, bonds.buyerBond] });
            await send(BUYER, { address: token, abi: MINT_ABI, functionName: 'mint', args: [SELLER.address, bonds.sellerBond] });
            await send(BUYER, { address: token, abi: ERC20_ABI, functionName: 'approve', args: [core, bonds.buyerBond] });
            await send(SELLER, { address: token, abi: ERC20_ABI, functionName: 'approve', args: [core, bonds.sellerBond] });
            const buyerSig = await BUYER.signTypedData(typedData);
            const sellerSig = await SELLER.signTypedData(typedData);
            const receipt = await send(BUYER, { address: core, abi: CORE_ABI, functionName: 'commit', args: [commitment, buyerSig, sellerSig] });
            const committed = await publicClient.getContractEvents({
                address: core, abi: CORE_ABI, eventName: 'OrderCommitted',
                args: { buyer: BUYER.address }, fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber,
            });
            expect(committed, `OrderCommitted lands for trade ${label}`).toHaveLength(1);
            return {
                commitment, agreement,
                processId: committed[0].args.processId as Hex,
                orderHash: committed[0].args.orderHash as Hex,
            };
        };
        type Trade = Awaited<ReturnType<typeof openTrade>>;

        /** One party's stage-1 filing: encoded by the registered spec, pinned at its fingerprint, attested. */
        const attest = async (trade: Trade, who: typeof BUYER, values: Record<string, unknown>): Promise<Hex> => {
            const content = encodeContentFromSpec(transferSpec!, values, { stage: STAGE });
            const contentRef = keccak256(content);
            await pinWitnessBytes(content);
            const entry = trade.agreement.clauses.find((c) => c.clause.toLowerCase() === TRANSFER.toLowerCase())!;
            const { proof } = buildSignedClauseInclusionProof(trade.agreement, entry.clause);
            await send(who, {
                address: coordinator, abi: ATTESTATION_COORDINATOR_ABI,
                functionName: who === BUYER ? 'attestAsBuyer' : 'attestAsSeller',
                args: [trade.commitment, entry.clause as Hex, STAGE, hashClauseData(entry), proof, contentRef],
            });
            return contentRef;
        };

        const filed = (revisedTerms: string) => ({
            event: 'Cargo resold in transit',
            transfers: [{ from: BUYER.address, to: SELLER.address, amount: '1' }],
            revisedTermsHash: keccak256(stringToHex(revisedTerms)),
        });

        // ── Two trades: the parties agree on A and part on B. ──
        const agreeing = await openTrade('A');
        const parting = await openTrade('B');
        const filings: { trade: Trade; refs: { attester: string; contentRef: Hex }[] }[] = [
            { trade: agreeing, refs: [
                { attester: BUYER.address, contentRef: await attest(agreeing, BUYER, filed('Revised terms, version 2')) },
                { attester: SELLER.address, contentRef: await attest(agreeing, SELLER, filed('Revised terms, version 2')) },
            ] },
            { trade: parting, refs: [
                { attester: BUYER.address, contentRef: await attest(parting, BUYER, filed('Revised terms, version 2')) },
                { attester: SELLER.address, contentRef: await attest(parting, SELLER, filed('Revised terms, version 3')) },
            ] },
        ];

        // ── CHAIN FACTS, out of band: the coordinator's Attestation events. ──
        for (const { trade, refs } of filings) {
            const events = await publicClient.getContractEvents({
                address: coordinator, abi: ATTESTATION_COORDINATOR_ABI, eventName: 'Attestation',
                args: { processId: trade.processId }, fromBlock: 0n,
            });
            const seen = events
                .filter((e) => Number(e.args.stage) === STAGE && (e.args.clauseId as string).toLowerCase() === TRANSFER.toLowerCase())
                .map((e) => `${(e.args.attester as string).toLowerCase()}:${(e.args.contentRef as string).toLowerCase()}`)
                .sort();
            expect(seen, 'the coordinator names each party\'s stage-1 filing and its fingerprint')
                .toEqual(refs.map((r) => `${r.attester.toLowerCase()}:${r.contentRef.toLowerCase()}`).sort());
        }

        // ── The order page, as the buyer: the comparison for each process. ──
        const comparisonOf = async (trade: Trade) => {
            await gotoAsWallet(page, BUYER.address, `/orders/view?process=${trade.processId}&e2e=devnet`);
            await page.getByTestId('order-timeline-view').waitFor({ timeout: 60000 });
            const card = page.getByTestId(`stage-comparison-${TRANSFER.toLowerCase()}-${STAGE}`);
            await expect(card, 'the page compares the property-transfer clause\'s stage 1').toBeVisible({ timeout: 60000 });
            for (const who of [BUYER.address, SELLER.address]) {
                await expect(card.getByTestId(`stage-filing-${who.toLowerCase()}-${trade.orderHash.toLowerCase()}`), 'each party\'s filing is listed')
                    .toBeVisible({ timeout: 30000 });
            }
            const verdict = card.getByTestId('stage-comparison-verdict');
            await expect(verdict, 'the content is read and compared').not.toHaveAttribute('data-verdict', 'loading', { timeout: 60000 });
            return verdict;
        };

        const agreed = await comparisonOf(agreeing);
        await expect(agreed).toHaveAttribute('data-verdict', 'agree');
        await expect(agreed).toHaveText('agree');

        const differed = await comparisonOf(parting);
        await expect(differed).toHaveAttribute('data-verdict', 'differ');
        await expect(differed, 'the verdict names the field the parties parted on, by its registered label')
            .toHaveText(`differ on: ${revisedTermsLabel}`);

        // ── Close both processes: the buyer resolves, out of band. ──
        for (const trade of [agreeing, parting]) {
            const receipt = await send(BUYER, {
                address: core, abi: CORE_ABI, functionName: 'resolveProcess', args: [trade.processId, [trade.commitment]],
            });
            const resolved = await publicClient.getContractEvents({
                address: core, abi: CORE_ABI, eventName: 'ProcessResolved',
                args: { processId: trade.processId }, fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber,
            });
            expect(resolved, 'ProcessResolved lands').toHaveLength(1);
        }
    });
});
