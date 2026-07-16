/**
 * rpgf-rewards.devnet.spec.ts
 *
 * The optimistic RPGF distribution, end to end and UI on both ends, on
 * /rewards. Two scenarios, in file order (they share tranche 0 — the only
 * tranche postable on devnet clocks):
 *
 *   1. CHALLENGE VOIDS — a poster computes + posts tranche 0's root through
 *      the UI (bond staked); a challenger stakes an equal bond through the UI
 *      and the posting is voided UNCONDITIONALLY (no adjudication gates
 *      validity — minting stays purely mechanical). Money legs from the
 *      chain: the minter escrows exactly both bonds; the tranche slot
 *      reopens.
 *
 *   2. THE FULL MINT — scenario pre-population (real protocol acts, no
 *      mocks: a staked seller, a signed+committed order whose agreement
 *      composes a tier-1 clause AND the assembly-provenance section, buyer
 *      attestations of both, one resolve) gives the formula something to
 *      score. The recipient of record (the registrar wallet — clause author
 *      AND assembly designer of record) then drives the UI: compute + post →
 *      wait out the challenge window → finalize → claim. Money legs from the
 *      chain: the florin mints EXACTLY the 15% per-wallet cap of the tranche (sole
 *      recipient → water-fill caps at floor(300M × 15/100) = 45M florins), the
 *      poster's bond returns via the withdraw surface, double-claim reverts.
 *
 * Depends on populate-test-data (clauses incl. figaro-assembly-provenance,
 * the seed assemblies, sellers) and the devnet-authoring gate.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createWalletClient, http, parseAbi, parseEther, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    ASSEMBLY_REGISTRY_ABI,
    ATTESTATION_COORDINATOR_ABI,
    RPGF_MINTER_ABI,
    SELLER_REGISTRY_ABI,
    buildCommitment,
    buildDomain,
    buildSectionInclusionProof,
    calculateBonds,
    computeAgreementHash,
    computeClauseKey,
    generateSalt,
    getSectionDataBytes,
    type Agreement,
} from '@figaro/sdk';
import { localPublicClient, readLocalDeploymentConfig, LOCAL_ANVIL, RPC_URL } from './devnet-helpers';
import { ANVIL_ACCOUNTS, ANVIL_KEYS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';
import type { Page } from '@playwright/test';

async function waitForConnected(page: Page) {
    await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
        null,
        { timeout: 30000 },
    );
}

/** Anvil mines only on transactions, so after a wall-clock wait the LATEST
 *  block's timestamp still predates the window's end and view-simulations
 *  (finalize's pre-flight) see stale time. Mining one block is the devnet
 *  stand-in for mainnet's natural cadence — never a state rollback. */
async function mineBlock(publicClient: ReturnType<typeof localPublicClient>) {
    await (publicClient as unknown as { request: (a: { method: string; params: [] }) => Promise<unknown> })
        .request({ method: 'evm_mine', params: [] });
}

/** Idempotence across attempts/retries: a failed prior attempt can leave an
 *  ACTIVE posting on tranche 0 (the slot then blocks a fresh UI post). If its
 *  challenge window is still open, void it with a real bonded challenge; if
 *  the window expired, the root is final BY DESIGN — finalize it and report
 *  so the caller skips (a fresh devup redeploy re-arms the spec). Protocol
 *  acts only, never a rollback. */
