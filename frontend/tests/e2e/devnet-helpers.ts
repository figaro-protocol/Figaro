import fs from 'fs';
import path from 'path';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
    createPublicClient,
    createWalletClient,
    defineChain,
    http,
    parseAbi,
    parseEther,
    type Abi,
    type ContractEventName,
    type GetContractEventsParameters,
    type GetContractEventsReturnType,
    type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ASSEMBLY_REGISTRY_ABI, CLAUSE_REGISTRY_ABI, templateCompositionHash } from '@figaro-protocol/sdk';
import { encodeGeohash } from '@figaro-protocol/sdk/derive';
import { deriveAssemblySlug } from '@/lib/shared/assemblyTemplate';
import { ZERO_ADDRESS } from '@/lib/shared/evm';

/** Which network the e2e run reads and drives: Anvil (the default; mainnet
 *  on a laptop) or Sepolia (`E2E_CHAIN=sepolia` — the public rehearsal, the
 *  Sepolia smoke). ONE switch: every helper below takes its RPC, chain, and
 *  deployment record from here, so a spec written against devnet runs
 *  against Sepolia unchanged. */
export const E2E_CHAIN: 'devnet' | 'sepolia' = process.env.E2E_CHAIN === 'sepolia' ? 'sepolia' : 'devnet';
export const RPC_URL = E2E_CHAIN === 'sepolia'
    // The public keyless endpoint the site itself reads through — never the
    // deploy key's SEPOLIA_RPC_URL (keyed; rate-limited under a long run).
    ? (process.env.E2E_SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com')
    : 'http://127.0.0.1:8545';
/** Where out-of-band event scans start: the deployment block on a public
 *  network (public gateways cap eth_getLogs ranges — a from-genesis scan is
 *  refused), block 0 on the devnet. */
const SCAN_FROM_BLOCK: bigint = E2E_CHAIN === 'sepolia'
    ? BigInt((JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../deployments/11155111.json'), 'utf8')) as { deploymentBlock?: number }).deploymentBlock ?? 0)
    : 0n;
/** Public gateways cap one `eth_getLogs` at ~50k blocks (publicnode); a
 *  from-deployment scan outgrows a single call within days of a public
 *  deploy (Sepolia: ~7,200 blocks/day). Every out-of-band scan walks the
 *  range in chunks under the cap; on the devnet (block 0, short chain) the
 *  first chunk is the whole chain. */
const SCAN_CHUNK_BLOCKS = 40_000n;
export async function scanContractEvents<const TAbi extends Abi | readonly unknown[], TEventName extends ContractEventName<TAbi> | undefined = undefined>(
    publicClient: PublicClient,
    params: Omit<GetContractEventsParameters<TAbi, TEventName>, 'fromBlock' | 'toBlock'>,
): Promise<GetContractEventsReturnType<TAbi, TEventName>> {
    const latest = await publicClient.getBlockNumber();
    const out: GetContractEventsReturnType<TAbi, TEventName>[number][] = [];
    for (let from = SCAN_FROM_BLOCK; from <= latest; from += SCAN_CHUNK_BLOCKS) {
        const to = from + SCAN_CHUNK_BLOCKS - 1n < latest ? from + SCAN_CHUNK_BLOCKS - 1n : latest;
        const page = await publicClient.getContractEvents<TAbi, TEventName>({ ...params, fromBlock: from, toBlock: to } as GetContractEventsParameters<TAbi, TEventName>);
        out.push(...page);
    }
    return out as GetContractEventsReturnType<TAbi, TEventName>;
}
/** The active e2e chain — Anvil unless `E2E_CHAIN=sepolia`. (The identifier
 *  predates the switch; it names the devnet default every spec assumes.) */
export const LOCAL_ANVIL = defineChain({
    id: E2E_CHAIN === 'sepolia' ? 11155111 : 31337,
    name: E2E_CHAIN === 'sepolia' ? 'Sepolia' : 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
        default: { http: [RPC_URL] },
    },
});

// ── Shared devnet preamble ───────────────────────────────────────────────────
// The chain, a read client, the common ABI fragments, and the per-test snapshot
// wiring that every spec was re-declaring (the bulk of the e2e clone %). Import
// these instead of restamping a LOCAL_ANVIL / createPublicClient / parseAbi block
// at the top of each spec.

/** A read-only viem client on the local Anvil chain. */
export function localPublicClient() {
    return createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
}


type DeploymentConfig = {
    figaroCore?: `0x${string}`;
    tokenAddress?: `0x${string}`;
    permitTokenAddress?: `0x${string}`;
    attestationCoordinator?: `0x${string}`;
    witnessSwapAndCommitCoordinator?: `0x${string}`;
    permit2?: `0x${string}`;
    swapRouter?: `0x${string}`;
    swapQuoter?: `0x${string}`;
    multisender?: `0x${string}`;
    clauseRegistry?: `0x${string}`;
    clauseRegistrationHelper?: `0x${string}`;
    membersRegistry?: `0x${string}`;
    assemblyRegistry?: `0x${string}`;
    florinToken?: `0x${string}`;
    usageCounter?: `0x${string}`;
    rpgfMinter?: `0x${string}`;
    daoTreasury?: `0x${string}`;
};

export function readLocalDeploymentConfig(): DeploymentConfig {
    // Sepolia: the committed public record is the source (never .env.local,
    // which is the devnet's); the ruled settlement token rides SEPOLIA_USDC.
    if (E2E_CHAIN === 'sepolia') {
        const recordPath = path.resolve(__dirname, '../../../deployments/11155111.json');
        const record = JSON.parse(fs.readFileSync(recordPath, 'utf8')) as DeploymentConfig;
        return {
            ...record,
            tokenAddress: (process.env.SEPOLIA_USDC ?? process.env.SMOKE_TOKEN) as `0x${string}` | undefined,
            permit2: (process.env.NEXT_PUBLIC_PERMIT2 ?? '0x000000000022D473030F116dDEE9F6B43aC78BA3') as `0x${string}`,
        };
    }
    const envPath = path.resolve(__dirname, '../../.env.local');
    const deploymentPath = path.resolve(__dirname, '../../../.deployments/local.json');
    const config: DeploymentConfig = {};

    if (fs.existsSync(envPath)) {
        const contents = fs.readFileSync(envPath, 'utf8');
        for (const line of contents.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eq = trimmed.indexOf('=');
            if (eq === -1) continue;
            const key = trimmed.slice(0, eq).trim();
            const value = trimmed.slice(eq + 1).trim() as `0x${string}`;
            if (key === 'NEXT_PUBLIC_FIGARO_CORE') config.figaroCore = value;
            if (key === 'NEXT_PUBLIC_TOKEN_ADDRESS') config.tokenAddress = value;
            if (key === 'NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS') config.permitTokenAddress = value;
            if (key === 'NEXT_PUBLIC_ATTESTATION_COORDINATOR') config.attestationCoordinator = value;
            if (key === 'NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR') config.witnessSwapAndCommitCoordinator = value;
            if (key === 'NEXT_PUBLIC_PERMIT2') config.permit2 = value;
            if (key === 'NEXT_PUBLIC_SWAP_ROUTER') config.swapRouter = value;
            if (key === 'NEXT_PUBLIC_SWAP_QUOTER') config.swapQuoter = value;
            if (key === 'NEXT_PUBLIC_MULTISENDER') config.multisender = value;
            if (key === 'NEXT_PUBLIC_CLAUSE_REGISTRY') config.clauseRegistry = value;
            if (key === 'NEXT_PUBLIC_CLAUSE_REGISTRATION_HELPER') config.clauseRegistrationHelper = value;
            if (key === 'NEXT_PUBLIC_MEMBERS_REGISTRY') config.membersRegistry = value;
            if (key === 'NEXT_PUBLIC_ASSEMBLY_REGISTRY') config.assemblyRegistry = value;
            if (key === 'NEXT_PUBLIC_FLORIN_TOKEN_ADDRESS') config.florinToken = value;
            if (key === 'NEXT_PUBLIC_USAGE_COUNTER') config.usageCounter = value;
            if (key === 'NEXT_PUBLIC_RPGF_MINTER') config.rpgfMinter = value;
            if (key === 'NEXT_PUBLIC_DAO_TREASURY') config.daoTreasury = value;
        }
    }

    if (fs.existsSync(deploymentPath)) {
        const contents = JSON.parse(fs.readFileSync(deploymentPath, 'utf8')) as DeploymentConfig;
        config.figaroCore = config.figaroCore ?? contents.figaroCore;
        config.tokenAddress = config.tokenAddress ?? contents.tokenAddress;
        config.attestationCoordinator = config.attestationCoordinator ?? (contents as any).attestationCoordinator;
        config.clauseRegistry = config.clauseRegistry ?? (contents as any).clauseRegistry;
        config.clauseRegistrationHelper = config.clauseRegistrationHelper ?? (contents as any).clauseRegistrationHelper;
        config.membersRegistry = config.membersRegistry ?? contents.membersRegistry;
        config.assemblyRegistry = config.assemblyRegistry ?? (contents as any).assemblyRegistry;
    }

    return config;
}


// evmSnapshot/evmRevert were removed — devnet is a mainnet REHEARSAL, so specs
// leave their state on-chain and stay idempotent via a per-run nonce (see
// probeAssembly.ts), never evm_snapshot/evm_revert (lint-no-devnet-revert).
// (evmIncreaseTime followed when the registry time locks were deleted — K4:
// no time-locked path remains to exercise.)


/** MembersRegistry ABI fragment for seedRegisteredMember. Local copy keeps
 *  the seed helper independent of the frontend's full ABI export. */
const MEMBERS_REGISTRY_REGISTER_ABI = parseAbi([
    'function register(string metadataURI) external payable',
    'function updateProfile(string metadataURI) external',
    'event MemberRegistered(address indexed member, string metadataURI)',
    // The DE-SURFACING event. `MemberWithdrawn` is the later custody event and
    // must not be used to decide whether an address is currently registered.
    'event MemberWithdrawalRequested(address indexed member, uint256 amount, uint256 releaseAt)',
]);

const MEMBER_REGISTRATION_DEPOSIT = parseEther('0.001');

/** Minimal profile shape for `seedRegisteredMember`. Mirrors the required
 *  + most-common fields of `MemberProfileMetadata` so callers can author
 *  a registration JSON without pulling the full frontend metadata type. */
export interface SeedMemberProfile {
    name: string;
    description?: string;
    specialty?: string;
    catalogueURI?: string;
    location?: { geohash?: string };
    acceptedTokens?: Array<{ address: `0x${string}`; symbol: string; chainId: number }>;
    defaultTokenAddress?: `0x${string}`;
    /** The assemblies this seller adopts. The assembly-driven checkout only
     *  enables place-order for a seller whose profile binds a PUBLISHED
     *  assembly — a profile without bindings is browse-only. */
    assemblyBindings?: Array<{
        bindingId: string;
        subjectAddress: `0x${string}`;
        assemblySlug: string;
        counterpartyBindings: Array<{ clauseId: string; addresses: string[] }>;
    }>;
    /** Agent service endpoints (`MemberAgentServices`) — a declared `rest`
     *  makes the wallet an AGENT candidate: race/quote drafts POST there. */
    services?: { mcp?: string; a2a?: string; rest?: string; did?: string; ens?: string };
    /** The buyer's assembly SUBSCRIPTIONS — the deal-shapes this member buys
     *  through and monetizes records from (independent of the bindings). */
    buyerAssemblies?: Array<{ compositionHash: `0x${string}` }>;
    /** The member's data-disclosure policy — the data offered
     *  (assembly compositionHash × clauseId × posture). */
    disclosurePolicy?: Array<{
        compositionHash: `0x${string}`;
        clauseId: string;
        posture: 'buyer' | 'seller';
        offered: boolean;
        whitelist?: `0x${string}`[];
        calendar?: { embargoDaysAfterSettlement?: number };
    }>;
}

/** Result of `seedRegisteredMember`. Includes the on-chain address (derived
 *  from the wallet key) and the IPFS URI of the pinned profile JSON. */
export interface SeededSeller {
    address: `0x${string}`;
    profileURI: string;
    profileCid: string;
}

/**
 * Pin a fresh member profile JSON to local Kubo and register the wallet
 * on `MembersRegistry`. Pairs with `merchant-page.devnet.spec.ts`'s
 * inline seeder (which inlines this for the catalogue+merchant case); the
 * helper here is the generic "any registered seller" seed, used by
 * Phase 4 C4 to set up the `/members/edit/*` UI tests (those routes
 * require a real IPFS-pinned profile so `MemberEditProfile` can mount
 * the form).
 *
 * Requires Kubo running at NEXT_PUBLIC_IPFS_API_URL (default
 * http://127.0.0.1:5001) and `./deploy-local.sh` having populated
 * NEXT_PUBLIC_MEMBERS_REGISTRY.
 */
export async function seedRegisteredMember(opts: {
    walletKey: `0x${string}`;
    profile: SeedMemberProfile;
}): Promise<SeededSeller> {
    const localConfig = readLocalDeploymentConfig();
    const membersRegistry = (process.env.NEXT_PUBLIC_MEMBERS_REGISTRY
        ?? localConfig.membersRegistry) as `0x${string}` | undefined;
    if (!membersRegistry) {
        throw new Error('NEXT_PUBLIC_MEMBERS_REGISTRY not set — run ./deploy-local.sh');
    }

    const seller = privateKeyToAccount(opts.walletKey);

    // Pin the profile JSON. Frontend's MemberEditProfile.tsx fetches this
    // URI via gateway and parses with `tryParseMemberProfileDocument`, so
    // the shape must satisfy that parser. Required field: `name`.
    const profileDoc = {
        subjectAddress: seller.address,
        ...opts.profile,
    };
    const { cid, uri: profileURI } = await pinJSONToIPFS(profileDoc);

    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const sellerClient = createWalletClient({ account: seller, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    // Idempotent on the PERSISTED devnet: `register` reverts AlreadyRegistered
    // on a second call, so re-runs route through `updateProfile` (profile
    // updates are by design). Registered-or-not is read from the event stream
    // — the network is the source of truth, the contract exposes no view. A
    // wallet is registered iff registrations OUTNUMBER withdrawals (the
    // withdraw spec's wallet cycles register→withdraw every run).
    const [priorRegistrations, priorWithdrawals] = await Promise.all([
        publicClient.getContractEvents({
            address: membersRegistry,
            abi: MEMBERS_REGISTRY_REGISTER_ABI,
            eventName: 'MemberRegistered',
            args: { member: seller.address },
            fromBlock: 0n,
        }),
        publicClient.getContractEvents({
            address: membersRegistry,
            abi: MEMBERS_REGISTRY_REGISTER_ABI,
            eventName: 'MemberWithdrawalRequested',
            args: { member: seller.address },
            fromBlock: 0n,
        }),
    ]);
    if (priorRegistrations.length > priorWithdrawals.length) {
        // account = the ACCOUNT OBJECT, not the address: viem then signs
        // locally and broadcasts raw, so the helper works for any walletKey —
        // an address-only account asks the node to sign, which only succeeds
        // for anvil's own unlocked (globally shared) accounts.
        const { request } = await publicClient.simulateContract({
            account: seller,
            address: membersRegistry,
            abi: MEMBERS_REGISTRY_REGISTER_ABI,
            functionName: 'updateProfile',
            args: [profileURI],
        });
        await publicClient.waitForTransactionReceipt({ hash: await sellerClient.writeContract(request) });
    } else {
        const { request } = await publicClient.simulateContract({
            account: seller,
            address: membersRegistry,
            abi: MEMBERS_REGISTRY_REGISTER_ABI,
            functionName: 'register',
            args: [profileURI],
            value: MEMBER_REGISTRATION_DEPOSIT,
        });
        await publicClient.waitForTransactionReceipt({ hash: await sellerClient.writeContract(request) });
    }

    return {
        address: seller.address as `0x${string}`,
        profileURI,
        profileCid: cid,
    };
}

/**
 * Pin a JSON document to the local Kubo daemon and return the CID + ipfs URI.
 *
 * Mirrors what `ipfsService.publishJSON` does in the browser, but talks to
 * Kubo from Node directly. Used by devnet tests that need to seed an
 * member profile or catalogue document in IPFS without walking the
 * full onboarding wizard.
 */
export async function pinJSONToIPFS(data: unknown): Promise<{ cid: string; uri: string }> {
    const form = new FormData();
    form.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }));
    // A public network pins through the managed pin service (the same
    // two-backend adapter `lib/shared/ipfsService.ts` and the seeding scripts
    // use); the devnet pins to local Kubo.
    const jwt = process.env.IPFS_PIN_SERVICE_JWT ?? '';
    if (E2E_CHAIN === 'sepolia' && jwt) {
        const api = (process.env.IPFS_PIN_SERVICE_API ?? 'https://api.pinata.cloud').replace(/\/$/, '');
        const res = await fetch(`${api}/pinning/pinFileToIPFS`, { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: form });
        if (!res.ok) throw new Error(`pin service pin failed: ${res.status} ${res.statusText}`);
        const result = await res.json() as { IpfsHash?: string };
        if (typeof result.IpfsHash !== 'string' || !result.IpfsHash) throw new Error('pin service returned no CID');
        return { cid: result.IpfsHash, uri: `ipfs://${result.IpfsHash}` };
    }
    const apiUrl = process.env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
    const res = await fetch(`${apiUrl}/api/v0/add?pin=true`, { method: 'POST', body: form });
    if (!res.ok) {
        throw new Error(`IPFS pin failed: ${res.status} ${res.statusText}`);
    }
    const result = await res.json() as { Hash?: string };
    if (typeof result.Hash !== 'string' || !result.Hash) {
        throw new Error('IPFS pin returned no CID');
    }
    return { cid: result.Hash, uri: `ipfs://${result.Hash}` };
}

// ── Standard scenario-authoring verification ────────────────────────────────
// After a scenario test publishes an assembly, mainnet-compliance means it must
// be (1) anchored on-chain, (2) PINNED in IPFS, and (3) SURFACED on /assemblies.
// (1) is a getContractEvents check in the spec; (2) and (3) are these helpers,
// meant to be called by every scenario-<slug> authoring spec.

/**
 * Assert a CID is PINNED in the local Kubo node — proof the publish actually
 * persisted to IPFS, not that a CID was merely computed or a gateway served it
 * from cache. Mirrors `ipfs pin ls <cid>` against the Kubo HTTP API.
 */
export async function assertPinnedInIpfs(cid: string): Promise<void> {
    if (E2E_CHAIN === 'sepolia') {
        // No pin/ls on a managed service from a scoped key: the out-of-band
        // proof is the PUBLIC gateway serving the bytes (the site's own read
        // path), which a merely-computed CID never passes.
        const gateway = (process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? 'https://ipfs.io').replace(/\/$/, '');
        await expect.poll(async () => {
            const res = await fetch(`${gateway}/ipfs/${cid}`).catch(() => null);
            return res?.ok ?? false;
        }, { timeout: 420_000, intervals: [10_000], message: `CID ${cid} resolves on ${gateway}` }).toBe(true);
        return;
    }
    const apiUrl = process.env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
    const res = await fetch(`${apiUrl}/api/v0/pin/ls?arg=${encodeURIComponent(cid)}`, { method: 'POST' });
    if (!res.ok) {
        throw new Error(
            `IPFS pin/ls failed for ${cid}: ${res.status} ${res.statusText} — not pinned in the local Kubo node`,
        );
    }
    const body = await res.json() as { Keys?: Record<string, { Type?: string }> };
    expect(body.Keys?.[cid], `CID ${cid} must be pinned in the local Kubo node`).toBeTruthy();
}





// ── Mainnet-faithful seller discovery ───────────────────────────────────────
// Runtime specs must consume sellers the way a mainnet client does: read
// MembersRegistry events, fetch each seller's profile from IPFS, and match on the
// on-chain `assemblyBindings`. NO roster, NO hardcoded addresses/names/keys — a
// spec that takes seller identity from a TS file is not testing mainnet usage.
// (This mirrors what the indexer / `discoveryService` does; it additionally keeps
// the `assemblyBindings` that the buyer-facing `MemberCatalogue` projection drops.)

/** MembersRegistry registration events — carry the profile metadataURI. Internal
 *  to discovery; read by `discoverMembers`. */
const MEMBER_REGISTERED_EVENT_ABI = parseAbi([
    'event MemberRegistered(address indexed member, string metadataURI)',
    'event MemberProfileUpdated(address indexed member, string metadataURI)',
    // De-surfacing is the REQUEST, not the later ETH release: a member who has
    // left is gone from discovery immediately while their deposit is still in
    // cooldown. Counting `MemberWithdrawn` here would keep them discoverable for
    // that whole window.
    'event MemberWithdrawalRequested(address indexed member, uint256 amount, uint256 releaseAt)',
]);

export interface DiscoveredMember {
    address: `0x${string}`;
    name: string;
    /** The seller's home geohash (profile.location.geohash), discovered from IPFS. */
    geohash?: string;
    assemblyBindings: Array<{
        assemblySlug: string;
        counterpartyBindings?: Array<{ clauseId: string; addresses: string[] }>;
    }>;
}

/** Every LIVE registered seller, discovered from chain → IPFS (events +
 *  profile docs). Mainnet-realistic tolerance: a wallet that has left is skipped
 *  (registrations must outnumber withdrawal REQUESTS), a profile that fails to
 *  fetch or parse is skipped rather than crashing discovery — anyone can
 *  register a garbage URI; consumers must tolerate it — and the live profile
 *  is the most recent `MemberProfileUpdated` post-dating the surviving
 *  registration (mirrors `lib/kernel/indexer.ts`; `updateProfile` is a
 *  by-design MembersRegistry surface). */
export async function discoverMembers(): Promise<DiscoveredMember[]> {
    const publicClient = localPublicClient();
    const config = readLocalDeploymentConfig();
    const membersRegistry = (process.env.NEXT_PUBLIC_MEMBERS_REGISTRY ?? config.membersRegistry) as `0x${string}`;
    const [events, updates, withdrawals] = await Promise.all([
        publicClient.getContractEvents({
            address: membersRegistry, abi: MEMBER_REGISTERED_EVENT_ABI, eventName: 'MemberRegistered', fromBlock: 0n,
        }),
        publicClient.getContractEvents({
            address: membersRegistry, abi: MEMBER_REGISTERED_EVENT_ABI, eventName: 'MemberProfileUpdated', fromBlock: 0n,
        }),
        publicClient.getContractEvents({
            address: membersRegistry, abi: MEMBER_REGISTERED_EVENT_ABI, eventName: 'MemberWithdrawalRequested', fromBlock: 0n,
        }),
    ]);
    const withdrawnCount = new Map<string, number>();
    for (const w of withdrawals) {
        const a = ((w.args as { member?: string }).member ?? '').toLowerCase();
        withdrawnCount.set(a, (withdrawnCount.get(a) ?? 0) + 1);
    }
    const updatesByAddr = new Map<string, Array<{ uri: string; block: bigint; logIndex: number }>>();
    for (const u of updates) {
        const a = ((u.args as { member?: string }).member ?? '').toLowerCase();
        const list = updatesByAddr.get(a) ?? [];
        list.push({
            uri: (u.args as { metadataURI?: string }).metadataURI ?? '',
            block: u.blockNumber ?? 0n,
            logIndex: u.logIndex ?? 0,
        });
        updatesByAddr.set(a, list);
    }
    const registeredCount = new Map<string, number>();
    const out: DiscoveredMember[] = [];
    for (const ev of events) {
        const address = (ev.args as { member: `0x${string}` }).member;
        const key = address.toLowerCase();
        registeredCount.set(key, (registeredCount.get(key) ?? 0) + 1);
        if ((registeredCount.get(key) ?? 0) <= (withdrawnCount.get(key) ?? 0)) continue;
        // Live profile URI = max over (this registration, post-dating updates)
        // by (block, logIndex); updates pre-dating the surviving registration
        // (e.g. before a withdraw→re-register cycle) never win.
        let uri = (ev.args as { metadataURI?: string }).metadataURI ?? '';
        let latest = { block: ev.blockNumber ?? 0n, logIndex: ev.logIndex ?? 0 };
        for (const u of updatesByAddr.get(key) ?? []) {
            if (u.block > latest.block || (u.block === latest.block && u.logIndex > latest.logIndex)) {
                uri = u.uri;
                latest = { block: u.block, logIndex: u.logIndex };
            }
        }
        let profile: {
            name?: string;
            location?: { geohash?: string };
            assemblyBindings?: DiscoveredMember['assemblyBindings'];
        };
        try {
            profile = await (await fetch(resolveIpfsURI(uri))).json();
        } catch {
            continue; // unresolvable / non-JSON profile — not discoverable
        }
        out.push({
            address,
            name: profile.name ?? '',
            geohash: profile.location?.geohash,
            assemblyBindings: profile.assemblyBindings ?? [],
        });
    }
    return out;
}




/** The latest profile URI a member anchored on MembersRegistry (registration
 *  or the most recent update), read from events — the out-of-band truth specs
 *  verify gate effects against. */
export async function latestMemberProfileURI(member: `0x${string}`): Promise<string | undefined> {
    const publicClient = localPublicClient();
    const config = readLocalDeploymentConfig();
    const membersRegistry = (process.env.NEXT_PUBLIC_MEMBERS_REGISTRY ?? config.membersRegistry) as `0x${string}`;
    const [registrations, updates] = await Promise.all([
        publicClient.getContractEvents({
            address: membersRegistry, abi: MEMBER_REGISTERED_EVENT_ABI, eventName: 'MemberRegistered',
            args: { member }, fromBlock: 0n,
        }),
        publicClient.getContractEvents({
            address: membersRegistry, abi: MEMBER_REGISTERED_EVENT_ABI, eventName: 'MemberProfileUpdated',
            args: { member }, fromBlock: 0n,
        }),
    ]);
    return [...registrations, ...updates]
        .sort((a, b) => Number(a.blockNumber - b.blockNumber))
        .at(-1)?.args.metadataURI as string | undefined;
}

/** A seller's live assembly bindings, read from its latest pinned profile
 *  (chain events → IPFS). Empty when unregistered or unresolvable. */
export async function memberProfileBindings(
    seller: `0x${string}`,
): Promise<DiscoveredMember['assemblyBindings']> {
    const uri = await latestMemberProfileURI(seller);
    if (!uri) return [];
    try {
        const doc = await (await fetch(resolveIpfsURI(uri))).json() as {
            assemblyBindings?: DiscoveredMember['assemblyBindings'];
        };
        return doc.assemblyBindings ?? [];
    } catch {
        return [];
    }
}

/** Confirm the buyer's agreement-preview gate once per ORDER until the share
 *  panel (the root's relay surface) appears. Every modal shares one testid
 *  and the next can replace the last faster than a hidden-state observation
 *  (the multi-order walk signs sub-orders back to back), so each confirm is
 *  keyed on the DISPLAYED agreementHash — one confirm per distinct hash. */
export async function confirmAgreementPreviews(
    page: import('@playwright/test').Page,
    expectedOrders: number,
): Promise<void> {
    const confirmed = new Set<string>();
    for (let i = 0; i < 600; i++) {
        if (await page.getByTestId('buyer-share-panel').isVisible().catch(() => false)) break;
        const modal = page.getByTestId('agreement-preview-modal');
        if (i === 0) await modal.waitFor({ state: 'visible', timeout: 60000 });
        // Short-timeout read: between modals (or after the last one) there is
        // nothing to read — an unbounded locator read would block the loop
        // right past the share panel's arrival.
        const hash = (await page.getByTestId('preview-agreement-hash')
            .textContent({ timeout: 500 })
            .catch(() => null))?.trim();
        if (!hash || confirmed.has(hash)) continue; // same modal (or between modals) — poll on
        expect(confirmed.size, 'the confirm gate never shows more modals than orders')
            .toBeLessThan(expectedOrders);
        confirmed.add(hash);
        await page.getByTestId('preview-confirm').click();
    }
    await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
    expect(confirmed.size, `the buyer confirmed all ${expectedOrders} orders through the gate`)
        .toBe(expectedOrders);
}

/** An anchored assembly with its template's agreement list resolved — enough
 *  for a spec to select an assembly by SHAPE (agreement count, clause ids)
 *  instead of a hardcoded slug. */
export interface DiscoveredAssembly {
    slug: string;
    compositionHash: `0x${string}`;
    agreements: Array<{ id?: string; clauses?: Record<string, unknown> }>;
}

/** The slug of a REFERENCE assembly identified by its IDENTITY — the
 *  compositionHash over its canonical composition, the same one
 *  populate-test-data anchors it under. An assembly IS its composition; it is
 *  never a "kind" inferred from which clauses it happens to carry, so a spec
 *  that wants a SPECIFIC template must name it by identity, never select it with
 *  a clause-shape heuristic (which is closed-world AND ambiguous — several
 *  single-order compositions share the same shape). `name` is the file in
 *  `assemblies/`. */
export function referenceAssemblySlug(name: string): string {
    const template = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, '../../../assemblies', name), 'utf8'),
    );
    return deriveAssemblySlug(templateCompositionHash(template));
}

