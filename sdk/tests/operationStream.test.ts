/**
 * The operation stream's usage-claim entries, read in TypeScript.
 *
 * `FigaroBatchVerifier` logs every batch's stream (`BatchOperations`), and
 * the stream carries each usage claim whole. `usageClaimsOfOperationStream`
 * reads those claims and walks every other entry by its own length, as
 * `decode_operation_stream` does (prover/lib/src/operation_stream.rs:238).
 *
 * Parity with the Rust encoder: `test/fixtures/operation-stream-vectors.json`
 * is written by `prover/lib/tests/operation_stream_vectors.rs` from
 * `encode_operation_stream`, and that file's
 * `the_committed_fixture_is_what_the_encoder_produces` holds the committed
 * bytes to the encoder on every cargo run. Its streams carry commits,
 * resolves, wallet-code resolves, wallet-code attestations of both roles and
 * claims of all three kinds. The test-side writer (`operationStreamWriter.ts`)
 * is held here to the encoder's bytes, entry for entry, on the fixture's two
 * claim-bearing streams, so the hand-written streams below are built from
 * entries the encoder agrees with.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { concatHex, numberToHex, size, slice, stringToHex, type Hex } from "viem";
import { usageClaimsOfOperationStream } from "../src/operationStream.js";
import type { SequencerUsageClaim } from "../src/agent/sequencer.js";
import {
    FIRST, PROCESS, SECOND, attestEntry, claimEntry, commitEntry, packCommitment, rep, resolveEntry, u16, vectorCommitment, walletResolveEntry,
} from "./operationStreamWriter.js";

const FIXTURE = path.resolve(__dirname, "../../test/fixtures/operation-stream-vectors.json");
const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
    streamCount: number;
    streams: { name: string; stream: Hex; entryCount: number; claimCount: number }[];
};
const streamNamed = (name: string): Hex => {
    const s = fixture.streams.find((v) => v.name === name);
    if (!s) throw new Error(`the fixture has no stream ${name}`);
    return s.stream;
};

describe("the usage claims of an operation stream the Rust encoder wrote (test/fixtures/operation-stream-vectors.json)", () => {
    it("reads the two claims of claimsAfterOperations whole, as operation_stream_vectors.rs:77-94 builds them", () => {
        expect(usageClaimsOfOperationStream(streamNamed("claimsAfterOperations"))).toEqual([
            {
                order: FIRST,
                clause_or_assembly: rep("80", 32),
                kind: { Clause: { clause_data_hash: rep("81", 32) } },
                inclusion_proof: [rep("82", 32)],
            },
            {
                order: SECOND,
                clause_or_assembly: rep("90", 32),
                kind: { Assembly: { agreement_hash: rep("91", 32), slot_content_hash: rep("92", 32), membership_proof: [rep("93", 32), rep("94", 32)] } },
                inclusion_proof: [],
            },
        ]);
    });

    it("walks every fixture stream to its end and reads as many claims as the encoder wrote", () => {
        expect(fixture.streams).toHaveLength(fixture.streamCount);
        for (const v of fixture.streams) {
            expect(usageClaimsOfOperationStream(v.stream), v.name).toHaveLength(v.claimCount);
        }
    });

    it("the test-side writer reproduces the encoder's bytes for the claim-bearing stream", () => {
        const [claim, assemblyClaim] = usageClaimsOfOperationStream(streamNamed("claimsAfterOperations"));
        const commit = concatHex(["0x01", packCommitment(FIRST), concatHex([rep("63", 32), rep("73", 32), "0x1c"]), concatHex([rep("64", 32), rep("74", 32), "0x1b"])]);
        expect(concatHex([commit, claimEntry(claim), claimEntry(assemblyClaim)]).toLowerCase()).toBe(streamNamed("claimsAfterOperations"));
    });
});

describe("wallet-code attestations of both roles and an agreement claim, as the Rust encoder wrote them (walletCodeAttestationsAndAnAgreementClaim)", () => {
    // operation_stream_vectors.rs:72-260, `vectors()`: `root` is commitment(1, 0, 100),
    // committed under signature(1) and signature(2); the seller of `first`
    // attests with seed 1 and 17 bytes, the buyer of `root` with seed 2 and
    // none (clause id 0xD0+seed, stage seed, content ref 0xE0+seed).
    const ROOT = vectorCommitment(1, rep("00", 32), 100n);
    const AGREEMENT_CLAIM: SequencerUsageClaim = {
        order: SECOND,
        clause_or_assembly: rep("a1", 32),
        kind: { Agreement: { assembly_hash: rep("a2", 32) } },
        inclusion_proof: [rep("a3", 32), rep("a4", 32)],
    };
    const SELLER_AUTHORIZATION = stringToHex("seller-guardian-1");
    const entries: [string, Hex, number][] = [
        // 0x01, a commitment, two signatures: 1 + 252 + 2 × 65.
        ["the root commit", concatHex(["0x01", packCommitment(ROOT), concatHex([rep("61", 32), rep("71", 32), "0x1c"]), concatHex([rep("62", 32), rep("72", 32), "0x1b"])]), 383],
        // 0x05, role, a commitment, clause id, stage, content ref, len(2), 17 bytes.
        ["the seller's wallet-code attestation", attestEntry(0, FIRST, SELLER_AUTHORIZATION, { clauseId: rep("d1", 32), stage: 1, contentRef: rep("e1", 32) }), 1 + 1 + 252 + 32 + 1 + 32 + 2 + 17],
        // The same with no authorization byte.
        ["the buyer's wallet-code attestation", attestEntry(1, ROOT, "0x", { clauseId: rep("d2", 32), stage: 2, contentRef: rep("e2", 32) }), 1 + 1 + 252 + 32 + 1 + 32 + 2],
        // 0x03, a commitment, key, kind 0x02, assembly hash, a proof of two words.
        ["the agreement claim", claimEntry(AGREEMENT_CLAIM), 1 + 252 + 32 + 1 + 32 + 2 + 2 * 32],
    ];
    const stream = streamNamed("walletCodeAttestationsAndAnAgreementClaim");

    it("reads the agreement claim whole", () => {
        expect(usageClaimsOfOperationStream(stream)).toEqual([AGREEMENT_CLAIM]);
    });

    it("the test-side writer reproduces the encoder's bytes, entry for entry", () => {
        for (const [what, bytes, length] of entries) expect(size(bytes), what).toBe(length);
        expect(concatHex(entries.map(([, bytes]) => bytes)).toLowerCase()).toBe(stream);
    });

    it("walks each entry by the encoder's length: the stream cut at an entry's end reads, cut one byte short it is refused", () => {
        let end = 0;
        for (const [what, , length] of entries) {
            end += length;
            const whole = slice(stream, 0, end);
            const short = slice(stream, 0, end - 1);
            expect(() => usageClaimsOfOperationStream(whole), what).not.toThrow();
            expect(() => usageClaimsOfOperationStream(short), what).toThrow(/ends at byte/);
        }
        expect(end).toBe(size(stream));
    });
});

describe("a stream that mixes commits, resolves, wallet-code attestations and usage claims", () => {
    const AGREEMENT_CLAIM: SequencerUsageClaim = {
        order: SECOND,
        clause_or_assembly: rep("a1", 32),
        kind: { Agreement: { assembly_hash: rep("a2", 32) } },
        inclusion_proof: [rep("a3", 32), rep("a4", 32)],
    };
    const CLAUSE_CLAIM: SequencerUsageClaim = {
        order: FIRST,
        clause_or_assembly: rep("80", 32),
        kind: { Clause: { clause_data_hash: rep("81", 32) } },
        inclusion_proof: [],
    };
    const authorization300 = concatHex(Array.from({ length: 300 }, (_, i) => numberToHex(i % 256, { size: 1 })));
    const mixed = concatHex([
        commitEntry(FIRST),
        commitEntry(SECOND),
        walletResolveEntry(PROCESS, authorization300, [FIRST, SECOND]),
        resolveEntry(PROCESS, [FIRST, SECOND]),
        attestEntry(0, FIRST, "0x"),
        attestEntry(1, SECOND, authorization300),
        claimEntry(AGREEMENT_CLAIM),
        claimEntry(CLAUSE_CLAIM),
    ]);

    it("skips each other entry by its own length and reads the claims in order", () => {
        expect(usageClaimsOfOperationStream(mixed)).toEqual([AGREEMENT_CLAIM, CLAUSE_CLAIM]);
    });

    it("an empty stream and a stream of commits and resolves carry no claim", () => {
        expect(usageClaimsOfOperationStream("0x")).toEqual([]);
        expect(usageClaimsOfOperationStream(streamNamed("twoOrdersCommittedAndResolved"))).toEqual([]);
    });
});

describe("a malformed stream is refused whole, as decode_operation_stream refuses it", () => {
    const good = streamNamed("claimsAfterOperations");
    const cases: [string, Hex, RegExp][] = [
        ["a short read", good.slice(0, -2) as Hex, /ends at byte/],
        ["a trailing byte", concatHex([good, "0x03"]), /ends at byte/],
        ["an unknown tag", concatHex([good, "0x06"]), /unknown stream tag 0x06/],
        ["an unknown usage kind", concatHex(["0x03", packCommitment(FIRST), rep("80", 32), "0x03", rep("81", 32), u16(0)]), /unknown usage claim kind 0x03/],
        ["an unknown attester role", attestEntry(2, FIRST, "0x"), /unknown attester role 0x02/],
        ["a commit after a usage claim", concatHex([good, commitEntry(FIRST)]), /a commit after a usage claim/],
        ["a resolve after a wallet-code attestation", concatHex([attestEntry(0, FIRST, "0x"), resolveEntry(PROCESS, [FIRST])]), /a resolve after/],
        ["a wallet-code attestation after a usage claim", concatHex([good, attestEntry(0, FIRST, "0x")]), /a wallet-code attestation after a usage claim/],
        [
            "a resolve whose payments overflow",
            resolveEntry(PROCESS, [{ ...FIRST, payment: (2n ** 256n - 1n).toString() }, FIRST]),
            /payments overflow/,
        ],
        ["a hex string of odd length", "0x123" as Hex, /hex/],
    ];
    for (const [what, stream, message] of cases) {
        it(`refuses ${what}`, () => {
            expect(() => usageClaimsOfOperationStream(stream)).toThrow(message);
        });
    }
});
