/**
 * assemblyCheckoutProvenance.test.ts — the link from a realized order to the
 * assembly it instantiates is the agreement FORMAT's provenance leaf, set by
 * the checkout walk from the agreement's registered agreement key and the
 * assembly's own composition root; no clause section carries it.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { agreementLeaves, computeProvenanceLeaf, assemblyCompositionHash } from "@figaro-protocol/sdk";
import { planAssemblyOrders } from "@/lib/checkout/assemblyCheckout";
import type { BoundAssembly } from "@/lib/member/useMemberBoundAssemblies";
import { referenceAssembly, primeClauseSpecs } from "./primeClauseSpecs";

vi.mock("@/lib/kernel/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/kernel/contracts")>();
    return { ...actual, CONTRACTS: { ...actual.CONTRACTS, core: "0x0Dac9D673a37cEAfc220eb0B5646375A6Eb88cb5" } };
});

// The reference assembly as the seeding registers it: built over the authored
// agreements its agreements name, each agreement's agreement beside the assembly.
const BUYER = "0x1111111111111111111111111111111111111111" as const;
const SELLER = "0x2222222222222222222222222222222222222222" as const;
const TOKEN = "0x3333333333333333333333333333333333333333" as const;

describe("assembly checkout — the provenance leaf", () => {
    beforeAll(async () => {
        await primeClauseSpecs();
    });

    it("every realized order names its agreement's agreement key and the composition root as its provenance, in no clause section", async () => {
        const hydratedAssembly = referenceAssembly("pos.json");
        const assembly = hydratedAssembly.assembly;
        const bound: BoundAssembly = {
            slug: "asm-test",
            name: "Point of sale",
            hydratedAssembly,
            counterpartyBindings: [],
        };
        const orders = await planAssemblyOrders(
            {
                buyer: BUYER,
                leadSellerAddress: SELLER,
                currency: TOKEN,
                payment: 1_000_000n,
                lineItems: [{ itemId: "i1", name: "Coffee", quantity: 1, unitPrice: "1000000" }],
                assembly: bound,
                sellerCatalogs: [],
                tokenDecimals: 6,
                salt: () => 1n,
                deadline: 4_000_000_000n,
            },
            { chainId: 31337 },
        );
        const compositionHash = assemblyCompositionHash(assembly);
        expect(orders.length).toBe(assembly.agreements.length);
        for (const order of orders) {
            const entry = assembly.agreements.find((s) => s.id === order.nodeId)!;
            expect(order.agreement.provenance).toEqual({ agreementKey: entry.agreementKey, compositionHash });
            expect(agreementLeaves(order.agreement)).toContain(computeProvenanceLeaf(entry.agreementKey, compositionHash));
            for (const section of order.agreement.sections) {
                expect(JSON.stringify(section.data)).not.toContain(compositionHash.slice(2));
            }
        }
    });
});
