/**
 * agreementRegistryHydration.test.ts — the registered agreement read at the
 * edge, and the designer's binding of one to an agreement.
 *
 * `fetchRegisteredAgreement` reads the `AgreementRegistry` binding BY KEY, the
 * pinned document at its `contentURI`, and verifies the document against the
 * key: no binding, a failed fetch, a document that is not JSON, or one whose
 * clauses key elsewhere is ABSENCE (null), and `hydrateAnchoredAssembly` then
 * offers no assembly — never a fallback to another copy.
 *
 * The designer binds a registered agreement to an agreement as is
 * (`registeredByOrderId`), and composes a new one for another: the build
 * keeps the bound key, registers only the new one, and refuses an agreement
 * that does both with the SDK's own message.
 */
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { agreementKeyOf, canonicalize, type RegisteredAgreement, type Hex } from "@figaro-protocol/sdk";

const reads = vi.hoisted(() => ({
    bindings: new Map<string, readonly [string, bigint, boolean, string]>(),
    documents: new Map<string, string | null>(),
}));

vi.mock("@/lib/kernel/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/kernel/contracts")>();
    return { ...actual, CONTRACTS: { ...actual.CONTRACTS, agreementRegistry: "0x00000000000000000000000000000000000a9e01" } };
});
vi.mock("@/lib/shared/wagmi", () => ({
    publicClient: {
        readContract: async ({ args }: { args: [string] }) =>
            reads.bindings.get(args[0].toLowerCase()) ?? [ZERO_ADDRESS, 0n, false, ""],
    },
    activeChain: { id: 31337 },
}));
vi.mock("@/lib/shared/ipfsService", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/shared/ipfsService")>();
    return {
        ...actual,
        DEFAULT_IPFS_SERVICE: { ...actual.DEFAULT_IPFS_SERVICE, resolveFetchUrl: (uri: string) => uri },
        fetchCappedContent: async (url: string) => {
            const body = reads.documents.get(url);
            if (body === null || body === undefined) throw new Error("unreachable");
            return { ok: true, status: 200, statusText: "OK", text: async () => body };
        },
    };
});

import { fetchRegisteredAgreement, getRegisteredAgreement, getRegisteredAgreementLoadError, hydrateAnchoredAssembly } from "@/lib/protocol/useAgreementRegistry";
import { projectSnapshotForReview } from "@/lib/designer/draftToAssembly";
import { createSyntheticRootOrder, createSyntheticSubOrder, startSyntheticSession } from "@/lib/designer/syntheticProcess";
import type { DesignSnapshot } from "@/lib/designer/syntheticDesignStore";
import { keyOf, primeClauseSpecs } from "./primeClauseSpecs";

const REGISTRANT = "0x0000000000000000000000000000000000005e11";

/** Register `doc` under its key at `uri` — the binding a registry read returns. */
function register(doc: RegisteredAgreement, uri: string, body: string | null = canonicalize(doc)): Hex {
    const key = agreementKeyOf(doc);
    reads.bindings.set(key.toLowerCase(), [REGISTRANT, 7n, false, uri]);
    reads.documents.set(uri, body);
    return key;
}

beforeAll(async () => {
    await primeClauseSpecs(["figaro-commerce", "figaro-topology", "figaro-schedule", "figaro-acceptance-criteria"]);
});

