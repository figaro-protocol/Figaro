/**
 * lib/audit/batchStateRoot.ts — the batch path's state root, recomputed here
 * from the state a relay publishes.
 *
 * `FigaroBatchVerifier` stores one word, `stateRoot`. Its preimage is the
 * guest's mirror of FigaroCore's mappings (`prover/lib/src/state.rs`,
 * `KernelState`), and a relay serves that preimage whole at `GET /state` — the
 * body is `KernelStateSnapshot` exactly as `serde_json` writes it
 * (`prover/sequencer/src/api.rs::get_state`; `prover/lib/src/types.rs`). This
 * file is the TypeScript port of `KernelState::compute_root`, so a reader can
 * recompute the root from that body and hold it to the chain's, then read any
 * order's status out of the same body. With the whole preimage in hand, no
 * inclusion proof is needed.
 *
 * The port, section by section (`state.rs::compute_root`):
 *
 *   root = keccak256(processes_hash ‖ status_hash ‖ process_id_hash ‖ usage_hash)
 *
 *   processes_hash   keccak256 over each (processId, ProcessState), in key
 *                    order: processId(32) ‖ root_buyer as a 32-byte word ‖
 *                    currency as a 32-byte word ‖ cumulative_value (u256 BE) ‖
 *                    active_order_count as a u256 BE word.
 *   status_hash      keccak256 over each (orderHash, status): orderHash(32) ‖ status(1).
 *   process_id_hash  keccak256 over each (orderHash, processId): 32 ‖ 32.
 *   usage_hash       keccak256 over three length-prefixed sections, each
 *                    prefix a u64 BE count:
 *                      usage_counted      kind(1) ‖ clauseOrAssembly(32) ‖ processId(32)
 *                      usage_seller_seen  kind(1) ‖ clauseOrAssembly(32) ‖ period(1) ‖ seller(20)
 *                      usage_accrual      kind(1) ‖ clauseOrAssembly(32) ‖ period(1) ‖ c(u64 BE) ‖ d(u64 BE)
 *
 * "Key order" is the guest's: `KernelState` holds every section in a
 * `BTreeMap`/`BTreeSet`, so the root is over entries sorted by key bytes, a
 * repeated map key keeps its last value, and a repeated set entry counts once
 * (`KernelState::from_snapshot` collects the lists that way). Every key here
 * is fixed-width, so sorting its lowercase hex sorts its bytes.
 *
 * Exact integers: the body carries u64s as bare JSON numbers (`c` and `d`
 * reach 2^64 − 1), which `JSON.parse` would round past 2^53 and so move the
 * root. The body's integers are therefore lifted to strings before parsing and
 * read as bigint.
 *
 * Locked against the Rust by `tests/lib/batchStateRoot.test.ts`, whose vectors
 * the Rust printed.
 */

import { concat, keccak256, numberToHex, type Hex } from "viem";

/** `ProcessState` (`prover/lib/src/types.rs`). */
interface KernelProcessState {
    rootBuyer: string;
    currency: string;
    cumulativeValue: bigint;
    activeOrderCount: bigint;
}

/** `KernelStateSnapshot`, parsed, canonical, and keyed by lowercase hex. */
export interface KernelStateSnapshot {
    processes: Map<string, KernelProcessState>;
    /** orderHash → status: 1 committed, 2 resolved (`prover/lib/src/kernel.rs`). */
    orderStatus: Map<string, number>;
    /** orderHash → processId. */
    orderProcessId: Map<string, string>;
    /** Sorted `kind ‖ clauseOrAssembly ‖ processId` entries, as hex. */
    usageCounted: string[];
    /** Sorted `kind ‖ clauseOrAssembly ‖ period ‖ seller` entries, as hex. */
    usageSellerSeen: string[];
    /** `kind ‖ clauseOrAssembly ‖ period` → (c, d). */
    usageAccrual: Map<string, { c: bigint; d: bigint }>;
}

const U8_MAX = 0xffn;
const U64_MAX = 0xffff_ffff_ffff_ffffn;
const U256_MAX = (1n << 256n) - 1n;

