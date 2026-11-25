/**
 * The dispatch race sends each candidate a draft of the raced order. A
 * private clause's blinding value is drawn per draft, so no losing candidate
 * holds the value the winner's order is signed with; and the draft that wins
 * keeps the values it was drafted with, so the commit walk rebuilds the very
 * struct the winner countersigned.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { agreementHashOf, hashCommitmentStruct, type Hex, type HydratedProcessDesign } from "@figaro-protocol/sdk";
import { loadClauseSpec, setClauseSpecFetcher, specSource } from "@/lib/shared/clauseSpecSource";
import { planProcessOrders } from "@/lib/checkout/assemblyCheckout";
import { freshBlindingStore, withCheckoutBlinding, type CheckoutFills } from "@/lib/checkout/checkoutBlinding";
import { draftRaceCandidates } from "@/lib/checkout/dispatchRace";
import type { BoundAssembly } from "@/lib/registries/useMemberBoundAssemblies";
import { canonicalFileBytes, keyOf, pinSpec, primeClauseSpecs } from "./primeClauseSpecs";

vi.mock("@/lib/core/contracts", async (importOriginal) =>
    (await import("../support/contractsMock")).contractsMock(await importOriginal<typeof import("@/lib/core/contracts")>(), { core: "0x0Dac9D673a37cEAfc220eb0B5646375A6Eb88cb5" }));

const BUYER = "0x1111111111111111111111111111111111111111" as const;
const LEAD = "0x2222222222222222222222222222222222222222" as const;
const CANDIDATE_A = "0x4444444444444444444444444444444444444444" as const;
const CANDIDATE_B = "0x5555555555555555555555555555555555555555" as const;
const TOKEN = "0x3333333333333333333333333333333333333333" as const;

const PRIVATE = pinSpec({
    clauseId: "test-race-private",
    version: 1,
    title: "Private grade",
    description: "A private committed value with few possibilities.",
    fields: [
        { name: "grade", type: "enum", values: ["a", "b", "c"], required: true, disposition: "private" },
        { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true },
    ],
});

let hydrated: HydratedProcessDesign;

beforeAll(async () => {
    await primeClauseSpecs(["figaro-commerce"]);
    setClauseSpecFetcher(async (uri) => (uri === "mem://race-private" ? PRIVATE.bytes : canonicalFileBytes(uri)));
    await loadClauseSpec(PRIVATE.clauseKey, "mem://race-private");
    const root = { [keyOf("figaro-commerce")]: {} };
    const sub = { [PRIVATE.clauseKey]: {} };
    const rootHash = agreementHashOf({ clauses: root });
    const subHash = agreementHashOf({ clauses: sub });
    hydrated = {
        assembly: {
            agreements: [
                { id: "agreement-0", agreementHash: rootHash, clauses: {}, follows: [] },
                { id: "agreement-1", agreementHash: subHash, clauses: {}, follows: ["agreement-0"] },
            ],
        },
        agreements: {
            [rootHash.toLowerCase() as Hex]: { clauses: root },
            [subHash.toLowerCase() as Hex]: { clauses: sub },
        },
    };
});

const pricing = (price: bigint) => ({
    item: { id: "svc", name: "Service", description: "", price: price.toString(), available: true },
    payment: price,
    unitPrice: price,
    billedQuantity: 1,
}) as never;

describe("the dispatch race draws a blinding value per candidate's draft", () => {
    it("two candidates' drafts carry different values; the signed order carries the winner's", async () => {
        const kept: CheckoutFills = {};
        const fills = withCheckoutBlinding(hydrated, { "agreement-1": { [PRIVATE.clauseKey]: { grade: "b" } } }, specSource(), kept);
        const checkout = {
            buyer: BUYER as Hex,
            leadSellerAddress: LEAD as Hex,
            currency: TOKEN as Hex,
            payment: 1_000_000n,
            lineItems: [{ itemId: "i1", name: "Coffee", quantity: 1, unitPrice: "1000000" }],
            assembly: { slug: "asm-race", name: "Race", hydratedAssembly: hydrated, coSellerBindings: [] } as BoundAssembly,
            sellerCatalogs: [],
            tokenDecimals: 6,
            clauseFills: fills,
        };
        const salt = () => 7n;
        const deadline = 4_000_000_000n;
        const drafts = await draftRaceCandidates({
            checkout,
            racedNodeId: "agreement-1",
            candidates: [
                { address: CANDIDATE_A as Hex, endpoint: undefined, pricing: pricing(500n) },
                { address: CANDIDATE_B as Hex, endpoint: undefined, pricing: pricing(600n) },
            ],
            salt,
            deadline,
            chainId: 31337,
        });
        const valueOf = (i: number) => drafts[i].draft.agreement.clauses
            .find((c) => c.clause.toLowerCase() === PRIVATE.clauseKey.toLowerCase())?.data?.blinding;
        expect(valueOf(0)).toMatch(/^0x[0-9a-f]{64}$/);
        expect(valueOf(1)).toMatch(/^0x[0-9a-f]{64}$/);
        expect(valueOf(0)).not.toBe(valueOf(1));
        // Neither draft carries the value the checkout page drew for itself.
        expect([valueOf(0), valueOf(1)]).not.toContain(fills["agreement-1"][PRIVATE.clauseKey].blinding);

        // The winner (B) — the checkout keeps the winner's draw for the raced
        // node, and the commit walk rebuilds the struct B countersigned.
        const winner = drafts[1];
        kept["agreement-1"] = winner.blinding;
        const signedFills = withCheckoutBlinding(hydrated, { "agreement-1": { [PRIVATE.clauseKey]: { grade: "b" } } }, specSource(), kept);
        const orders = await planProcessOrders({
            ...checkout,
            clauseFills: signedFills,
            subOrderSelections: { "agreement-1": { seller: CANDIDATE_B as Hex, price: winner.price, item: winner.item } },
            salt,
            deadline,
        }, { chainId: 31337 });
        const order = orders.find((o) => o.nodeId === "agreement-1")!;
        expect(hashCommitmentStruct(order.commitment)).toBe(winner.structHash);
        expect(order.agreement.clauses.find((c) => c.clause.toLowerCase() === PRIVATE.clauseKey.toLowerCase())?.data?.blinding).toBe(valueOf(1));
    });
});

/**
 * A raced checkout whose attempt failed is retried. The race fixed every
 * order's salt and the deadline, and the winner countersigned the raced
 * order's struct, which names the process id (the root's hash) and its
 * parents' order hashes. So the retry must rebuild every order's struct as
 * it was: the raced struct must hash to what the winner countersigned.
 */
