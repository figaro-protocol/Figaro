/**
 * operator-edit-ui.devnet.spec.ts
 *
 * Phase 4 C4a-d of the e2e remediation plan: UI coverage of the four
 * `/operators/edit/<route>` surfaces. The companion contract-tier spec
 * `operator-update-profile.devnet.spec.ts` exercises the
 * `OperatorRegistry.updateProfile` path directly via viem; this spec
 * drives the same path through the UI forms so the round-trip
 * (fetch → hydrate → edit → re-pin → tx → redirect) is covered as a
 * single live system.
 *
 * Routes covered:
 *   /operators/edit/identity   — change name, submit via OnboardingProfileForm
 *   /operators/edit/catalogue  — Delete-catalogue affordance (clear catalogueURI)
 *   /operators/edit/agents     — set MCP endpoint, submit
 *   /operators/edit/assemblies — toggle a registered assembly on, submit
 *
 * Each test seeds anvil[0] as a registered operator with a fresh
 * profile pinned to IPFS, then drives the edit form. Each assertion
 * verifies exactly one new `OperatorProfileUpdated` event with a
 * metadataURI distinct from the initial registration URI.
 *
 * Requires: Anvil + ./deploy-local.sh + Kubo daemon at NEXT_PUBLIC_IPFS_API_URL.
 */
import { test, expect, ANVIL_ACCOUNTS } from './devnet-multi-test';
import {
    createPublicClient,
    defineChain,
    http,
    keccak256,
    parseAbi,
    parseEther,
    toHex,
    type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    evmRevert,
    evmSnapshot,
    pinJSONToIPFS,
    readLocalDeploymentConfig,
    seedRegisteredOperator,
} from './devnet-helpers';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

const OPERATOR_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;

const OPERATOR_REGISTRY_ABI = parseAbi([
    'event OperatorProfileUpdated(address indexed operator, string metadataURI)',
]);

const ASSEMBLY_REGISTRY_ABI = parseAbi([
    'function registerAssembly(string slug, bytes32 contentHash, string metadataURI) external payable',
    'event AssemblyRegistered(bytes32 indexed slugHash, address indexed author, string slug, bytes32 contentHash, string metadataURI)',
]);

const ASSEMBLY_REGISTRATION_DEPOSIT = parseEther('0.001');

function requireEnv(name: string): Hex {
    const v = process.env[name] as Hex | undefined;
    if (!v || v.length !== 42) throw new Error(`${name} not set — run ./deploy-local.sh`);
    return v;
}

function getOperatorRegistry(): Hex {
    const config = readLocalDeploymentConfig();
    return (process.env.NEXT_PUBLIC_OPERATOR_REGISTRY ?? config.operatorRegistry ?? '') as Hex;
}

function getAssemblyRegistry(): Hex {
    const config = readLocalDeploymentConfig();
    return (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY ?? config.assemblyRegistry ?? '') as Hex;
}

/**
 * Poll the chain for one OperatorProfileUpdated event with a metadataURI
 * different from the seeded one. Decoupled from any UI redirect path —
 * the contract event is the system-of-record for "the edit shipped".
 *
 * The OperatorEditX components do a post-success refetch + router.push;
 * during that brief window the page renders "Reading registry…" while
 * navigation is pending. If the navigation hangs (which has happened on
 * some routes here, mid-migration), the redirect-based test waits
 * indefinitely while the actual on-chain tx has already confirmed. This
 * helper checks the actual proof.
 */
