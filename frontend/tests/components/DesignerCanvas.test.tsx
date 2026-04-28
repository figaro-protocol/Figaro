import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DesignerCanvas } from "@/components/core/designer/DesignerCanvas";
import { DESIGNER_BLOCK_DND_MIME } from "@/components/core/designer/DesignerPalette";
import { LOCAL_COMMERCE_REFERENCE_ASSEMBLY } from "@/lib/shared/assembly";
import type { Assembly } from "@/lib/shared/assembly";

function makeAssembly(overrides: Partial<Assembly> = {}): Assembly {
    return {
        identity: {
            id: "test-assembly",
            name: "Test Assembly",
            slug: "test-assembly",
            description: "An assembly used in tests.",
            networkTargets: [],
            version: "1.0.0",
        },
        contracts: [],
        mechanisms: [
            {
                mechanismId: "m1",
                kind: "commerce",
                displayName: "Commerce",
                riskClass: "low-risk-coordinator",
                enabled: true,
                visibility: "primary",
                moduleBindings: ["mod-a", "mod-b"],
            },
        ],
        roles: [
            {
                roleKind: "buyer",
                displayName: "Buyer",
                visibility: "primary",
            },
            {
                roleKind: "seller",
                displayName: "Seller",
                visibility: "primary",
            },
        ],
        views: [
            {
                viewId: "v1",
                kind: "landing",
                title: "Landing",
                contextsAccepted: ["assembly"],
                moduleSlots: ["primary", "secondary"],
            },
        ],
        modules: [
            { moduleId: "mod-a", componentKind: "x", semanticInput: "x", slot: "primary", priority: 20 },
            { moduleId: "mod-b", componentKind: "x", semanticInput: "x", slot: "primary", priority: 10 },
            { moduleId: "mod-c", componentKind: "x", semanticInput: "x", slot: "secondary", priority: 5 },
        ],
        capabilityPresentation: [],
        visibilityDefaults: {
            showGraphByDefault: false,
            showAdvancedMechanisms: false,
            showRiskBoundaries: false,
            showGuarantees: false,
            showEconomicBreakdowns: false,
            showBuilderMode: false,
            showAuditMode: false,
        },
        builderMetadata: {
            assemblyClass: "test",
            compositionLevel: 1,
            requiresCustomModules: false,
        },
        ...overrides,
    };
}

