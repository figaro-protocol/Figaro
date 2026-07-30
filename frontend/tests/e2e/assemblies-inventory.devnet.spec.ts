/**
 * assemblies-inventory.devnet.spec.ts
 *
 * Smoke for the marketing `/assemblies` inventory. The page reads
 * `AssemblyRegistry.AssemblyRegistered` events through the standalone
 * viem `publicClient` via `useAssemblyChoices` — the same composition
 * the member profile and the designer's PublishedList consume. Each
 * row's identity (slug, author, content hash) is on-chain; the assembly
 * template (name, order count, clauses) fetches lazily from IPFS per row.
 *
 * The spec DISCOVERS an anchored assembly from chain (the latest
 * AssemblyRegistered event — the devnet-authoring project anchors the
 * scenario assemblies before this project runs) and asserts the
 * inventory renders its row. No seeding: registering a junk slug with
 * an unpinned URI burns a deposit and squats a permanent slug on the
 * persisted devnet per run — the devnet is a mainnet rehearsal, and no
 * one would do that on mainnet.
 *
 * Smoke, not a scenario: catches the marketing-tier event read breaking
 * or the row id pattern drifting. The registry contract path lives in
 * Foundry (AssemblyRegistryTest).
 *
 * Requires Anvil + ./deploy-local.sh.
 */
import { test, expect } from '@playwright/test';
import { createPublicClient, defineChain, http, type Hex } from 'viem';
import { readLocalDeploymentConfig } from './devnet-helpers';
import { ASSEMBLY_REGISTRY_ABI } from '@figaro/sdk';
import { deriveAssemblySlug } from '@/lib/shared/assemblyTemplate';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

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

test.describe('Assemblies marketing inventory (devnet)', () => {

    test('renders an anchored assembly from on-chain events', async ({ page }) => {
        // Discover from chain — never a roster. The devnet-authoring
        // project (a Playwright project dependency) anchored the scenario
        // assemblies before this spec runs.
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const events = await publicClient.getContractEvents({
            address: getRegistryAddress(),
            abi: ASSEMBLY_REGISTRY_ABI,
            eventName: 'AssemblyRegistered',
            fromBlock: 0n,
        });
        expect(events.length, 'no anchored assemblies on this devnet — run the devnet-authoring project first').toBeGreaterThan(0);
        const slug = deriveAssemblySlug(events[events.length - 1].args.compositionHash as `0x${string}`);

        await page.goto('/assemblies');

        // Row id pattern is `#assembly-<slug>` per AssemblyInventory.
        const row = page.locator(`#assembly-${slug}`);
        await expect(row).toBeVisible({ timeout: 15_000 });
        // The slug renders in the row's monospace code element (the display
        // name comes from the IPFS-fetched template when it resolves).
        await expect(row).toContainText(slug);
    });
});
