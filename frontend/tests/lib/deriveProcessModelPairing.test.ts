/**
 * deriveProcessModelPairing.test.ts
 *
 * The generic cross-order coordination engine: a lifecycle stage listed in a
 * clause spec's `block.handoffStages` is a physical hand-off, so the seller's
 * capability PAIRS the proximity proof from the carrying order (own order,
 * else the topology-adjacent carrier — the cross-order witness), and the
 * seller's standalone proof button stays suppressed while a pairing stage is
 * pending. Everything derives from the clause specs — the engine names no
 * clause.
 *
 * Also the scale guard: the kernel's resolve ceiling (~1,240 orders / 30M
 * gas) must flow through `deriveProcessModelFromRuntime` without quadratic
 * blowup (the pre-indexed RuntimeIndexes bundle).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { keccak256, stringToHex, type Hex } from "viem";
import { type Agreement, computeAgreementHash } from "@/lib/core/agreement";
import { primeClauseSpecs } from "./primeClauseSpecs";
import { deriveProcessModelFromRuntime } from "@/lib/semantic/deriveProcessModelFromRuntime";
import { type Order, OrderState } from "@/lib/core/store";
import type { RuntimeAttestation } from "@/lib/core/indexer";
import type { SubmitClauseAttestationCapabilityAction, CapabilityModel } from "@/lib/semantic/models";
import { ANVIL_ACCOUNTS } from "../anvilAccounts";
import { clauseIdHash } from "@/lib/shared/evm";

// Tests may name clauses; production code may not.
const MERCHANT_PROCESS = "figaro-merchant-process"; // handoffStages: ["handed-off"]
const COURIER_PROCESS = "figaro-courier-process";   // handoffStages: ["arrived-pickup", "arrived-dropoff"]
const PROXIMITY_POLICY = "figaro-proximity-policy";
const PROXIMITY_PROOF = "figaro-proximity-proof";   // bilateral companion of the policy

beforeAll(async () => {
    await primeClauseSpecs();
});

const BUYER = ANVIL_ACCOUNTS[0];
const MERCHANT = ANVIL_ACCOUNTS[1];
const COURIER = ANVIL_ACCOUNTS[2];
const CURRENCY = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`;
const PROCESS_ID = ("0x" + "ab".repeat(32)) as Hex;
const MERCHANT_ORDER = ("0x" + "cd".repeat(32)) as Hex;
const COURIER_ORDER = ("0x" + "ef".repeat(32)) as Hex;

function clauseHash(clauseKey: string): string {
    return clauseIdHash(clauseKey, 1).toLowerCase();
}

function buildAgreement(buyer: string, seller: string, sections: Agreement["sections"]): Agreement {
    return { version: "a1", buyer: buyer as Hex, seller: seller as Hex, sections };
}

function buildOrder(opts: {
    id: Hex;
    seller: string;
    agreementHash: string;
    parentOrderHashes?: string[];
    payment?: bigint;
    cumulativeValue?: bigint;
}): Order {
    return {
        id: opts.id,
        processId: PROCESS_ID,
        buyer: BUYER,
        seller: opts.seller,
        currency: CURRENCY,
        agreementHash: opts.agreementHash as Hex,
        cumulativeValue: opts.cumulativeValue ?? 100n,
        payment: opts.payment ?? 100n,
        state: OrderState.Active,
        sellerBond: 200n,
        buyerBond: 200n,
        salt: 0n,
        deadline: 0n,
        ...(opts.parentOrderHashes !== undefined ? { parentOrderHashes: opts.parentOrderHashes } : {}),
    };
}

function att(orderHash: string, clauseKey: string, stage: number, attester: string): RuntimeAttestation {
    return { clauseId: clauseHash(clauseKey), orderHash, stage, attester, blockNumber: 1 };
}

function buildSummary(orders: Order[]) {
    return {
        processId: PROCESS_ID,
        orderCount: orders.length,
        hasActive: true,
        createdAt: 0,
        orders: orders.map((o) => ({ id: o.id, state: o.state })),
    };
}

/** The submit-clause-attestation capabilities on one order, for one wallet. */
function attestationCaps(
    orders: Order[],
    agreements: Map<string, Agreement>,
    attestations: RuntimeAttestation[],
    address: string,
    orderId: string,
): Array<CapabilityModel & { action: SubmitClauseAttestationCapabilityAction }> {
    const model = deriveProcessModelFromRuntime(buildSummary(orders), orders, agreements, address, undefined, false, attestations);
    const node = model.orders.find((o) => o.orderId === orderId);
    return (node?.capabilities ?? []).filter(
        (c): c is CapabilityModel & { action: SubmitClauseAttestationCapabilityAction } =>
            c.actionKind === "submit-clause-attestation",
    );
}

/** Merchant order carrying its own hand-off proof (nearby-ble band). */
function merchantFixture() {
    const agreement = buildAgreement(BUYER, MERCHANT, [
        { clause: MERCHANT_PROCESS, version: 1, data: {} },
        { clause: PROXIMITY_POLICY, version: 1, data: { bands: ["nearby-ble"] } },
        { clause: PROXIMITY_PROOF, version: 1, data: {} },
    ]);
    const agreementHash = computeAgreementHash(agreement);
    const order = buildOrder({ id: MERCHANT_ORDER, seller: MERCHANT, agreementHash, parentOrderHashes: [] });
    return { order, agreements: new Map([[agreementHash, agreement]]) };
}

