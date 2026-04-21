/**
 * Tests for the SequencerClient — submit ops, status, error handling.
 *
 * Uses a mock fetch to simulate the sequencer HTTP API without
 * needing a running sequencer process.
 */
import { describe, it, expect } from "vitest";
import {
    SequencerClient,
    SequencerError,
    toSequencerCommitment,
    toSequencerSig,
} from "../src/agent/sequencer.js";
import type { Commitment } from "../src/types.js";
import type { SequencerOp } from "../src/agent/sequencer.js";

// ── Test fixtures ───────────────────────────────────────────────────────────

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const DUMMY_SIG = "0x" + "ab".repeat(32) + "cd".repeat(32) + "1b" as `0x${string}`;

const testCommitment: Commitment = {
    processId: ZERO_HASH,
    buyer: "0x0000000000000000000000000000000000000001",
    seller: "0x0000000000000000000000000000000000000002",
    currency: "0x0000000000000000000000000000000000000003",
    payment: 100n,
    expectedCumulativeValue: 100n,
    agreementHash: ZERO_HASH,
    salt: 42n,
    deadline: 9999n,
};

// ── Mock fetch factory ──────────────────────────────────────────────────────

function mockFetch(responses: Map<string, { status: number; body: unknown }>): typeof globalThis.fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        // Extract the path from the URL
        const urlObj = new URL(url);
        const key = `${init?.method ?? "GET"} ${urlObj.pathname}`;
        const resp = responses.get(key);
        if (!resp) {
            return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
        }
        return new Response(JSON.stringify(resp.body), {
            status: resp.status,
            headers: { "Content-Type": "application/json" },
        });
    }) as typeof globalThis.fetch;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("toSequencerCommitment", () => {
    it("converts SDK Commitment to wire format", () => {
        const sc = toSequencerCommitment(testCommitment);
        expect(sc.process_id).toBe(ZERO_HASH);
        expect(sc.buyer).toBe("0x0000000000000000000000000000000000000001");
        expect(sc.payment).toBe("100");
        expect(sc.expected_cumulative_value).toBe("100");
        expect(sc.salt).toBe("42");
        expect(sc.deadline).toBe("9999");
    });
});

describe("toSequencerSig", () => {
    it("splits a 65-byte hex signature into {v, r, s}", () => {
        const sig = toSequencerSig(DUMMY_SIG);
        expect(sig.r).toBe("0x" + "ab".repeat(32));
        expect(sig.s).toBe("0x" + "cd".repeat(32));
        expect(sig.v).toBe(0x1b);
    });

    it("throws on invalid length", () => {
        expect(() => toSequencerSig("0xdead")).toThrow("Invalid signature length");
    });
});

describe("SequencerClient.toRustEnum", () => {
    it("converts a Commit op to Rust tagged enum format", () => {
        const op: SequencerOp = {
            type: "Commit",
            commitment: toSequencerCommitment(testCommitment),
            buyer_sig: toSequencerSig(DUMMY_SIG),
            seller_sig: toSequencerSig(DUMMY_SIG),
        };
        const result = SequencerClient.toRustEnum(op);
        expect(result).toHaveProperty("Commit");
        expect(result.Commit).toHaveProperty("commitment");
        expect(result.Commit).toHaveProperty("buyer_sig");
        expect(result.Commit).toHaveProperty("seller_sig");
        expect(result).not.toHaveProperty("type");
    });

    it("converts a Resolve op to Rust tagged enum format", () => {
        const op: SequencerOp = {
            type: "Resolve",
            process_id: ZERO_HASH,
            commitments: [toSequencerCommitment(testCommitment)],
            buyer_sig: toSequencerSig(DUMMY_SIG),
        };
        const result = SequencerClient.toRustEnum(op);
        expect(result).toHaveProperty("Resolve");
        expect(result.Resolve).toHaveProperty("process_id");
        expect(result.Resolve).toHaveProperty("commitments");
    });

    it("converts a DeactivateOperator op", () => {
        const op: SequencerOp = {
            type: "DeactivateOperator",
            operator_sig: toSequencerSig(DUMMY_SIG),
        };
        const result = SequencerClient.toRustEnum(op);
        expect(result).toHaveProperty("DeactivateOperator");
        expect(result.DeactivateOperator).toHaveProperty("operator_sig");
    });
});

describe("SequencerClient", () => {
    it("submit sends POST /submit and returns operation ID", async () => {
        const client = new SequencerClient({
            url: "http://localhost:3001",
            fetch: mockFetch(
                new Map([["POST /submit", { status: 200, body: { id: 7 } }]]),
            ),
        });

        const result = await client.submitCommit(testCommitment, DUMMY_SIG, DUMMY_SIG);
        expect(result.id).toBe(7);
    });

    it("submit throws SequencerError on 400", async () => {
        const client = new SequencerClient({
            url: "http://localhost:3001",
            fetch: mockFetch(
                new Map([["POST /submit", { status: 400, body: { error: "bad signature" } }]]),
            ),
        });

        await expect(
            client.submitCommit(testCommitment, DUMMY_SIG, DUMMY_SIG),
        ).rejects.toThrow(SequencerError);
        await expect(
            client.submitCommit(testCommitment, DUMMY_SIG, DUMMY_SIG),
        ).rejects.toThrow("bad signature");
    });

    it("status returns sequencer state", async () => {
        const client = new SequencerClient({
            url: "http://localhost:3001/",
            fetch: mockFetch(
                new Map([
                    [
                        "GET /status",
                        {
                            status: 200,
                            body: {
                                state_root: "0xabc",
                                pending_ops: 3,
                                batches_settled: 5,
                            },
                        },
                    ],
                ]),
            ),
        });

        const status = await client.status();
        expect(status.state_root).toBe("0xabc");
        expect(status.pending_ops).toBe(3);
        expect(status.batches_settled).toBe(5);
    });

    it("isAvailable returns true when sequencer responds", async () => {
        const client = new SequencerClient({
            url: "http://localhost:3001",
            fetch: mockFetch(
                new Map([
                    ["GET /status", { status: 200, body: {} }],
                ]),
            ),
        });
        expect(await client.isAvailable()).toBe(true);
    });

    it("isAvailable returns false when sequencer is unreachable", async () => {
        const client = new SequencerClient({
            url: "http://localhost:3001",
            fetch: (async () => {
                throw new Error("connection refused");
            }) as typeof globalThis.fetch,
        });
        expect(await client.isAvailable()).toBe(false);
    });

    it("strips trailing slashes from URL", async () => {
        let capturedUrl = "";
        const client = new SequencerClient({
            url: "http://localhost:3001///",
            fetch: (async (input: RequestInfo | URL) => {
                capturedUrl = typeof input === "string" ? input : input.toString();
                return new Response(JSON.stringify({ id: 1 }), { status: 200 });
            }) as typeof globalThis.fetch,
        });
        await client.submitCommit(testCommitment, DUMMY_SIG, DUMMY_SIG);
        expect(capturedUrl).toBe("http://localhost:3001/submit");
    });
});
