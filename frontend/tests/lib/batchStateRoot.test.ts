/**
 * batchStateRoot.test.ts — the TypeScript port of the guest's state root
 * (`prover/lib/src/state.rs::KernelState::compute_root`), locked against the
 * Rust.
 *
 * The vectors below were printed by the Rust itself: a scratch crate outside
 * the repo, depending on `prover/lib` by path, built a `KernelState`, printed
 * `serde_json::to_string(&state.to_snapshot())` — the exact body the relay's
 * `GET /state` serves (`prover/sequencer/src/api.rs::get_state`) — and
 * `state.compute_root()`. Regenerating them from TypeScript would make this
 * test check itself; they must always come from the Rust.
 *
 * The genesis root is also the `prev_state_root` of batch 1 in the real relay
 * payload `batchRelay.test.ts` carries — a second, independent witness.
 */
import { describe, it, expect } from "vitest";
import {
    computeKernelStateRoot,
    parseKernelStateSnapshot,
} from "@/lib/audit/batchStateRoot";

const GENESIS_ROOT = "0xff7e8244f53ff09e5b59c85232fc6494f3c1987239148e9b496f127e3a90c848";
const GENESIS_JSON =
    '{"processes":[],"order_status":[],"order_process_id":[],"usage_counted":[],"usage_seller_seen":[],"usage_accrual":[]}';

const FIXTURE_ROOT = "0xdb68d55bf839cfb758fbac240fcb517f98e8095540772a1a2d0cf86b22e1657e";
const FIXTURE_JSON =
    '{"processes":[["0x1111111111111111111111111111111111111111111111111111111111111111",{"root_buyer":"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","currency":"0xcccccccccccccccccccccccccccccccccccccccc","cumulative_value":"0x1bc16d674ec80000","active_order_count":0}],["0x2222222222222222222222222222222222222222222222222222222222222222",{"root_buyer":"0xabababababababababababababababababababab","currency":"0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd","cumulative_value":"0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","active_order_count":2}]],"order_status":[["0x0101010101010101010101010101010101010101010101010101010101010101",2],["0x0202020202020202020202020202020202020202020202020202020202020202",1],["0x0303030303030303030303030303030303030303030303030303030303030303",1]],"order_process_id":[["0x0101010101010101010101010101010101010101010101010101010101010101","0x1111111111111111111111111111111111111111111111111111111111111111"],["0x0202020202020202020202020202020202020202020202020202020202020202","0x2222222222222222222222222222222222222222222222222222222222222222"],["0x0303030303030303030303030303030303030303030303030303030303030303","0x2222222222222222222222222222222222222222222222222222222222222222"]],"usage_counted":[[0,"0x4444444444444444444444444444444444444444444444444444444444444444","0x1111111111111111111111111111111111111111111111111111111111111111"],[1,"0x4545454545454545454545454545454545454545454545454545454545454545","0x1111111111111111111111111111111111111111111111111111111111111111"]],"usage_seller_seen":[[0,"0x4444444444444444444444444444444444444444444444444444444444444444",3,"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]],"usage_accrual":[[[0,"0x4444444444444444444444444444444444444444444444444444444444444444",3],[1,1000000000000000000]],[[1,"0x4545454545454545454545454545454545454545454545454545454545454545",3],[18446744073709551615,9007199254740993]]]}';

const O1 = `0x${"01".repeat(32)}`;
const O2 = `0x${"02".repeat(32)}`;
const P1 = `0x${"11".repeat(32)}`;
const P2 = `0x${"22".repeat(32)}`;