describe("hand-off pairing — own-order carrier", () => {
    it("emits no pairing before the hand-off stage, and suppresses the seller's standalone proof while one is pending", () => {
        const { order, agreements } = merchantFixture();
        const caps = attestationCaps([order], agreements, [], MERCHANT, MERCHANT_ORDER);

        const ladderCap = caps.find((c) => c.action.clauseId === MERCHANT_PROCESS);
        expect(ladderCap?.action.eventCode).toBe("prep-started");
        expect(ladderCap?.action.pairedProof).toBeUndefined();

        // Seller's standalone proof: suppressed (handed-off will pair it).
        expect(caps.find((c) => c.action.clauseId === PROXIMITY_PROOF)).toBeUndefined();

        // The buyer's bilateral witness is independent of pairing.
        const buyerCaps = attestationCaps([order], agreements, [], BUYER, MERCHANT_ORDER);
        const buyerProof = buyerCaps.find((c) => c.action.clauseId === PROXIMITY_PROOF);
        expect(buyerProof?.action.party).toBe("buyer");
        expect(buyerProof?.action.isProof).toBe(true);
    });

    it("pairs the own-order proof at the hand-off stage, at the committed band", () => {
        const { order, agreements } = merchantFixture();
        const attestations = [
            att(MERCHANT_ORDER, MERCHANT_PROCESS, 0, MERCHANT),
            att(MERCHANT_ORDER, MERCHANT_PROCESS, 1, MERCHANT),
        ];
        const caps = attestationCaps([order], agreements, attestations, MERCHANT, MERCHANT_ORDER);

        const handedOff = caps.find((c) => c.action.clauseId === MERCHANT_PROCESS);
        expect(handedOff?.action.eventCode).toBe("handed-off");
        expect(handedOff?.action.pairedProof).toEqual({
            clauseId: PROXIMITY_PROOF,
            orderHash: MERCHANT_ORDER,
            stage: 1,                 // nearby-ble ordinal in the proof's band enum
            eventCode: "nearby-ble",  // committed in the sister policy section
            ladderField: "band",
        });
    });

    it("skips pairing once this seller witnessed the proof, and never double-emits the witness", () => {
        const { order, agreements } = merchantFixture();
        const attestations = [
            att(MERCHANT_ORDER, MERCHANT_PROCESS, 0, MERCHANT),
            att(MERCHANT_ORDER, MERCHANT_PROCESS, 1, MERCHANT),
            att(MERCHANT_ORDER, PROXIMITY_PROOF, 1, MERCHANT),
        ];
        const caps = attestationCaps([order], agreements, attestations, MERCHANT, MERCHANT_ORDER);

        const handedOff = caps.find((c) => c.action.clauseId === MERCHANT_PROCESS);
        expect(handedOff?.action.eventCode).toBe("handed-off");
        expect(handedOff?.action.pairedProof).toBeUndefined();
        expect(caps.find((c) => c.action.clauseId === PROXIMITY_PROOF)).toBeUndefined();
    });

    it("surfaces the standalone seller proof when the ladder completed without a witness (catch-up path)", () => {
        const { order, agreements } = merchantFixture();
        const attestations = [0, 1, 2].map((stage) => att(MERCHANT_ORDER, MERCHANT_PROCESS, stage, MERCHANT));
        const caps = attestationCaps([order], agreements, attestations, MERCHANT, MERCHANT_ORDER);

        const proof = caps.find((c) => c.action.clauseId === PROXIMITY_PROOF);
        expect(proof?.action.isProof).toBe(true);
        expect(proof?.action.eventCode).toBe("nearby-ble");
    });
});

