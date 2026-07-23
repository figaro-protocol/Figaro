/**
 * match-round.devnet.spec.ts
 *
 * A crowd-steered match round, end to end and UI on both ends, on /rounds.
 * Two scenarios — each deploys its OWN round (a fresh DonationRail + a fresh
 * OptimisticMatchPool), so the formula's event scan is isolated and the
 * specs never cross-contaminate through the shared genesis rail:
 *
 *   1. THE VALUE ROUND-TRIP — the phase-one rehearsal. The DAO treasury (the
 *      2-of-3 MockTreasuryMultisig) funds the match in florins through a
 *      real propose/approve/execute (money leg #1: treasury → pool). Two
 *      donors steer the match toward one recipient (surplus-form QF: two
 *      floor-clearing donors give a positive score; the sole recipient caps
 *      at the 15% water-fill). The poster drives the UI: compute + post →
 *      wait out the challenge window → finalize; the recipient claims
 *      (money leg #2: pool → recipient, EXACTLY 15% of the funded budget,
 *      asserted from the chain).
 *
 *   2. THE DONATE SURFACE — a donation driven through the donate-card: the
 *      donor fills recipient + amount and submits (approve + donate through
 *      the rail). Action → reaction, both in the UI: the recipient's balance
 *      rises on-chain AND the round card's donation summary increments.
 *
 * The round address is an open-world id — there is no round registry; the
 * spec deploys a pool and opens /rounds?pool=<address>, exactly as a real
 * round's announcement would link it.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createWalletClient, encodeFunctionData, http, keccak256, parseAbi, parseEther, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { localPublicClient, readLocalDeploymentConfig, LOCAL_ANVIL, RPC_URL } from './devnet-helpers';
import { ANVIL_ACCOUNTS, ANVIL_KEYS } from '../anvilAccounts';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Page } from '@playwright/test';

const ERC20_ABI = parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function approve(address, uint256) returns (bool)',
    'function transfer(address, uint256) returns (bool)',
]);

const RAIL_ABI = parseAbi(['function donate(address token, address recipient, uint256 amount) external']);

const TREASURY_ABI = parseAbi([
    'function nonce() view returns (uint256)',
    'function transactionHash(address to, uint256 value, bytes data, uint256 nonce) view returns (bytes32)',
    'function propose(address to, uint256 value, bytes data) returns (bytes32)',
    'function approveHash(bytes32 txHash) external',
    'function execute(address to, uint256 value, bytes data, uint256 nonce) external',
]);

// Foundry artifacts — the round's two contracts are deployed per run (a round
// is emergent from its deployment, not a genesis singleton).
const REPO_ROOT = resolve(__dirname, '../../..');
const RAIL_ARTIFACT = JSON.parse(readFileSync(resolve(REPO_ROOT, 'out/DonationRail.sol/DonationRail.json'), 'utf8'));
const POOL_ARTIFACT = JSON.parse(
    readFileSync(resolve(REPO_ROOT, 'out/OptimisticMatchPool.sol/OptimisticMatchPool.json'), 'utf8'),
);
// The anchored formula hash = keccak256 of the canonical spec's exact bytes,
// the same anchor a real round posts (the UI recompute uses the SDK mirror).
const FORMULA_HASH = keccak256(new Uint8Array(readFileSync(resolve(REPO_ROOT, 'sdk/src/match/formula.json'))));

const BOND = parseEther('0.05');
const CHALLENGE_WINDOW = 20n;
const DISPUTE_WINDOW = 20n;

// Dedicated wallets (no other spec drives these): treasury owners are anvil
// [0..2]; rpgf claims [16..19]. This spec uses [10..15].
const DONOR_A = ANVIL_KEYS[32];
const DONOR_B = ANVIL_KEYS[33];
const RECIPIENT = ANVIL_ACCOUNTS[12] as Hex;
const POSTER = ANVIL_ACCOUNTS[14] as Hex;
const DEPLOYER_KEY = ANVIL_KEYS[15];
const TREASURY_OWNER_A = ANVIL_KEYS[0];
const TREASURY_OWNER_B = ANVIL_KEYS[1];

function walletFor(key: Hex) {
    return createWalletClient({ account: privateKeyToAccount(key), chain: LOCAL_ANVIL, transport: http(RPC_URL) });
}

/** Anvil mines on transactions only; after a wall-clock wait the LATEST
 *  block's timestamp still predates a window's end. Mining one block is the
 *  devnet stand-in for mainnet's natural cadence — never a state rollback. */
async function mineBlock(publicClient: ReturnType<typeof localPublicClient>) {
    await (publicClient as unknown as { request: (a: { method: string; params: [] }) => Promise<unknown> }).request({
        method: 'evm_mine',
        params: [],
    });
}

