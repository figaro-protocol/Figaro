/**
 * withdraw-deposits.mjs — bulk-reclaim registration deposits from the clause
 * and assembly registries, the withdraw half of populate-clauses.mjs (which
 * is the bulk-deposit half). Built for the Sepolia redeploy day: every id the
 * acting wallet registered on the OLD stack is withdrawn (no cooldown), the
 * stakes return, and the new stack is seeded fresh. Withdrawing de-surfaces;
 * the bindings stay permanent — this script moves only the stakes.
 *
 * ONE actor per invocation — the same three modes as the populate scripts:
 *
 *   REGISTRAR_PRIVATE_KEY     — EOA signs each withdrawDeposit directly
 *   REGISTRAR_LEDGER_HD_PATH  — Ledger signs each on the device (one tap per id)
 *   REGISTRAR_VAULT           — the vault is the registeredBy of record; each
 *     withdrawDeposit routes through the multisig (VAULT_OWNER_KEYS approvals,
 *     + VAULT_LEDGER_HD_PATH for a device owner) and the ETH returns TO THE
 *     VAULT, which forwards per the day's plan — this script never moves it.
 *
 * Discovery is from the chain, never a list: ClauseRegistered /
 * AssemblyRegistered events are scanned (SCAN_FROM_BLOCK trims public-network
 * scans), narrowed to rows whose registeredBy is the actor, and each live
 * deposit is withdrawn. Already-withdrawn ids are skipped, so a re-run
 * converges — same idempotence discipline as the populate scripts. The old
 * stack's events carry the pre-rename arg names on-chain, but names are
 * labels, not topics: the current ABI decodes them as `registeredBy`.
 *
 * DRY_RUN=1 prints the manifest (each id, its registry, its stake) and sends
 * nothing — the written-plan-reviewed-before-broadcast gate.
 *
 * Env:
 *   RPC_URL                       — required
 *   NEXT_PUBLIC_CLAUSE_REGISTRY   — falls back to frontend/.env.local
 *   NEXT_PUBLIC_ASSEMBLY_REGISTRY — falls back to frontend/.env.local
 *   SCAN_FROM_BLOCK               — first block to scan (default 0)
 *   WITHDRAW_CLAUSES              — csv of clauseId[@version] (default v1):
 *                                   build the manifest from these EXPLICIT ids
 *                                   instead of the event scan (public gateways'
 *                                   log indexes are load-balanced and flaky —
 *                                   state reads are not). WITHDRAW_ASSEMBLIES
 *                                   is its sibling (csv of compositionHashes);
 *                                   either alone skips the other family's scan.
 *   DRY_RUN                       — print the manifest, send nothing
 *   ACTOR                         — DRY_RUN only: manifest for this address
 *                                   without constructing a signer (no device)
 */

import { createPublicClient, createWalletClient, encodeFunctionData, formatEther, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CLAUSE_REGISTRY_ABI, ASSEMBLY_REGISTRY_ABI, computeClauseKey } from '@figaro/sdk';
import {
    VAULT_ABI, ledgerWalletClient, readEnvLocal, registrarAccount, resolveChain, vaultExecute,
} from './populate-clauses.mjs';

const RPC_URL = process.env.RPC_URL;
if (!RPC_URL) throw new Error('RPC_URL is required');

/** Public gateways cap one `eth_getLogs` range (Infura 10k, publicnode ~50k);
 *  a from-deployment scan outgrows a single call within days of a public
 *  deploy. Walk the range in chunks under the cap (mirror of the e2e
 *  `scanContractEvents` — .mjs cannot import frontend TS). */
const SCAN_CHUNK_BLOCKS = BigInt(process.env.SCAN_CHUNK_BLOCKS ?? 9_000);
async function scanContractEvents(publicClient, params, fromBlock) {
    const latest = await publicClient.getBlockNumber();
    const out = [];
    for (let from = fromBlock; from <= latest; from += SCAN_CHUNK_BLOCKS) {
        const to = from + SCAN_CHUNK_BLOCKS - 1n < latest ? from + SCAN_CHUNK_BLOCKS - 1n : latest;
        out.push(...await publicClient.getContractEvents({ ...params, fromBlock: from, toBlock: to }));
    }
    return out;
}

