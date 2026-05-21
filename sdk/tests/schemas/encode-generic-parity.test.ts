/**
 * Parity audit for the generic spec-driven encoder
 * (`encodeContentFromSpec`) against the per-schema encoders.
 *
 * Non-destructive: the generic encoder is additive and not yet wired in
 * — the per-schema encoders remain the canonical path. This test
 * confirms the generic encoder runs on every protocol schema and that,
 * under the canonical rule (0-based enum index, `tuple[]` object
 * arrays), its output matches the per-schema encoder for the
 * canonically-shaped schemas and diverges in exactly the set the
 * keystone design predicts — schemas with 1-based enum tables, and
 * `figaro-consent-v1`'s struct-of-arrays transpose. Mirrors the Rust
 * `prover/schema/tests/encode_generic_parity.rs`.
 *
 * See docs/v5/SCALING_STRATEGY.md "Keystone Design — Canonical ABI
 * Mapping".
 */

import { describe, expect, it } from "vitest";
import type { Hex } from "viem";

import { parseSchemaSpec, type SchemaSpec } from "../../src/schemas/spec.js";
import {
    encodeContentFromSpec,
    encodeGHGScopeContent,
    encodeGHGMeasurementContent,
    encodeGeoContent,
    encodeFulfilmentV2Content,
    encodeJurisdictionContent,
    encodeCommerceContent,
    encodeProximityPolicyContent,
    encodeProximityProofContent,
    encodeOffsetPolicyContent,
    encodeMerchantContent,
    encodeCourierContent,
    encodeConsentContent,
} from "../../src/schemas/encode.js";

import ghgProtocolSpecRaw from "../../src/schemas/examples/figaro-ghg-protocol-v1.json" with { type: "json" };
import ghgIsoSpecRaw from "../../src/schemas/examples/figaro-ghg-iso-14064-v1.json" with { type: "json" };
import ghgMeasurementSpecRaw from "../../src/schemas/examples/figaro-ghg-measurement-v1.json" with { type: "json" };
import geoSpecRaw from "../../src/schemas/examples/figaro-geo-v2.json" with { type: "json" };
import fulfilmentSpecRaw from "../../src/schemas/examples/figaro-fulfilment-v2.json" with { type: "json" };
import jurisdictionSpecRaw from "../../src/schemas/examples/figaro-jurisdiction-v1.json" with { type: "json" };
import commerceSpecRaw from "../../src/schemas/examples/figaro-commerce-v1.json" with { type: "json" };
import proximityPolicySpecRaw from "../../src/schemas/examples/figaro-proximity-policy-v1.json" with { type: "json" };
import proximityProofSpecRaw from "../../src/schemas/examples/figaro-proximity-proof-v1.json" with { type: "json" };
import offsetPolicySpecRaw from "../../src/schemas/examples/figaro-offset-policy-v1.json" with { type: "json" };
import merchantSpecRaw from "../../src/schemas/examples/figaro-merchant-process-v1.json" with { type: "json" };
import courierSpecRaw from "../../src/schemas/examples/figaro-courier-process-v1.json" with { type: "json" };
import consentSpecRaw from "../../src/schemas/examples/figaro-consent-v1.json" with { type: "json" };

function specOf(raw: unknown): SchemaSpec {
    const parsed = parseSchemaSpec(raw);
    if (!parsed.ok) {
        throw new Error(`spec failed to parse: ${JSON.stringify(parsed.errors)}`);
    }
    return parsed.spec;
}

type Content = Record<string, unknown>;

interface Fixture {
    name: string;
    spec: SchemaSpec;
    content: Content;
    /** The per-schema (current, canonical) encoder for this schema. */
    perSchema: (c: Content) => Hex;
    /** Whether the generic encoder reproduces the per-schema bytes today. */
    expectMatch: boolean;
}

