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
 *      chain state alone (the shape MembersRegistry / AssemblyRegistry already use).
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
 *
 * VAULT-REGISTRAR MODE (the LEXICON vault-registrar seam). This script always
 * acts FOR exactly one registrar per invocation, and registrar is a PER-WALLET
 * role — a wallet registers only what it claims ownership of. The default
 * registrar is an EOA (REGISTRAR_PRIVATE_KEY). When the registrar is a
 * multisig VAULT — the DAO's vault for the genesis seed set (endowment ruling
 * 2026-08-13: author-of-record is the literal registrar,
 * `RpgfMinter._isAuthor` reads `depositOf(...).registrar`) — set:
 *   REGISTRAR_VAULT    — the vault's address; it becomes msg.sender/registrar
 *                        via its approve/execute cycle, staking deposits from
 *                        its own ETH balance (fund it first)
 *   VAULT_OWNER_KEYS   — comma-separated owner private keys (threshold many,
 *                        or threshold-minus-one alongside a Ledger owner)
 *   VAULT_LEDGER_HD_PATH — an owner whose key lives on a Ledger device: its
 *                        approvals are signed ON THE DEVICE through Foundry's
 *                        `cast send --ledger` (one tap per registration; the
 *                        device screen shows the vault address). The path is
 *                        the Ledger Live account path `m/44'/60'/N'/0/0`. The
 *                        script refuses a path that does not resolve to a
 *                        vault owner (a wrong N signs nothing).
 * The vault confers no special role: any wallet — the founder's address, a
 * stranger's — is registrar of its own artifacts through the same registries.
 *
 * REFERENCE ASSEMBLIES ride the same invocation when both are set:
 *   NEXT_PUBLIC_ASSEMBLY_REGISTRY — the AssemblyRegistry address
 *   ASSEMBLY_TOKEN_ADDRESS        — settlement token substituted for the
 *                                   checked-in ZERO_ADDRESS sentinel (Sepolia:
 *                                   USDC, ruled 2026-08-14)
 *
 * INCREMENTAL RELEASE controls (the nudge-per-session Sepolia rollout):
 *   SEED_ASSEMBLIES       — comma-separated reference-assembly names (the
 *                           `assemblies/<name>.json` basenames): anchor ONLY
 *                           these, and register ONLY the clauses they compose
 *                           (`templateComposedClauseIds`) — a nudge is a
 *                           usable assembly plus its prerequisites, not an
 *                           alphabetical prefix of the clause set. Unset =
 *                           everything.
 *   SEED_LIMIT            — cap NEW registrations this run (one shared budget:
 *                           clauses first, assemblies get the remainder)
 *   IPFS_PIN_SERVICE_JWT  — pin via a managed pinning service instead of local
 *                           Kubo (public seeding: the Pinata DAO key, so seed
 *                           specs outlive the maintainer's laptop)
 *   IPFS_PIN_SERVICE_API  — service API base (default https://api.pinata.cloud)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    createPublicClient, createWalletClient, defineChain, encodeFunctionData, http,
} from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
// Protocol canonicals come from the SDK (@figaro/sdk, file:../sdk — the
// compiled dist resolves from plain node ESM): the registry ABI, the clause
// key, and the canonical-JSON convention. Nothing is re-implemented here.
import {
    CLAUSE_REGISTRY_ABI, ASSEMBLY_REGISTRY_ABI, computeClauseKey, canonicalize,
    canonicalContentHash, templateCompositionHash, deriveAssemblySlug,
    templateComposedClauseIds,
} from '@figaro/sdk';

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

/** Resolve the ACTUAL chain at RPC_URL (devnet 31337, Sepolia 11155111, …).
 *  The chain id is read from the node, never assumed — a hardcoded devnet
 *  chain would make viem refuse every write on a public network. */
export async function resolveChain() {
    const probe = createPublicClient({ transport: http(RPC_URL) });
    const id = await probe.getChainId();
    return defineChain({
        id,
        name: `chain-${id}`,
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [RPC_URL] } },
    });
}

/** Minimal MockTreasuryMultisig surface for the genesis-seed path — a
 *  mirror-by-necessity of `src/mocks/MockTreasuryMultisig.sol` (the mock has
 *  no SDK ABI export; keep in lockstep). Mainnet's canonical Safe replaces
 *  this flow with the Safe SDK at the custody ceremony (Task 9). */