describe("computeKernelStateRoot — the Rust vectors", () => {
    it("reproduces the genesis root", () => {
        expect(computeKernelStateRoot(parseKernelStateSnapshot(GENESIS_JSON))).toBe(GENESIS_ROOT);
    });

    it("reproduces the root of a state with every map populated", () => {
        expect(computeKernelStateRoot(parseKernelStateSnapshot(FIXTURE_JSON))).toBe(FIXTURE_ROOT);
    });

    it("reads each order's status and process from the preimage", () => {
        const snap = parseKernelStateSnapshot(FIXTURE_JSON);
        expect(snap.orderStatus.get(O1)).toBe(2);
        expect(snap.orderStatus.get(O2)).toBe(1);
        expect(snap.orderProcessId.get(O1)).toBe(P1);
        expect(snap.orderProcessId.get(O2)).toBe(P2);
        expect(snap.orderStatus.get(`0x${"09".repeat(32)}`)).toBeUndefined();
    });
});

describe("computeKernelStateRoot — the guest's canonical order", () => {
    it("hashes entries in key order whatever order the body lists them in, as BTreeMap does", () => {
        const body = JSON.parse(GENESIS_JSON) as Record<string, unknown[]>;
        const fixture = JSON.parse(FIXTURE_JSON) as Record<string, unknown[]>;
        // Every section reversed; amounts stay small enough for JSON.parse here.
        for (const k of ["processes", "order_status", "order_process_id", "usage_counted", "usage_seller_seen"]) {
            body[k] = [...fixture[k]].reverse();
        }
        body.usage_accrual = [];
        const reordered = JSON.stringify(body);
        const sorted = JSON.stringify({ ...body, ...Object.fromEntries(
            ["processes", "order_status", "order_process_id", "usage_counted", "usage_seller_seen"]
                .map((k) => [k, fixture[k]]),
        ) });
        expect(computeKernelStateRoot(parseKernelStateSnapshot(reordered))).toBe(
            computeKernelStateRoot(parseKernelStateSnapshot(sorted)),
        );
    });

    it("reads a u64 above 2^53 exactly — a JSON.parse reading would change the root", () => {
        // 9007199254740993 is 2^53 + 1: as a JS number it collapses to 2^53.
        const collapsed = FIXTURE_JSON.replace("9007199254740993", "9007199254740992");
        expect(computeKernelStateRoot(parseKernelStateSnapshot(collapsed))).not.toBe(FIXTURE_ROOT);
        expect(computeKernelStateRoot(parseKernelStateSnapshot(FIXTURE_JSON))).toBe(FIXTURE_ROOT);
    });

    it("any changed status moves the root", () => {
        const flipped = FIXTURE_JSON.replace(`"${O2}",1]`, `"${O2}",2]`);
        expect(flipped).not.toBe(FIXTURE_JSON);
        expect(computeKernelStateRoot(parseKernelStateSnapshot(flipped))).not.toBe(FIXTURE_ROOT);
    });
});

describe("parseKernelStateSnapshot — refuses what the guest's types refuse", () => {
    it("refuses a body that is not JSON", () => {
        expect(() => parseKernelStateSnapshot("not json")).toThrow();
    });

    it("refuses a missing section", () => {
        expect(() => parseKernelStateSnapshot('{"processes":[]}')).toThrow(/order_status/);
    });

    it("refuses a 32-byte key of the wrong width", () => {
        expect(() =>
            parseKernelStateSnapshot(GENESIS_JSON.replace('"order_status":[]', '"order_status":[["0x01",1]]')),
        ).toThrow(/32-byte/);
    });

    it("refuses a status outside u8", () => {
        expect(() =>
            parseKernelStateSnapshot(FIXTURE_JSON.replace(`"${O2}",1]`, `"${O2}",256]`)),
        ).toThrow(/u8/);
    });

    it("refuses a fractional or exponent number rather than rounding it", () => {
        expect(() =>
            parseKernelStateSnapshot(FIXTURE_JSON.replace(`"${O2}",1]`, `"${O2}",1.0]`)),
        ).toThrow();
        expect(() =>
            parseKernelStateSnapshot(FIXTURE_JSON.replace(`"${O2}",1]`, `"${O2}",1e0]`)),
        ).toThrow();
    });
});
