/**
 * DatetimeFieldInput — the iso-datetime format tenant. Renders a native
 * datetime picker and stores ISO 8601 UTC (seconds + Z, the SDK validator's
 * shape). The ISO ⇄ control conversion is pure string slicing, so it must not
 * re-zone the value.
 */
import { useState } from "react";
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DatetimeFieldInput } from "@/components/runtime/DatetimeFieldInput";
import { getFieldFormatInput } from "@/components/runtime/fieldFormatInputs";

afterEach(cleanup);

function Harness({ initial }: { initial?: string }) {
    const [v, setV] = useState<string | undefined>(initial);
    return (
        <>
            <DatetimeFieldInput value={v ?? ""} onChange={setV} testId="dt" />
            <output data-testid="stored">{v ?? ""}</output>
        </>
    );
}

describe("DatetimeFieldInput", () => {
    it("is the registered input for the iso-datetime format", () => {
        expect(getFieldFormatInput("iso-datetime")).toBe(DatetimeFieldInput);
    });

    it("shows an ISO UTC value in the picker as minute-precision local text", () => {
        render(<Harness initial="2026-07-22T09:00:00Z" />);
        expect((screen.getByTestId("dt") as HTMLInputElement).value).toBe("2026-07-22T09:00");
    });

    it("stores the picked value as ISO 8601 UTC (seconds + Z)", () => {
        render(<Harness />);
        fireEvent.change(screen.getByTestId("dt"), { target: { value: "2026-07-22T12:30" } });
        expect(screen.getByTestId("stored").textContent).toBe("2026-07-22T12:30:00Z");
    });

    it("clears to undefined when emptied (never a junk value)", () => {
        render(<Harness initial="2026-07-22T09:00:00Z" />);
        fireEvent.change(screen.getByTestId("dt"), { target: { value: "" } });
        expect(screen.getByTestId("stored").textContent).toBe("");
    });
});
