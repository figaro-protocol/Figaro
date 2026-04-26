import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DESIGNER_BLOCK_DND_MIME, DesignerPalette } from "@/components/core/designer/DesignerPalette";
import type { BlockMetadata } from "@/lib/shared/blockMetadata";
import type { Assembly } from "@/lib/shared/assembly";
import type { ModuleProps } from "@/lib/shared/moduleRegistry";

const NoopModule = (_: ModuleProps) => null;

const ANY_ROLE = { roles: null, requiresMechanisms: [], requiresCapabilities: [] } as const;

function makeBlock(overrides: Partial<BlockMetadata>): BlockMetadata {
    return {
        blockId: "test-block",
        displayName: "Test Block",
        description: "A test block.",
        category: "mechanism",
        schemaIds: [],
        modules: [{ moduleId: "test-block", component: NoopModule }],
        compatibility: ANY_ROLE,
        ...overrides,
    };
}

describe("DesignerPalette", () => {
    it("renders a section per non-empty visible category", () => {
        const blocks: BlockMetadata[] = [
            makeBlock({ blockId: "a", category: "mechanism", displayName: "A" }),
            makeBlock({ blockId: "b", category: "schema", displayName: "B" }),
            makeBlock({ blockId: "c", category: "handoff", displayName: "C" }),
            makeBlock({ blockId: "d", category: "display", displayName: "D" }),
        ];
        render(<DesignerPalette blocks={blocks} />);

        expect(screen.getByTestId("palette-category-mechanism")).toBeInTheDocument();
        expect(screen.getByTestId("palette-category-schema")).toBeInTheDocument();
        expect(screen.getByTestId("palette-category-handoff")).toBeInTheDocument();
        expect(screen.getByTestId("palette-category-display")).toBeInTheDocument();
    });

    it("excludes blocks marked excludeFromPalette", () => {
        const blocks: BlockMetadata[] = [
            makeBlock({ blockId: "visible", category: "mechanism", displayName: "Visible" }),
            makeBlock({ blockId: "hidden", category: "mechanism", displayName: "Hidden", excludeFromPalette: true }),
        ];
        render(<DesignerPalette blocks={blocks} />);

        expect(screen.getByTestId("palette-block-visible")).toBeInTheDocument();
        expect(screen.queryByTestId("palette-block-hidden")).not.toBeInTheDocument();
    });

    it("does not render the shell category in the palette by default", () => {
        const blocks: BlockMetadata[] = [
            makeBlock({ blockId: "shell-block", category: "shell", displayName: "Shell", excludeFromPalette: true }),
        ];
        render(<DesignerPalette blocks={blocks} />);

        expect(screen.queryByTestId("palette-category-shell")).not.toBeInTheDocument();
    });

    it("orders blocks within a category by paletteOrder then displayName", () => {
        const blocks: BlockMetadata[] = [
            makeBlock({ blockId: "c-third", displayName: "C", paletteOrder: 30 }),
            makeBlock({ blockId: "a-first", displayName: "A", paletteOrder: 10 }),
            makeBlock({ blockId: "b-second", displayName: "B", paletteOrder: 20 }),
        ];
        render(<DesignerPalette blocks={blocks} />);

        const ids = screen.getAllByRole("button").map((el) => el.getAttribute("data-testid"));
        expect(ids).toEqual([
            "palette-block-a-first",
            "palette-block-b-second",
            "palette-block-c-third",
        ]);
    });

    it("shows ✓ for blocks with all schemas loaded (built-in figaro-handoff-v1 is preloaded)", () => {
        const blocks: BlockMetadata[] = [
            makeBlock({
                blockId: "uses-handoff",
                displayName: "Uses Handoff",
                schemaIds: ["figaro-handoff-v1"],
            }),
        ];
        render(<DesignerPalette blocks={blocks} />);

        expect(screen.getByTestId("palette-block-uses-handoff-schema-ok")).toBeInTheDocument();
    });

    it("shows ⚠ for blocks referencing an unknown schemaId", () => {
        const blocks: BlockMetadata[] = [
            makeBlock({
                blockId: "uses-unknown",
                displayName: "Uses Unknown",
                schemaIds: ["nonexistent-schema-v99"],
            }),
        ];
        render(<DesignerPalette blocks={blocks} />);

        expect(screen.getByTestId("palette-block-uses-unknown-schema-warn")).toBeInTheDocument();
    });

    it("renders the schema-ids in a single demoted line under the displayName", () => {
        const blocks: BlockMetadata[] = [
            makeBlock({
                blockId: "multi-schema",
                schemaIds: ["figaro-handoff-v1", "figaro-topology-v1"],
            }),
        ];
        render(<DesignerPalette blocks={blocks} />);

        expect(screen.getByText("figaro-handoff-v1, figaro-topology-v1")).toBeInTheDocument();
    });

    it("calls onSelectBlock when a card is clicked", () => {
        const onSelect = vi.fn();
        const blocks: BlockMetadata[] = [
            makeBlock({ blockId: "click-me", displayName: "Click Me" }),
        ];
        render(<DesignerPalette blocks={blocks} onSelectBlock={onSelect} />);

        fireEvent.click(screen.getByTestId("palette-block-click-me"));
        expect(onSelect).toHaveBeenCalledWith("click-me");
    });

    it("renders incompatible blocks disabled with a reason when an assembly is passed", () => {
        const assembly: Assembly = {
            identity: { id: "a", name: "A", slug: "a", networkTargets: [], version: "1.0.0" },
            contracts: [],
            mechanisms: [],
            roles: [],
            views: [],
            modules: [],
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
            builderMetadata: { assemblyClass: "x", compositionLevel: 1, requiresCustomModules: false },
        };
        const blocks: BlockMetadata[] = [
            makeBlock({
                blockId: "needs-auction",
                displayName: "Needs Auction",
                compatibility: {
                    roles: null,
                    requiresMechanisms: ["dutch-auction"],
                    requiresCapabilities: [],
                },
            }),
            makeBlock({ blockId: "universal", displayName: "Universal" }),
        ];
        render(<DesignerPalette blocks={blocks} assembly={assembly} />);

        const incompat = screen.getByTestId("palette-block-needs-auction") as HTMLButtonElement;
        expect(incompat.disabled).toBe(true);
        expect(incompat).toHaveAttribute("data-block-incompatible", "true");
        expect(screen.getByTestId("palette-block-needs-auction-incompat-reason")).toHaveTextContent(
            /dutch-auction/,
        );

        const ok = screen.getByTestId("palette-block-universal") as HTMLButtonElement;
        expect(ok.disabled).toBe(false);
        expect(ok).not.toHaveAttribute("data-block-incompatible");
    });

    it("does not fire onSelectBlock when an incompatible block is clicked", () => {
        const assembly: Assembly = {
            identity: { id: "a", name: "A", slug: "a", networkTargets: [], version: "1.0.0" },
            contracts: [],
            mechanisms: [],
            roles: [],
            views: [],
            modules: [],
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
            builderMetadata: { assemblyClass: "x", compositionLevel: 1, requiresCustomModules: false },
        };
        const onSelect = vi.fn();
        const blocks: BlockMetadata[] = [
            makeBlock({
                blockId: "needs-auction",
                displayName: "Needs Auction",
                compatibility: {
                    roles: null,
                    requiresMechanisms: ["dutch-auction"],
                    requiresCapabilities: [],
                },
            }),
        ];
        render(<DesignerPalette blocks={blocks} assembly={assembly} onSelectBlock={onSelect} />);
        fireEvent.click(screen.getByTestId("palette-block-needs-auction"));
        expect(onSelect).not.toHaveBeenCalled();
    });

    it("ignores compatibility checks when no assembly is passed", () => {
        const blocks: BlockMetadata[] = [
            makeBlock({
                blockId: "needs-auction",
                compatibility: {
                    roles: null,
                    requiresMechanisms: ["dutch-auction"],
                    requiresCapabilities: [],
                },
            }),
        ];
        render(<DesignerPalette blocks={blocks} />);
        expect((screen.getByTestId("palette-block-needs-auction") as HTMLButtonElement).disabled).toBe(false);
    });

    it("marks compatible block cards as draggable and sets the blockId on dragStart", () => {
        const blocks: BlockMetadata[] = [
            makeBlock({ blockId: "drag-me", displayName: "Drag Me" }),
        ];
        render(<DesignerPalette blocks={blocks} />);
        const card = screen.getByTestId("palette-block-drag-me") as HTMLButtonElement;
        expect(card.draggable).toBe(true);

        const setData = vi.fn();
        const dataTransfer = { setData, types: [], effectAllowed: "none" };
        fireEvent.dragStart(card, { dataTransfer });
        expect(setData).toHaveBeenCalledWith(DESIGNER_BLOCK_DND_MIME, "drag-me");
    });

    it("marks incompatible block cards as non-draggable", () => {
        const assembly: Assembly = {
            identity: { id: "a", name: "A", slug: "a", networkTargets: [], version: "1.0.0" },
            contracts: [], mechanisms: [], roles: [], views: [], modules: [],
            capabilityPresentation: [],
            visibilityDefaults: {
                showGraphByDefault: false, showAdvancedMechanisms: false, showRiskBoundaries: false,
                showGuarantees: false, showEconomicBreakdowns: false, showBuilderMode: false, showAuditMode: false,
            },
            builderMetadata: { assemblyClass: "x", compositionLevel: 1, requiresCustomModules: false },
        };
        const blocks: BlockMetadata[] = [
            makeBlock({
                blockId: "needs-auction",
                compatibility: { roles: null, requiresMechanisms: ["dutch-auction"], requiresCapabilities: [] },
            }),
        ];
        render(<DesignerPalette blocks={blocks} assembly={assembly} />);
        expect((screen.getByTestId("palette-block-needs-auction") as HTMLButtonElement).draggable).toBe(false);
    });

    it("highlights the selected block", () => {
        const blocks: BlockMetadata[] = [
            makeBlock({ blockId: "alpha", displayName: "Alpha" }),
            makeBlock({ blockId: "beta", displayName: "Beta" }),
        ];
        render(<DesignerPalette blocks={blocks} selectedBlockId="beta" />);

        const beta = screen.getByTestId("palette-block-beta");
        expect(beta.className).toContain("border-blue-500");
        const alpha = screen.getByTestId("palette-block-alpha");
        expect(alpha.className).not.toContain("border-blue-500");
    });

    // ── Schema-category filter (relies on figaro-handoff-v1 preloaded with categories: ["handoff"]) ──

    it("renders a topic chip for each schema category present in loaded specs", () => {
        const blocks: BlockMetadata[] = [
            makeBlock({ blockId: "uses-handoff", schemaIds: ["figaro-handoff-v1"] }),
        ];
        render(<DesignerPalette blocks={blocks} />);

        expect(screen.getByTestId("palette-category-filter")).toBeInTheDocument();
        expect(screen.getByTestId("palette-category-chip-handoff")).toBeInTheDocument();
    });

    it("does not render the filter row when no loaded specs carry categories", () => {
        const blocks: BlockMetadata[] = [
            makeBlock({ blockId: "no-schemas", schemaIds: [] }),
            makeBlock({ blockId: "unknown-schema", schemaIds: ["nonexistent-v99"] }),
        ];
        render(<DesignerPalette blocks={blocks} />);

        expect(screen.queryByTestId("palette-category-filter")).not.toBeInTheDocument();
    });

    it("filters palette to blocks whose schemas match the selected category", () => {
        const blocks: BlockMetadata[] = [
            makeBlock({ blockId: "handoff-block", category: "schema", schemaIds: ["figaro-handoff-v1"] }),
            makeBlock({ blockId: "other-block", category: "schema", schemaIds: [] }),
        ];
        render(<DesignerPalette blocks={blocks} />);

        // Both visible before filter applied.
        expect(screen.getByTestId("palette-block-handoff-block")).toBeInTheDocument();
        expect(screen.getByTestId("palette-block-other-block")).toBeInTheDocument();

        fireEvent.click(screen.getByTestId("palette-category-chip-handoff"));

        expect(screen.getByTestId("palette-block-handoff-block")).toBeInTheDocument();
        expect(screen.queryByTestId("palette-block-other-block")).not.toBeInTheDocument();
    });

    it("clears filter selection when Clear is clicked", () => {
        const blocks: BlockMetadata[] = [
            makeBlock({ blockId: "handoff-block", category: "schema", schemaIds: ["figaro-handoff-v1"] }),
            makeBlock({ blockId: "other-block", category: "schema", schemaIds: [] }),
        ];
        render(<DesignerPalette blocks={blocks} />);

        fireEvent.click(screen.getByTestId("palette-category-chip-handoff"));
        expect(screen.queryByTestId("palette-block-other-block")).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId("palette-category-filter-clear"));
        expect(screen.getByTestId("palette-block-other-block")).toBeInTheDocument();
    });
});
