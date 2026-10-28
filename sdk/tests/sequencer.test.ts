/**
 * Tests for the SequencerClient — submit ops, status, error handling.
 *
 * Uses a mock fetch to simulate the sequencer HTTP API without
 * needing a running sequencer process. The live pipeline (SDK →
 * sequencer binary → FigaroBatchVerifier on Anvil) is batch-e2e.test.ts.
 */
import { describe, it, expect } from "vitest";
import {
    SequencerClient,
    SequencerError,
    toSequencerCommitment,
    toSequencerSig,
} from "../src/agent/sequencer.js";
import { keccak256, stringToHex } from "viem";
import type { Commitment } from "../src/types.js";
import type { SequencerOp, SequencerContentProof } from "../src/agent/sequencer.js";

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
    checkoutHash: ZERO_HASH,
    salt: 42n,
    deadline: 9999n,
};

const testProof: SequencerContentProof = {
    spec_json: `{"clauseId":"t","version":1,"title":"T","description":"D","fields":[]}`,
    content_json: `{"modality":"delivery"}`,
    clause_data: `{"modality":"delivery"}`,
    inclusion_proof: [],
    content_kind: "RuntimeWitness",
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
            cumulative_value: testCommitment.expectedCumulativeValue.toString(),
            commitments: [toSequencerCommitment(testCommitment)],
            buyer_sig: toSequencerSig(DUMMY_SIG),
        };
        const result = SequencerClient.toRustEnum(op);
        expect(result).toHaveProperty("Resolve");
        expect(result.Resolve).toHaveProperty("process_id");
        expect(result.Resolve).toHaveProperty("cumulative_value", testCommitment.expectedCumulativeValue.toString());
        expect(result.Resolve).toHaveProperty("commitments");
    });

    it("converts an AttestAsSeller op with its plaintext witness", () => {
        // The plaintext form carries the spec bytes, content, clauseData,
        // inclusion proof and content kind, under serde's external tag.
        const op: SequencerOp = {
            type: "AttestAsSeller",
            target: toSequencerCommitment(testCommitment),
            clause_id: ZERO_HASH,
            stage: 0,
            content_ref: ZERO_HASH,
            seller_sig: toSequencerSig(DUMMY_SIG),
            proof: { Plaintext: testProof },
        };
        const result = SequencerClient.toRustEnum(op);
        expect(result).toHaveProperty("AttestAsSeller");
        expect(result.AttestAsSeller).toMatchObject({
            proof: { Plaintext: { content_kind: "RuntimeWitness" } },
        });
        expect(result.AttestAsSeller).toHaveProperty("target");
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

    it("submitResolveByWalletCode posts the wallet-code form with its authorization bytes", async () => {
        let captured: unknown;
        const client = new SequencerClient({
            url: "http://localhost:3001",
            fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
                captured = JSON.parse(init?.body as string);
                return new Response(JSON.stringify({ id: 4 }), { status: 200 });
            }) as typeof globalThis.fetch,
        });
        const authorization = "0x677561726469616e2d617070726f76616c" as const;
        const result = await client.submitResolveByWalletCode(
            ZERO_HASH,
            testCommitment.payment,
            [testCommitment],
            authorization,
        );
        expect(result.id).toBe(4);
        const body = captured as { operation: Record<string, Record<string, unknown>> };
        expect(Object.keys(body.operation)).toEqual(["ResolveByWalletCode"]);
        expect(body.operation.ResolveByWalletCode).toEqual({
            process_id: ZERO_HASH,
            cumulative_value: testCommitment.payment.toString(),
            commitments: [toSequencerCommitment(testCommitment)],
            authorization,
        });
    });

    it("submitAttestAsBuyer posts the plaintext form only when checkContentInProof is set", async () => {
        let captured: unknown;
        const client = new SequencerClient({
            url: "http://localhost:3001",
            fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
                captured = JSON.parse(init?.body as string);
                return new Response(JSON.stringify({ id: 3 }), { status: 200 });
            }) as typeof globalThis.fetch,
        });
        await client.submitAttestAsBuyer({
            target: testCommitment,
            clauseId: ZERO_HASH,
            stage: 0,
            contentRef: ZERO_HASH,
            buyerSig: DUMMY_SIG,
            clauseDataHash: keccak256(stringToHex(testProof.clause_data)),
            inclusionProof: [],
            checkContentInProof: {
                spec_json: testProof.spec_json,
                content_json: testProof.content_json,
                clause_data: testProof.clause_data,
                content_kind: "ReAssert",
            },
        });
        const body = captured as {
            operation: { AttestAsBuyer: { proof: { Plaintext: SequencerContentProof } } };
        };
        expect(body.operation.AttestAsBuyer.proof.Plaintext).toEqual({
            spec_json: testProof.spec_json,
            content_json: testProof.content_json,
            clause_data: testProof.clause_data,
            inclusion_proof: [],
            content_kind: "ReAssert",
        });
    });

    it("refuses a plaintext form whose clauseData is not the clauseDataHash", async () => {
        const client = new SequencerClient({
            url: "http://localhost:3001",
            fetch: (async () => new Response(JSON.stringify({ id: 1 }), { status: 200 })) as typeof globalThis.fetch,
        });
        await expect(
            client.submitAttestAsSeller({
                target: testCommitment,
                clauseId: ZERO_HASH,
                stage: 0,
                contentRef: ZERO_HASH,
                sellerSig: DUMMY_SIG,
                clauseDataHash: keccak256(stringToHex(`{"modality":"pickup"}`)),
                inclusionProof: [],
                checkContentInProof: {
                    spec_json: testProof.spec_json,
                    content_json: testProof.content_json,
                    clause_data: testProof.clause_data,
                    content_kind: "RuntimeWitness",
                },
            }),
        ).rejects.toThrow("clauseDataHash");
    });

    it("the default attestation submission carries the coordinator's arguments and no plaintext field", async () => {
        let raw = "";
        const client = new SequencerClient({
            url: "http://localhost:3001",
            fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
                raw = init?.body as string;
                return new Response(JSON.stringify({ id: 5 }), { status: 200 });
            }) as typeof globalThis.fetch,
        });
        const clauseDataHash = keccak256(stringToHex(testProof.clause_data));
        const sibling = keccak256(stringToHex("a sibling leaf"));
        await client.submitAttestAsSeller({
            target: testCommitment,
            clauseId: ZERO_HASH,
            stage: 0,
            contentRef: ZERO_HASH,
            sellerSig: DUMMY_SIG,
            clauseDataHash,
            inclusionProof: [sibling],
        });
        const body = JSON.parse(raw) as { operation: { AttestAsSeller: { proof: unknown } } };
        expect(body.operation.AttestAsSeller.proof).toEqual({
            HashOnly: { clause_data_hash: clauseDataHash, inclusion_proof: [sibling] },
        });
        for (const field of ["spec_json", "content_json", "clause_data\"", "content_kind", "Plaintext"]) {
            expect(raw).not.toContain(field);
        }
    });

    it("submitAttestAsSeller posts the target order alone, the seller's own order", async () => {
        let captured: unknown;
        const client = new SequencerClient({
            url: "http://localhost:3001",
            fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
                captured = JSON.parse(init?.body as string);
                return new Response(JSON.stringify({ id: 4 }), { status: 200 });
            }) as typeof globalThis.fetch,
        });
        await client.submitAttestAsSeller({
            target: testCommitment,
            clauseId: ZERO_HASH,
            stage: 0,
            contentRef: ZERO_HASH,
            sellerSig: DUMMY_SIG,
            clauseDataHash: keccak256(stringToHex(testProof.clause_data)),
            inclusionProof: [],
        });
        const body = captured as { operation: { AttestAsSeller: Record<string, unknown> } };
        expect(body.operation.AttestAsSeller).toHaveProperty("target");
        expect(body.operation.AttestAsSeller).not.toHaveProperty("role");
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
                                dead_lettered_ops: 1,
                                dropped_usage_claims: 2,
                                last_dropped_claim_error: "dropped at batch formation: UsageOrderNotResolved",
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
        // Claims are counted apart from the operations.
        expect(status.dead_lettered_ops).toBe(1);
        expect(status.dropped_usage_claims).toBe(2);
        expect(status.last_dropped_claim_error).toContain("UsageOrderNotResolved");
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