/**
 * Lift every bare JSON integer outside a string into a string of its digits,
 * so the parse keeps it exact. A fraction or an exponent is refused: no field
 * of the guest's state is anything but an integer.
 */
function liftIntegers(text: string): string {
    let out = "";
    let inString = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i]!;
        if (inString) {
            out += ch;
            if (ch === "\\") {
                out += text[++i] ?? "";
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }
        if (ch === '"') {
            inString = true;
            out += ch;
            continue;
        }
        if (ch === "-" || (ch >= "0" && ch <= "9")) {
            let j = i + 1;
            while (j < text.length && /[0-9.eE+-]/.test(text[j]!)) j++;
            const token = text.slice(i, j);
            if (!/^(0|[1-9][0-9]*)$/.test(token)) {
                throw new Error(`state number ${token} is not a non-negative integer`);
            }
            out += `"${token}"`;
            i = j - 1;
            continue;
        }
        out += ch;
    }
    return out;
}

function fail(path: string, what: string): never {
    throw new Error(`/state ${path}: ${what}`);
}

function list(v: unknown, path: string): unknown[] {
    if (!Array.isArray(v)) fail(path, "expected a list");
    return v;
}

function tuple(v: unknown, n: number, path: string): unknown[] {
    const t = list(v, path);
    if (t.length !== n) fail(path, `expected ${n} elements, got ${t.length}`);
    return t;
}

function fixedHex(v: unknown, bytes: number, path: string): string {
    if (typeof v !== "string" || !new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(v)) {
        fail(path, `expected a ${bytes}-byte hex value, got ${JSON.stringify(v)}`);
    }
    return v.toLowerCase();
}

/** An integer the lift turned into a decimal string. */
function uint(v: unknown, max: bigint, name: string, path: string): bigint {
    if (typeof v !== "string" || !/^(0|[1-9][0-9]*)$/.test(v)) {
        fail(path, `expected a ${name} integer, got ${JSON.stringify(v)}`);
    }
    const n = BigInt(v);
    if (n > max) fail(path, `${v} exceeds ${name}`);
    return n;
}

