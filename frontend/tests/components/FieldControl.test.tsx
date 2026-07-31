/**
 * FieldControl format dispatch — the open format axis, UI half.
 *
 * A string field's declared `format` routes to a registered richer input
 * (`fieldFormatInputs`); an unregistered format falls back to the plain text
 * input. The geohash tenant's device affordance encodes the browser
 * geolocation reading into the field. No clause is named anywhere — the
 * dispatch key is the spec's own declaration.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldSpec } from "@figaro/sdk/clauses";
import { FieldControl } from "@/components/runtime/FieldControl";
import { resolveInputFormat } from "@/components/runtime/fieldFormatInputs";
import { encodeGeohash } from "@figaro/sdk/derive";
import { PUBLIC_GEOHASH_MAX_PRECISION, PRIVATE_GEOHASH_MAX_PRECISION } from "@/lib/shared/geohash";

const geohashField: FieldSpec = {
    name: "origin",
    type: "string",
    required: true,
    pattern: "^[0123456789bcdefghjkmnpqrstuvwxyz]+$",
    format: "geohash",
};

/** The geolocation shape: a value-driven format that follows a sibling. */
const geocodeStandardField: FieldSpec = {
    name: "geocodeStandard", type: "string", required: true, default: "geohash",
};
const originByStandard: FieldSpec = {
    name: "origin", type: "string", required: true, formatFromField: "geocodeStandard",
    pattern: "^[0123456789bcdefghjkmnpqrstuvwxyz]+$",
};

function stubGeolocation(lat: number, lon: number) {
    vi.stubGlobal("navigator", {
        ...navigator,
        geolocation: {
            getCurrentPosition: (ok: PositionCallback) =>
                ok({ coords: { latitude: lat, longitude: lon } } as GeolocationPosition),
        },
    });
}

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("FieldControl format dispatch", () => {
    it("routes format:'geohash' to the registered input (device affordance present)", () => {
        render(
            <FieldControl field={geohashField} value={undefined} onChange={() => {}} testId="f-geo" />,
        );
        expect(screen.getByTestId("f-geo")).toBeTruthy();
        expect(screen.getByTestId("f-geo-device")).toBeTruthy();
    });

    it("an unregistered (never-seen) format degrades to the plain text input", () => {
        const novel: FieldSpec = { name: "x", type: "string", required: true, format: "isbn" };
        render(<FieldControl field={novel} value={undefined} onChange={() => {}} testId="f-novel" />);
        const input = screen.getByTestId("f-novel");
        expect(input.tagName).toBe("INPUT");
        expect(screen.queryByTestId("f-novel-device")).toBeNull();
    });

    it("the device affordance encodes the browser geolocation into the field", async () => {
        const lat = 37.7749;
        const lon = -122.4194;
        vi.stubGlobal("navigator", {
            ...navigator,
            geolocation: {
                getCurrentPosition: (ok: PositionCallback) =>
                    ok({ coords: { latitude: lat, longitude: lon } } as GeolocationPosition),
            },
        });
        const onChange = vi.fn();
        render(
            <FieldControl field={geohashField} value={undefined} onChange={onChange} testId="f-geo" />,
        );
        await userEvent.click(screen.getByTestId("f-geo-device"));
        await waitFor(() => expect(onChange).toHaveBeenCalled());
        const committed = onChange.mock.calls.at(-1)![0] as string;
        // Device fill respects the public-surface cap — the field lands in
        // a pinned agreement, so it is neighborhood-grade.
        expect(committed).toBe(encodeGeohash(lat, lon, PUBLIC_GEOHASH_MAX_PRECISION));
        expect(committed).toMatch(/^[0123456789bcdefghjkmnpqrstuvwxyz]+$/);
    });

    it("typing stays first-class — manual input propagates unchanged", async () => {
        const onChange = vi.fn();
        render(
            <FieldControl field={geohashField} value="" onChange={onChange} testId="f-geo" />,
        );
        await userEvent.type(screen.getByTestId("f-geo"), "9");
        expect(onChange).toHaveBeenLastCalledWith("9");
    });
});

