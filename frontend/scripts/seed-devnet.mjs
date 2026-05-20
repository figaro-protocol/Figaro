/**
 * seed-devnet.mjs — devnet fixture seeder.
 *
 * Populates a freshly-deployed local Anvil with the canonical reference
 * data the UI and the e2e scenario suite expect to find:
 *
 *   - 2 assemblies on AssemblyRegistry — `direct-sale` (one-node,
 *     in-person) and `local-commerce` (buyer -> merchant -> courier).
 *   - 4 operator profiles on OperatorRegistry — all SELLERS (buyers are
 *     never registered operators), bound to the seeded assemblies in
 *     seller-side roles.
 *
 * The assembly manifests are NOT authored here — a V5 AssemblyManifest is
 * a designer-canvas snapshot. They are captured fixtures in
 * `scripts/fixtures/<slug>.manifest.json`, produced by the
 * scenario-*.devnet.spec.ts authoring walks (run with
 * FIGARO_CAPTURE_FIXTURES=1). This script replays them verbatim; the
 * on-chain contentHash re-derives from the canonical serialization,
 * matching the app's `serializeManifest`.
 *
 * Idempotent — both registries are permissionless first-write-wins, so a
 * re-run skips anything already registered.
 *
 * Prerequisites: Anvil running, `./deploy-local.sh` complete (populates
 * frontend/.env.local), and Kubo IPFS running (NEXT_PUBLIC_IPFS_API_URL,
 * default http://127.0.0.1:5001).
 *
 * Usage:  cd frontend && npm run seed:devnet
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    createPublicClient,
    createWalletClient,
    defineChain,
    http,
    keccak256,
    parseAbi,
    parseEther,
    toHex,
} from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

// Anvil's deterministic default mnemonic — derives the same accounts the
// e2e suite uses: anvil[0] = buyer / assembly author; anvil[1..4] = sellers.
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const RPC_URL = process.env.FIGARO_RPC_URL ?? 'http://127.0.0.1:8545';

// Both registries take a flat 0.001 ETH refundable deposit. OperatorRegistry
// checks `msg.value != registrationDeposit` (InsufficientDeposit); the
// AssemblyRegistry checks the same (WrongDeposit) — the value must be exact.
const REGISTRATION_DEPOSIT = parseEther('0.001');

const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

// Error entries are required so viem can decode a revert into a named
// error — `isAlreadyRegistered` matches on the name, and any other revert
// surfaces readably instead of as a bare 4-byte selector.
const OPERATOR_REGISTRY_ABI = parseAbi([
    'function register(string metadataURI) external payable',
    'error AlreadyRegistered()',
    'error InsufficientDeposit()',
]);

const ASSEMBLY_REGISTRY_ABI = parseAbi([
    'function registerAssembly(string slug, bytes32 contentHash, string metadataURI) external payable',
    'error SlugAlreadyRegistered(string slug)',
    'error EmptySlug()',
    'error EmptyContentHash()',
    'error EmptyMetadataURI()',
    'error WrongDeposit(uint256 provided, uint256 required)',
]);

// ── Reference-assembly fixtures ─────────────────────────────────────────────
// Designer-authored AssemblyManifests, captured by the scenario specs into
// scripts/fixtures/. Replayed verbatim — do not hand-edit; re-capture with
// `FIGARO_CAPTURE_FIXTURES=1 npx playwright test scenario-*.devnet`.
const FIXTURE_DIR = path.resolve(SCRIPT_DIR, 'fixtures');
const ASSEMBLY_FIXTURES = ['direct-sale', 'local-commerce'];

/** Sorted-key, bigint-as-string JSON — mirrors `canonicalize` in
 *  frontend/lib/mechanisms/useAssemblyRegistry.ts, so the contentHash this
 *  script registers matches the app's `serializeManifest`. */
function canonicalize(value) {
    return JSON.stringify(value, (_key, raw) => {
        if (typeof raw === 'bigint') return raw.toString();
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
        const sorted = {};
        for (const k of Object.keys(raw).sort()) sorted[k] = raw[k];
        return sorted;
    });
}

// ── Operators — all sellers; anvil[0] stays the unregistered buyer ──────────
// The binding spread covers every shape: three single-assembly operators
// and one bound to both (the multi-binding case).
const OPERATORS = [
    { addressIndex: 1, name: 'Counter & Co.', specialty: 'in-person counter sales', bind: ['direct-sale'] },
    { addressIndex: 2, name: 'Rosso Kitchen', specialty: 'prepared food', bind: ['local-commerce'] },
    { addressIndex: 3, name: 'Swift Courier', specialty: 'last-mile delivery', bind: ['local-commerce'] },
    { addressIndex: 4, name: 'Mercato General', specialty: 'retail and delivery', bind: ['direct-sale', 'local-commerce'] },
];

/** Parse frontend/.env.local into a flat key→value map. */
function readEnvLocal() {
    const envPath = path.resolve(SCRIPT_DIR, '../.env.local');
    const out = {};
    if (!fs.existsSync(envPath)) return out;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return out;
}

