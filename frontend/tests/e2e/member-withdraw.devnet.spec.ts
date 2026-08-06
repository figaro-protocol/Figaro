/**
 * member-withdraw.devnet.spec.ts
 *
 * MembersRegistry's reclaim path on the staked-intent deposit, which is TWO
 * steps and this spec drives both through the UI:
 *
 *   requestWithdrawal()  de-surfaces IMMEDIATELY — the guard clears, discovery
 *                        drops the member, re-registration is allowed at once
 *   withdraw()           releases the ETH, once `withdrawalCooldown` has passed
 *
 * The split is the anti-rage-quit mechanism: a deposit reclaimable the instant
 * you left would price nothing, because one deposit would serve identity after
 * identity. Devnet deploys cooldown 0 (`new MembersRegistry(0.001 ether, 0)`)
 * so both steps run in one test without warping a chain the frontend shares;
 * the cooldown's own behaviour is covered in Foundry against a non-zero value.
 *
 * `members-onboarding.devnet.spec.ts` covers the register path; this covers
 * leave → claim: /sellers dashboard → Begin → Confirm and leave → receipt →
 * Continue → pending-deposit notice → Claim deposit → ETH actually moves.
 *
 * Requires: Anvil + ./deploy-local.sh
 *   NEXT_PUBLIC_MEMBERS_REGISTRY must be set in .env.local.
 */
import { test, expect, gotoAsWallet, ANVIL_ACCOUNTS } from './devnet-multi-test';
import {
    createPublicClient,
    defineChain,
    http,
    type Hex,
} from 'viem';
import {
    readLocalDeploymentConfig,
    seedRegisteredMember,
} from './devnet-helpers';
import { MEMBERS_REGISTRY_ABI } from '@figaro/sdk';
import { ANVIL_KEYS } from '../anvilAccounts';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

// gotoAsWallet connects the page as the dedicated anvil[3] wallet
// with the on-chain registration we seed below.
// anvil[3] — a wallet DEDICATED to this spec: it ends each run de-surfaced,
// which would sabotage any spec that keeps its wallet persistently
// registered (anvil[0] is seller-edit-ui's, anvil[1] place-order's).
const SELLER_KEY = ANVIL_KEYS[3];
const SELLER_ADDR = ANVIL_ACCOUNTS[3];

function getRegistryAddress(): Hex {
    const config = readLocalDeploymentConfig();
    const addr = (process.env.NEXT_PUBLIC_MEMBERS_REGISTRY
        ?? config.membersRegistry
        ?? '') as Hex;
    if (!addr || addr.length !== 42) {
        throw new Error('NEXT_PUBLIC_MEMBERS_REGISTRY not set — run ./deploy-local.sh');
    }
    return addr;
}

const publicClient = () => createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

/** The live-stake guard the RPGF path reads — true only while surfaced. */
async function isSurfaced(): Promise<boolean> {
    return await publicClient().readContract({
        address: getRegistryAddress(),
        abi: MEMBERS_REGISTRY_ABI,
        functionName: 'registered',
        args: [SELLER_ADDR as Hex],
    }) as boolean;
}

test.describe('MembersRegistry leave + claim (devnet)', () => {

    test('leaving de-surfaces at once; the deposit is claimed separately', async ({ page }) => {
        // Canonical idempotent seeder: this wallet ends each run de-surfaced,
        // so the helper's event-diff check routes re-runs through `register`;
        // a crashed run that left it registered routes through `updateProfile`.
        await seedRegisteredMember({
            walletKey: SELLER_KEY,
            profile: { name: 'Withdraw Spec Seller' },
        });

        await gotoAsWallet(page, SELLER_ADDR, '/members?e2e=devnet');

        // The idle row's text proves the dashboard (not the welcome view) is up.
        await page.getByText('Leave the registry').first().waitFor({ timeout: 30000 });
        await page.getByRole('button', { name: /^Begin$/ }).click();

        const registry = getRegistryAddress();
        const client = publicClient();
        const deposit = await client.readContract({
            address: registry, abi: MEMBERS_REGISTRY_ABI, functionName: 'registrationDeposit',
        }) as bigint;
        const registryBefore = await client.getBalance({ address: registry });
        const pendingBefore = (await client.readContract({
            address: registry, abi: MEMBERS_REGISTRY_ABI,
            functionName: 'pendingDeposit', args: [SELLER_ADDR as Hex],
        })) as bigint;

        expect(await isSurfaced(), 'surfaced before leaving').toBe(true);

        // ── Step 1: leave ────────────────────────────────────────────────
        const confirmBtn = page.getByRole('button', { name: /^Confirm and leave$/ });
        await confirmBtn.waitFor({ timeout: 10000 });
        await confirmBtn.click();

        await expect(page.getByText(/You have left the registry/)).toBeVisible({ timeout: 30000 });
        await expect(page.getByText(/^Tx:\s+0x[0-9a-fA-F]+/)).toBeVisible();

        // De-surfaced IMMEDIATELY — this is what ends discovery and RPGF
        // eligibility, and it happens while the ETH is still held.
        expect(await isSurfaced(), 'de-surfaced at request, not at claim').toBe(false);
        expect(
            await client.getBalance({ address: registry }),
            'the deposit has NOT moved yet — leaving is not being paid',
        ).toBe(registryBefore);
        // DELTA, not absolute: a prior run that left a request unclaimed leaves a
        // balance behind (requests accumulate by design), so an absolute assert
        // would fail on a re-used chain for the wrong reason.
        expect(
            (await client.readContract({
                address: registry, abi: MEMBERS_REGISTRY_ABI,
                functionName: 'pendingDeposit', args: [SELLER_ADDR as Hex],
            })) as bigint - pendingBefore,
            'exactly this registration\'s deposit became pending',
        ).toBe(deposit);

        // ── Step 2: claim ────────────────────────────────────────────────
        // Dismissing the receipt drops the wallet to the unregistered view —
        // where the pending-deposit notice must still be reachable, or the ETH
        // would be stranded behind a screen this wallet can no longer see.
        await page.getByRole('button', { name: /^Continue$/ }).click();

        const claimBtn = page.getByRole('button', { name: /^Claim deposit$/ });
        await claimBtn.waitFor({ timeout: 30000 });
        await expect(claimBtn).toBeEnabled(); // devnet cooldown is 0
        await claimBtn.click();

        await expect
            .poll(async () => (await client.getBalance({ address: registry })).toString(), { timeout: 30000 })
            .toBe((registryBefore - deposit).toString());
    });
});
