import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PinErasureControl } from "@/components/runtime/PinErasureControl";

/**
 * The erase control reports what the node or pin service did: copies it
 * unpinned read as unpinned; an unpin it refused (a pin-only scoped key
 * answers 403) reads as refused, with the service's answer, and the button
 * stays to try again — never a false "unpinned".
 */

function renderControl(unpinOne: (hash: string) => Promise<unknown>, hashes = ["QmA", "QmB"]) {
    return render(
        <PinErasureControl
            hashes={hashes}
            testidPrefix="erase"
            unpinOne={unpinOne}
            buttonLabel="Unpin"
            erasingLabel="Unpinning…"
            doneLabel="Copies unpinned."
        />,
    );
}

describe("PinErasureControl", () => {
    it("reports done when every unpin succeeds", async () => {
        const unpinOne = vi.fn().mockResolvedValue(undefined);
        renderControl(unpinOne);
        fireEvent.click(screen.getByTestId("erase-button"));
        expect(await screen.findByTestId("erase-done")).toHaveTextContent("Copies unpinned.");
        expect(unpinOne).toHaveBeenCalledTimes(2);
        expect(screen.queryByTestId("erase-refused")).toBeNull();
    });

    it("shows a refused unpin with the service's answer, never as unpinned", async () => {
        const unpinOne = vi.fn(async (hash: string) => {
            if (hash === "QmB") throw new Error("The pin service refused to unpin QmB: 403 Forbidden. The content stays pinned.");
        });
        renderControl(unpinOne);
        fireEvent.click(screen.getByTestId("erase-button"));
        expect(await screen.findByTestId("erase-refused")).toHaveTextContent("refused to unpin QmB: 403 Forbidden");
        expect(screen.queryByTestId("erase-done")).toBeNull();
        expect(screen.getByTestId("erase-button")).toBeEnabled();
    });

    it("renders nothing with no hashes", () => {
        const { container } = renderControl(vi.fn(), []);
        expect(container).toBeEmptyDOMElement();
    });
});
