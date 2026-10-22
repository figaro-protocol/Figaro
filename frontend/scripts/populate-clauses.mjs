#!/usr/bin/env node
/**
 * populate-clauses.mjs — the ONE clause-population path for PRODUCTION / TESTNET /
 * MAINNET. Pre-populates ClauseRegistry + IPFS with the protocol's clause specs.
 *
 * For each Layer-A clause spec in `clauses/*.json` (the canonical seed data,
 * the single origin pinned to IPFS and anchored on-chain):
 *   1. pin the spec's CANONICAL JSON bytes (`canonicalize`) to IPFS (real CID), and
 *   2. `registerClause(clauseKey, contentURI)` on ClauseRegistry, where the
 *      clause key is keccak256 of exactly those pinned bytes
 *      (`computeClauseKey`) — so any reader fetches the bytes from chain state
 *      alone and checks them against the key.
 *
 * The reference assemblies (`assemblies/*.json`) and the SEED_CLAUSES list are
 * AUTHORED by clause name (`name` or `name@version`); every name is resolved
 * to the key of the loaded spec it names (`resolveAuthoredClauseKeys`) here,
 * at seed time, before anything is pinned — everything pinned carries keys.
 * Each authored agreement (`agreements/*.json`) is composed over the specs
 * (`composeAuthoredAgreements`, keyed; it names the two mandatory clauses
 * like any other); each
 * reference assembly is built over the agreements its agreements name
 * (`assembleAuthored`: the entry binds the named agreement's hash and carries
 * its own topology parents); every DISTINCT agreement is pinned and
 * registered once on AgreementRegistry (a key the registry already binds is
 * skipped), then the assembly is registered on AssemblyRegistry.
 *
 * No deploy script anchors a placeholder hash, and no clause spec ships bundled
 * in the frontend: `clauses/*.json` pinned to IPFS and anchored here is the only
 * source, so every clause is genuinely on-chain + on-IPFS — one SSoT.
 *
 * Idempotent: a clause already on the registry is skipped (first-write-wins).
 *
 * Env (from frontend/.env.local unless overridden):
 *   NEXT_PUBLIC_CLAUSE_REGISTRY  — the ClauseRegistry address (required)
 *   NEXT_PUBLIC_IPFS_API_URL     — Kubo API (default http://127.0.0.1:5001)
 *   RPC_URL                      — chain RPC (default http://127.0.0.1:8545)
 *   REGISTRAR_PRIVATE_KEY        — signer; defaults to anvil[0] (devnet only)
 *   REGISTRAR_LEDGER_HD_PATH     — instead of a key: the registrar is a Ledger
 *                                  account (Ledger Live path `m/44'/60'/N'/0/0`);
 *                                  every registration is signed ON THE DEVICE via
 *                                  Foundry's `cast send --ledger`, its stake paid
 *                                  from that account (the founder's own artifacts:
 *                                  the reference clauses + assemblies that are not
 *                                  the mandatory pair — RELEASE_READINESS Task 13)
 *
 * VAULT-REGISTRAR MODE (the LEXICON vault-registrar seam). This script always
 * acts FOR exactly one registrar per invocation, and registrar is a PER-WALLET
 * role — a wallet registers only what it claims ownership of. The default
 * registrar is an EOA (REGISTRAR_PRIVATE_KEY). When the registrar is a
 * multisig VAULT — the DAO's vault for the genesis seed set (the endowment
 * rule: author-of-record is the literal registrar,
 * `RpgfMinter._isAuthor` reads `depositOf(...).registeredBy`) — set:
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
 * REFERENCE ASSEMBLIES ride the same invocation when all three are set:
 *   NEXT_PUBLIC_ASSEMBLY_REGISTRY — the AssemblyRegistry address
 *   NEXT_PUBLIC_AGREEMENT_REGISTRY — the AgreementRegistry address (each
 *                                   reference assembly's agreements register
 *                                   there first)
 *   ASSEMBLY_TOKEN_ADDRESS        — the denomination substituted for the
 *                                   checked-in ZERO_ADDRESS sentinel (Sepolia:
 *                                   USDC)
 *
 * INCREMENTAL RELEASE controls (the nudge-per-session Sepolia rollout):
 *   SEED_ASSEMBLIES       — comma-separated reference-assembly names (the
 *                           `assemblies/<name>.json` basenames): anchor ONLY
 *                           these, and register ONLY the clauses they compose
 *                           (`assemblyComposedClauseKeys`) — a nudge is a
 *                           usable assembly plus its prerequisites, not an
 *                           alphabetical prefix of the clause set. Unset =
 *                           everything.
 *   SEED_CLAUSES          — comma-separated clause names (`name` or
 *                           `name@version`, resolved to keys over the
 *                           loaded specs): register ONLY these
 *                           (unioned with the SEED_ASSEMBLIES-derived set when
 *                           both are given). The vault-registrar genesis run
 *                           names exactly the mandatory clauses here.
 *   SEED_LIMIT            — cap NEW registrations this run (one shared budget:
 *                           clauses first, assemblies get the remainder; an
 *                           assembly's own agreements register with it and
 *                           are not counted apart)
 *   IPFS_PIN_SERVICE_JWT  — pin via a managed pinning service instead of local
 *                           Kubo (public seeding: the Pinata DAO key, so seed
 *                           specs outlive the maintainer's laptop)
 *   IPFS_PIN_SERVICE_API  — service API base (default https://api.pinata.cloud)
 *   IPFS_WARM_GATEWAY_URL — after every pin-service pin, fetch the CID once
 *                           through this public gateway so it resolves and
 *                           caches the content BEFORE a visitor asks (a fresh
 *                           pin otherwise 504s on public gateways until the
 *                           provider record propagates). Default https://ipfs.io
 *                           when a pin service is used; empty disables.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    createPublicClient, createWalletClient, defineChain, encodeFunctionData, http,
} from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
// Protocol canonicals come from the SDK (@figaro-protocol/sdk, file:../sdk — the
// compiled dist resolves from plain node ESM): the registry ABI, the clause
// key, and the canonical-JSON convention. Nothing is re-implemented here.
import {
    CLAUSE_REGISTRY_ABI, ASSEMBLY_REGISTRY_ABI, AGREEMENT_REGISTRY_ABI, computeClauseKey, canonicalize,
    assemblyHashOf, deriveAssemblySlug, parseProjectionHints,
    assemblyComposedClauseKeys, resolveAuthoredClauseKeys, composeAuthoredAgreements, assembleAuthored,
    agreementHashOf,
} from '@figaro-protocol/sdk';
import { parseClauseSpec } from '@figaro-protocol/sdk/clauses';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Canonical Layer-A specs / ClauseRegistry seed data — the single origin,
// pinned to IPFS and anchored on-chain. Nothing bundles a copy.
export const CLAUSES_DIR = path.resolve(__dirname, '../../clauses');
/** The authored agreements (`agreements/*.json`, clause names with the
 *  designer's fills) the reference assemblies' agreements name. */
