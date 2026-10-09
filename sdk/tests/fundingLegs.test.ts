/**
 * readFundingLegs — the swap legs one commit transaction carries, decided from
 * the receipt's ERC-20 Transfer topology. The fixtures are devnet receipts of
 * real `swapAndCommit` and `commit` transactions (MockWitnessPermit2 +
 * MockSwapVenue, the same Transfer shape Permit2 + a router leave): the
 * receipt's own `OrderCommitted` names the parties and the denomination.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { encodeAbiParameters, encodeEventTopics, type Log } from "viem";
import { readFundingLegs, type ReceiptLogInput } from "../src/derive/fundingLegs.js";
import { projectValueFlow } from "../src/derive/composition.js";
import { projectResolutionGraph } from "../src/derive/graphs.js";
import { parseOrderCommittedLogs } from "../src/events.js";
import { ERC20_ABI } from "../src/abis.js";
import type { Address, Hex } from "../src/types.js";

interface FixtureReceipt {
    transactionHash: Hex;
    blockNumber: number;
    logs: ReceiptLogInput[];
}
const fixture = JSON.parse(
    readFileSync(path.resolve(__dirname, "fixtures/funding-leg-receipts.json"), "utf8"),
) as { coordinator: Address; venue: Address; receipts: Record<string, FixtureReceipt> };
const COORDINATOR = fixture.coordinator;

function commitOf(receipt: FixtureReceipt) {
    const [committed] = parseOrderCommittedLogs(receipt.logs as unknown as Log[]);
    expect(committed, "the receipt carries its OrderCommitted").toBeTruthy();
    expect(committed.transactionHash).toBe(receipt.transactionHash);
    return committed;
}

const lower = (a: string) => a.toLowerCase();

describe("readFundingLegs — devnet receipts", () => {
    it("a plain commit carries no leg", () => {
        const receipt = fixture.receipts.plainCommit;
        expect(readFundingLegs(receipt.logs, commitOf(receipt), COORDINATOR)).toEqual([]);
    });

    it("the buyer's funding leg: its token out, the denomination in, the venue the coordinator paid", () => {
        const receipt = fixture.receipts.buyerFunded;
        const commit = commitOf(receipt);
        const legs = readFundingLegs(receipt.logs, commit, COORDINATOR);
        expect(legs).toHaveLength(1);
        const [leg] = legs;
        expect(lower(leg.venue)).toBe(lower(fixture.venue));
        expect(leg.blockNumber).toBe(receipt.blockNumber);
        expect(leg.transactionHash).toBe(receipt.transactionHash);
        expect(lower(leg.payload.party)).toBe(lower(commit.buyer));
        expect(lower(leg.payload.tokenOut)).toBe(lower(commit.currency));
        expect(lower(leg.payload.tokenIn)).not.toBe(lower(commit.currency));
        // The output covers the buyer's bond: twice the payment.
        expect(leg.payload.amountOut).toBe(commit.payment * 2n);
        expect(leg.payload.amountIn).toBe(2_000000000000000000n);
    });

    it("the seller's funding leg: the party is the seller, the output covers 2× the cumulative value", () => {
        const receipt = fixture.receipts.sellerFunded;
        const commit = commitOf(receipt);
        const legs = readFundingLegs(receipt.logs, commit, COORDINATOR);
        expect(legs).toHaveLength(1);
        const [leg] = legs;
        expect(lower(leg.venue)).toBe(lower(fixture.venue));
        expect(lower(leg.payload.party)).toBe(lower(commit.seller));
        expect(lower(leg.payload.tokenOut)).toBe(lower(commit.currency));
        expect(leg.payload.amountOut).toBe(commit.cumulativeValue * 2n);
    });

    it("the legs feed projectValueFlow as an edge between two denominations", () => {
        const receipt = fixture.receipts.sellerFunded;
        const commit = commitOf(receipt);
        const legs = readFundingLegs(receipt.logs, commit, COORDINATOR);
        const graph = projectValueFlow(
            projectResolutionGraph({ orderCommitted: [commit], orderResolved: [], processResolved: [] }),
            legs,
        );
        const edge = graph.edges.find((e) => e.basis === "composition-derived");
        expect(edge).toMatchObject({
            basis: "composition-derived",
            venue: legs[0].venue,
            tokenIn: legs[0].payload.tokenIn,
            tokenOut: legs[0].payload.tokenOut,
            legCount: 1,
            volumeIn: legs[0].payload.amountIn,
            volumeOut: legs[0].payload.amountOut,
        });
        expect(graph.nodes.map((n) => lower(n.token)).sort()).toEqual(
            [lower(legs[0].payload.tokenIn), lower(legs[0].payload.tokenOut)].sort(),
        );
    });

    it("a coordinator this reader is not told about yields no leg", () => {
        const receipt = fixture.receipts.buyerFunded;
        const other = "0x000000000000000000000000000000000000c0de" as Address;
        expect(readFundingLegs(receipt.logs, commitOf(receipt), other)).toEqual([]);
    });
});

// ── Topologies the devnet fixtures do not carry, in the same log shape ──────

const BUYER = "0x00000000000000000000000000000000000000b1" as Address;
const SELLER = "0x00000000000000000000000000000000000000c1" as Address;
const HUB = "0x00000000000000000000000000000000000000d1" as Address;
const VENUE = "0x00000000000000000000000000000000000000e1" as Address;
const CORE = "0x00000000000000000000000000000000000000f1" as Address;
const DENOM = "0x0000000000000000000000000000000000000a01" as Address;
const IN_A = "0x0000000000000000000000000000000000000a02" as Address;
const IN_B = "0x0000000000000000000000000000000000000a03" as Address;
const TX = ("0x" + "77".repeat(32)) as Hex;

function transfer(token: Address, from: Address, to: Address, value: bigint): ReceiptLogInput {
    return {
        address: token,
        topics: encodeEventTopics({ abi: ERC20_ABI, eventName: "Transfer", args: { from, to } }) as Hex[],
        data: encodeAbiParameters([{ type: "uint256" }], [value]),
        blockNumber: 9n,
        transactionHash: TX,
    };
}

/** One funded party's transfers, in the coordinator's order: pull, hand to
 *  the venue, venue output, forward, unspent input returned, bond pull. */
