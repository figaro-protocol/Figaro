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
    assertPrivateDir, assertOneDir, resolveSignerPaths,
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

/** Worst-case fee of `tx()` below: gas × maxFeePerGas. */
const FEE = 100_000n * 10n;
/** A policy that grants ETH: every transaction spends some on its fee. */
const NATIVE = { ...RAW_POLICY.ceilings, perActionNative: "2000000", perPeriodNative: "5000000" };
const withNative = () => policy({ ceilings: NATIVE });

/** A complete EIP-1559 transaction, as a wallet client hands one to the
 *  signer: every field the gate evaluates is present. */
function tx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        to: CORE, data: `${COMMIT_SELECTOR}00`, value: 0n,
        gas: 100_000n, maxFeePerGas: 10n, maxPriorityFeePerGas: 1n,
        nonce: 0, chainId: 11155111, type: "eip1559",
        ...overrides,
    };
}

function commitmentMessage(payment: bigint, buyer: Address, seller: Address) {
    return {
        processId: "0x" + "00".repeat(32),
        buyer, seller,
        token: TOKEN,
        payment: payment.toString(),
        runningTotal: payment.toString(),
        checkoutHash: "0x" + "11".repeat(32),
        salt: "1",
        commitDeadline: "9999999999",
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

    it("refuses a token selector the gate cannot price — approve alone moves the denomination", () => {
        // transfer, increaseAllowance and permit each move the token at a
        // risk the gate would count as zero.
        for (const selector of ["0xa9059cbb", "0x39509351", "0xd505accf"]) {
            const r = validatePolicy({
                ...RAW_POLICY,
                contracts: { ...RAW_POLICY.contracts, [TOKEN]: [APPROVE_SELECTOR, selector] },
            });
            expect(r.ok, selector).toBe(false);
            if (!r.ok) expect(r.errors.join("; ")).toContain(`selector ${selector} on the denomination token`);
        }
        // The same selector on another contract is that contract's business.
        expect(validatePolicy({
            ...RAW_POLICY,
            contracts: { ...RAW_POLICY.contracts, [OTHER]: ["0xa9059cbb"] },
        }).ok).toBe(true);
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

    it("refuses a Commitment in a foreign token", () => {
        const msg = { ...commitmentMessage(1000n, WALLET, OTHER), token: OTHER };
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

    it("attestations carry zero risk", () => {
        for (const primaryType of ["AttestSeller", "AttestBuyer"]) {
            const d = evaluateTypedData(policy(), WALLET, typedReq(VERIFIER, { any: "thing" }, primaryType), { token: 5_000_000n, native: 0n });
            expect(d.allow, primaryType).toBe(true);
            expect(d.risk.token).toBe(0n);
        }
    });

    it("a resolve carries zero risk and names its process and value", () => {
        // A ResolveProcess pays the sellers from bonds counted at commit: a
        // wallet whose window is full is never refused its own resolve.
        const processId = `0x${"ab".repeat(32)}`;
        const d = evaluateTypedData(
            policy(), WALLET,
            typedReq(VERIFIER, { processId, runningTotal: "9000000" }, "ResolveProcess"),
            { token: 5_000_000n, native: 0n },
        );
        expect(d.allow, d.reason).toBe(true);
        expect(d.risk.token).toBe(0n);
        expect(d.reason).toContain(processId);
        expect(d.reason).toContain("9000000");
    });

    it("refuses a resolve that names no process or no value", () => {
        const processId = `0x${"ab".repeat(32)}`;
        const noValue = evaluateTypedData(policy(), WALLET, typedReq(VERIFIER, { processId }, "ResolveProcess"), NO_SPEND);
        expect(noValue.allow).toBe(false);
        expect(noValue.reason).toMatch(/runningTotal/);
        const noProcess = evaluateTypedData(
            policy(), WALLET,
            typedReq(VERIFIER, { processId: "0x01", runningTotal: "1000" }, "ResolveProcess"),
            NO_SPEND,
        );
        expect(noProcess.allow).toBe(false);
        expect(noProcess.reason).toMatch(/processId/);
    });

    it("refuses native value without an explicit native ceiling", () => {
        const d = evaluateTransaction(policy(), tx({ value: 1n }), NO_SPEND);
        expect(d.allow).toBe(false);
        expect(d.reason).toMatch(/Native/i);
    });

    it("grants native value under a granted native ceiling", () => {
        const p = policy({ ceilings: { ...RAW_POLICY.ceilings, perActionNative: "1000100", perPeriodNative: "1000100" } });
        const d = evaluateTransaction(p, tx({ value: 100n }), NO_SPEND);
        expect(d.allow, d.reason).toBe(true);
    });

    it("counts both bonds when the wallet is buyer and seller", () => {
        // The Core admits buyer == seller and pulls both bonds from it.
        const d = evaluateTypedData(policy(), WALLET, typedReq(CORE, commitmentMessage(400_000n, WALLET, WALLET)), NO_SPEND);
        const bonds = calculateBonds(400_000n, 400_000n);
        expect(d.allow, d.reason).toBe(true);
        expect(d.risk.token).toBe(bonds.buyerBond + bonds.sellerBond);
        // And refuses when the two together pass the ceiling one alone would not.
        const over = evaluateTypedData(policy(), WALLET, typedReq(CORE, commitmentMessage(600_000n, WALLET, WALLET)), NO_SPEND);
        expect(over.allow).toBe(false);
        expect(over.reason).toMatch(/perAction/);
    });
});

// ── The fee is ETH leaving the wallet ───────────────────────────────────────

describe("transaction fee", () => {
    it("counts the worst-case fee, gas × maxFeePerGas, as native risk beside the value", () => {
        const d = evaluateTransaction(withNative(), tx({ value: 7n }), NO_SPEND);
        expect(d.allow, d.reason).toBe(true);
        expect(d.risk.native).toBe(FEE + 7n);
    });

    it("refuses a fee beyond the per-action native ceiling, whatever the value", () => {
        // An allowlisted call with a fee cap that hands the wallet's ETH to
        // whoever builds the block.
        const d = evaluateTransaction(withNative(), tx({ maxFeePerGas: 10n ** 12n }), NO_SPEND);
        expect(d.allow).toBe(false);
        expect(d.reason).toMatch(/perActionNative/);
    });

    it("refuses when fees would overflow the rolling native window", () => {
        const d = evaluateTransaction(withNative(), tx(), { token: 0n, native: 4_500_000n });
        expect(d.allow).toBe(false);
        expect(d.reason).toMatch(/perPeriodNative/);
    });

    it("refuses every transaction under a policy that grants no ETH — a fee is ETH", () => {
        const d = evaluateTransaction(policy(), tx(), NO_SPEND);
        expect(d.allow).toBe(false);
        expect(d.reason).toMatch(/Native/i);
    });

    it("counts a legacy transaction at gas × gasPrice", () => {
        const legacy = tx({ gasPrice: 20n, type: "legacy" });
        delete legacy.maxFeePerGas;
        delete legacy.maxPriorityFeePerGas;
        const d = evaluateTransaction(withNative(), legacy, NO_SPEND);
        expect(d.allow, d.reason).toBe(true);
        expect(d.risk.native).toBe(100_000n * 20n);
    });

    it("refuses a transaction whose fee it cannot bound", () => {
        for (const missing of ["gas", "maxFeePerGas"]) {
            const t = tx();
            delete t[missing];
            const d = evaluateTransaction(withNative(), t, NO_SPEND);
            expect(d.allow, missing).toBe(false);
            expect(d.reason, missing).toMatch(/fee/);
        }
    });

    it("refuses a transaction for another chain, or for none", () => {
        const other = evaluateTransaction(withNative(), tx({ chainId: 1 }), NO_SPEND);
        expect(other.allow).toBe(false);
        expect(other.reason).toMatch(/chainId/);
        const t = tx();
        delete t.chainId;
        const none = evaluateTransaction(withNative(), t, NO_SPEND);
        expect(none.allow).toBe(false);
        expect(none.reason).toMatch(/chainId/);
    });

    it("refuses a quantity it cannot read — the serializer reads more spellings than the gate", () => {
        // Each of these is a 1e15 price per gas to viem's serializer
        // (`BigInt(v)`), and the gate must refuse it rather than read it as no cap.
        const hostile: unknown[] = [" 1000000000000000", "1000000000000000 ", "0X38D7EA4C68000",
            "0b1", "0o7", ["1000000000000000"], true, -1, 1.5];
        for (const v of hostile) {
            for (const field of ["maxFeePerGas", "maxPriorityFeePerGas", "gasPrice", "gas", "value", "nonce"]) {
                const d = evaluateTransaction(withNative(), tx({ [field]: v }), NO_SPEND);
                expect(d.allow, `${field}=${JSON.stringify(v)}`).toBe(false);
                expect(d.reason, `${field}=${JSON.stringify(v)}`).toMatch(new RegExp(`${field} is not a quantity`));
            }
        }
    });

    it("refuses a legacy transaction whose real price hides behind a zero fee cap", () => {
        // viem signs legacy at gasPrice; a zero maxFeePerGas must not stand in.
        const d = evaluateTransaction(withNative(), tx({ type: "legacy", maxFeePerGas: 0n, maxPriorityFeePerGas: undefined, gasPrice: 10n ** 12n }), NO_SPEND);
        expect(d.allow).toBe(false);
        expect(d.reason).toMatch(/perActionNative/);
    });

    it("refuses a null field: the serializer reads it as present", () => {
        // A null authorization list makes an EIP-7702 transaction, a null
        // blob price a type-3 one.
        for (const field of ["authorizationList", "maxFeePerBlobGas", "blobs"]) {
            const d = evaluateTransaction(withNative(), tx({ [field]: null }), NO_SPEND);
            expect(d.allow, field).toBe(false);
            expect(d.reason, field).toMatch(new RegExp(field));
        }
    });

    it("refuses a type that is not one of the three as a string", () => {
        for (const type of [["eip1559"], 2, "0x2", "eip7702", "eip4844"]) {
            const d = evaluateTransaction(withNative(), tx({ type }), NO_SPEND);
            expect(d.allow, JSON.stringify(type)).toBe(false);
            expect(d.reason).toMatch(/type/);
        }
    });

    it("refuses a field it does not evaluate — never signed blind", () => {
        for (const field of ["maxFeePerBlobGas", "blobs", "blobVersionedHashes", "authorizationList", "sidecars"]) {
            const d = evaluateTransaction(withNative(), tx({ [field]: 1n }), NO_SPEND);
            expect(d.allow, field).toBe(false);
            expect(d.reason, field).toMatch(new RegExp(field));
        }
    });
});

// ── Selector refusal ────────────────────────────────────────────────────────

describe("transaction allowlist", () => {
    it("refuses a target outside the contract allowlist", () => {
        const d = evaluateTransaction(withNative(), tx({ to: OTHER }), NO_SPEND);
        expect(d.allow).toBe(false);
        expect(d.reason).toMatch(/not an allowlisted contract/);
    });

    it("refuses a selector outside the target's allowlist", () => {
        const d = evaluateTransaction(withNative(), tx({ data: "0xdeadbeef00" }), NO_SPEND);
        expect(d.allow).toBe(false);
        expect(d.reason).toMatch(/selector/);
    });

    it("refuses contract creation", () => {
        const creation = tx({ data: "0x60006000" });
        delete creation.to;
        expect(evaluateTransaction(withNative(), creation, NO_SPEND).allow).toBe(false);
    });

    it("counts an approve at its amount and pins the spender to the allowlist", () => {
        const ERC20 = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);
        const toAllowed = encodeFunctionData({ abi: ERC20, functionName: "approve", args: [CORE, 1_999_999n] });
        const allowed = evaluateTransaction(withNative(), tx({ to: TOKEN, data: toAllowed }), NO_SPEND);
        expect(allowed.allow, allowed.reason).toBe(true);
        expect(allowed.risk.token).toBe(1_999_999n);

        const overCeiling = encodeFunctionData({ abi: ERC20, functionName: "approve", args: [CORE, 2_000_001n] });
        expect(evaluateTransaction(withNative(), tx({ to: TOKEN, data: overCeiling }), NO_SPEND).allow).toBe(false);

        const strangerSpender = encodeFunctionData({ abi: ERC20, functionName: "approve", args: [OTHER, 1n] });
        const refused = evaluateTransaction(withNative(), tx({ to: TOKEN, data: strangerSpender }), NO_SPEND);
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

    const journalWith = (lines: string[]) => {
        const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "signer-")), "window.jsonl");
        fs.writeFileSync(file, lines.join("\n"));
        return file;
    };

    it("refuses a journal with an entry that is not a non-negative amount", () => {
        // A negative entry would give spend back: the ceiling's own record
        // turned against it.
        for (const bad of [
            '{"ts":1000,"token":"-5000000","native":"0"}',
            '{"ts":1000,"token":"5","native":"-1"}',
            '{"ts":1000,"token":"0x10","native":"0"}',
            '{"ts":1000,"token":5,"native":"0"}',
            '{"ts":"1000","token":"5","native":"0"}',
            '{"ts":-1,"token":"5","native":"0"}',
        ]) {
            const file = journalWith(['{"ts":900,"token":"1","native":"0"}', bad, ""]);
            expect(() => new SpendJournal(file, 100), bad).toThrow(/spend journal/);
        }
    });

    it("refuses a line that does not parse unless it is the torn tail", () => {
        const good = '{"ts":1000,"token":"5","native":"0"}';
        const torn = journalWith([good, '{"ts":1001,"tok']);
        expect(new SpendJournal(torn, 100).spent(1050)).toEqual({ token: 5n, native: 0n });
        // The torn tail is cut off the file: the next entry starts a line of
        // its own and survives a restart.
        new SpendJournal(torn, 100).record(1010, 40n, 0n);
        expect(new SpendJournal(torn, 100).spent(1050)).toEqual({ token: 45n, native: 0n });
        const damaged = journalWith(['{"ts":999,"tok', good, ""]);
        expect(() => new SpendJournal(damaged, 100)).toThrow(/spend journal/);
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
            buyer: WALLET, seller: OTHER, token: TOKEN,
            payment: 500_000n, runningTotal: 500_000n,
            checkoutHash: ("0x" + "11".repeat(32)) as Hex,
            salt: 7n, commitDeadline: 9_999_999_999n,
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

// ── Rolling-ceiling concurrency (TOCTOU regression) ─────────────────────────

describe("daemon rolling ceiling under pipelined requests", () => {
    it("grants only within the per-period ceiling when two requests arrive in one socket write", async () => {
        // The gate reads the spend window, then AWAITS the signature, then
        // records — so two requests dispatched before either records once let
        // both pass the same empty window. The daemon serializes the critical
        // clause; this pins that. perPeriod admits one commitment's 2×payment
        // bond (1_000_000) but not two.
        const net = await import("node:net");
        const { wireStringify } = await import("../src/signer/wire.js");
        const { strippingReviver } = await import("../src/safeJson.js");
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signer-toctou-"));
        const socketPath = path.join(dir, "signer.sock");
        const p = policy({ ceilings: { perAction: "1000000", perPeriod: "1500000", periodSecs: 86400 } });
        const d = createSignerDaemon({
            policy: p, privateKey: KEY, socketPath,
            auditPath: path.join(dir, "audit.jsonl"),
            journalPath: path.join(dir, "window.jsonl"),
            simulate: async () => ({ reverted: false }),
        });
        await d.listen();
        try {
            const domain = buildDomain(p.chainId, CORE);
            const line = (id: number, salt: bigint) => {
                const { typedData } = buildCommitment({
                    processId: ("0x" + "00".repeat(32)) as Hex,
                    buyer: WALLET, seller: OTHER, token: TOKEN,
                    payment: 500_000n, runningTotal: 500_000n,
                    checkoutHash: ("0x" + "11".repeat(32)) as Hex,
                    salt, commitDeadline: 9_999_999_999n,
                }, domain);
                return wireStringify({ id, op: "signTypedData", params: typedData });
            };
            const responses = await new Promise<Array<{ ok: boolean }>>((resolve, reject) => {
                const conn = net.connect(socketPath);
                let buf = "";
                const got: Array<{ ok: boolean }> = [];
                conn.on("connect", () => conn.write(`${line(1, 1n)}\n${line(2, 2n)}\n`));
                conn.on("data", (chunk) => {
                    buf += chunk.toString("utf-8");
                    let nl: number;
                    while ((nl = buf.indexOf("\n")) >= 0) {
                        got.push(JSON.parse(buf.slice(0, nl), strippingReviver));
                        buf = buf.slice(nl + 1);
                        if (got.length === 2) { conn.end(); resolve(got); }
                    }
                });
                conn.on("error", reject);
            });
            const granted = responses.filter((r) => r.ok).length;
            expect(granted, `daemon granted ${granted} signatures; the ceiling allows 1`).toBe(1);
        } finally {
            await d.close();
        }
    });
});

// ── The fee bound, through the daemon ───────────────────────────────────────

describe("daemon signs transactions under the fee bound", () => {
    it("records each fee in the window and refuses the transaction that would pass it", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signer-fee-"));
        const socketPath = path.join(dir, "signer.sock");
        const journalPath = path.join(dir, "window.jsonl");
        // One fee of FEE fits the period; a second does not.
        const p = policy({ ceilings: { ...RAW_POLICY.ceilings, perActionNative: "1000000", perPeriodNative: "1500000" } });
        const d = createSignerDaemon({
            policy: p, privateKey: KEY, socketPath,
            auditPath: path.join(dir, "audit.jsonl"),
            journalPath,
            simulate: async () => ({ reverted: false }),
            nowSecs: () => 1000,
        });
        await d.listen();
        try {
            const account = socketSignerAccount({ socketPath, address: WALLET });
            const base = {
                to: CORE, data: `${COMMIT_SELECTOR}00` as Hex, value: 0n,
                gas: 100_000n, maxFeePerGas: 10n, maxPriorityFeePerGas: 1n,
                nonce: 0, chainId: 11155111, type: "eip1559" as const,
            };
            const signed = await account.signTransaction(base);
            expect(signed).toMatch(/^0x02/);
            expect(new SpendJournal(journalPath, 86400).spent(1000)).toEqual({ token: 0n, native: FEE });

            await expect(account.signTransaction({ ...base, nonce: 1 })).rejects.toThrow(/perPeriodNative/);
            await expect(account.signTransaction({ ...base, nonce: 1, maxFeePerGas: 10n ** 12n }))
                .rejects.toThrow(/perActionNative/);
            await expect(account.signTransaction({ ...base, nonce: 1, chainId: 1 })).rejects.toThrow(/chainId/);
        } finally {
            await d.close();
        }
    });

    it("signs what a WalletClient prepares — every field viem sends is one the gate evaluates", async () => {
        // The agent layer writes through a WalletClient: viem fills the gas,
        // the fees, the nonce and the chain, and hands the prepared request
        // to the account. The gate refuses a field it does not evaluate, so
        // this pins that viem's prepared request carries none.
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signer-wallet-"));
        const socketPath = path.join(dir, "signer.sock");
        const p = policy({ ceilings: { ...RAW_POLICY.ceilings, perActionNative: "10000000000000000", perPeriodNative: "10000000000000000" } });
        const d = createSignerDaemon({
            policy: p, privateKey: KEY, socketPath,
            auditPath: path.join(dir, "audit.jsonl"),
            journalPath: path.join(dir, "window.jsonl"),
            simulate: async () => ({ reverted: false }),
        });
        await d.listen();
        const sent: Hex[] = [];
        try {
            const account = socketSignerAccount({ socketPath, address: WALLET });
            const wallet = createWalletClient({
                account,
                chain: { id: 11155111, name: "sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://unused"] } } },
                transport: custom({
                    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
                        switch (method) {
                            case "eth_chainId": return "0xaa36a7";
                            case "eth_getTransactionCount": return "0x0";
                            case "eth_estimateGas": return "0x186a0";
                            case "eth_maxPriorityFeePerGas": return "0x3b9aca00";
                            case "eth_gasPrice": return "0x3b9aca00";
                            case "eth_getBlockByNumber": return { baseFeePerGas: "0x3b9aca00", number: "0x1", timestamp: "0x1", gasLimit: "0x1c9c380", gasUsed: "0x0", transactions: [] };
                            case "eth_sendRawTransaction": sent.push((params as Hex[])[0]); return `0x${"ab".repeat(32)}`;
                            default: throw new Error(`unexpected ${method}`);
                        }
                    },
                }),
            });
            const hash = await wallet.sendTransaction({ to: CORE, data: `${COMMIT_SELECTOR}00` as Hex });
            expect(hash).toMatch(/^0x(ab){32}$/);
            expect(sent).toHaveLength(1);
            expect(sent[0]).toMatch(/^0x02/);
        } finally {
            await d.close();
        }
    });
});

// ── The daemon's own simulation veto, against a node ────────────────────────
//
// Every other daemon test injects `simulate`. These run the daemon's real
// simulation — viem's `eth_call`, then `eth_createAccessList` and
// `eth_simulateV1` with asset tracing — against an HTTP JSON-RPC node double
// that answers those methods as a node does. The daemon refuses a transaction
// whose `eth_call` reverts, and one whose traced denomination balance falls by
// more than the policy's `perAction` ceiling (`evaluateSimulation`).

/** How the node double's chain answers the one transaction under test. */
interface NodeScenario {
    /** `eth_call` reverts with this reason. */
    revert?: string;
    /** The wallet's denomination balance before and after the transaction;
     *  absent, the node serves no `eth_simulateV1` (tracing unsupported). */
    tokenBalance?: { pre: bigint; post: bigint };
}

const word = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}`;

/** A JSON-RPC node over HTTP on 127.0.0.1, answering what the daemon's
 *  simulation sends. Returns the URL and the methods it was asked. */
async function nodeDouble(scenario: NodeScenario): Promise<{ url: string; methods: string[]; close: () => Promise<void> }> {
    const http = await import("node:http");
    const methods: string[] = [];
    const answer = (method: string, params: unknown[]): { result?: unknown; error?: { code: number; message: string; data?: string } } => {
        methods.push(method);
        switch (method) {
            case "eth_chainId": return { result: "0xaa36a7" };
            case "eth_call":
                if (scenario.revert !== undefined) {
                    // A node's revert: code 3, the reason ABI-encoded as Error(string).
                    const reason = Buffer.from(scenario.revert, "utf8").toString("hex");
                    const data = `0x08c379a0${word(32n).slice(2)}${word(BigInt(scenario.revert.length)).slice(2)}${reason.padEnd(64, "0")}`;
                    return { error: { code: 3, message: `execution reverted: ${scenario.revert}`, data } };
                }
                return { result: "0x" };
            case "eth_createAccessList":
                // The transaction touches the denomination token's storage.
                return { result: { accessList: [{ address: TOKEN.toLowerCase(), storageKeys: [word(1n)] }], gasUsed: "0x5208" } };
            case "eth_simulateV1": {
                if (scenario.tokenBalance === undefined) return { error: { code: -32601, message: "the method eth_simulateV1 does not exist" } };
                const { blockStateCalls } = params[0] as { blockStateCalls: { calls: unknown[] }[] };
                const ok = (returnData: string) => ({ status: "0x1", returnData, gasUsed: "0x5208", logs: [] });
                const { pre, post } = scenario.tokenBalance;
                // The eight blocks viem asks for: ETH before, the token before,
                // the calls, ETH after, the token after, decimals, tokenURI, symbol.
                const answers: ((i: number) => object)[] = [
                    () => ok(word(10n ** 18n)),
                    () => ok(word(pre)),
                    () => ok("0x"),
                    () => ok(word(10n ** 18n)),
                    () => ok(word(post)),
                    () => ok(word(6n)),
                    () => ({ status: "0x0", returnData: "0x", gasUsed: "0x5208", logs: [], error: { code: 3, message: "execution reverted" } }),
                    () => ok(`${word(32n)}${word(4n).slice(2)}${Buffer.from("TOKN").toString("hex").padEnd(64, "0")}`),
                ];
                return {
                    result: blockStateCalls.map((b, i) => ({
                        number: word(BigInt(i + 2)), hash: word(BigInt(i + 100)), parentHash: word(BigInt(i + 99)),
                        timestamp: "0x6553f100", gasLimit: "0x1c9c380", gasUsed: "0x5208", baseFeePerGas: "0x1",
                        miner: `0x${"00".repeat(20)}`, transactions: [],
                        calls: b.calls.map(() => answers[i]!(i)),
                    })),
                };
            }
            default: return { error: { code: -32601, message: `unexpected ${method}` } };
        }
    };
    const server = http.createServer((req, res) => {
        let body = "";
        req.on("data", (c) => { body += c; });
        req.on("end", () => {
            const parsed = JSON.parse(body) as { id: number; method: string; params?: unknown[] } | { id: number; method: string; params?: unknown[] }[];
            const one = (r: { id: number; method: string; params?: unknown[] }) => ({ jsonrpc: "2.0", id: r.id, ...answer(r.method, r.params ?? []) });
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(Array.isArray(parsed) ? parsed.map(one) : one(parsed)));
        });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    return { url: `http://127.0.0.1:${port}`, methods, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

