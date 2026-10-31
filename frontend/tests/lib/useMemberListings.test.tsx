import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// One client object across renders, as wagmi returns: the hook's effect is keyed on it.
const client = {};
vi.mock("wagmi", () => ({ usePublicClient: () => client, useChainId: () => 31337 }));
vi.mock("@/lib/kernel/contracts", () => ({ CONTRACTS: { membersRegistry: `0x${"11".repeat(20)}` } }));
const assembliesMock = vi.fn();
vi.mock("@/lib/protocol/useAssemblyRegistry", () => ({ usePublishedAssemblies: () => assembliesMock() }));
const activeMembersMock = vi.fn();
vi.mock("@/lib/protocol/membersRegistryIndexer", () => ({ getActiveMembers: () => activeMembersMock() }));
const profileMock = vi.fn();
vi.mock("@/lib/member/profileFetcher", () => ({ fetchMemberProfile: () => profileMock() }));
vi.mock("@/lib/member/memberListing", () => ({
    profileToListing: (_p: unknown, address: string) => ({ address, name: "m", description: "", bindings: [{ assemblyHash: ASM }] }),
}));

import { useMemberListings } from "@/lib/member/useMemberListings";

const ASM = `0x${"aa".repeat(32)}`;
const assemblies = { data: [{ assemblyHash: ASM }], failed: false, error: null };

describe("useMemberListings — a failed registry read is reported as failed, with the RPC's own text, never as resolved-empty", () => {
    beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => undefined); });
    afterEach(() => { vi.clearAllMocks(); });

    it("well-formed: a member with an anchored binding lists, and the read is not failed", async () => {
        assembliesMock.mockReturnValue(assemblies);
        activeMembersMock.mockResolvedValue([{ address: "0xabc", metadataURI: "ipfs://p" }]);
        profileMock.mockResolvedValue({});
        const { result } = renderHook(() => useMemberListings());
        await waitFor(() => expect(result.current.listings).toHaveLength(1));
        expect(result.current.failed).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it("the MembersRegistry read throws: failed, and the error is the provider's message", async () => {
        assembliesMock.mockReturnValue(assemblies);
        activeMembersMock.mockRejectedValue(Object.assign(new Error("wrapped"), { details: "rate limited: 429 Too Many Requests" }));
        const { result } = renderHook(() => useMemberListings());
        await waitFor(() => expect(result.current.failed).toBe(true));
        expect(result.current.error).toBe("rate limited: 429 Too Many Requests");
        expect(result.current.listings).toEqual([]);
        expect(result.current.isLoading).toBe(false);
    });

    it("the AssemblyRegistry read failed: failed with its error — the binding cross-check never rejects every member against an empty set", async () => {
        assembliesMock.mockReturnValue({ data: [], failed: true, error: "block range too large" });
        activeMembersMock.mockResolvedValue([{ address: "0xabc", metadataURI: "ipfs://p" }]);
        profileMock.mockResolvedValue({});
        const { result } = renderHook(() => useMemberListings());
        await waitFor(() => expect(result.current.failed).toBe(true));
        expect(result.current.error).toBe("block range too large");
        expect(result.current.isLoading).toBe(false);
    });

    it("optional: a failed read with no text from the provider is still failed, error null", async () => {
        assembliesMock.mockReturnValue({ data: [], failed: true, error: null });
        const { result } = renderHook(() => useMemberListings());
        await waitFor(() => expect(result.current.failed).toBe(true));
        expect(result.current.error).toBeNull();
    });
});
