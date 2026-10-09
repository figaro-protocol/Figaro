/**
 * useAgentServices reads a member's metadata document IPFS-only, like every
 * other member read: an http(s) metadataURI reads as a human participant and
 * no request leaves for the host the member chose; an ipfs:// one is read
 * through the viewer's gateway.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const fetchCappedContentMock = vi.hoisted(() => vi.fn());
const captured = vi.hoisted(() => ({ fetcher: undefined as undefined | ((uri: string) => Promise<unknown>) }));

vi.mock("@/lib/member/useAsyncMemberResource", () => ({
    useAsyncMemberResource: (_address: unknown, options: { fetcher: (uri: string) => Promise<unknown> }) => {
        captured.fetcher = options.fetcher;
        return { data: null, isLoading: false, error: null, refetch: () => {} };
    },
}));
vi.mock("@/lib/shared/ipfsService", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/shared/ipfsService")>()),
    fetchCappedContent: fetchCappedContentMock,
}));

import { useAgentServices } from "@/lib/member/useMembersRegistry";

const MEMBER = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;
const CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";

describe("useAgentServices — the metadata document is read IPFS-only", () => {
    beforeEach(() => {
        fetchCappedContentMock.mockReset();
        fetchCappedContentMock.mockResolvedValue({ ok: true, text: async () => JSON.stringify({ services: {} }) });
        renderHook(() => useAgentServices(MEMBER));
    });

    it("reads an http(s) metadataURI as absent, with no request to the member-chosen host", async () => {
        const result = await captured.fetcher!("https://tracker.example/agent.json");
        expect(result).toMatchObject({ reachable: false });
        expect(fetchCappedContentMock).not.toHaveBeenCalled();
    });

    it("reads an ipfs:// metadataURI through the viewer's gateway", async () => {
        await captured.fetcher!(`ipfs://${CID}`);
        expect(fetchCappedContentMock).toHaveBeenCalledOnce();
        expect(String(fetchCappedContentMock.mock.calls[0][0])).toMatch(new RegExp(`/ipfs/${CID}$`));
    });
});
