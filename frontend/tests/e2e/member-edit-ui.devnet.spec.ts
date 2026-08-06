/**
 * member-edit-ui.devnet.spec.ts
 *
 * Phase 4 C4a-d of the e2e remediation plan: UI coverage of the four
 * `/members/edit/<route>` surfaces. The `MembersRegistry.updateProfile`
 * contract path lives in Foundry (MembersRegistryTest — the viem-tier
 * Playwright spec was retired as a misfiled contract test); this spec
 * drives the path through the UI forms so the round-trip
 * (fetch → hydrate → edit → re-pin → tx → redirect) is covered as a
 * single live system.
 *
 * Routes covered:
 *   /sellers/edit/identity   — change name, submit via OnboardingProfileForm
 *   /sellers/edit/catalogue  — Delete-catalogue affordance (clear catalogueURI)
 *   /sellers/edit/agents     — set MCP endpoint, submit
 *   /sellers/edit/assemblies — toggle a registered assembly on, submit
 *
 * Each test seeds anvil[0] as a registered seller with a fresh
 * profile pinned to IPFS, then drives the edit form. Each assertion
 * verifies exactly one new `MemberProfileUpdated` event with a
 * metadataURI distinct from the initial registration URI.
 *
 * Requires: Anvil + ./deploy-local.sh + Kubo daemon at NEXT_PUBLIC_IPFS_API_URL.
 */
import { test, expect, ANVIL_ACCOUNTS } from './devnet-multi-test';
import {
    createPublicClient,
    defineChain,
    http,
    type Hex,
} from 'viem';
import {
    pinJSONToIPFS,
    readLocalDeploymentConfig,
    seedRegisteredMember,
} from './devnet-helpers';
import { ASSEMBLY_REGISTRY_ABI, MEMBERS_REGISTRY_ABI } from '@figaro/sdk';
import { deriveAssemblySlug } from '@/lib/shared/assemblyTemplate';
import { ANVIL_KEYS } from '../anvilAccounts';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

const SELLER_KEY = ANVIL_KEYS[0];

function requireEnv(name: string): Hex {
    const v = process.env[name] as Hex | undefined;
    if (!v || v.length !== 42) throw new Error(`${name} not set — run ./deploy-local.sh`);
    return v;
}

function getMembersRegistry(): Hex {
    const config = readLocalDeploymentConfig();
    return (process.env.NEXT_PUBLIC_MEMBERS_REGISTRY ?? config.membersRegistry ?? '') as Hex;
}

function getAssemblyRegistry(): Hex {
    const config = readLocalDeploymentConfig();
    return (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY ?? config.assemblyRegistry ?? '') as Hex;
}

/**
 * Poll the chain for one MemberProfileUpdated event with a metadataURI
 * different from the seeded one. Decoupled from any UI redirect path —
 * the contract event is the system-of-record for "the edit shipped".
 *
 * The SellerEditX components do a post-success refetch + router.push;
 * during that brief window the page renders "Reading registry…" while
 * navigation is pending. If the navigation hangs (which has happened on
 * some routes here, mid-migration), the redirect-based test waits
 * indefinitely while the actual on-chain tx has already confirmed. This
 * helper checks the actual proof.
 */
async function waitForOneUpdateEvent(
    seller: Hex,
    blockBefore: bigint,
    initialURI: string,
    timeoutMs = 60_000,
): Promise<{ metadataURI: string }> {
    const registry = getMembersRegistry();
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    // eth_getLogs is fromBlock-INCLUSIVE, and `blockBefore` (the pre-test
    // head) is usually the exact block carrying the PREVIOUS test's or
    // repeat-iteration's update event. Including it let a foreign distinct
    // event satisfy the exactly-one check instantly (a false pass) — or,
    // when this test's own tx mined before the first poll, push the count
    // to two and deadlock the poll into its timeout (the assemblies-toggle
    // flake, root-caused 2026-07-09 from the persisted chain's block
    // timestamps). This test's events all mine strictly after blockBefore.
    const fromBlock = blockBefore + 1n;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const events = await publicClient.getContractEvents({
            address: registry, abi: MEMBERS_REGISTRY_ABI,
            eventName: 'MemberProfileUpdated',
            args: { member: seller },
            fromBlock,
        });
        // On the PERSISTED devnet the idempotent seeder itself emits an
        // updateProfile event carrying initialURI — exclude it, then require
        // exactly ONE distinct update (the UI edit; no double-fire).
        const uiUpdates = events.filter((e) => e.args.metadataURI !== initialURI);
        if (uiUpdates.length === 1) {
            return { metadataURI: uiUpdates[0].args.metadataURI as string };
        }
        if (uiUpdates.length > 1) {
            // A genuine double-fire is a failure NOW, not a poll condition —
            // waiting can never un-emit an event.
            throw new Error(
                `Expected exactly one MemberProfileUpdated distinct from ${initialURI}, found ${uiUpdates.length}`,
            );
        }
        await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(
        `Timed out after ${timeoutMs}ms waiting for MemberProfileUpdated event distinct from ${initialURI}`,
    );
}