describe("daemon simulation veto — the daemon's own simulation against a node", () => {
    /** Ask the daemon, with no injected simulation, to sign one commit transaction. */
    async function signUnder(scenario: NodeScenario) {
        const node = await nodeDouble(scenario);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signer-sim-"));
        const socketPath = path.join(dir, "signer.sock");
        const d = createSignerDaemon({
            policy: policy({ ceilings: NATIVE, egress: [node.url], rpcUrl: node.url }),
            privateKey: KEY, socketPath,
            auditPath: path.join(dir, "audit.jsonl"),
            journalPath: path.join(dir, "window.jsonl"),
        });
        await d.listen();
        try {
            const account = socketSignerAccount({ socketPath, address: WALLET });
            const outcome = await account.signTransaction({
                to: CORE, data: `${COMMIT_SELECTOR}00` as Hex, value: 0n,
                gas: 100_000n, maxFeePerGas: 10n, maxPriorityFeePerGas: 1n,
                nonce: 0, chainId: 11155111, type: "eip1559",
            }).then((signed) => ({ signed }), (error: Error) => ({ refused: error.message }));
            return { outcome, methods: node.methods };
        } finally {
            await d.close();
            await node.close();
        }
    }

    it("refuses a transaction whose eth_call reverts, with the node's reason", async () => {
        const { outcome, methods } = await signUnder({ revert: "SellerNotStaked" });
        expect(outcome).toEqual({ refused: expect.stringMatching(/simulation reverted: .*SellerNotStaked/) });
        expect(methods).toContain("eth_call");
    });

    it("refuses a transaction whose traced outflow of the denomination passes the perAction ceiling", async () => {
        // perAction is 2,000,000; the balance falls by 3,000,000.
        const { outcome, methods } = await signUnder({ tokenBalance: { pre: 10_000_000n, post: 7_000_000n } });
        expect(outcome).toEqual({ refused: expect.stringMatching(/simulated token outflow 3000000 exceeds perAction ceiling 2000000/) });
        expect(methods).toEqual(expect.arrayContaining(["eth_call", "eth_createAccessList", "eth_simulateV1"]));
    });

    it("signs a transaction whose traced outflow stays within perAction", async () => {
        const { outcome } = await signUnder({ tokenBalance: { pre: 10_000_000n, post: 8_000_000n } });
        expect(outcome).toEqual({ signed: expect.stringMatching(/^0x02/) });
    });

    it("signs a clean call whose balance does not move", async () => {
        const { outcome } = await signUnder({ tokenBalance: { pre: 10_000_000n, post: 10_000_000n } });
        expect(outcome).toEqual({ signed: expect.stringMatching(/^0x02/) });
    });

    it("signs on a node that serves no eth_simulateV1: the eth_call is the bound that always runs", async () => {
        const { outcome, methods } = await signUnder({});
        expect(outcome).toEqual({ signed: expect.stringMatching(/^0x02/) });
        expect(methods).toContain("eth_simulateV1");
    });
});