async function deployRound(
    publicClient: ReturnType<typeof localPublicClient>,
    opts: { matchToken: Hex; donationToken: Hex; arbitrator: Hex; donationWindowSeconds: bigint },
): Promise<{ rail: Hex; pool: Hex }> {
    const deployer = walletFor(DEPLOYER_KEY);
    const railHash = await deployer.deployContract({
        abi: RAIL_ARTIFACT.abi,
        bytecode: RAIL_ARTIFACT.bytecode.object as Hex,
        args: [],
    });
    const rail = (await publicClient.waitForTransactionReceipt({ hash: railHash })).contractAddress as Hex;

    const now = (await publicClient.getBlock({ blockTag: 'latest' })).timestamp;
    const poolHash = await deployer.deployContract({
        abi: POOL_ARTIFACT.abi,
        bytecode: POOL_ARTIFACT.bytecode.object as Hex,
        args: [
            opts.matchToken,
            opts.donationToken,
            rail,
            FORMULA_HASH,
            opts.arbitrator,
            BOND,
            CHALLENGE_WINDOW,
            DISPUTE_WINDOW,
            now,
            now + opts.donationWindowSeconds,
        ],
    });
    const pool = (await publicClient.waitForTransactionReceipt({ hash: poolHash })).contractAddress as Hex;
    return { rail, pool };
}

/** The DAO treasury funds the match in florins through the 2-of-3 multisig —
 *  the phase-one act, exactly: propose (owner A) → approveHash (owner B) →
 *  execute. The treasury never signs a kernel commitment; here it only moves
 *  its own florins by ordinary transfer. */
async function treasuryFundsPool(
    publicClient: ReturnType<typeof localPublicClient>,
    treasury: Hex,
    florin: Hex,
    pool: Hex,
    amount: bigint,
) {
    const data = encodeFunctionData({ abi: ERC20_ABI, functionName: 'transfer', args: [pool, amount] });
    const txNonce = (await publicClient.readContract({
        address: treasury,
        abi: TREASURY_ABI,
        functionName: 'nonce',
    })) as bigint;
    const txHash = (await publicClient.readContract({
        address: treasury,
        abi: TREASURY_ABI,
        functionName: 'transactionHash',
        args: [florin, 0n, data, txNonce],
    })) as Hex;

    const proposeHash = await walletFor(TREASURY_OWNER_A).writeContract({
        address: treasury,
        abi: TREASURY_ABI,
        functionName: 'propose',
        args: [florin, 0n, data],
    });
    await publicClient.waitForTransactionReceipt({ hash: proposeHash });

    const approveHash = await walletFor(TREASURY_OWNER_B).writeContract({
        address: treasury,
        abi: TREASURY_ABI,
        functionName: 'approveHash',
        args: [txHash],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });

    const execHash = await walletFor(TREASURY_OWNER_A).writeContract({
        address: treasury,
        abi: TREASURY_ABI,
        functionName: 'execute',
        args: [florin, 0n, data, txNonce],
    });
    await publicClient.waitForTransactionReceipt({ hash: execHash });
}

async function donate(
    publicClient: ReturnType<typeof localPublicClient>,
    donorKey: Hex,
    rail: Hex,
    token: Hex,
    recipient: Hex,
    amount: bigint,
) {
    const donor = walletFor(donorKey);
    // Donors are DEDICATED indices (32/33) past Deploy.s.sol's mint range
    // (anvil[0..19]), so they hold no donation token — mint what they'll
    // donate (permissionless MockERC20.mint; the donor has ETH for gas from
    // anvil's launch funding).
    const mint = await donor.writeContract({
        address: token,
        abi: parseAbi(['function mint(address to, uint256 amount) external']),
        functionName: 'mint',
        args: [donor.account.address, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash: mint });
    const approve = await donor.writeContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [rail, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash: approve });
    const hash = await donor.writeContract({
        address: rail,
        abi: RAIL_ABI,
        functionName: 'donate',
        args: [token, recipient, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash });
}

async function waitConnected(page: Page) {
    await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
        null,
        { timeout: 30000 },
    );
}

const ONE = parseEther('1'); // the donation token is 18-decimals here