describe("a retry after a failed raced attempt rebuilds the struct the winner countersigned", () => {
    const BOTH_HOLD = (): HydratedProcessDesign => {
        const root = { [keyOf("figaro-commerce")]: {}, [PRIVATE.clauseKey]: {} };
        const sub = { [PRIVATE.clauseKey]: {} };
        const rootHash = agreementHashOf({ clauses: root });
        const subHash = agreementHashOf({ clauses: sub });
        return {
            assembly: {
                agreements: [
                    { id: "agreement-0", agreementHash: rootHash, clauses: {}, follows: [] },
                    { id: "agreement-1", agreementHash: subHash, clauses: {}, follows: ["agreement-0"] },
                ],
            },
            agreements: {
                [rootHash.toLowerCase() as Hex]: { clauses: root },
                [subHash.toLowerCase() as Hex]: { clauses: sub },
            },
        };
    };
    const ASSEMBLY_SCOPE = (): HydratedProcessDesign => {
        const root = { [keyOf("figaro-commerce")]: {} };
        const sub = { [keyOf("figaro-commerce")]: {} };
        const rootHash = agreementHashOf({ clauses: root });
        return {
            assembly: {
                assemblyClauses: { [PRIVATE.clauseKey]: {} },
                agreements: [
                    { id: "agreement-0", agreementHash: rootHash, clauses: {}, follows: [] },
                    { id: "agreement-1", agreementHash: rootHash, clauses: {}, follows: ["agreement-0"] },
                ],
            },
            agreements: { [rootHash.toLowerCase() as Hex]: { clauses: sub } },
        };
    };

    async function raceFailRetry(design: HydratedProcessDesign, buyerFills: CheckoutFills) {
        // The page's store: the checkout draws each order's values once.
        let kept: CheckoutFills = {};
        const fills = withCheckoutBlinding(design, buyerFills, specSource(), kept);
        const checkout = {
            buyer: BUYER as Hex,
            leadSellerAddress: LEAD as Hex,
            currency: TOKEN as Hex,
            payment: 1_000_000n,
            lineItems: [{ itemId: "i1", name: "Coffee", quantity: 1, unitPrice: "1000000" }],
            assembly: { slug: "asm-race", name: "Race", hydratedAssembly: design, coSellerBindings: [] } as BoundAssembly,
            sellerCatalogs: [],
            tokenDecimals: 6,
            clauseFills: fills,
        };
        const salts: Record<string, bigint> = { "agreement-0": 11n, "agreement-1": 12n };
        const salt = (nodeId: string) => salts[nodeId];
        const deadline = 4_000_000_000n;
        const [winner] = await draftRaceCandidates({
            checkout,
            racedNodeId: "agreement-1",
            candidates: [{ address: CANDIDATE_A as Hex, endpoint: undefined, pricing: pricing(500n) }],
            salt,
            deadline,
            chainId: 31337,
        });
        const outcome = { nodeId: "agreement-1", blinding: winner.blinding };
        // The page folds the winner's values into its store on render.
        Object.assign((kept[outcome.nodeId] ??= {}), outcome.blinding);
        const walk = async () => {
            const walkFills = withCheckoutBlinding(design, buyerFills, specSource(), kept);
            const orders = await planProcessOrders({
                ...checkout,
                clauseFills: walkFills,
                subOrderSelections: { "agreement-1": { seller: CANDIDATE_A as Hex, price: winner.price, item: winner.item } },
                salt,
                deadline,
            }, { chainId: 31337 });
            return orders.find((o) => o.nodeId === "agreement-1")!;
        };
        // The first attempt rebuilds the winner's struct; then it fails.
        expect(hashCommitmentStruct((await walk()).commitment)).toBe(winner.structHash);
        kept = freshBlindingStore(kept, outcome);
        return { retried: await walk(), winner };
    }

    it("the root and the raced order both hold a private clause", async () => {
        const design = BOTH_HOLD();
        const { retried, winner } = await raceFailRetry(design, {
            "agreement-0": { [PRIVATE.clauseKey]: { grade: "a" } },
            "agreement-1": { [PRIVATE.clauseKey]: { grade: "b" } },
        });
        expect(hashCommitmentStruct(retried.commitment)).toBe(winner.structHash);
    });

    it("an assembly-scope private clause sits in every order", async () => {
        const design = ASSEMBLY_SCOPE();
        const { retried, winner } = await raceFailRetry(design, {
            "agreement-0": { [PRIVATE.clauseKey]: { grade: "c" } },
            "agreement-1": { [PRIVATE.clauseKey]: { grade: "c" } },
        });
        expect(hashCommitmentStruct(retried.commitment)).toBe(winner.structHash);
    });
});
