/**
 * DispatchRacePanel — the reset controls wait while a checkout attempt is in
 * flight. The attempt was built from the race's outcome; "Race again" or
 * "Try again" clicked meanwhile would clear the outcome the attempt signs.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DispatchRacePanel } from "@/components/runtime/DispatchRacePanel";

const RESULT = {
    nodeId: "agreement-1",
    blinding: {},
    selection: { seller: "0x00000000000000000000000000000000000000cc", price: "2", item: { id: "ride", name: "Ride" } },
    salt: () => 1n,
    deadline: 1n,
    race: {},
};

/** The race as the panel reads it, at one step. */
const raceAt = (step: "done" | "error") => ({
    step,
    error: step === "error" ? "The race failed." : null,
    candidates: [],
    repliedCount: 0,
    result: step === "done" ? RESULT : null,
    quoting: false,
    start: vi.fn(),
    reset: vi.fn(),
    pick: vi.fn(),
    selectNow: vi.fn(),
}) as unknown as Parameters<typeof DispatchRacePanel>[0]["race"];

describe("DispatchRacePanel — reset while an attempt is in flight", () => {
    for (const step of ["done", "error"] as const) {
        it(`the ${step} step's reset is disabled during an attempt and enabled after`, () => {
            const view = render(<DispatchRacePanel race={raceAt(step)} onStart={vi.fn()} tokenSymbol="DNM" decimals={18} attemptInFlight />);
            expect((screen.getByTestId("race-reset") as HTMLButtonElement).disabled).toBe(true);
            view.rerender(<DispatchRacePanel race={raceAt(step)} onStart={vi.fn()} tokenSymbol="DNM" decimals={18} attemptInFlight={false} />);
            expect((screen.getByTestId("race-reset") as HTMLButtonElement).disabled).toBe(false);
            view.unmount();
        });
    }
});
