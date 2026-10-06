#!/usr/bin/env node
// What must hold on a chain after the deploy and the genesis registration,
// checked against that chain.
//
//   node scripts/check-deployment.mjs <record.json> <expected.json> [--artifacts <dir>]
//
// <record.json> is the deployment record the deploy wrote (deployments/<chainId>.json,
// or .deployments/local.json on a devnet). <expected.json> is written BEFORE
// the deployment it checks (deployments/<chainId>.expected.json): the audited
// guest key, the proof gateway, every parameter the contracts fix forever,
// the florin genesis, and who registers each clause. The two are compared
// through the chain alone; nothing is taken from the deploy's own output.
//
// A value in <expected.json> is one of:
//   a literal               the chain must read exactly that
//   null                    not decided yet — the check FAILS, naming it
//   { "record": "<key>" }   the address the record gives under <key>
//   { "code": "<Name>" }    an address that must hold the compiled <Name>'s code
//
// "links" maps "<contract>.<getter>" to a literal address a wired link must
// read INSTEAD of the record's — a stated divergence, never a skip.
//
// Checked, whatever the expectations: the RPC's chain is the record's; every
// record address holds code; every contract-to-contract link the deploy wires
// reads back as the record's addresses. With --artifacts <dir> (a build with
// the deploy's settings: `forge build --via-ir`, at the audit tag for
// mainnet), every contract's code must equal its compiled code, immutables
// masked.
//
// Exit 0 only when every check holds; every failure is printed, never only
// the first.
//
//   RPC_URL   the node (default http://127.0.0.1:8545)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, encodeAbiParameters, http, keccak256, parseAbi } from "viem";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => {
    const i = args.indexOf(`--${name}`);
    if (i < 0) return undefined;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
};
const artifactsDir = flag("artifacts");
const [recordPath, expectedPath] = args;
if (!recordPath || !expectedPath) {
    console.error("usage: check-deployment.mjs <record.json> <expected.json> [--artifacts <dir>]");
    process.exit(2);
}
const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"));
const client = createPublicClient({ transport: http(process.env.RPC_URL ?? "http://127.0.0.1:8545") });

const failures = [];
let passed = 0;
const ok = (label) => { passed++; console.log(`  ✓ ${label}`); };
const bad = (label, why) => { failures.push(`${label}: ${why}`); console.log(`  ✗ ${label}: ${why}`); };
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/** The record key → the contract compiled for it. */
const CONTRACTS = {
    figaroCore: "FigaroCore",
    attestationCoordinator: "AttestationCoordinator",
    clauseRegistry: "ClauseRegistry",
    membersRegistry: "MembersRegistry",
    assemblyRegistry: "AssemblyRegistry",
    florinToken: "FlorinToken",
    usageCounter: "UsageCounter",
    rpgfMinter: "RpgfMinter",
    batchVerifier: "FigaroBatchVerifier",
    witnessSwapAndCommitCoordinator: "WitnessSwapAndCommitCoordinator",
};

const ABI = parseAbi([
    "function core() view returns (address)",
    "function members() view returns (address)",
    "function clauses() view returns (address)",
    "function assemblies() view returns (address)",
    "function batchVerifier() view returns (address)",
    "function usageCounter() view returns (address)",
    "function clauseRegistry() view returns (address)",
    "function verifier() view returns (address)",
    "function programVKey() view returns (bytes32)",
    "function figaroCore() view returns (address)",
    "function permit2() view returns (address)",
    "function router() view returns (address)",
    "function florin() view returns (address)",
    "function counter() view returns (address)",
    "function provenanceClause() view returns (bytes32)",
    "function minSellers() view returns (uint64)",
    "function periodCount() view returns (uint256)",
    "function periodAmount(uint256) view returns (uint256)",
    "function excludedClauseOrAssembly(bytes32) view returns (bool)",
    "function registrationDeposit() view returns (uint256)",
    "function withdrawalCooldown() view returns (uint256)",
    "function deployerMintRenounced() view returns (bool)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function minters(address) view returns (uint256 cap, uint256 minted)",
    "function depositOf(bytes32) view returns (address registeredBy, bool withdrawn)",
]);
const read = (address, functionName, args = []) =>
    client.readContract({ address, abi: ABI, functionName, args });

