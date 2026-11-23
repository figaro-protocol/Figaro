#!/usr/bin/env node
// State a deployment's point on the γ curve of /papers/substrate-broadening-rpgf
// § 7: the unit price of fabricated score, from the member stake D, the wait T,
// the period length L, the floor of distinct staked sellers d_min, and g, the
// gas one fabricated process costs to resolve and be counted on the batch path
// at the chain's present gas price.
//
//   node scripts/gamma-point.mjs deployments/<chainId>.expected.json [--rpc URL]
//       [--priority-gas-price WEI] [--proof-words K] [--honest-score S] [--json]
//
// Inputs, each printed beside its source:
//   D, T     registries.membersRegistrationDeposit and membersWithdrawalCooldown
//            of the expectations file (the values the deploy script deploys);
//   d_min    usageCounter.minSellers of the expectations file;
//   L        the period length the chain's deploy script builds its
//            UsageCounter schedule with (script/Deploy*.s.sol), checked
//            against the deployed UsageCounter's periodEnd when the deployment
//            record deployments/<chainId>.json names one;
//   g        in gas: what the relay's plan (prover/sequencer/src/gas.rs,
//            `settle_gas_estimate`) adds to a batch for one more process of
//            one order, its commit, its resolve and one usage claim, with the
//            stream widths of prover/lib/src/operation_stream.rs; every
//            constant is read from those two files, never copied here;
//   gas price the latest block's base gas price plus a priority gas price:
//            --priority-gas-price, else the node's eth_maxPriorityFeePerGas.
//
// What one more process adds, and why. An adversary fabricating score batches
// its processes, so the batch's fixed costs (the proof's verification, the
// call's execution, the framing calldata) spread over the batch and are left
// out. Its buyer's and its sellers' net positions are per wallet, not per
// process, and are left out too: a fresh seller's position is a cost of the
// identity, which the paper's δ does not carry, so leaving it out errs in the
// adversary's favor, as § 7.1 does with the time value of bonds. What remains
// is per process: the commit entry, the resolve entry in its signed form (the
// cheaper of the two), the usage claim entry with an inclusion proof of
// --proof-words words (default 0, a one-leaf agreement), their calldata at
// the nonzero-byte gas, their stream words' linear execution (the quadratic
// term is a property of the batch's size, left out), the verifier's per-entry
// reads, and one use the counter counts. The relay's constants are ceilings
// on the chain's charge, so g here is a ceiling on the least marginal gas.
//
// It sends nothing and writes nothing. --json prints the result as JSON, to be
// kept beside the deployment record (docs/RELEASE_READINESS.md Task 3).
// scripts/test-gamma-point.mjs holds the arithmetic and the source reads.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withUrlHosts } from "./url-host.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const GAS_PLAN_FILE = "prover/sequencer/src/gas.rs";
export const STREAM_FILE = "prover/lib/src/operation_stream.rs";

/** The relay's constants g is built from, by name, as gas.rs declares them. */
export const GAS_PLAN_NAMES = [
    "SETTLE_GAS_PER_USE",
    "SETTLE_GAS_PER_STREAM_WORD",
    "SETTLE_GAS_PER_STREAM_COMMIT",
    "SETTLE_GAS_PER_STREAM_RESOLVED_ORDER",
    "SETTLE_GAS_PER_STREAM_RESOLUTION",
    "SETTLE_GAS_PER_STREAM_CLAIM",
    "CALLDATA_NONZERO_BYTE_GAS",
];

/** The deploy script that builds each chain's UsageCounter schedule. */
export const DEPLOY_SCRIPTS = {
    1: "script/DeployMainnet.s.sol",
    11155111: "script/DeploySepolia.s.sol",
    31337: "script/Deploy.s.sol",
};

/** `const NAME: u64 = 120_000;` (with or without `pub`) in a Rust source, by name. */
export function readRustConstants(file, names) {
    const src = fs.readFileSync(path.resolve(root, file), "utf8");
    const out = {};
    for (const name of names) {
        const m = src.match(new RegExp(`(?:pub\\s+)?const\\s+${name}\\s*:\\s*\\w+\\s*=\\s*([^;]+);`));
        if (!m) throw new Error(`${file} declares no constant ${name}`);
        const expr = m[1].trim();
        if (!/^[0-9_+\s]+$/.test(expr)) throw new Error(`${file}: ${name} is not a sum of integers: ${expr}`);
        out[name] = expr.split("+").reduce((a, t) => a + BigInt(t.trim().replace(/_/g, "")), 0n);
    }
    return out;
}

