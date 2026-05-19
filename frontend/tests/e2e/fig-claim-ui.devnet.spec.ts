/**
 * fig-claim-ui.devnet.spec.ts
 *
 * Phase 4 C5 of the e2e remediation plan: UI coverage of /fig/claim.
 * The companion `fig-claim.devnet.spec.ts` exercises the RpgfMinter
 * contract path directly via viem; this spec exercises the same path
 * through ClaimPanel.tsx — fetch the static allocation file, render
 * the panel, click Claim FIG, await the receipt.
 *
 * UI is gated on a static `frontend/public/fig-claims-y{2,5,9}.json`
 * file that's a mainnet-generation artifact in production. The
 * Phase 0 helpers `writeFigClaimsFixture` / `clearFigClaimsFixture`
 * inject a transient fixture for the duration of a single test.
 *
 * Devnet fixture (mirrors Deploy.s.sol):
 *   - claimant = anvil[0] (multi-wallet default).
 *   - amount = 1 ether wei.
 *   - proof = []  (single-leaf tree: leaf == root, empty proof verifies).
 *
 * Requires Anvil + ./deploy-local.sh.
 */
import { test, expect, ANVIL_ACCOUNTS } from './devnet-multi-test';
import {
    createPublicClient,
    defineChain,
    http,
    parseAbi,
    parseEther,
    type Hex,
} from 'viem';
import {
    clearFigClaimsFixture,
    evmRevert,
    evmSnapshot,
    writeFigClaimsFixture,
} from './devnet-helpers';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

const CLAIM_AMOUNT = parseEther('1');

const AIRDROP_ABI = parseAbi([
    'function claimed(uint8, address) view returns (bool)',
    'event Claimed(uint8 indexed stageIndex, address indexed account, uint256 amount)',
]);

const FIG_TOKEN_ABI = parseAbi([
    'function balanceOf(address) view returns (uint256)',
]);

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('/fig/claim UI (devnet)', () => {
    let testSnapshot: string;

    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => {
        if (testSnapshot) await evmRevert(testSnapshot);
        await clearFigClaimsFixture(0);
    });

    // Auto-connect + IPFS + on-chain tx pushes this past 60s.
    test.setTimeout(120_000);

    test('ClaimPanel → click Claim FIG → Claimed event emits and balance increases', async ({ page }) => {
        const claimant = ANVIL_ACCOUNTS[0] as Hex;
        const airdrop = (process.env.NEXT_PUBLIC_RPGF_MINTER ?? '') as Hex;
        const fig = (process.env.NEXT_PUBLIC_FIG_TOKEN_ADDRESS ?? '') as Hex;
        if (!airdrop || airdrop.length !== 42) {
            throw new Error('NEXT_PUBLIC_RPGF_MINTER not set — re-run ./deploy-local.sh');
        }
        if (!fig || fig.length !== 42) {
            throw new Error('NEXT_PUBLIC_FIG_TOKEN_ADDRESS not set');
        }

        // Seed the static allocation file ClaimPanel.tsx reads at mount.
        // Single-leaf tree → empty proof; leaf is keccak(addr || amount)
        // and the deploy script wrote root := leaf, so MerkleProof.verify
        // ([], root, leaf) == true.
        await writeFigClaimsFixture(0, {
            [claimant.toLowerCase()]: {
                amount: CLAIM_AMOUNT.toString(),
                proof: [],
            },
        });

        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceBefore = await publicClient.readContract({
            address: fig, abi: FIG_TOKEN_ABI,
            functionName: 'balanceOf', args: [claimant],
        });
        const claimedBefore = await publicClient.readContract({
            address: airdrop, abi: AIRDROP_ABI,
            functionName: 'claimed', args: [0, claimant],
        });
        expect(claimedBefore).toBe(false);

        await page.goto('/fig/claim?e2e=devnet', { waitUntil: 'domcontentloaded' });

        // Wait for ClientInit's devnet auto-connect to drop the
        // Connect Wallet button — the panel renders "Connect your
        // wallet to check your claim." until isConnected flips true.
        await page.waitForFunction(
            () => {
                const buttons = Array.from(document.querySelectorAll('button'));
                return !buttons.some((b) => b.textContent?.trim() === 'Connect Wallet');
            },
            null,
            { timeout: 30000 },
        );

        // Panel header confirms the allocation lookup hit. If the fetch
        // misses, the panel renders "No FIG allocation found for this
        // address ..." and the Claim FIG button is absent.
        await expect(page.getByText(/FIG Claim — Year 2 \(30%\)/)).toBeVisible({ timeout: 15000 });
        await expect(page.getByText(`Amount: ${CLAIM_AMOUNT.toString()}`)).toBeVisible();

        const claimButton = page.getByRole('button', { name: 'Claim FIG' });
        await expect(claimButton).toBeVisible({ timeout: 10000 });
        await claimButton.click();

        // "Claim successful!" is the terminal txStatus on the happy
        // path (ClaimPanel.tsx:83). Allow a generous timeout for the
        // simulate + write + wait-for-receipt round trip.
        await expect(page.getByText(/Claim successful!/)).toBeVisible({ timeout: 60000 });
        await expect(page.getByText(/Status:\s*Claimed/)).toBeVisible({ timeout: 5000 });

        // On-chain assertions — Claimed event + balance delta + flag.
        const balanceAfter = await publicClient.readContract({
            address: fig, abi: FIG_TOKEN_ABI,
            functionName: 'balanceOf', args: [claimant],
        });
        expect(balanceAfter - balanceBefore).toBe(CLAIM_AMOUNT);

        const claimedAfter = await publicClient.readContract({
            address: airdrop, abi: AIRDROP_ABI,
            functionName: 'claimed', args: [0, claimant],
        });
        expect(claimedAfter).toBe(true);

        const events = await publicClient.getContractEvents({
            address: airdrop, abi: AIRDROP_ABI,
            eventName: 'Claimed',
            args: { stageIndex: 0, account: claimant },
            fromBlock: 0n,
        });
        expect(events.length).toBe(1);
        expect(events[0].args.amount).toBe(CLAIM_AMOUNT);
    });

    test('no allocation file → panel renders "No FIG allocation found" and no Claim button', async ({ page }) => {
        // No writeFigClaimsFixture call — fetch returns null.
        await page.goto('/fig/claim?e2e=devnet', { waitUntil: 'domcontentloaded' });

        await page.waitForFunction(
            () => {
                const buttons = Array.from(document.querySelectorAll('button'));
                return !buttons.some((b) => b.textContent?.trim() === 'Connect Wallet');
            },
            null,
            { timeout: 30000 },
        );

        await expect(
            page.getByText(/No FIG allocation found for this address at Year 2 \(30%\)\./),
        ).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('button', { name: 'Claim FIG' })).toHaveCount(0);
    });
});
