#!/usr/bin/env node
// The arithmetic and the source reads of scripts/gamma-point.mjs.
//
//   node --test scripts/test-gamma-point.mjs
//
// Cases: δ from the member stake, the wait and the period as
// script/DeployMainnet.s.sol deploys them, over ⌈L/T⌉ as § 7.1 writes it; γ in
// each regime on hand-worked numbers, the two branches meeting at 3g where
// δ = 2g, and the stake's doubling raising γ by 2^(2/3) past it (§ 7.3); the
// floor's s0 and entry price; a missing input refused; the relay's gas
// constants and the stream widths read as their source files declare them;
// the period read from each chain's deploy script.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
    DEPLOY_SCRIPTS,
    GAS_PLAN_FILE,
    GAS_PLAN_NAMES,
    STREAM_FILE,
    gammaPoint,
    marginalProcessGas,
    periodFromDeployScript,
    processStreamBytes,
    readExpectations,
    readGasInputs,
} from "./gamma-point.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const close = (a, b, rel = 1e-12) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const DAY = 86_400n;

test("δ is the member stake over ⌈L/T⌉: 0.05 ETH, 28 days, 365-day periods", () => {
    const D = 50_000_000_000_000_000n;
    const p = gammaPoint({ D, T: 28n * DAY, L: 365n * DAY, dMin: 3n, gWei: 1n });
    // 365/28 = 13.04, so one stake furnishes 14 identities in a period
    assert.equal(p.identitiesPerStake, 14);
    close(p.delta, 5e16 / 14);
});

test("the wait at or past the period makes δ the whole stake; no wait makes it vanish", () => {
    assert.equal(gammaPoint({ D: 100n, T: 400n, L: 365n, dMin: 1n, gWei: 1n }).delta, 100);
    assert.equal(gammaPoint({ D: 100n, T: 0n, L: 365n, dMin: 1n, gWei: 1n }).delta, 0);
});

test("δ ≤ 2g: γ = δ + g, one process per fabricated seller", () => {
    // D = 1, T = L, so δ = 1; g = 1
    const p = gammaPoint({ D: 1n, T: 10n, L: 10n, dMin: 3n, gWei: 1n });
    assert.equal(p.regime, "delta <= 2g");
    close(p.gamma, 2);
    close(p.processesPerIdentity, 1);
    close(p.s0, 3);
    close(p.entryPrice, 6);
    close(p.elasticity, 0.5);
});

test("δ > 2g: γ = 3·2^(-2/3)·δ^(2/3)·g^(1/3), worked at δ = 16, g = 1", () => {
    // n* = s(2g/δ)^(1/3) = s/2 and c* = s(δ/2g)^(2/3) = 4s, so C = 16·s/2 + 4s = 12s
    const p = gammaPoint({ D: 16n, T: 10n, L: 10n, dMin: 3n, gWei: 1n });
    assert.equal(p.regime, "delta > 2g");
    close(p.gamma, 12);
    close(p.processesPerIdentity, 4);
    close(p.s0, 3 * 2); // d_min · (δ/2g)^(1/3) = 3 · 2
    close(p.entryPrice, 3 * 17);
    close(p.elasticity, 2 / 3);
});

test("the branches meet at 3g where δ = 2g", () => {
    close(gammaPoint({ D: 2n, T: 1n, L: 1n, dMin: 1n, gWei: 1n }).gamma, 3);
    // just past 2g the interior branch is continuous with it
    close(gammaPoint({ D: 2_000_001n, T: 1n, L: 1n, dMin: 1n, gWei: 1_000_000n }).gamma, 3_000_000, 1e-6);
});

test("doubling the stake past 2g raises γ by 2^(2/3), about 59%", () => {
    const a = gammaPoint({ D: 16n, T: 1n, L: 1n, dMin: 1n, gWei: 1n }).gamma;
    const b = gammaPoint({ D: 32n, T: 1n, L: 1n, dMin: 1n, gWei: 1n }).gamma;
    close(b / a, 2 ** (2 / 3));
});

test("the capture curve is γ·S_h·φ/(1-φ)", () => {
    const p = gammaPoint({ D: 1n, T: 1n, L: 1n, dMin: 1n, gWei: 1n }); // γ = 2
    close(p.capture(0.5, 10), 20);
    close(p.capture(0.1), 2 / 9);
});