/** Identity of a reference that composes `figaro-utility-token` (the
 *  assembly-scoped designer currency pin, ruled 2026-07-28): its checked-in
 *  copy carries the ZERO_ADDRESS sentinel (a live token address is new every
 *  fresh deploy, so `assemblies/*.json` cannot ship a real one) — mirrors
 *  `populate-test-data.mjs`'s `fillDeployTimeCurrency`, which substitutes the
 *  live deployment's token address into the sentinel BEFORE anchoring. A spec
 *  wanting such a reference's slug must hash the SUBSTITUTED template — the
 *  raw file's hash never matches what's anchored. `name` is the file in
 *  `assemblies/`. */
export function referenceAssemblySlugWithLiveCurrency(name: string, tokenAddress: `0x${string}`): string {
    const template = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, '../../../assemblies', name), 'utf8'),
    );
    const pin = template.assemblyClauses?.['figaro-utility-token'];
    if (pin?.currency === ZERO_ADDRESS) {
        template.assemblyClauses['figaro-utility-token'] = { ...pin, currency: tokenAddress };
    }
    return deriveAssemblySlug(templateCompositionHash(template));
}

/** Every anchored assembly, discovered from chain → IPFS (AssemblyRegistered
 *  events + template docs), in anchoring order. Mainnet-realistic tolerance:
 *  a template that fails to fetch or parse is skipped — anyone can anchor a
 *  garbage URI; consumers must tolerate it. */
