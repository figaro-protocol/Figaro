/**
 * @figaro-protocol/sdk/derive — The funding legs in one commit transaction
 *
 * A party that holds another token funds its bond through a swap-and-commit
 * coordinator: the coordinator pulls the party's input token, a venue swaps it
 * into the commitment's `currency`, the coordinator forwards the proceeds to
 * the party, and FigaroCore then pulls the bond from the party. The
 * coordinator emits nothing of its own; the ERC-20 `Transfer` logs in the
 * transaction's receipt are the trail, and this reader decides each leg from
 * their topology alone:
 *
 *   party → coordinator      in a token other than `currency`  the input
 *   coordinator → V          in that token, V not the party    V is the venue
 *   coordinator → party      in `currency`                     the output
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
 *                    (an `OrderCommitted` event's `buyer`, `seller`, `currency`)
 * @param coordinator the swap-and-commit coordinator's address (from the
 *                    deployment record)
 * @returns one `VenueEvent<FundingLeg>` per funded party, in the order the
 *          legs ran; empty for a plain commit
 */
export function readFundingLegs(
    logs: readonly ReceiptLogInput[],
    commitment: { buyer: Address; seller: Address; currency: Address },
    coordinator: Address,
): VenueEvent<FundingLeg>[] {
    const parties = new Set([key(commitment.buyer), key(commitment.seller)]);
    const currency = key(commitment.currency);
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
        if (to === hub && parties.has(from) && token !== currency) {
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
        if (to === leg.party && token === currency && leg.amountOut === null) {
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
