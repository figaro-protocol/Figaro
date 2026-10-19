/**
 * The sign gate on both sign flows reads the design an agreement names and
 * refuses what it cannot read or verify. `useOrderCommitmentFlow`'s sign step
 * (`acceptOrder` → `signAs`, the path every signature takes) and its
 * broadcast of a fully signed payload (`commitOrder`) read the assembly the
 * agreement's provenance leaf names from `AssemblyRegistry` → IPFS, every
 * registered agreement from `AgreementRegistry` → IPFS, verify each against
 * its root or key, and run `assertAgreementSignable` with it. An assembly
 * that cannot be fetched, one that does not hash to its root, a registered
 * agreement whose content does not match its key, a designer value a party
 * changed, and a relayed agreement whose content does not match its
 * `agreementHash` are each refused before anything is signed or broadcast.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
    agreementKeyOf,
    assemblyCompositionHash,
    buildOrderAgreement,
    computeAgreementHash,
    type Agreement,
    type Assembly,
    type Commitment,
    type Hex,
    type RegisteredAgreement,
} from "@figaro-protocol/sdk";
import type { CommitmentPayload } from "@figaro-protocol/sdk/agent";
import { keyOf, primeClauseSpecs } from "./primeClauseSpecs";
import { specSource } from "@/lib/shared/clauseSpecSource";

const BUYER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Hex;
const SELLER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Hex;
const CURRENCY = `0x${"ab".repeat(20)}` as Hex;
const ASSEMBLY_REGISTRY = `0x${"a5".repeat(20)}` as Hex;
const AGREEMENT_REGISTRY = `0x${"a6".repeat(20)}` as Hex;

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: SELLER }),
    useChainId: () => 31337,
    usePublicClient: () => ({}),
    useWalletClient: () => ({ data: null }),
    useSignTypedData: () => ({ signTypedDataAsync: async () => `0x${"11".repeat(65)}` }),
}));

vi.mock("@/lib/kernel/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/kernel/contracts")>();
    return {
        ...actual,
        CONTRACTS: {
            ...actual.CONTRACTS,
            core: "0x00000000000000000000000000000000000000c0",
            assemblyRegistry: ASSEMBLY_REGISTRY,
            agreementRegistry: AGREEMENT_REGISTRY,
        },
    };
});

// The chain: each registry's `bindings(key)` → the contentURI the key is
// pinned at, or unregistered.
const bindings = new Map<string, string>();
vi.mock("@/lib/shared/wagmi", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/shared/wagmi")>();
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

// IPFS: the bytes pinned at each URI.
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

// The seller's own profile binds every design a case makes: the binding
// check (`sellerBoundAssembly.test.tsx`) passes, so each case reaches the
// design read it is about.
const designed: Hex[] = [];
vi.mock("@/lib/member/profileFetcher", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/member/profileFetcher")>()),
    profileReaderForChain: () => async () => ({
        name: "Seller",
        assemblyBindings: designed.map((compositionHash, i) => ({ bindingId: `b-${i}`, subjectAddress: SELLER, compositionHash })),
    }),
}));

const commitSignedOrder = vi.fn(async () => `0x${"cc".repeat(32)}` as Hex);
vi.mock("@/lib/kernel/orderCommitted", () => ({ commitSignedOrder: (...args: unknown[]) => commitSignedOrder(...(args as [])) }));
vi.mock("@/lib/kernel/useFigaroActions", () => ({ useFigaroActions: () => ({ commit: vi.fn() }) }));
vi.mock("@/lib/composition/useSwapAndCommitActions", () => ({ useSwapAndCommitActions: () => ({ swapAndCommit: vi.fn() }) }));
vi.mock("@/lib/shared/runtimeServicesContext", () => ({ useRuntimeServices: () => ({}) }));

const { useOrderCommitmentFlow } = await import("@/lib/checkout/orderCommitmentFlow");

/** A design of its own per case (a distinct consent document), so the
 *  registered-agreement read cache never carries one case into the next. */
