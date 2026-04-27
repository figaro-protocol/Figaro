import { describe, expect, it } from "vitest";
import { OrderState, type Order } from "@/lib/core/store";
import {
    type Agreement,
    COMMERCE_SCHEMA_KEY,
    FULFILMENT_SCHEMA_KEY,
    GEO_SCHEMA_KEY,
    HANDOFF_SCHEMA_KEY,
    JURISDICTION_SCHEMA_KEY,
    TOPOLOGY_SCHEMA_KEY,
    computeSectionLeaf,
} from "@/lib/core/agreementManifest";
import type { AttestationRecord } from "@/lib/mechanisms/useGHGDisclosure";
import { extractContract } from "@/lib/audit/contractExtract";
import { extractInvoice } from "@/lib/audit/invoiceExtract";
import { extractBillOfLading } from "@/lib/audit/billOfLadingExtract";
import { buildHashAppendix } from "@/lib/audit/hashAppendix";
import { buildAuditBundle } from "@/lib/audit/auditBundle";
import { DELIVERY_LIFECYCLE_STAGES } from "@/lib/audit/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BUYER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`;
const SELLER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as `0x${string}`;
const TOKEN = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as `0x${string}`;

function makeOrder(overrides: Partial<Order> = {}): Order {
    return {
        id: "0xORDER1",
        processId: "0xPROCESS1",
        buyer: BUYER,
        seller: SELLER,
        currency: TOKEN,
        agreementHash: "0xAGREEMENT1",
        cumulativeValue: 100n,
        payment: 100n,
        state: OrderState.Active,
        sellerBond: 200n,
        buyerBond: 200n,
        salt: 1n,
        deadline: 9999999999n,
        blockNumber: 42,
        ...overrides,
    };
}

function makeAgreement(extraSections: Agreement["sections"] = []): Agreement {
    return {
        version: "a1",
        buyer: BUYER,
        seller: SELLER,
        sections: [
            {
                schema: COMMERCE_SCHEMA_KEY,
                data: {
                    currency: TOKEN,
                    payment: "100",
                    lineItems: [
                        { itemId: "sku-1", name: "Pizza margherita", quantity: 2, unitPrice: "30" },
                        { itemId: "sku-2", name: "Tiramisu", quantity: 1, unitPrice: "40" },
                    ],
                },
            },
            ...extraSections,
        ].sort((a, b) => a.schema.localeCompare(b.schema)),
    };
}

// ── Contract extractor ────────────────────────────────────────────────────────

describe("extractContract", () => {
    const order = makeOrder();
    const agreement = makeAgreement([
        {
            schema: HANDOFF_SCHEMA_KEY,
            data: { mode: "face-to-face" },
        },
        {
            schema: GEO_SCHEMA_KEY,
            data: { originGeohash: "u4pruydqqvj", destinationGeohash: "u4pruydqqvk" },
        },
        {
            schema: JURISDICTION_SCHEMA_KEY,
            data: { applicableLaw: "US-NY", forum: "JAMS-arbitration", language: "en" },
        },
    ]);
    const contract = extractContract(order, agreement);

    it("titles itself 'Bonded commitment' and carries the orderHash + processId + agreementHash anchors", () => {
        expect(contract.title).toBe("Bonded commitment");
        expect(contract.orderHash).toBe(order.id);
        expect(contract.processId).toBe(order.processId);
        expect(contract.agreementHash).toBe(order.agreementHash);
    });

    it("captures both parties + monetary terms + cumulative value", () => {
        expect(contract.parties).toEqual({ buyer: BUYER, seller: SELLER });
        expect(contract.payment).toBe(100n);
        expect(contract.cumulativeValue).toBe(100n);
        expect(contract.currency.toLowerCase()).toBe(TOKEN.toLowerCase());
    });

    it("emits one clause per section with title + body + recomputed leaf hash", () => {
        expect(contract.clauses).toHaveLength(agreement.sections.length);
        for (const clause of contract.clauses) {
            expect(clause.leafHash).toMatch(/^0x[0-9a-f]{64}$/);
            expect(clause.title.length).toBeGreaterThan(0);
        }
    });

    it("clause leaf hashes match computeSectionLeaf for each section", () => {
        for (let i = 0; i < agreement.sections.length; i++) {
            const expected = computeSectionLeaf(agreement.sections[i]);
            expect(contract.clauses[i].leafHash).toBe(expected);
        }
    });

    it("extracts a jurisdiction summary when a jurisdiction clause is present", () => {
        expect(contract.jurisdiction).toEqual({
            applicableLaw: "US-NY",
            forum: "JAMS-arbitration",
            language: "en",
        });
    });

    it("omits jurisdiction summary when no jurisdiction clause is signed", () => {
        const c = extractContract(order, makeAgreement());
        expect(c.jurisdiction).toBeUndefined();
    });

    it("preserves salt + deadline for full reconstruction", () => {
        expect(contract.salt).toBe(order.salt);
        expect(contract.deadline).toBe(order.deadline);
    });
});

