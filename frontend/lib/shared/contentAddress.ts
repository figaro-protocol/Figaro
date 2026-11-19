/**
 * Content addressing — whether fetched bytes are the content an IPFS URI
 * names.
 *
 * A registry entry carries a content URI (`ipfs://<cid>`); a gateway or any
 * transport between it and the reader can serve other bytes. This module
 * recomputes the CID of the bytes in hand, in the form the URI's CID states,
 * and compares. It is pure: no I/O, no trust in the gateway's headers.
 *
 * The forms it verifies are the ones a Kubo `add` (and a pinning service's
 * upload) and a Kubo `block/put` produce for one file:
 *
 * 1. CIDv0 (`Qm…`): a UnixFS file in dag-pb blocks under sha2-256 — Kubo's
 *    `add` default, which `pinBlob`, `pinJSON` and `populate-clauses.mjs` use.
 * 2. CIDv1 with the raw codec (`bafk…`): the bytes as one block — `add
 *    --cid-version=1` for a file of one chunk, and `block/put`.
 * 3. CIDv1 with the dag-pb codec (`bafy…`): a UnixFS file — `add
 *    --cid-version=1 --raw-leaves=false`.
 *
 * Each under sha2-256 or keccak-256, and each in multibase base32 (`b`),
 * base16 (`f`) or base58btc (`z`) for CIDv1. A UnixFS file is rebuilt with
 * Kubo's default import: 262144-byte chunks under a balanced root of at most
 * 174 links, the leaves raw blocks or dag-pb blocks.
 * Any other form — another hash function, another codec, another chunker, a
 * deeper tree, an `http(s)://` locator — is `unverifiable`, never trusted.
 */

import { keccak256, sha256 } from "viem";

/** The outcome of a check: the bytes are the content the URI names, are not,
 *  or the URI names its content in a form this module cannot recompute. */
export type ContentAddressCheck = "match" | "mismatch" | "unverifiable";

const CODEC_RAW = 0x55;
const CODEC_DAG_PB = 0x70;
const HASH_SHA2_256 = 0x12;
const HASH_KECCAK_256 = 0x1b;

/** Kubo's default chunk size and balanced-layout fan-out. */
const CHUNK_SIZE = 262_144;
const MAX_LINKS = 174;

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function base58Decode(text: string): Uint8Array | null {
    let value = 0n;
    for (const ch of text) {
        const digit = BASE58_ALPHABET.indexOf(ch);
        if (digit < 0) return null;
        value = value * 58n + BigInt(digit);
    }
    const body: number[] = [];
    while (value > 0n) {
        body.unshift(Number(value & 0xffn));
        value >>= 8n;
    }
    let zeros = 0;
    while (zeros < text.length && text[zeros] === "1") zeros++;
    return Uint8Array.from([...new Array<number>(zeros).fill(0), ...body]);
}

function base32Decode(text: string): Uint8Array | null {
    const out: number[] = [];
    let bits = 0;
    let value = 0;
    for (const ch of text) {
        const digit = BASE32_ALPHABET.indexOf(ch);
        if (digit < 0) return null;
        value = ((value << 5) | digit) & 0xffff;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Uint8Array.from(out);
}

function base16Decode(text: string): Uint8Array | null {
    if (text.length % 2 !== 0 || !/^[0-9a-f]*$/.test(text)) return null;
    const out = new Uint8Array(text.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(text.slice(2 * i, 2 * i + 2), 16);
    return out;
}

/** An unsigned varint at `at`; `null` when it runs past the end or past 2^53. */
function readVarint(bytes: Uint8Array, at: number): { value: number; next: number } | null {
    let value = 0;
    let scale = 1;
    for (let i = at; i < bytes.length && i < at + 8; i++) {
        value += (bytes[i] & 0x7f) * scale;
        if ((bytes[i] & 0x80) === 0) return { value, next: i + 1 };
        scale *= 128;
    }
    return null;
}

function varint(value: number): number[] {
    const out: number[] = [];
    let rest = value;
    while (rest >= 0x80) {
        out.push((rest % 0x80) | 0x80);
        rest = Math.floor(rest / 0x80);
    }
    out.push(rest);
    return out;
}

/** A CID taken apart: its version, its codec, its hash function and digest. */
interface ParsedCid {
    version: 0 | 1;
    codec: number;
    hashCode: number;
    digest: Uint8Array;
}

/** The CID a URI names: `ipfs://<cid>`, `/ipfs/<cid>` or a bare CID, with no
 *  path below it (a path names a file inside a directory, which the bytes of
 *  that file alone cannot prove). */
function cidOfUri(uri: string): string | null {
    const bare = uri.startsWith("ipfs://") ? uri.slice("ipfs://".length) : uri.startsWith("/ipfs/") ? uri.slice("/ipfs/".length) : uri;
    return /^[A-Za-z0-9]+$/.test(bare) ? bare : null;
}

function parseMultihash(bytes: Uint8Array, at: number): { hashCode: number; digest: Uint8Array } | null {
    const code = readVarint(bytes, at);
    if (code === null) return null;
    const length = readVarint(bytes, code.next);
    if (length === null || length.next + length.value !== bytes.length) return null;
    return { hashCode: code.value, digest: bytes.slice(length.next) };
}

function parseCid(cid: string): ParsedCid | null {
    if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid)) {
        const bytes = base58Decode(cid);
        const mh = bytes && parseMultihash(bytes, 0);
        return mh ? { version: 0, codec: CODEC_DAG_PB, ...mh } : null;
    }
    const body = cid.slice(1);
    const bytes = cid[0] === "b" ? base32Decode(body) : cid[0] === "f" ? base16Decode(body) : cid[0] === "z" ? base58Decode(body) : null;
    if (bytes === null || bytes[0] !== 0x01) return null;
    const codec = readVarint(bytes, 1);
    if (codec === null) return null;
    const mh = parseMultihash(bytes, codec.next);
    return mh ? { version: 1, codec: codec.value, ...mh } : null;
}

