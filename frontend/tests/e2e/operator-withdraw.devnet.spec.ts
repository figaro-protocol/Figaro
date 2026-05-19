/**
 * operator-withdraw.devnet.spec.ts
 *
 * OperatorRegistry.withdraw — the reclaim path on the deposit + lock
 * primitive. Subject to a 365-day lock from `_registeredAt` (devnet
 * deploy: `new OperatorRegistry(0.001 ether, 365 days)`).
 *
 * `operators-onboarding.devnet.spec.ts` covers the register path; this
 * spec covers the matching withdraw path: register → time-travel past
 * lock → /operators dashboard → click Begin → Confirm withdraw →
 * receipt rendered → registration cleared.
 *
 * Premature withdraw is also asserted (revert with DepositLocked) so we
 * catch any regression that drops the lock-period guard.
 *
 * Requires: Anvil + ./deploy-local.sh
 *   NEXT_PUBLIC_OPERATOR_REGISTRY must be set in .env.local.
 */
import { test, expect } from './devnet-multi-test';
import {
    createPublicClient,
    createWalletClient,
    defineChain,
    http,
    parseAbi,
    parseEther,
    type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    evmIncreaseTime,
    evmRevert,
    evmSnapshot,
    readLocalDeploymentConfig,
} from './devnet-helpers';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

// Anvil[0] is the default e2e=devnet account (matches inject-ethereum-multi.js
// initial ACCOUNT). Using it keeps the page's auto-connect wallet aligned
// with the on-chain registration we seed below.
const OPERATOR_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;

const REGISTRATION_DEPOSIT = parseEther('0.001');
const LOCK_PERIOD_SECONDS = 365 * 24 * 60 * 60; // matches Deploy.s.sol

const OPERATOR_REGISTRY_ABI = parseAbi([
    'function register(string metadataURI) external payable',
    'function withdraw() external',
    'function registrationDeposit() view returns (uint256)',
    'function depositLockPeriod() view returns (uint64)',
    // OperatorRegistry exposes NO read functions for registration state —
    // off-chain consumers reconstruct it from these three events. The
    // tests below count Registered − Withdrawn events for the address;
    // > 0 == currently registered.
    'event OperatorRegistered(address indexed operator, string metadataURI)',
    'event OperatorProfileUpdated(address indexed operator, string metadataURI)',
    'event OperatorWithdrawn(address indexed operator, uint256 deposit)',
    'error AlreadyRegistered()',
    'error InsufficientDeposit()',
    'error NotRegistered()',
    'error DepositLocked()',
]);

function getRegistryAddress(): Hex {
    const config = readLocalDeploymentConfig();
    const addr = (process.env.NEXT_PUBLIC_OPERATOR_REGISTRY
        ?? config.operatorRegistry
        ?? '') as Hex;
    if (!addr || addr.length !== 42) {
        throw new Error('NEXT_PUBLIC_OPERATOR_REGISTRY not set — run ./deploy-local.sh');
    }
    return addr;
}

async function registerOperator(metadataURI: string): Promise<void> {
    const registry = getRegistryAddress();
    const operator = privateKeyToAccount(OPERATOR_KEY);
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const operatorClient = createWalletClient({ account: operator, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

    const { request } = await publicClient.simulateContract({
        account: operator.address,
        address: registry,
        abi: OPERATOR_REGISTRY_ABI,
        functionName: 'register',
        args: [metadataURI],
        value: REGISTRATION_DEPOSIT,
    });
    await publicClient.waitForTransactionReceipt({ hash: await operatorClient.writeContract(request) });
}

async function isRegistered(): Promise<boolean> {
    const registry = getRegistryAddress();
    const operator = privateKeyToAccount(OPERATOR_KEY);
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const [registered, withdrawn] = await Promise.all([
        publicClient.getContractEvents({
            address: registry,
            abi: OPERATOR_REGISTRY_ABI,
            eventName: 'OperatorRegistered',
            args: { operator: operator.address as Hex },
            fromBlock: 0n,
        }),
        publicClient.getContractEvents({
            address: registry,
            abi: OPERATOR_REGISTRY_ABI,
            eventName: 'OperatorWithdrawn',
            args: { operator: operator.address as Hex },
            fromBlock: 0n,
        }),
    ]);
    return registered.length > withdrawn.length;
}

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('OperatorRegistry.withdraw (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    test('withdraw before lock elapses reverts with DepositLocked', async () => {
        await registerOperator('ipfs://test-G9-locked');

        const registry = getRegistryAddress();
        const operator = privateKeyToAccount(OPERATOR_KEY);
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        await expect(
            publicClient.simulateContract({
                account: operator.address,
                address: registry,
                abi: OPERATOR_REGISTRY_ABI,
                functionName: 'withdraw',
            }),
        ).rejects.toThrow(/DepositLocked/);

        expect(await isRegistered()).toBe(true);
    });

    test('withdraw after lock elapses — UI clicks through, receipt renders, registration cleared', async ({ page }) => {
        await registerOperator('ipfs://test-G9-withdraw');
        await evmIncreaseTime(LOCK_PERIOD_SECONDS + 60);

        // Hit /operators — RegisteredCard renders when profileOf().registeredAt > 0.
        // The metadataURI ("ipfs://test-G9-withdraw") won't resolve to a real
        // profile JSON, so the dashboard will surface "Couldn't fetch profile
        // from IPFS" — that's fine; the WithdrawRow renders regardless.
        await page.goto('/operators?e2e=devnet', { waitUntil: 'load' });

        // Wait for the WithdrawRow's idle text — proves the dashboard
        // (not the welcome view) is on screen.
        const withdrawRow = page.getByText('Withdraw deposit').first();
        await withdrawRow.waitFor({ timeout: 30000 });

        // The idle row has a plain `<button>Begin</button>` inside the same <li>.
        const beginBtn = page.getByRole('button', { name: /^Begin$/ });
        await beginBtn.click();

        // Confirm withdraw button appears.
        const confirmBtn = page.getByRole('button', { name: /^Confirm withdraw$/ });
        await confirmBtn.waitFor({ timeout: 10000 });
        await confirmBtn.click();

        // Receipt: "Withdrew 0.001 ETH." headline. Tx hash row visible.
        await expect(page.getByText(/Withdrew\s+0\.001\s+ETH/)).toBeVisible({ timeout: 30000 });
        await expect(page.getByText(/^Tx:\s+0x[0-9a-fA-F]+/)).toBeVisible();

        // On-chain: registration cleared (registeredAt === 0).
        expect(await isRegistered()).toBe(false);
    });
});
