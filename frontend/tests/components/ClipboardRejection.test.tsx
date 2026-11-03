/**
 * A clipboard write the browser refuses (permission denied, document not
 * focused, no Clipboard API) is handled: no unhandled rejection, and the
 * surface never claims "Copied" for a copy that did not happen.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import GlobalError from "@/app/global-error";
import { copyToClipboard } from "@/lib/shared/clipboard";

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => { unhandled.push(reason); };

function stubClipboard(writeText: (text: string) => Promise<void>) {
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

describe("a refused clipboard write", () => {
    beforeEach(() => {
        unhandled.length = 0;
        process.on("unhandledRejection", onUnhandled);
    });
    afterEach(() => {
        process.off("unhandledRejection", onUnhandled);
        Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    });

    it("copyToClipboard resolves true on a write and false on a refusal or a missing API", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        stubClipboard(writeText);
        await expect(copyToClipboard("a")).resolves.toBe(true);
        expect(writeText).toHaveBeenCalledWith("a");

        stubClipboard(() => Promise.reject(new DOMException("Document is not focused.", "NotAllowedError")));
        await expect(copyToClipboard("b")).resolves.toBe(false);

        Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
        await expect(copyToClipboard("c")).resolves.toBe(false);
    });

    it("the global error page handles the rejection and never shows Copied", async () => {
        stubClipboard(() => Promise.reject(new DOMException("Document is not focused.", "NotAllowedError")));
        render(<GlobalError error={new Error("boom")} reset={() => {}} />);
        await act(async () => {
            fireEvent.click(screen.getByText("Copy Error Details"));
            await new Promise((r) => setTimeout(r, 20));
        });
        expect(unhandled).toEqual([]);
        expect(screen.queryByText("Copied")).toBeNull();
    });
});