// Value-driven format (formatFromField): a field's input follows the committed
// value of a sibling (geolocation's origin/destination follow geocodeStandard),
// and the geohash grain cap is keyed on the field's disposition.
describe("FieldControl value-driven format + disposition grain cap", () => {
    it("resolveInputFormat follows the sibling VALUE, then the sibling DEFAULT, then static format", () => {
        const siblings = [geocodeStandardField, originByStandard];
        // live value wins
        expect(resolveInputFormat(originByStandard, siblings, { geocodeStandard: "geohash" })).toBe("geohash");
        // no live value ⇒ sibling default ("geohash")
        expect(resolveInputFormat(originByStandard, siblings, {})).toBe("geohash");
        // a non-geohash standard resolves to itself (→ no registered input → plain text)
        expect(resolveInputFormat(originByStandard, siblings, { geocodeStandard: "iso3166-1" })).toBe("iso3166-1");
    });

    it("routes origin to the geohash input when the committed standard is geohash", () => {
        render(
            <FieldControl field={originByStandard} value={undefined} onChange={() => {}}
                testId="f-o" resolvedFormat="geohash" />,
        );
        expect(screen.getByTestId("f-o-device")).toBeTruthy();
    });

    it("degrades origin to plain text for a standard with no registered input", () => {
        render(
            <FieldControl field={originByStandard} value={undefined} onChange={() => {}}
                testId="f-o" resolvedFormat="iso3166-1" />,
        );
        expect(screen.getByTestId("f-o").tagName).toBe("INPUT");
        expect(screen.queryByTestId("f-o-device")).toBeNull();
    });

    it("PUBLIC geo device-fill is coarse; PRIVATE geo device-fill is fine", async () => {
        const lat = 37.7749, lon = -122.4194;
        stubGeolocation(lat, lon);

        const pub = vi.fn();
        const { unmount } = render(
            <FieldControl field={{ ...originByStandard, disposition: "public" }} value={undefined}
                onChange={pub} testId="f-pub" resolvedFormat="geohash" />,
        );
        await userEvent.click(screen.getByTestId("f-pub-device"));
        await waitFor(() => expect(pub).toHaveBeenCalled());
        expect(pub.mock.calls.at(-1)![0]).toBe(encodeGeohash(lat, lon, PUBLIC_GEOHASH_MAX_PRECISION));
        unmount();

        const priv = vi.fn();
        render(
            <FieldControl field={{ ...originByStandard, disposition: "private" }} value={undefined}
                onChange={priv} testId="f-priv" resolvedFormat="geohash" />,
        );
        await userEvent.click(screen.getByTestId("f-priv-device"));
        await waitFor(() => expect(priv).toHaveBeenCalled());
        const fine = priv.mock.calls.at(-1)![0] as string;
        expect(fine).toBe(encodeGeohash(lat, lon, PRIVATE_GEOHASH_MAX_PRECISION));
        expect(fine.length).toBe(PRIVATE_GEOHASH_MAX_PRECISION);
    });
});

// Spec-declared constraints surface AT the input (display-only guidance —
// the Layer-A sign gate stays the enforcement), and the field's own
// description is visible at the design-time authoring moment. All read from
// the spec; no clause is named.
describe("FieldControl constraint guidance", () => {
    const lawField: FieldSpec = {
        name: "applicableLaw",
        type: "string",
        required: true,
        pattern: "^[A-Za-z][A-Za-z0-9-]{1,15}$",
        maxLength: 16,
        minLength: 2,
        description: "Conventionally an ISO 3166-1 alpha-2 country code.",
    };

    it("a pattern-violating value shows the constraint error as the party types", () => {
        // Within the length bounds but violating the pattern (spaces + '!').
        render(
            <FieldControl field={lawField} value="New York!!" onChange={() => {}} testId="f-law" />,
        );
        const alert = screen.getByTestId("f-law-constraint");
        expect(alert.textContent).toMatch(/required format/);
    });

    it("a conforming value shows no constraint error", () => {
        render(<FieldControl field={lawField} value="US-NY" onChange={() => {}} testId="f-law2" />);
        expect(screen.queryByTestId("f-law2-constraint")).toBeNull();
    });

    it("an empty value shows no constraint error (required-ness is the sign gate's concern)", () => {
        render(<FieldControl field={lawField} value={undefined} onChange={() => {}} testId="f-law3" />);
        expect(screen.queryByTestId("f-law3-constraint")).toBeNull();
    });

    it("length bounds are reported", () => {
        render(<FieldControl field={lawField} value="X" onChange={() => {}} testId="f-law4" />);
        expect(screen.getByTestId("f-law4-constraint").textContent).toMatch(/at least 2/);
    });

    it("the spec's description is visible at design time and absent at runtime", () => {
        render(<FieldControl field={lawField} value="US-NY" onChange={() => {}} testId="f-law5" />);
        expect(screen.getByText(/ISO 3166-1/)).toBeTruthy();
        cleanup();
        render(
            <FieldControl field={lawField} value="US-NY" onChange={() => {}} testId="f-law6" mode="runtime" />,
        );
        expect(screen.queryByText(/ISO 3166-1/)).toBeNull();
    });
});

