#!/usr/bin/env node
// Read a deployment's receipts and propose the direct path's gas constants
// from them, beside the values the tree holds.
//
//   node scripts/propose-gas-constants.mjs <record.json> [--from-block N] [--to-block M]
//
// The constants are read off live receipts (sdk/src/gasCeilings.ts says how
// each was measured): `resolveProcess` over N orders costs
// RESOLVE_FIXED_OVERHEAD + RESOLVE_GAS_PER_ORDER·N, read at N=1 and N=2, and
// COMMIT_GAS_PER_ORDER is a sub-order `commit()` (a process's first commit
// creates its state and costs more; that premium is reported, not used). This
// script finds those receipts on the chain the record names — every
// transaction sent to the record's FigaroCore that emitted one ProcessResolved
// or one OrderCommitted since the record's deployment block — and proposes each
// constant as the dearest receipt of its kind, rounded up to the next 1,000 gas.
// The settlements of the batch path (FigaroBatchVerifier's BatchSettled) are
// listed with what each published, to set against the relay's own plan
// (prover/sequencer/src/gas.rs, `settle_gas_estimate`); no SETTLE_* constant
// is proposed from them, because the plan, not the receipt, says how many
// positions and uses each batch carried.
//
// It changes no file. A constant that moves is edited in all its copies in one
// change — sdk/src/gasCeilings.ts, test/core/kernel/GasCeilingTest.t.sol (the
// direct path), prover/sequencer/src/gas.rs and
// test/core/verifier/BatchGasCeilingTest.t.sol (the batch path) — and the
// chain-gas guard holds them equal.
//
//   RPC_URL     the chain (default: the record's rpcUrl); never printed
//   LOG_CHUNK   blocks per log query (default 10000; public RPCs cap the range)
//
// scripts/test-propose-gas-constants.mjs holds the arithmetic.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, parseAbiItem, toEventSelector } from "viem";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PROCESS_RESOLVED = parseAbiItem("event ProcessResolved(bytes32 indexed processId, address indexed buyer, uint256 orderCount)");
const ORDER_COMMITTED = parseAbiItem("event OrderCommitted(bytes32 indexed orderHash, bytes32 indexed processId, address indexed buyer, address seller, address currency, uint256 payment, uint256 runningTotal, bytes32 checkoutHash, uint256 salt, uint256 deadline)");
const BATCH_SETTLED = parseAbiItem("event BatchSettled(uint64 indexed batchId, bytes32 indexed prevStateRoot, bytes32 indexed newStateRoot, uint256 positionCount)");
/** What a settlement published, counted by event in its receipt. */
const PUBLISHED = {
    OrderCommitted: toEventSelector(ORDER_COMMITTED),
    OrderResolved: toEventSelector("OrderResolved(bytes32,bytes32,uint256,uint256)"),
    ProcessResolved: toEventSelector(PROCESS_RESOLVED),
    Attestation: toEventSelector("Attestation(bytes32,bytes32,address,bytes32,uint8,bytes32)"),
    UsageRecorded: toEventSelector("UsageRecorded(uint8,bytes32,uint8,bytes32,address,uint64,uint64,uint256)"),
};

const ceil1000 = (g) => ((BigInt(g) + 999n) / 1000n) * 1000n;
const max = (xs) => xs.reduce((a, b) => (b > a ? b : a));

/** The values the tree holds: `const NAME = 30_000n;` in sdk/src/gasCeilings.ts. */
export function currentConstants(file = path.join(root, "sdk/src/gasCeilings.ts")) {
    const src = fs.readFileSync(file, "utf8");
    const out = {};
    for (const name of ["RESOLVE_GAS_PER_ORDER", "RESOLVE_FIXED_OVERHEAD", "COMMIT_GAS_PER_ORDER"]) {
        const m = src.match(new RegExp(`${name}\\s*=\\s*([0-9_]+)n`));
        out[name] = m ? BigInt(m[1].replace(/_/g, "")) : null;
    }
    return out;
}

