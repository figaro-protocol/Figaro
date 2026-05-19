/**
 * fig-claim.devnet.spec.ts
 *
 * RpgfMinter is the contract behind /fig/claim — three immutable
 * per-stage unlock times + sequencer-submitted Merkle roots,
 * IFigMinter-backed minting on each claim. (Replaced the deleted
 * StagedMerkleAirdrop 2026-05; same claim-side ABI shape, so this
 * spec's claim assertions carry over unchanged — only the contract
 * name + the stages-getter return tuple differ.) Pre-2026-05-19 the
 * airdrop was not deployed by Deploy.s.sol at all on devnet; this
 * session added a single-leaf test fixture to the deploy so this
 * spec can exercise the path.
 *
 * Devnet fixture (per Deploy.s.sol):
 *   - claimant = vm.addr(deployerPrivateKey) (== anvil[0]).
 *   - claimAmount = 1 ether (1e18 FIG, fixed-point).
 *   - leaf = keccak256(abi.encodePacked(claimant, 1e18)).
 *   - root = leaf at every stage (N=1 tree).
 *   - unlockTime = 1 at every stage (immediately claimable).
 *
 * For a single-leaf tree, the inclusion proof is the empty array —
 * `MerkleProof.verify([], root, leaf) == (leaf == root)`.
 *
 * UI coverage of /fig/claim is gated on a static
 * `frontend/public/fig-claims-y{2,5,9}.json` allocation file that's a
 * mainnet-generation artifact rather than a per-test fixture, so that
 * surface is deferred. What this spec covers: the RpgfMinter
 * contract path the UI button funnels into, plus the FigToken
 * IFigMinter wiring (cap accounting, mint emits, balance lands).
 *
 * Requires: Anvil + ./deploy-local.sh.
 */
