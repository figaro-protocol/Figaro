/**
 * One unary gRPC-Web call to an xmtpd node, made by hand from Node's fetch:
 * the frames, the trailer and the two protobuf messages of
 * `xmtp.xmtpv4.message_api.ReplicationApi/GetInboxIds`.
 *
 * The messages, as xmtpd v1.3.0 defines them
 * (`pkg/proto/xmtpv4/message_api/message_api.pb.go`,
 * `pkg/proto/identity/associations/association.pb.go`):
 *
 *   GetInboxIdsRequest  { repeated Request requests = 1; }
 *   GetInboxIdsRequest.Request { string identifier = 1; IdentifierKind identifier_kind = 2; }
 *   GetInboxIdsResponse { repeated Response responses = 1; }
 *   GetInboxIdsResponse.Response { string identifier = 1; optional string inbox_id = 2; IdentifierKind identifier_kind = 3; }
 *   IdentifierKind { UNSPECIFIED = 0; ETHEREUM = 1; PASSKEY = 2; }
 *
 * A gRPC-Web body is a run of frames: one flag byte, a big-endian uint32
 * length, then that many bytes. Flag 0x00 carries a message; flag 0x80
 * carries the trailer, HTTP header lines that hold `grpc-status` and
 * `grpc-message`.
 */
import { lengthDelimited, readVarint, varint } from '@/lib/shared/contentAddress';

/** `IdentifierKind.IDENTIFIER_KIND_ETHEREUM`. */
export const XMTP_IDENTIFIER_KIND_ETHEREUM = 1;

const FRAME_DATA = 0x00;
const FRAME_TRAILER = 0x80;

/** One entry of `GetInboxIdsResponse.responses`. */
export interface XmtpInboxIdEntry {
    identifier: string;
    inboxId?: string;
    identifierKind: number;
}

/** `GetInboxIdsRequest` asking for the inbox of one Ethereum address. */
export function encodeGetInboxIdsRequest(identifier: string): Uint8Array {
    const request = [
        ...lengthDelimited(1, new TextEncoder().encode(identifier)),
        (2 << 3) | 0, ...varint(XMTP_IDENTIFIER_KIND_ETHEREUM),
    ];
    return Uint8Array.from(lengthDelimited(1, request));
}

/** A message wrapped in one gRPC-Web data frame. */
export function grpcWebFrame(message: Uint8Array): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(5 + message.length);
    out[0] = FRAME_DATA;
    new DataView(out.buffer).setUint32(1, message.length, false);
    out.set(message, 5);
    return out;
}

/** The fields of one protobuf message, in order. A varint field carries
 *  `value`; a length-delimited field carries `bytes`. Fixed-width fields are
 *  stepped over. */
function protobufFields(bytes: Uint8Array): { field: number; value?: number; bytes?: Uint8Array }[] {
    const fields: { field: number; value?: number; bytes?: Uint8Array }[] = [];
    let at = 0;
    while (at < bytes.length) {
        const key = readVarint(bytes, at);
        if (key === null) throw new Error('protobuf: a field key runs past the end');
        const field = Math.floor(key.value / 8);
        const wireType = key.value % 8;
        at = key.next;
        if (wireType === 0) {
            const value = readVarint(bytes, at);
            if (value === null) throw new Error(`protobuf: field ${field} runs past the end`);
            fields.push({ field, value: value.value });
            at = value.next;
        } else if (wireType === 2) {
            const length = readVarint(bytes, at);
            if (length === null || length.next + length.value > bytes.length) {
                throw new Error(`protobuf: field ${field} runs past the end`);
            }
            fields.push({ field, bytes: bytes.slice(length.next, length.next + length.value) });
            at = length.next + length.value;
        } else if (wireType === 1 || wireType === 5) {
            at += wireType === 1 ? 8 : 4;
            if (at > bytes.length) throw new Error(`protobuf: field ${field} runs past the end`);
        } else {
            throw new Error(`protobuf: field ${field} has wire type ${wireType}, which this reader does not take`);
        }
    }
    return fields;
}

/** The entries of a `GetInboxIdsResponse`. */
export function decodeGetInboxIdsResponse(bytes: Uint8Array): XmtpInboxIdEntry[] {
    const text = new TextDecoder();
    return protobufFields(bytes)
        .filter((f) => f.field === 1 && f.bytes)
        .map((f) => {
            const entry: XmtpInboxIdEntry = { identifier: '', identifierKind: 0 };
            for (const inner of protobufFields(f.bytes!)) {
                if (inner.field === 1 && inner.bytes) entry.identifier = text.decode(inner.bytes);
                else if (inner.field === 2 && inner.bytes) entry.inboxId = text.decode(inner.bytes);
                else if (inner.field === 3 && inner.value !== undefined) entry.identifierKind = inner.value;
            }
            return entry;
        });
}

/** The message of a unary gRPC-Web reply. Throws with `grpc-message` when
 *  `grpc-status` is not 0. The status is read from the trailer frame, or from
 *  the HTTP headers when the node sent a reply with no body. */
export function grpcWebUnaryMessage(body: Uint8Array, headers?: Headers): Uint8Array {
    let message = new Uint8Array(0);
    const trailer = new Map<string, string>();
    let at = 0;
    while (at < body.length) {
        if (at + 5 > body.length) throw new Error('gRPC-Web: a frame header runs past the end');
        const flag = body[at];
        const length = new DataView(body.buffer, body.byteOffset + at + 1, 4).getUint32(0, false);
        const start = at + 5;
        if (start + length > body.length) throw new Error('gRPC-Web: a frame runs past the end');
        const payload = body.slice(start, start + length);
        if (flag === FRAME_DATA) message = payload;
        else if (flag === FRAME_TRAILER) {
            for (const line of new TextDecoder().decode(payload).split('\r\n')) {
                const colon = line.indexOf(':');
                if (colon > 0) trailer.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
            }
        } else throw new Error(`gRPC-Web: frame flag 0x${flag.toString(16)} is not one this reader takes`);
        at = start + length;
    }
    const status = trailer.get('grpc-status') ?? headers?.get('grpc-status') ?? undefined;
    const reason = trailer.get('grpc-message') ?? headers?.get('grpc-message') ?? '';
    if (status === undefined) throw new Error('gRPC-Web: the reply carries no grpc-status');
    if (status !== '0') throw new Error(`gRPC-Web: grpc-status ${status}: ${decodeURIComponent(reason)}`);
    return message;
}