export const VAULT_ABI = [
    {
        type: 'function', name: 'transactionHash', stateMutability: 'view',
        inputs: [
            { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
            { name: 'data', type: 'bytes' }, { name: '_nonce', type: 'uint256' },
        ],
        outputs: [{ type: 'bytes32' }],
    },
    { type: 'function', name: 'approveHash', stateMutability: 'nonpayable', inputs: [{ name: 'txHash', type: 'bytes32' }], outputs: [] },
    {
        type: 'function', name: 'execute', stateMutability: 'nonpayable',
        inputs: [
            { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
            { name: 'data', type: 'bytes' }, { name: '_nonce', type: 'uint256' },
        ],
        outputs: [],
    },
    {
        type: 'function', name: 'approvedBy', stateMutability: 'view',
        inputs: [{ type: 'bytes32' }, { type: 'address' }], outputs: [{ type: 'bool' }],
    },
    { type: 'function', name: 'executed', stateMutability: 'view', inputs: [{ type: 'bytes32' }], outputs: [{ type: 'bool' }] },
    { type: 'function', name: 'isOwner', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] },
];

/** A vault owner whose key never leaves a Ledger device. Same shape as the
 *  viem wallet clients `vaultExecute` drives (`account.address` +
 *  `writeContract` resolving to a tx hash), so the approval loop is
 *  signer-agnostic; the signing itself is Foundry's `cast send --ledger` —
 *  the device prompts, the maintainer verifies the vault address on its
 *  screen and taps. The address is read from the device at construction,
 *  so a wrong derivation index surfaces before anything is signed. */
export function ledgerOwnerClient({ hdPath, rpcUrl, log = console.log }) {
    const address = execFileSync('cast', ['wallet', 'address', '--ledger', '--hd-path', hdPath], {
        stdio: ['inherit', 'pipe', 'inherit'],
    }).toString().trim();
    return {
        account: { address },
        async writeContract({ address: to, functionName, args }) {
            if (functionName !== 'approveHash') {
                throw new Error(`Ledger owner signs vault approvals only (asked for ${functionName})`);
            }
            log(`  ⧗ Ledger ${hdPath} (${address}): approve ${args[0]} on the device — the screen must show vault ${to}`);
            // The device locks itself between the chain confirmations that
            // pace the taps; an unreachable device is a wait, not a failure
            // of the nudge (every step before this one is already on-chain and
            // idempotent). Retry until it answers or the maintainer gives up.
            for (let attempt = 1; ; attempt++) {
                try {
                    const out = execFileSync('cast', [
                        'send', '--ledger', '--hd-path', hdPath, '--rpc-url', rpcUrl, '--json',
                        to, 'approveHash(bytes32)', args[0],
                    ], { stdio: ['inherit', 'pipe', 'pipe'] }).toString();
                    return JSON.parse(out).transactionHash;
                } catch (err) {
                    const stderr = (err.stderr ?? '').toString();
                    if (!/Could not connect to Ledger device/.test(stderr) || attempt >= LEDGER_RETRIES) {
                        // Never echo cast's command line: it carries the RPC URL (a keyed endpoint).
                        throw new Error(`Ledger approval failed after ${attempt} attempt(s): ${stderr.trim() || err.message.split('\n')[0]}`);
                    }
                    log(`  … Ledger not reachable (attempt ${attempt}/${LEDGER_RETRIES}) — unlock it, open the Ethereum app, quit Ledger Live; retrying in ${LEDGER_RETRY_MS / 1000}s`);
                    await new Promise((r) => setTimeout(r, LEDGER_RETRY_MS));
                }
            }
        },
    };
}
const LEDGER_RETRIES = 60;
const LEDGER_RETRY_MS = 10_000;

/** Route one call through the vault multisig: threshold approvals from the
 *  owner wallets, then a single execute. Idempotent — approvals and the
 *  execution are each skipped when already on-chain. `nonce` must be unique
 *  per logical action and deterministic (callers derive it from the content
 *  key) so a re-run converges instead of re-registering. */
export async function vaultExecute({ publicClient, vault, ownerClients, to, value, data, nonce, log = console.log }) {
    const txHash = await publicClient.readContract({
        address: vault, abi: VAULT_ABI, functionName: 'transactionHash', args: [to, value, data, nonce],
    });
    if (await publicClient.readContract({
        address: vault, abi: VAULT_ABI, functionName: 'executed', args: [txHash],
    })) {
        log('  · vault tx already executed, skipped');
        return;
    }
    for (const ownerClient of ownerClients) {
        const already = await publicClient.readContract({
            address: vault, abi: VAULT_ABI, functionName: 'approvedBy', args: [txHash, ownerClient.account.address],
        });
        if (already) continue;
        const hash = await ownerClient.writeContract({
            address: vault, abi: VAULT_ABI, functionName: 'approveHash', args: [txHash],
        });
        await publicClient.waitForTransactionReceipt({ hash });
    }
    const execHash = await ownerClients[0].writeContract({
        address: vault, abi: VAULT_ABI, functionName: 'execute', args: [to, value, data, nonce],
    });
    await publicClient.waitForTransactionReceipt({ hash: execHash });
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

/** The pin backend, resolved from env once per run. Public (testnet/mainnet)
 *  seeding pins through a managed pinning service under the DAO's OWN
 *  credential (`IPFS_PIN_SERVICE_JWT` — pass the Pinata DAO key), so seed
 *  specs survive the maintainer's laptop; devnet leaves it unset and pins to
 *  local Kubo. Mirrors the two-backend adapter in `lib/shared/ipfsService.ts`
 *  (mirror-by-necessity: the SDK is viem-only and .mjs cannot import frontend
 *  TS — keep the endpoint shapes in lockstep). */
function pinService() {
    const jwt = process.env.IPFS_PIN_SERVICE_JWT ?? '';
    if (!jwt) return null;
    const api = (process.env.IPFS_PIN_SERVICE_API ?? 'https://api.pinata.cloud').replace(/\/$/, '');
    return { api, jwt };
}

async function pinForm(apiUrl, form) {
    const service = pinService();
    const res = service
        ? await fetch(`${service.api}/pinning/pinFileToIPFS`, {
              method: 'POST', headers: { Authorization: `Bearer ${service.jwt}` }, body: form,
          })
        : await fetch(`${apiUrl}/api/v0/add?pin=true`, { method: 'POST', body: form });
    if (!res.ok) {
        throw new Error(service
            ? `pin service pin failed: ${res.status} ${res.statusText} (${service.api})`
            : `IPFS pin failed: ${res.status} ${res.statusText} (is Kubo running at ${apiUrl}?)`);
    }
    const result = await res.json();
    const cid = service ? result?.IpfsHash : result?.Hash;
    if (typeof cid !== 'string' || !cid) {
        throw new Error('IPFS pin returned no CID');
    }
    return cid;
}

/** Pin an already-serialized JSON string; return the ipfs:// URI. */
export async function pinJSON(apiUrl, json) {
    const form = new FormData();
    form.append('file', new Blob([json], { type: 'application/json' }), 'doc.json');
    return `ipfs://${await pinForm(apiUrl, form)}`;
}

/** Pin a file's RAW BYTES (byte-exact — an affixed document's keccak and CID
 *  must reproduce wherever it pins). Returns the bare CID. */
export async function pinFile(apiUrl, filePath) {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
    return pinForm(apiUrl, form);
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
export async function populateClauses({ publicClient, walletClient, account, registry, ipfsApiUrl, vault, ownerClients, limit, only, log = console.log }) {
    const files = fs.readdirSync(CLAUSES_DIR).filter((f) => f.endsWith('.json')).sort();
    // First pass: what actually needs registering (idempotent skips are free).
    let pending = [];
    for (const file of files) {
        const spec = JSON.parse(fs.readFileSync(path.join(CLAUSES_DIR, file), 'utf8'));
        const clauseIdStr = spec.clauseId;
        if (!clauseIdStr) throw new Error(`${file} has no clauseId`);
        // SEED_ASSEMBLIES: only the clauses the selected assemblies compose.
        if (only && !only.has(clauseIdStr)) continue;
        const version = BigInt(spec.version ?? 1);
        // On-chain identity is keccak256(abi.encode(name, version)).
        const clauseId = computeClauseKey(clauseIdStr, version);
        if (await publicClient.readContract({
            address: registry, abi: CLAUSE_REGISTRY_ABI, functionName: 'registered', args: [clauseId],
        })) {
            log(`  · ${clauseIdStr} — already registered, skipped`);
            continue;
        }
        pending.push({ spec, clauseIdStr, version, clauseId });
    }
    // SEED_LIMIT: the incremental release registers a NUDGE per session — cap
    // this run to what the session's ETH covers. Never a silent cap: the
    // deferred remainder is named.
    if (limit != null && pending.length > limit) {
        log(`  · SEED_LIMIT ${limit}: registering ${limit} of ${pending.length} outstanding clauses (${pending.length - limit} deferred to a later run)`);
        pending = pending.slice(0, limit);
    }
    let registered = 0;
    if (vault && pending.length > 0) {
        // Genesis-seed preflight: deposits are paid from the vault's own
        // balance (execute forwards value), so an underfunded vault fails
        // here with arithmetic, not mid-run with a revert. Only UNREGISTERED
        // clauses cost a deposit.
        const deposit = await publicClient.readContract({
            address: registry, abi: CLAUSE_REGISTRY_ABI, functionName: 'registrationDeposit',
        });
        const balance = await publicClient.getBalance({ address: vault });
        const need = deposit * BigInt(pending.length);
        if (balance < need) {
            throw new Error(`vault ${vault} holds ${balance} wei but the ${pending.length} outstanding clause deposits need ${need} wei — fund it first`);
        }
    }
    for (const { spec, clauseIdStr, version, clauseId } of pending) {

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
        // No reward tag: the 600M reward is UNIFORM (ratified 2026-07-29) — the
        // registry stores no incentive input. The only classification a clause
        // carries is block.design.article, a reader grouping that stays off-chain.
        if (vault) {
            // Vault-registrar: the vault is msg.sender, so the vault's owner
            // (the DAO, for genesis) — not any EOA — is registrar/author-of-
            // record for THIS artifact. Nonce = the clause key itself: unique
            // per clause, deterministic across re-runs.
            await vaultExecute({
                publicClient, vault, ownerClients,
                to: registry,
                value: deposit,
                data: encodeFunctionData({
                    abi: CLAUSE_REGISTRY_ABI,
                    functionName: 'registerClause',
                    args: [clauseIdStr, version, contentHash, contentURI],
                }),
                nonce: BigInt(clauseId),
                log,
            });
        } else {
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
        }
        registered += 1;
        log(`  ✓ ${clauseIdStr} v${version} — pinned ${contentURI} (article ${spec.block?.design?.article ?? '-'})`);
    }
    return registered;
}

// ── Reference assemblies (`assemblies/*.json`, `clauses/`' sibling) ─────────

/** The codebase's standing sentinel for an unset address-hex value (mirrors
 *  `ZERO_ADDRESS` in frontend/lib/shared/evm.ts). A checked-in reference
 *  assembly cannot ship a real token address, so the seed path substitutes
 *  the live deployment's token at anchor time. */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Fill the deploy-time currency pin: any assembly-scoped figaro-utility-token
 *  composed with the ZERO_ADDRESS sentinel gets the live token address
 *  substituted before anchoring. Templates that don't compose the clause, or
 *  that already pin a real address, pass through unchanged. */
export function fillDeployTimeCurrency(template, tokenAddress) {
    const pin = template.assemblyClauses?.['figaro-utility-token'];
    if (!pin || pin.currency !== ZERO_ADDRESS) return template;
    return {
        ...template,
        assemblyClauses: {
            ...template.assemblyClauses,
            'figaro-utility-token': { ...pin, currency: tokenAddress },
        },
    };
}

/** Anchor one AssemblyTemplate (idempotent — compositionHash is content-derived,
 *  first-write-wins). In vault mode the multisig is msg.sender, so the DAO
 *  becomes the author-of-record for the anchored binding. */
export async function anchorAssembly({ publicClient, walletClient, account, registry, ipfsApiUrl, template, vault, ownerClients, log = console.log }) {
    // Composition hash over the COMPOSITION ONLY (editorial excluded); the slug
    // is presentation, derived off-chain. Both from the SDK single home — the
    // registry keys bindings by compositionHash.
    const compositionHash = templateCompositionHash(template);
    const slug = deriveAssemblySlug(compositionHash);

    // Idempotency via STATE, not an event scan: `bindings[hash].registeredAt`
    // is the contract's own already-registered test. A fromBlock:0 log scan
    // works on devnet's short chain but exceeds every public provider's
    // getLogs range cap on a real network (caught on the Sepolia fork,
    // 2026-08-14).
    const [, registeredAt] = await publicClient.readContract({
        address: registry, abi: ASSEMBLY_REGISTRY_ABI, functionName: 'bindings', args: [compositionHash],
    });
    if (registeredAt !== 0n && registeredAt !== 0) {
        log(`  · ${slug} — already anchored, skipped`);
        return { slug, anchored: false };
    }

    const contentURI = await pinJSON(ipfsApiUrl, canonicalize(template));
    const deposit = await publicClient.readContract({
        address: registry, abi: ASSEMBLY_REGISTRY_ABI, functionName: 'registrationDeposit',
    });
    if (vault) {
        // Nonce = the compositionHash itself: unique per assembly,
        // deterministic across re-runs.
        await vaultExecute({
            publicClient, vault, ownerClients,
            to: registry,
            value: deposit,
            data: encodeFunctionData({
                abi: ASSEMBLY_REGISTRY_ABI,
                functionName: 'registerAssembly',
                args: [compositionHash, contentURI],
            }),
            nonce: BigInt(compositionHash),
            log,
        });
    } else {
        const { request } = await publicClient.simulateContract({
            account: account.address, address: registry, abi: ASSEMBLY_REGISTRY_ABI,
            functionName: 'registerAssembly', args: [compositionHash, contentURI], value: deposit,
        });
        const hash = await walletClient.writeContract(request);
        await publicClient.waitForTransactionReceipt({ hash });
    }
    log(`  ✓ ${slug} — anchored; template ${contentURI}`);
    return { slug, anchored: true };
}

/** Pin the affixed documents, then anchor every reference assembly
 *  (`assemblies/*.json`) with the live settlement token substituted for the
 *  checked-in sentinel. The ONE reference-assembly population path —
 *  devnet (EOA, mock token) and testnet/mainnet (vault, ruled token)
 *  differ only in the arguments. */
export async function populateReferenceAssemblies({ publicClient, walletClient, account, registry, ipfsApiUrl, tokenAddress, vault, ownerClients, limit, only, log = console.log }) {
    const documentsDir = path.join(ASSEMBLIES_DIR, 'documents');
    if (fs.existsSync(documentsDir)) {
        for (const file of fs.readdirSync(documentsDir).sort()) {
            const cid = await pinFile(ipfsApiUrl, path.join(documentsDir, file));
            log(`  · document ${file} — pinned ipfs://${cid}`);
        }
    }
    // SEED_LIMIT counts NEW anchors only — already-anchored skips are free.
    let anchored = 0;
    const files = fs.readdirSync(ASSEMBLIES_DIR).filter((f) => f.endsWith('.json')).sort()
        .filter((f) => !only || only.has(path.basename(f, '.json')));
    for (const file of files) {
        if (limit != null && anchored >= limit) {
            log(`  · SEED_LIMIT ${limit} reached — remaining reference assemblies deferred to a later run`);
            break;
        }
        const raw = JSON.parse(fs.readFileSync(path.join(ASSEMBLIES_DIR, file), 'utf8'));
        const template = fillDeployTimeCurrency(raw, tokenAddress);
        const result = await anchorAssembly({ publicClient, walletClient, account, registry, ipfsApiUrl, template, vault, ownerClients, log });
        if (result.anchored) anchored += 1;
    }
    return anchored;
}

async function main() {
    const env = readEnvLocal();
    const registry = process.env.NEXT_PUBLIC_CLAUSE_REGISTRY ?? env.NEXT_PUBLIC_CLAUSE_REGISTRY;
    const ipfsApiUrl = process.env.NEXT_PUBLIC_IPFS_API_URL ?? env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
    if (!registry) throw new Error('NEXT_PUBLIC_CLAUSE_REGISTRY missing — deploy the contracts first.');

    const account = registrarAccount();
    const chain = await resolveChain();
    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
    const walletClient = createWalletClient({ account, chain, transport: http(RPC_URL) });

    const vault = process.env.REGISTRAR_VAULT;
    let ownerClients;
    if (vault) {
        const keys = (process.env.VAULT_OWNER_KEYS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        if (keys.length === 0) {
            throw new Error('REGISTRAR_VAULT is set but VAULT_OWNER_KEYS is missing — the multisig needs threshold-many owner keys to approve');
        }
        // Key owners first: ownerClients[0] executes (and pays that gas); the
        // Ledger owner, when configured, only ever approves.
        ownerClients = keys.map((k) => createWalletClient({ account: privateKeyToAccount(k), chain, transport: http(RPC_URL) }));
        if (process.env.VAULT_LEDGER_HD_PATH) {
            ownerClients.push(ledgerOwnerClient({ hdPath: process.env.VAULT_LEDGER_HD_PATH, rpcUrl: RPC_URL }));
        }
        // Every configured signer must be a vault owner — a non-owner's
        // approveHash reverts, but only after the device tap; refuse up front.
        for (const c of ownerClients) {
            const ok = await publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'isOwner', args: [c.account.address] });
            if (!ok) throw new Error(`${c.account.address} is not an owner of vault ${vault} — check VAULT_OWNER_KEYS / VAULT_LEDGER_HD_PATH`);
        }
    }

    // SEED_ASSEMBLIES: a nudge = named reference assemblies + exactly the
    // clauses they compose. Resolved from the templates themselves, so the
    // prerequisite set can never drift from the composition.
    let onlyAssemblies;
    let onlyClauses;
    if (process.env.SEED_ASSEMBLIES) {
        onlyAssemblies = new Set(process.env.SEED_ASSEMBLIES.split(',').map((s) => s.trim()).filter(Boolean));
        onlyClauses = new Set();
        for (const name of onlyAssemblies) {
            const file = path.join(ASSEMBLIES_DIR, `${name}.json`);
            if (!fs.existsSync(file)) throw new Error(`SEED_ASSEMBLIES names "${name}" but ${file} does not exist`);
            for (const id of templateComposedClauseIds(JSON.parse(fs.readFileSync(file, 'utf8')))) onlyClauses.add(id);
        }
        console.log(`SEED_ASSEMBLIES ${[...onlyAssemblies].join(', ')} → clause set ${[...onlyClauses].sort().join(', ')}`);
    }

    // SEED_LIMIT: one shared budget per run — clauses consume first (they must
    // exist before assemblies that compose them can resolve), assemblies get
    // the remainder.
    const seedLimit = process.env.SEED_LIMIT ? Number(process.env.SEED_LIMIT) : undefined;
    if (seedLimit !== undefined && (!Number.isInteger(seedLimit) || seedLimit < 0)) {
        throw new Error(`SEED_LIMIT must be a non-negative integer, got "${process.env.SEED_LIMIT}"`);
    }

    console.log(`Populating clauses → ClauseRegistry ${registry} (chain ${chain.id})`);
    console.log(vault ? `  registrar (vault) ${vault}` : `  registrar ${account.address}`);
    console.log(`  IPFS      ${pinService() ? `pin service (${pinService().api})` : ipfsApiUrl}\n`);
    const n = await populateClauses({ publicClient, walletClient, account, registry, ipfsApiUrl, vault, ownerClients, limit: seedLimit, only: onlyClauses });
    console.log(`\nDone — ${n} clause(s) newly registered + pinned.`);

    // Reference assemblies ride the same invocation when the registry and the
    // settlement-token fill are both provided (testnet/mainnet: Sepolia USDC
    // ruled 2026-08-14; devnet's populate-test-data passes its mock instead).
    const assemblyRegistry = process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY ?? env.NEXT_PUBLIC_ASSEMBLY_REGISTRY;
    const assemblyToken = process.env.ASSEMBLY_TOKEN_ADDRESS;
    if (assemblyRegistry && assemblyToken) {
        const remaining = seedLimit === undefined ? undefined : Math.max(0, seedLimit - n);
        if (remaining === 0) {
            console.log(`\nSEED_LIMIT ${seedLimit} exhausted by clauses — reference assemblies deferred to a later run.`);
        } else {
            console.log(`\nPopulating reference assemblies → AssemblyRegistry ${assemblyRegistry} (token ${assemblyToken})`);
            const a = await populateReferenceAssemblies({
                publicClient, walletClient, account, registry: assemblyRegistry, ipfsApiUrl,
                tokenAddress: assemblyToken, vault, ownerClients, limit: remaining, only: onlyAssemblies,
            });
            console.log(`Done — ${a} reference assembly(ies) newly anchored.`);
        }
    }
}

// Run as a script (not when imported).
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((err) => { console.error(err); process.exit(1); });
}
