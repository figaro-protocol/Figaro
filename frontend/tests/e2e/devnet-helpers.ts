import fs from 'fs';
import path from 'path';
import { expect } from '@playwright/test';
import {
    createPublicClient,
    createWalletClient,
    defineChain,
    http,
    parseAbi,
    parseEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
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
    attestationCoordinator?: `0x${string}`;
    clauseRegistry?: `0x${string}`;
    clauseRegistrationHelper?: `0x${string}`;
    dutchAuction?: `0x${string}`;
    sellerRegistry?: `0x${string}`;
    assemblyRegistry?: `0x${string}`;
};

export function readLocalDeploymentConfig(): DeploymentConfig {
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
            if (key === 'NEXT_PUBLIC_ATTESTATION_COORDINATOR') config.attestationCoordinator = value;
            if (key === 'NEXT_PUBLIC_CLAUSE_REGISTRY') config.clauseRegistry = value;
            if (key === 'NEXT_PUBLIC_CLAUSE_REGISTRATION_HELPER') config.clauseRegistrationHelper = value;
            if (key === 'NEXT_PUBLIC_DUTCH_AUCTION') config.dutchAuction = value;
            if (key === 'NEXT_PUBLIC_SELLER_REGISTRY') config.sellerRegistry = value;
            if (key === 'NEXT_PUBLIC_ASSEMBLY_REGISTRY') config.assemblyRegistry = value;
        }
    }

    if (fs.existsSync(deploymentPath)) {
        const contents = JSON.parse(fs.readFileSync(deploymentPath, 'utf8')) as DeploymentConfig;
        config.figaroCore = config.figaroCore ?? contents.figaroCore;
        config.tokenAddress = config.tokenAddress ?? contents.tokenAddress;
        config.attestationCoordinator = config.attestationCoordinator ?? (contents as any).attestationCoordinator;
        config.clauseRegistry = config.clauseRegistry ?? (contents as any).clauseRegistry;
        config.clauseRegistrationHelper = config.clauseRegistrationHelper ?? (contents as any).clauseRegistrationHelper;
        config.dutchAuction = config.dutchAuction ?? (contents as any).dutchAuction;
        config.sellerRegistry = config.sellerRegistry ?? contents.sellerRegistry;
        config.assemblyRegistry = config.assemblyRegistry ?? (contents as any).assemblyRegistry;
    }

    return config;
}


// ── Anvil EVM snapshot / revert ──────────────────────────────────────────────

const snapshotClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

export async function evmSnapshot(): Promise<string> {
    return snapshotClient.request({ method: 'evm_snapshot' as any }) as Promise<string>;
}

export async function evmRevert(snapshotId: string): Promise<void> {
    await snapshotClient.request({ method: 'evm_revert' as any, params: [snapshotId] } as any);
}


/** SellerRegistry ABI fragment for seedRegisteredSeller. Local copy keeps
 *  the seed helper independent of the frontend's full ABI export. */
const SELLER_REGISTRY_REGISTER_ABI = parseAbi([
    'function register(string metadataURI) external payable',
    'function updateProfile(string metadataURI) external',
    'event SellerRegistered(address indexed seller, string metadataURI)',
    'event SellerWithdrawn(address indexed seller, uint256 deposit)',
]);

const SELLER_REGISTRATION_DEPOSIT = parseEther('0.001');

/** Minimal profile shape for `seedRegisteredSeller`. Mirrors the required
 *  + most-common fields of `SellerProfileMetadata` so callers can author
 *  a registration JSON without pulling the full frontend metadata type. */
export interface SeedSellerProfile {
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
}

/** Result of `seedRegisteredSeller`. Includes the on-chain address (derived
 *  from the wallet key) and the IPFS URI of the pinned profile JSON. */
export interface SeededSeller {
    address: `0x${string}`;
    profileURI: string;
    profileCid: string;
}

