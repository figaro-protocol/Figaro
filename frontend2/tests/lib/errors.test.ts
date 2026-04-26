import { describe, expect, it } from "vitest";

import { extractErrorMessage } from "@/lib/shared/errors";

describe("extractErrorMessage", () => {
    it("prefers shortMessage when available", () => {
        expect(extractErrorMessage({ shortMessage: "short", message: "long" }, "fallback")).toBe("short");
    });

    it("uses Error.message before falling back", () => {
        expect(extractErrorMessage(new Error("boom"), "fallback")).toBe("boom");
        expect(extractErrorMessage(undefined, "fallback")).toBe("fallback");
    });

    it("truncates messages when maxLength is provided", () => {
        expect(extractErrorMessage({ message: "abcdefghij" }, "fallback", { maxLength: 5 })).toBe("abcde");
    });
});