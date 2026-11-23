#!/usr/bin/env node
// Verify every contract a deployment record names on Etherscan, each with the
// constructor arguments it was created with.
//
//   node scripts/verify-etherscan.mjs <record.json> [--broadcast <run.json>]... [--artifacts <dir>] [--dry-run]
//
// <record.json> is deployments/<chainId>.json. The chain is the record's
// `chainId`; nothing in this script names a chain. Each contract's creation is
// read from forge's broadcast files (the transaction's init code), and its
// constructor arguments are the init code past the compiled creation code: a
// build that does not reproduce the creation code byte for byte is refused,
// never verified with a guess. Run `forge build --via-ir` at the release
// commit first, as the deploy wrappers do (`--artifacts`, default `out`).
//
// With no --broadcast, every `broadcast/*/<chainId>/run-latest.json` is read;
// a creation counts only when its address is one the record names, so files
// from other runs cannot be mistaken for this deployment's.
//
// The compiler, its optimizer runs, the EVM version and the via-IR flag are
// read from each artifact's own metadata, so the settings Etherscan compiles
// with are the ones the code was compiled with.
//
// The API is Etherscan's multichain API (`https://api.etherscan.io/v2/api?chainid=<id>`):
// one endpoint and one key for every chain, the chain picked by `chainid`
// (docs.etherscan.io, "Verify with Foundry"; the per-chain hosts answer
// that the endpoint is deprecated).
//
//   ETHERSCAN_API_KEY       the key (not needed with --dry-run); handed to forge
//                           in its environment, never on a command line
//   ETHERSCAN_VERIFIER_URL  overrides that URL (a test points it at a closed port)
//   ETHERSCAN_RETRIES       forge's --retries for each request (forge's default when unset)
//   FORGE_BIN               the forge binary (default `forge`)
//
// A contract Etherscan already holds verified is reported by forge and counts
// as verified, so a re-run after a partial failure verifies only the rest.
// Exit 0 only when every contract verified; every failure is printed.
// scripts/test-verify-etherscan.mjs holds its behavior.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The record key → the contract created for it. The record's `daoTreasury` is
 *  not among them: the treasury is a Safe that stood before the deployment, on
 *  every public chain, and is not this deployment's code. */
export const VERIFIED_CONTRACTS = [
    { key: "figaroCore", name: "FigaroCore" },
    { key: "attestationCoordinator", name: "AttestationCoordinator" },
    { key: "clauseRegistry", name: "ClauseRegistry" },
    { key: "membersRegistry", name: "MembersRegistry" },
    { key: "processRegistry", name: "ProcessRegistry" },
    { key: "agreementRegistry", name: "AgreementRegistry" },
    { key: "florinToken", name: "FlorinToken" },
    { key: "usageCounter", name: "UsageCounter" },
    { key: "rpgfMinter", name: "RpgfMinter" },
    { key: "batchVerifier", name: "FigaroBatchVerifier" },
    { key: "witnessSwapAndCommitCoordinator", name: "WitnessSwapAndCommitCoordinator" },
];

export const etherscanUrl = (chainId) => `https://api.etherscan.io/v2/api?chainid=${chainId}`;

const lower = (s) => String(s).toLowerCase();
const strip0x = (s) => lower(s).replace(/^0x/, "");

/** Every CREATE in the broadcast files: lower(address) → { name, input, hash }. */
export function readCreations(broadcastFiles) {
    const creations = new Map();
    for (const file of broadcastFiles) {
        const run = JSON.parse(fs.readFileSync(file, "utf8"));
        for (const tx of run.transactions ?? []) {
            if (tx.transactionType !== "CREATE" && tx.transactionType !== "CREATE2") continue;
            if (!tx.contractAddress || !tx.transaction?.input) continue;
            creations.set(lower(tx.contractAddress), {
                name: tx.contractName, input: tx.transaction.input, hash: tx.hash, file,
            });
        }
    }
    return creations;
}

/** Every artifact JSON under `artifactsDir` named `<name>.json`. */
function artifactsNamed(artifactsDir, name) {
    const found = [];
    for (const dir of fs.readdirSync(artifactsDir)) {
        const file = path.join(artifactsDir, dir, `${name}.json`);
        if (fs.existsSync(file)) found.push(file);
    }
    return found;
}

/**
 * The verification plan: one entry per contract, `{ key, name, address, source,
 * constructorArgs, compilerVersion, runs, evmVersion, viaIR }`, or `{ key, error }`.
 */
