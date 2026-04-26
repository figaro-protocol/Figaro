import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DesignerPublishDrawer } from "@/components/core/designer/DesignerPublishDrawer";
import { FIGARO_EATS_REFERENCE_ASSEMBLY, type Assembly } from "@/lib/shared/assembly";
import type { PublishAssemblyResult } from "@/lib/shared/assemblyPublication";

function makeInvalidAssembly(): Assembly {
    return {
        identity: {
            id: "x",
            name: "X",
            // uppercase -> fails kebab-case rule in validateDraftPublicationReadiness
            slug: "BAD_SLUG",
            networkTargets: [],
            version: "1.0.0",
        },
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
        builderMetadata: {
            assemblyClass: "x",
            compositionLevel: 1,
            requiresCustomModules: false,
        },
    };
}

describe("DesignerPublishDrawer", () => {
    it("renders nothing when open is false", () => {
        render(
            <DesignerPublishDrawer
                assembly={FIGARO_EATS_REFERENCE_ASSEMBLY}
                open={false}
                onClose={() => undefined}
            />,
        );
        expect(screen.queryByTestId("designer-publish-drawer")).not.toBeInTheDocument();
    });

    it("renders the drawer when open is true", () => {
        render(
            <DesignerPublishDrawer
                assembly={FIGARO_EATS_REFERENCE_ASSEMBLY}
                open
                onClose={() => undefined}
            />,
        );
        expect(screen.getByTestId("designer-publish-drawer")).toBeInTheDocument();
    });

    it("shows the empty state when assembly is null", () => {
        render(<DesignerPublishDrawer assembly={null} open onClose={() => undefined} />);
        expect(screen.getByTestId("publish-empty")).toBeInTheDocument();
    });

    it("shows a green 'Ready' badge for the figaro-eats reference assembly", () => {
        render(
            <DesignerPublishDrawer
                assembly={FIGARO_EATS_REFERENCE_ASSEMBLY}
                open
                onClose={() => undefined}
            />,
        );
        expect(screen.getByTestId("publish-readiness-ok")).toBeInTheDocument();
        expect(screen.queryByTestId("publish-issues")).not.toBeInTheDocument();
    });

    it("shows issues + blocked badge for an invalid draft", () => {
        render(
            <DesignerPublishDrawer assembly={makeInvalidAssembly()} open onClose={() => undefined} />,
        );
        expect(screen.getByTestId("publish-readiness-blocked")).toBeInTheDocument();
        expect(screen.getByTestId("publish-issues")).toBeInTheDocument();
        // The uppercase slug triggers a kebab-case error.
        expect(screen.getAllByTestId(/^publish-issue-/).length).toBeGreaterThan(0);
    });

    it("populates the JSON textarea with the serialized assembly", () => {
        render(
            <DesignerPublishDrawer
                assembly={FIGARO_EATS_REFERENCE_ASSEMBLY}
                open
                onClose={() => undefined}
            />,
        );
        const textarea = screen.getByTestId("designer-publish-json") as HTMLTextAreaElement;
        const parsed = JSON.parse(textarea.value);
        expect(parsed.identity.slug).toBe("figaro-eats");
    });

    it("closes when the backdrop is clicked", () => {
        const onClose = vi.fn();
        render(
            <DesignerPublishDrawer
                assembly={FIGARO_EATS_REFERENCE_ASSEMBLY}
                open
                onClose={onClose}
            />,
        );
        fireEvent.click(screen.getByTestId("designer-publish-backdrop"));
        expect(onClose).toHaveBeenCalled();
    });

    it("closes when the close button is clicked", () => {
        const onClose = vi.fn();
        render(
            <DesignerPublishDrawer
                assembly={FIGARO_EATS_REFERENCE_ASSEMBLY}
                open
                onClose={onClose}
            />,
        );
        fireEvent.click(screen.getByTestId("designer-publish-close"));
        expect(onClose).toHaveBeenCalled();
    });

    it("triggers a file download with the assembly slug when Download is clicked", () => {
        const createObjectURL = vi.fn().mockReturnValue("blob:mock");
        const revokeObjectURL = vi.fn();
        Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
        Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });

        const clicks: HTMLAnchorElement[] = [];
        const origCreate = document.createElement.bind(document);
        const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
            const el = origCreate(tag);
            if (tag === "a") {
                (el as HTMLAnchorElement).click = () => clicks.push(el as HTMLAnchorElement);
            }
            return el;
        });

        render(
            <DesignerPublishDrawer
                assembly={FIGARO_EATS_REFERENCE_ASSEMBLY}
                open
                onClose={() => undefined}
            />,
        );
        fireEvent.click(screen.getByTestId("designer-publish-download"));

        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(clicks).toHaveLength(1);
        expect(clicks[0].download).toBe("figaro-eats.reference.json");
        expect(clicks[0].href).toBe("blob:mock");
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");

        createElementSpy.mockRestore();
    });

    it("does not render the 'Publish to workspace' button when onPublish is omitted", () => {
        render(
            <DesignerPublishDrawer
                assembly={FIGARO_EATS_REFERENCE_ASSEMBLY}
                open
                onClose={() => undefined}
            />,
        );
        expect(screen.queryByTestId("designer-publish-commit")).not.toBeInTheDocument();
    });

    it("renders 'Publish to workspace' when onPublish is provided", () => {
        render(
            <DesignerPublishDrawer
                assembly={FIGARO_EATS_REFERENCE_ASSEMBLY}
                open
                onClose={() => undefined}
                onPublish={vi.fn()}
            />,
        );
        expect(screen.getByTestId("designer-publish-commit")).toBeInTheDocument();
    });

    it("calls onPublish with the serialized assembly and renders the success panel", async () => {
        const successResult: PublishAssemblyResult = {
            ok: true,
            slug: "figaro-eats",
            assembly: FIGARO_EATS_REFERENCE_ASSEMBLY,
            outputPath: "/repo/lib/shared/assemblies/figaro-eats.reference.json",
            registryPath: "/repo/lib/shared/assembly.ts",
            prototypePath: "/builders/prototype/figaro-eats",
        };
        const onPublish = vi.fn().mockResolvedValue(successResult);
        render(
            <DesignerPublishDrawer
                assembly={FIGARO_EATS_REFERENCE_ASSEMBLY}
                open
                onClose={() => undefined}
                onPublish={onPublish}
            />,
        );
        await act(async () => {
            fireEvent.click(screen.getByTestId("designer-publish-commit"));
        });
        await waitFor(() => {
            expect(screen.getByTestId("publish-commit-success")).toBeInTheDocument();
        });
        expect(onPublish).toHaveBeenCalledTimes(1);
        const sentJson = onPublish.mock.calls[0][0] as string;
        expect(sentJson).toContain('"slug": "figaro-eats"');
        expect(screen.getByTestId("publish-commit-success")).toHaveTextContent(
            "/repo/lib/shared/assemblies/figaro-eats.reference.json",
        );
    });

    it("renders the failure panel with returned issues", async () => {
        const failureResult: PublishAssemblyResult = {
            ok: false,
            issues: [
                { severity: "error", path: "identity.slug", message: "Slug already registered." },
            ],
        };
        const onPublish = vi.fn().mockResolvedValue(failureResult);
        render(
            <DesignerPublishDrawer
                assembly={FIGARO_EATS_REFERENCE_ASSEMBLY}
                open
                onClose={() => undefined}
                onPublish={onPublish}
            />,
        );
        await act(async () => {
            fireEvent.click(screen.getByTestId("designer-publish-commit"));
        });
        await waitFor(() => {
            expect(screen.getByTestId("publish-commit-failure")).toBeInTheDocument();
        });
        expect(screen.getByTestId("publish-commit-failure")).toHaveTextContent(
            "Slug already registered.",
        );
    });

    it("renders a failure panel when onPublish throws", async () => {
        const onPublish = vi.fn().mockRejectedValue(new Error("network down"));
        render(
            <DesignerPublishDrawer
                assembly={FIGARO_EATS_REFERENCE_ASSEMBLY}
                open
                onClose={() => undefined}
                onPublish={onPublish}
            />,
        );
        await act(async () => {
            fireEvent.click(screen.getByTestId("designer-publish-commit"));
        });
        await waitFor(() => {
            expect(screen.getByTestId("publish-commit-failure")).toBeInTheDocument();
        });
        expect(screen.getByTestId("publish-commit-failure")).toHaveTextContent("network down");
    });

    it("disables the Publish button while publishing is in flight", async () => {
        let resolve!: (v: PublishAssemblyResult) => void;
        const onPublish = vi.fn().mockReturnValue(
            new Promise<PublishAssemblyResult>((r) => {
                resolve = r;
            }),
        );
        render(
            <DesignerPublishDrawer
                assembly={FIGARO_EATS_REFERENCE_ASSEMBLY}
                open
                onClose={() => undefined}
                onPublish={onPublish}
            />,
        );
        const btn = screen.getByTestId("designer-publish-commit") as HTMLButtonElement;
        await act(async () => {
            fireEvent.click(btn);
        });
        expect(btn.disabled).toBe(true);
        expect(btn).toHaveTextContent(/Publishing/);
        await act(async () => {
            resolve({ ok: false, issues: [] });
        });
        await waitFor(() => expect(btn.disabled).toBe(false));
    });

    it("copies JSON to clipboard when Copy is clicked", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText },
            configurable: true,
        });
        render(
            <DesignerPublishDrawer
                assembly={FIGARO_EATS_REFERENCE_ASSEMBLY}
                open
                onClose={() => undefined}
            />,
        );
        await act(async () => {
            fireEvent.click(screen.getByTestId("designer-publish-copy"));
        });
        expect(writeText).toHaveBeenCalledTimes(1);
        const value = writeText.mock.calls[0][0] as string;
        expect(value).toContain('"slug": "figaro-eats"');
    });
});
