/**
 * profileErasure — the supersede/withdraw erasure set.
 *
 * The prior profile CID and every authored artifact the successor no longer
 * references are unpinned; artifacts the successor still references survive;
 * withdraw (no successor) erases everything; unpin failures never throw.
 */
import { describe, expect, it, vi } from "vitest";
import { unpinSupersededProfileArtifacts } from "@/lib/seller/profileErasure";
import type { MemberProfileMetadata } from "@/lib/seller/memberProfileMetadata";

function profile(overrides: Partial<MemberProfileMetadata>): MemberProfileMetadata {
    return {
        name: "Rosa's Kitchen",
        subjectAddress: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
        ...overrides,
    } as MemberProfileMetadata;
}

describe("unpinSupersededProfileArtifacts", () => {
    it("unpins the prior profile CID and dropped references; keeps surviving ones", async () => {
        const unpin = vi.fn().mockResolvedValue(undefined);
        await unpinSupersededProfileArtifacts({
            ipfs: { unpin },
            priorProfileUri: "ipfs://QmPriorProfile",
            priorProfile: profile({
                catalogueURI: "ipfs://QmOldCatalogue",
                branding: { logoURI: "ipfs://QmLogo" },
            }),
            nextProfile: profile({
                catalogueURI: "ipfs://QmNewCatalogue",
                branding: { logoURI: "ipfs://QmLogo" }, // unchanged — survives
            }),
        });

        const unpinned = unpin.mock.calls.map((c) => c[0]);
        expect(unpinned).toContain("QmPriorProfile");
        expect(unpinned).toContain("QmOldCatalogue");
        expect(unpinned).not.toContain("QmLogo");
        expect(unpinned).not.toContain("QmNewCatalogue");
    });

    it("withdraw (no successor) erases everything the profile referenced", async () => {
        const unpin = vi.fn().mockResolvedValue(undefined);
        await unpinSupersededProfileArtifacts({
            ipfs: { unpin },
            priorProfileUri: "ipfs://QmPriorProfile",
            priorProfile: profile({
                catalogueURI: "ipfs://QmCatalogue",
                branding: { logoURI: "ipfs://QmLogo" },
                assets: { imageBaseURI: "ipfs://QmImages" },
            }),
            nextProfile: null,
        });

        const unpinned = unpin.mock.calls.map((c) => c[0]);
        expect(new Set(unpinned)).toEqual(
            new Set(["QmPriorProfile", "QmCatalogue", "QmLogo", "QmImages"]),
        );
    });

    it("skips non-IPFS references and never throws on unpin failure", async () => {
        const unpin = vi.fn().mockRejectedValue(new Error("node down"));
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        await expect(
            unpinSupersededProfileArtifacts({
                ipfs: { unpin },
                priorProfileUri: "ipfs://QmPriorProfile",
                priorProfile: profile({
                    branding: { logoURI: "https://example.com/logo.png" }, // http — not unpinnable
                }),
                nextProfile: profile({}),
            }),
        ).resolves.toBeUndefined();

        expect(unpin).toHaveBeenCalledTimes(1); // only the profile CID
        expect(unpin).toHaveBeenCalledWith("QmPriorProfile");
        warn.mockRestore();
    });
});
