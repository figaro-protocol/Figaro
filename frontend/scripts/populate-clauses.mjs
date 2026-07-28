#!/usr/bin/env node
/**
 * populate-clauses.mjs — the ONE clause-population path for PRODUCTION / TESTNET /
 * MAINNET. Pre-populates ClauseRegistry + IPFS with the protocol's clause specs.
 *
 * For each Layer-A clause spec in `clauses/*.json` (the canonical seed data,
 * the single origin pinned to IPFS and anchored on-chain):
 *   1. pin the spec JSON to IPFS (real CID), and
 *   2. `registerClause(clauseId, version, contentHash, contentURI, rpgfTag)` on
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
    createPublicClient, createWalletClient, defineChain, http, keccak256, stringToHex,
} from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
// Protocol canonicals come from the SDK (@figaro/sdk, file:../sdk — the
// compiled dist resolves from plain node ESM): the registry ABI, the clause
// key, and the canonical-JSON convention. Nothing is re-implemented here.
import { CLAUSE_REGISTRY_ABI, computeClauseKey, canonicalize, canonicalContentHash } from '@figaro/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Canonical Layer-A specs / ClauseRegistry seed data — the single origin,
// pinned to IPFS and anchored on-chain. Nothing bundles a copy.
export const CLAUSES_DIR = path.resolve(__dirname, '../../clauses');
/** The reference assemblies — the user-onboarding set, `clauses/`' sibling:
 *  canonical AssemblyTemplate JSONs anchored on AssemblyRegistry at populate
 *  time (affixed documents in `assemblies/documents/`). */
export const ASSEMBLIES_DIR = path.resolve(__dirname, '../../assemblies');
const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

export const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

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

/** Pin an already-serialized JSON string to Kubo; return the ipfs:// URI.
 *  Mirror-by-necessity of the browser pin path (`lib/shared/ipfsService.ts`):
 *  the SDK is viem-only (no IPFS surface, by doctrine) and .mjs cannot import
 *  frontend TS — keep the two in lockstep when the add-endpoint shape changes. */
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

/** Pin a file's RAW BYTES (byte-exact — an affixed document's keccak and CID
 *  must reproduce wherever it pins). Returns the bare CID. */
export async function pinFile(apiUrl, filePath) {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
    const res = await fetch(`${apiUrl}/api/v0/add?pin=true`, { method: 'POST', body: form });
    if (!res.ok) {
        throw new Error(`IPFS pin failed: ${res.status} ${res.statusText} (is Kubo running at ${apiUrl}?)`);
    }
    const result = await res.json();
    if (!result || typeof result.Hash !== 'string' || !result.Hash) {
        throw new Error('IPFS pin returned no CID');
    }
    return result.Hash;
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
        // On-chain identity is keccak256(abi.encode(name, version)).
        const clauseId = computeClauseKey(clauseIdStr, version);

        if (await publicClient.readContract({
            address: registry, abi: CLAUSE_REGISTRY_ABI, functionName: 'registered', args: [clauseId],
        })) {
            log(`  · ${clauseIdStr} — already registered, skipped`);
            continue;
        }

        // Pin the spec to IPFS (the pointer readers fetch from), and anchor its
        // content digest (integrity) + that pointer on-chain. The digest is over
        // the CANONICAL form (sorted keys at every depth) — the SDK's
        // canonical-JSON convention, which readers use to verify after fetch.
        const canonical = canonicalize(spec);
        const contentURI = await pinJSON(ipfsApiUrl, canonical);
        const contentHash = canonicalContentHash(spec);

        // Registering = staked intent (K4): every registration posts the
        // registry's deposit, reclaimable via withdrawDeposit (which
        // de-surfaces the clause).
        const deposit = await publicClient.readContract({
            address: registry, abi: CLAUSE_REGISTRY_ABI, functionName: 'registrationDeposit',
        });
        // Incentive tag: declared in the spec's top-level `rpgfTag` (the one
        // spec attribute that reaches the chain — registration data, outside
        // `block`) so `contentHash` binds it. Null = untagged (bytes32(0)),
        // the default for most clauses.
        const rpgfTag = typeof spec.rpgfTag === 'string' && spec.rpgfTag.trim()
            ? keccak256(stringToHex(spec.rpgfTag.trim()))
            : `0x${'0'.repeat(64)}`;
        const { request } = await publicClient.simulateContract({
            account: account.address,
            address: registry,
            abi: CLAUSE_REGISTRY_ABI,
            functionName: 'registerClause',
            args: [clauseIdStr, version, contentHash, contentURI, rpgfTag],
            value: deposit,
        });
        const hash = await walletClient.writeContract(request);
        await publicClient.waitForTransactionReceipt({ hash });
        registered += 1;
        log(`  ✓ ${clauseIdStr} v${version} — pinned ${contentURI} (article ${spec.block?.design?.article ?? '-'})`);
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
