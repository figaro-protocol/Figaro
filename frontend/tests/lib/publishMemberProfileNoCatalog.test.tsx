/**
 * usePublishMemberProfile — a member need not sell anything. A member with no
 * catalog item publishes its profile with no catalog: nothing is pinned for a
 * catalog, the profile carries no `catalogURI`, and the registry is written.
 *
 * The registry write: a wallet not yet registered sends `register(profileURI)`
 * with the registry's stake; a registered one sends `updateProfile(profileURI)`
 * with no value — each simulated before it is sent and held to its receipt.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const w = vi.hoisted(() => {
    process.env.NEXT_PUBLIC_MEMBERS_REGISTRY = "0x00000000000000000000000000000000000e3b01";
    return {
        wallet: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as `0x${string}`,
        client: {} as Record<string, unknown>,
        write: undefined as unknown as ReturnType<typeof vi.fn>,
        catalogPins: [] as unknown[],
        profilePins: [] as Record<string, unknown>[],
        registered: false,
    };
});

vi.mock("wagmi", () => ({
    usePublicClient: () => w.client,
    useWriteContract: () => ({ writeContractAsync: w.write, data: undefined, isPending: false, error: null }),
    useWaitForTransactionReceipt: () => ({ isLoading: false, isSuccess: false, data: undefined }),
}));
vi.mock("@/lib/member/catalogPublisher", () => ({
    publishMemberCatalog: async (catalog: unknown) => {
        w.catalogPins.push(catalog);
        return { uri: "ipfs://bafycatalog" };
    },
}));
vi.mock("@/lib/shared/ipfsService", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/shared/ipfsService")>()),
    DEFAULT_IPFS_SERVICE: {
        publishJSON: async (doc: Record<string, unknown>) => {
            w.profilePins.push(doc);
            return { uri: "ipfs://bafyprofile" };
        },
    },
}));

import { usePublishMemberProfile } from "@/lib/member/usePublishMemberProfile";

beforeEach(() => {
    w.catalogPins = [];
    w.profilePins = [];
    w.registered = false;
    w.client = {
        readContract: vi.fn(async ({ functionName }: { functionName: string }) =>
            functionName === "registered" ? w.registered : 10n ** 16n),
        simulateContract: vi.fn(async () => ({ request: {} })),
        waitForTransactionReceipt: vi.fn(async () => ({ status: "success" })),
    };
    w.write = vi.fn(async () => `0x${"77".repeat(32)}`);
});

describe("usePublishMemberProfile — a member with no catalog item", () => {
    it("publishes the profile with no catalog and registers it", async () => {
        const { result } = renderHook(() => usePublishMemberProfile());
        let outcome: Awaited<ReturnType<typeof result.current.publish>> | undefined;
        await act(async () => {
            outcome = await result.current.publish({
                profileMetadata: { subjectAddress: w.wallet, name: "Buyer-only member" },
                items: [],
                wallet: w.wallet,
            });
        });
        expect(w.catalogPins).toHaveLength(0);
        expect(w.profilePins).toHaveLength(1);
        expect(w.profilePins[0]).not.toHaveProperty("catalogURI");
        expect(w.write).toHaveBeenCalledWith(expect.objectContaining({ functionName: "register", args: ["ipfs://bafyprofile"] }));
        expect(outcome).toMatchObject({ profileURI: "ipfs://bafyprofile" });
        expect(outcome?.catalogURI).toBeUndefined();
    });

    it("a member with items still pins its catalog and links it", async () => {
        const { result } = renderHook(() => usePublishMemberProfile());
        await act(async () => {
            await result.current.publish({
                profileMetadata: { subjectAddress: w.wallet, name: "Seller" },
                items: [{ id: "i", name: "Item", description: "", price: "1", available: true }],
                wallet: w.wallet,
            });
        });
        expect(w.catalogPins).toHaveLength(1);
        expect(w.profilePins[0]).toMatchObject({ catalogURI: "ipfs://bafycatalog" });
    });
});

describe("usePublishMemberProfile — the registry write", () => {
    async function publish() {
        const { result } = renderHook(() => usePublishMemberProfile());
        await act(async () => {
            await result.current.publish({ profileMetadata: { subjectAddress: w.wallet, name: "Member" }, items: [], wallet: w.wallet });
        });
    }
    const sent = () => w.write.mock.calls.map(([c]) => ({ address: c.address, functionName: c.functionName, args: c.args, value: c.value }));
    const simulated = () => (w.client.simulateContract as ReturnType<typeof vi.fn>).mock.calls.map(([c]) => ({ address: c.address, functionName: c.functionName, args: c.args, value: c.value }));
    const REGISTRY = "0x00000000000000000000000000000000000e3b01";

    it("a wallet not yet registered sends register(profileURI) with the registry's stake, simulated first and held to its receipt", async () => {
        await publish();
        expect(sent()).toEqual([{ address: REGISTRY, functionName: "register", args: ["ipfs://bafyprofile"], value: 10n ** 16n }]);
        expect(simulated()).toEqual(sent());
        expect(w.client.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: `0x${"77".repeat(32)}` });
    });

    it("a registered wallet sends updateProfile(profileURI) with no value", async () => {
        w.registered = true;
        await publish();
        expect(sent()).toEqual([{ address: REGISTRY, functionName: "updateProfile", args: ["ipfs://bafyprofile"], value: undefined }]);
        expect(simulated()).toEqual(sent());
    });
});
