/**
 * userEndpoints — the analyst token is stored beside the analyst endpoint, in
 * this browser only, and only a header-safe token survives the round trip.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readUserEndpoints, writeUserEndpoints } from "@/lib/shared/userEndpoints";

describe("userEndpoints — the analyst token", () => {
    beforeEach(() => window.localStorage.clear());

    it("round-trips beside the analyst endpoint, trimmed", () => {
        writeUserEndpoints({ analystUrl: "https://analyst.example.com/", analystToken: "  run-token-1\n" });
        expect(readUserEndpoints()).toMatchObject({
            analystUrl: "https://analyst.example.com",
            analystToken: "run-token-1",
        });
    });

    it("drops a token that could not stand in a request header", () => {
        for (const bad of ["two words", "tab\there", "non-ascii-é", "", "   "]) {
            writeUserEndpoints({ analystUrl: "https://analyst.example.com", analystToken: bad });
            expect(readUserEndpoints().analystToken).toBeUndefined();
        }
    });

    it("an unset token reads as absent", () => {
        writeUserEndpoints({ analystUrl: "https://analyst.example.com" });
        expect(readUserEndpoints().analystToken).toBeUndefined();
    });
});
