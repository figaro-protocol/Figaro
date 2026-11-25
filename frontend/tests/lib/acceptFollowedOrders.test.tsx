/**
 * A seller accepting a sub-order checks the orders it follows against its
 * process design before it signs (`acceptOrder` → `readFollowedOrders` →
 * `followedOrderIssues`). The seller reads, on its own: the process the chain
 * records each followed order in (`OrderCommitted`), and that order's
 * agreement — the public form the buyer relays beside the order, taken only
 * when its merkle root equals the order's committed `checkoutHash`. It refuses
 * an order whose edges name an order standing elsewhere in the design, an
 * order the chain does not record, and one whose relayed agreement does not
 * hash to what the chain records.
 *
 * The design: a root entry and a child entry that follows it, each binding a
 * registered agreement of its own (commerce with a consent document of its
 * own), anchored on the registries and pinned.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
    agreementHashOf,
    processDesignHashOf,
    buildOrderAgreement,
    computeCheckoutHash,
    type Agreement,
    type ProcessDesign,
    type Commitment,
    type Hex,
    type MemberProfileMetadata,
    type RegisteredAgreement,
} from "@figaro-protocol/sdk";
import type { CommitmentPayload } from "@figaro-protocol/sdk/agent";
import { keyOf, primeClauseSpecs } from "./primeClauseSpecs";
import { specSource } from "@/lib/shared/clauseSpecSource";

const BUYER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Hex;
const SELLER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Hex;
const LEAD = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Hex;
const CURRENCY = `0x${"ab".repeat(20)}` as Hex;
const PROCESS_REGISTRY = `0x${"a5".repeat(20)}` as Hex;
const AGREEMENT_REGISTRY = `0x${"a6".repeat(20)}` as Hex;
const PROCESS = `0x${"9a".repeat(32)}` as Hex;
const ROOT_ORDER = `0x${"01".repeat(32)}` as Hex;
const STRAY_ORDER = `0x${"03".repeat(32)}` as Hex;

vi.mock("wagmi", async () => (await import("../support/wagmiMock")).wagmiMock({ address: () => SELLER, client: () => ({}) }, {
    useWalletClient: () => ({ data: null }),
    useSignTypedData: () => ({ signTypedDataAsync: async () => `0x${"11".repeat(65)}` }),
}));

vi.mock("@/lib/core/contracts", async (importOriginal) =>
    (await import("../support/contractsMock")).contractsMock(await importOriginal<typeof import("@/lib/core/contracts")>(), { core: "0x00000000000000000000000000000000000000c0" }));
vi.mock("@/lib/registries/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/registries/contracts")>();
    return { ...actual, REGISTRY_CONTRACTS: { ...actual.REGISTRY_CONTRACTS, processRegistry: PROCESS_REGISTRY, agreementRegistry: AGREEMENT_REGISTRY } };
});

const bindings = new Map<string, string>();
vi.mock("@/lib/shared/publicClient", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/shared/publicClient")>();
    return {
        ...actual,
        publicClient: {
            readContract: async ({ args }: { args: [Hex] }) => {
                const uri = bindings.get(args[0].toLowerCase());
                return uri ? [BUYER, 1n, false, uri] : [`0x${"00".repeat(20)}`, 0n, false, ""];
            },
        },
    };
});

const pinned = new Map<string, string>();
vi.mock("@/lib/shared/ipfsService", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/shared/ipfsService")>();
    return {
        ...actual,
        fetchCappedContent: async (url: string) => {
            const body = pinned.get(url);
            return body === undefined ? new Response("", { status: 404 }) : new Response(body, { status: 200 });
        },
        DEFAULT_IPFS_SERVICE: { ...actual.DEFAULT_IPFS_SERVICE, resolveFetchUrl: (uri: string) => uri },
    };
});

vi.mock("@figaro-protocol/sdk", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@figaro-protocol/sdk")>();
    return { ...actual, verifyCommitmentSignature: async () => true };
});

let processDesignHash: Hex;
vi.mock("@/lib/registries/profileFetcher", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/registries/profileFetcher")>();
    return {
        ...actual,
        profileReaderForChain: () => async (): Promise<MemberProfileMetadata> => ({
            name: "Seller",
            processBindings: [{ bindingId: "b-0", subjectAddress: SELLER, processDesignHash }],
        }),
    };
});

// The chain's OrderCommitted rows, across every order emitter.
const committed: { orderHash: Hex; processId: Hex; checkoutHash: Hex }[] = [];
vi.mock("@/lib/core/indexer", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/core/indexer")>();
    return {
        ...actual,
        getCoreEvents: async () => ({ events: { orderCommitted: committed, orderResolved: [], processResolved: [] }, committedLogs: [] }),
    };
});

const commitSignedOrder = vi.fn(async () => `0x${"cc".repeat(32)}` as Hex);
vi.mock("@/lib/core/orderCommitted", () => ({ commitSignedOrder: (...args: unknown[]) => commitSignedOrder(...(args as [])) }));
vi.mock("@/lib/core/useFigaroActions", () => ({ useFigaroActions: () => ({ commit: vi.fn() }) }));
vi.mock("@/lib/composability/useSwapAndCommitActions", () => ({ useSwapAndCommitActions: () => ({ swapAndCommit: vi.fn() }) }));
vi.mock("@/lib/shared/runtimeServicesContext", () => ({ useRuntimeServices: () => ({}) }));
vi.mock("@/lib/data/handoff/relayChannel", () => ({ relayCommitmentPayload: vi.fn() }));

const { useOrderCommitmentFlow } = await import("@/lib/checkout/orderCommitmentFlow");

const docs = (title: string) => [{ documentHash: `0x${"d0".repeat(32)}`, documentVersion: "1.0.0", documentTitle: title }];
const clausesOf = (title: string) => ({ [keyOf("figaro-commerce")]: {}, [keyOf("figaro-consent")]: { documents: docs(title) } });
// Set once the clause specs are loaded (`beforeAll`): the keys are read from them.
let ROOT_REGISTERED: RegisteredAgreement;
let CHILD_REGISTERED: RegisteredAgreement;
let ROOT_HASH: Hex;
let CHILD_HASH: Hex;

function anchorDesign(): void {
    ROOT_REGISTERED = { clauses: clausesOf("Root terms") };
    CHILD_REGISTERED = { clauses: clausesOf("Child terms") };
    ROOT_HASH = agreementHashOf(ROOT_REGISTERED);
    CHILD_HASH = agreementHashOf(CHILD_REGISTERED);
    const assembly: ProcessDesign = {
        agreements: [
            { id: "agreement-0", agreementHash: ROOT_HASH, clauses: {} },
            { id: "agreement-1", agreementHash: CHILD_HASH, clauses: {}, follows: ["agreement-0"] },
        ],
    };
    processDesignHash = processDesignHashOf(assembly);
    for (const [key, uri, body] of [
        [processDesignHash, "ipfs://two-step-assembly", assembly],
        [ROOT_HASH, "ipfs://root-agreement", ROOT_REGISTERED],
        [CHILD_HASH, "ipfs://child-agreement", CHILD_REGISTERED],
    ] as const) {
        bindings.set(key.toLowerCase(), uri);
        pinned.set(uri, JSON.stringify(body));
    }
}

/** An order's agreement instantiating `agreementHash` with `follows`. */
function orderAgreement(seller: Hex, agreementHash: Hex, title: string, follows: Hex[]): Agreement {
    const { agreement } = buildOrderAgreement(BUYER, seller, {
        [keyOf("figaro-commerce")]: { lineItems: [{ itemId: "item-1", name: "Item", quantity: 1, unitPrice: "1000" }] },
        [keyOf("figaro-consent")]: { documents: docs(title) },
    }, specSource());
    return { ...agreement, provenance: { agreementHash, processDesignHash }, follows };
}

