/**
 * assemblyCheckoutProvenance.test.ts — the link from a realized order to the
 * assembly it instantiates is the agreement FORMAT's provenance leaf, set by
 * the checkout walk from the template's own composition hash; no clause
 * section carries it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { agreementLeaves, computeProvenanceLeaf, templateCompositionHash } from "@figaro-protocol/sdk";
import { planAssemblyOrders } from "@/lib/checkout/assemblyCheckout";
import type { BoundAssembly } from "@/lib/member/useMemberBoundAssemblies";
import type { AssemblyTemplate } from "@/lib/shared/assemblyTemplate";
import { primeClauseSpecs } from "./primeClauseSpecs";

vi.mock("@/lib/kernel/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/kernel/contracts")>();
    return { ...actual, CONTRACTS: { ...actual.CONTRACTS, core: "0x0Dac9D673a37cEAfc220eb0B5646375A6Eb88cb5" } };
});

const template = JSON.parse(
    readFileSync(path.resolve(process.cwd(), "../assemblies/pos.json"), "utf8"),
) as AssemblyTemplate;
const BUYER = "0x1111111111111111111111111111111111111111" as const;
const SELLER = "0x2222222222222222222222222222222222222222" as const;
const TOKEN = "0x3333333333333333333333333333333333333333" as const;

describe("assembly checkout — the provenance leaf", () => {
    beforeAll(async () => {
        await primeClauseSpecs();
    });

    it("every realized order names the template's composition hash as its provenance, in no clause section", async () => {
        const assembly = {
            slug: "asm-test",
            name: "Point of sale",
            assemblyTemplate: template,
            counterpartyBindings: [],
        } as unknown as BoundAssembly;
        const orders = await planAssemblyOrders(
            {
                buyer: BUYER,
                leadSellerAddress: SELLER,
                currency: TOKEN,
                payment: 1_000_000n,
                lineItems: [{ itemId: "i1", name: "Coffee", quantity: 1, unitPrice: "1000000" }],
                assembly,
                sellerCatalogs: [],
                tokenDecimals: 6,
                salt: () => 1n,
                deadline: 4_000_000_000n,
            },
            { chainId: 31337 },
        );
        const compositionHash = templateCompositionHash(template);
        expect(orders.length).toBe(template.agreements.length);
        for (const order of orders) {
            expect(order.agreement.provenance).toBe(compositionHash);
            expect(agreementLeaves(order.agreement)).toContain(computeProvenanceLeaf(compositionHash));
            for (const section of order.agreement.sections) {
                expect(JSON.stringify(section.data)).not.toContain(compositionHash.slice(2));
            }
        }
    });
});
