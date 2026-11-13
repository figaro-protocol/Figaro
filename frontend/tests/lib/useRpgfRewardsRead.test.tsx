/**
 * useRpgfRewards — the periods and the member gate are ONE network read in
 * the one read primitive: `present` with what the chain said, `absent` when a
 * read failed (never an empty period list a surface could take for "no
 * periods"), `pending` while in flight. RewardsView renders nothing on absent.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, screen, waitFor } from "@testing-library/react";

const w = vi.hoisted(() => {
    process.env.NEXT_PUBLIC_CLAUSE_REGISTRY = "0x00000000000000000000000000000000000c1a01";
    process.env.NEXT_PUBLIC_MEMBERS_REGISTRY = "0x00000000000000000000000000000000000e3b01";
    process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY = "0x00000000000000000000000000000000000a5501";
    return {
        address: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as `0x${string}`,
        key: `0x${"ab".repeat(32)}` as `0x${string}`,
        key2: `0x${"cd".repeat(32)}` as `0x${string}`,
        fail: false,
        /** Two accruing keys in place of one. */
        twoKeys: false,
        /** The keys `claimed(period, kind, key)` answers true for. */
        claimedKeys: new Set<string>(),
        /** A per-key `claimed` read throws. */
        failClaimed: false,
        client: {} as Record<string, unknown>,
    };
});

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: w.address, isConnected: true }),
    usePublicClient: () => w.client,
    useWriteContract: () => ({ writeContractAsync: vi.fn() }),
    useChainId: () => 31337,
}));
vi.mock("@/lib/composition/contracts", () => ({
    getRpgfMinter: () => "0x00000000000000000000000000000000000f1001",
    getUsageCounter: () => "0x00000000000000000000000000000000000c0c01",
}));
vi.mock("@/lib/kernel/eventCache", () => ({
    cachedGetContractEvents: async (_client: unknown, _chainId: number, { eventName }: { eventName: string }) => {
        const keys = w.twoKeys ? [w.key, w.key2] : [w.key];
        if (eventName === "ClauseRegistered") return keys.map((k) => ({ args: { registeredBy: w.address, clauseKey: k } }));
        if (eventName === "UsageRecorded") return keys.map((k) => ({ args: { kind: 0, clauseOrAssembly: k, period: 0 } }));
        return [];
    },
}));
vi.mock("@/lib/shared/viewedWallet", () => ({ useViewedWallet: (connected: unknown) => connected }));
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 18 }) }));
vi.mock("@/hooks/useTokenBalance", () => ({ default: () => ({ read: { status: "pending" }, refetch: () => undefined }) }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, version: 0 }) }));

const READS: Record<string, unknown> = {
    periodCount: 1n,
    periodAmount: 1000n,
    minted: 0n,
    periodClosed: true,
    totalScoreIn: 10n,
    claimed: false,
    claimable: 5n,
    accrualOf: [1n, 1n],
    scoreOf: 10n,
    registered: true,
    balanceOf: 0n,
};

beforeEach(() => {
    w.twoKeys = false;
    w.claimedKeys = new Set();
    w.failClaimed = false;
    w.client = {
        readContract: vi.fn(async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
            if (w.fail && functionName === "totalScoreIn") throw new Error("HTTP request failed");
            if (functionName === "claimed") {
                if (w.failClaimed) throw new Error("HTTP request failed");
                return w.claimedKeys.has(String(args?.[2]));
            }
            return READS[functionName];
        }),
    };
});

import { useRpgfRewards } from "@/lib/composition/useRpgfRewards";
import { RewardsView } from "@/app/(app)/rewards/_components/RewardsView";

describe("useRpgfRewards — one NetworkRead", () => {
    it("a read the chain answers is present, with the periods and the member gate", async () => {
        w.fail = false;
        const { result } = renderHook(() => useRpgfRewards());
        await waitFor(() => expect(result.current.read.status).toBe("present"));
        const read = result.current.read;
        if (read.status !== "present") throw new Error("unreachable");
        expect(read.value.periods.map((p) => p.periodId)).toEqual([0]);
        expect(read.value.periods[0].myScore).toBe(10n);
        expect(read.value.memberLive).toBe(true);
    });

    it("reads claimed per key, and a period is claimed once every accruing key is", async () => {
        w.fail = false;
        const { result } = renderHook(() => useRpgfRewards());
        await waitFor(() => expect(result.current.read.status).toBe("present"));
        expect(w.client.readContract as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
            expect.objectContaining({ functionName: "claimed", args: [0, 0, w.key] }),
        );
        const read = result.current.read;
        if (read.status !== "present") throw new Error("unreachable");
        expect(read.value.periods[0].accruals[0].claimed).toBe(false);
        expect(read.value.periods[0].claimed).toBe(false);
    });

    it("a failed read is absent — never an empty period list", async () => {
        w.fail = true;
        const { result } = renderHook(() => useRpgfRewards());
        await waitFor(() => expect(result.current.read.status).toBe("absent"));
        expect(result.current).not.toHaveProperty("periods");
    });
});

describe("RewardsView — renders on the read's state", () => {
    it("absent: no loading line, no 'no periods' sentence, no period card", async () => {
        w.fail = true;
        render(<RewardsView />);
        await waitFor(() => expect((w.client.readContract as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
            expect.objectContaining({ functionName: "totalScoreIn" }),
        ));
        await waitFor(() => expect(screen.queryByTestId("rewards-loading")).toBeNull());
        expect(screen.queryByTestId("rewards-no-periods")).toBeNull();
        expect(screen.queryByTestId("period-card-0")).toBeNull();
    });

    it("present: the period card", async () => {
        w.fail = false;
        render(<RewardsView />);
        expect(await screen.findByTestId("period-card-0")).toBeInTheDocument();
        expect(screen.getByTestId("period-claimable-0")).toBeInTheDocument();
    });

    it("some keys claimed and others not: the period is claimable, with the unclaimed share", async () => {
        w.fail = false;
        w.twoKeys = true;
        w.claimedKeys = new Set([w.key]);
        render(<RewardsView />);
        expect(await screen.findByTestId("period-card-0")).toBeInTheDocument();
        expect(screen.getByTestId("period-claimable-0")).toBeInTheDocument();
        expect(screen.queryByTestId("period-claimed-0")).toBeNull();
    });

    it("every key claimed: the period shows claimed and no claimable figure", async () => {
        w.fail = false;
        w.twoKeys = true;
        w.claimedKeys = new Set([w.key, w.key2]);
        render(<RewardsView />);
        expect(await screen.findByTestId("period-claimed-0")).toBeInTheDocument();
        expect(screen.queryByTestId("period-claimable-0")).toBeNull();
    });

    it("a failed per-key claimed read leaves the place empty", async () => {
        w.fail = false;
        w.failClaimed = true;
        render(<RewardsView />);
        await waitFor(() => expect((w.client.readContract as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
            expect.objectContaining({ functionName: "claimed" }),
        ));
        await waitFor(() => expect(screen.queryByTestId("rewards-loading")).toBeNull());
        expect(screen.queryByTestId("period-card-0")).toBeNull();
        expect(screen.queryByTestId("period-claimed-0")).toBeNull();
    });
});
