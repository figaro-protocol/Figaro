#!/usr/bin/env node
// scripts/verify-etherscan.mjs, run against a broadcast file and artifacts
// written here (no chain, no Etherscan): forge is a stand-in program that
// records its arguments and fails for one address.
//
//   node --test scripts/test-verify-etherscan.mjs
//
// Cases: the constructor arguments are the init code past the creation code;
// a contract with no arguments gets none; the compiler settings come from the
// artifact's metadata; the URL is Etherscan's multichain endpoint with the record's chain id;
// a build that does not reproduce the creation code, a missing creation, and a
// creation of another contract each fail; the optional vault is skipped when
// the record names none; the command verifies every contract, keeps going past
// a failure, exits 1, and never puts the key on forge's command line.

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { VERIFIED_CONTRACTS, etherscanUrl, forgeArgs, planVerification, readCreations, redactKey } from "./verify-etherscan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const addr = (i) => `0x${(i + 1).toString(16).padStart(40, "0")}`;
const codeOf = (i) => `0x6080${(i + 0x10).toString(16).padStart(4, "0")}00`;
const ARG = "000000000000000000000000000000000000000000000000002386f26fc10000"; // 0.01 ether

/** A world with every contract: artifacts, a broadcast file, a record. */
function world({ withVault = true, tamper } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-etherscan-"));
    const out = path.join(dir, "out");
    const record = { chainId: 11155111 };
    const transactions = [];
    VERIFIED_CONTRACTS.forEach(({ key, name }, i) => {
        if (key === "daoTreasury" && !withVault) return;
        fs.mkdirSync(path.join(out, `${name}.sol`), { recursive: true });
        fs.writeFileSync(path.join(out, `${name}.sol`, `${name}.json`), JSON.stringify({
            bytecode: { object: codeOf(i) },
            metadata: {
                compiler: { version: "0.8.26+commit.8a97fa7a" },
                settings: {
                    compilationTarget: { [`src/x/${name}.sol`]: name },
                    optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun", viaIR: true,
                },
            },
        }));
        record[key] = addr(i);
        const input = key === "figaroCore" ? codeOf(i) : `${codeOf(i)}${ARG}`;
        transactions.push({ transactionType: "CREATE", contractName: name, contractAddress: addr(i).toLowerCase(), hash: `0x${"ab".repeat(32)}`, transaction: { input } });
    });
    transactions.push({ transactionType: "CALL", contractName: "FlorinToken", contractAddress: record.florinToken, transaction: { input: "0x1234" } });
    if (tamper) tamper({ record, transactions, out });
    const broadcast = path.join(dir, "run-latest.json");
    fs.writeFileSync(broadcast, JSON.stringify({ transactions }));
    const recordPath = path.join(dir, "11155111.json");
    fs.writeFileSync(recordPath, JSON.stringify(record));
    return { dir, out, record, broadcast, recordPath };
}
const planOf = (w) => planVerification({ record: w.record, creations: readCreations([w.broadcast]), artifactsDir: w.out });

test("the constructor arguments are the init code past the creation code", () => {
    const plan = planOf(world());
    assert.equal(plan.length, VERIFIED_CONTRACTS.length);
    for (const e of plan) {
        assert.equal(e.error, undefined, `${e.key}: ${e.error}`);
        assert.equal(e.constructorArgs, e.key === "figaroCore" ? "" : `0x${ARG}`);
        assert.equal(e.source, `src/x/${e.name}.sol:${e.name}`);
        assert.equal(e.compilerVersion, "v0.8.26+commit.8a97fa7a");
        assert.equal(e.runs, 200);
        assert.equal(e.evmVersion, "cancun");
        assert.equal(e.viaIR, true);
    }
});

test("forge gets the multichain URL for the record's chain, the build's settings, and no key", () => {
    const [core, attestation] = planOf(world());
    const url = etherscanUrl(11155111);
    assert.equal(url, "https://api.etherscan.io/v2/api?chainid=11155111");
    const a = forgeArgs(attestation, { chainId: 11155111, verifierUrl: url });
    assert.deepEqual(a.slice(0, 3), ["verify-contract", attestation.address, attestation.source]);
    for (const [flag, value] of [["--chain", "11155111"], ["--verifier-url", url], ["--compiler-version", "v0.8.26+commit.8a97fa7a"],
        ["--num-of-optimizations", "200"], ["--evm-version", "cancun"], ["--constructor-args", `0x${ARG}`]]) {
        assert.equal(a[a.indexOf(flag) + 1], value, flag);
    }
    assert.ok(a.includes("--via-ir"));
    assert.ok(!a.some((x) => /api-key/.test(x)));
    assert.ok(!forgeArgs(core, { chainId: 1, verifierUrl: etherscanUrl(1) }).includes("--constructor-args"));
});

