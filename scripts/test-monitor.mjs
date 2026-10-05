#!/usr/bin/env node
// The watcher under test: every condition it can raise, produced on a devnet
// with real contracts, and the alert asserted from its own output.
//
//   node scripts/test-monitor.mjs        (a devnet up: scripts/devup.sh)
//
// Each case writes a record the watcher reads (RECORD) and checks the alerts
// it writes (ALERTS_OUT):
//
//   clean          the devnet as deployed                  → no alert
//   minter, mint   a florin token whose deployer never renounced registers
//                  a minter and mints outside RpgfMinter.claim
//                                                          → minter-…, mint-…
//   withdrawals    three clause deposits withdrawn in the window
//                                                          → withdrawal-burst-…
//   insolvency     an order committed in a rebasing token, then rebased down:
//                  FigaroCore holds less than its open bonds (the rebasing
//                  risk DESIGN_DECISIONS #10 accepts and nothing on chain
//                  detects)                                → insolvent-…
//   no code        a record address that holds no code     → the watcher fails
//
// `BatchAccrualSkipped` is the one alert not produced here: it needs a batch
// whose accrual the counter refuses between prove and submit.
//
// It changes the devnet (new clauses withdrawn, an order committed, two
// tokens deployed); run it last, or on a devnet you will redeploy.
//
//   RPC_URL   the devnet (default http://127.0.0.1:8545)

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    createPublicClient, createWalletClient, http, keccak256, parseAbi, parseEther, toHex,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
// The SDK by its build output: the workspace is not linked at the repo root.
import { buildCommitment, buildDomain, computeClauseKey, computeDeadline, readChainTimestamp } from "../sdk/dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const work = fs.mkdtempSync(path.join(os.tmpdir(), "figaro-monitor-test-"));
const transport = http(RPC_URL);
const pub = createPublicClient({ chain: foundry, transport });
// anvil's own accounts, by index (its default mnemonic). 0 is the devnet's
// minter; 3, 4 and 33 are outside the e2e suite's allocation, and nothing
// here registers a member profile, so no seeded seller is touched.
const MNEMONIC = "test test test test test test test test test test test junk";
const KEYS = { deployer: 0, buyer: 3, seller: 4, registrant: 33 };
const account = (index) => mnemonicToAccount(MNEMONIC, { addressIndex: index });
const wallet = (index) => createWalletClient({ account: account(index), chain: foundry, transport });

const base = JSON.parse(fs.readFileSync(path.join(root, ".deployments", "local.json"), "utf8"));
const failures = [];
const check = (label, ok, detail = "") => {
    console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — ${detail}`}`);
    if (!ok) failures.push(label);
};

/** The block the test starts at. The watcher reads from it, as a public
 *  watcher reads from a recent window: the devnet's own genesis — its
 *  minters, its mints — happened before, and is not what is under test. */
let fromBlock = 0n;

/** Run the watcher on `record`; its alerts, or the error it failed with. */
function watch(name, record) {
    const recordPath = path.join(work, `${name}.json`);
    const alertsPath = path.join(work, `${name}.alerts.json`);
    fs.writeFileSync(recordPath, JSON.stringify({ ...record, deploymentBlock: Number(fromBlock) }));
    try {
        execFileSync("node", [path.join(root, "scripts", "monitor-sepolia.mjs")], {
            cwd: root,
            env: { ...process.env, RPC_URL, CHAIN_ID: "31337", RECORD: recordPath, ALERTS_OUT: alertsPath, PACE_MS: "0", WINDOW_BLOCKS: "100000" },
            stdio: ["ignore", "pipe", "pipe"],
        });
    } catch (e) {
        return { failed: String(e.stderr ?? e.message) };
    }
    return { alerts: JSON.parse(fs.readFileSync(alertsPath, "utf8")) };
}
const keysOf = (r) => (r.alerts ?? []).map((a) => a.key);

async function deploy(key, artifactName, args = []) {
    const artifact = JSON.parse(fs.readFileSync(path.join(root, "out", `${artifactName}.sol`, `${artifactName}.json`), "utf8"));
    const w = wallet(key);
    const hash = await w.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    return { address: receipt.contractAddress, abi: artifact.abi };
}
async function send(key, address, abi, functionName, args = [], value) {
    const hash = await wallet(key).writeContract({ address, abi, functionName, args, value });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
}