// ── The signer's directory ──────────────────────────────────────────────────

describe("the signer's directory", () => {
    it("puts the socket, the audit log and the journal in one directory", () => {
        const home = "/home/owner";
        expect(resolveSignerPaths({}, home)).toEqual({
            socketPath: "/home/owner/.figaro-signer/signer.sock",
            auditPath: "/home/owner/.figaro-signer/audit.jsonl",
            journalPath: "/home/owner/.figaro-signer/window.jsonl",
        });
        expect(resolveSignerPaths({ dir: "/srv/sig" }, home).journalPath).toBe("/srv/sig/window.jsonl");
        expect(resolveSignerPaths({ socket: "/srv/x/s.sock" }, home).auditPath).toBe("/srv/x/audit.jsonl");
    });

    it("refuses the three files split across directories", () => {
        expect(() => assertOneDir({ socketPath: "/a/s.sock", auditPath: "/a/audit.jsonl", journalPath: "/b/window.jsonl" }))
            .toThrow(/one directory/);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signer-split-"));
        fs.chmodSync(dir, 0o700);
        expect(() => createSignerDaemon({
            policy: policy(), privateKey: KEY,
            socketPath: path.join(dir, "signer.sock"),
            auditPath: path.join(dir, "audit.jsonl"),
            journalPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "signer-elsewhere-")), "window.jsonl"),
        })).toThrow(/one directory/);
    });

    it("creates a missing directory for the owner alone and refuses one others can write", () => {
        const parent = fs.mkdtempSync(path.join(os.tmpdir(), "signer-dir-"));
        const fresh = path.join(parent, "fresh");
        assertPrivateDir(fresh);
        expect(fs.statSync(fresh).mode & 0o777).toBe(0o700);

        const shared = path.join(parent, "shared");
        fs.mkdirSync(shared);
        fs.chmodSync(shared, 0o777);
        expect(() => assertPrivateDir(shared)).toThrow(/writable by other users/);
        // The shared temp directory itself (sticky, world-writable).
        expect(() => assertPrivateDir("/tmp")).toThrow(/writable by other users|belongs to another user/);
    });

    it("refuses a directory another user owns", () => {
        // `/` belongs to root and is not group- or world-writable.
        expect(() => assertPrivateDir("/")).toThrow(/belongs to another user/);
    });
});