/** Pin an already-serialized JSON string to Kubo; return the ipfs:// URI. */
async function pinJSON(apiUrl, json) {
    const form = new FormData();
    form.append('file', new Blob([json], { type: 'application/json' }), 'doc.json');
    const res = await fetch(`${apiUrl}/api/v0/add?pin=true`, { method: 'POST', body: form });
    if (!res.ok) {
        throw new Error(`IPFS pin failed: ${res.status} ${res.statusText} (is Kubo running at ${apiUrl}?)`);
    }
    const result = await res.json();
    if (!result || typeof result.Hash !== 'string' || !result.Hash) {
        throw new Error('IPFS pin returned no CID');
    }
    return `ipfs://${result.Hash}`;
}

/** First-write-wins reverts: OperatorRegistry `AlreadyRegistered`,
 *  AssemblyRegistry `SlugAlreadyRegistered`. Both make a re-run a no-op. */
function isAlreadyRegistered(err) {
    return /AlreadyRegistered/i.test(err instanceof Error ? err.message : String(err));
}

async function main() {
    const env = readEnvLocal();
    const operatorRegistry = env.NEXT_PUBLIC_OPERATOR_REGISTRY;
    const assemblyRegistry = env.NEXT_PUBLIC_ASSEMBLY_REGISTRY;
    const ipfsApiUrl = env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';

    if (!operatorRegistry || !assemblyRegistry) {
        throw new Error(
            'NEXT_PUBLIC_OPERATOR_REGISTRY / NEXT_PUBLIC_ASSEMBLY_REGISTRY missing from ' +
            'frontend/.env.local — run ./deploy-local.sh first.',
        );
    }

    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    try {
        await publicClient.getBlockNumber();
    } catch {
        throw new Error(`Cannot reach Anvil at ${RPC_URL} — is it running?`);
    }

    console.log(`Seeding devnet (${RPC_URL})`);
    console.log(`  OperatorRegistry  ${operatorRegistry}`);
    console.log(`  AssemblyRegistry  ${assemblyRegistry}`);
    console.log(`  IPFS              ${ipfsApiUrl}\n`);

    // ── Assemblies — authored by anvil[0] (the Builder-journey wallet) ──────
    const author = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 0 });
    const authorClient = createWalletClient({ account: author, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

    console.log('Assemblies:');
    for (const name of ASSEMBLY_FIXTURES) {
        const fixturePath = path.resolve(FIXTURE_DIR, `${name}.manifest.json`);
        if (!fs.existsSync(fixturePath)) {
            throw new Error(
                `Missing fixture ${fixturePath} — capture it with ` +
                `FIGARO_CAPTURE_FIXTURES=1 npx playwright test scenario-${name}.devnet`,
            );
        }
        const manifest = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
        const slug = manifest.slug;
        // The pinned bytes and the contentHash both derive from the canonical
        // serialization, so a consumer re-verifying the manifest matches.
        const json = canonicalize(manifest);
        const contentHash = keccak256(toHex(json));
        const metadataURI = await pinJSON(ipfsApiUrl, json);
        try {
            const { request } = await publicClient.simulateContract({
                account: author.address,
                address: assemblyRegistry,
                abi: ASSEMBLY_REGISTRY_ABI,
                functionName: 'registerAssembly',
                args: [slug, contentHash, metadataURI],
                value: REGISTRATION_DEPOSIT,
            });
            const hash = await authorClient.writeContract(request);
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`  ✓ ${slug} — registered (author ${author.address})`);
            console.log(`      manifest ${metadataURI}`);
        } catch (err) {
            if (isAlreadyRegistered(err)) {
                console.log(`  · ${slug} — already registered, skipped`);
            } else {
                throw err;
            }
        }
    }

    // ── Operators — sellers, anvil[1..4] ───────────────────────────────────
    console.log('\nOperators:');
    for (const op of OPERATORS) {
        const account = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: op.addressIndex });
        const opClient = createWalletClient({ account, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        const profile = {
            subjectAddress: account.address,
            name: op.name,
            specialty: op.specialty,
            version: '0.1.0',
            assemblyBindings: op.bind.map((assemblySlug) => ({
                bindingId: `${assemblySlug}:${account.address.toLowerCase()}`,
                subjectAddress: account.address,
                assemblySlug,
                networkTargets: ['local-anvil'],
                version: '0.1.0',
            })),
        };
        const metadataURI = await pinJSON(ipfsApiUrl, JSON.stringify(profile));

        try {
            const { request } = await publicClient.simulateContract({
                account: account.address,
                address: operatorRegistry,
                abi: OPERATOR_REGISTRY_ABI,
                functionName: 'register',
                args: [metadataURI],
                value: REGISTRATION_DEPOSIT,
            });
            const hash = await opClient.writeContract(request);
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`  ✓ ${op.name} (${account.address})`);
            console.log(`      bound to [${op.bind.join(', ')}] — profile ${metadataURI}`);
        } catch (err) {
            if (isAlreadyRegistered(err)) {
                console.log(`  · ${op.name} (${account.address}) — already registered, skipped`);
            } else {
                throw err;
            }
        }
    }

    console.log('\nDevnet seeded.');
}

main().catch((err) => {
    console.error(`\nseed-devnet failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
});
