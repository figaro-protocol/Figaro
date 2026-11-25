/**
 * The generator of `fixtures/funding-leg-receipts.json`: the receipts of one
 * plain `FigaroCore.commit` and of two `WitnessSwapAndCommitCoordinator
 * .swapAndCommit` transactions (the buyer's leg funded; the seller's leg
 * funded, with input left over), built log by log in the order today's
 * contracts emit them, each log encoded with the production ABIs
 * (`ERC20_ABI`, `CORE_ABI`; the ERC-20 `Approval` event, which the SDK's
 * ERC-20 ABI does not carry, with viem's standard `erc20Abi`).
 *
 * This is the SDK's own encoding of what the contracts emit, never a capture
 * from a chain. The order of the logs follows the code:
 * `WitnessSwapAndCommitCoordinator._fund` (Permit2's pull to the coordinator,
 * the router's approval, the venue's pull and its output, the approval reset,
 * the output forwarded to the party, the unspent input returned), then
 * `FigaroCore.commit` (the buyer's bond pull, the seller's bond pull,
 * `OrderCommitted`, `OrderSeller`). A Permit2 transfer and a venue transfer
 * leave the same ERC-20 `Transfer` log whichever Permit2 and venue run.
 *
 * `fundingLegs.test.ts` compares the committed fixture with this output and
 * rewrites it under `HARVEST_FUNDING_LEG_RECEIPTS=1`.
 */
import { encodeAbiParameters, encodeEventTopics, erc20Abi, keccak256, toHex, type Abi, type AbiEvent, type Hex } from "viem";
import { CORE_ABI, ERC20_ABI } from "../src/abis.js";
import { computeCommitmentProcessId, computeOrderHash } from "../src/commitments.js";
import type { Address, Commitment } from "../src/types.js";

const CHAIN_ID = 31337;
export const FUNDING_FIXTURE_ADDRESSES = {
    coordinator: "0x9d602bc9293c151ce254f8853f023a490f4b7750",
    venue: "0x6f9f21a19d3bf99862f0573998a667c4c22d2e5d",
    core: "0x0e252ae05bc14e57d5d521aca9293a6fc88168e9",
    permit2: "0x000000000022d473030f116ddee9f6b43ac78ba3",
    /** The denomination the commitments name. */
    token: "0x1aeb541c7b9a3d5eaa7b0d0e1a3f3b8e3c2d1e0f",
    /** The input token the funded parties hold. */
    input: "0xbdc6ebe4eb4d06ec320ab6fb38148f19dcd9108c",
    buyer: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    seller: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
} as const satisfies Record<string, Address>;
const A = FUNDING_FIXTURE_ADDRESSES;

const E18 = 10n ** 18n;

const ORDER_COMMITTED = (CORE_ABI as Abi).find((i): i is AbiEvent => i.type === "event" && i.name === "OrderCommitted")!;

interface FixtureLog {
    address: Address;
    topics: Hex[];
    data: Hex;
    blockNumber: number;
    transactionHash: Hex;
    logIndex: number;
}

interface FixtureReceipt {
    transactionHash: Hex;
    to: Address;
    blockNumber: number;
    logs: FixtureLog[];
}

type Event =
    | { kind: "Transfer"; token: Address; from: Address; to: Address; value: bigint }
    | { kind: "Approval"; token: Address; owner: Address; spender: Address; value: bigint }
    | { kind: "OrderCommitted"; commitment: Commitment }
    | { kind: "OrderSeller"; commitment: Commitment };