describe("DesignerCanvas", () => {
    it("renders empty state when assembly is null", () => {
        render(<DesignerCanvas assembly={null} />);
        expect(screen.getByTestId("designer-canvas-empty")).toBeInTheDocument();
        expect(screen.queryByTestId("designer-canvas")).not.toBeInTheDocument();
    });

    it("renders identity, roles, mechanisms, and views sections", () => {
        render(<DesignerCanvas assembly={makeAssembly()} />);
        expect(screen.getByTestId("canvas-identity")).toBeInTheDocument();
        expect(screen.getByTestId("canvas-roles")).toBeInTheDocument();
        expect(screen.getByTestId("canvas-mechanisms")).toBeInTheDocument();
        expect(screen.getByTestId("canvas-views")).toBeInTheDocument();
    });

    it("renders identity name, slug, and description", () => {
        render(<DesignerCanvas assembly={makeAssembly()} />);
        const identity = screen.getByTestId("canvas-identity");
        expect(within(identity).getByText("Test Assembly")).toBeInTheDocument();
        expect(within(identity).getByText("/test-assembly")).toBeInTheDocument();
        expect(within(identity).getByText("An assembly used in tests.")).toBeInTheDocument();
    });

    it("annotates the section with the assembly slug", () => {
        render(<DesignerCanvas assembly={makeAssembly()} />);
        expect(screen.getByTestId("designer-canvas")).toHaveAttribute(
            "data-assembly-slug",
            "test-assembly",
        );
    });

    it("renders one chip per role", () => {
        render(<DesignerCanvas assembly={makeAssembly()} />);
        expect(screen.getByTestId("canvas-role-buyer")).toBeInTheDocument();
        expect(screen.getByTestId("canvas-role-seller")).toBeInTheDocument();
    });

    it("renders mechanisms with display name and bound modules in the disclosure", () => {
        render(<DesignerCanvas assembly={makeAssembly()} />);
        const mechanism = screen.getByTestId("canvas-mechanism-m1");
        expect(within(mechanism).getByText("Commerce")).toBeInTheDocument();
        expect(within(mechanism).getByText(/mod-a/)).toBeInTheDocument();
        expect(within(mechanism).getByText(/mod-b/)).toBeInTheDocument();
    });

    it("groups bindings by slot and sorts by priority ascending", () => {
        render(<DesignerCanvas assembly={makeAssembly()} />);
        const primarySlot = screen.getByTestId("canvas-slot-v1-primary");
        const bindings = within(primarySlot).getAllByTestId(/^canvas-binding-/);
        // mod-b (priority=10) must come before mod-a (priority=20)
        expect(bindings.map((el) => el.getAttribute("data-testid"))).toEqual([
            "canvas-binding-mod-b",
            "canvas-binding-mod-a",
        ]);
    });

    it("shows the no-blocks placeholder for an empty slot in read-only mode", () => {
        const assembly = makeAssembly({
            modules: [],
        });
        render(<DesignerCanvas assembly={assembly} />);
        const slot = screen.getByTestId("canvas-slot-v1-primary");
        expect(within(slot).getByText("No blocks in this slot.")).toBeInTheDocument();
    });

    it("does not show remove buttons in read-only mode (no onRemoveBinding)", () => {
        render(<DesignerCanvas assembly={makeAssembly()} />);
        expect(screen.queryByTestId("canvas-binding-mod-a-remove")).not.toBeInTheDocument();
    });

    it("does not make slots clickable in read-only mode (no onSelectSlot)", () => {
        render(<DesignerCanvas assembly={makeAssembly()} />);
        const slot = screen.getByTestId("canvas-slot-v1-primary");
        expect(slot).not.toHaveAttribute("role", "button");
    });

    it("calls onSelectSlot with the slot key when a slot is clicked", () => {
        const onSelect = vi.fn();
        render(<DesignerCanvas assembly={makeAssembly()} onSelectSlot={onSelect} />);
        fireEvent.click(screen.getByTestId("canvas-slot-v1-secondary"));
        expect(onSelect).toHaveBeenCalledWith({ viewId: "v1", slot: "secondary" });
    });

    it("highlights the selected slot via data-selected attribute", () => {
        render(
            <DesignerCanvas
                assembly={makeAssembly()}
                selectedSlotKey={{ viewId: "v1", slot: "primary" }}
                onSelectSlot={() => undefined}
            />,
        );
        expect(screen.getByTestId("canvas-slot-v1-primary")).toHaveAttribute("data-selected", "true");
        expect(screen.getByTestId("canvas-slot-v1-secondary")).not.toHaveAttribute("data-selected");
    });

    it("calls onRemoveBinding with (moduleId, slot) when × is clicked", () => {
        const onRemove = vi.fn();
        render(<DesignerCanvas assembly={makeAssembly()} onRemoveBinding={onRemove} />);
        fireEvent.click(screen.getByTestId("canvas-binding-mod-a-remove"));
        expect(onRemove).toHaveBeenCalledWith("mod-a", "primary");
    });

    it("calls onSelectBinding with the binding key when a binding row is clicked", () => {
        const onSelectBinding = vi.fn();
        render(<DesignerCanvas assembly={makeAssembly()} onSelectBinding={onSelectBinding} />);
        fireEvent.click(screen.getByTestId("canvas-binding-mod-a"));
        expect(onSelectBinding).toHaveBeenCalledWith({ moduleId: "mod-a", slot: "primary" });
    });

    it("highlights the selected binding via data-selected attribute", () => {
        render(
            <DesignerCanvas
                assembly={makeAssembly()}
                selectedBindingKey={{ moduleId: "mod-a", slot: "primary" }}
                onSelectBinding={() => undefined}
            />,
        );
        expect(screen.getByTestId("canvas-binding-mod-a")).toHaveAttribute("data-selected", "true");
        expect(screen.getByTestId("canvas-binding-mod-b")).not.toHaveAttribute("data-selected");
    });

    it("clicking a binding does not also fire onSelectSlot", () => {
        const onSelectSlot = vi.fn();
        const onSelectBinding = vi.fn();
        render(
            <DesignerCanvas
                assembly={makeAssembly()}
                onSelectSlot={onSelectSlot}
                onSelectBinding={onSelectBinding}
            />,
        );
        fireEvent.click(screen.getByTestId("canvas-binding-mod-a"));
        expect(onSelectBinding).toHaveBeenCalled();
        expect(onSelectSlot).not.toHaveBeenCalled();
    });

    it("clicking × does not also fire onSelectSlot", () => {
        const onSelect = vi.fn();
        const onRemove = vi.fn();
        render(
            <DesignerCanvas
                assembly={makeAssembly()}
                onSelectSlot={onSelect}
                onRemoveBinding={onRemove}
            />,
        );
        fireEvent.click(screen.getByTestId("canvas-binding-mod-a-remove"));
        expect(onRemove).toHaveBeenCalled();
        expect(onSelect).not.toHaveBeenCalled();
    });

    it("does not render view/slot edit affordances when callbacks are absent", () => {
        render(<DesignerCanvas assembly={makeAssembly()} />);
        expect(screen.queryByTestId("canvas-add-view")).not.toBeInTheDocument();
        expect(screen.queryByTestId("canvas-view-v1-remove")).not.toBeInTheDocument();
        expect(screen.queryByTestId("canvas-view-v1-add-slot")).not.toBeInTheDocument();
        expect(
            screen.queryByTestId("canvas-slot-v1-primary-remove"),
        ).not.toBeInTheDocument();
    });

    it("renders the '+ Add view' button when onAddView is provided", () => {
        const onAddView = vi.fn();
        render(<DesignerCanvas assembly={makeAssembly()} onAddView={onAddView} />);
        const btn = screen.getByTestId("canvas-add-view");
        fireEvent.click(btn);
        expect(onAddView).toHaveBeenCalled();
    });

    it("renders a × on each view header when onRemoveView is provided", () => {
        const onRemoveView = vi.fn();
        render(<DesignerCanvas assembly={makeAssembly()} onRemoveView={onRemoveView} />);
        fireEvent.click(screen.getByTestId("canvas-view-v1-remove"));
        expect(onRemoveView).toHaveBeenCalledWith("v1");
    });

    it("renders a '+ Slot' button per view when onAddSlotToView is provided", () => {
        const onAddSlotToView = vi.fn();
        render(<DesignerCanvas assembly={makeAssembly()} onAddSlotToView={onAddSlotToView} />);
        fireEvent.click(screen.getByTestId("canvas-view-v1-add-slot"));
        expect(onAddSlotToView).toHaveBeenCalledWith("v1");
    });

    it("renders a × on each slot label when onRemoveSlotFromView is provided", () => {
        const onRemoveSlotFromView = vi.fn();
        render(
            <DesignerCanvas
                assembly={makeAssembly()}
                onRemoveSlotFromView={onRemoveSlotFromView}
            />,
        );
        fireEvent.click(screen.getByTestId("canvas-slot-v1-primary-remove"));
        expect(onRemoveSlotFromView).toHaveBeenCalledWith("v1", "primary");
    });

    it("clicking × on a slot label does not also fire onSelectSlot", () => {
        const onSelectSlot = vi.fn();
        const onRemoveSlotFromView = vi.fn();
        render(
            <DesignerCanvas
                assembly={makeAssembly()}
                onSelectSlot={onSelectSlot}
                onRemoveSlotFromView={onRemoveSlotFromView}
            />,
        );
        fireEvent.click(screen.getByTestId("canvas-slot-v1-primary-remove"));
        expect(onRemoveSlotFromView).toHaveBeenCalled();
        expect(onSelectSlot).not.toHaveBeenCalled();
    });

    it("does not render role edit affordances when callbacks are absent", () => {
        render(<DesignerCanvas assembly={makeAssembly()} />);
        expect(screen.queryByTestId("canvas-add-role")).not.toBeInTheDocument();
        expect(screen.queryByTestId("canvas-role-buyer-remove")).not.toBeInTheDocument();
    });

    it("renders the '+ Add role' button when onAddRole is provided", () => {
        const onAddRole = vi.fn();
        render(<DesignerCanvas assembly={makeAssembly()} onAddRole={onAddRole} />);
        fireEvent.click(screen.getByTestId("canvas-add-role"));
        expect(onAddRole).toHaveBeenCalled();
    });

    it("renders × on each role chip when onRemoveRole is provided", () => {
        const onRemoveRole = vi.fn();
        render(<DesignerCanvas assembly={makeAssembly()} onRemoveRole={onRemoveRole} />);
        fireEvent.click(screen.getByTestId("canvas-role-buyer-remove"));
        expect(onRemoveRole).toHaveBeenCalledWith("buyer");
    });

    it("does not act as a drop target when onAddBlock is absent", () => {
        render(<DesignerCanvas assembly={makeAssembly()} />);
        const slot = screen.getByTestId("canvas-slot-v1-primary");
        const dataTransfer = {
            types: [DESIGNER_BLOCK_DND_MIME],
            getData: vi.fn().mockReturnValue("drag-me"),
        };
        fireEvent.drop(slot, { dataTransfer });
        // No handler wired, no-op. Assert absence of data-drop-over too.
        expect(slot).not.toHaveAttribute("data-drop-over");
    });

    it("fires onAddBlock with (blockId, viewId, slot) on drop", () => {
        const onAddBlock = vi.fn();
        render(<DesignerCanvas assembly={makeAssembly()} onAddBlock={onAddBlock} />);
        const slot = screen.getByTestId("canvas-slot-v1-secondary");
        const dataTransfer = {
            types: [DESIGNER_BLOCK_DND_MIME],
            getData: vi.fn((mime: string) =>
                mime === DESIGNER_BLOCK_DND_MIME ? "drag-me" : "",
            ),
        };
        fireEvent.drop(slot, { dataTransfer });
        expect(onAddBlock).toHaveBeenCalledWith("drag-me", "v1", "secondary");
    });

    it("shows a drop-over cue while a drag with the right MIME hovers a slot", () => {
        render(<DesignerCanvas assembly={makeAssembly()} onAddBlock={() => undefined} />);
        const slot = screen.getByTestId("canvas-slot-v1-primary");
        const dataTransfer = {
            types: [DESIGNER_BLOCK_DND_MIME],
            getData: () => "drag-me",
            dropEffect: "none",
        };
        fireEvent.dragOver(slot, { dataTransfer });
        expect(slot).toHaveAttribute("data-drop-over", "true");

        fireEvent.dragLeave(slot);
        expect(slot).not.toHaveAttribute("data-drop-over");
    });

    it("ignores drags without the Figaro block MIME", () => {
        const onAddBlock = vi.fn();
        render(<DesignerCanvas assembly={makeAssembly()} onAddBlock={onAddBlock} />);
        const slot = screen.getByTestId("canvas-slot-v1-primary");
        const dataTransfer = {
            types: ["text/plain"],
            getData: () => "irrelevant",
            dropEffect: "none",
        };
        fireEvent.dragOver(slot, { dataTransfer });
        expect(slot).not.toHaveAttribute("data-drop-over");
    });

    it("renders the local-commerce reference assembly without crashing", () => {
        render(<DesignerCanvas assembly={LOCAL_COMMERCE_REFERENCE_ASSEMBLY} />);
        const canvas = screen.getByTestId("designer-canvas");
        expect(canvas).toHaveAttribute("data-assembly-slug", "local-commerce");
        const identity = within(canvas).getByTestId("canvas-identity");
        expect(within(identity).getByText(LOCAL_COMMERCE_REFERENCE_ASSEMBLY.identity.name)).toBeInTheDocument();
    });
});
