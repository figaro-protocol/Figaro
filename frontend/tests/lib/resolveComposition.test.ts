import { afterEach, describe, expect, it, vi } from "vitest";
import type { Abi } from "viem";

// getDutchAuction reads the instance address from env (empty in the test env);
// override just that export so we exercise resolution, not env plumbing.
vi.mock("@/lib/composition/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/composition/contracts")>();
    return { ...actual, getDutchAuction: () => "0x00000000000000000000000000000000000000A1" as `0x${string}` };
});

import { resolveComposition, setCompositionAbiFetcher } from "@/lib/composition/resolveComposition";
import { DUTCH_AUCTION_ABI } from "@/lib/composition/abis";

const AUCTION_ADDR = "0x00000000000000000000000000000000000000A1";

const MOCK_ABI: Abi = [
    {
        type: "function",
        name: "createAuction",
        stateMutability: "nonpayable",
        inputs: [{ name: "auctionId", type: "bytes32" }],
        outputs: [],
    },
];

describe("resolveComposition", () => {
    afterEach(() => {
        // Reset to a fetcher that fails loudly, so a leaked injection can't
        // silently pass a later test.
        setCompositionAbiFetcher(async (cid) => {
            throw new Error(`unexpected ABI fetch for ${cid}`);
        });
    });

    it("Level 1: resolves the env address + bundled ABI for a known interface", async () => {
        const r = await resolveComposition("descending-auction");
        expect(r).not.toBeNull();
        expect(r!.address).toBe(AUCTION_ADDR);
        // The bundled Level-1 shape, used when no abiCID is pinned.
        expect(r!.abi).toBe(DUTCH_AUCTION_ABI);
    });

    it("Level 2: a pinned abiCID resolves the ABI from IPFS and overrides the bundled shape", async () => {
        const fetched: string[] = [];
        setCompositionAbiFetcher(async (cid) => {
            fetched.push(cid);
            return MOCK_ABI;
        });
        const r = await resolveComposition("descending-auction", { abiCID: "bafyMOCKcid" });
        expect(fetched).toEqual(["bafyMOCKcid"]); // fetched, not bundled
        expect(r!.address).toBe(AUCTION_ADDR);
        expect(r!.abi).toBe(MOCK_ABI);
        expect(r!.abi).not.toBe(DUTCH_AUCTION_ABI);
    });

    it("returns null for an interface with no resolvable instance", async () => {
        expect(await resolveComposition("no-such-interface")).toBeNull();
    });
});