export async function discoverAnchoredAssemblies(): Promise<DiscoveredAssembly[]> {
    const publicClient = localPublicClient();
    const config = readLocalDeploymentConfig();
    const assemblyRegistry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY ?? config.assemblyRegistry ?? '') as `0x${string}`;
    const anchored = await publicClient.getContractEvents({
        address: assemblyRegistry, abi: ASSEMBLY_REGISTRY_ABI,
        eventName: 'AssemblyRegistered', fromBlock: 0n,
    });
    const out: DiscoveredAssembly[] = [];
    for (const ev of anchored) {
        const { compositionHash, contentURI } = ev.args as { compositionHash?: `0x${string}`; contentURI?: string };
        if (!compositionHash || !contentURI) continue;
        try {
            const doc = await (await fetch(resolveIpfsURI(contentURI))).json() as { agreements?: DiscoveredAssembly['agreements'] };
            if (Array.isArray(doc.agreements) && doc.agreements.length > 0) {
                out.push({ slug: deriveAssemblySlug(compositionHash), compositionHash, agreements: doc.agreements });
            }
        } catch {
            continue; // unresolvable / non-JSON template — not discoverable
        }
    }
    return out;
}

/** A process-log LADDER's stage labels, read from the clause's chain-anchored
 *  spec (registry event → IPFS): the enum field's values via its valueLabels.
 *  The labels the capability rail renders — walk a ladder by asserting them
 *  in order. (Lifted from local-commerce; consumers: local-commerce,
 *  tradelens-runtime.) */