// ── The request line bound ──────────────────────────────────────────────────

describe("daemon bounds the request line", () => {
    it("refuses a line past the bound, closes that connection, and keeps serving others", async () => {
        const net = await import("node:net");
        const { MAX_REQUEST_LINE_CHARS } = await import("../src/signer/wire.js");
        const { strippingReviver } = await import("../src/safeJson.js");
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signer-line-"));
        const socketPath = path.join(dir, "signer.sock");
        const d = createSignerDaemon({
            policy: policy(), privateKey: KEY, socketPath,
            auditPath: path.join(dir, "audit.jsonl"),
            journalPath: path.join(dir, "window.jsonl"),
            simulate: async () => ({ reverted: false }),
        });
        await d.listen();
        try {
            // An endless line: written in chunks, never terminated.
            const refusal = await new Promise<{ reply: string; closed: boolean }>((resolve, reject) => {
                const conn = net.connect(socketPath);
                let reply = "";
                const chunk = "a".repeat(64 * 1024);
                conn.on("connect", () => {
                    const pump = () => {
                        while (!conn.destroyed && conn.writable) {
                            if (!conn.write(chunk)) return conn.once("drain", pump);
                        }
                    };
                    pump();
                });
                conn.on("data", (c) => { reply += c.toString("utf-8"); });
                conn.on("error", () => { /* the daemon closed mid-write */ });
                const timer = setTimeout(() => reject(new Error("the daemon never closed the connection")), 10_000);
                conn.on("close", () => { clearTimeout(timer); resolve({ reply, closed: true }); });
            });
            expect(refusal.closed).toBe(true);
            const first = JSON.parse(refusal.reply.split("\n")[0]!, strippingReviver) as { ok: boolean; error: string };
            expect(first.ok).toBe(false);
            expect(first.error).toContain(`exceeds ${MAX_REQUEST_LINE_CHARS} characters`);

            // The daemon still answers a well-formed request on a new connection.
            const health = await new Promise<{ id: number; ok: boolean }>((resolve, reject) => {
                const conn = net.connect(socketPath);
                let buf = "";
                conn.on("connect", () => conn.write(`${JSON.stringify({ id: 7, op: "health" })}\n`));
                conn.on("data", (c) => {
                    buf += c.toString("utf-8");
                    const nl = buf.indexOf("\n");
                    if (nl >= 0) { conn.end(); resolve(JSON.parse(buf.slice(0, nl), strippingReviver)); }
                });
                conn.on("error", reject);
            });
            expect(health).toMatchObject({ id: 7, ok: true });
        } finally {
            await d.close();
        }
    });
});
