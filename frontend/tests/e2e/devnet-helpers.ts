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
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ASSEMBLY_REGISTRY_ABI, CLAUSE_REGISTRY_ABI } from '@figaro/sdk';
import { encodeGeohash } from '@figaro/sdk/derive';
import { deriveAssemblySlug } from '@/lib/shared/assemblyTemplate';

export const RPC_URL = 'http://127.0.0.1:8545';
export const LOCAL_ANVIL = defineChain({
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
    permitTokenAddress?: `0x${string}`;
    attestationCoordinator?: `0x${string}`;
    witnessSwapAndCommitCoordinator?: `0x${string}`;
    permit2?: `0x${string}`;
    swapRouter?: `0x${string}`;
    clauseRegistry?: `0x${string}`;
    clauseRegistrationHelper?: `0x${string}`;
    sellerRegistry?: `0x${string}`;
    assemblyRegistry?: `0x${string}`;
    florinToken?: `0x${string}`;
    usageCounter?: `0x${string}`;
    rpgfMinter?: `0x${string}`;
    daoTreasury?: `0x${string}`;
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
            if (key === 'NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS') config.permitTokenAddress = value;
            if (key === 'NEXT_PUBLIC_ATTESTATION_COORDINATOR') config.attestationCoordinator = value;
            if (key === 'NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR') config.witnessSwapAndCommitCoordinator = value;
            if (key === 'NEXT_PUBLIC_PERMIT2') config.permit2 = value;
            if (key === 'NEXT_PUBLIC_SWAP_ROUTER') config.swapRouter = value;
            if (key === 'NEXT_PUBLIC_CLAUSE_REGISTRY') config.clauseRegistry = value;
            if (key === 'NEXT_PUBLIC_CLAUSE_REGISTRATION_HELPER') config.clauseRegistrationHelper = value;
            if (key === 'NEXT_PUBLIC_SELLER_REGISTRY') config.sellerRegistry = value;
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
        config.sellerRegistry = config.sellerRegistry ?? contents.sellerRegistry;
        config.assemblyRegistry = config.assemblyRegistry ?? (contents as any).assemblyRegistry;
    }

    return config;
}


// evmSnapshot/evmRevert were removed — devnet is a mainnet REHEARSAL, so specs
// leave their state on-chain and stay idempotent via a per-run nonce (see
// probeAssembly.ts), never evm_snapshot/evm_revert (lint-no-devnet-revert).
// (evmIncreaseTime followed when the registry time locks were deleted — K4:
// no time-locked path remains to exercise.)


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
    /** Agent service endpoints (`SellerAgentServices`) — a declared `rest`
     *  makes the wallet an AGENT candidate: race/quote drafts POST there. */
    services?: { mcp?: string; a2a?: string; rest?: string; did?: string; ens?: string };
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
        // account = the ACCOUNT OBJECT, not the address: viem then signs
        // locally and broadcasts raw, so the helper works for any walletKey —
        // an address-only account asks the node to sign, which only succeeds
        // for anvil's own unlocked (globally shared) accounts.
        const { request } = await publicClient.simulateContract({
            account: seller,
            address: sellerRegistry,
            abi: SELLER_REGISTRY_REGISTER_ABI,
            functionName: 'updateProfile',
            args: [profileURI],
        });
        await publicClient.waitForTransactionReceipt({ hash: await sellerClient.writeContract(request) });
    } else {
        const { request } = await publicClient.simulateContract({
            account: seller,
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
 *  registration (mirrors `lib/kernel/indexer.ts`; `updateProfile` is a
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




/** The latest profile URI a seller anchored on SellerRegistry (registration
 *  or the most recent update), read from events — the out-of-band truth specs
 *  verify gate effects against. */
export async function latestSellerProfileURI(seller: `0x${string}`): Promise<string | undefined> {
    const publicClient = localPublicClient();
    const config = readLocalDeploymentConfig();
    const sellerRegistry = (process.env.NEXT_PUBLIC_SELLER_REGISTRY ?? config.sellerRegistry) as `0x${string}`;
    const [registrations, updates] = await Promise.all([
        publicClient.getContractEvents({
            address: sellerRegistry, abi: SELLER_REGISTERED_EVENT_ABI, eventName: 'SellerRegistered',
            args: { seller }, fromBlock: 0n,
        }),
        publicClient.getContractEvents({
            address: sellerRegistry, abi: SELLER_REGISTERED_EVENT_ABI, eventName: 'SellerProfileUpdated',
            args: { seller }, fromBlock: 0n,
        }),
    ]);
    return [...registrations, ...updates]
        .sort((a, b) => Number(a.blockNumber - b.blockNumber))
        .at(-1)?.args.metadataURI as string | undefined;
}

/** A seller's live assembly bindings, read from its latest pinned profile
 *  (chain events → IPFS). Empty when unregistered or unresolvable. */
export async function sellerProfileBindings(
    seller: `0x${string}`,
): Promise<DiscoveredSeller['assemblyBindings']> {
    const uri = await latestSellerProfileURI(seller);
    if (!uri) return [];
    try {
        const doc = await (await fetch(resolveIpfsURI(uri))).json() as {
            assemblyBindings?: DiscoveredSeller['assemblyBindings'];
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
        await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
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
        await page.getByTestId('designer-name-input').fill('Local delivery');
        await page.getByTestId('designer-summary-input').fill('Meal/grocery delivery: a merchant order plus one co-equal courier order.');
        await page.getByTestId('designer-description-input').fill('The local-commerce runtime: the buyer orders with the delivery modality; the courier order carries the goods; each transfer is attested; one resolve pays both.');
        await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
        await page.getByTestId('designer-review').click();
        await page.waitForURL(/\/builders\/designer\/view\?slug=asm-/, { timeout: 15000 });
        const handle = page.url().match(/[?&]slug=(asm-[a-z0-9-]+)/)?.[1];
        expect(handle, 'review navigated to a draft handle').toBeTruthy();
        await page.goto(`/builders/designer/view?slug=${handle}&intent=publish&e2e=devnet`, { waitUntil: 'domcontentloaded' });
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
