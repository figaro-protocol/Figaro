import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// One client object across renders, as wagmi returns: the hook's effect is keyed on it.
const client = {};
vi.mock("wagmi", () => ({ usePublicClient: () => client, useChainId: () => 31337 }));
vi.mock("@/lib/core/contracts", () => ({ CONTRACTS: { membersRegistry: `0x${"11".repeat(20)}` } }));
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
const assemblies = { read: { status: "present", value: [{ assemblyHash: ASM }] } };

describe("useMemberListings — a failed registry read is absent, never resolved-empty and never error text", () => {
    beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => undefined); });
    afterEach(() => { vi.clearAllMocks(); });

    it("well-formed: a member with an anchored binding lists", async () => {
        assembliesMock.mockReturnValue(assemblies);
        activeMembersMock.mockResolvedValue([{ address: "0xabc", metadataURI: "ipfs://p" }]);
        profileMock.mockResolvedValue({});
        const { result } = renderHook(() => useMemberListings());
        await waitFor(() => expect(result.current.read.status).toBe("present"));
        const r = result.current.read;
        expect(r.status === "present" && r.value).toHaveLength(1);
    });

    it("the MembersRegistry read throws: absent", async () => {
        assembliesMock.mockReturnValue(assemblies);
        activeMembersMock.mockRejectedValue(new Error("rate limited: 429 Too Many Requests"));
        const { result } = renderHook(() => useMemberListings());
        await waitFor(() => expect(result.current.read.status).toBe("absent"));
        expect(result.current.read).toEqual({ status: "absent" });
    });

    it("the AssemblyRegistry read failed: absent — the binding cross-check never rejects every member against an empty set", async () => {
        assembliesMock.mockReturnValue({ read: { status: "absent" } });
        activeMembersMock.mockResolvedValue([{ address: "0xabc", metadataURI: "ipfs://p" }]);
        profileMock.mockResolvedValue({});
        const { result } = renderHook(() => useMemberListings());
        await waitFor(() => expect(result.current.read.status).toBe("absent"));
        expect(activeMembersMock).not.toHaveBeenCalled();
    });
});
