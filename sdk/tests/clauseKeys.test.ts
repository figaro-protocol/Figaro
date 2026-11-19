/**
 * The cross-language clause-key vector: `test/fixtures/clause-keys.json` maps
 * every `clauses/<name>.json` to its key — keccak256 of the canonical bytes of
 * the spec without its top-level `block` (`computeClauseKey`). The Rust
 * canonicalization is pinned to it on its side; this suite pins the SDK's and
 * is the fixture's one harvest path (`HARVEST_CLAUSE_KEYS=1`).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { keccak256, toBytes, type Hex } from "viem";
import { agreementLeaves, canonicalize } from "../src/agreement.js";
import { agreementHashOf, resolveAuthoredClauseKeys, type RegisteredAgreement } from "../src/assembly.js";
import { computeClauseKey } from "../src/discovery.js";
import { buildOrderAgreement } from "../src/projection.js";
import { rawSpecOf, specSourceOf, viewOf } from "./specFixtures.js";

const CLAUSES_DIR = path.resolve(__dirname, "../../clauses");
const FIXTURE = path.resolve(__dirname, "../../test/fixtures/clause-keys.json");

function harvest(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const file of readdirSync(CLAUSES_DIR).filter((f) => f.endsWith(".json")).sort()) {
        out[file.replace(/\.json$/, "")] = computeClauseKey(JSON.parse(readFileSync(path.join(CLAUSES_DIR, file), "utf8")));
    }
    return out;
}

describe("clause keys — test/fixtures/clause-keys.json", () => {
    it("every clause's key is keccak256 of the canonical bytes of its spec without `block`, and the fixture holds them", () => {
        const keys = harvest();
        if (process.env.HARVEST_CLAUSE_KEYS === "1") writeFileSync(FIXTURE, `${JSON.stringify(keys, null, 4)}\n`);
        for (const [name, key] of Object.entries(keys)) {
            const { block: _block, ...protocol } = JSON.parse(readFileSync(path.join(CLAUSES_DIR, `${name}.json`), "utf8"));
            expect(key).toBe(keccak256(toBytes(canonicalize(protocol))));
        }
        expect(JSON.parse(readFileSync(FIXTURE, "utf8"))).toEqual(keys);
    });
});

// The canonical form's number and key rules, pinned by one key in both
// languages: `test/fixtures/clause-key-canonical-form.json` holds floats,
// integers above 2^53 and index-like keys. `JSON.parse` reads every number as
// a double and `JSON.stringify` writes it as `Number.prototype.toString` does;
// an object's array-index keys come first, in numeric order. The Rust leg is
// `the_canonical_form_vector_hashes_to_the_sdk_key` in
// prover/script/tests/clause_keys.rs, with the same key.
describe("clause keys — the canonical form's numbers and index-like keys", () => {
    const VECTOR = path.resolve(__dirname, "../../test/fixtures/clause-key-canonical-form.json");
    const KEY = "0xb63f111646773cc201705869797963e352d7e816b9d4b365315115f330916d1a";

    it("gives one key, the Rust tests' key", () => {
        const spec = JSON.parse(readFileSync(VECTOR, "utf8"));
        expect(computeClauseKey(spec)).toBe(KEY);
        const { block: _block, ...protocol } = spec;
        const bytes = canonicalize(protocol);
        expect(bytes).toContain('"stages":{"0":[');
        expect(bytes).toContain('"x-indexed":{"2":5,"10":2,"4294967294":7,"-1":8,"02":4,"4294967295":6,"a":3,"b":1}');
        expect(bytes).toContain(
            '"x-numbers":[0.1,2.5,100,123456789.125,1.5e-7,0.000001,1e+21,1e-7,1.23e+22,9007199254740992,'
            + '18446744073709552000,18446744073709552000,1.7976931348623157e+308,5e-324,0,-42,-9007199254740992]',
        );
    });
});

describe("the clause key covers the protocol half of a spec and leaves `block` out", () => {
    // The reference agreement `agreements/counter-sale.json` and the three
    // clauses it composes. `figaro-geolocation` is the clause whose `block` is
    // edited: it carries a design fill and a runtime interaction.
    const NAMES = ["figaro-commerce", "figaro-geolocation", "figaro-modalities"] as const;
    const AUTHORED = JSON.parse(readFileSync(path.resolve(__dirname, "../../agreements/counter-sale.json"), "utf8"));
    const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
    const SELLER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;

    /** The registered agreement, its order agreement and the clause keys, for one set of specs. */
    function hashesOf(raws: readonly Record<string, unknown>[]) {
        const specs = specSourceOf(raws.map(viewOf));
        const registered = resolveAuthoredClauseKeys(AUTHORED, specs) as RegisteredAgreement;
        const values = { ...(registered.clauses as Record<Hex, Record<string, unknown>>) };
        const geo = computeClauseKey(raws[1]);
        values[geo] = { ...values[geo], geocoder: "nominatim", origin: "u0m6", destination: "u0m7" };
        const { agreement, checkoutHash } = buildOrderAgreement(BUYER, SELLER, values, specs);
        return {
            keys: raws.map((raw) => computeClauseKey(raw)),
            agreementHash: agreementHashOf(registered),
            leaves: agreementLeaves(agreement),
            checkoutHash,
        };
    }

    const original = NAMES.map(rawSpecOf);
    const before = hashesOf(original);

    /** `figaro-geolocation` with one edit applied to a deep copy. */
    function editedGeo(edit: (spec: Record<string, any>) => void): Record<string, unknown>[] {
        const copy = structuredClone(original) as Record<string, any>[];
        edit(copy[1]);
        return copy;
    }

    it.each([
        ["design: the article (one of the six attributes the SDK reads)", (s: Record<string, any>) => { s.block.design.article = "another-article"; }],
        ["design: the design fills (one of the six)", (s: Record<string, any>) => { s.block.design.fills = []; }],
        ["checkout: the profile fills (one of the six)", (s: Record<string, any>) => { s.block.checkout.profileFills = ["geocoder"]; }],
        ["runtime: the interaction", (s: Record<string, any>) => { s.block.runtime.interaction = null; }],
        ["the whole block removed", (s: Record<string, any>) => { delete s.block; }],
    ])("an edit to `block` (%s) changes no key, no leaf and no hash", (_label, edit) => {
        const edited = editedGeo(edit);
        expect(canonicalize(edited[1])).not.toBe(canonicalize(original[1]));
        expect(hashesOf(edited)).toEqual(before);
    });

    it.each([
        ["the title", (s: Record<string, any>) => { s.title = "Another title"; }],
        ["a field's type", (s: Record<string, any>) => { s.fields[1].type = "integer"; }],
    ])("an edit to a top-level attribute (%s) changes the key", (_label, edit) => {
        const edited = editedGeo(edit);
        expect(computeClauseKey(edited[1])).not.toBe(before.keys[1]);
    });

    it("the key is keccak256 of the canonical bytes of the spec without its top-level `block`", () => {
        const { block: _block, ...protocol } = original[1];
        expect(before.keys[1]).toBe(keccak256(toBytes(canonicalize(protocol))));
        expect(before.keys[1]).not.toBe(keccak256(toBytes(canonicalize(original[1]))));
    });
});