import { test, expect } from '@playwright/test';
import {
    createPublicClient,
    createWalletClient,
    defineChain,
    http,
    keccak256,
    encodePacked,
    parseAbi,
    parseEther,
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

const CLAIMANT_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const STRANGER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;

const CLAIM_AMOUNT = parseEther('1');

const AIRDROP_ABI = parseAbi([
    'function claim(uint8 stageIndex, uint256 amount, bytes32[] proof) external',
    'function claimed(uint8, address) view returns (bool)',
    'function stages(uint256) view returns (bytes32 root, uint64 unlockTime, uint256 totalAllocated)',
    'event Claimed(uint8 indexed stageIndex, address indexed account, uint256 amount)',
    'error InvalidStage(uint8 stageIndex)',
    'error NotUnlocked(uint8 stageIndex)',
    'error AlreadyClaimed(uint8 stageIndex, address account)',
    'error InvalidProof()',
]);

const FIG_TOKEN_ABI = parseAbi([
    'function balanceOf(address) view returns (uint256)',
]);

function getAddresses() {
    const config = readLocalDeploymentConfig();
    const airdrop = (process.env.NEXT_PUBLIC_RPGF_MINTER ?? '') as Hex;
    const fig = (process.env.NEXT_PUBLIC_FIG_TOKEN_ADDRESS
        ?? config.figaroCore /* fallback never hits in devnet */) as Hex;
    if (!airdrop || airdrop.length !== 42) {
        throw new Error('NEXT_PUBLIC_RPGF_MINTER not set — re-run ./deploy-local.sh after the airdrop-deploy patch');
    }
    return {
        airdrop,
        fig: (process.env.NEXT_PUBLIC_FIG_TOKEN_ADDRESS ?? '') as Hex,
    };
}

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('RpgfMinter.claim (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    test('seeded claimant claims stage 0 — Claimed event emits, FIG balance increases, claimed flag flips', async () => {
        const { airdrop, fig } = getAddresses();
        const claimant = privateKeyToAccount(CLAIMANT_KEY);
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const claimantClient = createWalletClient({ account: claimant, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        const balanceBefore = await publicClient.readContract({
            address: fig, abi: FIG_TOKEN_ABI,
            functionName: 'balanceOf', args: [claimant.address as Hex],
        });
        const claimedBefore = await publicClient.readContract({
            address: airdrop, abi: AIRDROP_ABI,
            functionName: 'claimed', args: [0, claimant.address as Hex],
        });
        expect(claimedBefore).toBe(false);

        // Single-leaf tree: leaf == root, empty proof verifies.
        const { request } = await publicClient.simulateContract({
            account: claimant.address, address: airdrop,
            abi: AIRDROP_ABI, functionName: 'claim',
            args: [0, CLAIM_AMOUNT, []],
        });
        await publicClient.waitForTransactionReceipt({ hash: await claimantClient.writeContract(request) });

        const balanceAfter = await publicClient.readContract({
            address: fig, abi: FIG_TOKEN_ABI,
            functionName: 'balanceOf', args: [claimant.address as Hex],
        });
        expect(balanceAfter - balanceBefore).toBe(CLAIM_AMOUNT);

        const claimedAfter = await publicClient.readContract({
            address: airdrop, abi: AIRDROP_ABI,
            functionName: 'claimed', args: [0, claimant.address as Hex],
        });
        expect(claimedAfter).toBe(true);

        const events = await publicClient.getContractEvents({
            address: airdrop, abi: AIRDROP_ABI,
            eventName: 'Claimed',
            args: { stageIndex: 0, account: claimant.address as Hex },
            fromBlock: 0n,
        });
        expect(events.length).toBe(1);
        expect(events[0].args.amount).toBe(CLAIM_AMOUNT);
    });

    test('re-claim of the same stage reverts AlreadyClaimed', async () => {
        const { airdrop } = getAddresses();
        const claimant = privateKeyToAccount(CLAIMANT_KEY);
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const claimantClient = createWalletClient({ account: claimant, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        // First claim succeeds.
        const { request: first } = await publicClient.simulateContract({
            account: claimant.address, address: airdrop,
            abi: AIRDROP_ABI, functionName: 'claim',
            args: [0, CLAIM_AMOUNT, []],
        });
        await publicClient.waitForTransactionReceipt({ hash: await claimantClient.writeContract(first) });

        // Second simulate on the same stage from the same account reverts.
        await expect(
            publicClient.simulateContract({
                account: claimant.address, address: airdrop,
                abi: AIRDROP_ABI, functionName: 'claim',
                args: [0, CLAIM_AMOUNT, []],
            }),
        ).rejects.toThrow(/AlreadyClaimed/);
    });

    test('wrong amount fails InvalidProof — leaf depends on (account, amount)', async () => {
        const { airdrop } = getAddresses();
        const claimant = privateKeyToAccount(CLAIMANT_KEY);
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        // Changing amount changes leaf = keccak256(addr || amount); leaf no
        // longer equals root, so MerkleProof.verify([], root, leaf') fails.
        await expect(
            publicClient.simulateContract({
                account: claimant.address, address: airdrop,
                abi: AIRDROP_ABI, functionName: 'claim',
                args: [0, parseEther('999'), []],
            }),
        ).rejects.toThrow(/InvalidProof/);
    });

    test('stranger cannot claim seeded allocation — leaf depends on msg.sender', async () => {
        const { airdrop } = getAddresses();
        const stranger = privateKeyToAccount(STRANGER_KEY);
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        await expect(
            publicClient.simulateContract({
                account: stranger.address, address: airdrop,
                abi: AIRDROP_ABI, functionName: 'claim',
                args: [0, CLAIM_AMOUNT, []],
            }),
        ).rejects.toThrow(/InvalidProof/);
    });

    test('out-of-range stage reverts InvalidStage (STAGE_COUNT = 3)', async () => {
        const { airdrop } = getAddresses();
        const claimant = privateKeyToAccount(CLAIMANT_KEY);
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        await expect(
            publicClient.simulateContract({
                account: claimant.address, address: airdrop,
                abi: AIRDROP_ABI, functionName: 'claim',
                args: [3, CLAIM_AMOUNT, []],
            }),
        ).rejects.toThrow(/InvalidStage/);
    });

    test('seed leaf reconstruction matches Deploy.s.sol — sanity guard against silent drift', async () => {
        const { airdrop } = getAddresses();
        const claimant = privateKeyToAccount(CLAIMANT_KEY);
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        // Recompute the leaf the deploy script wrote — `keccak256(abi.
        // encodePacked(claimant, claimAmount))`. If the deploy ever
        // diverges from this convention the assertion fails here, which
        // is a cleaner diagnostic than three other tests failing with
        // InvalidProof for inscrutable reasons.
        const expectedLeaf = keccak256(
            encodePacked(['address', 'uint256'], [claimant.address as Hex, CLAIM_AMOUNT]),
        );
        const [storedRoot, unlockTime] = await publicClient.readContract({
            address: airdrop, abi: AIRDROP_ABI,
            functionName: 'stages', args: [0n],
        });
        expect(storedRoot).toBe(expectedLeaf);
        expect(unlockTime).toBeGreaterThan(0n);
    });
});