let caseId = 0;
function design() {
    caseId += 1;
    const documents = [{ documentHash: `0x${"d0".repeat(32)}`, documentVersion: "1.0.0", documentTitle: `Terms ${caseId}` }];
    const registered: RegisteredAgreement = { clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-consent")]: { documents } } };
    const agreementKey = agreementKeyOf(registered);
    const assembly: Assembly = { agreements: [{ id: "order-0", agreementKey, clauses: {} }] };
    const compositionHash = assemblyCompositionHash(assembly);
    designed.push(compositionHash);
    const anchor = () => {
        bindings.set(compositionHash.toLowerCase(), `ipfs://assembly-${caseId}`);
        bindings.set(agreementKey.toLowerCase(), `ipfs://agreement-${caseId}`);
        pinned.set(`ipfs://assembly-${caseId}`, JSON.stringify(assembly));
        pinned.set(`ipfs://agreement-${caseId}`, JSON.stringify(registered));
    };
    return { documents, registered, agreementKey, assembly, compositionHash, anchor, id: caseId };
}

function payloadFor(d: ReturnType<typeof design>, consent = { documents: d.documents }): CommitmentPayload {
    const { agreement: built } = buildOrderAgreement(BUYER, SELLER, {
        [keyOf("figaro-commerce")]: {
            currency: CURRENCY,
            payment: "1000",
            lineItems: [{ itemId: "item-1", name: "Item", quantity: 1, unitPrice: "1000" }],
        },
        [keyOf("figaro-consent")]: consent,
    }, specSource());
    const agreement: Agreement = { ...built, provenance: { agreementKey: d.agreementKey, compositionHash: d.compositionHash } };
    const commitment: Commitment = {
        processId: `0x${"00".repeat(32)}` as Hex,
        buyer: BUYER,
        seller: SELLER,
        currency: CURRENCY,
        payment: 1000n,
        expectedCumulativeValue: 1000n,
        agreementHash: computeAgreementHash(agreement),
        salt: 1n,
        deadline: 9_999_999_999n,
    };
    return { commitment, agreement, buyerSig: `0x${"22".repeat(65)}` as Hex };
}

const signed = (p: CommitmentPayload): CommitmentPayload => ({ ...p, sellerSig: `0x${"33".repeat(65)}` as Hex });

describe("both sign flows read and verify the design the agreement names", () => {
    beforeAll(async () => { await primeClauseSpecs(["figaro-commerce", "figaro-consent"]); });
    beforeEach(() => { commitSignedOrder.mockClear(); });

    it("signs and broadcasts an agreement whose design is read, verified and kept", async () => {
        const d = design();
        d.anchor();
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await expect(result.current.acceptOrder(payloadFor(d))).resolves.toMatch(/^0x/);
        await expect(result.current.commitOrder(signed(payloadFor(d)))).resolves.toMatch(/^0x/);
        expect(commitSignedOrder).toHaveBeenCalledTimes(2);
    });

    it("refuses an agreement whose design cannot be fetched", async () => {
        const d = design(); // never anchored: no binding, nothing pinned
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await expect(result.current.acceptOrder(payloadFor(d))).rejects.toThrow(/was not read/);
        await expect(result.current.commitOrder(signed(payloadFor(d)))).rejects.toThrow(/was not read/);
        expect(commitSignedOrder).not.toHaveBeenCalled();
    });

    it("refuses an agreement whose assembly does not verify against its composition root", async () => {
        const d = design();
        d.anchor();
        pinned.set(`ipfs://assembly-${d.id}`, JSON.stringify({ ...d.assembly, assemblyClauses: { [keyOf("figaro-consent")]: {} } }));
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await expect(result.current.acceptOrder(payloadFor(d))).rejects.toThrow(/was not read/);
        await expect(result.current.commitOrder(signed(payloadFor(d)))).rejects.toThrow(/was not read/);
        expect(commitSignedOrder).not.toHaveBeenCalled();
    });

    it("refuses an agreement whose registered agreement's content does not match its key", async () => {
        const d = design();
        d.anchor();
        pinned.set(`ipfs://agreement-${d.id}`, JSON.stringify({ clauses: { [keyOf("figaro-commerce")]: {} } }));
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await expect(result.current.acceptOrder(payloadFor(d))).rejects.toThrow(/was not read/);
        await expect(result.current.commitOrder(signed(payloadFor(d)))).rejects.toThrow(/was not read/);
        expect(commitSignedOrder).not.toHaveBeenCalled();
    });

    it("refuses an agreement carrying a designer value a party changed", async () => {
        const d = design();
        d.anchor();
        const forged = { documents: [{ ...d.documents[0], documentHash: `0x${"ee".repeat(32)}` }] };
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await expect(result.current.acceptOrder(payloadFor(d, forged))).rejects.toThrow(/figaro-consent documents: .*designer/);
        await expect(result.current.commitOrder(signed(payloadFor(d, forged)))).rejects.toThrow(/designer/);
        expect(commitSignedOrder).not.toHaveBeenCalled();
    });

    it("refuses a relayed agreement whose content does not match its agreementHash", async () => {
        const d = design();
        d.anchor();
        const p = payloadFor(d);
        const other = payloadFor(d, { documents: [{ ...d.documents[0], documentVersion: "1.0.1" }] });
        const tampered = { ...p, commitment: { ...p.commitment, agreementHash: other.commitment.agreementHash } };
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await expect(result.current.acceptOrder(tampered)).rejects.toThrow(/agreementHash/);
        await expect(result.current.commitOrder(signed(tampered))).rejects.toThrow(/agreementHash/);
        expect(commitSignedOrder).not.toHaveBeenCalled();
    });
});
