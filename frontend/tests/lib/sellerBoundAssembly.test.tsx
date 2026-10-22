/**
 * A seller accepts only orders under an assembly its own profile binds.
 * Every accept path of `useOrderCommitmentFlow` — `acceptOrder` (the seller
 * counter-signing a buyer-signed order: /sign and the /orders accept card),
 * `counterSignAndReturn` (a race draft) and `quoteAndReturn` (a quote request)
 * — reads the seller's OWN profile at accept time (MembersRegistry →
 * metadataURI → IPFS, through `profileReaderForChain`) and refuses, before
 * anything is signed, an order whose agreement carries no provenance leaf, an
 * order under an assembly the profile does not bind, and any order while the
 * profile cannot be read. The refusal names the assembly by its derived slug
 * and its full assembly hash.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
    agreementHashOf,
    assemblyHashOf,
    buildOrderAgreement,
    computeCheckoutHash,
    deriveAssemblySlug,
    type Agreement,
    type Assembly,
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
// pinned at.
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

// Each member's own profile as MembersRegistry → IPFS returns it: present,
// absent (no live profile), or a read that fails. Every read is recorded, so
// a test sees WHOSE profile the accept path read.
const profiles = new Map<string, MemberProfileMetadata | "fails">();
const profileReads: string[] = [];
vi.mock("@/lib/member/profileFetcher", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/member/profileFetcher")>();
    return {
        ...actual,
        profileReaderForChain: () => async (member: string) => {
            profileReads.push(member.toLowerCase());
            const p = profiles.get(member.toLowerCase());
            if (p === "fails") throw new Error("gateway unreachable");
            return p ?? null;
        },
    };
});

const commitSignedOrder = vi.fn(async () => `0x${"cc".repeat(32)}` as Hex);
vi.mock("@/lib/kernel/orderCommitted", () => ({ commitSignedOrder: (...args: unknown[]) => commitSignedOrder(...(args as [])) }));
vi.mock("@/lib/kernel/useFigaroActions", () => ({ useFigaroActions: () => ({ commit: vi.fn() }) }));
vi.mock("@/lib/composition/useSwapAndCommitActions", () => ({ useSwapAndCommitActions: () => ({ swapAndCommit: vi.fn() }) }));
vi.mock("@/lib/shared/runtimeServicesContext", () => ({ useRuntimeServices: () => ({}) }));
const relayed = vi.fn(async () => undefined);
vi.mock("@/lib/handoff/relayChannel", () => ({ relayCommitmentPayload: (...args: unknown[]) => relayed(...(args as [])) }));

const { useOrderCommitmentFlow } = await import("@/lib/checkout/orderCommitmentFlow");

/** A design of its own per case (a distinct consent document, so a distinct
 *  assembly hash), anchored on the registries and pinned. */
