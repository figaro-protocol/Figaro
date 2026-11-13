#!/usr/bin/env node
// The registrar part of scripts/check-deployment.mjs, run against a stand-in
// for the chain read (no node needed). Every case is read through the same
// `checkRegistrars` the command runs, with keys derived from the real files in
// agreements/ and assemblies/.
//
//   node --test scripts/test-check-deployment-registrars.mjs
//
// Cases: the right registrar holds; a wrong registrar, an unregistered key and
// a withdrawn deposit each fail, for an agreement and for an assembly; a name
// with no file fails; an assembly planned without its token fails.

import assert from "node:assert/strict";
import { test } from "node:test";
import { checkRegistrars, plannedRegistrations } from "./check-deployment-registrars.mjs";

const SEEDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const STRANGER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const TOKEN = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const ZERO = "0x0000000000000000000000000000000000000000";

const plan = {
    agreements: { "aerial-survey-flight": "seeder" },
    assemblies: { "aerial-survey": "seeder" },
    assemblyToken: TOKEN,
};

/** Run the check with a chain that holds `bindings` (key -> [registeredBy, registeredAt, withdrawn, uri]). */
async function run(planOverride, bindings) {
    const passed = [];
    const failed = [];
    await checkRegistrars({
        planned: plannedRegistrations(planOverride),
        readBinding: async (_family, key) => bindings.get(key) ?? [ZERO, 0n, false, ""],
        walletAddress: (name) => (name === "seeder" ? { address: SEEDER } : { undecided: true }),
        ok: (label) => passed.push(label),
        bad: (label, why) => failed.push(`${label}: ${why}`),
    });
    return { passed, failed };
}

const keysOf = () => {
    const p = plannedRegistrations(plan);
    return { agreement: p.agreements[0].key, assembly: p.assemblies[0].key };
};
const held = (by) => [by, 1n, false, "ipfs://x"];

test("the named registrar holds for an agreement and an assembly", async () => {
    const k = keysOf();
    const { passed, failed } = await run(plan, new Map([[k.agreement, held(SEEDER)], [k.assembly, held(SEEDER)]]));
    assert.deepEqual(failed, []);
    assert.equal(passed.length, 2);
});

test("a registrar other than the named wallet fails, for both families", async () => {
    const k = keysOf();
    const { passed, failed } = await run(plan, new Map([[k.agreement, held(STRANGER)], [k.assembly, held(STRANGER)]]));
    assert.equal(passed.length, 0);
    assert.equal(failed.length, 2);
    for (const f of failed) assert.match(f, /registered by 0x7099.*expected 0xf39F/i);
});

test("an unregistered key fails", async () => {
    const { failed } = await run(plan, new Map());
    assert.equal(failed.length, 2);
    for (const f of failed) assert.match(f, /not registered/);
});

test("a withdrawn deposit fails", async () => {
    const k = keysOf();
    const gone = [SEEDER, 1n, true, "ipfs://x"];
    const { failed } = await run(plan, new Map([[k.agreement, gone], [k.assembly, gone]]));
    assert.equal(failed.length, 2);
    for (const f of failed) assert.match(f, /withdrawn/);
});

test("a name with no file in agreements/ or assemblies/ fails", () => {
    const p = plannedRegistrations({ agreements: { nope: "seeder" }, assemblies: { nada: "seeder" }, assemblyToken: TOKEN });
    assert.equal(p.errors.length, 2);
});

test("an assembly planned without its token fails: its key depends on it", () => {
    const p = plannedRegistrations({ assemblies: { "aerial-survey": "seeder" } });
    assert.equal(p.assemblies.length, 0);
    assert.match(p.errors[0], /not decided/);
});

test("a wallet the expectations file does not define fails", async () => {
    const k = keysOf();
    const { failed } = await run({ ...plan, agreements: { "aerial-survey-flight": "ghost" } }, new Map([[k.agreement, held(SEEDER)], [k.assembly, held(SEEDER)]]));
    assert.equal(failed.length, 1);
    assert.match(failed[0], /not decided/);
});