test.describe('Seller edit UI surfaces (devnet)', () => {
    // PERSISTED, like mainnet: no chain snapshot/revert. Each test re-seeds
    // anvil[0]'s profile to its baseline via the idempotent seeder (register
    // once, updateProfile thereafter) and leaves its edits behind.
    let blockBefore: bigint;

    test.beforeEach(async () => {
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        blockBefore = await publicClient.getBlockNumber();
    });

    // IPFS pin + register + form mount + tx + receipt + IPFS re-pin add up.
    test.setTimeout(180_000);

    test('/members/edit/identity — change name, submit, MemberProfileUpdated emits', async ({ page }) => {
        const seller = ANVIL_ACCOUNTS[0] as Hex;
        const tokenAddress = requireEnv('NEXT_PUBLIC_TOKEN_ADDRESS');
        const seeded = await seedRegisteredMember({
            walletKey: SELLER_KEY,
            profile: {
                name: 'Initial Name',
                description: 'Initial description.',
                acceptedTokens: [{ address: tokenAddress, symbol: 'MOCK', chainId: 31337 }],
                defaultTokenAddress: tokenAddress,
            },
        });
        expect(seeded.address.toLowerCase()).toBe(seller.toLowerCase());

        await page.goto('/members/edit/identity?e2e=devnet', { waitUntil: 'domcontentloaded' });

        // Wallet auto-connects via ?e2e=devnet. The form mounts once the
        // existing-profile IPFS fetch + onboarding-state seed complete —
        // we gate on the name input becoming editable with the seeded value.
        await expect(page.locator('#profile-name')).toHaveValue('Initial Name', { timeout: 30000 });

        // Edit the name. Submit kicks off re-pin → updateProfile → on-chain event.
        await page.locator('#profile-name').fill('Renamed Seller');
        await page.getByRole('button', { name: 'Save changes' }).click();

        const { metadataURI } = await waitForOneUpdateEvent(seller, blockBefore, seeded.profileURI);
        expect(metadataURI).toMatch(/^ipfs:\/\/[A-Za-z0-9]+/);

        // On a confirmed update the success effect redirects to /sellers.
        await expect(page).toHaveURL(/\/members\/manage$/, { timeout: 30_000 });
    });

    test('/members/edit/catalogue — Delete-catalogue affordance dispatches updateProfile', async ({ page }) => {
        const seller = ANVIL_ACCOUNTS[0] as Hex;
        const tokenAddress = requireEnv('NEXT_PUBLIC_TOKEN_ADDRESS');

        // Pin a catalogue document so `existingProfile.catalogueURI` is set.
        // MemberCatalogueMetadata shape per `parseMemberCatalogueDocument`:
        // every menu item requires `id`, `name`, `price`, `category`, `available`.
        const { uri: catalogueURI } = await pinJSONToIPFS({
            subjectAddress: seller,
            items: [{
                id: 'item-1',
                name: 'Test item',
                price: '1.00',
                category: 'Test',
                available: true,
            }],
            version: '1.0.0',
        });
        const seeded = await seedRegisteredMember({
            walletKey: SELLER_KEY,
            profile: {
                name: 'Seller with Catalogue',
                catalogueURI,
                acceptedTokens: [{ address: tokenAddress, symbol: 'MOCK', chainId: 31337 }],
                defaultTokenAddress: tokenAddress,
            },
        });

        await page.goto('/members/edit/catalogue?e2e=devnet', { waitUntil: 'domcontentloaded' });

        // Form mounts when the catalogue load resolves. The Delete
        // affordance is at the bottom — its first state is a muted link.
        const deleteToggle = page.getByRole('button', { name: 'Delete catalogue entirely' });
        await expect(deleteToggle).toBeVisible({ timeout: 30000 });
        await deleteToggle.click();

        // Confirm-delete reveals; click it to fire `updater.save({}, {clear:['catalogueURI']})`.
        await page.getByRole('button', { name: 'Confirm delete' }).click();

        // The on-chain event is the system-of-record that the edit shipped.
        await waitForOneUpdateEvent(seller, blockBefore, seeded.profileURI);

        // On a confirmed update the success effect redirects to /sellers.
        await expect(page).toHaveURL(/\/members\/manage$/, { timeout: 30_000 });
    });

    test('/members/edit/agents — set MCP endpoint, submit, MemberProfileUpdated emits', async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on('console', (m) => {
            if (m.type() === 'error') consoleErrors.push(m.text());
        });
        const seller = ANVIL_ACCOUNTS[0] as Hex;
        const tokenAddress = requireEnv('NEXT_PUBLIC_TOKEN_ADDRESS');
        const seeded = await seedRegisteredMember({
            walletKey: SELLER_KEY,
            profile: {
                name: 'Agent Seller',
                acceptedTokens: [{ address: tokenAddress, symbol: 'MOCK', chainId: 31337 }],
                defaultTokenAddress: tokenAddress,
            },
        });

        await page.goto('/members/edit/agents?e2e=devnet', { waitUntil: 'domcontentloaded' });

        await expect(page.locator('#agent-mcp')).toBeVisible({ timeout: 30000 });
        const mcpUrl = 'https://agent.example.com/mcp';
        await page.locator('#agent-mcp').fill(mcpUrl);
        await page.getByRole('button', { name: 'Save changes' }).click();
        await waitForOneUpdateEvent(seller, blockBefore, seeded.profileURI);

        // On a confirmed update the success effect redirects to /sellers.
        await expect(page).toHaveURL(/\/members\/manage$/, { timeout: 30_000 });

        // Diagnostic: confirm the render-loop bug is fixed. Pre-fix, the
        // `MemberEditAgents` component fired "Maximum update depth
        // exceeded" repeatedly after click. Post-fix (memoized refetch +
        // setData dedupe in `useMemberProfile`), no such warning.
        const loopErrors = consoleErrors.filter((e) => /Maximum update depth/i.test(e));
        expect(loopErrors, `Expected no Maximum-update-depth warnings; saw: ${loopErrors.join(' | ')}`).toEqual([]);
    });

    test('/members/edit/assemblies — toggle published assembly on, submit, MemberProfileUpdated emits', async ({ page }) => {
        const seller = ANVIL_ACCOUNTS[0] as Hex;
        const tokenAddress = requireEnv('NEXT_PUBLIC_TOKEN_ADDRESS');

        // 1. Discover a published assembly from chain — never register junk:
        //    a fresh slug per run burns a deposit and squats a permanent
        //    slug on the persisted devnet (mainnet rehearsal). The
        //    devnet-authoring project anchored the scenario assemblies
        //    (template pinned to IPFS, AssemblyRegistered on-chain) before
        //    this project runs — exactly what `useAssemblyChoices` needs
        //    to render the row.
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const registered = await publicClient.getContractEvents({
            address: getAssemblyRegistry(),
            abi: ASSEMBLY_REGISTRY_ABI,
            eventName: 'AssemblyRegistered',
            fromBlock: 0n,
        });
        expect(registered.length, 'no anchored assemblies on this devnet — run the devnet-authoring project first').toBeGreaterThan(0);
        const assemblySlug = deriveAssemblySlug(registered[registered.length - 1].args.compositionHash as `0x${string}`);

        // 2. Register the seller (separate from the assembly author —
        //    same key here, fine). Seller starts with no bindings.
        const seeded = await seedRegisteredMember({
            walletKey: SELLER_KEY,
            profile: {
                name: 'Assemblies Seller',
                acceptedTokens: [{ address: tokenAddress, symbol: 'MOCK', chainId: 31337 }],
                defaultTokenAddress: tokenAddress,
            },
        });

        await page.goto('/members/edit/assemblies?e2e=devnet', { waitUntil: 'domcontentloaded' });

        // The assembly row carries `seller-assembly-row-<slug>` testid.
        const assemblyRow = page.getByTestId(`seller-assembly-row-${assemblySlug}`);
        await expect(assemblyRow).toBeVisible({ timeout: 30000 });
        await assemblyRow.locator('input[type="checkbox"]').first().check();

        await page.getByRole('button', { name: 'Save changes' }).click();
        await waitForOneUpdateEvent(seller, blockBefore, seeded.profileURI);

        // On a confirmed update the success effect redirects to /sellers.
        await expect(page).toHaveURL(/\/members\/manage$/, { timeout: 30_000 });
    });
});
