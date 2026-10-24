/**
 * The sign gate on both sign flows reads the design an agreement names and
 * refuses what it cannot read or verify. `useOrderCommitmentFlow`'s sign step
 * (`acceptOrder` → `signAs`, the path every signature takes) and its
 * broadcast of a fully signed payload (`commitOrder`) read the assembly the
 * agreement's provenance leaf names from `AssemblyRegistry` → IPFS, every
 * registered agreement from `AgreementRegistry` → IPFS, verify each against
 * its root or key, and run `assertAgreementSignable` with it. An assembly
 * that cannot be fetched, one that does not hash to its root, a registered
 * agreement whose content does not match its key, an order missing a clause
 * of the registered agreement it names, a designer value a party changed, and
 * a relayed agreement whose content does not match its
 * `checkoutHash` are each refused before anything is signed or broadcast.
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
    type RegisteredAgreement,
    canonicalize,
    computeClauseKey,
    withholdClauseContent,
} from "@figaro-protocol/sdk";
import type { CommitmentPayload } from "@figaro-protocol/sdk/agent";
import { readFileSync } from "node:fs";
import path from "node:path";
import { keyOf, primeClauseSpecs } from "./primeClauseSpecs";
import { specSource, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";

const BUYER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Hex;
const SELLER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Hex;
const CURRENCY = `0x${"ab".repeat(20)}` as Hex;
const ASSEMBLY_REGISTRY = `0x${"a5".repeat(20)}` as Hex;
const AGREEMENT_REGISTRY = `0x${"a6".repeat(20)}` as Hex;

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: SELLER }),
    useChainId: () => 31337,
    usePublicClient: () => chainClient,
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
            clauseRegistry: `0x${"c1".repeat(20)}`,
        },
    };
});

// The chain: each registry's `bindings(key)` → the contentURI the key is
// pinned at, or unregistered; and ClauseRegistry's `ClauseRegistered` events
// (the sign path resolves a clause key the cache has not warmed through them).
const bindings = new Map<string, string>();
const registeredClauses: { clauseKey: Hex; contentURI: string }[] = [];
// The event cache is a module singleton that scans forward from its last
// cursor, so the head advances with each registration and a registration
// lands at the head: a case that registers a clause after an earlier scan
// is still read.
const head = () => BigInt(100 + registeredClauses.length * 100);
const chainClient = {
    chain: { id: 31337 },
    getBlockNumber: async () => head(),
    getLogs: async ({ event, fromBlock }: { event?: { name?: string }; fromBlock?: bigint }) =>
        event?.name === "ClauseRegistered"
            ? registeredClauses.map((r, i) => ({
                args: { clauseKey: r.clauseKey, contentURI: r.contentURI, registeredBy: BUYER },
                blockNumber: head(), logIndex: i, transactionHash: `0x${"ab".repeat(32)}`, address: `0x${"c1".repeat(20)}`,
            })).filter((l) => fromBlock === undefined || l.blockNumber >= fromBlock)
            : [],
    readContract: async ({ args }: { args: [Hex] }) => {
        const uri = bindings.get(args[0].toLowerCase());
        return uri ? [BUYER, 1n, false, uri] : [`0x${"00".repeat(20)}`, 0n, false, ""];
    },
};
vi.mock("@/lib/shared/wagmi", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/shared/wagmi")>();
    return { ...actual, publicClient: chainClient };
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
        assemblyBindings: designed.map((assemblyHash, i) => ({ bindingId: `b-${i}`, subjectAddress: SELLER, assemblyHash })),
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
function design(extraClauses: Record<string, Record<string, unknown>> = {}) {
    caseId += 1;
    const documents = [{ documentHash: `0x${"d0".repeat(32)}`, documentVersion: "1.0.0", documentTitle: `Terms ${caseId}` }];
    const registered: RegisteredAgreement = { clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-consent")]: { documents }, ...extraClauses } };
    const agreementHash = agreementHashOf(registered);
    const assembly: Assembly = { agreements: [{ id: "agreement-0", agreementHash, clauses: {} }] };
    const assemblyHash = assemblyHashOf(assembly);
    designed.push(assemblyHash);
    const anchor = () => {
        bindings.set(assemblyHash.toLowerCase(), `ipfs://assembly-${caseId}`);
        bindings.set(agreementHash.toLowerCase(), `ipfs://agreement-${caseId}`);
        pinned.set(`ipfs://assembly-${caseId}`, JSON.stringify(assembly));
        pinned.set(`ipfs://agreement-${caseId}`, JSON.stringify(registered));
    };
    return { documents, registered, agreementHash, assembly, assemblyHash, anchor, id: caseId };
}

/** The order `d` designs, its consent clause carrying `consent` — or, with
 *  `null`, the order without the consent clause its registered agreement
 *  composes. */
