#!/usr/bin/env node
// scripts/check-sp1-advisories.mjs against the fixtures in
// test/fixtures/sp1-advisories/ (no network):
//
//   node --test scripts/test-check-sp1-advisories.mjs
//
// The fixture advisories are two of SP1's published advisories in the API's
// shape: GHSA-p7v2-jjv3-8p8f, which names sp1_prover, sp1_hypercube and
// sp1_sdk at ">= 6.0.0, <= 6.8.0" (fixed at 6.8.1), and GHSA-6248-228x-mmvh,
// which names no package at "< 5.0.0".
//
// Cases: the fixture lock (6.8.0, one patch below the fix) fails the check;
// the same lock moved to the fixed version passes; an underscore name matches
// a hyphen pin; an entry with no package name applies to every sp1 pin; the
// range reader keeps both bounds and both spacings the API writes.

import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sp1Pins, inRange, affectedPins } from "./check-sp1-advisories.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts/check-sp1-advisories.mjs");
const FIX = path.join(ROOT, "test/fixtures/sp1-advisories");
const LOCK = path.join(FIX, "Cargo.lock");
const ADVISORIES = path.join(FIX, "advisories.json");

const run = (lock) =>
    spawnSync(process.execPath, [SCRIPT, "--lock", lock, "--advisories", ADVISORIES], { encoding: "utf8" });

test("a pin one patch below the fixed version fails", () => {
    const r = run(LOCK);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /AFFECTED: sp1-sdk 6\.8\.0 is in GHSA-p7v2-jjv3-8p8f/);
    assert.match(r.stderr, /AFFECTED: sp1-prover 6\.8\.0 is in GHSA-p7v2-jjv3-8p8f/);
});

test("the same lock at the fixed version passes", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sp1-adv-"));
    const fixed = path.join(dir, "Cargo.lock");
    fs.writeFileSync(fixed, fs.readFileSync(LOCK, "utf8").replaceAll('version = "6.8.0"', 'version = "6.8.1"'));
    const r = run(fixed);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /no pinned sp1 crate is in an affected range/);
});

test("only sp1 crates are read from the lock", () => {
    const pins = sp1Pins(fs.readFileSync(LOCK, "utf8"));
    assert.deepEqual(pins.map((p) => p.name).sort(), ["sp1-prover", "sp1-sdk"]);
});

test("an entry with no package name applies to every sp1 pin", () => {
    const advisories = JSON.parse(fs.readFileSync(ADVISORIES, "utf8"));
    const hits = affectedPins([{ name: "sp1-zkvm", version: "4.2.0" }], advisories);
    assert.deepEqual(hits.map((h) => h.ghsa), ["GHSA-6248-228x-mmvh"]);
    assert.equal(affectedPins([{ name: "sp1-zkvm", version: "5.0.0" }], advisories).length, 0);
});

test("the range reader", () => {
    assert.equal(inRange("6.8.0", ">= 6.0.0, <= 6.8.0"), true);
    assert.equal(inRange("6.8.1", ">= 6.0.0, <= 6.8.0"), false);
    assert.equal(inRange("5.9.9", ">= 6.0.0, <= 6.8.0"), false);
    assert.equal(inRange("6.0.1", "<6.0.2"), true);
    assert.equal(inRange("6.0.2", "<6.0.2"), false);
    assert.equal(inRange("6.0.0", "= 6.0.0"), true);
    assert.equal(inRange("6.0.0-rc.1", "< 6.0.0"), true);
    assert.throws(() => inRange("6.0.0", ""));
});