function digestOf(hashCode: number, block: Uint8Array): Uint8Array | null {
    if (hashCode === HASH_SHA2_256) return sha256(block, "bytes");
    if (hashCode === HASH_KECCAK_256) return keccak256(block, "bytes");
    return null;
}

/** The binary CID of a block: CIDv0 is the bare multihash, CIDv1 is prefixed
 *  with its version and codec. */
function cidBytes(version: 0 | 1, codec: number, hashCode: number, digest: Uint8Array): number[] {
    const multihash = [...varint(hashCode), ...varint(digest.length), ...digest];
    return version === 0 ? multihash : [0x01, ...varint(codec), ...multihash];
}

/** A protobuf length-delimited field. */
function lengthDelimited(field: number, payload: ArrayLike<number>): number[] {
    return [(field << 3) | 2, ...varint(payload.length), ...Array.from(payload)];
}

/** A UnixFS `Data` message of type File. */
function unixfsFile(data: Uint8Array | null, filesize: number, blocksizes: readonly number[]): number[] {
    return [
        0x08, 0x02,
        ...(data !== null ? lengthDelimited(2, data) : []),
        0x18, ...varint(filesize),
        ...blocksizes.flatMap((size) => [0x20, ...varint(size)]),
    ];
}

/** A dag-pb node in its canonical encoding: the links (field 2), then the
 *  data (field 1). A link is its hash, an empty name and its cumulative size. */
function dagPbNode(links: readonly { cid: number[]; tsize: number }[], data: number[]): Uint8Array {
    const encodedLinks = links.flatMap((link) => lengthDelimited(2, [...lengthDelimited(1, link.cid), 0x12, 0x00, 0x18, ...varint(link.tsize)]));
    return Uint8Array.from([...encodedLinks, ...lengthDelimited(1, data)]);
}

/** The candidate root blocks of `bytes` imported as a UnixFS file under
 *  Kubo's default balanced layout: one block for a file of one chunk; for
 *  more, one root with raw leaves and one with dag-pb leaves, since the root's
 *  CID does not say which the importer used. Empty when the file needs a
 *  deeper tree. */
function unixfsRoots(bytes: Uint8Array, cid: ParsedCid): Uint8Array[] {
    if (bytes.length <= CHUNK_SIZE) return [dagPbNode([], unixfsFile(bytes, bytes.length, []))];
    const chunks: Uint8Array[] = [];
    for (let at = 0; at < bytes.length; at += CHUNK_SIZE) chunks.push(bytes.subarray(at, at + CHUNK_SIZE));
    if (chunks.length > MAX_LINKS) return [];
    const rootData = unixfsFile(null, bytes.length, chunks.map((c) => c.length));
    const roots: Uint8Array[] = [];
    for (const rawLeaves of [true, false]) {
        // A raw leaf is always a CIDv1; a dag-pb leaf takes the root's version.
        const leafVersion = rawLeaves ? 1 : cid.version;
        const links: { cid: number[]; tsize: number }[] = [];
        for (const chunk of chunks) {
            const leaf = rawLeaves ? chunk : dagPbNode([], unixfsFile(chunk, chunk.length, []));
            const digest = digestOf(cid.hashCode, leaf);
            if (digest === null) return [];
            links.push({ cid: cidBytes(leafVersion, rawLeaves ? CODEC_RAW : CODEC_DAG_PB, cid.hashCode, digest), tsize: leaf.length });
        }
        roots.push(dagPbNode(links, rootData));
    }
    return roots;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
    return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

/**
 * Whether `bytes` are the content the IPFS URI names. `unverifiable` for a
 * URI that names no CID or names one in a form listed above as not
 * recomputed; a caller reads both `mismatch` and `unverifiable` as a document
 * it does not accept.
 */
export function checkContentAddress(uri: string, bytes: Uint8Array): ContentAddressCheck {
    const text = cidOfUri(uri);
    const cid = text === null ? null : parseCid(text);
    if (cid === null || digestOf(cid.hashCode, new Uint8Array()) === null) return "unverifiable";
    const blocks = cid.codec === CODEC_RAW ? [bytes] : cid.codec === CODEC_DAG_PB ? unixfsRoots(bytes, cid) : [];
    if (blocks.length === 0) return "unverifiable";
    return blocks.some((block) => equalBytes(digestOf(cid.hashCode, block) as Uint8Array, cid.digest)) ? "match" : "mismatch";
}
