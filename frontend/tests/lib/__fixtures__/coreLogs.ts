/**
 * Encoded Core order-event logs for the order-reader tests: the bytes a node
 * returns, decoded by the SDK's own parsers in the code under test.
 */
import { encodeAbiParameters, encodeEventTopics, toEventSelector, type Hex } from "viem";
import { EV_ATTESTATION, EV_ORDER_COMMITTED, EV_ORDER_RESOLVED } from "@figaro-protocol/sdk";

export interface FixtureLog {
    /** The decoded arguments the event cache attaches to each row it returns. */
    args?: Record<string, unknown>;
    address: string;
    topics: Hex[];
    data: Hex;
    blockNumber: bigint;
    logIndex: number;
    transactionHash: Hex;
    blockHash: Hex;
}

export const word = (n: number): Hex => `0x${n.toString(16).padStart(64, "0")}` as Hex;

export const selectorOf = (event: unknown): Hex => toEventSelector(event as typeof EV_ORDER_COMMITTED);

export function orderCommittedLog(args: {
    address: string;
    blockNumber: bigint;
    orderHash: Hex;
    processId: Hex;
    buyer: `0x${string}`;
    seller: `0x${string}`;
    payment?: bigint;
    cumulativeValue?: bigint;
}): FixtureLog {
    const topics = encodeEventTopics({
        abi: [EV_ORDER_COMMITTED],
        eventName: "OrderCommitted",
        args: { orderHash: args.orderHash, processId: args.processId, buyer: args.buyer },
    }) as Hex[];
    const payment = args.payment ?? 10n;
    const data = encodeAbiParameters(
        [
            { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" },
            { type: "bytes32" }, { type: "uint256" }, { type: "uint256" },
        ],
        [
            args.seller,
            "0x00000000000000000000000000000000000000c1",
            payment,
            args.cumulativeValue ?? payment,
            word(0xc4ec),
            1n,
            2_000_000_000n,
        ],
    );
    return {
        address: args.address,
        topics,
        data,
        blockNumber: args.blockNumber,
        logIndex: 0,
        transactionHash: args.orderHash,
        blockHash: word(Number(args.blockNumber)),
    };
}

/** An `Attestation` log at `address`: the coordinator's own, or the batch verifier's re-emission
 *  (the two share one topic hash, so the address is all that tells them apart). */
export function attestationLog(args: {
    address: string;
    blockNumber: bigint;
    orderHash: Hex;
    processId: Hex;
    attester: `0x${string}`;
    clauseId: Hex;
    stage?: number;
    contentRef: Hex;
}): FixtureLog {
    const topics = encodeEventTopics({
        abi: [EV_ATTESTATION],
        eventName: "Attestation",
        args: { orderHash: args.orderHash, processId: args.processId, attester: args.attester },
    }) as Hex[];
    const data = encodeAbiParameters(
        [{ type: "bytes32" }, { type: "uint8" }, { type: "bytes32" }],
        [args.clauseId, args.stage ?? 0, args.contentRef],
    );
    return {
        args: {
            orderHash: args.orderHash, processId: args.processId, attester: args.attester,
            clauseId: args.clauseId, stage: args.stage ?? 0, contentRef: args.contentRef,
        },
        address: args.address, topics, data, blockNumber: args.blockNumber, logIndex: 0,
        transactionHash: word(Number(args.blockNumber) + 0xa000), blockHash: word(Number(args.blockNumber)),
    };
}

/** An `OrderResolved` log at `address` (the Core's, or the batch verifier's). */
export function orderResolvedLog(args: {
    address: string;
    blockNumber: bigint;
    orderHash: Hex;
    processId: Hex;
    sellerPayout?: bigint;
    buyerPayout?: bigint;
}): FixtureLog {
    const topics = encodeEventTopics({
        abi: [EV_ORDER_RESOLVED],
        eventName: "OrderResolved",
        args: { orderHash: args.orderHash, processId: args.processId },
    }) as Hex[];
    const data = encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [args.sellerPayout ?? 10n, args.buyerPayout ?? 20n]);
    return {
        args: {
            orderHash: args.orderHash, processId: args.processId,
            sellerPayout: args.sellerPayout ?? 10n, buyerPayout: args.buyerPayout ?? 20n,
        },
        address: args.address, topics, data, blockNumber: args.blockNumber, logIndex: 0,
        transactionHash: word(Number(args.blockNumber) + 0xb000), blockHash: word(Number(args.blockNumber)),
    };
}