function payloadFor(
    d: ReturnType<typeof design>,
    consent: Record<string, unknown> | null = { documents: d.documents },
    extra: { clause: Hex; data?: Record<string, unknown>; dataHash?: Hex }[] = [],
): CommitmentPayload {
    const { agreement: built } = buildOrderAgreement(BUYER, SELLER, {
        [keyOf("figaro-commerce")]: {
            currency: CURRENCY,
            payment: "1000",
            lineItems: [{ itemId: "item-1", name: "Item", quantity: 1, unitPrice: "1000" }],
        },
        ...(consent === null ? {} : { [keyOf("figaro-consent")]: consent }),
    }, specSource());
    const agreement: Agreement = { ...built, clauses: [...built.clauses, ...extra], provenance: { agreementHash: d.agreementHash, assemblyHash: d.assemblyHash } };
    const commitment: Commitment = {
        processId: `0x${"00".repeat(32)}` as Hex,
        buyer: BUYER,
        seller: SELLER,
        currency: CURRENCY,
        payment: 1000n,
        expectedCumulativeValue: 1000n,
        checkoutHash: computeCheckoutHash(agreement),
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

    it("refuses an agreement whose assembly does not verify against its assembly root", async () => {
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

    it("refuses an order missing a clause of the registered agreement it names, naming the assembly by slug and full hash", async () => {
        const d = design();
        d.anchor();
        const missing = new RegExp(`figaro-consent clause: the order does not carry this clause, which assembly ${deriveAssemblySlug(d.assemblyHash)} \\(${d.assemblyHash}\\) composes`);
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await expect(result.current.acceptOrder(payloadFor(d, null))).rejects.toThrow(missing);
        await expect(result.current.commitOrder(signed(payloadFor(d, null)))).rejects.toThrow(missing);
        expect(commitSignedOrder).not.toHaveBeenCalled();
    });

    it("refuses a relayed agreement whose content does not match its checkoutHash", async () => {
        const d = design();
        d.anchor();
        const p = payloadFor(d);
        const other = payloadFor(d, { documents: [{ ...d.documents[0], documentVersion: "1.0.1" }] });
        const tampered = { ...p, commitment: { ...p.commitment, checkoutHash: other.commitment.checkoutHash } };
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await expect(result.current.acceptOrder(tampered)).rejects.toThrow(/checkoutHash/);
        await expect(result.current.commitOrder(signed(tampered))).rejects.toThrow(/checkoutHash/);
        expect(commitSignedOrder).not.toHaveBeenCalled();
    });
});

describe("the sign gate refuses what it cannot read — and reads a registered spec the cache had not warmed", () => {
    // A clause whose spec this file never primes: its key is the hash of the
    // spec's pinned bytes, the bytes `clauses/figaro-geolocation.json` holds.
    const raw = readFileSync(path.resolve(process.cwd(), "../clauses/figaro-geolocation.json"), "utf8");
    const geoBytes = canonicalize(JSON.parse(raw));
    const geoKey = computeClauseKey(JSON.parse(raw));
    const geoData = { geocodeStandard: "geohash", origin: "u4pruydqqvj", destination: "u4pruydqqvm" };
    beforeAll(async () => {
        await primeClauseSpecs(["figaro-commerce", "figaro-consent"]);
        // From here the spec bytes come from the pinned map, as the assemblies do.
        setClauseSpecFetcher(async (uri) => {
            const body = pinned.get(uri);
            if (body === undefined) throw new Error(`not pinned: ${uri}`);
            return body;
        });
    });
    beforeEach(() => { commitSignedOrder.mockClear(); registeredClauses.length = 0; });

    // The cache is a module singleton: the refusal runs while the spec is unloaded,
    // and the read that loads it comes after.
    it("refuses an order carrying a clause no registry holds — its spec cannot be read, so nothing is signed", async () => {
        const d = design({ [geoKey]: {} });
        d.anchor();
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await expect(result.current.acceptOrder(payloadFor(d, undefined, [{ clause: geoKey, data: geoData }]))).rejects.toThrow(/spec is not loaded/);
        expect(commitSignedOrder).not.toHaveBeenCalled();
    });

    it("signs an order whose clause the registry holds: the spec is read through ClauseRegistered and the gate runs on it", async () => {
        const d = design({ [geoKey]: {} });
        d.anchor();
        registeredClauses.push({ clauseKey: geoKey, contentURI: "ipfs://geo-spec" });
        pinned.set("ipfs://geo-spec", geoBytes);
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await expect(result.current.acceptOrder(payloadFor(d, undefined, [{ clause: geoKey, data: geoData }]))).resolves.toMatch(/^0x/);
        expect(commitSignedOrder).toHaveBeenCalledTimes(1);
    });

    it("refuses an order carrying a content-withheld leaf — a signer binds no leaf it cannot read", async () => {
        const d = design();
        d.anchor();
        const { result } = renderHook(() => useOrderCommitmentFlow());
        // The design composes consent, so the leaf is the design's; withheld, it is still unreadable.
        const full = payloadFor(d);
        const agreement = { ...full.agreement, clauses: full.agreement.clauses.map((c) => c.clause === keyOf("figaro-consent") ? withholdClauseContent(c) : c) };
        const p = { ...full, agreement, commitment: { ...full.commitment, checkoutHash: computeCheckoutHash(agreement) } };
        await expect(result.current.acceptOrder(p)).rejects.toThrow(/content is withheld/);
        expect(commitSignedOrder).not.toHaveBeenCalled();
    });
});
