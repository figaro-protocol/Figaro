/**
 * Layer-A sign gate — `assertAgreementSignable`, the ONE thrower every
 * signature routes through (buyer checkout's early check AND `signAs`, which
 * carries both the buyer sign and the seller counter-sign). The specs come
 * from the canonical `clauses/*.json` via the primed cache — the same content
 * the on-chain registry pins.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
    assertAgreementSignable,
    buildOrderAgreement,
    validateCommitmentAgreement,
} from "@/lib/kernel/orderAgreement";
import { primeClauseSpecs } from "./primeClauseSpecs";

const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const SELLER = "0x2546BcD3c84621e976D8185a91A922aE77ECEc30" as const;

beforeAll(async () => {
    await primeClauseSpecs(["figaro-commerce", "figaro-topology", "figaro-applicable-law"]);
});

function commerceData() {
    return {
        currency: "0x0000000000000000000000000000000000000001",
        payment: "1",
        lineItems: [{ itemId: "item-1", name: "Test item", quantity: 1, unitPrice: "1" }],
    };
}

describe("assertAgreementSignable — the shared sign gate", () => {
    it("passes a conforming agreement whose hash matches its merkle root", async () => {
        const { agreement, agreementHash } = buildOrderAgreement(BUYER, SELLER, {
            "figaro-commerce": commerceData(),
            "figaro-applicable-law": { applicableLaw: "US-NY" },
        });
        expect(() => assertAgreementSignable(agreement, agreementHash)).not.toThrow();
    });

    it("throws on a section violating its clause spec, naming clause + path", async () => {
        // Prose fails applicable-law's jurisdiction-token pattern — the exact
        // shape a counter-signer must refuse even when the hash matches.
        const { agreement, agreementHash } = buildOrderAgreement(BUYER, SELLER, {
            "figaro-commerce": commerceData(),
            "figaro-applicable-law": { applicableLaw: "State of New York, USA" },
        });
        expect(() => assertAgreementSignable(agreement, agreementHash))
            .toThrow(/figaro-applicable-law \$\.applicableLaw/);
    });

    it("throws when the hash being signed is not the agreement's merkle root", async () => {
        const { agreement } = buildOrderAgreement(BUYER, SELLER, {
            "figaro-commerce": commerceData(),
        });
        const wrongHash = `0x${"ab".repeat(32)}` as `0x${string}`;
        expect(() => assertAgreementSignable(agreement, wrongHash))
            .toThrow(/\(merkle\) agreementHash/);
    });

    it("reports every issue through validateCommitmentAgreement, not just the first", async () => {
        const { agreement, agreementHash } = buildOrderAgreement(BUYER, SELLER, {
            "figaro-commerce": commerceData(),
            "figaro-applicable-law": {
                applicableLaw: "State of New York, USA",
                language: "not-a-language-code!",
            },
        });
        const check = validateCommitmentAgreement(agreement, agreementHash);
        expect(check.ok).toBe(false);
        const paths = check.issues.map((i) => `${i.clause} ${i.path}`);
        expect(paths.some((p) => p.includes("applicableLaw"))).toBe(true);
        expect(paths.some((p) => p.includes("language"))).toBe(true);
    });
});