/** ClauseRegistry's key for a clause id and version (sdk `computeClauseKey`). */
const clauseKey = (id, version) =>
    keccak256(encodeAbiParameters([{ type: "string" }, { type: "uint64" }], [id, BigInt(version)]));
/** "figaro-commerce@1" → its registry key. */
const keyOf = (ref) => {
    const [id, version] = ref.split("@");
    return clauseKey(id, version ?? 1);
};

// ── Compiled code ──────────────────────────────────────────────────────────

function artifact(name) {
    const file = path.join(artifactsDir, `${name}.sol`, `${name}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Runtime code with every immutable's bytes zeroed, as hex without 0x. */
function masked(hex, immutableReferences) {
    const bytes = Buffer.from(hex.replace(/^0x/, ""), "hex");
    for (const refs of Object.values(immutableReferences ?? {})) {
        for (const { start, length } of refs) bytes.fill(0, start, start + length);
    }
    return bytes.toString("hex");
}

/** Whether `address` holds the compiled `name`'s code. A reason string when not. */
async function holdsCode(address, name) {
    if (!artifactsDir) return "no --artifacts given — the code cannot be compared";
    const a = artifact(name);
    if (!a) return `no artifact for ${name} under ${artifactsDir}`;
    const onChain = await client.getCode({ address });
    if (!onChain || onChain === "0x") return "no code at the address";
    const compiled = a.deployedBytecode;
    if (onChain.length !== compiled.object.length) {
        return `the code is ${(onChain.length - 2) / 2} bytes; ${name} as compiled is ${(compiled.object.length - 2) / 2}`;
    }
    if (masked(onChain, compiled.immutableReferences) !== masked(compiled.object, compiled.immutableReferences)) {
        return `the code is not ${name} as compiled under ${artifactsDir}`;
    }
    return null;
}

// ── Expected values ────────────────────────────────────────────────────────

/** Resolve an expected address value. */
function resolveAddress(spec, label) {
    if (spec === null || spec === undefined) return { undecided: true };
    if (typeof spec === "string") return { address: spec };
    if (spec.record) {
        const a = record[spec.record];
        if (!a) return { error: `the record has no "${spec.record}"` };
        return { address: a };
    }
    if (spec.code) return { code: spec.code };
    if (spec.wallet) return resolveAddress(expected.wallets?.[spec.wallet], label);
    return { error: `unreadable expectation ${JSON.stringify(spec)}` };
}

/** Check one value the chain reads against its expectation. */
async function expectValue(label, spec, got) {
    if (spec === null || spec === undefined) return bad(label, "not decided — write the value in the expectations file before the deployment");
    if (typeof spec === "object" && (spec.record || spec.code || spec.wallet)) {
        const r = resolveAddress(spec, label);
        if (r.undecided) return bad(label, `not decided — wallet "${spec.wallet}" has no address in the expectations file`);
        if (r.error) return bad(label, r.error);
        if (r.code) {
            const why = await holdsCode(got, r.code);
            return why ? bad(label, `${got}: ${why}`) : ok(`${label} holds ${r.code}'s code`);
        }
        return same(got, r.address) ? ok(label) : bad(label, `reads ${got}, expected ${r.address}`);
    }
    return same(got, spec) ? ok(label) : bad(label, `reads ${got}, expected ${spec}`);
}

// ── The checks ─────────────────────────────────────────────────────────────