export async function ladderLabelsFromChain(
    publicClient: ReturnType<typeof createPublicClient>,
    registry: `0x${string}`,
    clauseId: string,
): Promise<string[]> {
    const events = await publicClient.getContractEvents({
        address: registry, abi: CLAUSE_REGISTRY_ABI, eventName: 'ClauseRegistered', fromBlock: 0n,
    });
    const reg = events.filter((e) => (e.args as { clauseId?: string }).clauseId === clauseId).pop();
    if (!reg) throw new Error(`${clauseId} is not anchored on ClauseRegistry`);
    const ipfsApi = process.env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
    const cid = ((reg.args as { contentURI?: string }).contentURI as string).replace(/^ipfs:\/\//, '');
    const spec = await (await fetch(`${ipfsApi}/api/v0/cat?arg=${cid}`, { method: 'POST' })).json() as {
        fields: { type: string; values?: string[]; valueLabels?: Record<string, string> }[];
    };
    const ladder = spec.fields.find((f) => f.type === 'enum');
    if (!ladder?.values) throw new Error(`${clauseId} declares no enum ladder`);
    return ladder.values.map((v) => ladder.valueLabels?.[v] ?? v);
}

/** Resolve an `ipfs://` URI to a Kubo-gateway URL. */
export function resolveIpfsURI(uri: string): string {
    const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? 'http://127.0.0.1:8080';
    return uri.startsWith('ipfs://')
        ? `${gateway}/ipfs/${uri.slice('ipfs://'.length)}`
        : uri;
}








// ── The DELIVERY scenario assembly (shared by local-commerce + buyer-assigned) ─
// One composition, one content-addressed identity: the seller-assigned and
// buyer-assigned runtimes are the SAME assembly adopted differently (a binding
// WITH a courier designation vs one WITHOUT — coordination is an adoption
// property, not stored composition, post the figaro-coordination retirement).

export const DELIVERY_CLAUSES = {
    merchant: 'figaro-merchant-process',
    courier: 'figaro-courier-process',
    modalities: 'figaro-modalities',
    handoff: 'figaro-handoff',
    geo: 'figaro-geolocation',
    proximity: 'figaro-proximity-policy',
} as const;

/** The Playwright-pinned device location the geolocation clause's device
 *  affordance reads at authoring time, and the typed destination cell. */
export const DELIVERY_DEVICE = { lat: 37.7749, lon: -122.4194, destination: '9q8yyk' } as const;

/** A checkout-view general-clause field control, suffix-matched — the testid
 *  is `checkout-field-<orderId>-<clauseId>-<field>[-<option>]` and the
 *  template-local order id varies per assembly. */
function checkoutField(page: Page, clauseId: string, fieldPath: string) {
    return page.locator(`[data-testid^="checkout-field-"][data-testid$="-${clauseId}-${fieldPath}"]`).first();
}

/** Fill the delivery assembly's GENERAL-clause transaction particulars on the
 *  buyer's checkout view. Design time is STRUCTURAL (ruled 2026-07-14):
 *  templates arrive value-free by construction; the buyer authors the
 *  modality request, the hand-off mode, the proximity band, and the
 *  geolocation endpoints HERE. Call after `checkout-view` renders, before
 *  placing the order. */
export async function fillDeliveryCheckout(page: Page): Promise<void> {
    await checkoutField(page, DELIVERY_CLAUSES.modalities, 'modality-delivery').check();
    await checkoutField(page, DELIVERY_CLAUSES.handoff, 'handoff-face-to-face').check();
    await checkoutField(page, DELIVERY_CLAUSES.proximity, 'bands-zone-wifi').check();
    // geocodeStandard arrives PREFILLED from the spec's default ("geohash" —
    // the built frontend); the endpoints fill as text. The format-keyed
    // device-capture control retired with the standards generalisation
    // (2026-07-28); its successor is standard-gated (punch-listed).
    await checkoutField(page, DELIVERY_CLAUSES.geo, 'origin')
        .fill(encodeGeohash(DELIVERY_DEVICE.lat, DELIVERY_DEVICE.lon, 6));
    await checkoutField(page, DELIVERY_CLAUSES.geo, 'destination').fill(DELIVERY_DEVICE.destination);
}

/** Wait for ClientInit's devnet auto-connect (the "Connect Wallet" button goes). */
export async function waitForConnected(page: Page): Promise<void> {
    await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
        null,
        { timeout: 30000 },
    );
}