// The array-of-object REPEATER — a required object-array is a design-time
// TERM (a consent clause's affixed documents; ruled 2026-07-10); an optional
// one still defers. Items render their child fields recursively; the
// companion channel routes a format input's derived sibling value (the
// content-anchor's pinned locator) to the sibling declaring that format.
// No clause is named — the specs here are synthetic.
describe("FieldControl array-of-object repeater", () => {
    const docsField: FieldSpec = {
        name: "documents",
        type: "array",
        required: true,
        minItems: 1,
        items: {
            type: "object",
            fields: [
                { name: "anchor", type: "string", required: true, format: "bytes32-hex" },
                { name: "title", type: "string", required: true, minLength: 1 },
                { name: "locator", type: "string", required: false, format: "uri" },
            ],
        },
    } as unknown as FieldSpec;

    it("a REQUIRED object-array renders the repeater at design time; add creates an item with child controls", async () => {
        const onChange = vi.fn();
        render(<FieldControl field={docsField} value={undefined} onChange={onChange} testId="f-docs" />);
        await userEvent.click(screen.getByTestId("f-docs-add"));
        expect(onChange).toHaveBeenLastCalledWith([{}]);
        cleanup();
        render(<FieldControl field={docsField} value={[{}]} onChange={onChange} testId="f-docs" />);
        expect(screen.getByTestId("f-docs-item-0")).toBeTruthy();
        // The anchor child routes to the content-anchor input (affix, no paste-hex)…
        expect(screen.getByTestId("f-docs-0-anchor-affix")).toBeTruthy();
        // …and children never defer inside an authored entry.
        expect(screen.getByTestId("f-docs-0-title")).toBeTruthy();
        expect(screen.getByTestId("f-docs-0-locator")).toBeTruthy();
    });

    it("remove drops exactly the removed item", async () => {
        const onChange = vi.fn();
        render(
            <FieldControl
                field={docsField}
                value={[{ title: "ToS" }, { title: "Privacy" }]}
                onChange={onChange}
                testId="f-docs"
            />,
        );
        await userEvent.click(screen.getByTestId("f-docs-item-0-remove"));
        expect(onChange).toHaveBeenLastCalledWith([{ title: "Privacy" }]);
    });

    it("an OPTIONAL object-array still defers at design time", () => {
        const optional = { ...docsField, name: "attachments", required: false } as unknown as FieldSpec;
        render(<FieldControl field={optional} value={undefined} onChange={() => {}} testId="f-att" />);
        expect(screen.getByTestId("f-att-deferred")).toBeTruthy();
        expect(screen.queryByTestId("f-att-add")).toBeNull();
    });
});

// An enum option is DISPLAYED through the spec's own `valueLabels` — the same
// humanizer the read surfaces use — while the raw token stays the committed
// value, the testid, and the tooltip. This is what makes a regime choice (the
// disclosure enum's `closed` / `each-own` / `open`) read as a labelled choice
// at the point it is MADE, not just where it is later reported. No clause is
// named: the labels come off whatever spec is passed in.
describe("FieldControl enum labelling", () => {
    const labelled: FieldSpec = {
        name: "disclosure",
        type: "enum",
        required: true,
        values: ["closed", "each-own", "open"],
        valueLabels: {
            closed: "Closed — parties only",
            "each-own": "Each party may disclose its own copy",
            open: "Open — either party may publish",
        },
    } as unknown as FieldSpec;

    it("renders each option's declared label, keeping the raw token as value + testid + tooltip", async () => {
        const onChange = vi.fn();
        render(<FieldControl field={labelled} value={undefined} onChange={onChange} testId="f-reg" />);
        expect(screen.getByText("Each party may disclose its own copy")).toBeTruthy();
        expect(screen.getByText("Open — either party may publish")).toBeTruthy();
        // The raw token is never the display text…
        expect(screen.queryByText("each-own")).toBeNull();
        // …but it IS the tooltip, the testid, and the value written back.
        expect(screen.getByText("Each party may disclose its own copy").getAttribute("title")).toBe("each-own");
        await userEvent.click(screen.getByTestId("f-reg-open"));
        expect(onChange).toHaveBeenLastCalledWith("open");
    });

    it("an UNLABELLED enum degrades to its raw tokens — labels are optional in the spec", () => {
        const bare = { ...labelled, valueLabels: undefined } as unknown as FieldSpec;
        render(<FieldControl field={bare} value="closed" onChange={() => {}} testId="f-bare" />);
        expect(screen.getByText("closed")).toBeTruthy();
        expect(screen.getByText("open")).toBeTruthy();
    });

    it("a PARTIALLY labelled enum labels what it can and leaves the rest raw", () => {
        const partial = {
            ...labelled,
            valueLabels: { open: "Open — either party may publish" },
        } as unknown as FieldSpec;
        render(<FieldControl field={partial} value={undefined} onChange={() => {}} testId="f-part" />);
        expect(screen.getByText("Open — either party may publish")).toBeTruthy();
        expect(screen.getByText("each-own")).toBeTruthy();
    });

    it("array-of-enum options label through the ITEMS spec", () => {
        const multi = {
            name: "bands",
            type: "array",
            required: true,
            items: {
                type: "enum",
                values: ["zone-wifi", "contact-nfc"],
                valueLabels: { "zone-wifi": "Zone (Wi-Fi)" },
            },
        } as unknown as FieldSpec;
        render(<FieldControl field={multi} value={[]} onChange={() => {}} testId="f-bands" />);
        expect(screen.getByText("Zone (Wi-Fi)")).toBeTruthy();
        expect(screen.getByText("contact-nfc")).toBeTruthy();
        expect(screen.getByTestId("f-bands-zone-wifi")).toBeTruthy();
    });
});