async function main() {
    const envLocal = readEnvLocal();
    const clauseRegistry = process.env.NEXT_PUBLIC_CLAUSE_REGISTRY ?? envLocal.NEXT_PUBLIC_CLAUSE_REGISTRY;
    const assemblyRegistry = process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY ?? envLocal.NEXT_PUBLIC_ASSEMBLY_REGISTRY;
    if (!clauseRegistry || !assemblyRegistry) throw new Error('registry addresses missing (env or frontend/.env.local)');

    const chain = await resolveChain();
    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
    const fromBlock = BigInt(process.env.SCAN_FROM_BLOCK ?? 0);
    const dryRun = !!process.env.DRY_RUN;

    // ── ONE actor per invocation: a key, a Ledger account, or a vault. ──
    const vault = process.env.REGISTRAR_VAULT;
    if (vault && process.env.REGISTRAR_LEDGER_HD_PATH) {
        throw new Error('REGISTRAR_VAULT and REGISTRAR_LEDGER_HD_PATH are two actors — this script acts for exactly one per invocation');
    }
    if (process.env.ACTOR && !dryRun) throw new Error('ACTOR is a DRY_RUN-only manifest override — a live run signs, so it needs a key, a Ledger, or a vault');
    const walletClient = process.env.ACTOR
        ? { account: { address: process.env.ACTOR } }
        : process.env.REGISTRAR_LEDGER_HD_PATH
            ? ledgerWalletClient({ hdPath: process.env.REGISTRAR_LEDGER_HD_PATH, rpcUrl: RPC_URL })
            : vault ? null : createWalletClient({ account: registrarAccount(), chain, transport: http(RPC_URL) });
    const ownerClients = [];
    if (vault) {
        for (const key of (process.env.VAULT_OWNER_KEYS ?? '').split(',').filter(Boolean)) {
            ownerClients.push(createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(RPC_URL) }));
        }
        if (process.env.VAULT_LEDGER_HD_PATH) {
            ownerClients.push(ledgerWalletClient({ hdPath: process.env.VAULT_LEDGER_HD_PATH, rpcUrl: RPC_URL }));
        }
        if (!ownerClients.length) throw new Error('REGISTRAR_VAULT needs VAULT_OWNER_KEYS and/or VAULT_LEDGER_HD_PATH');
    }
    const actor = (vault ?? walletClient.account.address).toLowerCase();
    console.log(`Withdrawing deposits registered by ${vault ? `vault ${vault}` : walletClient.account.address}${dryRun ? ' (DRY RUN)' : ''}`);

    // ── Discover from the chain: every live deposit the actor holds. ──
    const manifest = [];

    const clauseDeposit = await publicClient.readContract({
        address: clauseRegistry, abi: CLAUSE_REGISTRY_ABI, functionName: 'registrationDeposit',
    });
    const explicitClauses = (process.env.WITHDRAW_CLAUSES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const explicitAssemblies = (process.env.WITHDRAW_ASSEMBLIES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const explicit = explicitClauses.length || explicitAssemblies.length;
    const clauseRows = explicit
        ? explicitClauses.map((s) => { const [id, v] = s.split('@'); return { clauseId: id, version: BigInt(v ?? 1) }; })
        : (await scanContractEvents(publicClient, {
            address: clauseRegistry, abi: CLAUSE_REGISTRY_ABI, eventName: 'ClauseRegistered',
        }, fromBlock))
            .filter((e) => String(e.args.registeredBy ?? '').toLowerCase() === actor)
            .map((e) => ({ clauseId: e.args.clauseId, version: BigInt(e.args.version) }));
    for (const r of clauseRows) {
        const key = computeClauseKey(r.clauseId, r.version);
        const [registeredBy, withdrawn] = await publicClient.readContract({
            address: clauseRegistry, abi: CLAUSE_REGISTRY_ABI, functionName: 'depositOf', args: [key],
        });
        // Explicit ids are still gated by state: never withdraw what the actor
        // does not hold (the contract would revert; refusing here is cheaper).
        if (registeredBy.toLowerCase() !== actor) { console.log(`  · clause ${r.clauseId} v${r.version} — not this actor's (registeredBy ${registeredBy}), skipped`); continue; }
        if (withdrawn) { console.log(`  · clause ${r.clauseId} v${r.version} — already withdrawn, skipped`); continue; }
        manifest.push({
            registry: clauseRegistry, abi: CLAUSE_REGISTRY_ABI, key, stake: clauseDeposit,
            label: `clause ${r.clauseId} v${r.version}`,
        });
    }

    const assemblyDeposit = await publicClient.readContract({
        address: assemblyRegistry, abi: ASSEMBLY_REGISTRY_ABI, functionName: 'registrationDeposit',
    });
    const assemblyKeys = explicit
        ? explicitAssemblies
        : (await scanContractEvents(publicClient, {
            address: assemblyRegistry, abi: ASSEMBLY_REGISTRY_ABI, eventName: 'AssemblyRegistered',
        }, fromBlock))
            .filter((e) => String(e.args.registeredBy ?? '').toLowerCase() === actor)
            .map((e) => e.args.compositionHash);
    for (const key of assemblyKeys) {
        const [registeredBy, , depositWithdrawn] = await publicClient.readContract({
            address: assemblyRegistry, abi: ASSEMBLY_REGISTRY_ABI, functionName: 'bindings', args: [key],
        });
        if (registeredBy.toLowerCase() !== actor) { console.log(`  · assembly ${key} — not this actor's (registeredBy ${registeredBy}), skipped`); continue; }
        if (depositWithdrawn) { console.log(`  · assembly ${key} — already withdrawn, skipped`); continue; }
        manifest.push({
            registry: assemblyRegistry, abi: ASSEMBLY_REGISTRY_ABI, key, stake: assemblyDeposit,
            label: `assembly ${key}`,
        });
    }

    // ── The manifest is the written plan: print it whole before anything moves. ──
    const total = manifest.reduce((sum, m) => sum + m.stake, 0n);
    console.log(`\n${manifest.length} live deposit(s) to withdraw — ${formatEther(total)} ETH returns to ${vault ? 'the vault' : 'the actor'}:`);
    for (const m of manifest) console.log(`  - ${m.label} (${formatEther(m.stake)} ETH)`);
    if (dryRun) { console.log('\nDRY RUN — nothing sent.'); return; }

    for (const m of manifest) {
        if (vault) {
            await vaultExecute({
                publicClient, vault, ownerClients,
                to: m.registry, value: 0n,
                data: encodeFunctionData({ abi: m.abi, functionName: 'withdrawDeposit', args: [m.key] }),
                nonce: BigInt(m.key),
            });
        } else {
            const hash = await walletClient.writeContract({
                address: m.registry, abi: m.abi, functionName: 'withdrawDeposit', args: [m.key],
            });
            await publicClient.waitForTransactionReceipt({ hash });
        }
        console.log(`  ✓ ${m.label} — withdrawn`);
    }
    console.log(`\nDone — ${manifest.length} deposit(s) reclaimed (${formatEther(total)} ETH).`);
}

main();