async function main() {
    console.log(`Checking ${recordPath} against ${expectedPath}`);

    console.log("\nThe chain");
    const chainId = await client.getChainId();
    if (chainId === record.chainId && chainId === expected.chainId) ok(`chain ${chainId}`);
    else bad("chain", `the node is on ${chainId}; the record says ${record.chainId}, the expectations ${expected.chainId}`);

    console.log("\nCode at every address");
    for (const [key, name] of Object.entries(CONTRACTS)) {
        const address = record[key];
        if (!address) { bad(key, "missing from the record"); continue; }
        const code = await client.getCode({ address });
        if (!code || code === "0x") { bad(`${key} (${address})`, "no code"); continue; }
        if (artifactsDir) {
            const why = await holdsCode(address, name);
            if (why) bad(`${key} is ${name}`, why); else ok(`${key} is ${name} as compiled`);
        } else {
            ok(`${key} holds code`);
        }
    }
    if (!artifactsDir) bad("compiled code", "not compared — pass --artifacts <dir> (forge build --via-ir; at the audit tag for mainnet)");

    console.log("\nThe links the deploy wires");
    const links = [
        ["attestationCoordinator", "core", "figaroCore"],
        ["usageCounter", "core", "figaroCore"],
        ["usageCounter", "members", "membersRegistry"],
        ["usageCounter", "clauses", "clauseRegistry"],
        ["usageCounter", "assemblies", "assemblyRegistry"],
        ["usageCounter", "batchVerifier", "batchVerifier"],
        ["batchVerifier", "usageCounter", "usageCounter"],
        ["batchVerifier", "clauseRegistry", "clauseRegistry"],
        ["rpgfMinter", "florin", "florinToken"],
        ["rpgfMinter", "counter", "usageCounter"],
        ["rpgfMinter", "clauses", "clauseRegistry"],
        ["rpgfMinter", "assemblies", "assemblyRegistry"],
        ["witnessSwapAndCommitCoordinator", "figaroCore", "figaroCore"],
        ["witnessSwapAndCommitCoordinator", "permit2", "permit2"],
        ["witnessSwapAndCommitCoordinator", "router", "swapRouter"],
    ];
    // A link the expectations file lists under "links" must read as that
    // literal instead of the record's address — the stated divergence (on
    // Sepolia, rpgfMinter.counter keeps the counter it was deployed with
    // across a pair redeploy: minter registration is renounced).
    const linkOverrides = expected.links ?? {};
    for (const [from, getter, to] of links) {
        const override = linkOverrides[`${from}.${getter}`];
        if (override !== undefined) {
            if (!record[from]) { bad(`${from}.${getter}()`, `the record lacks ${from}`); continue; }
            const got = await read(record[from], getter);
            if (same(got, override)) ok(`${from}.${getter}() is the stated divergence ${override}`);
            else bad(`${from}.${getter}()`, `reads ${got}, the stated divergence is ${override}`);
            continue;
        }
        if (!record[from] || !record[to]) { bad(`${from}.${getter}()`, `the record lacks ${record[from] ? to : from}`); continue; }
        const got = await read(record[from], getter);
        if (same(got, record[to])) ok(`${from}.${getter}() is ${to}`);
        else bad(`${from}.${getter}()`, `reads ${got}, the record's ${to} is ${record[to]}`);
    }

    const e = expected;
    console.log("\nThe batch verifier");
    await expectValue("batchVerifier.programVKey()", e.batchVerifier?.programVKey, await read(record.batchVerifier, "programVKey"));
    await expectValue("batchVerifier.verifier() (the SP1 gateway)", e.batchVerifier?.verifier, await read(record.batchVerifier, "verifier"));

    console.log("\nThe registries' fixed parameters");
    await expectValue("membersRegistry.registrationDeposit()", e.registries?.membersRegistrationDeposit, String(await read(record.membersRegistry, "registrationDeposit")));
    await expectValue("membersRegistry.withdrawalCooldown()", e.registries?.membersWithdrawalCooldown, String(await read(record.membersRegistry, "withdrawalCooldown")));
    await expectValue("clauseRegistry.registrationDeposit()", e.registries?.clauseRegistrationDeposit, String(await read(record.clauseRegistry, "registrationDeposit")));
    await expectValue("assemblyRegistry.registrationDeposit()", e.registries?.assemblyRegistrationDeposit, String(await read(record.assemblyRegistry, "registrationDeposit")));

    console.log("\nThe usage counter and the reward minter");
    const u = e.usageCounter ?? {};
    await expectValue("usageCounter.minSellers()", u.minSellers, String(await read(record.usageCounter, "minSellers")));
    const periods = await read(record.usageCounter, "periodCount");
    await expectValue("usageCounter.periodCount()", u.periodCount, String(periods));
    await expectValue("usageCounter.provenanceClause()", u.provenanceClause === undefined ? null : keyOf(u.provenanceClause), await read(record.usageCounter, "provenanceClause"));
    for (const ref of u.excluded ?? []) {
        await expectValue(`usageCounter excludes ${ref}`, true, await read(record.usageCounter, "excludedClauseOrAssembly", [keyOf(ref)]));
    }
    for (const ref of u.notExcluded ?? []) {
        await expectValue(`usageCounter scores ${ref}`, false, await read(record.usageCounter, "excludedClauseOrAssembly", [keyOf(ref)]));
    }
    const minterPeriods = await read(record.rpgfMinter, "periodCount");
    let sum = 0n;
    for (let i = 0n; i < minterPeriods; i++) sum += await read(record.rpgfMinter, "periodAmount", [i]);
    await expectValue("rpgfMinter's period amounts, summed", e.rpgfMinter?.periodAmountSum, String(sum));

    console.log("\nThe florin genesis");
    const f = e.florin ?? {};
    await expectValue("florin.deployerMintRenounced()", f.deployerMintRenounced, await read(record.florinToken, "deployerMintRenounced"));
    await expectValue("florin.totalSupply()", f.totalSupply, String(await read(record.florinToken, "totalSupply")));
    const [rpgfCap] = await read(record.florinToken, "minters", [record.rpgfMinter]);
    await expectValue("florin.minters(rpgfMinter).cap", f.rpgfMinterCap, String(rpgfCap));
    for (const [holder, amount] of Object.entries(f.balances ?? {})) {
        const r = resolveAddress({ wallet: holder }, holder);
        if (r.undecided) { bad(`florin.balanceOf(${holder})`, `not decided — wallet "${holder}" has no address`); continue; }
        if (r.error) { bad(`florin.balanceOf(${holder})`, r.error); continue; }
        await expectValue(`florin.balanceOf(${holder})`, amount, String(await read(record.florinToken, "balanceOf", [r.address])));
    }

    console.log("\nWho registered each clause");
    const plan = e.registrations;
    if (!plan) {
        bad("registrations", "not decided — the expectations file names no registration plan");
    } else {
        // Every spec in clauses/ is a protocol clause: the plan names an owner
        // for some and a default for the rest.
        const specs = fs.readdirSync(path.join(root, "clauses")).filter((f) => f.endsWith(".json"))
            .map((f) => JSON.parse(fs.readFileSync(path.join(root, "clauses", f), "utf8")));
        for (const spec of specs) {
            const ref = `${spec.clauseId}@${spec.version}`;
            const owner = plan.byClause?.[spec.clauseId] ?? plan.default;
            const [registeredBy, withdrawn] = await read(record.clauseRegistry, "depositOf", [clauseKey(spec.clauseId, spec.version)]);
            if (registeredBy === "0x0000000000000000000000000000000000000000") { bad(`${ref} registered`, "not registered"); continue; }
            if (withdrawn) { bad(`${ref} registered`, "its deposit is withdrawn"); continue; }
            await expectValue(`${ref} registered by ${owner}`, { wallet: owner }, registeredBy);
        }
    }

    console.log(`\n${passed} held, ${failures.length} did not.`);
    if (failures.length) {
        console.log("\nWhat does not hold:");
        for (const f of failures) console.log(`  - ${f}`);
        process.exit(1);
    }
}

main().catch((err) => {
    console.error(`check-deployment: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
});
