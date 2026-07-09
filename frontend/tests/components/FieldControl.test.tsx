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
import type { FieldSpec } from "@figaro/core/clauses";
import { FieldControl } from "@/components/core/FieldControl";
import { encodeGeohash } from "@figaro/core/extensions";
import { PUBLIC_GEOHASH_MAX_PRECISION } from "@/lib/shared/geohash";

const geohashField: FieldSpec = {
    name: "originGeohash",
    type: "string",
    required: true,
    pattern: "^[0123456789bcdefghjkmnpqrstuvwxyz]+$",
    format: "geohash",
};

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
