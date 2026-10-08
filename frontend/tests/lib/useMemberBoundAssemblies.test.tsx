/**
 * useMemberBoundAssemblies — the member's profile is read IPFS-only, through
 * `uriFetcher`'s seam: an http(s) metadataURI reads as absent and no request
 * leaves for the host the member chose; an ipfs:// one is read through the
 * viewer's gateway and its bindings matched against the registry.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const SELLER = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;
const memberProfile = vi.hoisted(() => ({ uri: "" }));
const fetchCappedContentMock = vi.hoisted(() => vi.fn());
// Stable references: the hook's effect keys on the registry reads' identity.
const reads = vi.hoisted(() => ({
    published: {
        data: [{ slug: "asm-anchored", contentURI: "ipfs://QmTemplate", compositionHash: "0x01" }],
        isLoading: false,
    },
    profile: { data: [""] as [string], isLoading: false },
}));

vi.mock("@/lib/member/useMembersRegistry", () => ({
    useMemberProfile: () => {
        if (reads.profile.data[0] !== memberProfile.uri) reads.profile = { data: [memberProfile.uri], isLoading: false };
        return reads.profile;
    },
}));
vi.mock("@/lib/protocol/useAssemblyRegistry", () => ({
    useAllPublishedAssemblies: () => reads.published,
    fetchAssemblyTemplate: async () => ({ name: "Anchored", agreements: [] }),
}));
vi.mock("@/lib/shared/ipfsService", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/shared/ipfsService")>()),
    fetchCappedContent: (...args: unknown[]) => fetchCappedContentMock(...args),
}));

import { useMemberBoundAssemblies } from "@/lib/member/useMemberBoundAssemblies";

const PROFILE = {
    name: "Seller",
    assemblyBindings: [{ bindingId: "b1", subjectAddress: SELLER, assemblySlug: "asm-anchored", counterpartyBindings: [] }],
};

describe("useMemberBoundAssemblies", () => {
    beforeEach(() => {
        fetchCappedContentMock.mockReset();
        fetchCappedContentMock.mockResolvedValue({ ok: true, text: async () => JSON.stringify(PROFILE) });
    });

    it("reads an http(s) metadataURI as absent and sends no request", async () => {
        memberProfile.uri = "https://member-chosen.example/profile.json";
        const { result } = renderHook(() => useMemberBoundAssemblies(SELLER));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current).toEqual({ assemblies: [], isLoading: false, hasOnChainBinding: false });
        expect(fetchCappedContentMock).not.toHaveBeenCalled();
    });

    it("reads an ipfs:// metadataURI through the gateway and matches its bindings", async () => {
        memberProfile.uri = "ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
        const { result } = renderHook(() => useMemberBoundAssemblies(SELLER));
        await waitFor(() => expect(result.current.hasOnChainBinding).toBe(true));
        expect(fetchCappedContentMock).toHaveBeenCalledTimes(1);
        expect(String(fetchCappedContentMock.mock.calls[0][0])).toMatch(/\/ipfs\/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG$/);
        expect(result.current.assemblies.map((a) => a.slug)).toEqual(["asm-anchored"]);
    });
});
