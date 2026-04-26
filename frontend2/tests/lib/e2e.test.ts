import { afterEach, describe, expect, it } from "vitest";

import {
    getE2EModeFromSearchParams,
    getE2EModeSession,
    isE2EDevnetSession,
    isE2EMockSession,
} from "@/lib/shared/e2e";

describe("shared e2e helpers", () => {
    const originalHref = window.location.href;

    afterEach(() => {
        window.history.replaceState({}, "", originalHref);
    });

    it("parses known modes from search params", () => {
        expect(getE2EModeFromSearchParams("?e2e=mock")).toBe("mock");
        expect(getE2EModeFromSearchParams("?e2e=devnet")).toBe("devnet");
        expect(getE2EModeFromSearchParams("?foo=bar")).toBeNull();
    });

    it("reads mock and devnet modes from the browser session", () => {
        window.history.replaceState({}, "", "/workbench?e2e=mock");
        expect(getE2EModeSession()).toBe("mock");
        expect(isE2EMockSession()).toBe(true);
        expect(isE2EDevnetSession()).toBe(false);

        window.history.replaceState({}, "", "/workbench?e2e=devnet");
        expect(getE2EModeSession()).toBe("devnet");
        expect(isE2EMockSession()).toBe(false);
        expect(isE2EDevnetSession()).toBe(true);
    });
});