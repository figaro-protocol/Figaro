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
// "treasurySafe" states the treasury's Safe by its owners, its threshold and a
// salt; the record's daoTreasury must be the address Safe's factory gives for
// them, and the Safe standing there must hold them (scripts/safe-treasury.mjs).
// A file without the key is the devnet's, whose treasury is a mock vault.
//
// "links" maps "<contract>.<getter>" to a literal address a wired link must
// read INSTEAD of the record's — a stated divergence, never a skip — or to
// "absent": the deployed contract predates the getter, so the read must
// revert (a stated divergence until that contract's redeploy).
//
// Checked, whatever the expectations: the RPC's chain is the record's; the
// checkout's HEAD builds what the record's `releaseCommit` builds, when the
// record names one (scripts/check-release-revision.mjs, cleanliness aside); every
// record address holds code; every contract-to-contract link the deploy wires
// reads back as the record's addresses. With --artifacts <dir> (a build with
// the deploy's settings: `forge build --via-ir`, at the release commit for
// mainnet), every contract's code must equal its compiled code, immutables
// masked.
//
// Exit 0 only when every check holds; every failure is printed, never only
// the first.
//
//   RPC_URL           the node (default http://127.0.0.1:8545)
//   IPFS_GATEWAY_URL  a gateway the member profiles are read through, to
//                     compare each pinned profile with its file in members/;
//                     unset, a member's stake and registration are checked and
//                     its content is not (the output says so)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createPublicClient, http, parseAbi, parseAbiItem } from "viem";
// The SDK's own clause key — keccak256 of the canonical bytes of the spec
// without its top-level `block`. Built output: run
// `npm run build` in sdk/ when dist/ is stale.
import { computeClauseKey } from "../sdk/dist/discovery.js";
import { checkRegistrars, plannedRegistrations } from "./check-deployment-registrars.mjs";
import { checkMembers, plannedMembers } from "./check-deployment-members.mjs";
import { checkReleaseRevision } from "./check-release-revision.mjs";
import { treasurySafe } from "./safe-treasury.mjs";
import { withUrlHosts } from "./url-host.mjs";

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
    processRegistry: "ProcessRegistry",
    agreementRegistry: "AgreementRegistry",
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
    "function processDesigns() view returns (address)",
    "function agreements() view returns (address)",
    "function batchVerifier() view returns (address)",
    "function usageCounter() view returns (address)",
    "function verifier() view returns (address)",
    "function verifierHash() view returns (bytes32)",
    "function routes(bytes4) view returns (address verifier, bool frozen)",
    "function programVKey() view returns (bytes32)",
    "function figaroCore() view returns (address)",
    "function permit2() view returns (address)",
    "function router() view returns (address)",
    "function florin() view returns (address)",
    "function counter() view returns (address)",
    "function provenanceLeaf() view returns (bytes32)",
    "function processTermsLeaf() view returns (bytes32)",
    "function processLeafDomain() view returns (bytes32)",
    "function minSellers() view returns (uint64)",
    "function periodCount() view returns (uint256)",
    "function periodAmount(uint256) view returns (uint256)",
    "function registrationDeposit() view returns (uint256)",
    "function withdrawalCooldown() view returns (uint256)",
    "function deployerMintRenounced() view returns (bool)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function minters(address) view returns (uint256 cap, uint256 minted)",
    "function depositOf(bytes32) view returns (address registeredBy, bool withdrawn)",
    "function registered(bytes32) view returns (bool)",
    "function bindings(bytes32) view returns (address registeredBy, uint64 registeredAt, bool withdrawn, string contentURI)",
]);
const read = (address, functionName, args = []) =>
    client.readContract({ address, abi: ABI, functionName, args });

/** ClauseRegistry's key for a spec: keccak256 of the canonical bytes of the
 *  spec without its top-level `block` (sdk `computeClauseKey`). */
const clauseKey = (spec) => computeClauseKey(spec);

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
/** The guest fingerprint of the sequencer this tree built, or null when no
 *  binary stands at prover/target/release/sequencer. The devnet's verifier
 *  pins it when the binary is present (scripts/deploy-local.sh exports it to
 *  Deploy.s.sol), so a relay can start against the devnet. */