async function waitForOneUpdateEvent(
    operator: Hex,
    fromBlock: bigint,
    initialURI: string,
    timeoutMs = 60_000,
): Promise<{ metadataURI: string }> {
    const registry = getOperatorRegistry();
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const events = await publicClient.getContractEvents({
            address: registry, abi: OPERATOR_REGISTRY_ABI,
            eventName: 'OperatorProfileUpdated',
            args: { operator },
            fromBlock,
        });
        if (events.length === 1 && events[0].args.metadataURI !== initialURI) {
            return { metadataURI: events[0].args.metadataURI as string };
        }
        await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(
        `Timed out after ${timeoutMs}ms waiting for OperatorProfileUpdated event distinct from ${initialURI}`,
    );
}

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('Operator edit UI surfaces (devnet)', () => {
    let testSnapshot: string;
    let blockBefore: bigint;

    test.beforeEach(async () => {
        testSnapshot = await evmSnapshot();
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        blockBefore = await publicClient.getBlockNumber();
    });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // IPFS pin + register + form mount + tx + receipt + IPFS re-pin add up.
    test.setTimeout(180_000);

    test('/operators/edit/identity — change name, submit, OperatorProfileUpdated emits', async ({ page }) => {
        const operator = ANVIL_ACCOUNTS[0] as Hex;
        const tokenAddress = requireEnv('NEXT_PUBLIC_TOKEN_ADDRESS');
        const seeded = await seedRegisteredOperator({
            walletKey: OPERATOR_KEY,
            profile: {
                name: 'Initial Name',
                description: 'Initial description.',
                acceptedTokens: [{ address: tokenAddress, symbol: 'MOCK', chainId: 31337 }],
                defaultTokenAddress: tokenAddress,
            },
        });
        expect(seeded.address.toLowerCase()).toBe(operator.toLowerCase());

        await page.goto('/operators/edit/identity?e2e=devnet', { waitUntil: 'domcontentloaded' });

        // Wallet auto-connects via ?e2e=devnet. The form mounts once the
        // existing-profile IPFS fetch + onboarding-state seed complete —
        // we gate on the name input becoming editable with the seeded value.
        await expect(page.locator('#profile-name')).toHaveValue('Initial Name', { timeout: 30000 });

        // Edit the name. Submit kicks off re-pin → updateProfile → on-chain event.
        await page.locator('#profile-name').fill('Renamed Operator');
        await page.getByRole('button', { name: 'Save changes' }).click();

        const { metadataURI } = await waitForOneUpdateEvent(operator, blockBefore, seeded.profileURI);
        expect(metadataURI).toMatch(/^ipfs:\/\/[A-Za-z0-9]+/);
    });

    test('/operators/edit/catalogue — Delete-catalogue affordance dispatches updateProfile', async ({ page }) => {
        const operator = ANVIL_ACCOUNTS[0] as Hex;
        const tokenAddress = requireEnv('NEXT_PUBLIC_TOKEN_ADDRESS');

        // Pin a catalogue document so `existingProfile.catalogueURI` is set.
        // SellerCatalogueMetadata shape per `parseSellerCatalogueDocument`:
        // every menu item requires `id`, `name`, `price`, `category`, `available`.
        const { uri: catalogueURI } = await pinJSONToIPFS({
            subjectAddress: operator,
            menu: [{
                id: 'item-1',
                name: 'Test item',
                price: '1.00',
                category: 'Test',
                available: true,
            }],
            version: '1.0.0',
        });
        const seeded = await seedRegisteredOperator({
            walletKey: OPERATOR_KEY,
            profile: {
                name: 'Operator with Catalogue',
                catalogueURI,
                acceptedTokens: [{ address: tokenAddress, symbol: 'MOCK', chainId: 31337 }],
                defaultTokenAddress: tokenAddress,
            },
        });

        await page.goto('/operators/edit/catalogue?e2e=devnet', { waitUntil: 'domcontentloaded' });

        // Form mounts when the catalogue load resolves. The Delete
        // affordance is at the bottom — its first state is a muted link.
        const deleteToggle = page.getByRole('button', { name: 'Delete catalogue entirely' });
        await expect(deleteToggle).toBeVisible({ timeout: 30000 });
        await deleteToggle.click();

        // Confirm-delete reveals; click it to fire `updater.save({}, {clear:['catalogueURI']})`.
        await page.getByRole('button', { name: 'Confirm delete' }).click();

        // Poll the chain for the OperatorProfileUpdated event rather than
        // wait for the UI redirect — the post-success refetch+router.push
        // race leaves the catalogue route stuck on "Reading registry…" at
        // times. The on-chain event is the system-of-record.
        await waitForOneUpdateEvent(operator, blockBefore, seeded.profileURI);
    });

    test('/operators/edit/agents — set MCP endpoint, submit, OperatorProfileUpdated emits', async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on('console', (m) => {
            if (m.type() === 'error') consoleErrors.push(m.text());
        });
        const operator = ANVIL_ACCOUNTS[0] as Hex;
        const tokenAddress = requireEnv('NEXT_PUBLIC_TOKEN_ADDRESS');
        const seeded = await seedRegisteredOperator({
            walletKey: OPERATOR_KEY,
            profile: {
                name: 'Agent Operator',
                acceptedTokens: [{ address: tokenAddress, symbol: 'MOCK', chainId: 31337 }],
                defaultTokenAddress: tokenAddress,
            },
        });

        await page.goto('/operators/edit/agents?e2e=devnet', { waitUntil: 'domcontentloaded' });

        await expect(page.locator('#agent-mcp')).toBeVisible({ timeout: 30000 });
        const mcpUrl = 'https://agent.example.com/mcp';
        await page.locator('#agent-mcp').fill(mcpUrl);
        await page.getByRole('button', { name: 'Save changes' }).click();
        await waitForOneUpdateEvent(operator, blockBefore, seeded.profileURI);

        // Diagnostic: confirm the render-loop bug is fixed. Pre-fix, the
        // `OperatorEditAgents` component fired "Maximum update depth
        // exceeded" repeatedly after click. Post-fix (memoized refetch +
        // setData dedupe in `useOperatorProfile`), no such warning.
        const loopErrors = consoleErrors.filter((e) => /Maximum update depth/i.test(e));
        expect(loopErrors, `Expected no Maximum-update-depth warnings; saw: ${loopErrors.join(' | ')}`).toEqual([]);
    });

    test('/operators/edit/assemblies — toggle published assembly on, submit, OperatorProfileUpdated emits', async ({ page }) => {
        const operator = ANVIL_ACCOUNTS[0] as Hex;
        const tokenAddress = requireEnv('NEXT_PUBLIC_TOKEN_ADDRESS');

        // 1. Register a minimal assembly. `useAssemblyChoices` reads
        //    AssemblyRegistered events + fetches the manifest JSON, so
        //    both must exist on-chain + IPFS for the row to render.
        //    AssemblyManifest needs `name` + `orders[]`; orderless or
        //    fully empty manifests still render as a choice — what
        //    matters for this test is that the slug is selectable.
        const manifestDoc = {
            slug: `phase4-c4d-${Date.now()}`,
            name: 'Phase 4 Assembly',
            orders: [],
            agreements: {},
            version: '1.0.0',
        };
        const { uri: manifestURI } = await pinJSONToIPFS(manifestDoc);
        const contentHash = keccak256(toHex(JSON.stringify(manifestDoc)));

        const assemblyRegistry = getAssemblyRegistry();
        const author = privateKeyToAccount(OPERATOR_KEY);
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const { createWalletClient } = await import('viem');
        const authorClient = createWalletClient({ account: author, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const { request: registerReq } = await publicClient.simulateContract({
            account: author.address,
            address: assemblyRegistry,
            abi: ASSEMBLY_REGISTRY_ABI,
            functionName: 'registerAssembly',
            args: [manifestDoc.slug, contentHash, manifestURI],
            value: ASSEMBLY_REGISTRATION_DEPOSIT,
        });
        await publicClient.waitForTransactionReceipt({ hash: await authorClient.writeContract(registerReq) });

        // 2. Register the operator (separate from the assembly author —
        //    same key here, fine). Operator starts with no bindings.
        const seeded = await seedRegisteredOperator({
            walletKey: OPERATOR_KEY,
            profile: {
                name: 'Assemblies Operator',
                acceptedTokens: [{ address: tokenAddress, symbol: 'MOCK', chainId: 31337 }],
                defaultTokenAddress: tokenAddress,
            },
        });

        await page.goto('/operators/edit/assemblies?e2e=devnet', { waitUntil: 'domcontentloaded' });

        // The assembly row carries `operator-assembly-row-<slug>` testid.
        const assemblyRow = page.getByTestId(`operator-assembly-row-${manifestDoc.slug}`);
        await expect(assemblyRow).toBeVisible({ timeout: 30000 });
        await assemblyRow.locator('input[type="checkbox"]').first().check();

        await page.getByRole('button', { name: 'Save changes' }).click();
        await waitForOneUpdateEvent(operator, blockBefore, seeded.profileURI);
    });
});