export function planVerification({ record, creations, artifactsDir }) {
    const plan = [];
    for (const { key, name } of VERIFIED_CONTRACTS) {
        const address = record[key];
        if (!address) {
            plan.push({ key, name, error: `the record names no ${key}` });
            continue;
        }
        const creation = creations.get(lower(address));
        if (!creation) {
            plan.push({ key, name, address, error: `no creation of ${address} in the broadcast files read` });
            continue;
        }
        if (creation.name !== name) {
            plan.push({ key, name, address, error: `the broadcast created ${creation.name} at ${address}, not ${name}` });
            continue;
        }
        const init = strip0x(creation.input);
        const candidates = artifactsNamed(artifactsDir, name).map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
        const artifact = candidates.find((a) => {
            const code = strip0x(a.bytecode?.object ?? "");
            return code.length > 0 && init.startsWith(code);
        });
        if (!artifact) {
            plan.push({
                key, name, address,
                error: `no artifact of ${name} in ${artifactsDir} reproduces its creation code (${candidates.length} read) — build with the deploy's settings (forge build --via-ir) at the deployed commit`,
            });
            continue;
        }
        const meta = artifact.metadata ?? JSON.parse(artifact.rawMetadata);
        const [source] = Object.entries(meta.settings.compilationTarget ?? {}).find(([, n]) => n === name) ?? [];
        if (!source) {
            plan.push({ key, name, address, error: `the ${name} artifact names no compilation target` });
            continue;
        }
        const code = strip0x(artifact.bytecode.object);
        plan.push({
            key, name, address,
            source: `${source}:${name}`,
            constructorArgs: init.length > code.length ? `0x${init.slice(code.length)}` : "",
            compilerVersion: `v${meta.compiler.version}`,
            runs: meta.settings.optimizer?.enabled ? meta.settings.optimizer.runs : undefined,
            evmVersion: meta.settings.evmVersion,
            viaIR: meta.settings.viaIR === true,
            creationTx: creation.hash,
        });
    }
    return plan;
}

/** The `forge verify-contract` arguments for one plan entry (no key: forge reads ETHERSCAN_API_KEY). */
export function forgeArgs(entry, { chainId, verifierUrl, retries }) {
    const args = [
        "verify-contract", entry.address, entry.source,
        "--chain", String(chainId),
        "--verifier", "etherscan",
        "--verifier-url", verifierUrl,
        "--compiler-version", entry.compilerVersion,
        "--evm-version", entry.evmVersion,
        "--watch",
    ];
    if (entry.runs !== undefined) args.push("--num-of-optimizations", String(entry.runs));
    if (entry.viaIR) args.push("--via-ir");
    if (entry.constructorArgs) args.push("--constructor-args", entry.constructorArgs);
    if (retries !== undefined) args.push("--retries", String(retries), "--delay", "1");
    return args;
}

/** `text` with the API key cut wherever it appears, in a query string or bare. */
export function redactKey(text, key) {
    let out = text.replace(/(apikey=)[^&"\s)]*/gi, "$1<redacted>");
    if (key) out = out.split(key).join("<redacted>");
    return out;
}

function defaultBroadcastFiles(chainId) {
    const dir = path.join(root, "broadcast");
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .map((script) => path.join(dir, script, String(chainId), "run-latest.json"))
        .filter((f) => fs.existsSync(f));
}

function main() {
    const args = process.argv.slice(2);
    const broadcasts = [];
    let artifactsDir = path.join(root, "out");
    let dryRun = false;
    const positional = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--broadcast") broadcasts.push(args[++i]);
        else if (args[i] === "--artifacts") artifactsDir = args[++i];
        else if (args[i] === "--dry-run") dryRun = true;
        else positional.push(args[i]);
    }
    const [recordPath] = positional;
    if (!recordPath) {
        console.error("usage: verify-etherscan.mjs <record.json> [--broadcast <run.json>]... [--artifacts <dir>] [--dry-run]");
        process.exit(2);
    }
    const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
    const chainId = record.chainId;
    const files = broadcasts.length ? broadcasts : defaultBroadcastFiles(chainId);
    const verifierUrl = process.env.ETHERSCAN_VERIFIER_URL || etherscanUrl(chainId);
    if (!dryRun && !process.env.ETHERSCAN_API_KEY) {
        console.error("ETHERSCAN_API_KEY is not set");
        process.exit(2);
    }
    console.log(`Verifying ${recordPath} (chain ${chainId}) on ${verifierUrl}`);
    console.log(`  creations read from: ${files.length ? files.join(", ") : "(none)"}`);
    console.log(`  artifacts: ${artifactsDir}\n`);

    const plan = planVerification({ record, creations: readCreations(files), artifactsDir });
    const failures = [];
    for (const entry of plan) {
        if (entry.error) {
            failures.push(`${entry.key}: ${entry.error}`);
            console.log(`  ✗ ${entry.key}: ${entry.error}`);
            continue;
        }
        const fa = forgeArgs(entry, { chainId, verifierUrl, retries: process.env.ETHERSCAN_RETRIES || undefined });
        console.log(`  ${entry.name} ${entry.address}  (created in ${entry.creationTx})`);
        console.log(`    constructor arguments: ${entry.constructorArgs || "(none)"}`);
        if (dryRun) {
            console.log(`    forge ${fa.join(" ")}`);
            continue;
        }
        const r = spawnSync(process.env.FORGE_BIN || "forge", fa, { cwd: root, encoding: "utf8", env: process.env });
        // forge's own failure text carries the request URL, the key in its
        // query string: the key is cut before anything is printed.
        const out = redactKey(`${r.stdout ?? ""}${r.stderr ?? ""}`, process.env.ETHERSCAN_API_KEY).replace(/\n+$/, "");
        if (out) console.log(out.replace(/^/gm, "    | "));
        if (r.status === 0) console.log(`  ✓ ${entry.name} verified`);
        else {
            failures.push(`${entry.key}: forge verify-contract exited ${r.status ?? r.error}`);
            console.log(`  ✗ ${entry.name}: forge verify-contract exited ${r.status ?? r.error}`);
        }
    }
    const done = plan.length - failures.length;
    console.log(`\n${done} ${dryRun ? "planned" : "verified"}, ${failures.length} did not.`);
    if (failures.length) {
        for (const f of failures) console.log(`  - ${f}`);
        process.exit(1);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