async function main() {
    fromBlock = await pub.getBlockNumber();
    console.log(`The devnet as deployed (watched from block ${fromBlock})`);
    const clean = watch("clean", base);
    check("no alert on a clean devnet", clean.alerts?.length === 0, clean.failed ?? JSON.stringify(keysOf(clean)));

    console.log("\nA florin minter after genesis, and a mint outside the reward path");
    const florin = await deploy(KEYS.deployer, "FlorinToken");
    const deployer = account(KEYS.deployer).address;
    await send(KEYS.deployer, florin.address, florin.abi, "registerMinter", [deployer, parseEther("1")]);
    await send(KEYS.deployer, florin.address, florin.abi, "mint", [account(KEYS.buyer).address, 1n]);
    const minted = watch("minter", { ...base, florinToken: florin.address });
    check("minter-… raised", keysOf(minted).some((k) => k.startsWith("minter-")), minted.failed ?? JSON.stringify(keysOf(minted)));
    check("mint-… raised", keysOf(minted).some((k) => k.startsWith("mint-")), minted.failed ?? JSON.stringify(keysOf(minted)));

    console.log("\nThree deposits withdrawn in the window");
    const clauses = parseAbi([
        "function registerClause(string clauseId, uint64 version, bytes32 contentHash, string contentURI) payable",
        "function withdrawDeposit(bytes32 idHash)",
        "function registrationDeposit() view returns (uint256)",
    ]);
    const deposit = await pub.readContract({ address: base.clauseRegistry, abi: clauses, functionName: "registrationDeposit" });
    const stamp = Date.now();
    for (let i = 0; i < 3; i++) {
        const id = `monitor-test-${stamp}-${i}`;
        await send(KEYS.registrant, base.clauseRegistry, clauses, "registerClause", [id, 1n, keccak256(toHex(id)), `ipfs://${id}`], deposit);
        await send(KEYS.registrant, base.clauseRegistry, clauses, "withdrawDeposit", [computeClauseKey(id, 1n)]);
    }
    const withdrawn = watch("withdrawals", base);
    check("withdrawal-burst-… raised", keysOf(withdrawn).some((k) => k.startsWith("withdrawal-burst-")), withdrawn.failed ?? JSON.stringify(keysOf(withdrawn)));

    console.log("\nFigaroCore holding less than its open bonds");
    const rbs = await deploy(KEYS.deployer, "MockERC20Rebasing");
    const buyer = account(KEYS.buyer).address;
    const seller = account(KEYS.seller).address;
    const payment = parseEther("10");
    for (const [key, who] of [[KEYS.buyer, buyer], [KEYS.seller, seller]]) {
        await send(KEYS.deployer, rbs.address, rbs.abi, "mint", [who, parseEther("100")]);
        await send(key, rbs.address, rbs.abi, "approve", [base.figaroCore, parseEther("100")]);
    }
    const domain = buildDomain(31337, base.figaroCore);
    const { commitment, typedData } = buildCommitment({
        processId: `0x${"00".repeat(32)}`, buyer, seller, currency: rbs.address,
        payment, expectedCumulativeValue: payment,
        agreementHash: keccak256(toHex(`monitor-test-${stamp}`)),
        deadline: computeDeadline(await readChainTimestamp(pub)),
    }, domain);
    const buyerSig = await wallet(KEYS.buyer).signTypedData(typedData);
    const sellerSig = await wallet(KEYS.seller).signTypedData(typedData);
    const core = JSON.parse(fs.readFileSync(path.join(root, "abi", "FigaroCore.json"), "utf8"));
    await send(KEYS.buyer, base.figaroCore, core.abi ?? core, "commit", [commitment, buyerSig, sellerSig]);
    const exact = watch("solvent", base);
    check("no insolvency while the token holds its value", !keysOf(exact).some((k) => k.startsWith("insolvent-")), exact.failed ?? JSON.stringify(keysOf(exact)));
    await send(KEYS.deployer, rbs.address, rbs.abi, "rebase", [parseEther("0.5")]);
    const short = watch("insolvent", base);
    check("insolvent-… raised", keysOf(short).some((k) => k.startsWith("insolvent-")), short.failed ?? JSON.stringify(keysOf(short)));

    console.log("\nA record address that holds no code");
    const empty = watch("nocode", { ...base, clauseRegistry: account(KEYS.registrant).address });
    check("the watcher fails", typeof empty.failed === "string" && /holds no code/.test(empty.failed), JSON.stringify(empty));

    fs.rmSync(work, { recursive: true, force: true });
    console.log(failures.length ? `\n${failures.length} case(s) did not hold.` : "\nEvery case held.");
    process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
    console.error(`test-monitor: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
});
