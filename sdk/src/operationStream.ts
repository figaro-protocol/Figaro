/**
 * The usage claims of a batch's operation stream.
 *
 * `FigaroBatchVerifier.settleBatch` takes the stream as calldata, refuses a
 * batch whose bytes do not hash to the proof's committed word, and logs the
 * stream in `BatchOperations` on every call route. The layout is the guest's
 * (`prover/lib/src/operation_stream.rs:53-75`); this reader mirrors its
 * decoder, `decode_operation_stream` (operation_stream.rs:238-340), and
 * keeps only the usage claims. Every other entry is walked by its own
 * length and checked as the Rust decoder checks it, so a claim is never read
 * from bytes that belong to another entry.
 */
import { bytesToHex, getAddress, hexToBytes, isHex, type Hex } from "viem";
import type { SequencerCommitment, SequencerUsageClaim } from "./agent/sequencer.js";

// operation_stream.rs:84-88
const TAG_COMMIT = 0x01;
const TAG_RESOLVE = 0x02;
const TAG_USAGE_CLAIM = 0x03;
const TAG_RESOLVE_BY_WALLET_CODE = 0x04;
const TAG_ATTEST_BY_WALLET_CODE = 0x05;

// prover/lib/src/types.rs:340-344, the kind byte `UsageClaimKind::code()`.
const KIND_CLAUSE = 0x00;
const KIND_PROCESS = 0x01;
const KIND_AGREEMENT = 0x02;

/** operation_stream.rs:124, `COMMITMENT_BYTES`. */
const COMMITMENT_BYTES = 32 + 20 + 20 + 20 + 32 + 32 + 32 + 32 + 32;
/** operation_stream.rs:126, `SIGNATURE_BYTES`: r(32) s(32) v(1). */
const SIGNATURE_BYTES = 65;

const MAX_UINT256 = (1n << 256n) - 1n;

/** The Rust `Reader` (operation_stream.rs:381-445), with its error words. */
class Reader {
    pos = 0;
    constructor(private readonly data: Uint8Array) {}
    done(): boolean {
        return this.pos >= this.data.length;
    }
    take(n: number): Uint8Array {
        if (this.pos + n > this.data.length) {
            throw new Error(`stream ends at byte ${this.data.length} while ${n} more were needed at byte ${this.pos}`);
        }
        const s = this.data.subarray(this.pos, this.pos + n);
        this.pos += n;
        return s;
    }
    u8(): number {
        return this.take(1)[0];
    }
    /** A big-endian `u16` count or length (operation_stream.rs:405). */
    count(): number {
        const b = this.take(2);
        return (b[0] << 8) | b[1];
    }
    b256(): Hex {
        return bytesToHex(this.take(32));
    }
    u256(): bigint {
        return BigInt(bytesToHex(this.take(32)));
    }
    address(): Hex {
        return getAddress(bytesToHex(this.take(20)));
    }
    /** operation_stream.rs:424-436 and :64-65: the nine fields, packed. */
    commitment(): SequencerCommitment {
        return {
            process_id: this.b256(),
            buyer: this.address(),
            seller: this.address(),
            token: this.address(),
            payment: this.u256().toString(),
            running_total: this.u256().toString(),
            checkout_hash: this.b256(),
            salt: this.u256().toString(),
            commit_deadline: this.u256().toString(),
        };
    }
    /** operation_stream.rs:437-444 and :72: count(2) word(32)*. */
    words(): Hex[] {
        const n = this.count();
        const out: Hex[] = [];
        for (let i = 0; i < n; i++) out.push(this.b256());
        return out;
    }
    /** A resolve's commitments, refused when their payments overflow a word
     *  (operation_stream.rs:261-267, `resolved_running_total`). */
    resolvedCommitments(): void {
        const n = this.count();
        let sum = 0n;
        for (let i = 0; i < n; i++) {
            sum += BigInt(this.commitment().payment);
            if (sum > MAX_UINT256) throw new Error("a resolve whose payments overflow");
        }
    }
}

/**
 * Read every usage claim a batch's operation stream carries, in the order
 * the guest applied them, each in the wire form
 * `SequencerClient.submitUsageClaim` sends: the claim whole, its order, key,
 * kind and proofs, so it can be sent again without the agreement.
 *
 * Strict as `decode_operation_stream` is: an unknown tag, attester role or
 * claim kind, a short read, a trailing byte, an entry out of its place (a
 * commit or resolve after a `0x05` or a `0x03`, a `0x05` after a `0x03`),
 * a resolve whose payments overflow a word, or input that is not hex of
 * whole bytes throws. No partial list is returned.
 */
export function usageClaimsOfOperationStream(stream: Hex): SequencerUsageClaim[] {
    if (!isHex(stream, { strict: true }) || stream.length % 2 !== 0) {
        throw new Error("an operation stream is hex of whole bytes");
    }
    const r = new Reader(hexToBytes(stream));
    const claims: SequencerUsageClaim[] = [];
    let attestations = 0;
    while (!r.done()) {
        const tag = r.u8();
        switch (tag) {
            case TAG_COMMIT: // operation_stream.rs:245-254, :54
                if (claims.length > 0 || attestations > 0) throw new Error("a commit after a usage claim or a wallet-code attestation");
                r.take(COMMITMENT_BYTES + 2 * SIGNATURE_BYTES);
                break;
            case TAG_RESOLVE: // operation_stream.rs:255-274, :55
                if (claims.length > 0 || attestations > 0) throw new Error("a resolve after a usage claim or a wallet-code attestation");
                r.take(32 + SIGNATURE_BYTES);
                r.resolvedCommitments();
                break;
            case TAG_RESOLVE_BY_WALLET_CODE: // operation_stream.rs:275-295, :57
                if (claims.length > 0 || attestations > 0) throw new Error("a resolve after a usage claim or a wallet-code attestation");
                r.take(32);
                r.take(r.count());
                r.resolvedCommitments();
                break;
            case TAG_ATTEST_BY_WALLET_CODE: { // operation_stream.rs:296-310, :59-61
                if (claims.length > 0) throw new Error("a wallet-code attestation after a usage claim");
                const role = r.u8();
                if (role !== 0x00 && role !== 0x01) {
                    throw new Error(`unknown attester role 0x${role.toString(16).padStart(2, "0")}`);
                }
                r.take(COMMITMENT_BYTES + 32 + 1 + 32);
                r.take(r.count());
                attestations++;
                break;
            }
            case TAG_USAGE_CLAIM: { // operation_stream.rs:311-335, :56, :67-69
                const order = r.commitment();
                const clauseOrProcess = r.b256();
                const kindByte = r.u8();
                let kind: SequencerUsageClaim["kind"];
                if (kindByte === KIND_CLAUSE) {
                    kind = { Clause: { clause_data_hash: r.b256() } };
                } else if (kindByte === KIND_AGREEMENT) {
                    kind = { Agreement: { process_design_hash: r.b256() } };
                } else if (kindByte === KIND_PROCESS) {
                    const agreementHash = r.b256();
                    const contentHash = r.b256();
                    kind = { Process: { agreement_hash: agreementHash, agreement_content_hash: contentHash, membership_proof: r.words() } };
                } else {
                    throw new Error(`unknown usage claim kind 0x${kindByte.toString(16).padStart(2, "0")}`);
                }
                claims.push({ order, clause_or_process: clauseOrProcess, kind, inclusion_proof: r.words() });
                break;
            }
            default:
                throw new Error(`unknown stream tag 0x${tag.toString(16).padStart(2, "0")} at byte ${r.pos - 1}`);
        }
    }
    return claims;
}
