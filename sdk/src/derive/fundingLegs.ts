/**
 * @figaro-protocol/sdk/derive — The funding legs in one commit transaction
 *
 * A party that holds another token funds its bond through a swap-and-commit
 * coordinator: the coordinator pulls the party's input token, a venue swaps it
 * into the commitment's `token`, the coordinator forwards the proceeds to
 * the party, and FigaroCore then pulls the bond from the party. The
 * coordinator emits nothing of its own; the ERC-20 `Transfer` logs in the
 * transaction's receipt are the trail, and this reader decides each leg from
 * their topology alone:
 *
 *   party → coordinator      in a token other than `token`     the input
 *   coordinator → V          in that token, V not the party    V is the venue
 *   coordinator → party      in `token`                        the output
 *   coordinator → party      in the input token                the unspent input
 *
 * No venue address is known in advance: the venue is whichever address the
 * coordinator handed the input token to, so a coordinator over any venue reads
 * the same way. A plain commit (no transfer into the coordinator) yields no
 * legs; each funded party yields one. Pure, no I/O — the caller reads the
 * receipt.
 */

import { decodeEventLog } from "viem";
import type { Hex, Address } from "../types.js";
import { ERC20_ABI } from "../abis.js";
import { forEachConcurrently } from "../boundedConcurrency.js";
import type { VenueEvent, SwapLeg } from "./composition.js";

/** A swap leg with the party whose bond it funded. Assignable to `SwapLeg`,
 *  so the legs feed `projectValueFlow` as they are. */
export interface FundingLeg extends SwapLeg {
    /** The commitment's buyer or seller whose input token left and whose
     *  denomination arrived. */
    party: Address;
}

/** The fields of a receipt log the reader decodes — a viem `Log` fits. */
export interface ReceiptLogInput {
    address: Address;
    topics: readonly Hex[];
    data: Hex;
    blockNumber: bigint | number | null;
    transactionHash: Hex | null;
}

interface Transfer {
    token: Address;
    from: Address;
    to: Address;
    value: bigint;
}

/** Case-insensitive address key (addresses arrive checksummed or not). */
function key(address: string): string {
    return address.toLowerCase();
}

function decodeTransfer(log: ReceiptLogInput): Transfer | null {
    if (log.topics.length !== 3) return null;
    try {
        const decoded = decodeEventLog({
            abi: ERC20_ABI,
            eventName: "Transfer",
            data: log.data,
            topics: log.topics as [Hex, ...Hex[]],
        });
        const { from, to, value } = decoded.args as { from: Address; to: Address; value: bigint };
        return { token: log.address, from, to, value };
    } catch {
        return null;
    }
}

/**
 * The funding legs one commit transaction carries.
 *
 * @param logs        the transaction receipt's logs, in log order
 * @param commitment  the parties and denomination the commitment names
 *                    (an `OrderCommitted` event's `buyer`, `seller`, `token`)
 * @param coordinator the swap-and-commit coordinator's address (from the
 *                    deployment record)
 * @returns one `VenueEvent<FundingLeg>` per funded party, in the order the
 *          legs ran; empty for a plain commit
 */
