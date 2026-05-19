/**
 * operator-update-profile.devnet.spec.ts
 *
 * OperatorRegistry.updateProfile is the canonical edit path for
 * registered operators — re-points metadataURI without touching the
 * deposit or lock period (see `feedback_operator_registry_no_role.md`
 * + reference_operator_registry_no_role memory). Four UI sub-routes
 * call it: /operators/edit/identity, /catalogue, /agents, /assemblies.
 *
 * The UI surfaces require an IPFS-pinned existing-profile JSON to
 * mount the form (OperatorEditProfile bails with "Couldn't load the
 * existing profile" if the fetch fails). End-to-end UI coverage of
 * those routes would need a full wizard registration + IPFS pin per
 * test; that fixture cost is deferred to a future dedicated session.
 *
 * What this spec covers RIGHT NOW: the on-chain updateProfile path
 * itself, via viem. Guards the contract-level guarantees that the UI
 * relies on:
 *
 *  - A registered operator can fire updateProfile with a new
 *    metadataURI; the event stream gets an OperatorProfileUpdated
 *    entry while OperatorRegistered count stays at 1 (no
 *    re-registration, no lock reset).
 *  - An unregistered wallet cannot updateProfile — reverts
 *    NotRegistered. Pairs with the existing register-revert coverage.
 *
 * Requires: Anvil + ./deploy-local.sh
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

const OPERATOR_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const UNREGISTERED_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;

const REGISTRATION_DEPOSIT = parseEther('0.001');

const OPERATOR_REGISTRY_ABI = parseAbi([
    'function register(string metadataURI) external payable',
    'function updateProfile(string metadataURI) external',
    'event OperatorRegistered(address indexed operator, string metadataURI)',
    'event OperatorProfileUpdated(address indexed operator, string metadataURI)',
    'error AlreadyRegistered()',
    'error InsufficientDeposit()',
    'error NotRegistered()',
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

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('OperatorRegistry.updateProfile (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    test('registered operator can update metadataURI — emits Updated, register count unchanged', async () => {
        await registerOperator('ipfs://test-G1-initial');

        const registry = getRegistryAddress();
        const operator = privateKeyToAccount(OPERATOR_KEY);
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const operatorClient = createWalletClient({ account: operator, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        const newMetadataURI = 'ipfs://test-G1-updated';
        const { request } = await publicClient.simulateContract({
            account: operator.address,
            address: registry,
            abi: OPERATOR_REGISTRY_ABI,
            functionName: 'updateProfile',
            args: [newMetadataURI],
        });
        await publicClient.waitForTransactionReceipt({ hash: await operatorClient.writeContract(request) });

        const [registered, updated] = await Promise.all([
            publicClient.getContractEvents({
                address: registry, abi: OPERATOR_REGISTRY_ABI,
                eventName: 'OperatorRegistered',
                args: { operator: operator.address as Hex },
                fromBlock: 0n,
            }),
            publicClient.getContractEvents({
                address: registry, abi: OPERATOR_REGISTRY_ABI,
                eventName: 'OperatorProfileUpdated',
                args: { operator: operator.address as Hex },
                fromBlock: 0n,
            }),
        ]);

        // Exactly one registration; exactly one update; payload matches.
        expect(registered.length).toBe(1);
        expect(updated.length).toBe(1);
        expect(updated[0].args.metadataURI).toBe(newMetadataURI);
    });

    test('updateProfile on unregistered wallet reverts NotRegistered', async () => {
        const registry = getRegistryAddress();
        const stranger = privateKeyToAccount(UNREGISTERED_KEY);
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        await expect(
            publicClient.simulateContract({
                account: stranger.address,
                address: registry,
                abi: OPERATOR_REGISTRY_ABI,
                functionName: 'updateProfile',
                args: ['ipfs://nope'],
            }),
        ).rejects.toThrow(/NotRegistered/);
    });

    test('multiple sequential updateProfile calls each emit a distinct Updated event', async () => {
        await registerOperator('ipfs://test-G1-multi-initial');

        const registry = getRegistryAddress();
        const operator = privateKeyToAccount(OPERATOR_KEY);
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const operatorClient = createWalletClient({ account: operator, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        const uris = [
            'ipfs://test-G1-edit-identity',
            'ipfs://test-G1-edit-catalogue',
            'ipfs://test-G1-edit-assemblies',
            'ipfs://test-G1-edit-agents',
        ];
        for (const uri of uris) {
            const { request } = await publicClient.simulateContract({
                account: operator.address, address: registry,
                abi: OPERATOR_REGISTRY_ABI, functionName: 'updateProfile', args: [uri],
            });
            await publicClient.waitForTransactionReceipt({ hash: await operatorClient.writeContract(request) });
        }

        const updated = await publicClient.getContractEvents({
            address: registry, abi: OPERATOR_REGISTRY_ABI,
            eventName: 'OperatorProfileUpdated',
            args: { operator: operator.address as Hex },
            fromBlock: 0n,
        });
        // 4 update events emitted; payloads in order.
        expect(updated.length).toBe(4);
        expect(updated.map((e) => e.args.metadataURI)).toEqual(uris);
    });
});
