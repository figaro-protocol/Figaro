/**
 * Every seller in a process must have bound the order's assembly, so the
 * buyer's checkout offers no seller that has not: a dispatch-race or quote
 * candidate is drawn only from members whose profile binds the assembly's
 * assembly hash (`pricedRaceCandidates`), and a co-seller the lead
 * seller designates for a sub-order is used only when its own profile binds
 * it (`withBoundCoSellers`) — otherwise the race or the checkout would end
 * in a seller's refusal. Whether a member binds an assembly is read from its
 * discovered profile (`bindsAssembly`).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { assemblyHashOf, type Hex, type HydratedAssembly } from "@figaro-protocol/sdk";
import { primeClauseSpecs, referenceAssembly, keyOf } from "./primeClauseSpecs";
import type { MemberCatalog } from "@/lib/member/types";
import { bindsAssembly } from "@/lib/member/memberListing";
import { withBoundCoSellers, type BoundAssembly } from "@/lib/member/useMemberBoundAssemblies";
import { pricedRaceCandidates } from "@/lib/checkout/dispatchRace";

const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Hex;
const LEAD = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Hex;
const BOUND_A = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Hex;
const BOUND_B = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Hex;
const NOT_BINDING = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" as Hex;
const OTHER_ASSEMBLY = `0x${"77".repeat(32)}` as Hex;

let hydrated: HydratedAssembly;
let assemblyHash: Hex;

function catalog(address: Hex, price: string, boundTo: Hex[]): MemberCatalog {
    return {
        name: address.slice(0, 8),
        address,
        description: "",
        specialty: "",
        items: [{ id: "service", name: "Service", description: "Service", price, available: true }],
        assemblyBindings: boundTo.map((h, i) => ({ bindingId: `b-${i}`, subjectAddress: address, assemblyHash: h })),
    } as MemberCatalog;
}

function bound(designated: Hex[]): BoundAssembly {
    return {
        slug: "s",
        name: "n",
        hydratedAssembly: hydrated,
        coSellerBindings: [{ clauseKey: keyOf("figaro-courier-process"), addresses: designated }],
    };
}

/** The courier node — the sub-order carrying the courier-process clause. */
function courierNodeId(): string {
    const courierKey = keyOf("figaro-courier-process").toLowerCase();
    const node = hydrated.assembly.agreements.find((a) =>
        Object.keys(hydrated.agreements[a.agreementHash.toLowerCase() as Hex]?.clauses ?? {})
            .some((k) => k.toLowerCase() === courierKey));
    if (!node) throw new Error("the reference assembly composes no courier sub-order");
    return node.id;
}

describe("bindsAssembly — the member's discovered profile decides", () => {
    it("is true only for a member whose profile binds the assembly hash, case-insensitively", () => {
        const h = `0x${"ab".repeat(32)}` as Hex;
        expect(bindsAssembly(catalog(BOUND_A, "1", [h]), h.toUpperCase().replace("0X", "0x") as Hex)).toBe(true);
        expect(bindsAssembly(catalog(BOUND_A, "1", [OTHER_ASSEMBLY]), h)).toBe(false);
        expect(bindsAssembly({ assemblyBindings: undefined }, h)).toBe(false);
    });
});

describe("the buyer offers only sellers that bound the assembly", () => {
    beforeAll(async () => {
        await primeClauseSpecs();
        hydrated = referenceAssembly("local-commerce.json");
        assemblyHash = assemblyHashOf(hydrated.assembly);
    });

    it("a race draws its candidates only from members whose profiles bind the assembly", () => {
        const sellerCatalogs = [
            catalog(LEAD, "5", [assemblyHash]),
            catalog(NOT_BINDING, "1", [OTHER_ASSEMBLY]), // cheapest, but binds another assembly: never raced
            catalog(BOUND_B, "3", [assemblyHash]),
            catalog(BOUND_A, "2", [OTHER_ASSEMBLY, assemblyHash]),
        ];
        const candidates = pricedRaceCandidates({
            checkout: { buyer: BUYER, assembly: bound([]), sellerCatalogs, tokenDecimals: 0 },
            racedNodeId: courierNodeId(),
        });
        expect(candidates.map((c) => c.address)).toEqual([BOUND_A, BOUND_B, LEAD]);
    });

    it("withBoundCoSellers keeps a designated co-seller only when its own profile binds the assembly", () => {
        const sellerCatalogs = [
            catalog(NOT_BINDING, "1", [OTHER_ASSEMBLY]),
            catalog(BOUND_A, "1", [assemblyHash]),
        ];
        const kept = withBoundCoSellers(bound([NOT_BINDING, BOUND_A]), sellerCatalogs);
        expect(kept.coSellerBindings).toEqual([{ clauseKey: keyOf("figaro-courier-process"), addresses: [BOUND_A] }]);
        // A designation none of whose wallets bound the assembly is no
        // designation: the sub-order is left to the buyer's checkout choice.
        const none = withBoundCoSellers(bound([NOT_BINDING]), sellerCatalogs);
        expect(none.coSellerBindings).toEqual([]);
        // A designated wallet the discovered members do not include has no
        // profile to read a binding from.
        const absent = withBoundCoSellers(bound([BOUND_B]), sellerCatalogs);
        expect(absent.coSellerBindings).toEqual([]);
    });
});