/** The gas plan's constants and the stream's widths, read from their sources. */
export function readGasInputs() {
    return {
        plan: readRustConstants(GAS_PLAN_FILE, GAS_PLAN_NAMES),
        stream: readRustConstants(STREAM_FILE, ["COMMITMENT_BYTES", "SIGNATURE_BYTES"]),
    };
}

/**
 * The bytes one process of one order adds to the operation stream, by the
 * grammar in operation_stream.rs:
 *   0x01 commitment sig sig                        (Commit)
 *   0x02 processId(32) sig count(2) commitment     (Resolve, one order)
 *   0x03 commitment key(32) kind(1) hash(32) count(2) word(32)*k
 *                                                  (UsageClaim, a clause's or an agreement's kind)
 */
export function processStreamBytes({ COMMITMENT_BYTES: c, SIGNATURE_BYTES: s }, proofWords = 0n) {
    const commit = 1n + c + 2n * s;
    const resolve = 1n + 32n + s + 2n + c;
    const claim = 1n + c + 32n + 1n + 32n + 2n + 32n * BigInt(proofWords);
    return { commit, resolve, claim, total: commit + resolve + claim };
}

/** g in gas: what `settle_gas_estimate` adds for one more such process. */
export function marginalProcessGas({ plan, stream }, proofWords = 0n) {
    const bytes = processStreamBytes(stream, proofWords);
    const parts = {
        calldata: bytes.total * plan.CALLDATA_NONZERO_BYTE_GAS,
        // the stream's linear term, per byte: words · SETTLE_GAS_PER_STREAM_WORD over 32 bytes a word
        streamWords: (bytes.total * plan.SETTLE_GAS_PER_STREAM_WORD + 31n) / 32n,
        entries:
            plan.SETTLE_GAS_PER_STREAM_COMMIT +
            plan.SETTLE_GAS_PER_STREAM_RESOLVED_ORDER +
            plan.SETTLE_GAS_PER_STREAM_RESOLUTION +
            plan.SETTLE_GAS_PER_STREAM_CLAIM,
        use: plan.SETTLE_GAS_PER_USE,
    };
    return { bytes, parts, gas: parts.calldata + parts.streamWords + parts.entries + parts.use };
}

const need = (inputs, names) => {
    const missing = names.filter((n) => inputs[n] === undefined || inputs[n] === null || inputs[n] === "");
    if (missing.length) throw new Error(`missing input: ${missing.join(", ")}`);
};

/**
 * The paper's arithmetic (§ 7.1 to § 7.3), in wei and seconds, over the reals.
 *   δ = D / ⌈L/T⌉ (δ = 0 when T = 0, δ = D once T ≥ L)
 *   γ = δ + g                           when δ ≤ 2g
 *   γ = 3 · 2^(-2/3) · δ^(2/3) · g^(1/3) when δ > 2g
 *   s0 = d_min · max(1, (δ/2g)^(1/3)), the entry price d_min(δ + g),
 *   C(φ) = γ · S_h · φ/(1-φ).
 * `D`, `gWei` in wei; `T`, `L` in seconds; `dMin` a count. Throws on a missing input.
 */
export function gammaPoint({ D, T, L, dMin, gWei }) {
    need({ D, T, L, dMin, gWei }, ["D", "T", "L", "dMin", "gWei"]);
    const [d, t, l, n, g] = [D, T, L, dMin, gWei].map(Number);
    if (!(l > 0)) throw new Error("the period length L must be positive");
    if (!(g > 0)) throw new Error("g must be positive");
    if (!(n >= 1)) throw new Error("the floor d_min must be at least 1");
    if (d < 0 || t < 0) throw new Error("D and T must not be negative");
    const identitiesPerStake = t === 0 ? Infinity : Math.ceil(l / t);
    const delta = t === 0 ? 0 : d / identitiesPerStake;
    const interior = delta > 2 * g;
    const gamma = interior ? 3 * 2 ** (-2 / 3) * delta ** (2 / 3) * g ** (1 / 3) : delta + g;
    return {
        identitiesPerStake,
        delta,
        regime: interior ? "delta > 2g" : "delta <= 2g",
        processesPerIdentity: interior ? (delta / (2 * g)) ** (2 / 3) : 1,
        gamma,
        s0: n * Math.max(1, (delta / (2 * g)) ** (1 / 3)),
        entryPrice: n * (delta + g),
        elasticity: interior ? 2 / 3 : delta / (delta + g),
        capture: (phi, honestScore = 1) => gamma * honestScore * (phi / (1 - phi)),
    };
}

