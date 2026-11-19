#!/usr/bin/env node
// The members part of scripts/check-deployment.mjs, run against a stand-in for
// the chain read (no node needed), over the real files in members/.
//
//   node --test scripts/test-check-deployment-members.mjs
//
// Cases: every planned member holds; a wallet with no live stake, a profile
// whose pinned name differs, and a registered vault each fail; a plan naming
// the vault as the DAO's wallet fails; a profile file naming another subject
// fails; a name with no file fails; an unread profile still holds, with a note.

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { checkMembers, plannedMembers, MEMBERS_DIR } from "./check-deployment-members.mjs";

const OPERATOR = "0x2222222222222222222222222222222222222222";
const VAULT = "0x3333333333333333333333333333333333333333";
const subjectOf = (f) => JSON.parse(fs.readFileSync(path.join(MEMBERS_DIR, `${f}.json`), "utf8")).subjectAddress;
const FOUNDER = subjectOf("founder");
const DEPLOYER = subjectOf("deployer");
const WALLETS = { founder: FOUNDER, daoOperator: OPERATOR, daoVault: VAULT, deployer: DEPLOYER };
const nameOf = (f) => JSON.parse(fs.readFileSync(path.join(MEMBERS_DIR, `${f}.json`), "utf8")).name;
const PLAN = { members: { founder: "founder", dao: "daoOperator", deployer: "deployer" } };

/** A chain where `members` maps lower(address) → the profile name it pinned. */
async function run(plan, members, { gateway = true } = {}) {
    const passed = [];
    const failed = [];
    const notes = [];
    await checkMembers({
        planned: plannedMembers(plan),
        readRegistered: async (a) => members.has(a.toLowerCase()),
        readProfileURI: async (a) => (members.has(a.toLowerCase()) ? `ipfs://${a.toLowerCase()}` : null),
        readProfile: async (uri) => (gateway ? { name: members.get(uri.slice(7)) } : null),
        walletAddress: (n) => (WALLETS[n] ? { address: WALLETS[n] } : { undecided: true }),
        vaultAddress: VAULT,
        ok: (l) => passed.push(l),
        bad: (l, why) => failed.push(`${l}: ${why}`),
        note: (n) => notes.push(n),
    });
    return { passed, failed, notes };
}
const seeded = () => new Map([
    [FOUNDER.toLowerCase(), nameOf("founder")],
    [OPERATOR.toLowerCase(), nameOf("dao")],
    [DEPLOYER.toLowerCase(), nameOf("deployer")],
]);

test("every planned member holds, and the vault is no member", async () => {
    const { passed, failed } = await run(PLAN, seeded());
    assert.deepEqual(failed, []);
    assert.equal(passed.length, 4);
});

test("a wallet with no live stake fails", async () => {
    const m = seeded();
    m.delete(OPERATOR.toLowerCase());
    const { failed } = await run(PLAN, m);
    assert.equal(failed.length, 1);
    assert.match(failed[0], /member dao .*no live member stake/);
});

test("a pinned profile that is not the file's fails", async () => {
    const m = seeded();
    m.set(FOUNDER.toLowerCase(), "Someone else");
    const { failed } = await run(PLAN, m);
    assert.equal(failed.length, 1);
    assert.match(failed[0], /member founder .*"Someone else"/);
});

test("a vault holding a member stake fails", async () => {
    const m = seeded();
    m.set(VAULT.toLowerCase(), nameOf("dao"));
    const { failed } = await run(PLAN, m);
    assert.equal(failed.length, 1);
    assert.match(failed[0], /DAO vault is no member/);
});

test("a plan that gives the DAO's profile to the vault fails before any read", async () => {
    const { failed } = await run({ members: { dao: "daoVault" } }, seeded());
    assert.equal(failed.length, 1);
    assert.match(failed[0], /names the vault/);
});

test("a profile naming another subject than its planned wallet fails", async () => {
    const { failed } = await run({ members: { deployer: "founder" } }, seeded());
    assert.equal(failed.length, 1);
    assert.match(failed[0], /names subject/);
});

test("a name with no file in members/ fails", () => {
    assert.equal(plannedMembers({ members: { nobody: "founder" } }).errors.length, 1);
});

test("with no gateway the content is not compared, and a note says so", async () => {
    const { passed, failed, notes } = await run(PLAN, seeded(), { gateway: false });
    assert.deepEqual(failed, []);
    assert.equal(passed.length, 4);
    assert.equal(notes.length, 3);
});