/**
 * The proposal from the receipts.
 * `resolves`: [{ orderCount, gasUsed }], `commits`: [{ root, gasUsed }] (bigints).
 * Returns `{ proposed: { NAME: bigint }, missing: [why], evidence: {...} }`.
 */
export function propose({ resolves, commits }) {
    const missing = [];
    const proposed = {};
    const at = (n) => resolves.filter((r) => r.orderCount === n).map((r) => r.gasUsed);
    const one = at(1n);
    const two = at(2n);
    const evidence = { resolveAt1: one, resolveAt2: two };
    if (one.length && two.length) {
        const g1 = max(one);
        const g2 = max(two);
        if (g2 <= g1) missing.push(`the dearest two-order resolve (${g2}) is not dearer than the dearest one-order resolve (${g1}); no slope can be read`);
        else {
            const perOrder = ceil1000(g2 - g1);
            proposed.RESOLVE_GAS_PER_ORDER = perOrder;
            proposed.RESOLVE_FIXED_OVERHEAD = ceil1000(g1 - (g2 - g1));
            evidence.resolveLine = { g1, g2 };
        }
    } else {
        missing.push(`resolveProcess receipts at N=1 (${one.length} found) and N=2 (${two.length} found) are both needed`);
    }
    const sub = commits.filter((c) => !c.root).map((c) => c.gasUsed);
    const roots = commits.filter((c) => c.root).map((c) => c.gasUsed);
    evidence.subOrderCommits = sub;
    evidence.rootCommits = roots;
    if (sub.length) proposed.COMMIT_GAS_PER_ORDER = ceil1000(max(sub));
    else missing.push("no sub-order commit() receipt found (a process with two orders or more)");
    if (roots.length && sub.length) evidence.rootPremium = max(roots) - max(sub);
    return { proposed, missing, evidence };
}

async function logsInChunks(client, { address, event, fromBlock, toBlock, chunk }) {
    const out = [];
    for (let from = fromBlock; from <= toBlock; from += chunk) {
        const to = from + chunk - 1n > toBlock ? toBlock : from + chunk - 1n;
        out.push(...await client.getLogs({ address, event, fromBlock: from, toBlock: to }));
    }
    return out;
}