export const AGREEMENTS_DIR = path.resolve(__dirname, '../../agreements');

/** The reference assemblies — the user-onboarding set, `clauses/`' sibling:
 *  authored assemblies whose agreements' agreements register on
 *  AgreementRegistry and whose assemblies anchor on AssemblyRegistry at
 *  populate time (affixed documents in `assemblies/documents/`). */
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

/** A wallet whose key never leaves a Ledger device — usable both as a vault
 *  OWNER (approvals) and as a direct REGISTRAR (registrations, stake attached).
 *  Same shape as the viem wallet clients the rest of this script drives
 *  (`account.address` + `writeContract` resolving to a tx hash), so every
 *  caller is signer-agnostic; the signing itself is Foundry's
 *  `cast send --ledger` — the device prompts, the maintainer verifies the
 *  target address (and value) on its screen and taps. The address is read
 *  from the device at construction, so a wrong derivation index surfaces
 *  before anything is signed. */
export function ledgerWalletClient({ hdPath, rpcUrl, log = console.log }) {
    let address;
    for (let attempt = 1; ; attempt++) {
        try {
            address = execFileSync('cast', ['wallet', 'address', '--ledger', '--hd-path', hdPath], {
                stdio: ['inherit', 'pipe', 'pipe'],
            }).toString().trim();
            break;
        } catch (err) {
            const stderr = (err.stderr ?? '').toString();
            if (!/Could not connect to Ledger device/.test(stderr) || attempt >= LEDGER_RETRIES) {
                throw new Error(`Ledger address read failed after ${attempt} attempt(s): ${stderr.trim() || err.message.split('\n')[0]}`);
            }
            log(`  … Ledger not reachable (attempt ${attempt}/${LEDGER_RETRIES}) — unlock it, open the Ethereum app, quit Ledger Live; retrying in ${LEDGER_RETRY_MS / 1000}s`);
            execFileSync('sleep', [String(LEDGER_RETRY_MS / 1000)]);
        }
    }
    return {
        account: { address },
        async writeContract({ address: to, abi, functionName, args = [], value }) {
            const fn = abi.find((item) => item.type === 'function' && item.name === functionName);
            if (!fn) throw new Error(`ledgerWalletClient: ${functionName} is not in the given ABI`);
            const sig = `${functionName}(${fn.inputs.map((input) => input.type).join(',')})`;
            const argv = args.map((a) => (typeof a === 'bigint' ? a.toString() : String(a)));
            const valueArgs = value ? ['--value', value.toString()] : [];
            log(`  ⧗ Ledger ${hdPath} (${address}): sign ${sig} → ${to}${value ? ` with ${value} wei` : ''} on the device — verify the address on its screen`);
            // The device locks itself between the chain confirmations that
            // pace the taps; an unreachable device is a wait, not a failure
            // of the nudge (every step before this one is already on-chain and
            // idempotent). Retry until it answers or the maintainer gives up.
            for (let attempt = 1; ; attempt++) {
                try {
                    const out = execFileSync('cast', [
                        'send', '--ledger', '--hd-path', hdPath, '--rpc-url', rpcUrl, '--json', ...valueArgs,
                        to, sig, ...argv,
                    ], { stdio: ['inherit', 'pipe', 'pipe'] }).toString();
                    return JSON.parse(out).transactionHash;
                } catch (err) {
                    const stderr = (err.stderr ?? '').toString();
                    if (!/Could not connect to Ledger device/.test(stderr) || attempt >= LEDGER_RETRIES) {
                        // Never echo cast's command line: it carries the RPC URL (a keyed endpoint).
                        throw new Error(`Ledger signing failed after ${attempt} attempt(s): ${stderr.trim() || err.message.split('\n')[0]}`);
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
export function pinService() {
    const jwt = process.env.IPFS_PIN_SERVICE_JWT ?? '';
    if (!jwt) return null;
    const api = (process.env.IPFS_PIN_SERVICE_API || 'https://api.pinata.cloud').replace(/\/$/, '');
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
    if (service) await warmGateway(cid);
    return cid;
}

/** The public gateway a pin is warmed through (pin-service runs only). */
function warmGatewayUrl() {
    if (!pinService()) return null;
    const url = process.env.IPFS_WARM_GATEWAY_URL ?? 'https://ipfs.io';
    return url ? url.replace(/\/$/, '') : null;
}

/** Ask the public gateway for the CID once so it fetches + caches it now.
 *  Best-effort: a gateway timeout is logged, never fatal — the pin itself is
 *  already durable and any gateway serves it once the record propagates. */
export async function warmGateway(cid, log = console.log) {
    const base = warmGatewayUrl();
    if (!base) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
        const res = await fetch(`${base}/ipfs/${cid}`, { signal: controller.signal });
        if (res.ok) { log(`  · warmed ${base}/ipfs/${cid}`); return true; }
        log(`  · warm ${cid} via ${base}: HTTP ${res.status} (gateway will fetch on first visit)`);
    } catch (err) {
        log(`  · warm ${cid} via ${base}: ${err?.name === 'AbortError' ? 'timed out' : err?.message} (gateway will fetch on first visit)`);
    } finally {
        clearTimeout(timer);
    }
    return false;
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
 * Every spec in `clauses/`, each with the clause key its canonical bytes hash
 * to. The set seeding resolves authored names against
 * (`resolveAuthoredClauseKeys`'s `AuthoredSpecSet`) and derives agreements
 * over (a `SpecSource`: `get` by key, `list()` — each entry the parsed spec
 * view beside its key, its own `clauseId` and `version`, its file and raw spec).
 */
export function loadAuthoredSpecs() {
    const specs = fs.readdirSync(CLAUSES_DIR).filter((f) => f.endsWith('.json')).sort().map((file) => {
        const spec = JSON.parse(fs.readFileSync(path.join(CLAUSES_DIR, file), 'utf8'));
        if (!spec.clauseId) throw new Error(`${file} has no clauseId`);
        const parsed = parseClauseSpec(spec);
        if (!parsed.ok) throw new Error(`${file} does not parse as a clause spec`);
        return {
            ...parsed.spec, hints: parseProjectionHints(spec),
            file, spec, clauseKey: computeClauseKey(spec), clauseId: spec.clauseId, version: spec.version,
        };
    });
    const byKey = new Map(specs.map((s) => [s.clauseKey.toLowerCase(), s]));
    return { specs, list: () => specs, get: (clauseKey) => byKey.get(String(clauseKey).toLowerCase()) };
}

/** The keys of the clauses an authored name list names (`name` or
 *  `name@version`), resolved over the loaded specs — seed time only. */
export function resolveAuthoredClauseNames(names, authored = loadAuthoredSpecs()) {
    const doc = resolveAuthoredClauseKeys(
        { agreements: [], assemblyClauses: Object.fromEntries(names.map((n) => [n, {}])) },
        authored,
    );
    return Object.keys(doc.assemblyClauses);
}

/** Every authored agreement (`agreements/*.json`) composed over the loaded
 *  specs, by its name (the file's basename): the document the seeding pins
 *  and the key it registers under (`composeAuthoredAgreements`). */
export function loadAuthoredAgreements(authored = loadAuthoredSpecs()) {
    const authoredByName = {};
    for (const file of fs.readdirSync(AGREEMENTS_DIR).filter((f) => f.endsWith('.json')).sort()) {
        authoredByName[path.basename(file, '.json')] = JSON.parse(fs.readFileSync(path.join(AGREEMENTS_DIR, file), 'utf8'));
    }
    return Object.fromEntries(Object.entries(composeAuthoredAgreements(authoredByName, authored)).map(([name, { document }]) => [name, document]));
}

/** An authored reference assembly (`assemblies/<file>`) built over the
 *  authored agreements its agreements name: `{ assembly, agreements }` —
 *  the assembly seeding anchors and the agreements its agreements bind,
 *  keyed (`assembleAuthored`). Seed time only. */
export function readBuiltAssembly(file, authored = loadAuthoredSpecs(), agreementsByName = loadAuthoredAgreements(authored)) {
    return assembleAuthored(JSON.parse(fs.readFileSync(file, 'utf8')), agreementsByName, authored);
}

/**
 * Pin + register every clause spec. Reusable from the test-data script.
 * `only` is a set of clause KEYS (resolved from authored names by the caller).
 * @returns the number of clauses newly registered.
 */
export async function populateClauses({ publicClient, walletClient, account, registry, ipfsApiUrl, vault, ownerClients, limit, only, log = console.log }) {
    const { specs } = loadAuthoredSpecs();
    // First pass: what actually needs registering (idempotent skips are free).
    let pending = [];
    for (const { spec, clauseKey } of specs) {
        // SEED_ASSEMBLIES / SEED_CLAUSES: only the selected clauses.
        if (only && !only.has(clauseKey)) continue;
        const label = `${spec.clauseId} v${spec.version}`;
        if (await publicClient.readContract({
            address: registry, abi: CLAUSE_REGISTRY_ABI, functionName: 'registered', args: [clauseKey],
        })) {
            log(`  · ${label} — already registered, skipped`);
            continue;
        }
        pending.push({ spec, clauseKey, label });
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
    for (const { spec, clauseKey, label } of pending) {

        // Pin the spec's CANONICAL bytes (sorted keys at every depth, no
        // whitespace) — the clause key is keccak256 of exactly these bytes,
        // and a reader checks the bytes it fetches against the key.
        const contentURI = await pinJSON(ipfsApiUrl, canonicalize(spec));

        // Registering = staked intent (K4): every registration posts the
        // registry's deposit, reclaimable via withdrawDeposit (which
        // de-surfaces the clause).
        const deposit = await publicClient.readContract({
            address: registry, abi: CLAUSE_REGISTRY_ABI, functionName: 'registrationDeposit',
        });
        // No reward tag: the 600M reward is UNIFORM — the
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
                    args: [clauseKey, contentURI],
                }),
                nonce: BigInt(clauseKey),
                log,
            });
        } else {
            await publicClient.simulateContract({
                account: account.address,
                address: registry,
                abi: CLAUSE_REGISTRY_ABI,
                functionName: 'registerClause',
                args: [clauseKey, contentURI],
                value: deposit,
            });
            // Write through the client's own shape (never the simulated
            // request — it carries a JSON-RPC account and needs the node to
            // hold the key; the devnet's unlocked accounts masked this).
            const hash = await walletClient.writeContract({
                address: registry, abi: CLAUSE_REGISTRY_ABI, functionName: 'registerClause',
                args: [clauseKey, contentURI], value: deposit,
            });
            await publicClient.waitForTransactionReceipt({ hash });
        }
        registered += 1;
        log(`  ✓ ${label} ${clauseKey} — pinned ${contentURI} (article ${spec.block?.design?.article ?? '-'})`);
    }
    return registered;
}

// ── Reference assemblies (`assemblies/*.json`, `clauses/`' sibling) ─────────

/** The codebase's standing sentinel for an unset address-hex value (mirrors
 *  `ZERO_ADDRESS` in frontend/lib/shared/evm.ts). A checked-in reference
 *  assembly cannot ship a real token address, so the seed path substitutes
 *  the live deployment's token at anchor time. */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Fill the deploy-time currency pin on a RESOLVED assembly: every
 *  assembly-scoped clause whose `currency` is the ZERO_ADDRESS sentinel (a
 *  denomination pin the checked-in file cannot fill) gets the live token
 *  address substituted before anchoring. Read by the sentinel value, never by
 *  a clause name; a assembly with no such clause passes through unchanged. */
export function fillDeployTimeCurrency(assembly, tokenAddress) {
    const clauseEntries = assembly.assemblyClauses ?? {};
    const pinned = Object.keys(clauseEntries).filter((key) => clauseEntries[key]?.currency === ZERO_ADDRESS);
    if (pinned.length === 0) return assembly;
    return {
        ...assembly,
        assemblyClauses: Object.fromEntries(Object.entries(clauseEntries).map(([key, values]) => [
            key,
            pinned.includes(key) ? { ...values, currency: tokenAddress } : values,
        ])),
    };
}

/** Register one agreement on AgreementRegistry (idempotent — the
 *  key is content-derived, first-write-wins: a key the registry already
 *  binds is skipped). The pinned document carries the editorial `name` beside
 *  the keyed clauses. In vault mode the multisig is msg.sender, so the DAO is
 *  the agreement's designer of record. */
export async function registerAgreement({ publicClient, walletClient, account, registry, ipfsApiUrl, agreementHash, document, vault, ownerClients, log = console.log }) {
    const [, registeredAt] = await publicClient.readContract({
        address: registry, abi: AGREEMENT_REGISTRY_ABI, functionName: 'bindings', args: [agreementHash],
    });
    if (registeredAt !== 0n && registeredAt !== 0) {
        log(`    · agreement ${agreementHash} — already registered, skipped`);
        return { registered: false };
    }
    const contentURI = await pinJSON(ipfsApiUrl, canonicalize(document));
    const deposit = await publicClient.readContract({
        address: registry, abi: AGREEMENT_REGISTRY_ABI, functionName: 'registrationDeposit',
    });
    if (vault) {
        await vaultExecute({
            publicClient, vault, ownerClients,
            to: registry,
            value: deposit,
            data: encodeFunctionData({ abi: AGREEMENT_REGISTRY_ABI, functionName: 'registerAgreement', args: [agreementHash, contentURI] }),
            // Nonce = the agreement hash: unique per agreement, deterministic across re-runs.
            nonce: BigInt(agreementHash),
            log,
        });
    } else {
        await publicClient.simulateContract({
            account: account.address, address: registry, abi: AGREEMENT_REGISTRY_ABI,
            functionName: 'registerAgreement', args: [agreementHash, contentURI], value: deposit,
        });
        const hash = await walletClient.writeContract({
            address: registry, abi: AGREEMENT_REGISTRY_ABI, functionName: 'registerAgreement',
            args: [agreementHash, contentURI], value: deposit,
        });
        await publicClient.waitForTransactionReceipt({ hash });
    }
    log(`    ✓ agreement ${agreementHash} — registered; document ${contentURI}`);
    return { registered: true };
}

/** Register a built assembly's agreements (each DISTINCT key once, in order
 *  entry order; the document pinned is the written agreement's own — its name
 *  and summary beside its clauses — and a document written without a name
 *  is named after the assembly and the first agreement binding it), then
 *  anchor its assembly. */
export async function anchorBuiltAssembly({ built, agreementRegistry, ...args }) {
    const { assembly, agreements } = built;
    for (const [i, entry] of assembly.agreements.entries()) {
        const doc = agreements[entry.agreementHash];
        if (!doc || assembly.agreements.findIndex((s) => s.agreementHash === entry.agreementHash) !== i) continue;
        await registerAgreement({
            ...args,
            registry: agreementRegistry,
            agreementHash: entry.agreementHash,
            document: doc.name
                ? doc
                : { ...(assembly.name ? { name: `${assembly.name} · ${entry.id}` } : {}), clauses: doc.clauses },
        });
    }
    return anchorAssembly({ ...args, assembly });
}

/** Anchor one Assembly (idempotent — assemblyHash is content-derived,
 *  first-write-wins). In vault mode the multisig is msg.sender, so the DAO
 *  becomes the assembly's designer of record. */
export async function anchorAssembly({ publicClient, walletClient, account, registry, ipfsApiUrl, assembly, vault, ownerClients, log = console.log }) {
    // Assembly hash over the COMPOSITION ONLY (editorial excluded); the slug
    // is presentation, derived off-chain. Both from the SDK single home — the
    // registry keys bindings by assemblyHash.
    const assemblyHash = assemblyHashOf(assembly);
    const slug = deriveAssemblySlug(assemblyHash);

    // Idempotency via STATE, not an event scan: `bindings[hash].registeredAt`
    // is the contract's own already-registered test. A fromBlock:0 log scan
    // works on devnet's short chain but exceeds every public provider's
    // getLogs range cap on a real network (as the Sepolia fork shows).
    const [, registeredAt] = await publicClient.readContract({
        address: registry, abi: ASSEMBLY_REGISTRY_ABI, functionName: 'bindings', args: [assemblyHash],
    });
    if (registeredAt !== 0n && registeredAt !== 0) {
        log(`  · ${slug} — already anchored, skipped`);
        return { slug, anchored: false };
    }

    const contentURI = await pinJSON(ipfsApiUrl, canonicalize(assembly));
    const deposit = await publicClient.readContract({
        address: registry, abi: ASSEMBLY_REGISTRY_ABI, functionName: 'registrationDeposit',
    });
    if (vault) {
        // Nonce = the assemblyHash itself: unique per assembly,
        // deterministic across re-runs.
        await vaultExecute({
            publicClient, vault, ownerClients,
            to: registry,
            value: deposit,
            data: encodeFunctionData({
                abi: ASSEMBLY_REGISTRY_ABI,
                functionName: 'registerAssembly',
                args: [assemblyHash, contentURI],
            }),
            nonce: BigInt(assemblyHash),
            log,
        });
    } else {
        await publicClient.simulateContract({
            account: account.address, address: registry, abi: ASSEMBLY_REGISTRY_ABI,
            functionName: 'registerAssembly', args: [assemblyHash, contentURI], value: deposit,
        });
        const hash = await walletClient.writeContract({
            address: registry, abi: ASSEMBLY_REGISTRY_ABI, functionName: 'registerAssembly',
            args: [assemblyHash, contentURI], value: deposit,
        });
        await publicClient.waitForTransactionReceipt({ hash });
    }
    log(`  ✓ ${slug} — anchored; assembly ${contentURI}`);
    return { slug, anchored: true };
}

/** Pin the affixed documents, then anchor every reference assembly
 *  (`assemblies/*.json`) with the live denomination substituted for the
 *  checked-in sentinel. The ONE reference-assembly population path —
 *  devnet (EOA, mock token) and testnet/mainnet (vault, ruled token)
 *  differ only in the arguments. */
export async function populateReferenceAssemblies({ publicClient, walletClient, account, registry, agreementRegistry, ipfsApiUrl, tokenAddress, vault, ownerClients, limit, only, log = console.log }) {
    const documentsDir = path.join(ASSEMBLIES_DIR, 'documents');
    if (fs.existsSync(documentsDir)) {
        for (const file of fs.readdirSync(documentsDir).sort()) {
            const cid = await pinFile(ipfsApiUrl, path.join(documentsDir, file));
            log(`  · document ${file} — pinned ipfs://${cid}`);
        }
    }
    // SEED_LIMIT counts NEW anchors only — already-anchored skips are free.
    let anchored = 0;
    const authored = loadAuthoredSpecs();
    const agreementsByName = loadAuthoredAgreements(authored);
    const files = fs.readdirSync(ASSEMBLIES_DIR).filter((f) => f.endsWith('.json')).sort()
        .filter((f) => !only || only.has(path.basename(f, '.json')));
    for (const file of files) {
        if (limit != null && anchored >= limit) {
            log(`  · SEED_LIMIT ${limit} reached — remaining reference assemblies deferred to a later run`);
            break;
        }
        const built = readBuiltAssembly(path.join(ASSEMBLIES_DIR, file), authored, agreementsByName);
        const assembly = fillDeployTimeCurrency(built.assembly, tokenAddress);
        const result = await anchorBuiltAssembly({
            built: { assembly, agreements: built.agreements }, agreementRegistry,
            publicClient, walletClient, account, registry, ipfsApiUrl, vault, ownerClients, log,
        });
        if (result.anchored) anchored += 1;
    }
    return anchored;
}

async function main() {
    const env = readEnvLocal();
    const registry = process.env.NEXT_PUBLIC_CLAUSE_REGISTRY ?? env.NEXT_PUBLIC_CLAUSE_REGISTRY;
    const ipfsApiUrl = process.env.NEXT_PUBLIC_IPFS_API_URL ?? env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
    if (!registry) throw new Error('NEXT_PUBLIC_CLAUSE_REGISTRY missing — deploy the contracts first.');

    const chain = await resolveChain();
    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
    // ONE registrar per invocation: a key, a Ledger account, or a vault.
    const vault = process.env.REGISTRAR_VAULT;
    if (vault && process.env.REGISTRAR_LEDGER_HD_PATH) {
        throw new Error('REGISTRAR_VAULT and REGISTRAR_LEDGER_HD_PATH are two registrars — this script acts for exactly one per invocation');
    }
    const walletClient = process.env.REGISTRAR_LEDGER_HD_PATH
        ? ledgerWalletClient({ hdPath: process.env.REGISTRAR_LEDGER_HD_PATH, rpcUrl: RPC_URL })
        : createWalletClient({ account: registrarAccount(), chain, transport: http(RPC_URL) });
    const account = walletClient.account;

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
            ownerClients.push(ledgerWalletClient({ hdPath: process.env.VAULT_LEDGER_HD_PATH, rpcUrl: RPC_URL }));
        }
        // Every configured signer must be a vault owner — a non-owner's
        // approveHash reverts, but only after the device tap; refuse up front.
        for (const c of ownerClients) {
            const ok = await publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'isOwner', args: [c.account.address] });
            if (!ok) throw new Error(`${c.account.address} is not an owner of vault ${vault} — check VAULT_OWNER_KEYS / VAULT_LEDGER_HD_PATH`);
        }
    }

    // SEED_ASSEMBLIES: a nudge = named reference assemblies + exactly the
    // clauses they compose. Resolved from the assemblies themselves, so the
    // prerequisite set can never drift from the composition.
    let onlyAssemblies;
    let onlyClauses;
    if (process.env.SEED_ASSEMBLIES) {
        onlyAssemblies = new Set(process.env.SEED_ASSEMBLIES.split(',').map((s) => s.trim()).filter(Boolean));
        onlyClauses = new Set();
        const authoredSpecs = loadAuthoredSpecs();
        const agreementsByName = loadAuthoredAgreements(authoredSpecs);
        for (const name of onlyAssemblies) {
            const file = path.join(ASSEMBLIES_DIR, `${name}.json`);
            if (!fs.existsSync(file)) throw new Error(`SEED_ASSEMBLIES names "${name}" but ${file} does not exist`);
            const built = readBuiltAssembly(file, authoredSpecs, agreementsByName);
            for (const key of assemblyComposedClauseKeys(built.assembly, built.agreements)) onlyClauses.add(key);
        }
        console.log(`SEED_ASSEMBLIES ${[...onlyAssemblies].join(', ')} → clause set ${[...onlyClauses].sort().join(', ')}`);
    }
    if (process.env.SEED_CLAUSES) {
        onlyClauses ??= new Set();
        const names = process.env.SEED_CLAUSES.split(',').map((s) => s.trim()).filter(Boolean);
        for (const key of resolveAuthoredClauseNames(names)) onlyClauses.add(key);
        console.log(`SEED_CLAUSES → ${[...onlyClauses].sort().join(', ')}`);
    }

    // A Ledger-driven founder run registers the founder's own artifacts and
    // never a mandatory clause: those are the DAO vault's (RELEASE_READINESS
    // Task 13), and first write wins forever. An assembly's prerequisite set
    // carries the mandatory clauses its agreements name, so they are
    // taken back out here unless
    // SEED_CLAUSES names one by hand (a deliberate act, logged as such). The
    // devnet's one-key seeding (no Ledger, no vault) is untouched.
    if (process.env.REGISTRAR_LEDGER_HD_PATH && !vault) {
        const authored = loadAuthoredSpecs();
        const named = process.env.SEED_CLAUSES
            ? new Set(resolveAuthoredClauseNames(process.env.SEED_CLAUSES.split(',').map((s) => s.trim()).filter(Boolean)).map((k) => k.toLowerCase()))
            : new Set();
        const mandatory = authored.list().filter((s) => s.spec?.block?.design?.article === 'mandatory');
        const skipped = [];
        onlyClauses ??= new Set(authored.list().map((s) => s.clauseKey));
        for (const m of mandatory) {
            if (named.has(m.clauseKey.toLowerCase())) { console.log(`  SEED_CLAUSES names the mandatory ${m.clauseId}@${m.version} by hand — the founder registers it`); continue; }
            for (const key of [...onlyClauses]) if (key.toLowerCase() === m.clauseKey.toLowerCase()) { onlyClauses.delete(key); skipped.push(`${m.clauseId}@${m.version}`); }
        }
        if (skipped.length) console.log(`  mandatory clauses are the DAO vault's, not the founder's — skipped: ${skipped.join(', ')}`);
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
    // denomination fill are both provided (testnet/mainnet: Sepolia USDC;
    // devnet's populate-test-data passes its mock instead).
    const assemblyToken = process.env.ASSEMBLY_TOKEN_ADDRESS;
    if (assemblyRegistry && assemblyToken && !agreementRegistry) {
        throw new Error('NEXT_PUBLIC_ASSEMBLY_REGISTRY is set but NEXT_PUBLIC_AGREEMENT_REGISTRY is not — a reference assembly\'s agreements register before it');
    }
    if (assemblyRegistry && assemblyToken) {
        const remaining = seedLimit === undefined ? undefined : Math.max(0, seedLimit - n);
        if (remaining === 0) {
            console.log(`\nSEED_LIMIT ${seedLimit} exhausted by clauses — reference assemblies deferred to a later run.`);
        } else {
            console.log(`\nPopulating reference assemblies → AssemblyRegistry ${assemblyRegistry} (token ${assemblyToken})`);
            const a = await populateReferenceAssemblies({
                publicClient, walletClient, account, registry: assemblyRegistry, agreementRegistry, ipfsApiUrl,
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
