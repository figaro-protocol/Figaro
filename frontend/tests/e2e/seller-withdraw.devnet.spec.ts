/**
 * seller-withdraw.devnet.spec.ts
 *
 * SellerRegistry.withdraw — the reclaim path on the staked-intent
 * deposit (devnet deploy: `new SellerRegistry(0.001 ether)`). No time
 * lock (K4): withdraw is allowed at any time; the round-trip is priced
 * by de-surfacing — a withdrawn seller vanishes from discovery.
 *
 * `sellers-onboarding.devnet.spec.ts` covers the register path; this
 * spec covers the matching withdraw path: register → /sellers dashboard
 * → click Begin → Confirm withdraw → receipt rendered → registration
 * cleared.
 *
 * Requires: Anvil + ./deploy-local.sh
 *   NEXT_PUBLIC_SELLER_REGISTRY must be set in .env.local.
 */
import { test, expect, gotoAsWallet, ANVIL_ACCOUNTS } from './devnet-multi-test';
import {
    createPublicClient,
    defineChain,
    http,
    parseAbi,
    type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    readLocalDeploymentConfig,
    seedRegisteredSeller,
} from './devnet-helpers';
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
// anvil[3] — a wallet DEDICATED to this spec: it ends each run WITHDRAWN,
// which would sabotage any spec that keeps its wallet persistently
// registered (anvil[0] is seller-edit-ui's, anvil[1] place-order's).
const SELLER_KEY = ANVIL_KEYS[3];
const SELLER_ADDR = ANVIL_ACCOUNTS[3];

const SELLER_REGISTRY_ABI = parseAbi([
    'function register(string metadataURI) external payable',
    'function withdraw() external',
    'function registrationDeposit() view returns (uint256)',
    // SellerRegistry exposes NO read functions for registration state —
    // off-chain consumers reconstruct it from these three events. The
    // tests below count Registered − Withdrawn events for the address;
    // > 0 == currently registered.
    'event SellerRegistered(address indexed seller, string metadataURI)',
    'event SellerProfileUpdated(address indexed seller, string metadataURI)',
    'event SellerWithdrawn(address indexed seller, uint256 deposit)',
    'error AlreadyRegistered()',
    'error InsufficientDeposit()',
    'error NotRegistered()',
]);

function getRegistryAddress(): Hex {
    const config = readLocalDeploymentConfig();
    const addr = (process.env.NEXT_PUBLIC_SELLER_REGISTRY
        ?? config.sellerRegistry
        ?? '') as Hex;
    if (!addr || addr.length !== 42) {
        throw new Error('NEXT_PUBLIC_SELLER_REGISTRY not set — run ./deploy-local.sh');
    }
    return addr;
}

async function isRegistered(): Promise<boolean> {
    const registry = getRegistryAddress();
    const seller = privateKeyToAccount(SELLER_KEY);
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const [registered, withdrawn] = await Promise.all([
        publicClient.getContractEvents({
            address: registry,
            abi: SELLER_REGISTRY_ABI,
            eventName: 'SellerRegistered',
            args: { seller: seller.address as Hex },
            fromBlock: 0n,
        }),
        publicClient.getContractEvents({
            address: registry,
            abi: SELLER_REGISTRY_ABI,
            eventName: 'SellerWithdrawn',
            args: { seller: seller.address as Hex },
            fromBlock: 0n,
        }),
    ]);
    return registered.length > withdrawn.length;
}


test.describe('SellerRegistry.withdraw (devnet)', () => {

    test('withdraw — UI clicks through, receipt renders, registration cleared', async ({ page }) => {
        // Canonical idempotent seeder: this wallet ends each run withdrawn,
        // so the helper's event-diff check (registrations vs withdrawals)
        // routes re-runs through `register`; a crashed run that left it
        // registered routes through `updateProfile` instead.
        await seedRegisteredSeller({
            walletKey: SELLER_KEY,
            profile: { name: 'Withdraw Spec Seller' },
        });

        // Hit /sellers — RegisteredCard renders when profileOf().registeredAt > 0,
        // showing the seeded (IPFS-pinned) profile; the WithdrawRow renders
        // alongside it.
        await gotoAsWallet(page, SELLER_ADDR, '/sellers?e2e=devnet');

        // Wait for the WithdrawRow's idle text — proves the dashboard
        // (not the welcome view) is on screen.
        const withdrawRow = page.getByText('Withdraw deposit').first();
        await withdrawRow.waitFor({ timeout: 30000 });

        // The idle row has a plain `<button>Begin</button>` inside the same <li>.
        const beginBtn = page.getByRole('button', { name: /^Begin$/ });
        await beginBtn.click();

        // Balance baseline: the registry escrows the deposit in ETH — the
        // withdraw must move exactly `registrationDeposit()` out of it. The
        // registry side is gas-free, so the delta is exact; the seller's own
        // ETH delta is deposit − gas, so it is not asserted.
        const registry = getRegistryAddress();
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const deposit = await publicClient.readContract({
            address: registry, abi: SELLER_REGISTRY_ABI, functionName: 'registrationDeposit',
        }) as bigint;
        const registryBefore = await publicClient.getBalance({ address: registry });

        // Confirm withdraw button appears.
        const confirmBtn = page.getByRole('button', { name: /^Confirm withdraw$/ });
        await confirmBtn.waitFor({ timeout: 10000 });
        await confirmBtn.click();

        // Receipt: "Withdrew 0.001 ETH." headline. Tx hash row visible.
        await expect(page.getByText(/Withdrew\s+0\.001\s+ETH/)).toBeVisible({ timeout: 30000 });
        await expect(page.getByText(/^Tx:\s+0x[0-9a-fA-F]+/)).toBeVisible();

        // On-chain: registration cleared (registeredAt === 0).
        expect(await isRegistered()).toBe(false);

        // On-chain: the deposit actually left the registry's escrow.
        const registryAfter = await publicClient.getBalance({ address: registry });
        expect(registryBefore - registryAfter, 'registry escrow decreased by exactly the deposit').toBe(deposit);
    });
});
