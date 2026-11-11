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

describe("userEndpoints — the RPC endpoint is one per chain", () => {
    beforeEach(() => window.localStorage.clear());

    it("an endpoint set on one chain is not read on another", () => {
        writeUserEndpoints({ rpcUrl: "https://sepolia.example.com" }, 11155111);
        expect(readUserEndpoints(11155111).rpcUrl).toBe("https://sepolia.example.com");
        expect(readUserEndpoints(1).rpcUrl).toBeUndefined();
    });

    it("setting one chain's endpoint keeps another's, and clearing it clears that chain's only", () => {
        writeUserEndpoints({ rpcUrl: "https://sepolia.example.com" }, 11155111);
        writeUserEndpoints({ rpcUrl: "https://mainnet.example.com" }, 1);
        expect(readUserEndpoints(11155111).rpcUrl).toBe("https://sepolia.example.com");
        expect(readUserEndpoints(1).rpcUrl).toBe("https://mainnet.example.com");
        writeUserEndpoints({}, 1);
        expect(readUserEndpoints(1).rpcUrl).toBeUndefined();
        expect(readUserEndpoints(11155111).rpcUrl).toBe("https://sepolia.example.com");
    });

    it("an endpoint stored before endpoints were kept per chain names no chain, and is not read", () => {
        window.localStorage.setItem("figaro.user-endpoints", JSON.stringify({ rpcUrl: "https://old.example.com" }));
        expect(readUserEndpoints(11155111).rpcUrl).toBeUndefined();
    });

    it("the other endpoints are the reader's on every chain", () => {
        writeUserEndpoints({ ipfsGatewayUrl: "https://gateway.example.com", rpcUrl: "https://sepolia.example.com" }, 11155111);
        expect(readUserEndpoints(1).ipfsGatewayUrl).toBe("https://gateway.example.com");
    });
});