describe("extractContract — lineage (DAG / parentOrderHashes)", () => {
    it("returns empty parentOrderHashes for a root order with no topology clause", () => {
        const c = extractContract(makeOrder(), makeAgreement());
        expect(c.lineage.parentOrderHashes).toEqual([]);
        expect(c.lineage.topologyMode).toBeUndefined();
    });

    it("surfaces parentOrderHashes from a topology clause as a first-class field", () => {
        const parents = ["0xPARENT_A", "0xPARENT_B"];
        const ag = makeAgreement([
            {
                schema: TOPOLOGY_SCHEMA_KEY,
                data: { topologyMode: "explicit", parentOrderHashes: parents },
            },
        ]);
        const c = extractContract(makeOrder(), ag);
        expect(c.lineage.parentOrderHashes).toEqual(parents);
        expect(c.lineage.topologyMode).toBe("explicit");
    });

    it("filters out non-string parent entries silently rather than throwing", () => {
        const ag = makeAgreement([
            {
                schema: TOPOLOGY_SCHEMA_KEY,
                data: { parentOrderHashes: ["0xVALID", 42, null, "0xVALID2"] },
            },
        ]);
        const c = extractContract(makeOrder(), ag);
        expect(c.lineage.parentOrderHashes).toEqual(["0xVALID", "0xVALID2"]);
    });
});

describe("extractContract — fulfilment summary", () => {
    it("surfaces the canonical fulfilment method from a fulfilment clause", () => {
        const ag = makeAgreement([
            { schema: FULFILMENT_SCHEMA_KEY, data: { method: "deliver:dutch-auction" } },
        ]);
        const c = extractContract(makeOrder(), ag);
        expect(c.fulfilment).toEqual({ method: "deliver:dutch-auction" });
    });

    it("omits the fulfilment summary when no fulfilment clause is signed", () => {
        const c = extractContract(makeOrder(), makeAgreement());
        expect(c.fulfilment).toBeUndefined();
    });
});

// ── Invoice extractor ─────────────────────────────────────────────────────────

describe("extractInvoice", () => {
    const order = makeOrder({ payment: 100n });
    const agreement = makeAgreement();
    const invoice = extractInvoice(order, agreement);

    it("uses orderHash as invoice number", () => {
        expect(invoice.invoiceNumber).toBe(order.id);
    });

    it("bills from seller to buyer", () => {
        expect(invoice.billFrom).toBe(SELLER);
        expect(invoice.billTo).toBe(BUYER);
    });

    it("projects line items from the commerce section verbatim", () => {
        expect(invoice.lineItems).toHaveLength(2);
        expect(invoice.lineItems[0]).toEqual({
            itemId: "sku-1",
            name: "Pizza margherita",
            quantity: 2,
            unitPrice: "30",
        });
    });

    it("total equals the order's payment (P)", () => {
        expect(invoice.total).toBe(100n);
    });

    it("returns an empty line-items array when commerce section is missing", () => {
        const noCommerce: Agreement = { version: "a1", buyer: BUYER, seller: SELLER, sections: [] };
        const inv = extractInvoice(order, noCommerce);
        expect(inv.lineItems).toEqual([]);
    });

    it("filters out malformed line items rather than throwing", () => {
        const bad = makeAgreement();
        const commerce = bad.sections.find((s) => s.schema === COMMERCE_SCHEMA_KEY)!;
        (commerce.data as { lineItems: unknown[] }).lineItems.push({ itemId: 123, name: "missing-price" });
        const inv = extractInvoice(order, bad);
        // Only the 2 valid items survive; the malformed one is dropped silently.
        expect(inv.lineItems).toHaveLength(2);
    });
});