/** The period length the deploy script builds the schedule with, in seconds. */
export function periodFromDeployScript(file) {
    const src = fs.readFileSync(path.resolve(root, file), "utf8");
    const units = { days: 86_400n, weeks: 604_800n, hours: 3_600n };
    const m =
        src.match(/uint64\s+constant\s+PERIOD\s*=\s*([0-9_]+)\s*(days|weeks|hours)\s*;/) ??
        src.match(/periods\[i\]\s*=[^;]*\*\s*([0-9_]+)\s*(days|weeks|hours)\s*\)\s*;/);
    if (!m) throw new Error(`${file} builds no period schedule this script can read`);
    return BigInt(m[1].replace(/_/g, "")) * units[m[2]];
}

/** The member stake, the wait and the floor from an expectations file. */
export function readExpectations(file) {
    const plan = JSON.parse(fs.readFileSync(file, "utf8"));
    const r = plan.registries ?? {};
    const u = plan.usageCounter ?? {};
    const out = {
        chainId: plan.chainId,
        D: r.membersRegistrationDeposit,
        T: r.membersWithdrawalCooldown,
        dMin: u.minSellers,
        designerStakes: {
            clause: r.clauseRegistrationDeposit,
            agreement: r.agreementRegistrationDeposit,
            assembly: r.assemblyRegistrationDeposit,
        },
    };
    need(out, ["chainId", "D", "T", "dMin"]);
    return { ...out, D: BigInt(out.D), T: BigInt(out.T), dMin: BigInt(out.dMin) };
}

const eth = (wei) => `${(Number(wei) / 1e18).toPrecision(6)} ETH`;
const gwei = (wei) => `${wei} wei (${(Number(wei) / 1e9).toPrecision(6)} gwei)`;