describe("hand-off pairing — cross-order carrier", () => {
    it("pairs the topology-adjacent order's proof when the ladder order carries none (cross-order witness)", () => {
        // Merchant order: ladder only, no proof. Courier child: carries the proof.
        const merchantAgreement = buildAgreement(BUYER, MERCHANT, [
            { clause: MERCHANT_PROCESS, version: 1, data: {} },
        ]);
        const merchantHash = computeAgreementHash(merchantAgreement);
        const courierAgreement = buildAgreement(BUYER, COURIER, [
            { clause: COURIER_PROCESS, version: 1, data: {} },
            { clause: PROXIMITY_POLICY, version: 1, data: { bands: ["zone-wifi"] } },
            { clause: PROXIMITY_PROOF, version: 1, data: {} },
        ]);
        const courierHash = computeAgreementHash(courierAgreement);
        const orders = [
            buildOrder({ id: MERCHANT_ORDER, seller: MERCHANT, agreementHash: merchantHash, parentOrderHashes: [] }),
            buildOrder({
                id: COURIER_ORDER, seller: COURIER, agreementHash: courierHash,
                parentOrderHashes: [MERCHANT_ORDER], payment: 50n, cumulativeValue: 150n,
            }),
        ];
        const agreements = new Map([[merchantHash, merchantAgreement], [courierHash, courierAgreement]]);
        const attestations = [
            att(MERCHANT_ORDER, MERCHANT_PROCESS, 0, MERCHANT),
            att(MERCHANT_ORDER, MERCHANT_PROCESS, 1, MERCHANT),
        ];

        const caps = attestationCaps(orders, agreements, attestations, MERCHANT, MERCHANT_ORDER);
        const handedOff = caps.find((c) => c.action.clauseId === MERCHANT_PROCESS);
        expect(handedOff?.action.eventCode).toBe("handed-off");
        expect(handedOff?.action.pairedProof).toEqual({
            clauseId: PROXIMITY_PROOF,
            orderHash: COURIER_ORDER, // the child carries the proof — cross-order
            stage: 0,
            eventCode: "zone-wifi",
            ladderField: "band",
        });
    });

    it("pairs once per party across multiple hand-off stages (courier: arrived-pickup pairs, arrived-dropoff does not)", () => {
        const courierAgreement = buildAgreement(BUYER, COURIER, [
            { clause: COURIER_PROCESS, version: 1, data: {} },
            { clause: PROXIMITY_POLICY, version: 1, data: { bands: ["zone-wifi"] } },
            { clause: PROXIMITY_PROOF, version: 1, data: {} },
        ]);
        const courierHash = computeAgreementHash(courierAgreement);
        const order = buildOrder({ id: COURIER_ORDER, seller: COURIER, agreementHash: courierHash, parentOrderHashes: [] });
        const agreements = new Map([[courierHash, courierAgreement]]);

        // After en-route-pickup: next stage arrived-pickup is a hand-off → pairs.
        let caps = attestationCaps([order], agreements, [att(COURIER_ORDER, COURIER_PROCESS, 0, COURIER)], COURIER, COURIER_ORDER);
        let ladderCap = caps.find((c) => c.action.clauseId === COURIER_PROCESS);
        expect(ladderCap?.action.eventCode).toBe("arrived-pickup");
        expect(ladderCap?.action.pairedProof?.orderHash).toBe(COURIER_ORDER);

        // Proof witnessed via that pairing: arrived-dropoff (also a hand-off
        // stage) no longer pairs — once-per-party witness semantics.
        const attestations = [
            att(COURIER_ORDER, COURIER_PROCESS, 0, COURIER),
            att(COURIER_ORDER, COURIER_PROCESS, 1, COURIER),
            att(COURIER_ORDER, COURIER_PROCESS, 2, COURIER),
            att(COURIER_ORDER, PROXIMITY_PROOF, 0, COURIER),
        ];
        caps = attestationCaps([order], agreements, attestations, COURIER, COURIER_ORDER);
        ladderCap = caps.find((c) => c.action.clauseId === COURIER_PROCESS);
        expect(ladderCap?.action.eventCode).toBe("arrived-dropoff");
        expect(ladderCap?.action.pairedProof).toBeUndefined();
    });
});

describe("scale — the resolve ceiling flows through the deriver", () => {
    it("derives a 1,240-order process with attestations in linear-ish time", () => {
        const N = 1240;
        const agreement = buildAgreement(BUYER, MERCHANT, [
            { clause: MERCHANT_PROCESS, version: 1, data: {} },
            { clause: PROXIMITY_POLICY, version: 1, data: { bands: ["zone-wifi"] } },
            { clause: PROXIMITY_PROOF, version: 1, data: {} },
        ]);
        const agreementHash = computeAgreementHash(agreement);
        const agreements = new Map([[agreementHash, agreement]]);

        const orders: Order[] = [];
        const attestations: RuntimeAttestation[] = [];
        for (let i = 0; i < N; i++) {
            const id = ("0x" + i.toString(16).padStart(64, "0")) as Hex;
            orders.push(buildOrder({
                id, seller: MERCHANT, agreementHash,
                parentOrderHashes: i === 0 ? [] : [orders[i - 1].id],
                cumulativeValue: 100n + BigInt(i),
            }));
            // Mid-walk state: two ladder stages down, proof pending.
            attestations.push(att(id, MERCHANT_PROCESS, 0, MERCHANT));
            attestations.push(att(id, MERCHANT_PROCESS, 1, MERCHANT));
        }

        const start = performance.now();
        const model = deriveProcessModelFromRuntime(buildSummary(orders), orders, agreements, MERCHANT, undefined, false, attestations);
        const elapsed = performance.now() - start;

        expect(model.orders).toHaveLength(N);
        // Every order's next stage is the hand-off, paired with its own proof.
        const last = model.orders[N - 1].capabilities.find((c) => c.actionKind === "submit-clause-attestation");
        expect((last?.action as SubmitClauseAttestationCapabilityAction).pairedProof?.eventCode).toBe("zone-wifi");
        // O(N²) over 1,240 orders × ~2,480 attestations lands in the tens of
        // seconds; the pre-indexed engine stays well under this generous bound.
        expect(elapsed).toBeLessThan(5_000);
    });
});