/** The delivery assembly's SHAPE — how every consumer recognizes it on-chain
 *  without a hardcoded slug: exactly two orders, the sub-order carrying the
 *  courier process clause, the hand-off clause (the QR-interaction declarer),
 *  geolocation, AND the proximity policy (the hand-off witness). Internal —
 *  consumers go through `ensureDeliveryAssembly`. */
async function findDeliveryAssembly(): Promise<string | undefined> {
    const templates = await discoverAnchoredAssemblies();
    return templates.find(
        (t) => t.agreements.length === 2
            && t.agreements.some((o) => {
                const clauses = Object.keys(o.clauses ?? {});
                return clauses.includes(DELIVERY_CLAUSES.courier)
                    && clauses.includes(DELIVERY_CLAUSES.handoff)
                    && clauses.includes(DELIVERY_CLAUSES.geo)
                    && clauses.includes(DELIVERY_CLAUSES.proximity);
            }),
    )?.slug;
}

/**
 * Ensure the delivery assembly is ANCHORED — discover it by shape, and when
 * absent AUTHOR it on the real designer canvas and publish (idempotent: the
 * composition is content-addressed, first-write-wins; a re-run adopts).
 * Caller must have granted geolocation permission and pinned the device
 * coordinates (`DELIVERY_DEVICE`) on the browser context. Returns the slug.
 */