test("a build that does not reproduce the creation code is refused", () => {
    const w = world({ tamper: ({ transactions }) => { transactions[0].transaction.input = "0xdeadbeef"; } });
    const core = planOf(w).find((e) => e.key === "figaroCore");
    assert.match(core.error, /reproduces its creation code/);
});

test("a record address with no creation, or a creation of another contract, fails", () => {
    const w = world({ tamper: ({ record, transactions }) => {
        record.usageCounter = addr(99);
        transactions.find((t) => t.contractName === "RpgfMinter").contractName = "FlorinToken";
    } });
    const plan = planOf(w);
    assert.match(plan.find((e) => e.key === "usageCounter").error, /no creation/);
    assert.match(plan.find((e) => e.key === "rpgfMinter").error, /created FlorinToken/);
});

test("a record with no vault verifies the rest; a record missing a required contract fails", () => {
    const plan = planOf(world({ withVault: false }));
    assert.equal(plan.length, VERIFIED_CONTRACTS.length - 1);
    assert.ok(plan.every((e) => !e.error));
    const w = world({ withVault: false, tamper: ({ record }) => { delete record.batchVerifier; } });
    assert.match(planOf(w).find((e) => e.key === "batchVerifier").error, /names no batchVerifier/);
});

test("the command tries every contract, keeps going past a failure, and exits 1", () => {
    const w = world();
    const log = path.join(w.dir, "forge-calls.txt");
    const stub = path.join(w.dir, "forge");
    // The stand-in fails for the usage counter's address and records each call
    // and whether the key reached it through the environment.
    fs.writeFileSync(stub, `#!/bin/sh\necho "$* key=$ETHERSCAN_API_KEY" >> "${log}"\ncase "$*" in *${w.record.usageCounter}*) echo "error: url: http://x/api?apikey=$ETHERSCAN_API_KEY&module=contract"; exit 1;; esac\necho "Contract successfully verified"\n`);
    fs.chmodSync(stub, 0o755);
    const r = spawnSync("node", [path.join(here, "verify-etherscan.mjs"), w.recordPath, "--broadcast", w.broadcast, "--artifacts", w.out],
        { encoding: "utf8", env: { ...process.env, FORGE_BIN: stub, ETHERSCAN_API_KEY: "test-key" } });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const calls = fs.readFileSync(log, "utf8").trim().split("\n");
    assert.equal(calls.length, VERIFIED_CONTRACTS.length);
    for (const c of calls) {
        assert.match(c, /key=test-key$/);
        assert.ok(!c.replace(/ key=test-key$/, "").includes("test-key"), "the key is not an argument");
    }
    assert.match(r.stdout, /usageCounter: forge verify-contract exited 1/);
    assert.ok(!r.stdout.includes("test-key"), "forge's echo of the request URL is printed without the key");
    assert.match(r.stdout, /apikey=<redacted>/);
    assert.match(r.stdout, /11 verified, 1 did not/);
});

test("--dry-run needs no key and runs no forge", () => {
    const w = world();
    const r = spawnSync("node", [path.join(here, "verify-etherscan.mjs"), w.recordPath, "--broadcast", w.broadcast, "--artifacts", w.out, "--dry-run"],
        { encoding: "utf8", env: { ...process.env, FORGE_BIN: "/nonexistent", ETHERSCAN_API_KEY: "" } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /12 planned, 0 did not/);
});

test("the key is cut from forge's text, in a query string or bare", () => {
    assert.equal(redactKey('url: "https://api.etherscan.io/v2/api?apikey=K3Y&chainid=1"', "K3Y"), 'url: "https://api.etherscan.io/v2/api?apikey=<redacted>&chainid=1"');
    assert.equal(redactKey("the key K3Y was refused", "K3Y"), "the key <redacted> was refused");
});
