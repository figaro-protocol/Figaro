/**
 * assembly-registry.devnet.spec.ts
 *
 * AssemblyRegistry is the parallel-anchor for assembly templates —
 * permissionless, first-write-wins, with a refundable deposit. The
 * /builders/designer/* surfaces publish to it via
 * `usePublishAssembly`. No devnet test covered the on-chain path
 * pre-2026-05-19.
 *
 * UI-driven coverage of the designer publish flow needs the designer
 * canvas + saved drafts + IPFS pin of the manifest. That fixture is
 * deferred. What this spec covers right now is the contract path the
 * UI publishes to, with negative-case + happy-path + double-publish +
 * cross-author cases:
 *
 *  - Happy path: register slug → AssemblyRegistered emitted.
 *  - Re-publishing the same slug from any wallet reverts
 *    SlugAlreadyRegistered (first-write-wins is the invariant; if
 *    anyone ever changes this to "owner can re-publish", the
 *    designer's update flow needs to be reworked anyway).
 *  - Wrong-deposit / empty-slug / empty-contentHash / empty-metadataURI
 *    all revert with typed errors.
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
const OTHER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;

const REGISTRATION_DEPOSIT = parseEther('0.001');

const ASSEMBLY_REGISTRY_ABI = parseAbi([
    'function registerAssembly(string slug, bytes32 contentHash, string metadataURI) external payable',
    'function bindings(bytes32 slugHash) view returns (address author, uint64 registeredAt, bool depositWithdrawn, bytes32 contentHash, string metadataURI)',
    'event AssemblyRegistered(bytes32 indexed slugHash, address indexed author, string slug, bytes32 contentHash, string metadataURI)',
    'error EmptySlug()',
    'error EmptyMetadataURI()',
    'error EmptyContentHash()',
    'error SlugAlreadyRegistered(string slug)',
    'error WrongDeposit(uint256 provided, uint256 required)',
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

async function registerSlug(opts: {
    privateKey: Hex;
    slug: string;
    contentHash: Hex;
    metadataURI: string;
    deposit?: bigint;
}): Promise<void> {
    const registry = getRegistryAddress();
    const author = privateKeyToAccount(opts.privateKey);
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const authorClient = createWalletClient({ account: author, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const { request } = await publicClient.simulateContract({
        account: author.address,
        address: registry,
        abi: ASSEMBLY_REGISTRY_ABI,
        functionName: 'registerAssembly',
        args: [opts.slug, opts.contentHash, opts.metadataURI],
        value: opts.deposit ?? REGISTRATION_DEPOSIT,
    });
    await publicClient.waitForTransactionReceipt({ hash: await authorClient.writeContract(request) });
}

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('AssemblyRegistry.registerAssembly (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    test('registers an assembly slug — binding stored and event emitted', async () => {
        const slug = `g3-happy-${Date.now()}`;
        const contentHash = keccak256(toHex(`content-${slug}`));
        const metadataURI = `ipfs://test-${slug}`;

        await registerSlug({ privateKey: AUTHOR_KEY, slug, contentHash, metadataURI });

        const registry = getRegistryAddress();
        const author = privateKeyToAccount(AUTHOR_KEY);
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        // Binding stored on-chain.
        const slugHash = keccak256(toHex(slug));
        const binding = await publicClient.readContract({
            address: registry, abi: ASSEMBLY_REGISTRY_ABI,
            functionName: 'bindings', args: [slugHash],
        });
        expect(binding[0].toLowerCase()).toBe(author.address.toLowerCase());
        expect(binding[3]).toBe(contentHash);
        expect(binding[4]).toBe(metadataURI);

        // Event emitted with the right payload.
        const events = await publicClient.getContractEvents({
            address: registry, abi: ASSEMBLY_REGISTRY_ABI,
            eventName: 'AssemblyRegistered',
            args: { slugHash, author: author.address as Hex },
            fromBlock: 0n,
        });
        expect(events.length).toBe(1);
        expect(events[0].args.slug).toBe(slug);
        expect(events[0].args.contentHash).toBe(contentHash);
        expect(events[0].args.metadataURI).toBe(metadataURI);
    });

    test('first-write-wins — second registration on the same slug reverts even from a different author', async () => {
        const slug = `g3-first-write-${Date.now()}`;
        const contentHash = keccak256(toHex('content'));

        await registerSlug({ privateKey: AUTHOR_KEY, slug, contentHash, metadataURI: 'ipfs://v1' });

        await expect(
            registerSlug({
                privateKey: OTHER_KEY, slug,
                contentHash: keccak256(toHex('different-content')),
                metadataURI: 'ipfs://v2',
            }),
        ).rejects.toThrow(/SlugAlreadyRegistered/);
    });

    test('wrong deposit reverts WrongDeposit', async () => {
        await expect(
            registerSlug({
                privateKey: AUTHOR_KEY, slug: `g3-wrong-deposit-${Date.now()}`,
                contentHash: keccak256(toHex('c')), metadataURI: 'ipfs://x',
                deposit: parseEther('0.5'),
            }),
        ).rejects.toThrow(/WrongDeposit/);
    });

    test('empty slug / contentHash / metadataURI each revert with their typed error', async () => {
        const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as Hex;
        const validContent = keccak256(toHex('c'));

        await expect(
            registerSlug({ privateKey: AUTHOR_KEY, slug: '', contentHash: validContent, metadataURI: 'ipfs://x' }),
        ).rejects.toThrow(/EmptySlug/);

        await expect(
            registerSlug({
                privateKey: AUTHOR_KEY, slug: `g3-empty-hash-${Date.now()}`,
                contentHash: ZERO_BYTES32, metadataURI: 'ipfs://x',
            }),
        ).rejects.toThrow(/EmptyContentHash/);

        await expect(
            registerSlug({
                privateKey: AUTHOR_KEY, slug: `g3-empty-uri-${Date.now()}`,
                contentHash: validContent, metadataURI: '',
            }),
        ).rejects.toThrow(/EmptyMetadataURI/);
    });
});