let caseId = 0;
function design() {
    caseId += 1;
    const documents = [{ documentHash: `0x${"d0".repeat(32)}`, documentVersion: "1.0.0", documentTitle: `Terms ${caseId}` }];
    const registered: RegisteredAgreement = { clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-consent")]: { documents } } };
    const agreementHash = agreementHashOf(registered);
    const assembly: Assembly = { agreements: [{ id: "agreement-0", agreementHash, clauses: {} }] };
    const assemblyHash = assemblyHashOf(assembly);
    bindings.set(assemblyHash.toLowerCase(), `ipfs://bound-assembly-${caseId}`);
    bindings.set(agreementHash.toLowerCase(), `ipfs://bound-agreement-${caseId}`);
    pinned.set(`ipfs://bound-assembly-${caseId}`, JSON.stringify(assembly));
    pinned.set(`ipfs://bound-agreement-${caseId}`, JSON.stringify(registered));
    return { agreementHash, assemblyHash, documents };
}

function profileBinding(...assemblyHashes: Hex[]): MemberProfileMetadata {
    return {
        name: "Seller",
        assemblyBindings: assemblyHashes.map((assemblyHash, i) => ({ bindingId: `b-${i}`, subjectAddress: SELLER, assemblyHash })),
    };
}

function payloadUnder(d: ReturnType<typeof design> | null, opts: { buyerSig?: boolean; payment?: bigint } = {}): CommitmentPayload {
    const payment = opts.payment ?? 1000n;
    const { agreement: built } = buildOrderAgreement(BUYER, SELLER, {
        [keyOf("figaro-commerce")]: {
            currency: CURRENCY,
            payment: payment.toString(),
            lineItems: [{ itemId: "item-1", name: "Item", quantity: 1, unitPrice: payment.toString() }],
        },
        ...(d ? { [keyOf("figaro-consent")]: { documents: d.documents } } : {}),
    }, specSource());
    const agreement: Agreement = d ? { ...built, provenance: { agreementHash: d.agreementHash, assemblyHash: d.assemblyHash } } : built;
    const commitment: Commitment = {
        processId: `0x${"00".repeat(32)}` as Hex,
        buyer: BUYER,
        seller: SELLER,
        currency: CURRENCY,
        payment,
        expectedCumulativeValue: payment,
        checkoutHash: computeCheckoutHash(agreement),
        salt: 1n,
        deadline: 9_999_999_999n,
    };
    return opts.buyerSig === false
        ? { commitment, agreement }
        : { commitment, agreement, buyerSig: `0x${"22".repeat(65)}` as Hex };
}

function quoteRequestUnder(d: ReturnType<typeof design>): CommitmentPayload {
    return {
        ...payloadUnder(d, { buyerSig: false }),
        quoteRequest: { pricedFields: [{ clause: keyOf("figaro-commerce"), path: "payment" }, { clause: keyOf("figaro-commerce"), path: "lineItems.0.unitPrice" }] },
    };
}

const named = (h: Hex) => new RegExp(`has not bound assembly ${deriveAssemblySlug(h)} \\(${h}\\)`);

describe("every seller accept path reads the seller's own bound assemblies", () => {
    beforeAll(async () => { await primeClauseSpecs(["figaro-commerce", "figaro-consent"]); });
    beforeEach(() => {
        commitSignedOrder.mockClear();
        relayed.mockClear();
        profiles.clear();
        profileReads.length = 0;
    });

    it("acceptOrder counter-signs and broadcasts an order under an assembly the seller binds, reading the seller's own profile", async () => {
        const d = design();
        profiles.set(SELLER.toLowerCase(), profileBinding(d.assemblyHash));
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await expect(result.current.acceptOrder(payloadUnder(d))).resolves.toMatch(/^0x/);
        expect(commitSignedOrder).toHaveBeenCalledTimes(1);
        expect(profileReads).toEqual([SELLER.toLowerCase()]);
    });

    it("acceptOrder refuses an order under an assembly the seller has not bound, naming it by slug and full hash", async () => {
        const d = design();
        const other = design();
        profiles.set(SELLER.toLowerCase(), profileBinding(other.assemblyHash));
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await expect(result.current.acceptOrder(payloadUnder(d))).rejects.toThrow(named(d.assemblyHash));
        expect(commitSignedOrder).not.toHaveBeenCalled();
    });

    it("acceptOrder refuses an order whose agreement carries no provenance leaf", async () => {
        const d = design();
        profiles.set(SELLER.toLowerCase(), profileBinding(d.assemblyHash));
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await expect(result.current.acceptOrder(payloadUnder(null))).rejects.toThrow(/names no assembly/);
        expect(commitSignedOrder).not.toHaveBeenCalled();
    });

    it("acceptOrder refuses while the seller's profile cannot be read", async () => {
        const d = design();
        profiles.set(SELLER.toLowerCase(), "fails");
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await expect(result.current.acceptOrder(payloadUnder(d))).rejects.toThrow(/could not be read/);
        profiles.delete(SELLER.toLowerCase());
        await expect(result.current.acceptOrder(payloadUnder(d))).rejects.toThrow(/could not be read/);
        expect(commitSignedOrder).not.toHaveBeenCalled();
    });

    it("counterSignAndReturn countersigns a race draft under a bound assembly and refuses one under an assembly the seller has not bound", async () => {
        const d = design();
        const other = design();
        profiles.set(SELLER.toLowerCase(), profileBinding(d.assemblyHash));
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await expect(result.current.counterSignAndReturn(payloadUnder(d, { buyerSig: false }))).resolves.toHaveProperty("sellerSig");
        expect(relayed).toHaveBeenCalledTimes(1);
        await expect(result.current.counterSignAndReturn(payloadUnder(other, { buyerSig: false }))).rejects.toThrow(named(other.assemblyHash));
        expect(relayed).toHaveBeenCalledTimes(1);
    });

    it("quoteAndReturn quotes a request under a bound assembly and refuses one under an assembly the seller has not bound", async () => {
        const d = design();
        const other = design();
        profiles.set(SELLER.toLowerCase(), profileBinding(d.assemblyHash));
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await expect(result.current.quoteAndReturn(quoteRequestUnder(d), 700n)).resolves.toHaveProperty("sellerSig");
        expect(relayed).toHaveBeenCalledTimes(1);
        await expect(result.current.quoteAndReturn(quoteRequestUnder(other), 700n)).rejects.toThrow(named(other.assemblyHash));
        expect(relayed).toHaveBeenCalledTimes(1);
    });
});
