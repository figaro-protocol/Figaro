/**
 * profileErasure — the supersede/withdraw erasure set.
 *
 * The prior profile CID and every authored artifact the successor
 * no longer references are unpinned; artifacts the successor still
 * references survive; withdraw (no successor) erases everything;
 * a refused unpin rejects, once every candidate has been tried.
 */
import { describe, expect, it, vi } from "vitest";
import { unpinSupersededProfileArtifacts } from "@/lib/registries/profileErasure";
import type { MemberProfileMetadata } from "@/lib/registries/memberProfileMetadata";

function profile(overrides: Partial<MemberProfileMetadata>): MemberProfileMetadata {
    return {
        name: "Meridian Books",
        subjectAddress: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
        ...overrides,
    } as MemberProfileMetadata;
}

describe("unpinSupersededProfileArtifacts", () => {
    it("unpins the prior profile CID and dropped references; keeps surviving ones", async () => {
        const unpin = vi.fn().mockResolvedValue(undefined);
        await unpinSupersededProfileArtifacts({
            ipfs: { unpin },
            priorProfileUri: "ipfs://bafyfixpriorprofile",
            priorProfile: profile({
                catalogURI: "ipfs://bafyfixoldcatalog",
                branding: { logoURI: "ipfs://bafyfixlogo" },
            }),
            nextProfile: profile({
                catalogURI: "ipfs://bafyfixnewcatalog",
                branding: { logoURI: "ipfs://bafyfixlogo" }, // unchanged — survives
            }),
        });

        const unpinned = unpin.mock.calls.map((c) => c[0]);
        expect(unpinned).toContain("bafyfixpriorprofile");
        expect(unpinned).toContain("bafyfixoldcatalog");
        expect(unpinned).not.toContain("bafyfixlogo");
        expect(unpinned).not.toContain("bafyfixnewcatalog");
    });

    it("withdraw (no successor) erases everything the profile referenced", async () => {
        const unpin = vi.fn().mockResolvedValue(undefined);
        await unpinSupersededProfileArtifacts({
            ipfs: { unpin },
            priorProfileUri: "ipfs://bafyfixpriorprofile",
            priorProfile: profile({
                catalogURI: "ipfs://bafyfixcatalog",
                branding: { logoURI: "ipfs://bafyfixlogo" },
                assets: { imageBaseURI: "ipfs://bafyfiximages" },
            }),
            nextProfile: null,
        });

        const unpinned = unpin.mock.calls.map((c) => c[0]);
        expect(new Set(unpinned)).toEqual(
            new Set(["bafyfixpriorprofile", "bafyfixcatalog", "bafyfixlogo", "bafyfiximages"]),
        );
    });

    it("skips non-IPFS references", async () => {
        const unpin = vi.fn().mockResolvedValue(undefined);
        await unpinSupersededProfileArtifacts({
            ipfs: { unpin },
            priorProfileUri: "ipfs://bafyfixpriorprofile",
            priorProfile: profile({
                branding: { logoURI: "https://example.com/logo.png" }, // http — not unpinnable
            }),
            nextProfile: profile({}),
        });

        expect(unpin).toHaveBeenCalledTimes(1); // only the profile CID
        expect(unpin).toHaveBeenCalledWith("bafyfixpriorprofile");
    });

    it("tries every candidate, then rejects with every refusal the service answered", async () => {
        const unpin = vi.fn(async (cid: string) => {
            if (cid !== "bafyfixcatalog") throw new Error(`The pin service refused to unpin ${cid}: 403 Forbidden.`);
        });
        await expect(
            unpinSupersededProfileArtifacts({
                ipfs: { unpin },
                priorProfileUri: "ipfs://bafyfixpriorprofile",
                priorProfile: profile({ catalogURI: "ipfs://bafyfixcatalog", branding: { logoURI: "ipfs://bafyfixlogo" } }),
                nextProfile: null,
            }),
        ).rejects.toThrow(/refused to unpin bafyfixpriorprofile: 403 Forbidden\. .*refused to unpin bafyfixlogo: 403 Forbidden\./);
        expect(new Set(unpin.mock.calls.map((c) => c[0]))).toEqual(new Set(["bafyfixpriorprofile", "bafyfixcatalog", "bafyfixlogo"]));
    });
});
