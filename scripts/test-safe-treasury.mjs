// test-safe-treasury.mjs — the treasury Safe's address and its stated shape.
//
//   node --test scripts/test-safe-treasury.mjs
//
// The address is derived as Safe's factory derives it. Both vectors below are
// the factory's own answers: `createProxyWithNonce` called read-only on the
// published factory on Sepolia with these owners, this threshold and this
// salt. The creation code is the factory's `proxyCreationCode()`, kept in
// scripts/fixtures and held to the published hash. Cases: the two vectors; a
// changed owner, threshold or salt moves the address; an owner is a wallet
// the file names or an address; a missing block, an unnamed owner, a repeated
// owner, a threshold out of range and a salt that is no decimal are refused.

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256 } from "viem";
import { SAFE_1_4_1, predictSafeAddress, resolveSafeSpec, setupInitializer } from "./safe-treasury.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const proxyCreationCode = fs.readFileSync(path.join(here, "fixtures/safe-proxy-creation-code-1.4.1.hex"), "utf8").trim();
const SALT = "53398024396778278514654654104326085161219145538666249498023220408953596548217";
const sepolia = JSON.parse(fs.readFileSync(path.join(here, "../deployments/11155111.expected.json"), "utf8"));

const derive = (spec) => predictSafeAddress({ proxyCreationCode, initializer: setupInitializer(spec), saltNonce: spec.saltNonce });
const plain = {
    owners: ["0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222", "0x3333333333333333333333333333333333333333"],
    threshold: 2,
    saltNonce: 0n,
};

test("the fixture is the published factory's creation code", () => {
    assert.equal(keccak256(proxyCreationCode), SAFE_1_4_1.proxyCreationCodeHash);
});

test("the derived address is the factory's own answer", () => {
    assert.equal(derive(plain), "0xa6EAf276d30568032eD8a2CAf1c3A195a3Ec8F20");
});

test("the Sepolia expectations give the Safe the factory gives for them", () => {
    const spec = resolveSafeSpec(sepolia);
    assert.equal(spec.error, undefined);
    assert.deepEqual(spec.owners, [sepolia.wallets.founder, sepolia.wallets.supporters, sepolia.wallets.deployer]);
    assert.equal(spec.threshold, 2);
    assert.equal(spec.saltNonce, BigInt(SALT));
    assert.equal(derive(spec), "0x0f222950011d0a37670d5290e04739491CEc7386");
});

test("an owner, the threshold and the salt each move the address", () => {
    const base = derive(plain);
    assert.notEqual(derive({ ...plain, owners: [...plain.owners.slice(0, 2), "0x4444444444444444444444444444444444444444"] }), base);
    assert.notEqual(derive({ ...plain, owners: [plain.owners[1], plain.owners[0], plain.owners[2]] }), base, "the owners' sequence is part of the setup");
    assert.notEqual(derive({ ...plain, threshold: 3 }), base);
    assert.notEqual(derive({ ...plain, saltNonce: 1n }), base);
});

test("an owner is a wallet the file names, or an address", () => {
    const expected = { wallets: { founder: plain.owners[0] }, treasurySafe: { owners: ["founder", plain.owners[1]], threshold: 1, saltNonce: "7" } };
    assert.deepEqual(resolveSafeSpec(expected), { owners: [plain.owners[0], plain.owners[1]], threshold: 1, saltNonce: 7n });
});

test("a Safe the file does not state whole is refused", () => {
    const wallets = { a: plain.owners[0], b: plain.owners[1], vault: { record: "daoTreasury" } };
    const refused = (treasurySafe, pattern) => assert.match(resolveSafeSpec({ wallets, treasurySafe }).error, pattern);
    assert.match(resolveSafeSpec({ wallets }).error, /states no "treasurySafe"/);
    refused({ owners: [], threshold: 1, saltNonce: "0" }, /not a list of owners/);
    refused({ owners: ["a", "nobody"], threshold: 1, saltNonce: "0" }, /"nobody" is neither an address nor a wallet/);
    refused({ owners: ["a", "vault"], threshold: 1, saltNonce: "0" }, /"vault" is neither an address nor a wallet/);
    refused({ owners: ["a", plain.owners[0].toUpperCase().replace("0X", "0x")], threshold: 1, saltNonce: "0" }, /one address twice/);
    refused({ owners: ["a", "b"], threshold: 3, saltNonce: "0" }, /not between 1 and the 2 owner/);
    refused({ owners: ["a", "b"], threshold: 0, saltNonce: "0" }, /not between 1 and the 2 owner/);
    refused({ owners: ["a", "b"], threshold: 1, saltNonce: 5 }, /not a decimal string/);
    refused({ owners: ["a", "b"], threshold: 1, saltNonce: "0x05" }, /not a decimal string/);
});