test.describe('match round — donate / post / finalize / claim (devnet)', () => {
    test.setTimeout(300_000);

    test('the value round-trip: treasury funds florins, donors steer, the recipient claims the 15% cap', async ({
        page,
    }) => {
        const config = readLocalDeploymentConfig();
        const florin = config.florinToken as Hex;
        const donationToken = config.tokenAddress as Hex; // the devnet MockERC20 (18 decimals)
        const treasury = config.daoTreasury as Hex;
        const arbitrator = config.rpgfArbitrator as Hex;
        expect(florin && donationToken && treasury && arbitrator, 'genesis addresses present').toBeTruthy();
        const publicClient = localPublicClient();

        // A short donation window: the donations land via viem in ~2s, then it
        // closes so the poster can post. (The donate-card UI itself is scenario 2.)
        const { rail, pool } = await deployRound(publicClient, {
            matchToken: florin,
            donationToken,
            arbitrator,
            donationWindowSeconds: 12n,
        });

        // ── Money leg #1: the DAO treasury funds the match in florins ──
        const MATCH_AMOUNT = parseEther('1000');
        const expectedAllocation = (MATCH_AMOUNT * 15n) / 100n; // sole recipient → the 15% cap binds
        await treasuryFundsPool(publicClient, treasury, florin, pool, MATCH_AMOUNT);
        const balanceOfFlorin = (who: Hex) =>
            publicClient.readContract({ address: florin, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;
        expect(await balanceOfFlorin(pool), 'the treasury funded the pool in florins').toBe(MATCH_AMOUNT);

        // ── Two floor-clearing donors steer the match to one recipient,
        //    through THIS round's rail (isolated from every other spec) ──
        await donate(publicClient, DONOR_A, rail, donationToken, RECIPIENT, 4n * ONE);
        await donate(publicClient, DONOR_B, rail, donationToken, RECIPIENT, 4n * ONE);

        // ── Wait out the donation window, then the poster drives the UI ──
        await page.waitForTimeout(13_000);
        await mineBlock(publicClient);

        const recipientFlorinBefore = await balanceOfFlorin(RECIPIENT);
        await gotoAsWallet(page, POSTER, `/rounds?pool=${pool}&e2e=devnet`);
        await page.getByTestId('round-page').waitFor({ timeout: 30000 });
        await waitConnected(page);
        await expect(page.getByTestId('round-status'), 'window closed → awaiting a root').toHaveText('awaiting root', {
            timeout: 60000,
        });
        await expect(page.getByTestId('round-donations')).toContainText('2 donations');

        await page.getByTestId('post-root').click();
        await expect(page.getByTestId('round-status')).toHaveText('posted', { timeout: 60000 });

        // ── Wait out the challenge window, then finalize ──
        await page.waitForTimeout(Number(CHALLENGE_WINDOW) * 1000 + 2000);
        await mineBlock(publicClient);
        await page.getByTestId('finalize').click();
        await expect(page.getByTestId('round-status'), 'unchallenged → finalized').toHaveText('finalized', {
            timeout: 60000,
        });

        // ── Money leg #2: the recipient claims exactly the 15% cap ──
        await gotoAsWallet(page, RECIPIENT, `/rounds?pool=${pool}&e2e=devnet`);
        await page.getByTestId('round-page').waitFor({ timeout: 30000 });
        await waitConnected(page);
        await page.getByTestId('claim').click();
        await expect
            .poll(async () => (await balanceOfFlorin(RECIPIENT)) - recipientFlorinBefore, {
                timeout: 60000,
                message: 'the claim pays the recipient exactly 15% of the funded budget in florins',
            })
            .toBe(expectedAllocation);

        test.info().annotations.push({
            type: 'MatchRound',
            description: `pool=${pool} recipient=${RECIPIENT} allocation=${expectedAllocation} (15% of ${MATCH_AMOUNT})`,
        });
    });

    test('the donate surface: a UI donation reaches the recipient and shows in the round', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const florin = config.florinToken as Hex;
        const donationToken = config.tokenAddress as Hex;
        const arbitrator = config.rpgfArbitrator as Hex;
        const publicClient = localPublicClient();

        // A long donation window so the donate-card stays open through the UI
        // interaction. No match funding needed — the donate path never touches
        // the match token.
        const { pool } = await deployRound(publicClient, {
            matchToken: florin,
            donationToken,
            arbitrator,
            donationWindowSeconds: 600n,
        });

        const balanceOfToken = (who: Hex) =>
            publicClient.readContract({ address: donationToken, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;
        const recipientBefore = await balanceOfToken(RECIPIENT);

        // The UI donor (DONOR_A / index 32) is past the deploy-mint range — mint
        // it the donation token so the UI donate (5) has balance to approve+send.
        {
            const donor = walletFor(DONOR_A);
            const h = await donor.writeContract({
                address: donationToken, abi: parseAbi(['function mint(address to, uint256 amount) external']),
                functionName: 'mint', args: [donor.account.address, parseEther('1000')],
            });
            await publicClient.waitForTransactionReceipt({ hash: h });
        }

        await gotoAsWallet(page, ANVIL_ACCOUNTS[32] as Hex, `/rounds?pool=${pool}&e2e=devnet`);
        await page.getByTestId('round-page').waitFor({ timeout: 30000 });
        await waitConnected(page);
        await expect(page.getByTestId('round-donations'), 'starts empty').toContainText('0 donations');

        await page.getByTestId('donate-recipient').fill(RECIPIENT);
        await page.getByTestId('donate-amount').fill('5');
        await page.getByTestId('donate-submit').click();

        // Action → reaction, both in the UI: the recipient's on-chain balance
        // rises, AND the round card's donation summary increments.
        await expect
            .poll(async () => (await balanceOfToken(RECIPIENT)) - recipientBefore, {
                timeout: 60000,
                message: 'the UI donation reached the recipient in full',
            })
            .toBe(5n * ONE);
        await expect(page.getByTestId('round-donations'), 'the round reflects the new donation').toContainText(
            '1 donation',
            { timeout: 60000 },
        );
    });
});
