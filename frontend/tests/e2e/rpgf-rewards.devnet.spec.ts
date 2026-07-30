/**
 * rpgf-rewards.devnet.spec.ts
 *
 * The RPGF distribution's runtime surface at /rewards, against the
 * count-it-when-it-happens design: `UsageCounter` records verified usage of a
 * clause or assembly at the moment a process settles, accrual buckets into
 * fixed periods, and `RpgfMinter.claim` pays a closed period's tranche UNIFORM
 * pro rata (no cap), to live-staked authors. There is no root to post, no bond,
 * no challenge and no forum — every one of those tests was deleted with the apparatus.
 *
 * TIME IS COMPRESSED, NOT WARPED. `claim` gates on `UsageCounter.periodClosed`,
 * so the reward leg is undrivable against a schedule measured in days —
 * accrual would run and nothing could ever be claimed. `Deploy.s.sol` therefore
 * sets devnet periods at +90s / +180s / +270s (operator ruling 2026-07-27:
 * "we can write the e2e test by compressing time"). Nothing warps the shared
 * clock: this spec records usage, waits for period 0 to end on its own, and
 * claims — which is the same shape mainnet runs over years, at a scale a test
 * run can observe. Warping would have expired every other spec's deadlines and
 * signed commitments, and devnet is a mainnet REHEARSAL, not a sandbox.
 *
 * The scenario mints real protocol history (a staked seller, a signed +
 * committed order whose agreement composes a registered clause, one resolve),
 * records that usage on `UsageCounter` — permissionless, gas-paid by whoever
 * benefits, with no UI of its own by design (the rewards hook READS accrual, it
 * never records) — then drives the UI through accruing → claimable → claimed,
 * asserting the florins actually arrive.
 *
 * Depends on populate-test-data (the registered clauses, sellers) and the
 * devnet-authoring gate.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createWalletClient, http, parseAbi, parseEther, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    ATTESTATION_COORDINATOR_ABI,
    MEMBERS_REGISTRY_ABI,
    buildCommitment,
    buildDomain,
    buildSectionInclusionProof,
    calculateBonds,
    computeAgreementHash,
    computeClauseKey,
    generateSalt,
    sectionDataHash,
    type Agreement,
} from '@figaro/sdk';
import { localPublicClient, readLocalDeploymentConfig, LOCAL_ANVIL, RPC_URL } from './devnet-helpers';
import { ANVIL_ACCOUNTS, ANVIL_KEYS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';
import { RPGF_MINTER_ABI, USAGE_COUNTER_ABI } from "@figaro/sdk";
import type { Page } from '@playwright/test';

const ERC20_ABI = parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function approve(address, uint256) returns (bool)',
]);

async function waitForConnected(page: Page) {
    await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
        null,
        { timeout: 30000 },
    );
}

// The author of record: populate-clauses registers every clause from anvil[0],
// so it is the registrar the minter would pay — and the wallet whose /rewards
// view shows the accrual.
const AUTHOR = ANVIL_ACCOUNTS[0] as Hex;
// Scenario-dedicated wallets (anvil[18..19] — no other spec drives them).
const TRADE_BUYER_KEY = ANVIL_KEYS[18];
const TRADE_SELLER_KEY = ANVIL_KEYS[19];
// The clause whose usage this scenario records. Registered by populate-clauses
// under AUTHOR; the agreement composes it so it lands in the merkle tree.
const USED_CLAUSE = 'figaro-geolocation';
const USED_CLAUSE_VERSION = 1;

test.describe('RPGF rewards — usage accrues, the UI reads it (devnet)', () => {
    test.setTimeout(300_000);

    test('a settled process records usage, and /rewards shows the author their accrual', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const minter = config.rpgfMinter as Hex;
        const counter = config.usageCounter as Hex;
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const coordinator = config.attestationCoordinator as Hex;
        const membersRegistry = config.membersRegistry as Hex;
        expect(minter, 'the RPGF minter is deployed (deploy-local.sh writes its address)').toBeTruthy();
        expect(counter, 'the UsageCounter is deployed (deploy-local.sh writes its address)').toBeTruthy();
        expect(core && token && coordinator && membersRegistry, 'full deployment record').toBeTruthy();

        const publicClient = localPublicClient();
        const chainId = LOCAL_ANVIL.id;
        const artifact = computeClauseKey(USED_CLAUSE, USED_CLAUSE_VERSION);
        const period = (await publicClient.readContract({
            address: counter, abi: USAGE_COUNTER_ABI, functionName: 'currentPeriod',
        })) as number;

        const buyerAccount = privateKeyToAccount(TRADE_BUYER_KEY);
        const sellerAccount = privateKeyToAccount(TRADE_SELLER_KEY);
        const buyerWallet = createWalletClient({ account: buyerAccount, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const sellerWallet = createWalletClient({ account: sellerAccount, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const receipt = (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });

        // ── Real protocol history (never mocks) ──────────────────────────
        // 1. The seller holds a live MembersRegistry stake. Idempotent across runs.
        const priorRegistrations = await publicClient.getContractEvents({
            address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, eventName: 'MemberRegistered',
            args: { member: sellerAccount.address }, fromBlock: 0n,
        });
        if (priorRegistrations.length === 0) {
            const deposit = (await publicClient.readContract({
                address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, functionName: 'registrationDeposit',
            })) as bigint;
            await receipt(await sellerWallet.writeContract({
                address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, functionName: 'register',
                args: ['ipfs://rpgf-e2e-trade-seller'], value: deposit,
            }));
        }

        // 2. The agreement: commerce + topology + the clause whose usage is counted.
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
                    clause: USED_CLAUSE, version: USED_CLAUSE_VERSION,
                    data: { origin: 'u4pruy', destination: 'u4pruz' },
                },
            ],
        };
        const agreementHash = computeAgreementHash(agreement);

        // 3. Sign + commit (both parties bond; the buyer broadcasts). Root
        //    orders sign processId = 0 — the chain derives the real id.
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
        const commitReceipt = await receipt(await buyerWallet.writeContract({
            address: core, abi: CORE_ABI, functionName: 'commit', args: [commitment, buyerSig, sellerSig],
        }));
        expect(commitReceipt.status).toBe('success');
        const committed = await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted',
            args: { buyer: buyerAccount.address }, fromBlock: commitReceipt.blockNumber,
        });
        const processId = committed[committed.length - 1].args.processId as Hex;

        // 4. The buyer attests the clause (evidence DURING the open process —
        //    the mirror-image gate to the one usage counting uses).
        const section = agreement.sections.find((s) => s.clause === USED_CLAUSE)!;
        const { proof } = buildSectionInclusionProof(agreement, USED_CLAUSE);
        // Only the section FINGERPRINT reaches calldata — never the preimage.
        const sectionHash = sectionDataHash(section);
        await receipt(await buyerWallet.writeContract({
            address: coordinator, abi: ATTESTATION_COORDINATOR_ABI, functionName: 'attestAsBuyer',
            args: [commitment, artifact, 0, sectionHash, proof, sectionHash],
        }));

        // 5. Resolve — usage is what a SETTLED process leaves behind.
        await receipt(await buyerWallet.writeContract({
            address: core, abi: CORE_ABI, functionName: 'resolveProcess', args: [processId, [commitment]],
        }));

        // 6. Record the usage. Permissionless — the proof is what is trusted,
        //    never the caller — and idempotent per (artifact, process), once
        //    ever. The salt is fresh per run (`generateSalt()`), so this is a new
        //    process and the record must SUCCEED; a repeat of the same process
        //    would be the only by-design refusal. (The per-pair cap that used to
        //    be tolerated here was deleted 2026-07-30 — repeat trade is now
        //    discounted by the exponent, never refused, so a run that keeps
        //    trading between the same two wallets simply keeps accruing.)
        await receipt(await buyerWallet.writeContract({
            address: counter, abi: USAGE_COUNTER_ABI, functionName: 'recordUsage',
            args: [commitment, artifact, sectionHash, proof],
        }));

        const [c, d, score] = (await publicClient.readContract({
            address: counter, abi: USAGE_COUNTER_ABI, functionName: 'accrualOf', args: [artifact, period],
        })) as readonly [bigint, bigint, bigint];
        expect(c, 'the settled process was counted').toBeGreaterThan(0n);
        expect(d, 'the buyer/seller pair was counted').toBeGreaterThan(0n);
        expect(score, 'the artifact carries a positive score').toBeGreaterThan(0n);

        // ── The UI reads it: the author of record opens /rewards ──────────
        await gotoAsWallet(page, AUTHOR, '/rewards?e2e=devnet');
        await page.getByTestId('rewards-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);

        const card = page.getByTestId(`tranche-card-${period}`);
        await card.waitFor({ timeout: 60000 });
        await expect(page.getByTestId(`tranche-accruals-${period}`), 'the author sees the clause they registered')
            .toContainText(USED_CLAUSE, { timeout: 60000 });
        await expect(page.getByTestId(`tranche-accruals-${period}`), 'with the counts the chain recorded')
            .toContainText(`score ${score.toString()}`);
        await expect(page.getByTestId(`tranche-total-score-${period}`), 'and the period total it divides by')
            .toContainText(score.toString());

        // ── The tranche is honestly ACCRUING: no claim is offered ─────────
        const periodClosed = (await publicClient.readContract({
            address: counter, abi: USAGE_COUNTER_ABI, functionName: 'periodClosed', args: [period],
        })) as boolean;
        expect(periodClosed, 'the period is still open immediately after recording').toBe(false);
        await expect(page.getByTestId(`tranche-status-${period}`)).toHaveText('accruing');
        await expect(page.getByTestId(`tranche-accruing-${period}`)).toBeVisible();
        await expect(page.getByTestId(`claim-${period}`), 'an open period offers no claim').toHaveCount(0);

        // ── Close the period by advancing the chain, not by sleeping ──────
        // Devnet periods are minutes (Deploy.s.sol), so waiting them out would
        // stall the suite. Advance just past THIS period's end — a jump of
        // minutes, which cannot expire the hour-scale deadlines other specs
        // sign with. Nothing is snapshotted or reverted.
        const periodEnd = (await publicClient.readContract({
            address: counter, abi: USAGE_COUNTER_ABI, functionName: 'periodEnd', args: [BigInt(period)],
        })) as bigint;
        const now = (await publicClient.getBlock()).timestamp;
        const jump = Number(periodEnd - now) + 5;
        expect(jump, 'the period must still be open at this point').toBeGreaterThan(0);
        await fetch(RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'evm_increaseTime', params: [jump] }),
        });
        await fetch(RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'evm_mine', params: [] }),
        });
        expect(
            (await publicClient.readContract({
                address: counter, abi: USAGE_COUNTER_ABI, functionName: 'periodClosed', args: [period],
            })) as boolean,
            'the period must be closed once the chain is past its end',
        ).toBe(true);

        // ── The UI follows the chain: accruing → claimable ────────────────
        const quoted = (await publicClient.readContract({
            address: minter, abi: RPGF_MINTER_ABI, functionName: 'claimable',
            args: [period, AUTHOR, [artifact]],
        })) as bigint;
        expect(quoted, 'a closed period with recorded usage owes its author something').toBeGreaterThan(0n);

        await gotoAsWallet(page, AUTHOR, '/rewards?e2e=devnet');
        await expect(page.getByTestId(`tranche-status-${period}`)).toHaveText('claimable');
        const claimButton = page.getByTestId(`claim-${period}`);
        await expect(claimButton, 'a closed period offers the claim').toBeVisible();

        // ── Claim, and assert the florins actually arrive ─────────────────
        const florin = config.florinToken as Hex;
        const before = (await publicClient.readContract({
            address: florin, abi: ERC20_ABI, functionName: 'balanceOf', args: [AUTHOR],
        })) as bigint;

        await claimButton.click();
        await expect
            .poll(async () => (await publicClient.readContract({
                address: florin, abi: ERC20_ABI, functionName: 'balanceOf', args: [AUTHOR],
            })) as bigint, { timeout: 60_000, message: 'the claim must move real florins' })
            .toBeGreaterThan(before);

        const after = (await publicClient.readContract({
            address: florin, abi: ERC20_ABI, functionName: 'balanceOf', args: [AUTHOR],
        })) as bigint;
        expect(after - before, 'the payout matches what the minter quoted').toBe(quoted);
        await expect(page.getByTestId(`tranche-status-${period}`)).toHaveText('claimed');

        test.info().annotations.push({
            type: 'RpgfClaim',
            description: `artifact=${USED_CLAUSE} period=${period} c=${c} d=${d} score=${score} paid=${after - before}`,
        });
    });
});
