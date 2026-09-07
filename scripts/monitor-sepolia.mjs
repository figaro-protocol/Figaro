#!/usr/bin/env node
// The public-deployment watcher: reads the contracts' events from a node and
// raises the conditions SECURITY.md § "Monitoring" names. Runs on a schedule in
// .github/workflows/monitor.yml, which turns each alert into a GitHub issue
// assigned to the maintainer; it can also be run by hand from the repo root.
//
//   RPC_URL          the node (default: a public Sepolia endpoint)
//   CHAIN_ID         which deployments/<chainId>.json to watch (default 11155111)
//   WINDOW_BLOCKS    how far back the event-window checks look (default 400,
//                    about eighty minutes of Sepolia blocks — wider than the
//                    hourly schedule so nothing falls between two runs)
//   ALERTS_OUT       where the alerts land as JSON (default monitor-alerts.json)
//
// Two kinds of check. Window checks read only the last WINDOW_BLOCKS blocks:
// a minter registered after genesis, a florin minted outside the reward path,
// a batch whose accrual did not apply, a burst of withdrawals. The solvency
// check reads the kernel's whole history from the deployment block: for every
// token a process was ever denominated in, the kernel must hold exactly the
// bonds of the orders still open — 2·payment + 2·cumulativeValue per order
// (VERIFICATION_MAP.md A-8). Less than that is the incident; more is a surplus
// someone sent, reported but not an alert.
//
// The script never exits non-zero on an alert — alerts are the JSON file. It
// throws on a node it cannot read, so the workflow fails and that failure is
// itself the heartbeat.

import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, http, formatUnits } from "viem";
import { sepolia } from "viem/chains";

const CHAIN_ID = Number(process.env.CHAIN_ID ?? "11155111");
const RPC_URL = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const WINDOW = BigInt(process.env.WINDOW_BLOCKS ?? "400");
const ALERTS_OUT = process.env.ALERTS_OUT ?? "monitor-alerts.json";
const CHUNK = 9_500n; // the SDK's DEFAULT_LOG_CHUNK_SIZE — under every public node's range cap
const BURST = 3;

