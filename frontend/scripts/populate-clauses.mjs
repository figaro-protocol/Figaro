#!/usr/bin/env node
/**
 * populate-clauses.mjs — the ONE clause-population path for PRODUCTION / TESTNET /
 * MAINNET. Pre-populates ClauseRegistry + IPFS with the protocol's clause specs.
 *
 * For each Layer-A clause spec in `clauses/*.json` (the canonical seed data,
 * the single origin pinned to IPFS and anchored on-chain):
 *   1. pin the spec JSON to IPFS (real CID), and
 *   2. `registerClause(clauseId, version, contentHash, contentURI)` on
 *      ClauseRegistry — anchoring the IPFS document pointer (contentURI) + the
 *      spec integrity digest (contentHash), so any reader fetches the spec from
 *      chain state alone (the shape SellerRegistry / AssemblyRegistry already use).
 *
 * This REPLACES the placeholder clause registration that used to live in the
 * deploy scripts (which anchored `keccak256("ipfs://figaro-x/v1")` — a hash of a
 * made-up URI that no pinned spec can match) AND the deleted bundled specs.
 * After this runs, every clause is genuinely on-chain + on-IPFS — one SSoT.
 *
 * Idempotent: a clause already on the registry is skipped (first-write-wins).
 *
 * Env (from frontend/.env.local unless overridden):
 *   NEXT_PUBLIC_CLAUSE_REGISTRY  — the ClauseRegistry address (required)
 *   NEXT_PUBLIC_IPFS_API_URL     — Kubo API (default http://127.0.0.1:5001)
 *   RPC_URL                      — chain RPC (default http://127.0.0.1:8545)
 *   REGISTRAR_PRIVATE_KEY        — signer; defaults to anvil[0] (devnet only)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    createPublicClient, createWalletClient, defineChain, http, keccak256, parseAbi, toHex, encodeAbiParameters,
} from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Canonical Layer-A specs / ClauseRegistry seed data — the single origin,
// pinned to IPFS and anchored on-chain. Nothing bundles a copy.
export const CLAUSES_DIR = path.resolve(__dirname, '../../clauses');
const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

export const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

const CLAUSE_REGISTRY_ABI = parseAbi([
    'function registerClause(string clauseId, uint64 version, bytes32 contentHash, string contentURI) external payable',
    'function registered(bytes32) view returns (bool)',
    'function registrationDeposit() view returns (uint256)',
]);

/** Sorted-keys JSON at every depth — mirrors lib/shared/canonicalJson.ts. */
function canonicalize(value) {
    return JSON.stringify(value, (_key, raw) => {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
        const sorted = {};
        for (const k of Object.keys(raw).sort()) sorted[k] = raw[k];
        return sorted;
    });
}

/** Read frontend/.env.local into a flat key→value map. */
export function readEnvLocal() {
    const envPath = path.resolve(__dirname, '../.env.local');
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
export async function pinJSON(apiUrl, json) {
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

/** Resolve the signing account: REGISTRAR_PRIVATE_KEY, else anvil[0] (devnet). */
export function registrarAccount() {
    return process.env.REGISTRAR_PRIVATE_KEY
        ? privateKeyToAccount(process.env.REGISTRAR_PRIVATE_KEY)
        : mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 0 });
}

/**
 * Pin + register every clause spec. Reusable from the test-data script.
 * @returns the number of clauses newly registered.
 */
export async function populateClauses({ publicClient, walletClient, account, registry, ipfsApiUrl, log = console.log }) {
    const files = fs.readdirSync(CLAUSES_DIR).filter((f) => f.endsWith('.json')).sort();
    let registered = 0;
    for (const file of files) {
        const spec = JSON.parse(fs.readFileSync(path.join(CLAUSES_DIR, file), 'utf8'));
        const clauseIdStr = spec.clauseId;
        if (!clauseIdStr) throw new Error(`${file} has no clauseId`);
        const version = BigInt(spec.version ?? 1);
        // On-chain identity is keccak256(abi.encode(name, version)) — matches
        // ClauseRegistry and the SDK.
        const clauseId = keccak256(encodeAbiParameters([{ type: 'string' }, { type: 'uint64' }], [clauseIdStr, version]));

        if (await publicClient.readContract({
            address: registry, abi: CLAUSE_REGISTRY_ABI, functionName: 'registered', args: [clauseId],
        })) {
            log(`  · ${clauseIdStr} — already registered, skipped`);
            continue;
        }

        // Pin the spec to IPFS (the pointer readers fetch from), and anchor its
        // content digest (integrity) + that pointer on-chain. The digest is over
        // the CANONICAL form (sorted keys at every depth) — mirrors
        // lib/shared/canonicalJson.ts, which readers use to verify after fetch.
        const canonical = canonicalize(spec);
        const contentURI = await pinJSON(ipfsApiUrl, canonical);
        const contentHash = keccak256(toHex(canonical));

        // Registering = staked intent (K4): every registration posts the
        // registry's deposit, reclaimable via withdrawDeposit (which
        // de-surfaces the clause).
        const deposit = await publicClient.readContract({
            address: registry, abi: CLAUSE_REGISTRY_ABI, functionName: 'registrationDeposit',
        });
        const { request } = await publicClient.simulateContract({
            account: account.address,
            address: registry,
            abi: CLAUSE_REGISTRY_ABI,
            functionName: 'registerClause',
            args: [clauseIdStr, version, contentHash, contentURI],
            value: deposit,
        });
        const hash = await walletClient.writeContract(request);
        await publicClient.waitForTransactionReceipt({ hash });
        registered += 1;
        log(`  ✓ ${clauseIdStr} v${version} — pinned ${contentURI} (article ${spec.block?.article ?? '-'})`);
    }
    return registered;
}

async function main() {
    const env = readEnvLocal();
    const registry = process.env.NEXT_PUBLIC_CLAUSE_REGISTRY ?? env.NEXT_PUBLIC_CLAUSE_REGISTRY;
    const ipfsApiUrl = process.env.NEXT_PUBLIC_IPFS_API_URL ?? env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
    if (!registry) throw new Error('NEXT_PUBLIC_CLAUSE_REGISTRY missing — deploy the contracts first.');

    const account = registrarAccount();
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const walletClient = createWalletClient({ account, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

    console.log(`Populating clauses → ClauseRegistry ${registry}`);
    console.log(`  registrar ${account.address}`);
    console.log(`  IPFS      ${ipfsApiUrl}\n`);
    const n = await populateClauses({ publicClient, walletClient, account, registry, ipfsApiUrl });
    console.log(`\nDone — ${n} clause(s) newly registered + pinned.`);
}

// Run as a script (not when imported).
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((err) => { console.error(err); process.exit(1); });
}
