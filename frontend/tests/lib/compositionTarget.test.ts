import { describe, expect, it, vi } from "vitest";

// getDutchAuction reads the instance address from env (empty in the test env);
// override just that export so we exercise resolution, not env plumbing.
vi.mock("@/lib/composition/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/composition/contracts")>();
    return { ...actual, getDutchAuction: () => "0x00000000000000000000000000000000000000A1" as `0x${string}` };
});

import { compositionTarget } from "@/lib/composition/compositionTarget";
import { DUTCH_AUCTION_ABI } from "@/lib/composition/abis";

const AUCTION_ADDR = "0x00000000000000000000000000000000000000A1";

describe("compositionTarget", () => {
    it("resolves the env address + the standard ABI for a known interface", () => {
        const t = compositionTarget("descending-auction");
        expect(t).not.toBeNull();
        expect(t!.address).toBe(AUCTION_ADDR);
        expect(t!.abi).toBe(DUTCH_AUCTION_ABI);
    });

    it("returns null for an interface with no registered handler", () => {
        expect(compositionTarget("no-such-interface")).toBeNull();
    });
});