function parseArgs(argv) {
    const args = { positional: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--json") args.json = true;
        else if (a.startsWith("--")) args[a.slice(2)] = argv[++i];
        else args.positional.push(a);
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const file = args.positional[0];
    if (!file) throw new Error("usage: node scripts/gamma-point.mjs deployments/<chainId>.expected.json [--rpc URL]");
    const exp = readExpectations(file);
    const recordFile = path.join(path.dirname(file), `${exp.chainId}.json`);
    const record = fs.existsSync(recordFile) ? JSON.parse(fs.readFileSync(recordFile, "utf8")) : null;
    const rpc = args.rpc ?? process.env.RPC_URL ?? record?.rpcUrl;
    if (!rpc) throw new Error("no RPC: pass --rpc, set RPC_URL, or keep an rpcUrl in the deployment record");

    const deployScript = DEPLOY_SCRIPTS[exp.chainId];
    if (!deployScript) throw new Error(`no deploy script is known for chain ${exp.chainId}`);
    const L = periodFromDeployScript(deployScript);

    const { createPublicClient, http, parseAbi } = await import("viem");
    const client = createPublicClient({ transport: http(rpc) });
    const chainId = await client.getChainId();
    if (chainId !== Number(exp.chainId)) throw new Error(`the RPC serves chain ${chainId}, the file names ${exp.chainId}`);

    let periodSource = `${deployScript} (the UsageCounter schedule)`;
    if (record?.usageCounter) {
        const abi = parseAbi(["function periodEnd(uint256) view returns (uint64)", "function periodCount() view returns (uint256)"]);
        const count = await client.readContract({ address: record.usageCounter, abi, functionName: "periodCount" });
        if (count >= 2n) {
            const [e0, e1] = await Promise.all([0n, 1n].map((i) => client.readContract({ address: record.usageCounter, abi, functionName: "periodEnd", args: [i] })));
            const onChain = BigInt(e1) - BigInt(e0);
            if (onChain !== L) throw new Error(`the deployed UsageCounter's period is ${onChain} s, ${deployScript} builds ${L} s`);
            periodSource += `, equal to UsageCounter ${record.usageCounter} periodEnd(1) - periodEnd(0)`;
        }
    }

    const block = await client.getBlock({ blockTag: "latest" });
    const baseGasPrice = block.baseFeePerGas;
    if (baseGasPrice == null) throw new Error("the latest block carries no base gas price");
    const priorityGiven = args["priority-gas-price"] !== undefined;
    const priority = priorityGiven
        ? BigInt(args["priority-gas-price"])
        : BigInt(await client.request({ method: "eth_maxPriorityFeePerGas" }));
    const gasPrice = baseGasPrice + priority;

    const proofWords = BigInt(args["proof-words"] ?? 0);
    const gas = marginalProcessGas(readGasInputs(), proofWords);
    const gWei = gas.gas * gasPrice;
    const p = gammaPoint({ D: exp.D, T: exp.T, L, dMin: exp.dMin, gWei });
    const honest = args["honest-score"] !== undefined ? Number(args["honest-score"]) : null;
    const shares = [0.1, 0.25, 0.5];

    const result = {
        chainId: exp.chainId,
        block: { number: block.number.toString(), timestamp: block.timestamp.toString() },
        inputs: {
            D: { wei: exp.D.toString(), source: `${file} registries.membersRegistrationDeposit` },
            T: { seconds: exp.T.toString(), source: `${file} registries.membersWithdrawalCooldown` },
            L: { seconds: L.toString(), source: periodSource },
            dMin: { count: exp.dMin.toString(), source: `${file} usageCounter.minSellers` },
            baseGasPrice: { wei: baseGasPrice.toString(), source: `block ${block.number} baseFeePerGas` },
            priorityGasPrice: { wei: priority.toString(), source: priorityGiven ? "--priority-gas-price" : "the node's eth_maxPriorityFeePerGas" },
            gGas: {
                gas: gas.gas.toString(),
                source: `${GAS_PLAN_FILE} and ${STREAM_FILE}: one commit, one signed resolve of one order, one usage claim with ${proofWords} proof words, one use`,
                streamBytes: Object.fromEntries(Object.entries(gas.bytes).map(([k, v]) => [k, v.toString()])),
                parts: Object.fromEntries(Object.entries(gas.parts).map(([k, v]) => [k, v.toString()])),
            },
            designerStakes: { ...exp.designerStakes, source: `${file} registries (they price replication across registrations, § 7.3)` },
        },
        point: {
            gWei: gWei.toString(),
            identitiesPerStake: p.identitiesPerStake,
            deltaWei: p.delta,
            regime: p.regime,
            processesPerIdentity: p.processesPerIdentity,
            gammaWei: p.gamma,
            s0: p.s0,
            entryPriceWei: p.entryPrice,
            elasticityToStake: p.elasticity,
            captureOverHonestScoreWei: Object.fromEntries(shares.map((f) => [f, p.capture(f)])),
            captureWei: honest === null ? null : Object.fromEntries(shares.map((f) => [f, p.capture(f, honest)])),
        },
    };

    if (args.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    console.log(`γ-curve point, chain ${exp.chainId}, block ${block.number}`);
    console.log(`  D      ${eth(exp.D)}  ← ${result.inputs.D.source}`);
    console.log(`  T      ${exp.T} s (${Number(exp.T) / 86400} days)  ← ${result.inputs.T.source}`);
    console.log(`  L      ${L} s (${Number(L) / 86400} days)  ← ${periodSource}`);
    console.log(`  d_min  ${exp.dMin}  ← ${result.inputs.dMin.source}`);
    console.log(`  gas price  ${gwei(gasPrice)} = base ${gwei(baseGasPrice)} + priority ${gwei(priority)} (${result.inputs.priorityGasPrice.source})`);
    console.log(`  g      ${gas.gas} gas × gas price = ${eth(gWei)}  ← ${result.inputs.gGas.source}`);
    console.log(`         stream bytes: commit ${gas.bytes.commit}, resolve ${gas.bytes.resolve}, claim ${gas.bytes.claim}`);
    console.log(`         calldata ${gas.parts.calldata} + stream words ${gas.parts.streamWords} + entries ${gas.parts.entries} + use ${gas.parts.use}`);
    console.log(`  δ = D/⌈L/T⌉ = D/${p.identitiesPerStake} = ${eth(p.delta)}`);
    console.log(`  regime ${p.regime}: ${p.processesPerIdentity.toPrecision(4)} processes per fabricated seller`);
    console.log(`  γ      ${eth(p.gamma)} per unit of fabricated score (valid for s ≥ s0 = ${p.s0.toPrecision(4)})`);
    console.log(`  entry price d_min(δ + g) = ${eth(p.entryPrice)}`);
    console.log(`  elasticity of γ to the stake ${p.elasticity.toPrecision(3)}`);
    for (const f of shares) {
        const line = `  C(φ=${f}) = γ·S_h·φ/(1-φ) = ${eth(p.capture(f))} × S_h`;
        console.log(honest === null ? line : `${line} = ${eth(p.capture(f, honest))} at S_h = ${honest}`);
    }
    console.log(`  designer stakes (replication, § 7.3): clause ${eth(exp.designerStakes.clause ?? 0)}, agreement ${eth(exp.designerStakes.agreement ?? 0)}, assembly ${eth(exp.designerStakes.assembly ?? 0)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((e) => {
        // An RPC error quotes the endpoint, whose path or query can carry a key.
        console.error(withUrlHosts(e.message));
        process.exit(1);
    });
}