export async function ensureDeliveryAssembly(page: Page): Promise<string> {
    let deliverySlug = await findDeliveryAssembly();
    if (!deliverySlug) {
        await page.addInitScript(() => {
            try {
                window.localStorage.removeItem('figaro:designer:current');
                window.localStorage.removeItem('figaro:designer:drafts');
            } catch { /* noop */ }
        });
        await page.goto('/assemblies/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

        const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
        await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
        const rootTestId = await orderNodes.first().getAttribute('data-testid');
        const rootId = rootTestId!.replace('order-node-', '');

        // Root order — the meal: the merchant's process ladder + the buyer's
        // committed delivery request (the modalities clause).
        await orderNodes.first().click();
        await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId('drawer-tab-registry').click();
        await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
        await page.getByTestId(`drawer-registry-clause-${DELIVERY_CLAUSES.merchant}`).check();
        // Design time is STRUCTURAL (ruled 2026-07-14): the designer SELECTS
        // the modalities clause; WHICH modality is the buyer's request — a
        // transaction particular picked at checkout (fillDeliveryCheckout).
        await page.getByTestId(`drawer-registry-clause-${DELIVERY_CLAUSES.modalities}`).check();

        // The courier order is DRAWN — a second co-equal node under the root
        // (never spawned by a checkbox; the drawn edge IS delivery reality).
        await page.getByTestId(`btn-add-suborder-${rootId}`).click();
        await expect(orderNodes).toHaveCount(2, { timeout: 10000 });
        const nodeIds = await orderNodes.evaluateAll((els) =>
            els.map((el) => el.getAttribute('data-testid')!.replace('order-node-', '')));
        const subId = nodeIds.find((id) => id !== rootId)!;

        // Compose the courier's process ladder + the hand-off point + the
        // single-band proximity witness + geolocation on the drawn order.
        await page.getByTestId(`drawer-node-tab-${subId}`).click();
        await page.getByTestId('drawer-tab-registry').click();
        await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
        await page.getByTestId(`drawer-registry-clause-${DELIVERY_CLAUSES.courier}`).check();
        await page.getByTestId(`drawer-registry-clause-${DELIVERY_CLAUSES.handoff}`).check();
        await page
            .getByTestId(`drawer-nested-handoff-${DELIVERY_CLAUSES.proximity}`)
            .getByTestId(`drawer-registry-clause-${DELIVERY_CLAUSES.proximity}`)
            .check();
        await page.getByTestId(`drawer-registry-clause-${DELIVERY_CLAUSES.geo}`).check();
        // The hand-off mode, proximity band, and geohashes are transaction
        // particulars — authored by the buyer at checkout, never here.

        // Editorial identity + publish (pin template → AssemblyRegistered).
        await page.getByTestId('designer-name-input').fill('Local commerce');
        await page.getByTestId('designer-summary-input').fill('Meal/grocery delivery: a merchant order plus one co-equal courier order.');
        await page.getByTestId('designer-description-input').fill('The local-commerce runtime: the buyer orders with the delivery modality; the courier order carries the goods; each transfer is attested; one resolve pays both.');
        await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
        await page.getByTestId('designer-review').click();
        await page.waitForURL(/\/assemblies\/designer\/view\/?\?slug=asm-/, { timeout: 15000 });
        const handle = page.url().match(/[?&]slug=(asm-[a-z0-9-]+)/)?.[1];
        expect(handle, 'review navigated to a draft handle').toBeTruthy();
        await page.goto(`/assemblies/designer/view?slug=${handle}&intent=publish&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        const confirmBtn = page.getByTestId('review-confirm-publish');
        await confirmBtn.waitFor({ state: 'visible', timeout: 15000 });
        await waitForConnected(page);
        await confirmBtn.click();
        await page.getByTestId('assembly-publish-receipt').waitFor({ timeout: 60000 });
        const receiptSlug = (await page.getByTestId('receipt-slug').textContent())?.trim();
        expect(receiptSlug, 'publish receipt shows the content slug').toMatch(/^asm-/);

        deliverySlug = await findDeliveryAssembly();
        expect(deliverySlug, 'the published delivery assembly is discoverable by shape').toBe(receiptSlug);
    }
    return deliverySlug!;
}
