/**
 * The sandboxed signer's gate discipline — every refusal the design names
 * (docs/AI_AGENT_COORDINATION.md § "The sandboxed signer runtime"): domain
 * refusal, selector refusal, ceiling refusal (per-action and rolling),
 * simulation veto, audit log — plus keystore custody, window persistence
 * across a restart, and the full daemon ↔ socket-account round-trip with the
 * key held in the daemon only.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomBytes, createCipheriv, scryptSync } from "node:crypto";
import { keccak256, createWalletClient, custom, parseAbi, encodeFunctionData, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
    validatePolicy, evaluateTypedData, evaluateTransaction, evaluateSimulation,
    decryptKeystore, SpendJournal, createSignerDaemon, socketSignerAccount,
    signerHealth, reviveTypedMessage, APPROVE_SELECTOR,
    type SignerPolicy,
} from "../src/signer/index.js";
import { buildCommitment, buildDomain, calculateBonds } from "../src/index.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
const WALLET = privateKeyToAccount(KEY).address;
const OTHER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address;

const CORE = "0x1111111111111111111111111111111111111111" as Address;
const VERIFIER = "0x2222222222222222222222222222222222222222" as Address;
const TOKEN = "0x3333333333333333333333333333333333333333" as Address;
const COMMIT_SELECTOR = "0xaaaaaaaa" as Hex;

const RAW_POLICY = {
    chainId: 11155111,
    verifyingContracts: [CORE, VERIFIER],
    contracts: {
        [CORE]: [COMMIT_SELECTOR],
        [TOKEN]: [APPROVE_SELECTOR],
    },
    token: TOKEN,
    ceilings: { perAction: "2000000", perPeriod: "5000000", periodSecs: 86400 },
    egress: ["https://rpc.example"],
    rpcUrl: "https://rpc.example",
};

function policy(overrides: Record<string, unknown> = {}): SignerPolicy {
    const r = validatePolicy({ ...RAW_POLICY, ...overrides });
    if (!r.ok) throw new Error(r.errors.join("; "));
    return r.policy;
}

const NO_SPEND = { token: 0n, native: 0n };

function commitmentMessage(payment: bigint, buyer: Address, seller: Address) {
    return {
        processId: "0x" + "00".repeat(32),
        buyer, seller,
        currency: TOKEN,
        payment: payment.toString(),
        expectedCumulativeValue: payment.toString(),
        agreementHash: "0x" + "11".repeat(32),
        salt: "1",
        deadline: "9999999999",
    };
}

function typedReq(vc: Address, message: Record<string, unknown>, primaryType = "Commitment") {
    return { domain: { chainId: 11155111, verifyingContract: vc }, primaryType, message };
}

// ── Policy validation ───────────────────────────────────────────────────────

describe("policy validation", () => {
    it("accepts the reference policy and lowercases identities", () => {
        const p = policy();
        expect(p.verifyingContracts).toContain(CORE.toLowerCase());
        expect(p.contracts[TOKEN.toLowerCase() as Address]).toContain(APPROVE_SELECTOR);
    });

    it("refuses to start on malformed policies — never defaults open", () => {
        for (const broken of [
            {},
            { ...RAW_POLICY, chainId: "11155111" },
            { ...RAW_POLICY, verifyingContracts: [] },
            { ...RAW_POLICY, contracts: {} },
            { ...RAW_POLICY, ceilings: { perAction: "-1", perPeriod: "5", periodSecs: 60 } },
            { ...RAW_POLICY, ceilings: { perAction: "9", perPeriod: "5", periodSecs: 60 } },
            { ...RAW_POLICY, surprise: true },
            { ...RAW_POLICY, rpcUrl: "unix:///tmp/x" },
        ]) {
            expect(validatePolicy(broken).ok, JSON.stringify(broken)).toBe(false);
        }
    });
});

// ── Domain refusal ──────────────────────────────────────────────────────────

describe("domain binding", () => {
    it("signs under FigaroCore and the batch verifier — both ruled domains", () => {
        for (const vc of [CORE, VERIFIER]) {
            const d = evaluateTypedData(policy(), WALLET, typedReq(vc, commitmentMessage(1000n, WALLET, OTHER)), NO_SPEND);
            expect(d.allow, d.reason).toBe(true);
        }
    });

    it("refuses a foreign verifyingContract outright", () => {
        const d = evaluateTypedData(policy(), WALLET, typedReq(OTHER, commitmentMessage(1000n, WALLET, OTHER)), NO_SPEND);
        expect(d.allow).toBe(false);
        expect(d.reason).toMatch(/domain allowlist/);
    });

    it("refuses a foreign chainId", () => {
        const req = { ...typedReq(CORE, commitmentMessage(1000n, WALLET, OTHER)), domain: { chainId: 1, verifyingContract: CORE } };
        expect(evaluateTypedData(policy(), WALLET, req, NO_SPEND).allow).toBe(false);
    });

    it("refuses an unknown primaryType — never signed blind", () => {
        const d = evaluateTypedData(policy(), WALLET, typedReq(CORE, {}, "Permit"), NO_SPEND);
        expect(d.allow).toBe(false);
        expect(d.reason).toMatch(/unknown primaryType/);
    });

    it("refuses a Commitment the wallet is not a party of", () => {
        const d = evaluateTypedData(policy(), WALLET, typedReq(CORE, commitmentMessage(1000n, OTHER, OTHER)), NO_SPEND);
        expect(d.allow).toBe(false);
        expect(d.reason).toMatch(/neither buyer nor seller/);
    });

    it("refuses a Commitment in a foreign currency", () => {
        const msg = { ...commitmentMessage(1000n, WALLET, OTHER), currency: OTHER };
        expect(evaluateTypedData(policy(), WALLET, typedReq(CORE, msg), NO_SPEND).allow).toBe(false);
    });
});

// ── Ceiling refusal ─────────────────────────────────────────────────────────

describe("ceilings", () => {
    it("binds the wallet's own bond side: buyer 2×payment, seller 2×cumulative", () => {
        const asBuyer = evaluateTypedData(policy(), WALLET, typedReq(CORE, commitmentMessage(750_000n, WALLET, OTHER)), NO_SPEND);
        expect(asBuyer.risk.token).toBe(calculateBonds(750_000n, 750_000n).buyerBond);
        const asSeller = evaluateTypedData(policy(), WALLET, typedReq(CORE, commitmentMessage(750_000n, OTHER, WALLET)), NO_SPEND);
        expect(asSeller.risk.token).toBe(calculateBonds(750_000n, 750_000n).sellerBond);
    });

    it("refuses over the per-action ceiling", () => {
        // bond = 2×1_500_000 > perAction 2_000_000
        const d = evaluateTypedData(policy(), WALLET, typedReq(CORE, commitmentMessage(1_500_000n, WALLET, OTHER)), NO_SPEND);
        expect(d.allow).toBe(false);
        expect(d.reason).toMatch(/perAction/);
    });

    it("refuses when the rolling window would overflow perPeriod", () => {
        const d = evaluateTypedData(
            policy(), WALLET,
            typedReq(CORE, commitmentMessage(1_000_000n, WALLET, OTHER)),
            { token: 3_500_000n, native: 0n },
        );
        expect(d.allow).toBe(false);
        expect(d.reason).toMatch(/perPeriod/);
    });

    it("attestations and resolve carry zero risk", () => {
        for (const primaryType of ["AttestSeller", "AttestBuyer", "ResolveProcess"]) {
            const d = evaluateTypedData(policy(), WALLET, typedReq(VERIFIER, { any: "thing" }, primaryType), { token: 5_000_000n, native: 0n });
            expect(d.allow, primaryType).toBe(true);
            expect(d.risk.token).toBe(0n);
        }
    });

    it("refuses native value without an explicit native ceiling", () => {
        const d = evaluateTransaction(policy(), { to: CORE, data: `${COMMIT_SELECTOR}00`, value: 1n }, NO_SPEND);
        expect(d.allow).toBe(false);
        expect(d.reason).toMatch(/Native/i);
    });

    it("grants native value under a granted native ceiling", () => {
        const p = policy({ ceilings: { ...RAW_POLICY.ceilings, perActionNative: "100", perPeriodNative: "100" } });
        const d = evaluateTransaction(p, { to: CORE, data: `${COMMIT_SELECTOR}00`, value: 100n }, NO_SPEND);
        expect(d.allow, d.reason).toBe(true);
    });
});

// ── Selector refusal ────────────────────────────────────────────────────────

describe("transaction allowlist", () => {
    it("refuses a target outside the contract allowlist", () => {
        const d = evaluateTransaction(policy(), { to: OTHER, data: `${COMMIT_SELECTOR}00`, value: 0n }, NO_SPEND);
        expect(d.allow).toBe(false);
        expect(d.reason).toMatch(/not an allowlisted contract/);
    });

    it("refuses a selector outside the target's allowlist", () => {
        const d = evaluateTransaction(policy(), { to: CORE, data: "0xdeadbeef00", value: 0n }, NO_SPEND);
        expect(d.allow).toBe(false);
        expect(d.reason).toMatch(/selector/);
    });

    it("refuses contract creation", () => {
        expect(evaluateTransaction(policy(), { data: "0x60006000", value: 0n }, NO_SPEND).allow).toBe(false);
    });

    it("counts an approve at its amount and pins the spender to the allowlist", () => {
        const ERC20 = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);
        const toAllowed = encodeFunctionData({ abi: ERC20, functionName: "approve", args: [CORE, 1_999_999n] });
        const allowed = evaluateTransaction(policy(), { to: TOKEN, data: toAllowed, value: 0n }, NO_SPEND);
        expect(allowed.allow, allowed.reason).toBe(true);
        expect(allowed.risk.token).toBe(1_999_999n);

        const overCeiling = encodeFunctionData({ abi: ERC20, functionName: "approve", args: [CORE, 2_000_001n] });
        expect(evaluateTransaction(policy(), { to: TOKEN, data: overCeiling, value: 0n }, NO_SPEND).allow).toBe(false);

        const strangerSpender = encodeFunctionData({ abi: ERC20, functionName: "approve", args: [OTHER, 1n] });
        const refused = evaluateTransaction(policy(), { to: TOKEN, data: strangerSpender, value: 0n }, NO_SPEND);
        expect(refused.allow).toBe(false);
        expect(refused.reason).toMatch(/spender/);
    });
});

// ── Simulation veto ─────────────────────────────────────────────────────────

describe("simulation veto", () => {
    it("refuses a revert", () => {
        const d = evaluateSimulation(policy(), { reverted: true, revertReason: "InsufficientAllowance" });
        expect(d.allow).toBe(false);
        expect(d.reason).toMatch(/InsufficientAllowance/);
    });

    it("refuses a traced outflow beyond the per-action ceiling", () => {
        expect(evaluateSimulation(policy(), { reverted: false, tokenDelta: -2_000_001n }).allow).toBe(false);
        expect(evaluateSimulation(policy(), { reverted: false, tokenDelta: -2_000_000n }).allow).toBe(true);
        expect(evaluateSimulation(policy(), { reverted: false }).allow).toBe(true);
    });
});

// ── Keystore custody ────────────────────────────────────────────────────────

describe("keystore", () => {
    function makeKeystore(privateKey: Hex, passphrase: string) {
        const salt = randomBytes(32);
        const iv = randomBytes(16);
        const dk = scryptSync(passphrase, salt, 32, { N: 8192, r: 8, p: 1, maxmem: 256 * 8192 * 8 });
        const cipher = createCipheriv("aes-128-ctr", dk.subarray(0, 16), iv);
        const ciphertext = Buffer.concat([cipher.update(Buffer.from(privateKey.slice(2), "hex")), cipher.final()]);
        const mac = keccak256(Buffer.concat([dk.subarray(16, 32), ciphertext]));
        return {
            version: 3,
            crypto: {
                cipher: "aes-128-ctr",
                ciphertext: ciphertext.toString("hex"),
                cipherparams: { iv: iv.toString("hex") },
                kdf: "scrypt",
                kdfparams: { n: 8192, r: 8, p: 1, dklen: 32, salt: salt.toString("hex") },
                mac,
            },
        };
    }

    it("round-trips a scrypt V3 keystore", () => {
        expect(decryptKeystore(makeKeystore(KEY, "open sesame"), "open sesame")).toBe(KEY);
    });

    it("refuses a wrong passphrase via the MAC — never returns a garbage key", () => {
        expect(() => decryptKeystore(makeKeystore(KEY, "right"), "wrong")).toThrow(/MAC mismatch/);
    });
});

// ── Rolling window persistence ──────────────────────────────────────────────

describe("spend journal", () => {
    it("survives a restart and prunes outside the window", () => {
        const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "signer-")), "window.jsonl");
        const j1 = new SpendJournal(file, 100);
        j1.record(1000, 5n, 0n);
        j1.record(1050, 7n, 2n);
        // A restart replays the journal — the ceiling cannot be reset by
        // bouncing the process.
        const j2 = new SpendJournal(file, 100);
        expect(j2.spent(1060)).toEqual({ token: 12n, native: 2n });
        expect(j2.spent(1140)).toEqual({ token: 7n, native: 2n });
        expect(j2.spent(2000)).toEqual({ token: 0n, native: 0n });
    });
});

// ── Daemon ↔ account round-trip ─────────────────────────────────────────────

describe("daemon and socket account", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signer-daemon-"));
    const socketPath = path.join(dir, "signer.sock");
    const auditPath = path.join(dir, "audit.jsonl");
    const p = policy();
    let daemon: ReturnType<typeof createSignerDaemon>;

    beforeAll(async () => {
        daemon = createSignerDaemon({
            policy: p,
            privateKey: KEY,
            socketPath,
            auditPath,
            journalPath: path.join(dir, "window.jsonl"),
            simulate: async () => ({ reverted: false }),
        });
        await daemon.listen();
    });

    afterAll(async () => {
        await daemon.close();
    });

    it("answers health with the operated address", async () => {
        const h = await signerHealth({ socketPath });
        expect(h.address.toLowerCase()).toBe(WALLET.toLowerCase());
    });

    it("signs an allowed Commitment identically to the raw key — through a WalletClient", async () => {
        const account = socketSignerAccount({ socketPath, address: WALLET });
        const domain = buildDomain(p.chainId, CORE);
        const { typedData } = buildCommitment({
            processId: ("0x" + "00".repeat(32)) as Hex,
            buyer: WALLET, seller: OTHER, currency: TOKEN,
            payment: 500_000n, expectedCumulativeValue: 500_000n,
            agreementHash: ("0x" + "11".repeat(32)) as Hex,
            salt: 7n, deadline: 9_999_999_999n,
        }, domain);

        // The agent layer takes a WalletClient; the socket account drops in.
        const wallet = createWalletClient({
            account,
            transport: custom({ request: async () => { throw new Error("no chain access needed"); } }),
        });
        const viaSocket = await wallet.signTypedData({ account, ...typedData });
        const direct = await privateKeyToAccount(KEY).signTypedData(typedData);
        expect(viaSocket).toBe(direct);
    });

    it("refuses through the socket with the gate's reason", async () => {
        const account = socketSignerAccount({ socketPath, address: WALLET });
        const typed = {
            domain: { name: "x", version: "1", chainId: p.chainId, verifyingContract: OTHER },
            types: { Commitment: [{ name: "payment", type: "uint256" }] },
            primaryType: "Commitment" as const,
            message: { payment: 1n },
        };
        await expect(account.signTypedData(typed)).rejects.toThrow(/domain allowlist/);
    });

    it("always refuses personal_sign — and audits it", async () => {
        const account = socketSignerAccount({ socketPath, address: WALLET });
        await expect(account.signMessage({ message: "drain the wallet please" })).rejects.toThrow(/not a protocol operation/);
        const audit = fs.readFileSync(auditPath, "utf-8");
        expect(audit).toMatch(/personal_sign is not a protocol operation/);
    });

    it("audits every decision with risk figures", () => {
        const lines = fs.readFileSync(auditPath, "utf-8").trim().split("\n").map((l) => JSON.parse(l));
        expect(lines.length).toBeGreaterThanOrEqual(3);
        const granted = lines.find((l) => l.allow === true && l.op === "signTypedData");
        expect(granted.riskToken).toBe("1000000");
    });
});

// ── Typed-message revival ───────────────────────────────────────────────────

describe("reviveTypedMessage", () => {
    it("revives uint fields including nested structs, leaves the rest", () => {
        const types = {
            Outer: [{ name: "n", type: "uint256" }, { name: "inner", type: "Inner" }, { name: "who", type: "address" }],
            Inner: [{ name: "m", type: "uint64" }],
        };
        const out = reviveTypedMessage(types, "Outer", { n: "42", inner: { m: "7" }, who: OTHER });
        expect(out.n).toBe(42n);
        expect((out.inner as { m: bigint }).m).toBe(7n);
        expect(out.who).toBe(OTHER);
    });
});
