import { describe, expect, it } from "vitest";
import { planVaultApprovals, safeApprovalSignatures, vaultInterface } from "@/scripts/populate-clauses.mjs";

// The vault path of populate-clauses.mjs speaks a Safe or the devnet's mock
// multisig. These cases hold its pure parts: the signatures a Safe's
// execTransaction takes for owners that approved on chain, which interface a
// vault speaks given its answers, and which owners carry a transaction to
// the threshold.

const LOW = "0x1111111111111111111111111111111111111111";
const MID = "0x7777777777777777777777777777777777777777";
const HIGH = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";

const word = (hex: string) => hex.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const approval = (owner: string) => `${word(owner)}${"0".repeat(64)}01`;

describe("safeApprovalSignatures", () => {
    it("packs 65 bytes per owner: the address as r, zero s, v 1", () => {
        expect(safeApprovalSignatures([MID])).toBe(`0x${approval(MID)}`);
    });

    it("sorts the owners by ascending address, whatever the order given", () => {
        const sig = safeApprovalSignatures([HIGH, LOW, MID]);
        expect(sig).toBe(`0x${approval(LOW)}${approval(MID)}${approval(HIGH)}`);
        expect((sig.length - 2) / 2).toBe(65 * 3);
    });

    it("counts an owner named twice, in any case, once", () => {
        expect(safeApprovalSignatures([HIGH, HIGH.toLowerCase()])).toBe(`0x${approval(HIGH)}`);
    });
});

/** A client that answers the named functions and reverts every other read. */
const answering = (names: string[]) => ({
    readContract: async ({ functionName }: { functionName: string }) => {
        if (!names.includes(functionName)) throw new Error(`execution reverted: ${functionName}`);
        return functionName === "VERSION" ? "1.4.1" : 0n;
    },
});
const VAULT = "0x0000000000000000000000000000000000000abc";

describe("vaultInterface", () => {
    it("reads a Safe from VERSION() and getThreshold()", async () => {
        await expect(vaultInterface({ publicClient: answering(["VERSION", "getThreshold"]), vault: VAULT })).resolves.toBe("safe");
    });

    it("reads the mock from threshold() and executed(bytes32)", async () => {
        await expect(vaultInterface({ publicClient: answering(["threshold", "executed"]), vault: VAULT })).resolves.toBe("mock");
    });

    it("does not take a contract that answers VERSION() alone for a Safe", async () => {
        await expect(vaultInterface({ publicClient: answering(["VERSION"]), vault: VAULT })).rejects.toThrow(/answers neither/);
    });

    it("refuses an address that answers neither", async () => {
        await expect(vaultInterface({ publicClient: answering([]), vault: VAULT })).rejects.toThrow(/answers neither/);
    });
});

describe("planVaultApprovals", () => {
    it("on a Safe, counts the executor and has one other signer approve", () => {
        expect(planVaultApprovals({ threshold: 2n, executor: LOW, executorCounts: true, standing: [], signers: [LOW, MID] }))
            .toEqual({ counted: [LOW, MID], toApprove: [MID] });
    });

    it("counts an approval already on chain and sends none again", () => {
        expect(planVaultApprovals({ threshold: 2n, executor: LOW, executorCounts: true, standing: [MID.toLowerCase()], signers: [LOW, MID] }))
            .toEqual({ counted: [LOW, MID.toLowerCase()], toApprove: [] });
    });

    it("counts an owner that approved on chain without a signer in this run", () => {
        expect(planVaultApprovals({ threshold: 2n, executor: LOW, executorCounts: true, standing: [HIGH], signers: [LOW] }))
            .toEqual({ counted: [LOW, HIGH], toApprove: [] });
    });

    it("on the mock, the executor approves like any owner", () => {
        expect(planVaultApprovals({ threshold: 2n, executor: LOW, executorCounts: false, standing: [], signers: [LOW, MID, HIGH] }))
            .toEqual({ counted: [LOW, MID], toApprove: [LOW, MID] });
    });

    it("refuses when the approvals available are fewer than the threshold", () => {
        expect(() => planVaultApprovals({ threshold: 2n, executor: LOW, executorCounts: true, standing: [], signers: [LOW] }))
            .toThrow(/needs 2 approvals and 1 are available/);
    });
});