/**
 * Pin a fresh seller profile JSON to local Kubo and register the wallet
 * on `SellerRegistry`. Pairs with `merchant-page.devnet.spec.ts`'s
 * inline seeder (which inlines this for the catalogue+merchant case); the
 * helper here is the generic "any registered seller" seed, used by
 * Phase 4 C4 to set up the `/sellers/edit/*` UI tests (those routes
 * require a real IPFS-pinned profile so `SellerEditProfile` can mount
 * the form).
 *
 * Requires Kubo running at NEXT_PUBLIC_IPFS_API_URL (default
 * http://127.0.0.1:5001) and `./deploy-local.sh` having populated
 * NEXT_PUBLIC_SELLER_REGISTRY.
 */
export async function seedRegisteredSeller(opts: {
    walletKey: `0x${string}`;
    profile: SeedSellerProfile;
}): Promise<SeededSeller> {
    const localConfig = readLocalDeploymentConfig();
    const sellerRegistry = (process.env.NEXT_PUBLIC_SELLER_REGISTRY
        ?? localConfig.sellerRegistry) as `0x${string}` | undefined;
    if (!sellerRegistry) {
        throw new Error('NEXT_PUBLIC_SELLER_REGISTRY not set — run ./deploy-local.sh');
    }

    const seller = privateKeyToAccount(opts.walletKey);

    // Pin the profile JSON. Frontend's SellerEditProfile.tsx fetches this
    // URI via gateway and parses with `tryParseSellerProfileDocument`, so
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
            address: sellerRegistry,
            abi: SELLER_REGISTRY_REGISTER_ABI,
            eventName: 'SellerRegistered',
            args: { seller: seller.address },
            fromBlock: 0n,
        }),
        publicClient.getContractEvents({
            address: sellerRegistry,
            abi: SELLER_REGISTRY_REGISTER_ABI,
            eventName: 'SellerWithdrawn',
            args: { seller: seller.address },
            fromBlock: 0n,
        }),
    ]);
    if (priorRegistrations.length > priorWithdrawals.length) {
        const { request } = await publicClient.simulateContract({
            account: seller.address,
            address: sellerRegistry,
            abi: SELLER_REGISTRY_REGISTER_ABI,
            functionName: 'updateProfile',
            args: [profileURI],
        });
        await publicClient.waitForTransactionReceipt({ hash: await sellerClient.writeContract(request) });
    } else {
        const { request } = await publicClient.simulateContract({
            account: seller.address,
            address: sellerRegistry,
            abi: SELLER_REGISTRY_REGISTER_ABI,
            functionName: 'register',
            args: [profileURI],
            value: SELLER_REGISTRATION_DEPOSIT,
        });
        await publicClient.waitForTransactionReceipt({ hash: await sellerClient.writeContract(request) });
    }

    return {
        address: seller.address as `0x${string}`,
        profileURI,
        profileCid: cid,
    };
}

// The fig-claims disk-fixture helpers (write/clearFigClaimsFixture) were
// buried 2026-06-12: the prod-build e2e webServer serves only build-time
// public/ assets (a post-build write 404s), so fig-claim-ui.devnet.spec.ts
// simulates the build-time allocation artifact via page.route instead.


/**
 * Pin a JSON document to the local Kubo daemon and return the CID + ipfs URI.
 *
 * Mirrors what `ipfsService.publishJSON` does in the browser, but talks to
 * Kubo from Node directly. Used by devnet tests that need to seed an
 * seller profile or catalogue document in IPFS without walking the
 * full onboarding wizard.
 */
export async function pinJSONToIPFS(data: unknown): Promise<{ cid: string; uri: string }> {
    const apiUrl = process.env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
    const form = new FormData();
    form.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }));
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
// SellerRegistry events, fetch each seller's profile from IPFS, and match on the
// on-chain `assemblyBindings`. NO roster, NO hardcoded addresses/names/keys — a
// spec that takes seller identity from a TS file is not testing mainnet usage.
// (This mirrors what the indexer / `discoveryService` does; it additionally keeps
// the `assemblyBindings` that the buyer-facing `SellerCatalogue` projection drops.)

