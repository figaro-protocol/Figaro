/**
 * withdraw-deposits.mjs — bulk-reclaim registration deposits from the clause,
 * agreement and process registries, the withdraw half of populate-clauses.mjs (which
 * is the bulk-deposit half). Built for the Sepolia redeploy day: every id the
 * acting wallet registered on the OLD stack is withdrawn, the stakes return,
 * and the new stack is seeded fresh. Withdrawing de-surfaces; the bindings
 * stay permanent — this script moves only the stakes.
 *
 * TWO REGISTRY SHAPES are on the chain, and the script reads which one each
 * registry is (a `withdrawalCooldown()` read that answers, or not):
 *   - a registry deployed with the withdrawal cooldown takes the stake back
 *     in two calls, `requestWithdrawal(key)` then `withdraw(key)` once
 *     `withdrawable(key)` is true. A run requests every live stake and claims
 *     every one whose cooldown has passed; a stake still cooling is listed
 *     with its `releaseAt`, and a later run claims it.
 *   - a registry deployed before it takes the stake back in one call,
 *     `withdrawDeposit(key)` (`ONE_CALL_WITHDRAW_ABI` below — that deployed
 *     interface, not the SDK's).
 *
 * ONE actor per invocation — the same three modes as the populate scripts:
 *
 *   REGISTRAR_PRIVATE_KEY     — EOA signs each call directly
 *   REGISTRAR_LEDGER_HD_PATH  — Ledger signs each on the device (one tap per call)
 *   REGISTRAR_VAULT           — the vault is the registeredBy of record; each
 *     call routes through the multisig (VAULT_OWNER_KEYS approvals,
 *     + VAULT_LEDGER_HD_PATH for a device owner) and the ETH returns TO THE
 *     VAULT, which forwards per the day's plan — this script never moves it.
 *
 * Discovery is from the chain, never a list: ClauseRegistered /
 * AgreementRegistered / ProcessRegistered events are scanned (SCAN_FROM_BLOCK trims public-network
 * scans), narrowed to rows whose registeredBy is the actor, and each live
 * deposit is withdrawn. Paid-out ids are skipped and a cooling one waits, so a
 * re-run converges — same idempotence discipline as the populate scripts. The old
 * stack's events carry the pre-rename arg names on-chain, but names are
 * labels, not topics: the current ABI decodes them as `registeredBy`.
 *
 * DRY_RUN=1 prints the manifest (each id, its registry, its stake) and sends
 * nothing — the written-plan-reviewed-before-broadcast gate.
 *
 * Env:
 *   RPC_URL                       — required
 *   NEXT_PUBLIC_CLAUSE_REGISTRY   — falls back to frontend/.env.local
 *   NEXT_PUBLIC_PROCESS_REGISTRY — falls back to frontend/.env.local
 *   NEXT_PUBLIC_AGREEMENT_REGISTRY — falls back to frontend/.env.local; a
 *                                   stack without one has no agreements to
 *                                   withdraw
 *   SCAN_FROM_BLOCK               — first block to scan (default 0)
 *   WITHDRAW_CLAUSES              — csv of clause keys (bytes32 hex):
 *                                   build the manifest from these EXPLICIT keys
 *                                   instead of the event scan (public gateways'
 *                                   log indexes are load-balanced and flaky —
 *                                   state reads are not). WITHDRAW_ASSEMBLIES
 *                                   is its sibling (csv of processDesignHashes),
 *                                   and WITHDRAW_AGREEMENTS (csv of agreement
 *                                   hashes); any one alone skips the other
 *                                   families' scans.
 *   DRY_RUN                       — print the manifest, send nothing
 *   ACTOR                         — DRY_RUN only: manifest for this address
 *                                   without constructing a signer (no device)
 */

import { createPublicClient, createWalletClient, encodeFunctionData, formatEther, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CLAUSE_REGISTRY_ABI, PROCESS_REGISTRY_ABI, AGREEMENT_REGISTRY_ABI, isBytes32Hex } from '@figaro-protocol/sdk';
import {
    VAULT_ABI, ledgerWalletClient, readEnvLocal, registrarAccount, resolveChain, vaultExecute,
} from './populate-clauses.mjs';

/** The one-call withdrawal of a key registry deployed before the withdrawal
 *  cooldown: the interface that deployed bytecode answers, kept here so this
 *  script can reclaim from such a stack on its redeploy day. */
const ONE_CALL_WITHDRAW_ABI = parseAbi(['function withdrawDeposit(bytes32 key) external']);