/** `U256` as alloy serializes it: a hex quantity string. */
function u256(v: unknown, path: string): bigint {
    if (typeof v !== "string" || !/^0x(0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(v)) {
        fail(path, `expected a u256 hex quantity, got ${JSON.stringify(v)}`);
    }
    const n = BigInt(v);
    if (n > U256_MAX) fail(path, "exceeds u256");
    return n;
}

const byteHex = (n: bigint) => n.toString(16).padStart(2, "0");

/** A map with the BTreeMap's semantics: last value per key, sorted keys. */
function sortedMap<V>(entries: [string, V][]): Map<string, V> {
    const m = new Map<string, V>();
    for (const [k, v] of entries) m.set(k, v);
    return new Map([...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** A set with the BTreeSet's semantics: once per entry, sorted. */
function sortedSet(entries: string[]): string[] {
    return [...new Set(entries)].sort();
}

/**
 * Parse a relay's `GET /state` body into the guest's state. Throws, naming the
 * field, on anything the guest's types would not deserialize.
 */
export function parseKernelStateSnapshot(text: string): KernelStateSnapshot {
    let raw: unknown;
    try {
        raw = JSON.parse(liftIntegers(text));
    } catch (e) {
        throw new Error(`/state is not JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        fail("body", "expected an object");
    }
    const body = raw as Record<string, unknown>;
    const section = (name: string) => list(body[name], name);

    const processes = sortedMap(section("processes").map((e, i) => {
        const path = `processes[${i}]`;
        const [k, v] = tuple(e, 2, path);
        if (v === null || typeof v !== "object" || Array.isArray(v)) fail(path, "expected a ProcessState object");
        const ps = v as Record<string, unknown>;
        return [fixedHex(k, 32, path), {
            rootBuyer: fixedHex(ps.root_buyer, 20, `${path}.root_buyer`),
            currency: fixedHex(ps.currency, 20, `${path}.currency`),
            cumulativeValue: u256(ps.cumulative_value, `${path}.cumulative_value`),
            activeOrderCount: uint(ps.active_order_count, U64_MAX, "u64", `${path}.active_order_count`),
        }] as [string, KernelProcessState];
    }));

    const orderStatus = sortedMap(section("order_status").map((e, i) => {
        const path = `order_status[${i}]`;
        const [k, v] = tuple(e, 2, path);
        return [fixedHex(k, 32, path), Number(uint(v, U8_MAX, "u8", path))] as [string, number];
    }));

    const orderProcessId = sortedMap(section("order_process_id").map((e, i) => {
        const path = `order_process_id[${i}]`;
        const [k, v] = tuple(e, 2, path);
        return [fixedHex(k, 32, path), fixedHex(v, 32, path)] as [string, string];
    }));

    const usageCounted = sortedSet(section("usage_counted").map((e, i) => {
        const path = `usage_counted[${i}]`;
        const [kind, coa, pid] = tuple(e, 3, path);
        return `0x${byteHex(uint(kind, U8_MAX, "u8", path))}${fixedHex(coa, 32, path).slice(2)}${fixedHex(pid, 32, path).slice(2)}`;
    }));

    const usageSellerSeen = sortedSet(section("usage_seller_seen").map((e, i) => {
        const path = `usage_seller_seen[${i}]`;
        const [kind, coa, period, seller] = tuple(e, 4, path);
        return `0x${byteHex(uint(kind, U8_MAX, "u8", path))}${fixedHex(coa, 32, path).slice(2)}${byteHex(uint(period, U8_MAX, "u8", path))}${fixedHex(seller, 20, path).slice(2)}`;
    }));

    const usageAccrual = sortedMap(section("usage_accrual").map((e, i) => {
        const path = `usage_accrual[${i}]`;
        const [key, value] = tuple(e, 2, path);
        const [kind, coa, period] = tuple(key, 3, `${path}.key`);
        const [c, d] = tuple(value, 2, `${path}.value`);
        return [
            `0x${byteHex(uint(kind, U8_MAX, "u8", path))}${fixedHex(coa, 32, path).slice(2)}${byteHex(uint(period, U8_MAX, "u8", path))}`,
            { c: uint(c, U64_MAX, "u64", path), d: uint(d, U64_MAX, "u64", path) },
        ] as [string, { c: bigint; d: bigint }];
    }));

    return { processes, orderStatus, orderProcessId, usageCounted, usageSellerSeen, usageAccrual };
}

const word = (n: bigint): Hex => numberToHex(n, { size: 32 });
const u64be = (n: bigint): Hex => numberToHex(n, { size: 8 });
/** An address left-padded to a 32-byte word, as `hash_processes` writes it. */
const addressWord = (a: string): Hex => `0x${a.slice(2).padStart(64, "0")}`;
/** keccak256 of a concatenation; `concat([])` is the empty byte string. */
const hashOf = (parts: Hex[]): Hex => keccak256(parts.length ? concat(parts) : "0x");

/** `KernelState::compute_root`, ported. */
export function computeKernelStateRoot(s: KernelStateSnapshot): Hex {
    const processesHash = hashOf([...s.processes].flatMap(([k, p]) => [
        k as Hex,
        addressWord(p.rootBuyer),
        addressWord(p.currency),
        word(p.cumulativeValue),
        word(p.activeOrderCount),
    ]));
    const statusHash = hashOf([...s.orderStatus].flatMap(([k, v]) => [
        k as Hex,
        numberToHex(v, { size: 1 }),
    ]));
    const processIdHash = hashOf([...s.orderProcessId].flatMap(([k, v]) => [k as Hex, v as Hex]));
    const usageHash = hashOf([
        u64be(BigInt(s.usageCounted.length)),
        ...(s.usageCounted as Hex[]),
        u64be(BigInt(s.usageSellerSeen.length)),
        ...(s.usageSellerSeen as Hex[]),
        u64be(BigInt(s.usageAccrual.size)),
        ...[...s.usageAccrual].flatMap(([k, { c, d }]) => [k as Hex, u64be(c), u64be(d)]),
    ]);
    return keccak256(concat([processesHash, statusHash, processIdHash, usageHash]));
}
