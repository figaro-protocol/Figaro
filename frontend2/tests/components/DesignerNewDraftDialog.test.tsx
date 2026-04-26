import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DesignerNewDraftDialog } from "@/components/core/designer/DesignerNewDraftDialog";

describe("DesignerNewDraftDialog", () => {
    it("renders nothing when open is false", () => {
        render(
            <DesignerNewDraftDialog
                open={false}
                existingSlugs={[]}
                onCreate={() => undefined}
                onClose={() => undefined}
            />,
        );
        expect(screen.queryByTestId("designer-new-draft-dialog")).not.toBeInTheDocument();
    });

    it("renders the dialog when open is true", () => {
        render(
            <DesignerNewDraftDialog
                open
                existingSlugs={[]}
                onCreate={() => undefined}
                onClose={() => undefined}
            />,
        );
        expect(screen.getByTestId("designer-new-draft-dialog")).toBeInTheDocument();
    });

    it("Create is disabled until both name and slug are filled", () => {
        render(
            <DesignerNewDraftDialog
                open
                existingSlugs={[]}
                onCreate={() => undefined}
                onClose={() => undefined}
            />,
        );
        const create = screen.getByTestId("new-draft-create") as HTMLButtonElement;
        expect(create.disabled).toBe(true);

        fireEvent.change(screen.getByTestId("new-draft-name"), { target: { value: "My Assembly" } });
        expect(create.disabled).toBe(true);

        fireEvent.change(screen.getByTestId("new-draft-slug"), { target: { value: "my-assembly" } });
        expect(create.disabled).toBe(false);
    });

    it("rejects non-kebab-case slugs", () => {
        render(
            <DesignerNewDraftDialog
                open
                existingSlugs={[]}
                onCreate={() => undefined}
                onClose={() => undefined}
            />,
        );
        fireEvent.change(screen.getByTestId("new-draft-name"), { target: { value: "X" } });
        fireEvent.change(screen.getByTestId("new-draft-slug"), { target: { value: "Bad_Slug" } });
        expect(screen.getByTestId("new-draft-error")).toHaveTextContent(/kebab-case/i);
        expect((screen.getByTestId("new-draft-create") as HTMLButtonElement).disabled).toBe(true);
    });

    it("rejects slugs that are already in use", () => {
        render(
            <DesignerNewDraftDialog
                open
                existingSlugs={["figaro-eats"]}
                onCreate={() => undefined}
                onClose={() => undefined}
            />,
        );
        fireEvent.change(screen.getByTestId("new-draft-name"), { target: { value: "Eats" } });
        fireEvent.change(screen.getByTestId("new-draft-slug"), { target: { value: "figaro-eats" } });
        expect(screen.getByTestId("new-draft-error")).toHaveTextContent(/already in use/i);
    });

    it("fires onCreate with slug+name on submit", () => {
        const onCreate = vi.fn();
        render(
            <DesignerNewDraftDialog
                open
                existingSlugs={[]}
                onCreate={onCreate}
                onClose={() => undefined}
            />,
        );
        fireEvent.change(screen.getByTestId("new-draft-name"), { target: { value: "My Assembly" } });
        fireEvent.change(screen.getByTestId("new-draft-slug"), { target: { value: "my-assembly" } });
        fireEvent.click(screen.getByTestId("new-draft-create"));
        expect(onCreate).toHaveBeenCalledWith({ slug: "my-assembly", name: "My Assembly" });
    });

    it("fires onClose when Cancel is clicked", () => {
        const onClose = vi.fn();
        render(
            <DesignerNewDraftDialog
                open
                existingSlugs={[]}
                onCreate={() => undefined}
                onClose={onClose}
            />,
        );
        fireEvent.click(screen.getByTestId("new-draft-cancel"));
        expect(onClose).toHaveBeenCalled();
    });

    it("fires onClose when backdrop is clicked", () => {
        const onClose = vi.fn();
        render(
            <DesignerNewDraftDialog
                open
                existingSlugs={[]}
                onCreate={() => undefined}
                onClose={onClose}
            />,
        );
        fireEvent.click(screen.getByTestId("designer-new-draft-backdrop"));
        expect(onClose).toHaveBeenCalled();
    });
});