const record = JSON.parse(readFileSync(`deployments/${CHAIN_ID}.json`, "utf8"));
const abiOf = (name) => {
    const parsed = JSON.parse(readFileSync(`abi/${name}.json`, "utf8"));
    return parsed.abi ?? parsed;
};
const erc20Abi = [
    { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
    { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
    { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
];

const chain = CHAIN_ID === sepolia.id ? sepolia : { ...sepolia, id: CHAIN_ID };
const client = createPublicClient({ chain, transport: http(RPC_URL) });

async function eventsChunked({ address, abi, eventName, fromBlock, toBlock }) {
    const out = [];
    for (let from = fromBlock; from <= toBlock; from += CHUNK) {
        const to = from + CHUNK - 1n < toBlock ? from + CHUNK - 1n : toBlock;
        out.push(...(await client.getContractEvents({ address, abi, eventName, fromBlock: from, toBlock: to })));
    }
    return out;
}

const alerts = [];
const notes = [];
const alert = (severity, key, title, body) => alerts.push({ severity, key, title, body });

const head = await client.getBlockNumber();
const chainId = await client.getChainId();
if (chainId !== CHAIN_ID) throw new Error(`node is chain ${chainId}, record is chain ${CHAIN_ID}`);
const deployBlock = BigInt(record.deploymentBlock);
const windowFrom = head - WINDOW > deployBlock ? head - WINDOW : deployBlock;
notes.push(`chain ${CHAIN_ID}, head ${head}, window ${windowFrom}-${head}, history from ${deployBlock}`);

// ── Window checks ─────────────────────────────────────────────────────

const florinAbi = abiOf("FlorinToken");
const minters = await eventsChunked({ address: record.florinToken, abi: florinAbi, eventName: "MinterRegistered", fromBlock: windowFrom, toBlock: head });
for (const m of minters) {
    alert("critical", `minter-${m.transactionHash}`,
        `Monitor: a florin minter was registered after genesis (block ${m.blockNumber})`,
        `\`MinterRegistered\` for ${m.args.minter} with cap ${m.args.cap} in tx ${m.transactionHash}. After \`renounceDeployerMint\` this cannot happen; either the renounce never ran on this deployment or the token is not the one in the record.`);
}

const mints = (await eventsChunked({ address: record.florinToken, abi: florinAbi, eventName: "Transfer", fromBlock: windowFrom, toBlock: head }))
    .filter((t) => t.args.from === "0x0000000000000000000000000000000000000000");
if (mints.length > 0) {
    const claims = await eventsChunked({ address: record.rpgfMinter, abi: abiOf("RpgfMinter"), eventName: "Claimed", fromBlock: windowFrom, toBlock: head });
    const claimTxs = new Set(claims.map((c) => c.transactionHash));
    for (const t of mints) {
        if (!claimTxs.has(t.transactionHash)) {
            alert("critical", `mint-${t.transactionHash}`,
                `Monitor: florins minted outside the reward path (block ${t.blockNumber})`,
                `${formatUnits(t.args.value, 18)} florins minted to ${t.args.to} in tx ${t.transactionHash} with no \`RpgfMinter.Claimed\` in the same transaction. The only minter after genesis is the reward minter, and it mints only inside \`claim\`.`);
        }
    }
    notes.push(`${mints.length} mint(s) in window, ${claimTxs.size} claim tx(s)`);
}

const verifierAbi = abiOf("FigaroBatchVerifier");
const skipped = await eventsChunked({ address: record.batchVerifier, abi: verifierAbi, eventName: "BatchAccrualSkipped", fromBlock: windowFrom, toBlock: head });
for (const s of skipped) {
    alert("high", `accrual-skipped-${s.transactionHash}`,
        `Monitor: a batch settled and its reward accrual did not apply (batch ${s.args.batchId})`,
        `\`BatchAccrualSkipped\` in tx ${s.transactionHash}, reason bytes \`${s.args.reason}\`. The trade settled; the designer-reward accrual for this batch did not. Read the reason against \`UsageCounter\`'s errors: a seller who unstaked between prove and submit, a period boundary crossed in flight, or a provenance mismatch.`);
}
const settled = await eventsChunked({ address: record.batchVerifier, abi: verifierAbi, eventName: "BatchSettled", fromBlock: windowFrom, toBlock: head });
notes.push(`${settled.length} batch(es) settled in window, ${skipped.length} accrual(s) skipped`);

const withdrawals = [
    ...(await eventsChunked({ address: record.membersRegistry, abi: abiOf("MembersRegistry"), eventName: "MemberWithdrawalRequested", fromBlock: windowFrom, toBlock: head })),
    ...(await eventsChunked({ address: record.clauseRegistry, abi: abiOf("ClauseRegistry"), eventName: "DepositWithdrawn", fromBlock: windowFrom, toBlock: head })),
    ...(await eventsChunked({ address: record.assemblyRegistry, abi: abiOf("AssemblyRegistry"), eventName: "DepositWithdrawn", fromBlock: windowFrom, toBlock: head })),
];
if (withdrawals.length >= BURST) {
    alert("notice", `withdrawal-burst-${windowFrom}`,
        `Monitor: ${withdrawals.length} stake withdrawals in ${WINDOW} blocks`,
        `Members and registrants leaving together is what a scare looks like from the chain. Transactions: ${[...new Set(withdrawals.map((w) => w.transactionHash))].join(", ")}.`);
}
notes.push(`${withdrawals.length} withdrawal(s) in window`);

// ── Solvency: the kernel holds exactly the open bonds ─────────────────

const coreAbi = abiOf("FigaroCore");
const committed = await eventsChunked({ address: record.figaroCore, abi: coreAbi, eventName: "OrderCommitted", fromBlock: deployBlock, toBlock: head });
const resolved = await eventsChunked({ address: record.figaroCore, abi: coreAbi, eventName: "OrderResolved", fromBlock: deployBlock, toBlock: head });
const resolvedHashes = new Set(resolved.map((r) => r.args.orderHash));
const held = new Map(); // currency → bonds still locked
for (const o of committed) {
    if (resolvedHashes.has(o.args.orderHash)) continue;
    const bonds = 2n * o.args.payment + 2n * o.args.cumulativeValue;
    held.set(o.args.currency, (held.get(o.args.currency) ?? 0n) + bonds);
}
const currencies = new Set(committed.map((o) => o.args.currency));
for (const currency of currencies) {
    const expected = held.get(currency) ?? 0n;
    const [balance, decimals, symbol] = await Promise.all([
        client.readContract({ address: currency, abi: erc20Abi, functionName: "balanceOf", args: [record.figaroCore] }),
        client.readContract({ address: currency, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
        client.readContract({ address: currency, abi: erc20Abi, functionName: "symbol" }).catch(() => currency),
    ]);
    const line = `${symbol}: holds ${formatUnits(balance, decimals)}, open bonds ${formatUnits(expected, decimals)}`;
    if (balance < expected) {
        alert("critical", `insolvent-${currency}`,
            `Monitor: the kernel holds less than its open bonds in ${symbol}`,
            `${line}. Invariant A-8 is broken: some resolution will fail or some bond has left the kernel other than at resolution. Treat as the worst case in SECURITY.md § "Incident response".`);
    } else if (balance > expected) {
        notes.push(`${line} (surplus ${formatUnits(balance - expected, decimals)} — sent to the kernel outside a commit; not an incident)`);
    } else {
        notes.push(`${line} (exact)`);
    }
}
notes.push(`${committed.length} order(s) committed, ${resolved.length} resolved, ${committed.length - resolvedHashes.size} open, ${currencies.size} currenc${currencies.size === 1 ? "y" : "ies"}`);

// ── Report ────────────────────────────────────────────────────────────

writeFileSync(ALERTS_OUT, JSON.stringify(alerts, null, 2));
console.log(notes.map((n) => `  ${n}`).join("\n"));
console.log(alerts.length === 0 ? "no alert" : `${alerts.length} alert(s):`);
for (const a of alerts) console.log(`  [${a.severity}] ${a.title}`);