// ── Bill of Lading extractor ──────────────────────────────────────────────────

describe("extractBillOfLading", () => {
    const order = makeOrder();
    const agreement = makeAgreement([
        { schema: HANDOFF_SCHEMA_KEY, data: { mode: "face-to-face" } },
        { schema: GEO_SCHEMA_KEY, data: { originGeohash: "u4pruydqqvj", destinationGeohash: "u4pruydqqvk" } },
    ]);

    function makeAttestation(overrides: Partial<AttestationRecord> = {}): AttestationRecord {
        return {
            orderHash: order.id,
            processId: order.processId,
            attester: SELLER,
            schemaId: "figaro-delivery-lifecycle-v1",
            stage: 0,
            contentRef: "0xCONTENT0",
            transactionHash: "0xTX0",
            blockNumber: 50,
            ...overrides,
        };
    }

    it("emits all 5 canonical lifecycle stages with names", () => {
        const bol = extractBillOfLading(order, agreement, []);
        expect(bol.stages).toHaveLength(5);
        for (let i = 0; i < bol.stages.length; i++) {
            expect(bol.stages[i].stageId).toBe(DELIVERY_LIFECYCLE_STAGES[i].id);
            expect(bol.stages[i].stageName).toBe(DELIVERY_LIFECYCLE_STAGES[i].name);
        }
    });

    it("marks all stages as not-attested when no lifecycle attestations are passed", () => {
        const bol = extractBillOfLading(order, agreement, []);
        for (const stage of bol.stages) {
            expect(stage.attested).toBe(false);
            expect(stage.attester).toBeUndefined();
        }
    });

    it("attaches attester + contentRef + tx hash for stages that have on-chain receipts", () => {
        const att = makeAttestation({ stage: 3, contentRef: "0xPICKED", transactionHash: "0xTX_PICKED" });
        const bol = extractBillOfLading(order, agreement, [att]);
        const picked = bol.stages.find((s) => s.stageId === 3)!;
        expect(picked.attested).toBe(true);
        expect(picked.attester).toBe(SELLER);
        expect(picked.contentRef).toBe("0xPICKED");
        expect(picked.transactionHash).toBe("0xTX_PICKED");
    });

    it("ignores attestations for other orders (prevents cross-order leakage)", () => {
        const att = makeAttestation({ orderHash: "0xOTHER_ORDER", stage: 4 });
        const bol = extractBillOfLading(order, agreement, [att]);
        const delivered = bol.stages.find((s) => s.stageId === 4)!;
        expect(delivered.attested).toBe(false);
    });

    it("ignores attestations for other schemas (e.g. GHG, proximity)", () => {
        const att = makeAttestation({ schemaId: "figaro-ghg-measurement-v1", stage: 2 });
        const bol = extractBillOfLading(order, agreement, [att]);
        const enRoute = bol.stages.find((s) => s.stageId === 2)!;
        expect(enRoute.attested).toBe(false);
    });

    it("captures handoff mode + origin/destination geohashes from the agreement", () => {
        const bol = extractBillOfLading(order, agreement, []);
        expect(bol.handoffMode).toBe("face-to-face");
        expect(bol.originGeohash).toBe("u4pruydqqvj");
        expect(bol.destinationGeohash).toBe("u4pruydqqvk");
    });

    it("leaves geohash + handoff fields undefined when those clauses aren't signed", () => {
        const bol = extractBillOfLading(order, makeAgreement(), []);
        expect(bol.handoffMode).toBeUndefined();
        expect(bol.originGeohash).toBeUndefined();
        expect(bol.destinationGeohash).toBeUndefined();
    });
});