async function main() {
    const args = process.argv.slice(2);
    const opt = (name) => { const i = args.indexOf(`--${name}`); return i < 0 ? undefined : args.splice(i, 2)[1]; };
    const fromArg = opt("from-block");
    const toArg = opt("to-block");
    const [recordPath] = args;
    if (!recordPath) { console.error("usage: propose-gas-constants.mjs <record.json> [--from-block N] [--to-block M]"); process.exit(2); }
    const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
    const rpc = process.env.RPC_URL || record.rpcUrl;
    if (!rpc) { console.error("RPC_URL is not set and the record names no rpcUrl"); process.exit(2); }
    const client = createPublicClient({ transport: http(rpc, { retryCount: 5, retryDelay: 1500 }) });
    const chainId = await client.getChainId();
    if (chainId !== record.chainId) { console.error(`the RPC is chain ${chainId}, the record chain ${record.chainId}`); process.exit(1); }
    const fromBlock = BigInt(fromArg ?? record.deploymentBlock ?? 0);
    const toBlock = toArg ? BigInt(toArg) : await client.getBlockNumber();
    const chunk = BigInt(process.env.LOG_CHUNK ?? 10000);
    const core = record.figaroCore;
    console.log(`Receipts of chain ${chainId}, blocks ${fromBlock}..${toBlock}, FigaroCore ${core}\n`);

    const [resolvedLogs, committedLogs, settledLogs] = await Promise.all([
        logsInChunks(client, { address: core, event: PROCESS_RESOLVED, fromBlock, toBlock, chunk }),
        logsInChunks(client, { address: core, event: ORDER_COMMITTED, fromBlock, toBlock, chunk }),
        record.batchVerifier ? logsInChunks(client, { address: record.batchVerifier, event: BATCH_SETTLED, fromBlock, toBlock, chunk }) : [],
    ]);
    const receiptOf = new Map();
    const receipt = async (hash) => {
        if (!receiptOf.has(hash)) receiptOf.set(hash, await client.getTransactionReceipt({ hash }));
        return receiptOf.get(hash);
    };
    const direct = (r) => String(r.to).toLowerCase() === core.toLowerCase();
    const countIn = (r, address, topic0) => r.logs.filter((l) => l.address.toLowerCase() === address.toLowerCase() && l.topics[0] === topic0).length;

    const resolves = [];
    for (const log of resolvedLogs) {
        const r = await receipt(log.transactionHash);
        if (!direct(r) || countIn(r, core, log.topics[0]) !== 1) continue;
        resolves.push({ orderCount: log.args.orderCount, gasUsed: r.gasUsed, tx: log.transactionHash, block: r.blockNumber });
    }
    // A process's first commit in the scanned window is its root.
    const seen = new Set();
    const commits = [];
    for (const log of [...committedLogs].sort((a, b) => Number(a.blockNumber - b.blockNumber) || a.logIndex - b.logIndex)) {
        const isRoot = !seen.has(log.args.processId);
        seen.add(log.args.processId);
        const r = await receipt(log.transactionHash);
        if (!direct(r) || countIn(r, core, log.topics[0]) !== 1) continue;
        commits.push({ root: isRoot, gasUsed: r.gasUsed, tx: log.transactionHash, block: r.blockNumber });
    }

    console.log("resolveProcess (direct, one process per transaction):");
    for (const r of resolves) console.log(`  N=${r.orderCount}  gasUsed ${r.gasUsed}  block ${r.block}  ${r.tx}`);
    if (!resolves.length) console.log("  (none)");
    console.log("commit() (direct, one order per transaction):");
    for (const c of commits) console.log(`  ${c.root ? "root     " : "sub-order"}  gasUsed ${c.gasUsed}  block ${c.block}  ${c.tx}`);
    if (!commits.length) console.log("  (none)");

    const { proposed, missing, evidence } = propose({ resolves, commits });
    const now = currentConstants();
    console.log("\nProposal (the dearest receipt of each kind, rounded up to 1,000 gas):");
    for (const name of Object.keys(now)) {
        const p = proposed[name];
        if (p === undefined) console.log(`  ${name}: not proposed (the receipts are missing)`);
        else console.log(`  ${name}: ${p}  (the tree holds ${now[name]}${p === now[name] ? ", unchanged" : `, ${p > now[name] ? "up" : "down"} ${p > now[name] ? p - now[name] : now[name] - p}`})`);
    }
    if (evidence.rootPremium !== undefined) console.log(`  a root commit costs ${evidence.rootPremium} more than the dearest sub-order commit (not a constant: amortized over a process)`);
    for (const m of missing) console.log(`  · ${m}`);

    console.log(`\nBatch settlements on ${record.batchVerifier ?? "(no verifier in the record)"} — set each against the relay's plan (gas::settle_gas_estimate):`);
    if (!settledLogs.length) console.log("  (none)");
    for (const s of settledLogs) {
        const r = await receipt(s.transactionHash);
        const counts = Object.entries(PUBLISHED).map(([name, topic]) => `${name} ${r.logs.filter((l) => l.topics[0] === topic).length}`).join(", ");
        console.log(`  batch ${s.args.batchId}  gasUsed ${r.gasUsed}  positions ${s.args.positionCount}  ${counts}  block ${r.blockNumber}  ${s.transactionHash}`);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((e) => { console.error(`propose-gas-constants: ${e instanceof Error ? e.message.split("\n")[0] : e}`); process.exit(1); });
}