function builtSequencerGuest() {
    const bin = path.join(root, "prover/target/release/sequencer");
    if (!fs.existsSync(bin)) return null;
    const run = spawnSync(bin, ["--vkey"], { encoding: "utf8" });
    const line = (run.stdout ?? "").split("\n").find((l) => l.startsWith("SP1_PROGRAM_VKEY="));
    return line ? line.slice("SP1_PROGRAM_VKEY=".length).trim() : null;
}

async function expectValue(label, spec, got) {
    if (spec === null || spec === undefined) return bad(label, "not decided — write the value in the expectations file before the deployment");
    if (typeof spec === "object" && spec.guest) {
        // `{ guest }`: the key the built sequencer carries when a binary is
        // present, else the stated constant (the devnet's rule).
        const built = builtSequencerGuest();
        const want = built ?? spec.guest;
        const which = built ? "the built sequencer's guest" : "the dev constant (no sequencer binary built)";
        return same(got, want) ? ok(`${label} is ${which} ${want}`) : bad(label, `reads ${got}, expected ${which} ${want}`);
    }
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

    // The record's `releaseCommit` is the revision the deploy wrapper was
    // guarded on (scripts/check-release-revision.mjs). The code below is
    // compared with --artifacts built from this checkout, so the checkout's
    // HEAD must build what that revision builds. A record written before the
    // wrappers recorded it names none, which is noted, never failed.
    console.log("\nThe release revision");
    if (!record.releaseCommit) {
        console.log("  · the record names no releaseCommit (written before the deploy wrappers recorded it)");
    } else {
        const rev = checkReleaseRevision({ repo: root, release: record.releaseCommit, requireClean: false });
        if (rev.holds) ok(`release revision ${record.releaseCommit}: HEAD ${rev.head} builds the same ${rev.compared.join(", ")}`);
        else bad(`release revision ${record.releaseCommit}`, rev.problems.join("; ").replace(/\n/g, " "));
    }

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
    if (!artifactsDir) bad("compiled code", "not compared — pass --artifacts <dir> (forge build --via-ir; at the release commit for mainnet)");

    console.log("\nThe links the deploy wires");
    const links = [
        ["attestationCoordinator", "core", "figaroCore"],
        ["usageCounter", "core", "figaroCore"],
        ["usageCounter", "members", "membersRegistry"],
        ["usageCounter", "clauses", "clauseRegistry"],
        ["usageCounter", "processDesigns", "processRegistry"],
        ["usageCounter", "agreements", "agreementRegistry"],
        ["usageCounter", "batchVerifier", "batchVerifier"],
        ["batchVerifier", "usageCounter", "usageCounter"],
        ["rpgfMinter", "florin", "florinToken"],
        ["rpgfMinter", "counter", "usageCounter"],
        ["rpgfMinter", "members", "membersRegistry"],
        ["rpgfMinter", "clauses", "clauseRegistry"],
        ["rpgfMinter", "processDesigns", "processRegistry"],
        ["rpgfMinter", "agreements", "agreementRegistry"],
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
            // "absent": the deployed contract predates the getter (a stated
            // divergence until its redeploy), so the read must fail, not answer.
            if (override === "absent") {
                // The getter must REVERT (no such function: the call returns no
                // data); an RPC failure is a failure of the check, never the divergence.
                let answered;
                try {
                    answered = await read(record[from], getter);
                } catch (err) {
                    const text = String(err?.shortMessage ?? err?.message ?? err);
                    if (!/returned no data|reverted|execution reverted/i.test(text)) throw err;
                    answered = undefined;
                }
                if (answered === undefined) ok(`${from}.${getter}() is absent — the stated divergence (the deployed ${from} predates it)`);
                else bad(`${from}.${getter}()`, `reads ${answered}, the stated divergence is that the getter is absent`);
                continue;
            }
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
    if (e.batchVerifier?.gateway) {
        // The verifier binds the ROUTED verifier, never the gateway (the constructor refuses a
        // gateway). What must hold: the gateway the expectations name routes this verifier's
        // selector — the first four bytes of its verifierHash() — to exactly the address bound.
        const bound = await read(record.batchVerifier, "verifier");
        const selector = (await read(record.batchVerifier, "verifierHash")).slice(0, 10);
        const [routed, frozen] = await read(e.batchVerifier.gateway, "routes", [selector]);
        if (same(bound, routed)) ok(`batchVerifier.verifier() is the verifier gateway ${e.batchVerifier.gateway} routes for selector ${selector}${frozen ? " (route frozen)" : ""}`);
        else bad("batchVerifier.verifier()", `binds ${bound}, but gateway ${e.batchVerifier.gateway} routes selector ${selector} to ${routed}`);
    } else {
        await expectValue("batchVerifier.verifier()", e.batchVerifier?.verifier, await read(record.batchVerifier, "verifier"));
    }

    console.log("\nThe registries' fixed parameters");
    await expectValue("membersRegistry.registrationDeposit()", e.registries?.membersRegistrationDeposit, String(await read(record.membersRegistry, "registrationDeposit")));
    await expectValue("membersRegistry.withdrawalCooldown()", e.registries?.membersWithdrawalCooldown, String(await read(record.membersRegistry, "withdrawalCooldown")));
    await expectValue("clauseRegistry.registrationDeposit()", e.registries?.clauseRegistrationDeposit, String(await read(record.clauseRegistry, "registrationDeposit")));
    await expectValue("processRegistry.registrationDeposit()", e.registries?.assemblyRegistrationDeposit, String(await read(record.processRegistry, "registrationDeposit")));
    await expectValue("agreementRegistry.registrationDeposit()", e.registries?.agreementRegistrationDeposit, String(await read(record.agreementRegistry, "registrationDeposit")));

    console.log("\nThe usage counter and the reward minter");
    const u = e.usageCounter ?? {};
    await expectValue("usageCounter.minSellers()", u.minSellers, String(await read(record.usageCounter, "minSellers")));
    const periods = await read(record.usageCounter, "periodCount");
    await expectValue("usageCounter.periodCount()", u.periodCount, String(periods));
    // The agreement format's reserved provenance leaf: a constant of the
    // counter, keccak256("figaro-agreement-provenance") — never a clause key.
    await expectValue("usageCounter.provenanceLeaf()", u.provenanceLeaf, await read(record.usageCounter, "provenanceLeaf"));
    // The assembly format's reserved terms leaf: a constant of the counter,
    // keccak256("figaro-assembly-terms") — never an agreementHash.
    await expectValue("usageCounter.processTermsLeaf()", u.processTermsLeaf, await read(record.usageCounter, "processTermsLeaf"));
    // The assembly tree's leaf domain: a constant of the counter,
    // keccak256("figaro-assembly-leaf") — a counter without it is in the old leaf shape.
    await expectValue("usageCounter.processLeafDomain()", u.processLeafDomain, await read(record.usageCounter, "processLeafDomain"));
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

    console.log("\nThe treasury's Safe");
    // The record's daoTreasury is checked against what the expectations file
    // states, never against itself: the address Safe's factory gives for the
    // stated owners, threshold and salt, and the Safe standing there.
    if (e.treasurySafe === undefined) {
        console.log("  · the expectations file has no treasurySafe: on this chain the treasury is not a Safe (the devnet's mock vault) — not checked");
    } else if (e.treasurySafe === null) {
        bad("treasurySafe", "not decided — the expectations file states no owners, threshold and salt");
    } else {
        const safe = await treasurySafe({ command: "check", expected: e, client });
        if (safe.address === undefined) {
            for (const why of safe.errors) bad("treasurySafe", why);
        } else {
            if (String(record.daoTreasury ?? "").toLowerCase() === safe.address.toLowerCase()) ok(`record.daoTreasury is the Safe the file states, ${safe.address}`);
            else bad("record.daoTreasury", `${record.daoTreasury} is not the Safe the file states, ${safe.address}`);
            if (safe.errors.length === 0) ok(`the Safe holds the stated owners and threshold`);
            for (const why of safe.errors) bad("the treasury's Safe", why);
        }
    }

    console.log("\nWho registered each clause");
    const plan = e.registrations;
    if (!plan) {
        bad("registrations", "not decided — the expectations file names no registration plan");
    } else {
        // Every spec in clauses/ is a protocol clause: the plan names an owner
        // for some, by the spec's own clauseId (the maintainer's authored
        // name), and a default for the rest. The key read on chain is derived
        // from the spec's canonical bytes without `block`, never from the name.
        const specs = fs.readdirSync(path.join(root, "clauses")).filter((f) => f.endsWith(".json"))
            .map((f) => JSON.parse(fs.readFileSync(path.join(root, "clauses", f), "utf8")));
        for (const spec of specs) {
            const ref = `${spec.clauseId}@${spec.version}`;
            const owner = plan.byClause?.[spec.clauseId] ?? plan.default;
            const key = clauseKey(spec);
            if (!(await read(record.clauseRegistry, "registered", [key]))) { bad(`${ref} registered`, `not registered (key ${key})`); continue; }
            const [registeredBy, withdrawn] = await read(record.clauseRegistry, "depositOf", [key]);
            if (registeredBy === "0x0000000000000000000000000000000000000000") { bad(`${ref} registered`, "not registered"); continue; }
            if (withdrawn) { bad(`${ref} registered`, "its deposit is withdrawn"); continue; }
            await expectValue(`${ref} registered by ${owner}`, { wallet: owner }, registeredBy);
        }
    }

    console.log("\nWho registered each named agreement and assembly");
    if (!plan?.agreements && !plan?.assemblies) {
        console.log("  · the expectations file names none under registrations.agreements or registrations.assemblies — not checked");
    } else {
        await checkRegistrars({
            planned: plannedRegistrations(plan, record),
            readBinding: (family, key) => read(family === "agreement" ? record.agreementRegistry : record.processRegistry, "bindings", [key]),
            walletAddress: (name) => resolveAddress({ wallet: name }, name),
            ok,
            bad,
        });
    }

    console.log("\nWho registered each named member profile");
    if (!plan?.members) {
        console.log("  · the expectations file names none under registrations.members — not checked");
    } else {
        const fromBlock = BigInt(record.deploymentBlock ?? 0);
        const MEMBER_EVENTS = [
            parseAbiItem("event MemberRegistered(address indexed member, string metadataURI)"),
            parseAbiItem("event MemberProfileUpdated(address indexed member, string metadataURI)"),
        ];
        const gateway = process.env.IPFS_GATEWAY_URL?.replace(/\/$/, "");
        const vault = resolveAddress({ wallet: "daoVault" }, "daoVault");
        await checkMembers({
            planned: plannedMembers(plan),
            // MembersRegistry.registered takes an address; the shared ABI's
            // `registered` is the clause registry's, over a key.
            readRegistered: (member) => client.readContract({
                address: record.membersRegistry, abi: parseAbi(["function registered(address) view returns (bool)"]),
                functionName: "registered", args: [member],
            }),
            readProfileURI: async (member) => {
                const logs = (await Promise.all(MEMBER_EVENTS.map((event) => client.getLogs({
                    address: record.membersRegistry, event, args: { member }, fromBlock,
                })))).flat().sort((x, y) => Number(x.blockNumber - y.blockNumber) || x.logIndex - y.logIndex);
                return logs.at(-1)?.args.metadataURI ?? null;
            },
            readProfile: async (uri) => {
                if (!gateway) return null;
                const res = await fetch(`${gateway}/ipfs/${uri.replace(/^ipfs:\/\//, "")}`);
                return res.ok ? res.json() : { name: `(the gateway answered ${res.status})` };
            },
            walletAddress: (name) => resolveAddress({ wallet: name }, name),
            vaultAddress: vault.address,
            ok,
            bad,
            note: (n) => console.log(`  · ${n}`),
        });
    }

    console.log(`\n${passed} held, ${failures.length} did not.`);
    if (failures.length) {
        console.log("\nWhat does not hold:");
        for (const f of failures) console.log(`  - ${f}`);
        process.exit(1);
    }
}

main().catch((err) => {
    // An RPC error quotes the endpoint, whose path or query can carry a key.
    console.error(`check-deployment: ${withUrlHosts(err instanceof Error ? err.message : String(err))}`);
    process.exit(1);
});