async function reopenTrancheSlot(
    publicClient: ReturnType<typeof localPublicClient>,
    minter: Hex,
): Promise<'open' | 'finalized'> {
    const posting = (await publicClient.readContract({
        address: minter, abi: RPGF_MINTER_ABI, functionName: 'postings', args: [0n],
    })) as readonly [Hex, Hex, bigint, bigint, bigint];
    if (posting[4] === 0n) return 'open';
    const sweeper = createWalletClient({
        account: privateKeyToAccount(ANVIL_KEYS[13]), chain: LOCAL_ANVIL, transport: http(RPC_URL),
    });
    const challengeWindow = (await publicClient.readContract({
        address: minter, abi: RPGF_MINTER_ABI, functionName: 'challengeWindow',
    })) as bigint;
    const now = (await publicClient.getBlock({ blockTag: 'latest' })).timestamp;
    if (now < posting[4] + challengeWindow) {
        const bond = (await publicClient.readContract({
            address: minter, abi: RPGF_MINTER_ABI, functionName: 'bond',
        })) as bigint;
        const hash = await sweeper.writeContract({
            address: minter, abi: RPGF_MINTER_ABI, functionName: 'challenge', args: [0], value: bond,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        return 'open';
    }
    const hash = await sweeper.writeContract({
        address: minter, abi: RPGF_MINTER_ABI, functionName: 'finalize', args: [0],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return 'finalized';
}

const ERC20_ABI = parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function approve(address, uint256) returns (bool)',
]);

// The recipient of record: populate-clauses/-test-data registers every clause
// and seed assembly from anvil[0], so it is the clause AUTHOR and assembly
// DESIGNER the formula credits. It drives post/finalize/claim.
const RECIPIENT = ANVIL_ACCOUNTS[0] as Hex;
// Scenario-dedicated wallets (anvil[16..19] — no other spec drives them).
const POSTER = ANVIL_ACCOUNTS[16] as Hex;
const CHALLENGER = ANVIL_ACCOUNTS[17] as Hex;
const TRADE_BUYER_KEY = ANVIL_KEYS[18];
const TRADE_SELLER_KEY = ANVIL_KEYS[19];

test.describe('RPGF rewards — optimistic post / challenge / finalize / claim (devnet)', () => {
    test.setTimeout(300_000);

    test('a challenge always voids the posting — both bonds escrow to the case track', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const minter = config.rpgfMinter as Hex;
        expect(minter, 'the RPGF minter is deployed (deploy-local.sh writes its address)').toBeTruthy();
        const publicClient = localPublicClient();
        const finalized = ((await publicClient.readContract({
            address: minter, abi: RPGF_MINTER_ABI, functionName: 'tranches', args: [0n],
        })) as readonly [bigint, bigint, Hex, bigint, bigint, boolean, bigint])[5];
        test.skip(finalized, 'tranche 0 already finalized on this chain — one-shot per deploy; redeploy (devup FORCE_REDEPLOY=1) to re-run');
        test.skip(
            (await reopenTrancheSlot(publicClient, minter)) === 'finalized',
            'a stale expired posting finalized during cleanup — one-shot per deploy; redeploy to re-run',
        );
        const minterEthBefore = await publicClient.getBalance({ address: minter });
        const bond = (await publicClient.readContract({
            address: minter, abi: RPGF_MINTER_ABI, functionName: 'bond',
        })) as bigint;

        // ── Poster: compute + post through the UI ──
        await gotoAsWallet(page, POSTER, '/rewards?e2e=devnet');
        await page.getByTestId('rewards-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const post = page.getByTestId('post-root-0');
        await expect(post, 'specs warm → the post action arms').toBeEnabled({ timeout: 60000 });
        await post.click();
        await expect(page.getByTestId('tranche-status-0'), 'the posting is live').toHaveText('posted', { timeout: 60000 });

        // ── Challenger: an equal bond voids the posting unconditionally ──
        await gotoAsWallet(page, CHALLENGER, '/rewards?e2e=devnet');
        await page.getByTestId('rewards-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await expect(page.getByTestId('tranche-status-0')).toHaveText('posted', { timeout: 30000 });
        await page.getByTestId('challenge-0').click();
        await expect(page.getByTestId('tranche-status-0'), 'the slot reopens — a challenge ALWAYS voids')
            .toHaveText('open', { timeout: 60000 });

        // ── Money legs, from the chain: exactly both bonds escrowed ──
        const minterEthAfter = await publicClient.getBalance({ address: minter });
        expect(minterEthAfter - minterEthBefore, 'the minter escrows the post bond + the challenge bond')
            .toBe(2n * bond);
    });

    test('activity → post → finalize → claim mints the recipient of record exactly the capped allocation', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const minter = config.rpgfMinter as Hex;
        const core = config.figaroCore as Hex;
        const florin = config.florinToken as Hex;
        const token = config.tokenAddress as Hex;
        const coordinator = config.attestationCoordinator as Hex;
        const sellerRegistry = config.sellerRegistry as Hex;
        const assemblyRegistry = config.assemblyRegistry as Hex;
        expect(minter && florin && coordinator && sellerRegistry && assemblyRegistry, 'full deployment record').toBeTruthy();
        const publicClient = localPublicClient();
        const chainId = LOCAL_ANVIL.id;
        const finalizedAlready = ((await publicClient.readContract({
            address: minter, abi: RPGF_MINTER_ABI, functionName: 'tranches', args: [0n],
        })) as readonly [bigint, bigint, Hex, bigint, bigint, boolean, bigint])[5];
        test.skip(finalizedAlready, 'tranche 0 already finalized on this chain — one-shot per deploy; redeploy (devup FORCE_REDEPLOY=1) to re-run');
        test.skip(
            (await reopenTrancheSlot(publicClient, minter)) === 'finalized',
            'a stale expired posting finalized during cleanup — one-shot per deploy; redeploy to re-run',
        );

        const buyerAccount = privateKeyToAccount(TRADE_BUYER_KEY);
        const sellerAccount = privateKeyToAccount(TRADE_SELLER_KEY);
        const buyerWallet = createWalletClient({ account: buyerAccount, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const sellerWallet = createWalletClient({ account: sellerAccount, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const receipt = (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });

        // ── Scenario pre-population (real protocol acts — never mocks) ──
        // 1. The trade seller holds a live SellerRegistry stake (the formula's
        //    staked-root-seller eligibility). Idempotent across runs.
        const priorRegistrations = await publicClient.getContractEvents({
            address: sellerRegistry, abi: SELLER_REGISTRY_ABI, eventName: 'SellerRegistered',
            args: { seller: sellerAccount.address }, fromBlock: 0n,
        });
        if (priorRegistrations.length === 0) {
            const deposit = (await publicClient.readContract({
                address: sellerRegistry, abi: SELLER_REGISTRY_ABI, functionName: 'registrationDeposit',
            })) as bigint;
            await receipt(await sellerWallet.writeContract({
                address: sellerRegistry, abi: SELLER_REGISTRY_ABI, functionName: 'register',
                args: ['ipfs://rpgf-e2e-trade-seller'], value: deposit,
            }));
        }

        // 2. The agreement: commerce + topology + a TIER-1 clause
        //    (geolocation — the clause-author leg) + the assembly-provenance
        //    section pinned to a REGISTERED compositionHash discovered from
        //    the chain (the designer leg).
        const anchored = await publicClient.getContractEvents({
            address: assemblyRegistry, abi: ASSEMBLY_REGISTRY_ABI, eventName: 'AssemblyRegistered', fromBlock: 0n,
        });
        expect(anchored.length, 'populate-test-data anchored the seed assemblies').toBeGreaterThan(0);
        const compositionHash = anchored[anchored.length - 1].args.compositionHash as Hex;

        const payment = parseEther('1');
        const agreement: Agreement = {
            version: 'a1',
            buyer: buyerAccount.address,
            seller: sellerAccount.address,
            sections: [
                { clause: 'figaro-topology', version: 1, data: { parentOrderHashes: [] } },
                {
                    clause: 'figaro-commerce', version: 1,
                    data: {
                        payment: payment.toString(),
                        lineItems: [{ itemId: 'rpgf-e2e', name: 'RPGF e2e item', quantity: 1, unitPrice: payment.toString() }],
                    },
                },
                {
                    clause: 'figaro-geolocation', version: 1,
                    data: { originGeohash: 'u4pruyd', destinationGeohash: 'u4pruyf' },
                },
                { clause: 'figaro-assembly-provenance', version: 1, data: { compositionHash } },
            ],
        };
        const agreementHash = computeAgreementHash(agreement);

        // 3. Sign + commit (both parties bond; the buyer broadcasts). Root
        //    orders sign processId = 0 (the chain derives the real id —
        //    the event carries it).
        const domain = buildDomain(chainId, core);
        const chainNow = (await publicClient.getBlock({ blockTag: 'latest' })).timestamp;
        const { commitment, typedData } = buildCommitment(
            {
                processId: `0x${'0'.repeat(64)}` as Hex,
                buyer: buyerAccount.address,
                seller: sellerAccount.address,
                currency: token,
                payment,
                expectedCumulativeValue: payment,
                agreementHash,
                salt: generateSalt(),
                deadline: chainNow + 3600n,
            },
            domain,
        );
        const buyerSig = await buyerWallet.signTypedData(typedData);
        const sellerSig = await sellerWallet.signTypedData(typedData);
        const { buyerBond, sellerBond } = calculateBonds(payment, payment);
        await receipt(await buyerWallet.writeContract({
            address: token, abi: ERC20_ABI, functionName: 'approve', args: [core, buyerBond],
        }));
        await receipt(await sellerWallet.writeContract({
            address: token, abi: ERC20_ABI, functionName: 'approve', args: [core, sellerBond],
        }));
        const commitHash = await buyerWallet.writeContract({
            address: core, abi: CORE_ABI, functionName: 'commit', args: [commitment, buyerSig, sellerSig],
        });
        const commitReceipt = await receipt(commitHash);
        expect(commitReceipt.status).toBe('success');
        const committed = await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted',
            args: { buyer: buyerAccount.address }, fromBlock: commitReceipt.blockNumber,
        });
        const processId = committed[committed.length - 1].args.processId as Hex;

        // 4. The buyer attests both sections (re-asserting: content IS the
        //    committed sectionData — the exact bytes the recompute inverts).
        for (const clause of ['figaro-geolocation', 'figaro-assembly-provenance'] as const) {
            const section = agreement.sections.find((s) => s.clause === clause)!;
            const { proof } = buildSectionInclusionProof(agreement, clause);
            const sectionData = getSectionDataBytes(section);
            await receipt(await buyerWallet.writeContract({
                address: coordinator, abi: ATTESTATION_COORDINATOR_ABI, functionName: 'attestAsBuyer',
                args: [commitment, computeClauseKey(clause, 1), 0, sectionData, proof, sectionData],
            }));
        }

        // 5. Resolve — the formula scores RESOLVED processes only.
        await receipt(await buyerWallet.writeContract({
            address: core, abi: CORE_ABI, functionName: 'resolveProcess', args: [processId, [commitment]],
        }));

        // ── Baselines ──
        const balanceOfFig = (who: Hex) =>
            publicClient.readContract({ address: florin, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;
        const figBefore = await balanceOfFig(RECIPIENT);
        const minterEthBefore = await publicClient.getBalance({ address: minter });
        const bond = (await publicClient.readContract({
            address: minter, abi: RPGF_MINTER_ABI, functionName: 'bond',
        })) as bigint;
        const trancheAmount = ((await publicClient.readContract({
            address: minter, abi: RPGF_MINTER_ABI, functionName: 'tranches', args: [0n],
        })) as readonly [bigint, bigint, Hex, bigint, bigint, boolean, bigint])[0];
        // Sole recipient → the per-wallet water-fill cap binds exactly.
        const expectedAllocation = (trancheAmount * 15n) / 100n;

        // ── The recipient drives the UI: compute + post ──
        await gotoAsWallet(page, RECIPIENT, '/rewards?e2e=devnet');
        await page.getByTestId('rewards-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const post = page.getByTestId('post-root-0');
        await expect(post, 'specs warm → the post action arms').toBeEnabled({ timeout: 60000 });
        await post.click();
        await expect(page.getByTestId('tranche-status-0')).toHaveText('posted', { timeout: 60000 });

        // ── Wait out the challenge window (devnet: 20s), then finalize ──
        const challengeWindow = (await publicClient.readContract({
            address: minter, abi: RPGF_MINTER_ABI, functionName: 'challengeWindow',
        })) as bigint;
        await page.waitForTimeout(Number(challengeWindow) * 1000 + 2000);
        // Anvil mines on demand only: land one block so LATEST's timestamp
        // moves past the window before finalize's pre-flight simulation reads it.
        await mineBlock(publicClient);
        await page.getByTestId('finalize-0').click();
        await expect(page.getByTestId('tranche-status-0'), 'unchallenged window → finalized')
            .toHaveText('finalized', { timeout: 60000 });

        // ── Claim: the proof rebuilds from the finalized window ──
        await page.getByTestId('claim-0').click();
        await expect
            .poll(async () => (await balanceOfFig(RECIPIENT)) - figBefore, {
                timeout: 60000,
                message: 'the claim mints florins to the recipient of record',
            })
            .toBe(expectedAllocation);
        await expect(page.getByTestId('florin-balance'), 'the UI reflects the minted balance')
            .toContainText('45', { timeout: 30000 });

        // Double-claim refuses (the pre-flight simulate surfaces the revert).
        await page.getByTestId('claim-0').click();
        await expect(page.getByTestId('rewards-error')).toBeVisible({ timeout: 30000 });
        expect((await balanceOfFig(RECIPIENT)) - figBefore, 'no second mint').toBe(expectedAllocation);

        // ── The poster's bond returns through the withdraw surface ──
        const withdraw = page.getByTestId('withdraw-bonds');
        await withdraw.waitFor({ state: 'visible', timeout: 30000 });
        await withdraw.click();
        await expect
            .poll(async () => minterEthBefore + bond - (await publicClient.getBalance({ address: minter })), {
                timeout: 60000,
                message: 'post bond in, then out on withdraw — the minter nets zero for this cycle',
            })
            .toBe(bond);

        test.info().annotations.push({
            type: 'RpgfMint',
            description: `tranche=0 recipient=${RECIPIENT} allocation=${expectedAllocation} (15% cap of ${trancheAmount})`,
        });
    });
});