/** SellerRegistry registration events — carry the profile metadataURI. Internal
 *  to discovery; read by `discoverSellers`. */
const SELLER_REGISTERED_EVENT_ABI = parseAbi([
    'event SellerRegistered(address indexed seller, string metadataURI)',
    'event SellerProfileUpdated(address indexed seller, string metadataURI)',
    'event SellerWithdrawn(address indexed seller, uint256 deposit)',
]);

export interface DiscoveredSeller {
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
 *  profile docs). Mainnet-realistic tolerance: a withdrawn wallet is skipped
 *  (registrations must outnumber withdrawals), a profile that fails to
 *  fetch or parse is skipped rather than crashing discovery — anyone can
 *  register a garbage URI; consumers must tolerate it — and the live profile
 *  is the most recent `SellerProfileUpdated` post-dating the surviving
 *  registration (mirrors `lib/core/indexer.ts`; `updateProfile` is a
 *  by-design SellerRegistry surface). */
export async function discoverSellers(): Promise<DiscoveredSeller[]> {
    const publicClient = localPublicClient();
    const config = readLocalDeploymentConfig();
    const sellerRegistry = (process.env.NEXT_PUBLIC_SELLER_REGISTRY ?? config.sellerRegistry) as `0x${string}`;
    const [events, updates, withdrawals] = await Promise.all([
        publicClient.getContractEvents({
            address: sellerRegistry, abi: SELLER_REGISTERED_EVENT_ABI, eventName: 'SellerRegistered', fromBlock: 0n,
        }),
        publicClient.getContractEvents({
            address: sellerRegistry, abi: SELLER_REGISTERED_EVENT_ABI, eventName: 'SellerProfileUpdated', fromBlock: 0n,
        }),
        publicClient.getContractEvents({
            address: sellerRegistry, abi: SELLER_REGISTERED_EVENT_ABI, eventName: 'SellerWithdrawn', fromBlock: 0n,
        }),
    ]);
    const withdrawnCount = new Map<string, number>();
    for (const w of withdrawals) {
        const a = ((w.args as { seller?: string }).seller ?? '').toLowerCase();
        withdrawnCount.set(a, (withdrawnCount.get(a) ?? 0) + 1);
    }
    const updatesByAddr = new Map<string, Array<{ uri: string; block: bigint; logIndex: number }>>();
    for (const u of updates) {
        const a = ((u.args as { seller?: string }).seller ?? '').toLowerCase();
        const list = updatesByAddr.get(a) ?? [];
        list.push({
            uri: (u.args as { metadataURI?: string }).metadataURI ?? '',
            block: u.blockNumber ?? 0n,
            logIndex: u.logIndex ?? 0,
        });
        updatesByAddr.set(a, list);
    }
    const registeredCount = new Map<string, number>();
    const out: DiscoveredSeller[] = [];
    for (const ev of events) {
        const address = (ev.args as { seller: `0x${string}` }).seller;
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
            assemblyBindings?: DiscoveredSeller['assemblyBindings'];
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




/** Resolve an `ipfs://` URI to a Kubo-gateway URL. */
function resolveIpfsURI(uri: string): string {
    const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? 'http://127.0.0.1:8080';
    return uri.startsWith('ipfs://')
        ? `${gateway}/ipfs/${uri.slice('ipfs://'.length)}`
        : uri;
}

/**
 * Advance Anvil's block timestamp by `seconds` and mine an empty block
 * so reads pick up the new `block.timestamp`. Used by tests that exercise
 * time-locked paths (SellerRegistry.withdraw's 365-day lock,
 * RpgfMinter unlock cliffs, etc.).
 *
 * Pair with `evmSnapshot()` / `evmRevert()` so the time jump doesn't leak
 * into adjacent tests.
 */
export async function evmIncreaseTime(seconds: number): Promise<void> {
    await snapshotClient.request({ method: 'evm_increaseTime' as any, params: [seconds] } as any);
    await snapshotClient.request({ method: 'evm_mine' as any } as any);
}