describe("fetchRegisteredAgreement — the binding by key, the document verified against it", () => {
    beforeEach(() => {
        reads.bindings.clear();
        reads.documents.clear();
    });

    it("reads a registered agreement and keeps it for the session", async () => {
        const doc = { name: "Counter sale · order-0", clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-schedule")]: {} } };
        const key = register(doc, "ipfs://registered-1");
        const read = await fetchRegisteredAgreement(key);
        expect(read?.clauses).toEqual(doc.clauses);
        expect(read?.name).toBe(doc.name);
        expect(getRegisteredAgreement(key)?.clauses).toEqual(doc.clauses);
    });

    it("reads an agreement whose stake was withdrawn — bindings are never cleared", async () => {
        const doc = { clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-acceptance-criteria")]: {} } };
        const key = register(doc, "ipfs://withdrawn");
        reads.bindings.set(key.toLowerCase(), [REGISTRANT, 7n, true, "ipfs://withdrawn"]);
        expect((await fetchRegisteredAgreement(key))?.clauses).toEqual(doc.clauses);
    });

    it("is absent when no binding exists", async () => {
        expect(await fetchRegisteredAgreement(`0x${"5a".repeat(32)}`)).toBeNull();
    });

    it("is absent when the pinned document is unreachable or not JSON", async () => {
        const unreachable = register({ clauses: { [keyOf("figaro-topology")]: { a: 1 } } }, "ipfs://gone", null);
        expect(await fetchRegisteredAgreement(unreachable)).toBeNull();
        const garbled = register({ clauses: { [keyOf("figaro-topology")]: { a: 2 } } }, "ipfs://garbled", "not json");
        expect(await fetchRegisteredAgreement(garbled)).toBeNull();
    });

    it("is absent when the document's clauses key elsewhere — the name rides outside the key, the clauses do not — and that absence is PERMANENT: recorded, never re-read", async () => {
        const doc = { clauses: { [keyOf("figaro-topology")]: { a: 3 } } };
        const other = { clauses: { [keyOf("figaro-topology")]: { a: 4 } } };
        const key = register(doc, "ipfs://swapped", canonicalize(other));
        expect(await fetchRegisteredAgreement(key)).toBeNull();
        expect(getRegisteredAgreementLoadError(key)).toMatch(/not the agreement the key/);
        // The binding now points at a document that WOULD verify: a retired
        // registration's bytes never change, so the failure is not re-read.
        reads.documents.set("ipfs://swapped", canonicalize(doc));
        expect(await fetchRegisteredAgreement(key)).toBeNull();
        expect(getRegisteredAgreement(key)).toBeUndefined();
    });

    it("a gateway miss is NOT permanent: nothing is recorded and the next read lands", async () => {
        const doc = { clauses: { [keyOf("figaro-topology")]: { a: 5 } } };
        const key = register(doc, "ipfs://late", null);
        expect(await fetchRegisteredAgreement(key)).toBeNull();
        expect(getRegisteredAgreementLoadError(key)).toBeUndefined();
        reads.documents.set("ipfs://late", canonicalize(doc));
        expect((await fetchRegisteredAgreement(key))?.clauses).toEqual(doc.clauses);
    });

    it("hydrates an assembly only when every agreement's agreement reads", async () => {
        const present = { clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-topology")]: {} } };
        const presentKey = register(present, "ipfs://present");
        const absentKey = agreementKeyOf({ clauses: { [keyOf("figaro-commerce")]: { never: true } } });
        const entries = [
            { id: "order-0", agreementKey: presentKey, clauses: {} },
            { id: "order-1", agreementKey: absentKey, clauses: {} },
        ];
        expect(await hydrateAnchoredAssembly({ agreements: entries })).toBeNull();
        const whole = await hydrateAnchoredAssembly({ agreements: [entries[0]] });
        expect(whole?.agreements[presentKey.toLowerCase() as Hex]?.clauses).toEqual(present.clauses);
    });
});

describe("the designer binds a registered agreement to one agreement and composes another", () => {
    /** The registered agreement each order picks in the mandatory article:
     *  the mandatory clauses alone, read from the registry like any other. */
    let pickKey: Hex;
    beforeEach(async () => {
        const pick = { name: "Mandatory clauses", clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-topology")]: {} } };
        pickKey = register(pick, "ipfs://mandatory-clauses");
        await fetchRegisteredAgreement(pickKey);
    });

    function snapshot(composition: Pick<DesignSnapshot, "clausesByOrderId" | "registeredByOrderId">): DesignSnapshot & { rootId: string; subId: string } {
        const session = startSyntheticSession();
        const root = createSyntheticRootOrder(session);
        const sub = createSyntheticSubOrder(session, root.order);
        return {
            slug: "bind-and-compose",
            name: "Bind and compose",
            processId: session.processId,
            nextOrderIndex: session.nextOrderIndex,
            nextSellerIndex: session.nextSellerIndex,
            orders: [root.order, sub.order],
            createdAt: 1,
            updatedAt: 1,
            rootId: root.order.orderHash,
            subId: sub.order.orderHash,
            mandatoryByOrderId: { [root.order.orderHash]: pickKey, [sub.order.orderHash]: pickKey },
            ...composition,
        };
    }

    it("keeps the bound key, registers only the new agreement, and states both on the review", async () => {
        // A registered agreement carrying the clauses of its pick.
        const registered = { name: "Scheduled work", clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-topology")]: {}, [keyOf("figaro-schedule")]: {} } };
        const boundKey = register(registered, "ipfs://scheduled-work");
        await fetchRegisteredAgreement(boundKey);
        const base = snapshot({});
        const snap = {
            ...base,
            registeredByOrderId: { [base.rootId]: boundKey },
            clausesByOrderId: { [base.subId]: { [keyOf("figaro-acceptance-criteria")]: {} } },
        };
        const review = projectSnapshotForReview(snap);
        if (!review.ok) throw new Error(review.error);
        expect(review.entries.map((s) => [s.agreementKey === boundKey, s.bound])).toEqual([[true, true], [false, false]]);
        const newKeys = Object.keys(review.newAgreements);
        expect(newKeys).toHaveLength(1);
        expect(newKeys[0]).not.toBe(boundKey);
        // The new agreement merges its pick's clauses beside the designer's composition.
        expect(Object.keys(review.newAgreements[newKeys[0] as Hex].clauses).sort())
            .toEqual([keyOf("figaro-commerce"), keyOf("figaro-topology"), keyOf("figaro-acceptance-criteria")].sort());
        // The bound agreement carries only its own topology fill.
        expect(review.assembly.agreements[0].clauses).toEqual({ [keyOf("figaro-topology")]: { parentOrderHashes: [] } });
    });

    it("refuses an agreement that binds and composes — the SDK's message reaches the review", async () => {
        const registered = { clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-topology")]: {} } };
        const boundKey = register(registered, "ipfs://plain");
        await fetchRegisteredAgreement(boundKey);
        const base = snapshot({});
        const review = projectSnapshotForReview({
            ...base,
            registeredByOrderId: { [base.rootId]: boundKey },
            clausesByOrderId: { [base.rootId]: { [keyOf("figaro-schedule")]: {} } },
        });
        expect(review.ok).toBe(false);
        if (!review.ok) expect(review.error).toMatch(/binds a registered agreement and also composes clauses/);
    });

    it("refuses a bound agreement lacking a clause of the registered agreement picked for its order", async () => {
        const short = { name: "No topology", clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-schedule")]: {} } };
        const boundKey = register(short, "ipfs://no-topology");
        await fetchRegisteredAgreement(boundKey);
        const base = snapshot({});
        const review = projectSnapshotForReview({ ...base, registeredByOrderId: { [base.rootId]: boundKey } });
        expect(review.ok).toBe(false);
        if (!review.ok) expect(review.error).toMatch(/order-0: registered agreement 0x[0-9a-f]{64} lacks figaro-topology .* picked in the mandatory article/);
    });

    it("refuses a binding this tab has not read — the build never binds an agreement it cannot read", () => {
        const base = snapshot({});
        const review = projectSnapshotForReview({ ...base, registeredByOrderId: { [base.rootId]: `0x${"6c".repeat(32)}` } });
        expect(review.ok).toBe(false);
        if (!review.ok) expect(review.error).toMatch(/has not been read/);
    });
});
