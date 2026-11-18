/**
 * A test-side writer of the operation stream's layout
 * (prover/lib/src/operation_stream.rs:53-75), for the streams the Rust
 * fixture `test/fixtures/operation-stream-vectors.json` does not carry: a
 * `0x05` entry, an agreement claim, a claim on a root order, a stream fed to
 * `fetchSkippedBatchUses`. `operationStream.test.ts` holds this writer to the
 * encoder's bytes on the fixture's claim-bearing stream.
 */
import { concatHex, getAddress, numberToHex, type Hex } from "viem";
import type { SequencerCommitment, SequencerUsageClaim } from "../src/agent/sequencer.js";

export const rep = (byte: string, n: number) => `0x${byte.repeat(n)}` as Hex;

/** `commitment(seed, process_id, cumulative)` of operation_stream_vectors.rs:23. */
export function vectorCommitment(seed: number, processId: Hex, cumulative: bigint): SequencerCommitment {
    return {
        process_id: processId,
        buyer: getAddress(rep("b0", 20)),
        seller: getAddress(rep((0x50 + seed).toString(16), 20)),
        currency: getAddress(rep("c0", 20)),
        payment: String(100 * seed),
        expected_cumulative_value: cumulative.toString(),
        checkout_hash: rep((0x40 + seed).toString(16), 32),
        salt: String(seed),
        deadline: "4000000000",
    };
}

// ── A test-side writer of the layout, operation_stream.rs:53-75 ──────

export const u16 = (n: number): Hex => numberToHex(n, { size: 2 });
const word = (n: bigint): Hex => numberToHex(n, { size: 32 });
export const packCommitment = (c: SequencerCommitment): Hex =>
    concatHex([
        c.process_id, c.buyer, c.seller, c.currency,
        word(BigInt(c.payment)), word(BigInt(c.expected_cumulative_value)),
        c.checkout_hash, word(BigInt(c.salt)), word(BigInt(c.deadline)),
    ]);
const sig = (seed: string): Hex => concatHex([rep(seed, 32), rep(seed, 32), "0x1b"]);
const words = (ws: Hex[]): Hex => concatHex([u16(ws.length), ...ws]);
const bytesWithLength = (b: Hex): Hex => concatHex([u16((b.length - 2) / 2), b]);

export const commitEntry = (c: SequencerCommitment): Hex => concatHex(["0x01", packCommitment(c), sig("61"), sig("62")]);
export const resolveEntry = (processId: Hex, cs: SequencerCommitment[]): Hex =>
    concatHex(["0x02", processId, sig("63"), u16(cs.length), ...cs.map(packCommitment)]);
export const walletResolveEntry = (processId: Hex, authorization: Hex, cs: SequencerCommitment[]): Hex =>
    concatHex(["0x04", processId, bytesWithLength(authorization), u16(cs.length), ...cs.map(packCommitment)]);
export const attestEntry = (role: number, target: SequencerCommitment, authorization: Hex): Hex =>
    concatHex(["0x05", numberToHex(role, { size: 1 }), packCommitment(target), rep("d1", 32), "0x01", rep("d2", 32), bytesWithLength(authorization)]);
export function claimEntry(claim: SequencerUsageClaim): Hex {
    const k = claim.kind;
    const kindBytes: Hex =
        "Clause" in k ? concatHex(["0x00", k.Clause.clause_data_hash])
        : "Agreement" in k ? concatHex(["0x02", k.Agreement.assembly_hash])
        : concatHex(["0x01", k.Assembly.agreement_hash, k.Assembly.slot_content_hash, words(k.Assembly.membership_proof)]);
    return concatHex(["0x03", packCommitment(claim.order), claim.clause_or_assembly, kindBytes, words(claim.inclusion_proof)]);
}

export const PROCESS = rep("aa", 32);
export const FIRST = vectorCommitment(2, PROCESS, 200n);
export const SECOND = vectorCommitment(3, PROCESS, 500n);
