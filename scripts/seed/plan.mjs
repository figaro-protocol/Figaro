#!/usr/bin/env node
// The registration plan of one chain, read from its expectations file and the
// files it names — the written plan the maintainer reviews before the first
// registration (docs/RELEASE_READINESS.md Task 13, rule 1), and the values
// scripts/seed/seed.sh reads from it, so the seeding takes every chain value
// from the chain's own files and none from this repository's code.
//
//   node scripts/seed/plan.mjs <record.json> <expected.json>            the written plan
//   node scripts/seed/plan.mjs <record.json> <expected.json> --get <what>
//
// <what> is one of:
//   clauses-for <wallet>   the clauses the plan gives <wallet>, as name@version, comma-separated
//   wallet <wallet>        the wallet's address (a literal, or the record's address it names)
//   member-wallet <file>   the wallet the plan registers members/<file>.json from
//   assembly-token         the token the reference assemblies' denomination pin is filled with
//
// The plan's keys are derived the way the seeding derives them: a clause's
// from its spec (`computeClauseKey`), an agreement's and an assembly's by
// scripts/check-deployment-registrars.mjs, which scripts/check-deployment.mjs
// holds the chain to after the seeding.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeClauseKey } from "../../sdk/dist/discovery.js";
import { plannedRegistrations } from "../check-deployment-registrars.mjs";
import { plannedMembers } from "../check-deployment-members.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The wallet name's address: `{ address }` or `{ error }`. */
export function walletAddress(expected, record, name) {
    const spec = expected.wallets?.[name];
    if (spec === undefined || spec === null) return { error: `the expectations file names no wallet "${name}"` };
    if (typeof spec === "string") return { address: spec };
    if (spec.record) {
        return record[spec.record] ? { address: record[spec.record] } : { error: `wallet "${name}" is the record's "${spec.record}", which this record does not name` };
    }
    return { error: `wallet "${name}" is unreadable: ${JSON.stringify(spec)}` };
}

/** Every spec in clauses/ with the wallet the plan gives it. */
export function clausePlan(expected) {
    const plan = expected.registrations ?? {};
    return fs.readdirSync(path.join(root, "clauses")).filter((f) => f.endsWith(".json")).sort().map((f) => {
        const spec = JSON.parse(fs.readFileSync(path.join(root, "clauses", f), "utf8"));
        return { ref: `${spec.clauseId}@${spec.version}`, key: computeClauseKey(spec), wallet: plan.byClause?.[spec.clauseId] ?? plan.default };
    });
}

function writtenPlan(expected, record) {
    const lines = [];
    const addr = (w) => { const a = walletAddress(expected, record, w); return a.address ?? `(${a.error})`; };
    lines.push(`Registration plan for chain ${record.chainId} (${expected.registrations ? "from the expectations file" : "the expectations file names none"})`);
    lines.push("", "Clauses — key, spec, registrar:");
    for (const c of clausePlan(expected)) lines.push(`  ${c.key}  ${c.ref}  ${c.wallet} ${addr(c.wallet)}`);
    const r = plannedRegistrations(expected.registrations ?? {});
    lines.push("", "Agreements — key, file, registrar:");
    for (const a of r.agreements) lines.push(`  ${a.key}  agreements/${a.name}.json  ${a.wallet} ${addr(a.wallet)}`);
    lines.push("", `Assemblies — key, file, registrar (denomination pin filled with ${expected.registrations?.assemblyToken ?? "(no token named)"}):`);
    for (const a of r.assemblies) lines.push(`  ${a.key}  assemblies/${a.name}.json  ${a.wallet} ${addr(a.wallet)}`);
    const m = plannedMembers(expected.registrations ?? {});
    lines.push("", "Member profiles — file, wallet (each registers from its own wallet):");
    for (const x of m.members) lines.push(`  members/${x.name}.json  ${x.wallet} ${addr(x.wallet)}`);
    const errors = [...r.errors, ...m.errors];
    if (errors.length) lines.push("", "Not decided:", ...errors.map((e) => `  - ${e}`));
    return { text: lines.join("\n"), errors };
}

function main() {
    const [recordPath, expectedPath, flag, what, arg] = process.argv.slice(2);
    if (!recordPath || !expectedPath) {
        console.error("usage: plan.mjs <record.json> <expected.json> [--get <what> [<arg>]]");
        process.exit(2);
    }
    const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
    const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"));
    if (record.chainId !== expected.chainId) {
        console.error(`the record is chain ${record.chainId}, the expectations file chain ${expected.chainId}`);
        process.exit(1);
    }
    const die = (why) => { console.error(why); process.exit(1); };
    if (flag !== "--get") {
        const { text, errors } = writtenPlan(expected, record);
        console.log(text);
        process.exit(errors.length ? 1 : 0);
    }
    switch (what) {
        case "clauses-for":
            console.log(clausePlan(expected).filter((c) => c.wallet === arg).map((c) => c.ref).join(","));
            break;
        case "wallet": {
            const a = walletAddress(expected, record, arg);
            if (a.error) die(a.error);
            console.log(a.address);
            break;
        }
        case "member-wallet": {
            const w = expected.registrations?.members?.[arg];
            if (!w) die(`the plan registers no members/${arg}.json`);
            console.log(w);
            break;
        }
        case "assembly-token": {
            const t = expected.registrations?.assemblyToken;
            if (!t) die("the plan names no registrations.assemblyToken");
            console.log(t);
            break;
        }
        default:
            die(`unknown --get ${what}`);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
