/**
 * rpgf-rewards.devnet.spec.ts
 *
 * The RPGF distribution's runtime surface at /rewards, against the
 * count-it-when-it-happens design: `UsageCounter` records verified usage of a
 * clause or assembly at the moment a process settles, accrual buckets into
 * fixed periods, and `RpgfMinter.claim` pays a closed period's budget UNIFORM
 * pro rata (no cap), to live-staked authors. There is no root to post, no bond,
 * no challenge and no forum, so this spec drives none of that.
 *
 * TIME IS COMPRESSED, NOT WARPED. `claim` gates on `UsageCounter.periodClosed`,
 * so the reward leg is undrivable against a schedule measured in years —
 * accrual would run and nothing could ever be claimed. `Deploy.s.sol` therefore
 * rehearses the ruled nine-period annual structure at 30-minute periods
 * (maintainer ruling 2026-07-27: "we can write the e2e test by compressing
 * time"). This spec records usage, advances the chain just past the open
 * period's own end, and claims — the same shape mainnet runs over years, at a
 * scale a test run can observe. Devnet is a mainnet REHEARSAL, not a sandbox.
 *
 * THE MINIMUM-SUPPORT FLOOR IS DRIVEN, NOT DODGED (ruled 2026-07-31). Devnet
 * deploys `minSellers = 3`, the mainnet value: a clause or assembly scores ZERO until
 * three distinct live-staked sellers carried it. The scenario settles the
 * clause through THREE sellers and asserts both halves — nothing scores below
 * the floor, and the full score springs when the third seller lands.
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
import { createWalletClient, http, parseAbi, parseEther, parseUnits, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    ATTESTATION_COORDINATOR_ABI,
    MEMBERS_REGISTRY_ABI,
    assertAgreementSignable,
    buildCommitment,
    buildDomain,
    buildSectionInclusionProof,
    calculateBonds,
    computeAgreementHash,
    computeClauseKey,
    generateSalt,
    sectionDataHash,
    type Agreement,
} from '@figaro-protocol/sdk';
import { localPublicClient, readLocalDeploymentConfig, LOCAL_ANVIL, RPC_URL } from './devnet-helpers';
import { ANVIL_ACCOUNTS, ANVIL_KEYS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';
import { specSource } from '@/lib/shared/clauseSpecSource';
import { RPGF_MINTER_ABI, USAGE_COUNTER_ABI } from "@figaro-protocol/sdk";
import { primeClauseSpecs } from '../lib/primeClauseSpecs';
import type { Page } from '@playwright/test';

const ERC20_ABI = parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function approve(address, uint256) returns (bool)',
    'function mint(address, uint256) returns ()',
]);

async function waitForConnected(page: Page) {
    await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
        null,
        { timeout: 30000 },
    );
}

// The author of record: populate-clauses registers every clause from anvil[0],
// so it is the registeredBy the minter would pay — and the wallet whose /rewards
// view shows the accrual.
const AUTHOR = ANVIL_ACCOUNTS[0] as Hex;
// Scenario-dedicated wallets: buyer anvil[18]; the three floor sellers are
// anvil[19] plus the spec-dedicated 34/35 (the accounts bump past 34 exists for
// them; past index 19 they carry launch ETH but no tokens, so the cycle
// self-mints their MOCK bond).
const TRADE_BUYER_KEY = ANVIL_KEYS[18];
const SELLER_KEYS = [ANVIL_KEYS[19], ANVIL_KEYS[34], ANVIL_KEYS[35]] as const;
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

        // Prime the Node-side spec cache (this process never loads the
        // browser's `useClauseSpecs` hook) so `assertAgreementSignable` below
        // can find the commerce clause's currency-as-content leaf.
        await primeClauseSpecs(['figaro-commerce', 'figaro-topology', USED_CLAUSE]);

        const publicClient = localPublicClient();
        const chainId = LOCAL_ANVIL.id;
        const clauseKey = computeClauseKey(USED_CLAUSE, USED_CLAUSE_VERSION);
        const period = (await publicClient.readContract({
            address: counter, abi: USAGE_COUNTER_ABI, functionName: 'currentPeriod',
        })) as number;

        const buyerAccount = privateKeyToAccount(TRADE_BUYER_KEY);
        const buyerWallet = createWalletClient({ account: buyerAccount, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const receipt = (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });
        const payment = parseEther('1');

        // ── One settle-and-record cycle for one seller (real protocol
        //    history, never mocks): live stake → signed agreement composing
        //    the clause → both bonds → commit → resolve → permissionless
        //    record. Factored because the minimum-support floor needs THREE
        //    distinct sellers before anything scores.
        async function settleAndRecord(sellerKey: Hex, attest: boolean) {
            const sellerAccount = privateKeyToAccount(sellerKey);
            const sellerWallet = createWalletClient({ account: sellerAccount, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

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
            const agreement: Agreement = {
                version: 'a1',
                buyer: buyerAccount.address,
                seller: sellerAccount.address,
                sections: [
                    { clause: 'figaro-topology', version: 1, data: { parentOrderHashes: [] } },
                    {
                        clause: 'figaro-commerce', version: 1,
                        data: {
                            currency: token,
                            payment: payment.toString(),
                            lineItems: [{ itemId: 'rpgf-e2e', name: 'RPGF e2e item', quantity: 1, unitPrice: payment.toString() }],
                        },
                    },
                    {
                        clause: USED_CLAUSE, version: USED_CLAUSE_VERSION,
                        data: { geocodeStandard: 'geohash', origin: 'u4pruy', destination: 'u4pruz' },
                    },
                ],
            };
            const agreementHash = computeAgreementHash(agreement);
            // THE MERKLE-LEAF SEAM (docs/CLAUSES.md § "Every clause is a merkle
            // leaf"): the commerce clause's currency and payment TERMS must
            // equal the commitment struct's mirrors BEFORE either party signs.
            assertAgreementSignable(agreement, agreementHash, specSource(), { currency: token, payment });

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
            // Sellers past index 19 hold launch ETH but no MOCK — self-mint the bond.
            const sellerFunds = (await publicClient.readContract({
                address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [sellerAccount.address],
            })) as bigint;
            if (sellerFunds < sellerBond) {
                await receipt(await sellerWallet.writeContract({
                    address: token, abi: ERC20_ABI, functionName: 'mint', args: [sellerAccount.address, sellerBond * 10n],
                }));
            }
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

            const section = agreement.sections.find((s) => s.clause === USED_CLAUSE)!;
            const { proof } = buildSectionInclusionProof(agreement, USED_CLAUSE);
            // Only the section FINGERPRINT reaches calldata — never the preimage.
            const sectionHash = sectionDataHash(section);

            // 4. The buyer attests the clause (evidence DURING the open process —
            //    the mirror-image gate to the one usage counting uses). Once is
            //    enough for the scenario; recording needs no attestation.
            if (attest) {
                await receipt(await buyerWallet.writeContract({
                    address: coordinator, abi: ATTESTATION_COORDINATOR_ABI, functionName: 'attestAsBuyer',
                    args: [commitment, clauseKey, 0, sectionHash, proof, sectionHash],
                }));
            }

            // 5. Resolve — usage is what a SETTLED process leaves behind.
            await receipt(await buyerWallet.writeContract({
                address: core, abi: CORE_ABI, functionName: 'resolveProcess', args: [processId, [commitment]],
            }));

            // 6. Record the usage. Permissionless — the proof is what is trusted,
            //    never the caller — and idempotent per (clause, process), once
            //    ever. The salt is fresh per run, so this is a new process and
            //    the record must SUCCEED.
            await receipt(await buyerWallet.writeContract({
                address: counter, abi: USAGE_COUNTER_ABI, functionName: 'recordClauseUsage',
                args: [commitment, clauseKey, sectionHash, proof],
            }));
        }

        const accrual = async () =>
            (await publicClient.readContract({
                address: counter, abi: USAGE_COUNTER_ABI, functionName: 'accrualOf', args: [clauseKey, period],
            })) as readonly [bigint, bigint, bigint];

        // ── The floor, both halves (ruled 2026-07-31) ─────────────────────
        const minSellers = (await publicClient.readContract({
            address: counter, abi: USAGE_COUNTER_ABI, functionName: 'minSellers',
        })) as bigint;
        expect(minSellers, 'devnet rehearses the mainnet floor').toBe(3n);

        // A fresh run starts below the floor; a re-run on a lived-in chain may
        // already be above it (records are once-ever per process, but earlier
        // runs left their sellers in this period's tally). Assert the floor
        // itself only when this run can observe it.
        const [, dBefore] = await accrual();
        await settleAndRecord(SELLER_KEYS[0], true);
        if (dBefore === 0n) {
            const [c1, d1, s1] = await accrual();
            expect(c1, 'the settled process was counted below the floor').toBeGreaterThan(0n);
            expect(d1, 'its seller was counted below the floor').toBe(1n);
            expect(s1, 'but nothing scores until the floor is met').toBe(0n);
        }
        await settleAndRecord(SELLER_KEYS[1], false);
        await settleAndRecord(SELLER_KEYS[2], false);

        const [c, d, score] = await accrual();
        expect(c, 'every settled process was counted').toBeGreaterThanOrEqual(3n);
        expect(d, 'three distinct staked sellers carried the clause').toBeGreaterThanOrEqual(minSellers);
        expect(score, 'the third seller springs the score').toBeGreaterThan(0n);

        // ── The UI reads it: the author of record opens /rewards ──────────
        await gotoAsWallet(page, AUTHOR, '/rewards?e2e=devnet');
        await page.getByTestId('rewards-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);

        const card = page.getByTestId(`period-card-${period}`);
        await card.waitFor({ timeout: 60000 });
        await expect(page.getByTestId(`period-accruals-${period}`), 'the author sees the clause they registered')
            .toContainText(USED_CLAUSE, { timeout: 60000 });
        await expect(page.getByTestId(`period-accruals-${period}`), 'with the counts the chain recorded')
            .toContainText(`score ${score.toString()}`);
        // The period total is the sum over EVERY clause and assembly that accrued in this
        // period, so it equals this clause's score only on a chain where
        // nothing else traded — which is never true inside the full suite (this
        // spec runs after ~28 others on the same chain). Assert the real
        // relationship instead: the divisor is present and is at least this
        // clause's share of it.
        const totalText = await page.getByTestId(`period-total-score-${period}`).innerText();
        const totalMatch = totalText.match(/period score across all clauses and assemblies:\s*(\d+)/);
        expect(totalMatch, `the period total renders (got: ${totalText})`).not.toBeNull();
        expect(
            BigInt(totalMatch![1]),
            'the period total it divides by covers this clause',
        ).toBeGreaterThanOrEqual(score);

        // ── The period is honestly ACCRUING: no claim is offered ─────────
        const periodClosed = (await publicClient.readContract({
            address: counter, abi: USAGE_COUNTER_ABI, functionName: 'periodClosed', args: [period],
        })) as boolean;
        expect(periodClosed, 'the period is still open immediately after recording').toBe(false);
        await expect(page.getByTestId(`period-status-${period}`)).toHaveText('accruing');
        await expect(page.getByTestId(`period-accruing-${period}`)).toBeVisible();
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
            args: [period, AUTHOR, [clauseKey]],
        })) as bigint;
        expect(quoted, 'a closed period with recorded usage owes its author something').toBeGreaterThan(0n);

        await gotoAsWallet(page, AUTHOR, '/rewards?e2e=devnet');
        await expect(page.getByTestId(`period-status-${period}`)).toHaveText('claimable');
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
        // The UI claims EVERY clause or assembly this wallet authored in the period, not the
        // single one quoted above (on devnet one wallet registers every clause, so
        // that is the whole period budget). Assert against what the UI actually PROMISED
        // the user — the claimable figure it rendered — which is the property that
        // matters: the number on screen is the number that moves.
        const promised = parseUnits(
            (await page.getByTestId(`period-claimable-${period}`).innerText())
                .replace(/[^0-9.]/g, ''),
            18,
        );
        expect(after - before, 'the payout matches what the UI promised').toBe(promised);
        expect(after - before, 'and covers the single-clause quote').toBeGreaterThanOrEqual(quoted);
        await expect(page.getByTestId(`period-status-${period}`)).toHaveText('claimed');

        test.info().annotations.push({
            type: 'RpgfClaim',
            description: `clause=${USED_CLAUSE} period=${period} c=${c} d=${d} score=${score} paid=${after - before}`,
        });
    });
});