/** Whether a key registry takes its stakes back in two calls: it answers
 *  `withdrawalCooldown()`. A registry deployed before the cooldown has no such
 *  function, and the read reverts. */
async function twoStepRegistry(publicClient, address, abi) {
    try {
        await publicClient.readContract({ address, abi, functionName: 'withdrawalCooldown' });
        return true;
    } catch {
        return false;
    }
}

/** The step a key's stake is at, for the registry's shape: `request` (live),
 *  `claim` (requested and claimable now), `cooling` (requested, not yet
 *  claimable: carries `releaseAt`), `withdraw` (live, one-call registry) or
 *  `done` (paid out). */
async function stakeStep(publicClient, { registry, abi, key, withdrawn, twoStep }) {
    if (!twoStep) return withdrawn ? { step: 'done' } : { step: 'withdraw' };
    if (!withdrawn) return { step: 'request' };
    const releaseAt = await publicClient.readContract({ address: registry, abi, functionName: 'releaseAt', args: [key] });
    if (releaseAt === 0n) return { step: 'done' };
    const due = await publicClient.readContract({ address: registry, abi, functionName: 'withdrawable', args: [key] });
    return due ? { step: 'claim' } : { step: 'cooling', releaseAt };
}

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
    const processRegistry = process.env.NEXT_PUBLIC_PROCESS_REGISTRY ?? envLocal.NEXT_PUBLIC_PROCESS_REGISTRY;
    if (!clauseRegistry || !processRegistry) throw new Error('registry addresses missing (env or frontend/.env.local)');
    const agreementRegistry = process.env.NEXT_PUBLIC_AGREEMENT_REGISTRY ?? envLocal.NEXT_PUBLIC_AGREEMENT_REGISTRY;

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
            : vault ? null : createWalletClient({ account: registrarAccount(chain.id), chain, transport: http(RPC_URL) });
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

    // ── Discover from the chain: every stake the actor holds, at its step. ──
    const manifest = [];
    async function plan(entry) {
        const { step, releaseAt } = await stakeStep(publicClient, entry);
        if (step === 'done') { console.log(`  · ${entry.label} — already paid out, skipped`); return; }
        if (step === 'cooling') {
            console.log(`  · ${entry.label} — requested; claimable from ${new Date(Number(releaseAt) * 1000).toISOString()}, run again then`);
            return;
        }
        manifest.push({ ...entry, step });
    }

    const clauseDeposit = await publicClient.readContract({
        address: clauseRegistry, abi: CLAUSE_REGISTRY_ABI, functionName: 'registrationDeposit',
    });
    const explicitClauses = (process.env.WITHDRAW_CLAUSES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const explicitAssemblies = (process.env.WITHDRAW_ASSEMBLIES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const explicitAgreements = (process.env.WITHDRAW_AGREEMENTS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const explicit = explicitClauses.length || explicitAssemblies.length || explicitAgreements.length;
    const clauseRows = explicit
        ? explicitClauses.map((s) => {
            if (!isBytes32Hex(s)) throw new Error(`WITHDRAW_CLAUSES: "${s}" is not a clause key (bytes32 hex)`);
            return { key: s.toLowerCase() };
        })
        : (await scanContractEvents(publicClient, {
            address: clauseRegistry, abi: CLAUSE_REGISTRY_ABI, eventName: 'ClauseRegistered',
        }, fromBlock))
            .filter((e) => String(e.args.registeredBy ?? '').toLowerCase() === actor)
            .map((e) => ({ key: e.args.clauseKey }));
    const clauseTwoStep = await twoStepRegistry(publicClient, clauseRegistry, CLAUSE_REGISTRY_ABI);
    for (const r of clauseRows) {
        const key = r.key;
        const [registeredBy, withdrawn] = await publicClient.readContract({
            address: clauseRegistry, abi: CLAUSE_REGISTRY_ABI, functionName: 'depositOf', args: [key],
        });
        // Explicit ids are still gated by state: never withdraw what the actor
        // does not hold (the contract would revert; refusing here is cheaper).
        if (registeredBy.toLowerCase() !== actor) { console.log(`  · clause ${key} — not this actor's (registeredBy ${registeredBy}), skipped`); continue; }
        await plan({ registry: clauseRegistry, abi: CLAUSE_REGISTRY_ABI, key, withdrawn, twoStep: clauseTwoStep, stake: clauseDeposit, label: `clause ${key}` });
    }

    const assemblyDeposit = await publicClient.readContract({
        address: processRegistry, abi: PROCESS_REGISTRY_ABI, functionName: 'registrationDeposit',
    });
    const assemblyKeys = explicit
        ? explicitAssemblies
        : (await scanContractEvents(publicClient, {
            address: processRegistry, abi: PROCESS_REGISTRY_ABI, eventName: 'ProcessRegistered',
        }, fromBlock))
            .filter((e) => String(e.args.registeredBy ?? '').toLowerCase() === actor)
            .map((e) => e.args.processDesignHash);
    const assemblyTwoStep = await twoStepRegistry(publicClient, processRegistry, PROCESS_REGISTRY_ABI);
    for (const key of assemblyKeys) {
        const [registeredBy, , depositWithdrawn] = await publicClient.readContract({
            address: processRegistry, abi: PROCESS_REGISTRY_ABI, functionName: 'bindings', args: [key],
        });
        if (registeredBy.toLowerCase() !== actor) { console.log(`  · assembly ${key} — not this actor's (registeredBy ${registeredBy}), skipped`); continue; }
        await plan({ registry: processRegistry, abi: PROCESS_REGISTRY_ABI, key, withdrawn: depositWithdrawn, twoStep: assemblyTwoStep, stake: assemblyDeposit, label: `assembly ${key}` });
    }

    if (agreementRegistry) {
        const agreementDeposit = await publicClient.readContract({
            address: agreementRegistry, abi: AGREEMENT_REGISTRY_ABI, functionName: 'registrationDeposit',
        });
        const agreementHashes = explicit
            ? explicitAgreements.map((s) => {
                if (!isBytes32Hex(s)) throw new Error(`WITHDRAW_AGREEMENTS: "${s}" is not an agreement hash (bytes32 hex)`);
                return s.toLowerCase();
            })
            : (await scanContractEvents(publicClient, {
                address: agreementRegistry, abi: AGREEMENT_REGISTRY_ABI, eventName: 'AgreementRegistered',
            }, fromBlock))
                .filter((e) => String(e.args.registeredBy ?? '').toLowerCase() === actor)
                .map((e) => e.args.agreementHash);
        const agreementTwoStep = await twoStepRegistry(publicClient, agreementRegistry, AGREEMENT_REGISTRY_ABI);
        for (const key of agreementHashes) {
            const [registeredBy, , depositWithdrawn] = await publicClient.readContract({
                address: agreementRegistry, abi: AGREEMENT_REGISTRY_ABI, functionName: 'bindings', args: [key],
            });
            if (registeredBy.toLowerCase() !== actor) { console.log(`  · agreement ${key} — not this actor's (registeredBy ${registeredBy}), skipped`); continue; }
            await plan({ registry: agreementRegistry, abi: AGREEMENT_REGISTRY_ABI, key, withdrawn: depositWithdrawn, twoStep: agreementTwoStep, stake: agreementDeposit, label: `agreement ${key}` });
        }
    }

    // ── The manifest is the written plan: print it whole before anything moves. ──
    // ETH moves on a claim and on a one-call withdrawal; a request moves none.
    const paying = manifest.filter((m) => m.step !== 'request');
    const total = paying.reduce((sum, m) => sum + m.stake, 0n);
    const STEP_CALL = { request: 'requestWithdrawal', claim: 'withdraw', withdraw: 'withdrawDeposit' };
    console.log(`\n${manifest.length} call(s) — ${formatEther(total)} ETH returns to ${vault ? 'the vault' : 'the actor'} now:`);
    for (const m of manifest) console.log(`  - ${m.label}: ${STEP_CALL[m.step]} (${formatEther(m.stake)} ETH)`);
    if (dryRun) { console.log('\nDRY RUN — nothing sent.'); return; }

    for (const m of manifest) {
        const functionName = STEP_CALL[m.step];
        const abi = m.step === 'withdraw' ? ONE_CALL_WITHDRAW_ABI : m.abi;
        if (vault) {
            await vaultExecute({
                publicClient, vault, ownerClients,
                to: m.registry, value: 0n,
                data: encodeFunctionData({ abi, functionName, args: [m.key] }),
                // The vault hashes the nonce with the call data, so a request
                // and its later claim on one key are two distinct operations.
                nonce: BigInt(m.key),
            });
        } else {
            const hash = await walletClient.writeContract({ address: m.registry, abi, functionName, args: [m.key] });
            await publicClient.waitForTransactionReceipt({ hash });
        }
        console.log(`  ✓ ${m.label} — ${functionName}`);
    }
    const requested = manifest.length - paying.length;
    console.log(`\nDone — ${paying.length} stake(s) reclaimed (${formatEther(total)} ETH)${requested ? `; ${requested} requested, claimable after the cooldown (run again then)` : ''}.`);
}

main();