const fixtures: Fixture[] = [
    // ── Match: scalar / bigint / 0-based-enum / already-tuple[] ──
    {
        name: "ghg-protocol scope:1",
        spec: specOf(ghgProtocolSpecRaw),
        content: { scope: 1 },
        perSchema: (c) => encodeGHGScopeContent(c as never),
        expectMatch: true,
    },
    {
        name: "ghg-protocol scope unset",
        spec: specOf(ghgProtocolSpecRaw),
        content: {},
        perSchema: (c) => encodeGHGScopeContent(c as never),
        expectMatch: true,
    },
    {
        name: "ghg-iso-14064 scope:2",
        spec: specOf(ghgIsoSpecRaw),
        content: { scope: 2 },
        perSchema: (c) => encodeGHGScopeContent(c as never),
        expectMatch: true,
    },
    {
        name: "ghg-measurement grams",
        spec: specOf(ghgMeasurementSpecRaw),
        content: { grams: 1000n },
        perSchema: (c) => encodeGHGMeasurementContent(c as never),
        expectMatch: true,
    },
    {
        name: "commerce one item",
        spec: specOf(commerceSpecRaw),
        content: {
            currency: "0x0000000000000000000000000000000000000001",
            payment: 100n,
            lineItems: [{ itemId: "id-1", name: "Item", quantity: 2n, unitPrice: 50n }],
        },
        perSchema: (c) => encodeCommerceContent(c as never),
        expectMatch: true,
    },
    {
        name: "merchant accepted",
        spec: specOf(merchantSpecRaw),
        content: { eventType: "accepted", evidenceUri: "ipfs://abc" },
        perSchema: (c) => encodeMerchantContent(c as never),
        expectMatch: true,
    },
    {
        name: "courier in-transit",
        spec: specOf(courierSpecRaw),
        content: { eventType: "in-transit" },
        perSchema: (c) => encodeCourierContent(c as never),
        expectMatch: true,
    },
    {
        // klerosCourt absent → index 0 either way.
        name: "jurisdiction law-only",
        spec: specOf(jurisdictionSpecRaw),
        content: { applicableLaw: "US-CA" },
        perSchema: (c) => encodeJurisdictionContent(c as never),
        expectMatch: true,
    },
    // ── Diverge: 1-based enum tables vs canonical 0-based ──
    {
        name: "geo basic",
        spec: specOf(geoSpecRaw),
        content: {
            originGeohash: "dr5ru",
            destinationGeohash: "dr5x1",
            massGrams: 1000,
            volumeMl: 500,
            classOfService: "S",
        },
        perSchema: (c) => encodeGeoContent(c as never),
        expectMatch: false,
    },
    {
        name: "fulfilment delivery",
        spec: specOf(fulfilmentSpecRaw),
        content: {
            modalities: ["delivery"],
            coordinations: ["buyer-assigned"],
            handoffPoints: ["face-to-face"],
        },
        perSchema: (c) => encodeFulfilmentV2Content(c as never),
        expectMatch: false,
    },
    {
        name: "jurisdiction kleros",
        spec: specOf(jurisdictionSpecRaw),
        content: { klerosCourt: "general", klerosMinJurors: 5 },
        perSchema: (c) => encodeJurisdictionContent(c as never),
        expectMatch: false,
    },
    {
        name: "proximity-policy two bands",
        spec: specOf(proximityPolicySpecRaw),
        content: { bands: ["zone-wifi", "contact-nfc"] },
        perSchema: (c) => encodeProximityPolicyContent(c as never),
        expectMatch: false,
    },
    {
        name: "proximity-proof basic",
        spec: specOf(proximityProofSpecRaw),
        content: {
            band: "nearby-ble",
            nonce: `0x${"ab".repeat(32)}`,
            deviceSig: "0xdeadbeef",
        },
        perSchema: (c) => encodeProximityProofContent(c as never),
        expectMatch: false,
    },
    {
        name: "offset-policy two providers",
        spec: specOf(offsetPolicySpecRaw),
        content: { providers: ["klima", "toucan"] },
        perSchema: (c) => encodeOffsetPolicyContent(c as never),
        expectMatch: false,
    },
    // ── Diverge: struct-of-arrays transpose vs canonical tuple[] ──
    {
        name: "consent one doc",
        spec: specOf(consentSpecRaw),
        content: {
            documents: [{
                documentHash: `0x${"11".repeat(32)}`,
                documentVersion: "1.0",
                documentTitle: "Terms",
            }],
        },
        perSchema: (c) => encodeConsentContent(c as never),
        expectMatch: false,
    },
];

describe("generic spec-driven encoder — parity with per-schema encoders", () => {
    it("runs on every protocol-schema fixture", () => {
        for (const fx of fixtures) {
            expect(
                () => encodeContentFromSpec(fx.spec, fx.content),
                fx.name,
            ).not.toThrow();
        }
    });

    it("matches per-schema for canonically-shaped schemas, diverges otherwise", () => {
        for (const fx of fixtures) {
            const generic = encodeContentFromSpec(fx.spec, fx.content);
            const perSchema = fx.perSchema(fx.content);
            if (fx.expectMatch) {
                expect(generic, `${fx.name}: generic must reproduce per-schema bytes`).toBe(
                    perSchema,
                );
            } else {
                expect(
                    generic,
                    `${fx.name}: divergence expected (1-based enum / transpose)`,
                ).not.toBe(perSchema);
            }
        }
    });

    it("offset-policy canonical encoding is uint8[] [0, 1]", () => {
        // klima → position 0, toucan → position 1 (the per-schema encoder
        // emits the 1-based [1, 2]). Hand-verified; equals the value the
        // Rust parity test locks, confirming Rust ↔ TS generic parity.
        const generic = encodeContentFromSpec(specOf(offsetPolicySpecRaw), {
            providers: ["klima", "toucan"],
        });
        expect(generic).toBe(
            "0x" +
                "0000000000000000000000000000000000000000000000000000000000000020" +
                "0000000000000000000000000000000000000000000000000000000000000002" +
                "0000000000000000000000000000000000000000000000000000000000000000" +
                "0000000000000000000000000000000000000000000000000000000000000001",
        );
    });
});