export function readFundingLegs(
    logs: readonly ReceiptLogInput[],
    commitment: { buyer: Address; seller: Address; token: Address },
    coordinator: Address,
): VenueEvent<FundingLeg>[] {
    const parties = new Set([key(commitment.buyer), key(commitment.seller)]);
    const bondToken = key(commitment.token);
    const hub = key(coordinator);

    type Open = {
        party: string;
        partyAddress: Address;
        tokenIn: Address;
        pulled: bigint;
        unspent: bigint;
        venue: Address | null;
        amountOut: bigint | null;
        tokenOut: Address | null;
        blockNumber: number;
        transactionHash: Hex | null;
    };
    const legs: VenueEvent<FundingLeg>[] = [];
    let open: Open | null = null;

    const close = () => {
        if (open && open.venue && open.tokenOut && open.amountOut !== null) {
            legs.push({
                venue: open.venue,
                blockNumber: open.blockNumber,
                transactionHash: open.transactionHash,
                payload: {
                    party: open.partyAddress,
                    tokenIn: open.tokenIn,
                    tokenOut: open.tokenOut,
                    amountIn: open.pulled - open.unspent,
                    amountOut: open.amountOut,
                },
            });
        }
        open = null;
    };

    for (const log of logs) {
        const t = decodeTransfer(log);
        if (!t) continue;
        const token = key(t.token);
        const from = key(t.from);
        const to = key(t.to);

        // The input: a party's own token, not the denomination, into the
        // coordinator. It opens the party's leg.
        if (to === hub && parties.has(from) && token !== bondToken) {
            close();
            open = {
                party: from,
                partyAddress: key(commitment.buyer) === from ? commitment.buyer : commitment.seller,
                tokenIn: t.token,
                pulled: t.value,
                unspent: 0n,
                venue: null,
                amountOut: null,
                tokenOut: null,
                blockNumber: Number(log.blockNumber ?? 0),
                transactionHash: log.transactionHash,
            };
            continue;
        }
        const leg: Open | null = open;
        if (!leg || from !== hub) continue;
        const sameToken = token === key(leg.tokenIn);
        if (to === leg.party && token === bondToken && leg.amountOut === null) {
            // The output: the denomination, forwarded to the party.
            leg.tokenOut = t.token;
            leg.amountOut = t.value;
        } else if (to === leg.party && sameToken) {
            // The input the venue did not take, returned to the party.
            leg.unspent += t.value;
        } else if (sameToken && leg.venue === null) {
            // The input handed to the venue.
            leg.venue = t.to;
        }
    }
    close();
    return legs;
}

/** The receipt read `readCommitFundingLegs` needs — a viem `PublicClient`
 *  fits. */
export interface ReceiptReader {
    getTransactionReceipt(args: { hash: Hex }): Promise<{ logs: readonly ReceiptLogInput[] }>;
}

/**
 * The funding legs of every commit transaction the given `OrderCommitted`
 * events came from: each transaction's receipt read once, each of its orders
 * read with `readFundingLegs`, and a leg two orders of one transaction both
 * yield (one party, one input token) kept once. A receipt that cannot be read
 * yields no leg and is counted in `unreadReceipts`, never fabricated. `cache`
 * (transaction hash, lowercased → its legs) carries the reads across calls;
 * an unread receipt is not cached, so the next call reads it again. Reads run
 * `concurrency` at a time (default 8). No coordinator, no legs.
 */
export async function readCommitFundingLegs(params: {
    client: ReceiptReader;
    orderCommitted: readonly { buyer: Address; seller: Address; token: Address; transactionHash: Hex | null }[];
    coordinator: Address | undefined;
    cache?: Map<string, VenueEvent<FundingLeg>[]>;
    concurrency?: number;
}): Promise<{ legs: VenueEvent<FundingLeg>[]; unreadReceipts: number }> {
    const { client, orderCommitted, coordinator } = params;
    if (!coordinator) return { legs: [], unreadReceipts: 0 };
    const cache = params.cache ?? new Map<string, VenueEvent<FundingLeg>[]>();
    const concurrency = Math.max(1, params.concurrency ?? 8);
    const ordersByTx = new Map<string, (typeof orderCommitted)[number][]>();
    for (const order of orderCommitted) {
        if (!order.transactionHash) continue;
        const tx = order.transactionHash.toLowerCase();
        ordersByTx.set(tx, [...(ordersByTx.get(tx) ?? []), order]);
    }
    const txs = [...ordersByTx.keys()];
    let unreadReceipts = 0;
    await forEachConcurrently(txs, concurrency, async (tx) => {
        if (cache.has(tx)) return;
        let logs: readonly ReceiptLogInput[];
        try {
            logs = (await client.getTransactionReceipt({ hash: tx as Hex })).logs;
        } catch {
            unreadReceipts += 1;
            return;
        }
        const seen = new Set<string>();
        const txLegs: VenueEvent<FundingLeg>[] = [];
        for (const order of ordersByTx.get(tx) ?? []) {
            for (const leg of readFundingLegs(logs, order, coordinator)) {
                const legKey = `${key(leg.payload.party)}|${key(leg.payload.tokenIn)}`;
                if (seen.has(legKey)) continue;
                seen.add(legKey);
                txLegs.push(leg);
            }
        }
        cache.set(tx, txLegs);
    });
    // In the order the transactions were first committed.
    const legs = txs.flatMap((tx) => cache.get(tx) ?? []);
    return { legs, unreadReceipts };
}
