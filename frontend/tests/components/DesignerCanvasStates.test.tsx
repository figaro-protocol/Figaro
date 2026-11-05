/**
 * DesignerCanvas — what the designer sees before and around the canvas.
 *
 * A clause-registry read that failed before the specs ever loaded renders
 * nothing: no canvas, and no loading line for a read that is not in flight
 * (docs/OPEN_WORLD.md § 1); a read in flight shows the loading line; a
 * registry read that fails after the canvas has loaded never unmounts it.
 *
 * At the order cap, adding a node is refused with a notice that names the
 * cap as the SDK's own estimate of what fits in one atomic resolveProcess,
 * never as a limit the chain enforces.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Order } from "@/lib/kernel/store";

const specs = vi.hoisted(() => ({ state: { loaded: false, failed: false, version: 0 }, client: { chain: { id: 31337 } } }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => specs.state }));
vi.mock("wagmi", () => ({ useChainId: () => 31337, usePublicClient: () => specs.client }));
// The chain's two ceilings: one order resolves per process, so the blank
// canvas's root already stands at the cap.
vi.mock("@/lib/shared/chainGasCeilings", () => ({
    maxOrdersResolvablePerProcess: async () => 1,
    maxCommitsLandableInOneBlock: async () => 1,
}));
vi.mock("@/components/runtime/TopologyCanvas", () => ({
    TopologyCanvas: ({ orders, onAddSubOrder }: { orders: Order[]; onAddSubOrder: (id: string) => void }) => (
        <div data-testid="topology-canvas" data-orders={orders.length}>
            <button type="button" onClick={() => onAddSubOrder(orders[0].orderHash)}>add sub-order</button>
        </div>
    ),
}));
vi.mock("@/app/(tools)/assemblies/designer/_components/AgreementDrawer", () => ({ AgreementDrawer: () => null }));
vi.mock("@/app/(tools)/assemblies/designer/_components/AssemblyTermsPanel", () => ({ AssemblyTermsPanel: () => null }));
vi.mock("@/app/(tools)/assemblies/designer/_components/CompositionAssist", () => ({ CompositionAssist: () => null }));
vi.mock("@/app/(tools)/assemblies/designer/_components/AssemblyIdentity", () => ({ AssemblyIdentity: () => null }));
vi.mock("@/lib/designer/publishAssembly", () => ({ usePublishAgreement: () => ({ publishAgreement: vi.fn(), isPending: false }) }));

import { DesignerCanvas } from "@/app/(tools)/assemblies/designer/_components/DesignerCanvas";

beforeEach(() => {
    specs.state = { loaded: false, failed: false, version: 0 };
    window.localStorage.clear();
});

describe("DesignerCanvas — the clause-registry read", () => {
    it("a read that failed before the specs loaded renders nothing — no canvas, no loading line", () => {
        specs.state = { loaded: false, failed: true, version: 0 };
        const { container } = render(<DesignerCanvas seed={{ kind: "blank" }} />);
        expect(container.innerHTML).toBe("");
        expect(screen.queryByTestId("designer-specs-loading")).toBeNull();
        expect(screen.queryByTestId("topology-canvas")).toBeNull();
    });

    it("a read in flight shows the loading line", () => {
        render(<DesignerCanvas seed={{ kind: "blank" }} />);
        expect(screen.getByTestId("designer-specs-loading").textContent).toBe("Loading registered clauses…");
    });

    it("a read that fails after the canvas loaded never unmounts it", async () => {
        specs.state = { loaded: true, failed: false, version: 1 };
        const { rerender } = render(<DesignerCanvas seed={{ kind: "blank" }} />);
        expect(await screen.findByTestId("topology-canvas")).toBeTruthy();
        specs.state = { loaded: false, failed: true, version: 2 };
        rerender(<DesignerCanvas seed={{ kind: "blank" }} />);
        expect(screen.getByTestId("topology-canvas")).toBeTruthy();
    });
});

describe("DesignerCanvas — the order cap", () => {
    it("refuses a node past the cap with a notice naming the cap as the SDK's own estimate, not a chain limit", async () => {
        specs.state = { loaded: true, failed: false, version: 1 };
        render(<DesignerCanvas seed={{ kind: "blank" }} />);
        // The ceilings are read in an effect; the counter shows once they are.
        expect(await screen.findByText(/1 \/ 1 orders/)).toBeTruthy();
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "add sub-order" })); });
        const notice = screen.getByTestId("designer-merge-notice").textContent;
        expect(notice).toBe(
            "1 orders is the most the SDK plans to fit in one atomic resolveProcess on this chain "
            + "(its own estimate, not a limit the chain enforces). Remove a node to add another, or compose multiple processes.",
        );
        expect(notice).not.toMatch(/this chain resolves at most/);
        expect(screen.getByTestId("topology-canvas").getAttribute("data-orders")).toBe("1");
    });
});