function fundedLeg(party: Address, tokenIn: Address, pulled: bigint, spent: bigint, out: bigint, bond: bigint) {
    const logs = [
        transfer(tokenIn, party, HUB, pulled),
        transfer(tokenIn, HUB, VENUE, spent),
        transfer(DENOM, VENUE, HUB, out),
        transfer(DENOM, HUB, party, out),
    ];
    if (pulled > spent) logs.push(transfer(tokenIn, HUB, party, pulled - spent));
    return { logs, bondPull: transfer(DENOM, party, CORE, bond) };
}

describe("readFundingLegs — both parties, and an unspent input", () => {
    const commitment = { buyer: BUYER, seller: SELLER, currency: DENOM };

    it("both parties funded: one leg each, in the order they ran, net of the unspent input", () => {
        const buyer = fundedLeg(BUYER, IN_A, 120n, 100n, 200n, 200n);
        const seller = fundedLeg(SELLER, IN_B, 50n, 50n, 400n, 400n);
        const legs = readFundingLegs(
            [...buyer.logs, ...seller.logs, buyer.bondPull, seller.bondPull],
            commitment,
            HUB,
        );
        expect(legs.map((l) => l.payload)).toEqual([
            { party: BUYER, tokenIn: IN_A, tokenOut: DENOM, amountIn: 100n, amountOut: 200n },
            { party: SELLER, tokenIn: IN_B, tokenOut: DENOM, amountIn: 50n, amountOut: 400n },
        ]);
        expect(legs.every((l) => l.venue === VENUE && l.blockNumber === 9 && l.transactionHash === TX)).toBe(true);
    });

    it("the denomination moving into the coordinator is no input", () => {
        const logs = [transfer(DENOM, BUYER, HUB, 10n), transfer(DENOM, HUB, BUYER, 10n)];
        expect(readFundingLegs(logs, commitment, HUB)).toEqual([]);
    });

    it("a stranger's transfer into the coordinator is no input", () => {
        const stranger = "0x0000000000000000000000000000000000000999" as Address;
        const { logs } = fundedLeg(stranger, IN_A, 10n, 10n, 20n, 20n);
        expect(readFundingLegs(logs, commitment, HUB)).toEqual([]);
    });
});