// ── Hash appendix ─────────────────────────────────────────────────────────────

describe("buildHashAppendix", () => {
    const order = makeOrder();
    const agreement = makeAgreement([
        { schema: HANDOFF_SCHEMA_KEY, data: { mode: "face-to-face" } },
    ]);
    const attestations: AttestationRecord[] = [
        {
            orderHash: order.id,
            processId: order.processId,
            attester: SELLER,
            schemaId: "figaro-delivery-lifecycle-v1",
            stage: 0,
            contentRef: "0xCONTENT0",
            transactionHash: "0xTX0",
            blockNumber: 50,
        },
    ];
    const appendix = buildHashAppendix(order, agreement, attestations);

    it("includes process id + order hash + agreement root anchors", () => {
        const kinds = new Set(appendix.anchors.map((a) => a.kind));
        expect(kinds.has("process-id")).toBe(true);
        expect(kinds.has("order-hash")).toBe(true);
        expect(kinds.has("agreement-root")).toBe(true);
    });

    it("includes one section-leaf anchor per agreement section", () => {
        const leafAnchors = appendix.anchors.filter((a) => a.kind === "agreement-section-leaf");
        expect(leafAnchors).toHaveLength(agreement.sections.length);
    });

    it("section-leaf anchor hashes match computeSectionLeaf for each section", () => {
        const leafAnchors = appendix.anchors.filter((a) => a.kind === "agreement-section-leaf");
        for (const anchor of leafAnchors) {
            const matchingSection = agreement.sections.find((s) => anchor.label.includes(s.schema));
            expect(matchingSection).toBeDefined();
            expect(anchor.hash).toBe(computeSectionLeaf(matchingSection!));
        }
    });

    it("includes one attestation anchor per lifecycle attestation scoped to this order", () => {
        const attAnchors = appendix.anchors.filter((a) => a.kind === "attestation-content-ref");
        expect(attAnchors).toHaveLength(1);
        expect(attAnchors[0].hash).toBe("0xCONTENT0");
        expect(attAnchors[0].transactionHash).toBe("0xTX0");
    });

    it("excludes attestation anchors for other orders", () => {
        const cross = buildHashAppendix(order, agreement, [{ ...attestations[0], orderHash: "0xOTHER" }]);
        const attAnchors = cross.anchors.filter((a) => a.kind === "attestation-content-ref");
        expect(attAnchors).toHaveLength(0);
    });
});

// ── Bundle assembler ──────────────────────────────────────────────────────────

describe("buildAuditBundle", () => {
    const order = makeOrder();
    const agreement = makeAgreement([
        { schema: HANDOFF_SCHEMA_KEY, data: { mode: "face-to-face" } },
        { schema: GEO_SCHEMA_KEY, data: { originGeohash: "u4pru", destinationGeohash: "u4pry" } },
    ]);
    const bundle = buildAuditBundle(order, agreement, []);

    it("emits all 4 documents", () => {
        expect(bundle.contract).toBeDefined();
        expect(bundle.invoice).toBeDefined();
        expect(bundle.billOfLading).toBeDefined();
        expect(bundle.hashAppendix).toBeDefined();
    });

    it("every document carries the same orderHash + processId + agreementHash anchors", () => {
        for (const doc of [bundle.contract, bundle.invoice, bundle.billOfLading, bundle.hashAppendix]) {
            expect(doc.orderHash).toBe(order.id);
            expect(doc.processId).toBe(order.processId);
            expect(doc.agreementHash).toBe(order.agreementHash);
        }
    });
});
