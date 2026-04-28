import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HandoffDetailsModule } from "@/components/modules/HandoffDetailsModule";
import { encodeHandoffContent, type HandoffMode } from "@figaro/core/schemas";

/**
 * End-to-end Layer A → SDK encoder integration test for the
 * `figaro-handoff-v1` schema, wired through HandoffDetailsModule.
 *
 * Asserts:
 *   1. Each declared mode option is reachable.
 *   2. Schema validation runs on every selection and accepts all 5 modes.
 *   3. Submit emits a CustomEvent whose `handoffContent` field is the
 *      ABI-encoded bytes the on-chain validator expects (matches encoder).
 *   4. Submit is disabled until the address + budget + verified-checkbox
 *      gates pass; the schema-mode default is always valid.
 */

function createProps(overrides?: Record<string, unknown>) {
    return {
        moduleId: "handoff-details",
        binding: {} as never,
        context: {
            selectedRoleKind: "buyer",
            mechanisms: [],
            services: {},
            ...(overrides ?? {}),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
}

describe("HandoffDetailsModule — figaro-handoff-v1 wiring", () => {
    let dispatchedEvents: CustomEvent[];
    let dispatchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        dispatchedEvents = [];
        dispatchSpy = vi.spyOn(window, "dispatchEvent").mockImplementation((event) => {
            if (event instanceof CustomEvent) dispatchedEvents.push(event);
            return true;
        });
    });

    afterEach(() => {
        dispatchSpy.mockRestore();
    });

    it("renders all 5 handoff-mode options", () => {
        render(<HandoffDetailsModule {...createProps()} />);
        for (const mode of ["face-to-face", "dead-drop", "parking-area", "locker", "courier-relay"] as HandoffMode[]) {
            expect(screen.getByTestId(`handoff-mode-btn-${mode}`)).toBeInTheDocument();
        }
    });

    it("default selection (face-to-face) passes schema validation — no error shown", () => {
        render(<HandoffDetailsModule {...createProps()} />);
        expect(screen.queryByTestId("handoff-mode-validation-error")).not.toBeInTheDocument();
    });

    it("selecting any other mode keeps schema validation passing", () => {
        render(<HandoffDetailsModule {...createProps()} />);
        for (const mode of ["dead-drop", "locker", "courier-relay"] as HandoffMode[]) {
            fireEvent.click(screen.getByTestId(`handoff-mode-btn-${mode}`));
            expect(screen.queryByTestId("handoff-mode-validation-error")).not.toBeInTheDocument();
        }
    });

    it("submit emits CustomEvent with ABI-encoded handoffContent matching encodeHandoffContent", () => {
        render(<HandoffDetailsModule {...createProps()} />);

        // Fill required fields to enable submit
        fireEvent.change(screen.getByTestId("input-destination-address"), {
            target: { value: "123 Main St, Apt 4B" },
        });
        fireEvent.click(screen.getByTestId("handoff-mode-btn-locker"));
        fireEvent.click(screen.getByTestId("handoff-verified-checkbox"));

        fireEvent.click(screen.getByTestId("btn-confirm-handoff"));

        expect(dispatchedEvents).toHaveLength(1);
        const event = dispatchedEvents[0];
        expect(event.type).toBe("figaro:handoff-manifest");

        const detail = event.detail as { handoffMode: HandoffMode; handoffContent: string };
        expect(detail.handoffMode).toBe("locker");
        // Encoded bytes must match what the SDK encoder (and on-chain validator) expects.
        expect(detail.handoffContent).toBe(encodeHandoffContent("locker"));
    });

    it("submit stays disabled until address + budget + verified gates pass", () => {
        render(<HandoffDetailsModule {...createProps()} />);
        const submit = screen.getByTestId("btn-confirm-handoff") as HTMLButtonElement;

        // Initially disabled — no address, no verified checkbox
        expect(submit.disabled).toBe(true);

        fireEvent.change(screen.getByTestId("input-destination-address"), {
            target: { value: "123 Main St" },
        });
        expect(submit.disabled).toBe(true); // still missing verified

        fireEvent.click(screen.getByTestId("handoff-verified-checkbox"));
        // Now address + budget (default 0.002) + verified all pass + handoff-mode default valid
        expect(submit.disabled).toBe(false);
    });

    it("renders nothing for non-buyer role", () => {
        const { container } = render(<HandoffDetailsModule {...createProps({ selectedRoleKind: "seller" })} />);
        expect(container.firstChild).toBeNull();
    });
});
