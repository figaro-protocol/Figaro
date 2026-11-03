import { afterEach, describe, expect, it, vi } from "vitest";
import { generateSalt } from "../src/commitments";

describe("generateSalt", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("returns 32 random bytes from Web Crypto", () => {
        const a = generateSalt();
        const b = generateSalt();
        expect(a).not.toBe(b);
        expect(a < 2n ** 256n).toBe(true);
    });

    it("throws when Web Crypto is absent, never a guessable salt", () => {
        vi.stubGlobal("crypto", undefined);
        const random = vi.spyOn(Math, "random");
        expect(() => generateSalt()).toThrow();
        expect(random).not.toHaveBeenCalled();
    });
});
