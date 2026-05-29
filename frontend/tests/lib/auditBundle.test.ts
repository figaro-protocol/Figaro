import { describe, expect, it } from "vitest";
import { OrderState, type Order } from "@/lib/core/store";
import { ANVIL_ACCOUNTS, DEFAULT_LOCAL_MOCK_TOKEN } from "../anvilAccounts";
import {
    type Agreement,
    COMMERCE_SCHEMA_KEY,
    FULFILMENT_V2_SCHEMA_KEY,
    GEO_SCHEMA_KEY,
    GHG_MEASUREMENT_SCHEMA_KEY,
    APPLICABLE_LAW_SCHEMA_KEY,
    PROXIMITY_POLICY_SCHEMA_KEY,
    PROXIMITY_PROOF_SCHEMA_KEY,
    TOPOLOGY_SCHEMA_KEY,
    computeSectionLeaf,
} from "@/lib/core/agreementManifest";
import type { AttestationRecord } from "@/lib/mechanisms/useGHGDisclosure";
import { extractContract } from "@/lib/audit/contractExtract";
import { extractInvoice } from "@/lib/audit/invoiceExtract";
import { extractBillOfLading } from "@/lib/audit/billOfLadingExtract";
import { extractEmissions } from "@/lib/audit/emissionsExtract";
import { extractProximity } from "@/lib/audit/proximityExtract";
import { extractProcessLogs } from "@/lib/audit/processLogsExtract";
import {
    extractDutchAuction,
    type DutchAuctionCreatedEvent,
    type DutchAuctionClaimedEvent,
} from "@/lib/audit/dutchAuctionExtract";
import {
    extractSellerRegistry,
    type SellerRegisteredEvent,
} from "@/lib/audit/sellerRegistryExtract";
import { buildHashAppendix } from "@/lib/audit/hashAppendix";
import { buildAuditBundle, isCarriageOrder } from "@/lib/audit/auditBundle";

