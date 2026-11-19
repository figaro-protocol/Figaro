/**
 * The gRPC-Web codec the e2e helper `xmtpInboxOnLocalBroker` uses, checked
 * against bytes written out by hand from the field numbers of xmtpd v1.3.0's
 * `GetInboxIdsRequest` and `GetInboxIdsResponse`.
 */
import { describe, expect, it } from 'vitest';
import {
    decodeGetInboxIdsResponse,
    encodeGetInboxIdsRequest,
    grpcWebFrame,
    grpcWebUnaryMessage,
} from '../e2e/xmtpGrpcWeb';

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));
const ADDRESS = '0xab';
const INBOX = 'f00d';

/** A frame: flag, big-endian uint32 length, payload. */
const frame = (flag: number, payload: number[]) => [flag, 0, 0, 0, payload.length, ...payload];

describe('GetInboxIds over gRPC-Web', () => {
    it('encodes the request: requests (1) holding identifier (1) and identifier_kind (2) = ETHEREUM', () => {
        const inner = [0x0a, 4, ...ascii(ADDRESS), 0x10, 0x01];
        expect(Array.from(encodeGetInboxIdsRequest(ADDRESS))).toEqual([0x0a, inner.length, ...inner]);
    });

    it('frames a message with flag 0x00 and a big-endian length', () => {
        const message = new Uint8Array(300).fill(7);
        const framed = grpcWebFrame(message);
        expect(Array.from(framed.slice(0, 5))).toEqual([0x00, 0, 0, 0x01, 0x2c]);
        expect(framed.length).toBe(305);
    });

    it('decodes responses (1) with identifier (1), inbox_id (2) and identifier_kind (3)', () => {
        const withInbox = [0x0a, 4, ...ascii(ADDRESS), 0x12, 4, ...ascii(INBOX), 0x18, 0x01];
        const withoutInbox = [0x0a, 4, ...ascii('0xcd'), 0x18, 0x01];
        const message = Uint8Array.from([
            0x0a, withInbox.length, ...withInbox,
            0x0a, withoutInbox.length, ...withoutInbox,
        ]);
        expect(decodeGetInboxIdsResponse(message)).toEqual([
            { identifier: ADDRESS, inboxId: INBOX, identifierKind: 1 },
            { identifier: '0xcd', identifierKind: 1 },
        ]);
    });

    it('returns the data frame when the trailer says grpc-status 0', () => {
        const message = [0x0a, 2, 0x0a, 0x00];
        const body = Uint8Array.from([
            ...frame(0x00, message),
            ...frame(0x80, ascii('grpc-status: 0\r\ngrpc-message: \r\n')),
        ]);
        expect(Array.from(grpcWebUnaryMessage(body))).toEqual(message);
    });

    it('throws with grpc-message when the trailer carries a non-zero grpc-status', () => {
        const body = Uint8Array.from(frame(0x80, ascii('grpc-status: 9\r\ngrpc-message: no%20inbox\r\n')));
        expect(() => grpcWebUnaryMessage(body)).toThrow('grpc-status 9: no inbox');
    });

    it('reads the status from the headers when the reply has no body', () => {
        const headers = new Headers({ 'grpc-status': '12', 'grpc-message': 'unimplemented' });
        expect(() => grpcWebUnaryMessage(new Uint8Array(0), headers)).toThrow('grpc-status 12: unimplemented');
    });

    it('throws when no grpc-status arrives at all', () => {
        expect(() => grpcWebUnaryMessage(Uint8Array.from(frame(0x00, [])))).toThrow('no grpc-status');
    });
});