function encode(e: Event): { address: Address; topics: Hex[]; data: Hex } {
    switch (e.kind) {
        case "Transfer":
            return {
                address: e.token,
                topics: encodeEventTopics({ abi: ERC20_ABI, eventName: "Transfer", args: { from: e.from, to: e.to } }) as Hex[],
                data: encodeAbiParameters([{ type: "uint256" }], [e.value]),
            };
        case "Approval":
            return {
                address: e.token,
                topics: encodeEventTopics({ abi: erc20Abi, eventName: "Approval", args: { owner: e.owner, spender: e.spender } }) as Hex[],
                data: encodeAbiParameters([{ type: "uint256" }], [e.value]),
            };
        case "OrderCommitted": {
            const c = e.commitment;
            const processId = computeCommitmentProcessId(c, CHAIN_ID, A.core);
            return {
                address: A.core,
                topics: encodeEventTopics({
                    abi: CORE_ABI, eventName: "OrderCommitted",
                    args: { orderHash: computeOrderHash(c, CHAIN_ID, A.core), processId, buyer: c.buyer },
                }) as Hex[],
                // The event's unindexed inputs, read from the production ABI, in its order.
                data: encodeAbiParameters(
                    ORDER_COMMITTED.inputs.filter((i) => !i.indexed),
                    ORDER_COMMITTED.inputs.filter((i) => !i.indexed).map((i) => (c as unknown as Record<string, unknown>)[i.name!]),
                ),
            };
        }
        case "OrderSeller":
            return {
                address: A.core,
                topics: encodeEventTopics({
                    abi: CORE_ABI, eventName: "OrderSeller",
                    args: { orderHash: computeOrderHash(e.commitment, CHAIN_ID, A.core), seller: e.commitment.seller },
                }) as Hex[],
                data: "0x",
            };
    }
}

/** The logs `WitnessSwapAndCommitCoordinator._fund` leaves for one party. */
function fundLeg(party: Address, maxInput: bigint, spent: bigint, out: bigint): Event[] {
    const events: Event[] = [
        // 1. Permit2 pulls the input to the coordinator.
        { kind: "Transfer", token: A.input, from: party, to: A.coordinator, value: maxInput },
        // 2. The router is approved, the venue pulls what it spends and pays out.
        { kind: "Approval", token: A.input, owner: A.coordinator, spender: A.venue, value: maxInput },
        { kind: "Transfer", token: A.input, from: A.coordinator, to: A.venue, value: spent },
        { kind: "Transfer", token: A.token, from: A.venue, to: A.coordinator, value: out },
        { kind: "Approval", token: A.input, owner: A.coordinator, spender: A.venue, value: 0n },
        // 3. The whole output goes to the party.
        { kind: "Transfer", token: A.token, from: A.coordinator, to: party, value: out },
    ];
    // 4. The input the venue did not take goes back to the party.
    if (maxInput > spent) events.push({ kind: "Transfer", token: A.input, from: A.coordinator, to: party, value: maxInput - spent });
    return events;
}

/** The logs `FigaroCore.commit` leaves. */
function commitLogs(c: Commitment): Event[] {
    return [
        { kind: "Transfer", token: c.token, from: c.buyer, to: A.core, value: c.payment * 2n },
        { kind: "Transfer", token: c.token, from: c.seller, to: A.core, value: c.runningTotal * 2n },
        { kind: "OrderCommitted", commitment: c },
        { kind: "OrderSeller", commitment: c },
    ];
}

function commitment(label: string): Commitment {
    return {
        processId: `0x${"00".repeat(32)}`,
        buyer: A.buyer, seller: A.seller, token: A.token,
        payment: E18, runningTotal: E18,
        checkoutHash: keccak256(toHex(label)),
        salt: BigInt(label.length), commitDeadline: 1_900_000_000n,
    };
}

function receipt(label: string, to: Address, blockNumber: number, events: Event[]): FixtureReceipt {
    const transactionHash = keccak256(toHex(`funding-leg-receipt:${label}`));
    return {
        transactionHash, to, blockNumber,
        logs: events.map((e, logIndex) => ({ ...encode(e), blockNumber, transactionHash, logIndex })),
    };
}

export function buildFundingLegReceipts() {
    const plain = commitment("plain-commit");
    const buyerFunded = commitment("buyer-funded");
    const sellerFunded = commitment("seller-funded");
    return {
        coordinator: A.coordinator,
        venue: A.venue,
        receipts: {
            plainCommit: receipt("plainCommit", A.core, 164, commitLogs(plain)),
            // The buyer's leg spends its whole input: 2 input for 2·payment.
            buyerFunded: receipt("buyerFunded", A.coordinator, 703, [
                ...fundLeg(A.buyer, 2n * E18, 2n * E18, buyerFunded.payment * 2n),
                ...commitLogs(buyerFunded),
            ]),
            // The seller's leg pulls 3 input, spends 2, and gets 1 back.
            sellerFunded: receipt("sellerFunded", A.coordinator, 705, [
                ...fundLeg(A.seller, 3n * E18, 2n * E18, sellerFunded.runningTotal * 2n),
                ...commitLogs(sellerFunded),
            ]),
        },
    };
}