const COURIER_PROCESS_SCHEMA_KEY = "figaro-courier-process-v1";
import { DELIVERY_LIFECYCLE_STAGES } from "@/lib/audit/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BUYER = ANVIL_ACCOUNTS[1];
const SELLER = ANVIL_ACCOUNTS[2];
const TOKEN = DEFAULT_LOCAL_MOCK_TOKEN;

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
            schema: FULFILMENT_V2_SCHEMA_KEY,
            data: { modalities: ["pickup"], coordinations: [], handoffPoints: ["face-to-face"] },
        },
        {
            schema: GEO_SCHEMA_KEY,
            data: {
                originGeohash: "u4pruydqqvj",
                destinationGeohash: "u4pruydqqvk",
                massGrams: 500,
                volumeMl: 1000,
                classOfService: "S",
            },
        },
        {
            schema: APPLICABLE_LAW_SCHEMA_KEY,
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
    it("surfaces the canonical fulfilment method derived from v2 modality + coordination", () => {
        const ag = makeAgreement([
            {
                schema: FULFILMENT_V2_SCHEMA_KEY,
                data: { modalities: ["delivery"], coordinations: ["dutch-auction"], handoffPoints: [] },
            },
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
        { schema: FULFILMENT_V2_SCHEMA_KEY, data: { modalities: ["pickup"], coordinations: [], handoffPoints: ["face-to-face"] } },
        { schema: GEO_SCHEMA_KEY, data: { originGeohash: "u4pruydqqvj", destinationGeohash: "u4pruydqqvk", massGrams: 500, volumeMl: 1000, classOfService: "S" } },
    ]);

    function makeAttestation(overrides: Partial<AttestationRecord> = {}): AttestationRecord {
        return {
            orderHash: order.id,
            processId: order.processId,
            attester: SELLER,
            // Default to a courier-process attestation at the "completed"
            // stage (event uint8 6), matching BoL stage 4 (Delivered).
            schemaId: "figaro-courier-process-v1",
            stage: 6,
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

    it("marks all stages as not-attested when no process attestations are passed", () => {
        const bol = extractBillOfLading(order, agreement, []);
        for (const stage of bol.stages) {
            expect(stage.attested).toBe(false);
            expect(stage.attester).toBeUndefined();
        }
    });

    it("attaches attester + contentRef + tx hash for stages that have on-chain receipts", () => {
        // BoL stage 3 (PickedUp) ← courier-process event uint8 3 (arrived-pickup).
        const att = makeAttestation({
            schemaId: "figaro-courier-process-v1",
            stage: 3,
            contentRef: "0xPICKED",
            transactionHash: "0xTX_PICKED",
        });
        const bol = extractBillOfLading(order, agreement, [att]);
        const picked = bol.stages.find((s) => s.stageId === 3)!;
        expect(picked.attested).toBe(true);
        expect(picked.attester).toBe(SELLER);
        expect(picked.contentRef).toBe("0xPICKED");
        expect(picked.transactionHash).toBe("0xTX_PICKED");
    });

    it("derives BoL stage 0 from merchant.prep-started (event uint8 2)", () => {
        const att = makeAttestation({
            schemaId: "figaro-merchant-process-v1",
            stage: 2,
            contentRef: "0xPREP",
        });
        const bol = extractBillOfLading(order, agreement, [att]);
        const prep = bol.stages.find((s) => s.stageId === 0)!;
        expect(prep.attested).toBe(true);
        expect(prep.contentRef).toBe("0xPREP");
    });

    it("derives BoL stage 4 from courier.completed (event uint8 6)", () => {
        const att = makeAttestation({
            schemaId: "figaro-courier-process-v1",
            stage: 6,
            contentRef: "0xDELIVERED",
        });
        const bol = extractBillOfLading(order, agreement, [att]);
        const delivered = bol.stages.find((s) => s.stageId === 4)!;
        expect(delivered.attested).toBe(true);
        expect(delivered.contentRef).toBe("0xDELIVERED");
    });

    it("ignores attestations for other orders (prevents cross-order leakage)", () => {
        const att = makeAttestation({ orderHash: "0xOTHER_ORDER" });
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
        { schema: FULFILMENT_V2_SCHEMA_KEY, data: { modalities: ["pickup"], coordinations: [], handoffPoints: ["face-to-face"] } },
    ]);
    const attestations: AttestationRecord[] = [
        {
            orderHash: order.id,
            processId: order.processId,
            attester: SELLER,
            schemaId: "figaro-merchant-process-v1",
            stage: 2,
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

// ── Emissions extractor ───────────────────────────────────────────────────────

describe("extractEmissions", () => {
    const order = makeOrder();

    it("reports disclosed=false when no GHG clause is signed", () => {
        const doc = extractEmissions(order, makeAgreement(), []);
        expect(doc.disclosed).toBe(false);
        expect(doc.standardSchemaKey).toBeUndefined();
        expect(doc.scope).toBeUndefined();
    });

    it("surfaces the chosen sister-schema standard + scope when committed", () => {
        const ag = makeAgreement([
            { schema: "figaro-ghg-iso-14064-v1", data: { scope: 2 } },
        ]);
        const doc = extractEmissions(order, ag, []);
        expect(doc.disclosed).toBe(true);
        expect(doc.standardSchemaKey).toBe("figaro-ghg-iso-14064-v1");
        expect(doc.standardLabel).toBe("ISO-14064");
        expect(doc.scope).toBe(2);
    });

    it("collects measurement attestation receipts in input order", () => {
        const att1: AttestationRecord = {
            orderHash: order.id, processId: order.processId, attester: SELLER,
            schemaId: GHG_MEASUREMENT_SCHEMA_KEY, stage: 3, contentRef: "0xMEAS1",
            transactionHash: "0xTX1", blockNumber: 100,
        };
        const att2: AttestationRecord = { ...att1, stage: 4, contentRef: "0xMEAS2", transactionHash: "0xTX2", blockNumber: 110 };
        const doc = extractEmissions(order, makeAgreement(), [att1, att2]);
        expect(doc.measurements).toHaveLength(2);
        expect(doc.measurements[0].contentRef).toBe("0xMEAS1");
        expect(doc.measurements[1].contentRef).toBe("0xMEAS2");
    });

    it("ignores non-measurement attestations + cross-order leakage", () => {
        const merchantAtt: AttestationRecord = {
            orderHash: order.id, processId: order.processId, attester: SELLER,
            schemaId: "figaro-merchant-process-v1", stage: 2, contentRef: "0xMP",
            transactionHash: "0xTXMP", blockNumber: 1,
        };
        const otherOrderAtt: AttestationRecord = {
            orderHash: "0xOTHER", processId: order.processId, attester: SELLER,
            schemaId: GHG_MEASUREMENT_SCHEMA_KEY, stage: 3, contentRef: "0xMEAS",
            transactionHash: "0xTX", blockNumber: 1,
        };
        const doc = extractEmissions(order, makeAgreement(), [merchantAtt, otherOrderAtt]);
        expect(doc.measurements).toHaveLength(0);
    });
});

// ── Proximity extractor ───────────────────────────────────────────────────────

describe("extractProximity", () => {
    const order = makeOrder();

    it("reports policyCommitted=false + no band when no policy clause is signed", () => {
        const doc = extractProximity(order, makeAgreement(), []);
        expect(doc.policyCommitted).toBe(false);
        expect(doc.committedBand).toBeUndefined();
    });

    it("surfaces the committed band from a policy clause", () => {
        const ag = makeAgreement([
            { schema: PROXIMITY_POLICY_SCHEMA_KEY, data: { band: 2 } },
        ]);
        const doc = extractProximity(order, ag, []);
        expect(doc.policyCommitted).toBe(true);
        expect(doc.committedBand).toBe(2);
    });

    it("collects proof-attestation receipts and ignores non-proof attestations", () => {
        const proofAtt: AttestationRecord = {
            orderHash: order.id, processId: order.processId, attester: SELLER,
            schemaId: PROXIMITY_PROOF_SCHEMA_KEY, stage: 3, contentRef: "0xPROOF",
            transactionHash: "0xTX", blockNumber: 50,
        };
        const courierAtt: AttestationRecord = { ...proofAtt, schemaId: "figaro-courier-process-v1", contentRef: "0xCP" };
        const doc = extractProximity(order, makeAgreement(), [proofAtt, courierAtt]);
        expect(doc.proofs).toHaveLength(1);
        expect(doc.proofs[0].contentRef).toBe("0xPROOF");
    });
});

// ── Sovereign process-logs extractor ──────────────────────────────────────────

describe("extractProcessLogs", () => {
    const order = makeOrder();

    function logAtt(schemaId: string, stage: number, contentRef: string): AttestationRecord {
        return {
            orderHash: order.id, processId: order.processId, attester: SELLER,
            schemaId, stage, contentRef, transactionHash: "0xTX", blockNumber: 50,
        };
    }

    it("partitions events by schemaId", () => {
        const merchantEv = logAtt("figaro-merchant-process-v1", 1, "0xM1");
        const courierEv1 = logAtt("figaro-courier-process-v1", 2, "0xC1");
        const courierEv2 = logAtt("figaro-courier-process-v1", 4, "0xC2");
        const doc = extractProcessLogs(order, [merchantEv, courierEv1, courierEv2]);
        expect(doc.merchantEvents).toHaveLength(1);
        expect(doc.courierEvents).toHaveLength(2);
        expect(doc.merchantEvents[0].schemaKey).toBe("figaro-merchant-process-v1");
        expect(doc.courierEvents[0].schemaKey).toBe("figaro-courier-process-v1");
    });

    it("ignores attestations from other schemas + other orders", () => {
        const ghgAtt = logAtt(GHG_MEASUREMENT_SCHEMA_KEY, 3, "0xGHG");
        const otherOrderMerchant: AttestationRecord = {
            orderHash: "0xOTHER", processId: order.processId, attester: SELLER,
            schemaId: "figaro-merchant-process-v1", stage: 0, contentRef: "0xM",
            transactionHash: "0xTX", blockNumber: 1,
        };
        const doc = extractProcessLogs(order, [ghgAtt, otherOrderMerchant]);
        expect(doc.merchantEvents).toHaveLength(0);
        expect(doc.courierEvents).toHaveLength(0);
    });

    it("returns empty arrays when no process-log attestations exist", () => {
        const doc = extractProcessLogs(order, []);
        expect(doc.merchantEvents).toEqual([]);
        expect(doc.courierEvents).toEqual([]);
    });
});

// ── Dutch auction extractor ──────────────────────────────────────────────────

describe("extractDutchAuction", () => {
    const order = makeOrder({ payment: 75n });

    function created(auctionId: string, processId: string, blockNumber: number): DutchAuctionCreatedEvent {
        return {
            auctionId, creator: BUYER, maxPrice: 100n,
            processId, currency: TOKEN, blockNumber,
            transactionHash: `0xCREATE-${auctionId}`,
        };
    }
    function claimed(auctionId: string, provider: string, clearingPrice: bigint, blockNumber: number): DutchAuctionClaimedEvent {
        return {
            auctionId, provider, clearingPrice, blockNumber,
            transactionHash: `0xCLAIM-${auctionId}`,
        };
    }

    it("reports auctionApplicable=false when fulfilment isn't Dutch auction", () => {
        const doc = extractDutchAuction(order, "deliver:seller-assigned", [], []);
        expect(doc.auctionApplicable).toBe(false);
    });

    it("locates the matching auction via (provider===seller, clearingPrice===payment) and reports the price-discovery trail", () => {
        const c = created("0xAUC1", order.processId, 100);
        const cl = claimed("0xAUC1", order.seller, 75n, 110);
        const doc = extractDutchAuction(order, "deliver:dutch-auction", [c], [cl]);
        expect(doc.auctionApplicable).toBe(true);
        expect(doc.auctionId).toBe("0xAUC1");
        expect(doc.maxPrice).toBe(100n);
        expect(doc.clearingPrice).toBe(75n);
        expect(doc.startBlock).toBe(100);
        expect(doc.claimedAtBlock).toBe(110);
        expect(doc.blocksToClaim).toBe(10);
    });

    it("reports auctionApplicable=true but no auctionId when fulfilment indicates auction but the matching claim isn't located", () => {
        const cl = claimed("0xAUC1", "0xOTHER_PROVIDER", 75n, 110);
        const doc = extractDutchAuction(order, "deliver:dutch-auction", [], [cl]);
        expect(doc.auctionApplicable).toBe(true);
        expect(doc.auctionId).toBeUndefined();
    });

    it("requires both provider AND clearingPrice to match — same provider with a different price is not the match", () => {
        const cl = claimed("0xAUC1", order.seller, 80n, 110); // wrong price
        const doc = extractDutchAuction(order, "deliver:dutch-auction", [], [cl]);
        expect(doc.auctionId).toBeUndefined();
    });
});

// ── Seller registry extractor ──────────────────────────────────────────────

describe("extractSellerRegistry", () => {
    const order = makeOrder();

    it("reports registered=false with audit notice when the seller has no registration event", () => {
        const doc = extractSellerRegistry(order, []);
        expect(doc.registered).toBe(false);
        expect(doc.notice).toContain("NOT registered");
        expect(doc.metadataURI).toBeUndefined();
    });

    it("surfaces the seller's registration record when present", () => {
        const ev: SellerRegisteredEvent = {
            seller: order.seller,
            metadataURI: "ipfs://QmMerchantMeta",
            blockNumber: 50,
            transactionHash: "0xREG",
        };
        const doc = extractSellerRegistry(order, [ev]);
        expect(doc.registered).toBe(true);
        expect(doc.metadataURI).toBe("ipfs://QmMerchantMeta");
        expect(doc.registeredAtBlock).toBe(50);
        expect(doc.notice).toBe("");
    });

    it("filters out events for other sellers (cross-seller leakage)", () => {
        const ev: SellerRegisteredEvent = {
            seller: "0xOTHER_SELLER",
            metadataURI: "ipfs://other",
            blockNumber: 50, transactionHash: "0xREG",
        };
        const doc = extractSellerRegistry(order, [ev]);
        expect(doc.registered).toBe(false);
    });

    it("uses the latest registration when the seller re-registered after withdraw", () => {
        const old: SellerRegisteredEvent = {
            seller: order.seller, metadataURI: "ipfs://old",
            blockNumber: 50, transactionHash: "0xOLD",
        };
        const fresh: SellerRegisteredEvent = {
            seller: order.seller, metadataURI: "ipfs://fresh",
            blockNumber: 200, transactionHash: "0xFRESH",
        };
        const doc = extractSellerRegistry(order, [old, fresh]);
        expect(doc.metadataURI).toBe("ipfs://fresh");
        expect(doc.registeredAtBlock).toBe(200);
    });
});

// ── Cross-cutting: buyer + seller on every document ──────────────────────────

describe("AuditBundle — every document carries buyer + seller addresses", () => {
    const order = makeOrder();
    // Include figaro-courier-process-v1 so the BoL is emitted for this
    // cross-cutting test; without it the carriage-leg discriminator
    // suppresses the BoL document and the buyer+seller cross-check has
    // nothing to assert against on that field.
    const agreement = makeAgreement([
        { schema: COURIER_PROCESS_SCHEMA_KEY, data: {} },
    ]);
    const bundle = buildAuditBundle(order, agreement, []);

    it("every document has the buyer + seller fields populated from the order", () => {
        const docs = [
            bundle.contract,
            bundle.invoice,
            bundle.billOfLading!,
            bundle.emissions,
            bundle.proximity,
            bundle.processLogs,
            bundle.dutchAuction,
            bundle.sellerRegistry,
            bundle.hashAppendix,
        ];
        for (const doc of docs) {
            expect(doc.buyer).toBe(order.buyer);
            expect(doc.seller).toBe(order.seller);
        }
    });
});

// ── Carriage-leg discriminator ───────────────────────────────────────────────

describe("isCarriageOrder", () => {
    it("returns true when the agreement carries figaro-courier-process-v1", () => {
        const agreement = makeAgreement([
            { schema: COURIER_PROCESS_SCHEMA_KEY, data: {} },
        ]);
        expect(isCarriageOrder(agreement)).toBe(true);
    });

    it("returns false for buyer↔merchant orders (no courier-process clause)", () => {
        const agreement = makeAgreement([
            { schema: FULFILMENT_V2_SCHEMA_KEY, data: { modalities: ["pickup"], coordinations: [], handoffPoints: ["face-to-face"] } },
            { schema: GEO_SCHEMA_KEY, data: { originGeohash: "u4pru", destinationGeohash: "u4pry", massGrams: 500, volumeMl: 1000, classOfService: "S" } },
        ]);
        expect(isCarriageOrder(agreement)).toBe(false);
    });

    it("returns false for pickup / consume-onsite orders even with delivery-lifecycle attestations elsewhere", () => {
        // The discriminator reads the agreement's committed sections,
        // not runtime attestations. An order without courier-process is
        // not a carriage leg even if lifecycle stages were attested.
        const agreement = makeAgreement();
        expect(isCarriageOrder(agreement)).toBe(false);
    });
});

// ── Bundle assembler ──────────────────────────────────────────────────────────

describe("buildAuditBundle", () => {
    const order = makeOrder();
    const agreement = makeAgreement([
        { schema: FULFILMENT_V2_SCHEMA_KEY, data: { modalities: ["pickup"], coordinations: [], handoffPoints: ["face-to-face"] } },
        { schema: GEO_SCHEMA_KEY, data: { originGeohash: "u4pru", destinationGeohash: "u4pry", massGrams: 500, volumeMl: 1000, classOfService: "S" } },
        { schema: COURIER_PROCESS_SCHEMA_KEY, data: {} },
    ]);
    const bundle = buildAuditBundle(order, agreement, []);

    it("emits all 9 documents on a carriage-leg agreement", () => {
        expect(bundle.contract).toBeDefined();
        expect(bundle.invoice).toBeDefined();
        expect(bundle.billOfLading).toBeDefined();
        expect(bundle.emissions).toBeDefined();
        expect(bundle.proximity).toBeDefined();
        expect(bundle.processLogs).toBeDefined();
        expect(bundle.dutchAuction).toBeDefined();
        expect(bundle.sellerRegistry).toBeDefined();
        expect(bundle.hashAppendix).toBeDefined();
    });

    it("every document carries the same orderHash + processId + agreementHash anchors", () => {
        const docs = [
            bundle.contract, bundle.invoice, bundle.billOfLading!,
            bundle.emissions, bundle.proximity, bundle.processLogs,
            bundle.dutchAuction, bundle.sellerRegistry, bundle.hashAppendix,
        ];
        for (const doc of docs) {
            expect(doc.orderHash).toBe(order.id);
            expect(doc.processId).toBe(order.processId);
            expect(doc.agreementHash).toBe(order.agreementHash);
        }
    });

    it("omits billOfLading on a non-carriage order (e.g. buyer↔merchant goods sale)", () => {
        const merchantAgreement = makeAgreement([
            { schema: FULFILMENT_V2_SCHEMA_KEY, data: { modalities: ["pickup"], coordinations: [], handoffPoints: ["face-to-face"] } },
            { schema: GEO_SCHEMA_KEY, data: { originGeohash: "u4pru", destinationGeohash: "u4pry", massGrams: 500, volumeMl: 1000, classOfService: "S" } },
        ]);
        const merchantBundle = buildAuditBundle(order, merchantAgreement, []);
        expect(merchantBundle.billOfLading).toBeUndefined();
        // The other 8 documents still emit.
        expect(merchantBundle.contract).toBeDefined();
        expect(merchantBundle.invoice).toBeDefined();
        expect(merchantBundle.emissions).toBeDefined();
        expect(merchantBundle.proximity).toBeDefined();
        expect(merchantBundle.processLogs).toBeDefined();
        expect(merchantBundle.dutchAuction).toBeDefined();
        expect(merchantBundle.sellerRegistry).toBeDefined();
        expect(merchantBundle.hashAppendix).toBeDefined();
    });
});

// ── Step 2 — redacted commerce in audit bundle ───────────────────────────────

describe("buildAuditBundle with redacted commerce section", () => {
    const order = makeOrder();
    const cleartextAgreement = makeAgreement([
        { schema: FULFILMENT_V2_SCHEMA_KEY, data: { modalities: ["pickup"], coordinations: [], handoffPoints: ["face-to-face"] } },
        { schema: GEO_SCHEMA_KEY, data: { originGeohash: "u4pru", destinationGeohash: "u4pry", massGrams: 500, volumeMl: 1000, classOfService: "S" } },
    ]);

    it("invoice surfaces lineItemsSealed when commerce is redacted", async () => {
        const { redactSections } = await import("@/lib/core/agreementManifest");
        const redacted = redactSections(cleartextAgreement, ["figaro-commerce-v1"]);
        const bundle = buildAuditBundle(order, redacted, []);
        expect(bundle.invoice.lineItemsSealed).toBe(true);
        expect(bundle.invoice.lineItems).toEqual([]);
        // Currency and total fall back to on-chain commit data, not the
        // redacted commerce section.
        expect(bundle.invoice.currency).toBe(order.currency);
        expect(bundle.invoice.total).toBe(order.payment);
    });

    it("contract clauses include a sealed commerce clause with the leaf hash preserved", async () => {
        const { redactSections, computeSectionLeaf } = await import("@/lib/core/agreementManifest");
        const commerceLeafBefore = computeSectionLeaf(
            cleartextAgreement.sections.find((s) => s.schema === "figaro-commerce-v1")!,
        );
        const redacted = redactSections(cleartextAgreement, ["figaro-commerce-v1"]);
        const bundle = buildAuditBundle(order, redacted, []);
        const commerceClause = bundle.contract.clauses.find((c) => c.schemaKey === "figaro-commerce-v1")!;
        expect(commerceClause.sealed).toBe(true);
        expect(commerceClause.body).toEqual({});
        expect(commerceClause.leafHash).toBe(commerceLeafBefore);
    });

    it("hash-appendix labels the sealed leaf and uses the stored leaf value", async () => {
        const { redactSections, computeSectionLeaf } = await import("@/lib/core/agreementManifest");
        const commerceLeaf = computeSectionLeaf(
            cleartextAgreement.sections.find((s) => s.schema === "figaro-commerce-v1")!,
        );
        const redacted = redactSections(cleartextAgreement, ["figaro-commerce-v1"]);
        const bundle = buildAuditBundle(order, redacted, []);
        const sealedAnchor = bundle.hashAppendix.anchors.find(
            (a) => a.kind === "agreement-section-leaf" && a.label.includes("figaro-commerce-v1"),
        )!;
        expect(sealedAnchor.label).toContain("(sealed)");
        expect(sealedAnchor.hash).toBe(commerceLeaf);
    });

    it("non-redacted sections in the same bundle still surface cleartext data", async () => {
        const { redactSections } = await import("@/lib/core/agreementManifest");
        const redacted = redactSections(cleartextAgreement, ["figaro-commerce-v1"]);
        const bundle = buildAuditBundle(order, redacted, []);
        const fulfilmentClause = bundle.contract.clauses.find((c) => c.schemaKey === "figaro-fulfilment-v2")!;
        expect(fulfilmentClause.sealed).toBeUndefined();
        expect(fulfilmentClause.body).toEqual({ modalities: ["pickup"], coordinations: [], handoffPoints: ["face-to-face"] });
    });

    it("cleartext path is unchanged when no redaction is applied", () => {
        const bundle = buildAuditBundle(order, cleartextAgreement, []);
        expect(bundle.invoice.lineItemsSealed).toBeUndefined();
        const commerceClause = bundle.contract.clauses.find((c) => c.schemaKey === "figaro-commerce-v1")!;
        expect(commerceClause.sealed).toBeUndefined();
    });
});
