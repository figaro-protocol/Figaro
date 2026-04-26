import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DesignerInspector } from "@/components/core/designer/DesignerInspector";
import type { Assembly } from "@/lib/shared/assembly";

function makeAssembly(): Assembly {
    return {
        identity: { id: "a", name: "A", slug: "a", networkTargets: [], version: "1.0.0" },
        contracts: [],
        mechanisms: [],
        roles: [],
        views: [
            {
                viewId: "v1",
                kind: "x",
                title: "v1",
                contextsAccepted: ["assembly"],
                moduleSlots: ["primary"],
            },
        ],
        modules: [
            {
                moduleId: "mod-a",
                componentKind: "module",
                semanticInput: "default",
                slot: "primary",
                priority: 10,
            },
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
            assemblyClass: "x",
            compositionLevel: 1,
            requiresCustomModules: false,
        },
    };
}

describe("DesignerInspector", () => {
    it("shows empty state when no binding is selected", () => {
        render(
            <DesignerInspector
                assembly={makeAssembly()}
                selectedBindingKey={null}
                onChange={() => undefined}
                onRemove={() => undefined}
            />,
        );
        expect(screen.getByTestId("inspector-empty")).toBeInTheDocument();
        expect(screen.queryByTestId("inspector-form")).not.toBeInTheDocument();
    });

    it("shows empty state when the selected key does not match any binding", () => {
        render(
            <DesignerInspector
                assembly={makeAssembly()}
                selectedBindingKey={{ moduleId: "missing", slot: "primary" }}
                onChange={() => undefined}
                onRemove={() => undefined}
            />,
        );
        expect(screen.getByTestId("inspector-empty")).toBeInTheDocument();
    });

    it("renders the form with the binding's current values", () => {
        render(
            <DesignerInspector
                assembly={makeAssembly()}
                selectedBindingKey={{ moduleId: "mod-a", slot: "primary" }}
                onChange={() => undefined}
                onRemove={() => undefined}
            />,
        );
        expect(screen.getByTestId("inspector-form")).toBeInTheDocument();
        expect((screen.getByTestId("inspector-componentKind") as HTMLInputElement).value).toBe("module");
        expect((screen.getByTestId("inspector-semanticInput") as HTMLInputElement).value).toBe("default");
        expect((screen.getByTestId("inspector-priority") as HTMLInputElement).value).toBe("10");
    });

    it("emits onChange with the patched componentKind", () => {
        const onChange = vi.fn();
        render(
            <DesignerInspector
                assembly={makeAssembly()}
                selectedBindingKey={{ moduleId: "mod-a", slot: "primary" }}
                onChange={onChange}
                onRemove={() => undefined}
            />,
        );
        fireEvent.change(screen.getByTestId("inspector-componentKind"), {
            target: { value: "card" },
        });
        expect(onChange).toHaveBeenCalledWith(
            { moduleId: "mod-a", slot: "primary" },
            { componentKind: "card" },
        );
    });

    it("emits onChange with the patched priority as a number", () => {
        const onChange = vi.fn();
        render(
            <DesignerInspector
                assembly={makeAssembly()}
                selectedBindingKey={{ moduleId: "mod-a", slot: "primary" }}
                onChange={onChange}
                onRemove={() => undefined}
            />,
        );
        fireEvent.change(screen.getByTestId("inspector-priority"), {
            target: { value: "55" },
        });
        expect(onChange).toHaveBeenCalledWith(
            { moduleId: "mod-a", slot: "primary" },
            { priority: 55 },
        );
    });

    it("renders the identity editor when no binding is selected and editableIdentity is true", () => {
        const onIdentityChange = vi.fn();
        render(
            <DesignerInspector
                assembly={makeAssembly()}
                selectedBindingKey={null}
                onChange={() => undefined}
                onRemove={() => undefined}
                editableIdentity
                onIdentityChange={onIdentityChange}
            />,
        );
        expect(screen.getByTestId("inspector-identity")).toBeInTheDocument();
        expect(screen.queryByTestId("inspector-empty")).not.toBeInTheDocument();
    });

    it("emits onIdentityChange with patched name", () => {
        const onIdentityChange = vi.fn();
        render(
            <DesignerInspector
                assembly={makeAssembly()}
                selectedBindingKey={null}
                onChange={() => undefined}
                onRemove={() => undefined}
                editableIdentity
                onIdentityChange={onIdentityChange}
            />,
        );
        fireEvent.change(screen.getByTestId("inspector-identity-name"), {
            target: { value: "Renamed" },
        });
        expect(onIdentityChange).toHaveBeenCalledWith({ name: "Renamed" });
    });

    it("emits onIdentityChange with patched slug", () => {
        const onIdentityChange = vi.fn();
        render(
            <DesignerInspector
                assembly={makeAssembly()}
                selectedBindingKey={null}
                onChange={() => undefined}
                onRemove={() => undefined}
                editableIdentity
                onIdentityChange={onIdentityChange}
            />,
        );
        fireEvent.change(screen.getByTestId("inspector-identity-slug"), {
            target: { value: "new-slug" },
        });
        expect(onIdentityChange).toHaveBeenCalledWith({ slug: "new-slug" });
    });

    it("falls back to the empty state when editableIdentity is false", () => {
        render(
            <DesignerInspector
                assembly={makeAssembly()}
                selectedBindingKey={null}
                onChange={() => undefined}
                onRemove={() => undefined}
                editableIdentity={false}
            />,
        );
        expect(screen.getByTestId("inspector-empty")).toBeInTheDocument();
        expect(screen.queryByTestId("inspector-identity")).not.toBeInTheDocument();
    });

    it("hides the identity editor when a binding is selected, even if editableIdentity is true", () => {
        render(
            <DesignerInspector
                assembly={makeAssembly()}
                selectedBindingKey={{ moduleId: "mod-a", slot: "primary" }}
                onChange={() => undefined}
                onRemove={() => undefined}
                editableIdentity
                onIdentityChange={() => undefined}
            />,
        );
        expect(screen.getByTestId("inspector-form")).toBeInTheDocument();
        expect(screen.queryByTestId("inspector-identity")).not.toBeInTheDocument();
    });

    it("emits onRemove when the remove button is clicked", () => {
        const onRemove = vi.fn();
        render(
            <DesignerInspector
                assembly={makeAssembly()}
                selectedBindingKey={{ moduleId: "mod-a", slot: "primary" }}
                onChange={() => undefined}
                onRemove={onRemove}
            />,
        );
        fireEvent.click(screen.getByTestId("inspector-remove"));
        expect(onRemove).toHaveBeenCalledWith("mod-a", "primary");
    });
});
