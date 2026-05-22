/**
 * assemblies-inventory.devnet.spec.ts
 *
 * Smoke for the marketing `/assemblies` inventory. The page reads
 * `AssemblyRegistry.AssemblyRegistered` events through the standalone
 * viem `publicClient` via `useAssemblyChoices` — the same composition
 * the operator profile and the designer's PublishedList consume. Each
 * row's identity (slug, author, content hash) is on-chain; the manifest
 * (name, order count, schemas) fetches lazily from IPFS per row.
 *
 * The spec registers one fresh assembly via viem directly (faster than
 * the UI publish flow and self-contained) with a fake IPFS URI on
 * purpose. The manifest fetch will fail and the row will render in
 * "error" state — slug-as-name with a "Manifest unavailable" hint —
 * which is still a row keyed on `#assembly-<slug>`. Its existence
 * proves the marketing-tier event read fired and matched.
 *
 * Smoke, not a scenario: catches the marketing-tier event read breaking
 * or the row id pattern drifting. The contract path itself is covered
 * by `assembly-registry.devnet.spec.ts`.
 *
 * Requires Anvil + ./deploy-local.sh.
 */
import { test, expect } from '@playwright/test';
import {
    createPublicClient,
    createWalletClient,
    defineChain,
    http,
    keccak256,
    parseAbi,
    parseEther,
    toHex,
    type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { evmRevert, evmSnapshot, readLocalDeploymentConfig } from './devnet-helpers';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const AUTHOR_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const REGISTRATION_DEPOSIT = parseEther('0.001');
const ASSEMBLY_REGISTRY_ABI = parseAbi([
    'function registerAssembly(string slug, bytes32 contentHash, string metadataURI) external payable',
]);

function getRegistryAddress(): Hex {
    const config = readLocalDeploymentConfig();
    const addr = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY
        ?? config.assemblyRegistry
        ?? '') as Hex;
    if (!addr || addr.length !== 42) {
        throw new Error('NEXT_PUBLIC_ASSEMBLY_REGISTRY not set — run ./deploy-local.sh');
    }
    return addr;
}

async function registerAssembly(slug: string, metadataURI: string): Promise<void> {
    const registry = getRegistryAddress();
    const author = privateKeyToAccount(AUTHOR_KEY);
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const authorClient = createWalletClient({
        account: author,
        chain: LOCAL_ANVIL,
        transport: http(RPC_URL),
    });
    const contentHash = keccak256(toHex(`content-${slug}`));
    const { request } = await publicClient.simulateContract({
        account: author.address,
        address: registry,
        abi: ASSEMBLY_REGISTRY_ABI,
        functionName: 'registerAssembly',
        args: [slug, contentHash, metadataURI],
        value: REGISTRATION_DEPOSIT,
    });
    await publicClient.waitForTransactionReceipt({
        hash: await authorClient.writeContract(request),
    });
}

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('Assemblies marketing inventory (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    test('renders a newly-published assembly from on-chain events', async ({ page }) => {
        const slug = `inventory-smoke-${Date.now()}`;
        const metadataURI = `ipfs://smoke-${slug}`;
        await registerAssembly(slug, metadataURI);

        await page.goto('/assemblies');

        // Row id pattern is `#assembly-<slug>` per AssemblyInventory.
        const row = page.locator(`#assembly-${slug}`);
        await expect(row).toBeVisible({ timeout: 15_000 });
        // Slug appears in the row twice: as the fallback name (manifest
        // failed to fetch so `name = event.slug`) and as the monospace
        // code element. Either match counts.
        await expect(row).toContainText(slug);
    });
});