test("a missing input is refused, never guessed", () => {
    assert.throws(() => gammaPoint({ D: 1n, T: 1n, L: 1n, dMin: 1n }), /missing input: gWei/);
    assert.throws(() => gammaPoint({ D: 1n, T: 1n, dMin: 1n, gWei: 1n }), /missing input: L/);
    assert.throws(() => gammaPoint({ D: null, T: 1n, L: 1n, dMin: 1n, gWei: 1n }), /missing input: D/);
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? "/tmp"), "gamma-"));
    const file = path.join(dir, "1.expected.json");
    fs.writeFileSync(file, JSON.stringify({ chainId: 1, registries: { membersRegistrationDeposit: "1" }, usageCounter: {} }));
    assert.throws(() => readExpectations(file), /missing input: T, dMin/);
    fs.rmSync(dir, { recursive: true });
});

test("the expectations files carry D, T and d_min", () => {
    for (const id of [1, 11155111]) {
        const e = readExpectations(path.join(root, `deployments/${id}.expected.json`));
        const plan = JSON.parse(fs.readFileSync(path.join(root, `deployments/${id}.expected.json`), "utf8"));
        assert.equal(e.D, BigInt(plan.registries.membersRegistrationDeposit));
        assert.equal(e.T, BigInt(plan.registries.membersWithdrawalCooldown));
        assert.equal(e.dMin, BigInt(plan.usageCounter.minSellers));
    }
});

test("the gas constants are the ones their source files declare", () => {
    const { plan, stream } = readGasInputs();
    const rs = fs.readFileSync(path.join(root, GAS_PLAN_FILE), "utf8");
    for (const name of GAS_PLAN_NAMES) {
        const line = rs.split("\n").find((l) => l.includes(`const ${name}:`));
        assert.ok(line, `${GAS_PLAN_FILE} declares ${name}`);
        const literal = line.split("=")[1].replace(";", "").trim().replace(/_/g, "");
        assert.equal(plan[name], BigInt(literal), name);
    }
    const os = fs.readFileSync(path.join(root, STREAM_FILE), "utf8");
    for (const name of ["COMMITMENT_BYTES", "SIGNATURE_BYTES"]) {
        const line = os.split("\n").find((l) => l.includes(`const ${name}:`));
        const sum = line.split("=")[1].replace(";", "").split("+").reduce((a, t) => a + Number(t.trim()), 0);
        assert.equal(stream[name], BigInt(sum), name);
    }
});

test("g is the sum of what one process adds to a batch", () => {
    const inputs = readGasInputs();
    const { plan, stream } = inputs;
    const bytes = processStreamBytes(stream, 0n);
    assert.equal(bytes.commit, 1n + stream.COMMITMENT_BYTES + 2n * stream.SIGNATURE_BYTES);
    assert.equal(bytes.resolve, 35n + stream.SIGNATURE_BYTES + stream.COMMITMENT_BYTES);
    assert.equal(bytes.claim, 68n + stream.COMMITMENT_BYTES);
    assert.equal(processStreamBytes(stream, 3n).claim - bytes.claim, 96n);
    const g = marginalProcessGas(inputs, 0n);
    assert.equal(
        g.gas,
        bytes.total * plan.CALLDATA_NONZERO_BYTE_GAS +
            (bytes.total * plan.SETTLE_GAS_PER_STREAM_WORD + 31n) / 32n +
            plan.SETTLE_GAS_PER_STREAM_COMMIT +
            plan.SETTLE_GAS_PER_STREAM_RESOLVED_ORDER +
            plan.SETTLE_GAS_PER_STREAM_RESOLUTION +
            plan.SETTLE_GAS_PER_STREAM_CLAIM +
            plan.SETTLE_GAS_PER_USE,
    );
});

test("the period is read from each chain's deploy script", () => {
    for (const file of Object.values(DEPLOY_SCRIPTS)) {
        const seconds = periodFromDeployScript(file);
        assert.ok(seconds > 0n, file);
        assert.equal(seconds % 3_600n, 0n, file);
    }
});
