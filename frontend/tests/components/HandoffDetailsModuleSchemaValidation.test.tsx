import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HandoffDetailsModule } from "@/components/modules/HandoffDetailsModule";
import { encodeFulfilmentV2Content, type FulfilmentHandoffPoint } from "@figaro/core/schemas";

/**
 * End-to-end Layer A → SDK encoder integration test for the
 * `figaro-fulfilment-v2` schema, wired through HandoffDetailsModule.
 *
 * Asserts:
 *   1. Each declared handoff-point option is reachable.
 *   2. Schema validation runs on every selection and accepts all 4 points.
 *   3. Submit emits a CustomEvent whose `fulfilmentContent` field is the
 *      ABI-encoded bytes the on-chain validator expects (matches encoder).
 *   4. Submit is disabled until the address + budget + verified-checkbox
 *      gates pass; the handoff-point default is always valid.
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

describe("HandoffDetailsModule — figaro-fulfilment-v2 wiring", () => {
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

    it("renders all 4 handoff-point options", () => {
        render(<HandoffDetailsModule {...createProps()} />);
        for (const point of ["face-to-face", "dead-drop", "parking-area", "locker"] as FulfilmentHandoffPoint[]) {
            expect(screen.getByTestId(`handoff-point-btn-${point}`)).toBeInTheDocument();
        }
    });

    it("default selection (face-to-face) passes schema validation — no error shown", () => {
        render(<HandoffDetailsModule {...createProps()} />);
        expect(screen.queryByTestId("handoff-point-validation-error")).not.toBeInTheDocument();
    });

    it("selecting any other point keeps schema validation passing", () => {
        render(<HandoffDetailsModule {...createProps()} />);
        for (const point of ["dead-drop", "locker", "parking-area"] as FulfilmentHandoffPoint[]) {
            fireEvent.click(screen.getByTestId(`handoff-point-btn-${point}`));
            expect(screen.queryByTestId("handoff-point-validation-error")).not.toBeInTheDocument();
        }
    });

    it("submit emits CustomEvent with ABI-encoded fulfilmentContent matching encodeFulfilmentV2Content", () => {
        render(<HandoffDetailsModule {...createProps()} />);

        // Fill required fields to enable submit
        fireEvent.change(screen.getByTestId("input-destination-address"), {
            target: { value: "123 Main St, Apt 4B" },
        });
        fireEvent.click(screen.getByTestId("handoff-point-btn-locker"));
        fireEvent.click(screen.getByTestId("handoff-verified-checkbox"));

        fireEvent.click(screen.getByTestId("btn-confirm-handoff"));

        expect(dispatchedEvents).toHaveLength(1);
        const event = dispatchedEvents[0];
        expect(event.type).toBe("figaro:handoff-manifest");

        const detail = event.detail as { handoffPoint: FulfilmentHandoffPoint; fulfilmentContent: string };
        expect(detail.handoffPoint).toBe("locker");
        // Encoded bytes must match what the SDK encoder (and on-chain validator) expects.
        expect(detail.fulfilmentContent).toBe(
            encodeFulfilmentV2Content({ modality: "delivery", handoffPoint: "locker" }),
        );
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
        // Now address + budget (default 0.002) + verified all pass + handoff-point default valid
        expect(submit.disabled).toBe(false);
    });

    it("renders nothing for non-buyer role", () => {
        const { container } = render(<HandoffDetailsModule {...createProps({ selectedRoleKind: "seller" })} />);
        expect(container.firstChild).toBeNull();
    });
});
