/**
 * Encoded Core order-event logs for the order-reader tests: the bytes a node
 * returns, decoded by the SDK's own parsers in the code under test.
 */
import { encodeAbiParameters, encodeEventTopics, toEventSelector, type Hex } from "viem";
import { EV_ORDER_COMMITTED } from "@figaro-protocol/sdk";

export interface FixtureLog {
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