/** The child order the buyer relays: following `follows`, carrying the
 *  agreements in `followed`. */
function childPayload(follows: Hex[], followed: Agreement[]): CommitmentPayload {
    const agreement = orderAgreement(SELLER, CHILD_HASH, "Child terms", follows);
    const commitment: Commitment = {
        processId: PROCESS, buyer: BUYER, seller: SELLER, token: CURRENCY,
        payment: 1000n, runningTotal: 2000n, checkoutHash: computeCheckoutHash(agreement),
        salt: 2n, commitDeadline: 9_999_999_999n,
    };
    return { commitment, agreement, buyerSig: `0x${"22".repeat(65)}` as Hex, followed };
}

describe("acceptOrder checks the orders a sub-order follows against its design", () => {
    beforeAll(async () => {
        await primeClauseSpecs(["figaro-commerce", "figaro-consent"]);
        anchorDesign();
    });
    beforeEach(() => {
        commitSignedOrder.mockClear();
        committed.length = 0;
    });

    it("accepts a sub-order whose edge names the root entry's committed order", async () => {
        const root = orderAgreement(LEAD, ROOT_HASH, "Root terms", []);
        committed.push({ orderHash: ROOT_ORDER, processId: PROCESS, checkoutHash: computeCheckoutHash(root) });
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await expect(result.current.acceptOrder(childPayload([ROOT_ORDER], [root]))).resolves.toMatch(/^0x/);
        expect(commitSignedOrder).toHaveBeenCalledTimes(1);
    });

    it("refuses a sub-order whose edge names an order standing elsewhere in the design", async () => {
        // The followed order instantiates the child entry, not the root entry
        // the design's child follows.
        const sibling = orderAgreement(LEAD, CHILD_HASH, "Child terms", [ROOT_ORDER]);
        committed.push({ orderHash: STRAY_ORDER, processId: PROCESS, checkoutHash: computeCheckoutHash(sibling) });
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await expect(result.current.acceptOrder(childPayload([STRAY_ORDER], [sibling])))
            .rejects.toThrow(/do not match its design: follows\.0: .*the design's entry follows agreement-0/);
        expect(commitSignedOrder).not.toHaveBeenCalled();
    });

    it("refuses an edge the chain does not record, and a relayed agreement that does not hash to the committed order", async () => {
        const root = orderAgreement(LEAD, ROOT_HASH, "Root terms", []);
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await expect(result.current.acceptOrder(childPayload([ROOT_ORDER], [root])))
            .rejects.toThrow(/records as no committed order/);
        committed.push({ orderHash: ROOT_ORDER, processId: PROCESS, checkoutHash: `0x${"ee".repeat(32)}` as Hex });
        await expect(result.current.acceptOrder(childPayload([ROOT_ORDER], [root])))
            .rejects.toThrow(/agreement was not read/);
        expect(commitSignedOrder).not.toHaveBeenCalled();
    });

    it("refuses an edge naming an order of another process", async () => {
        const root = orderAgreement(LEAD, ROOT_HASH, "Root terms", []);
        committed.push({ orderHash: ROOT_ORDER, processId: `0x${"77".repeat(32)}` as Hex, checkoutHash: computeCheckoutHash(root) });
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await expect(result.current.acceptOrder(childPayload([ROOT_ORDER], [root])))
            .rejects.toThrow(/committed in process 0x7777.*joins process/);
        expect(commitSignedOrder).not.toHaveBeenCalled();
    });
});
