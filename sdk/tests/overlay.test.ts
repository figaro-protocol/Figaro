import { describe, it, expect } from "vitest";
import { extractOverlays } from "../src/derive/overlay.js";
import type { RecoveredAttestation } from "../src/derive/overlay.js";
import { decodeGeohash } from "../src/derive/geo.js";
import { parseClauseSpec, encodeContentFromSpec } from "../src/clauses/index.js";
import type { ClauseSpec, StringFieldSpec } from "../src/clauses/index.js";
import { computeClauseKey } from "../src/discovery.js";
import type { SpecSource, ProjectionSpecView } from "../src/projection.js";
import type { UniverseAttestationEvent } from "../src/events.js";
import type { Hex, Address } from "../src/types.js";

const ATTESTER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const PID = "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;
const OHASH = "0x0000000000000000000000000000000000000000000000000000000000000002" as Hex;

// A clause family NO Figaro surface has ever named — the open-class probe:
// extraction must carry it exactly as it carries a canonical family.
const NEVER_SEEN_SPEC_JSON = {
    clauseId: "acme-orbital-telemetry",
    version: 1,
    title: "Orbital telemetry",
    description: "Third-party clause family invented for this test.",
    fields: [
        {
            name: "position",
            type: "string",
            format: "geohash",
            required: true,
            minLength: 1,
            maxLength: 12,
        },
        { name: "altitudeMeters", type: "integer", required: true, min: -500, max: 100000 },
    ],
    stages: {
        2: [{ name: "checkpoint", type: "string", required: true, minLength: 1, maxLength: 64 }],
    },
};

function parsedSpec(raw: unknown): ClauseSpec {
    const result = parseClauseSpec(raw);
    if (!result.ok) throw new Error("test spec failed to parse");
    return result.spec;
}

function specSourceOf(views: readonly ProjectionSpecView[]): SpecSource {
    return {
        get: (clauseId, version) =>
            views.find(
                (v) => v.clauseId === clauseId && (version === undefined || v.version === version),
            ),
        list: () => views,
    };
}

function mkEvent(
    clauseKey: Hex,
    overrides: Partial<UniverseAttestationEvent> = {},
): UniverseAttestationEvent {
    return {
        orderHash: OHASH,
        processId: PID,
        attester: ATTESTER,
        clauseId: clauseKey,
        stage: 0,
        contentRef: "0x00000000000000000000000000000000000000000000000000000000000000cf" as Hex,
        blockNumber: 10,
        transactionHash: null,
        universe: "direct",
        ...overrides,
    };
}

describe("extractOverlays", () => {
    const spec = parsedSpec(NEVER_SEEN_SPEC_JSON);
    const key = computeClauseKey(spec.clauseId, spec.version);
    const specs = specSourceOf([spec]);

    it("a never-seen clause family flows through unchanged and round-trips its content", () => {
        const content = encodeContentFromSpec(spec, {
            position: "9q8yyk",
            altitudeMeters: 120,
        });
        const records: RecoveredAttestation[] = [{ event: mkEvent(key), content }];

        const graphs = extractOverlays(records, specs);
        expect(graphs).toHaveLength(1);
        const graph = graphs[0];
        expect(graph.boundary).toBe("protocol-derived");
        expect(graph.clauseKey).toBe(key);
        expect(graph.spec?.clauseId).toBe("acme-orbital-telemetry");
        expect(graph.entries).toHaveLength(1);
        expect(graph.entries[0].decoded).toEqual({ position: "9q8yyk", altitudeMeters: 120 });
        expect(graph.entries[0].universe).toBe("direct");
    });

    it("geo is the worked instance: fields found by DECLARED format compose with geo helpers", () => {
        const content = encodeContentFromSpec(spec, {
            position: "9q8yyk",
            altitudeMeters: 120,
        });
        const [graph] = extractOverlays([{ event: mkEvent(key), content }], specs);

        // Route by declared format, never by clause or field name.
        const geoFields = graph.spec!.fields.filter(
            (f): f is StringFieldSpec => f.type === "string" && f.format === "geohash",
        );
        expect(geoFields.map((f) => f.name)).toEqual(["position"]);

        const value = graph.entries[0].decoded![geoFields[0].name] as string;
        const { lat, lng } = decodeGeohash(value);
        expect(lat).toBeCloseTo(37.77, 1);
        expect(lng).toBeCloseTo(-122.42, 1);
    });

    it("an unresolvable spec degrades to fingerprint-only entries — absence, never fabrication", () => {
        const unknownKey = computeClauseKey("some-family-nobody-loaded", 1);
        const ref = "0x00000000000000000000000000000000000000000000000000000000000000ab" as Hex;
        const records: RecoveredAttestation[] = [
            {
                event: mkEvent(unknownKey, { contentRef: ref }),
                content: "0x1234" as Hex,
            },
        ];

        const graphs = extractOverlays(records, specs);
        expect(graphs).toHaveLength(1);
        expect(graphs[0].spec).toBeNull();
        expect(graphs[0].entries[0].decoded).toBeNull();
        expect(graphs[0].entries[0].contentRef).toBe(ref);
    });

    it("unrecovered content stays fingerprint-only even when the spec resolves", () => {
        const [graph] = extractOverlays([{ event: mkEvent(key), content: null }], specs);
        expect(graph.spec).not.toBeNull();
        expect(graph.entries[0].decoded).toBeNull();
    });

    it("bytes that do not decode against the spec degrade to fingerprint-only, without throwing", () => {
        const [graph] = extractOverlays(
            [{ event: mkEvent(key), content: "0xdead" as Hex }],
            specs,
        );
        expect(graph.entries[0].decoded).toBeNull();
    });

    it("decodes against the spec's stage field set when the event's stage declares one", () => {
        const content = encodeContentFromSpec(spec, { checkpoint: "perigee-pass" }, { stage: 2 });
        const [graph] = extractOverlays(
            [{ event: mkEvent(key, { stage: 2 }), content }],
            specs,
        );
        expect(graph.entries[0].decoded).toEqual({ checkpoint: "perigee-pass" });
    });

    it("groups families into distinct overlay graphs with entries in block order", () => {
        const otherSpec = parsedSpec({
            ...NEVER_SEEN_SPEC_JSON,
            clauseId: "acme-hull-inspection",
        });
        const otherKey = computeClauseKey(otherSpec.clauseId, otherSpec.version);
        const both = specSourceOf([spec, otherSpec]);
        const content = encodeContentFromSpec(spec, { position: "u09tvw", altitudeMeters: 0 });

        const graphs = extractOverlays(
            [
                { event: mkEvent(key, { blockNumber: 30 }), content },
                { event: mkEvent(otherKey, { blockNumber: 5 }), content },
                { event: mkEvent(key, { blockNumber: 20, universe: "batch" }), content },
            ],
            both,
        );
        expect(graphs).toHaveLength(2);
        const first = graphs.find((g) => g.clauseKey === key)!;
        expect(first.entries.map((e) => e.blockNumber)).toEqual([20, 30]);
        expect(first.entries[0].universe).toBe("batch");
        expect(graphs.find((g) => g.clauseKey === otherKey)!.entries).toHaveLength(1);
    });
});
