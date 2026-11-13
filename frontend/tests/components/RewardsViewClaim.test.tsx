/**
 * RewardsView — the florin claim path at /rewards. A closed, unclaimed period
 * with a claimable share offers "Claim my share", which claims that period
 * (`useRpgfRewards.claim(periodId)`, whose write `contractWriteSites.test.tsx`
 * pins) and stands at "Claiming…" while the claim is in flight; a refused
 * claim shows its reason. The claim is held while nothing is claimable or the
 * wallet holds no live member stake (the minter's gate), and the page says
 * why for the latter. A claimed period offers no claim.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { RpgfPeriodState } from "@/lib/composition/useRpgfRewards";

const WALLET = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;
const CLAUSE = `0x${"ab".repeat(32)}` as const;

const m = vi.hoisted(() => ({
    rewards: undefined as unknown,
    claim: (async () => undefined) as (periodId: number) => Promise<unknown>,
}));
vi.mock("wagmi", () => ({ useAccount: () => ({ address: WALLET }) }));
vi.mock("@/lib/shared/viewedWallet", () => ({ useViewedWallet: (connected: unknown) => connected }));
vi.mock("@/lib/composition/useRpgfRewards", () => ({ useRpgfRewards: () => m.rewards }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true }) }));
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 18, ready: true, loading: false }) }));
vi.mock("@/hooks/useTokenBalance", () => ({ default: () => ({ read: { status: "present", value: 0n }, refetch: () => {} }) }));

import { RewardsView } from "@/app/(app)/rewards/_components/RewardsView";

function period(overrides: Partial<RpgfPeriodState> = {}): RpgfPeriodState {
    return {
        periodId: 3, amount: 1000n, minted: 0n, periodClosed: true, totalScore: 10n,
        accruals: [{ clauseOrAssembly: CLAUSE, kind: 0, label: "clause 0xabab", family: "clause", c: 1n, d: 1n, score: 3n, claimed: false }],
        myScore: 3n, claimable: 5n * 10n ** 18n, claimed: false,
        ...overrides,
    };
}

function showing(periods: RpgfPeriodState[], memberLive: boolean | null = true) {
    m.rewards = {
        available: true, account: WALLET,
        read: { status: "present", value: { periods, memberLive } },
        claim: (periodId: number) => m.claim(periodId),
        refresh: () => {},
    };
}

beforeEach(() => {
    m.claim = vi.fn(async () => `0x${"77".repeat(32)}`);
    showing([period()]);
});

describe("RewardsView — the claim", () => {
    it("claims the closed period's share by its id, and shows Claiming… while the claim is in flight", async () => {
        let settle: (v: unknown) => void = () => {};
        m.claim = vi.fn(() => new Promise((r) => { settle = r; }));
        render(<RewardsView />);
        expect(screen.getByTestId("period-claimable-3").textContent).toBe("Claimable: 5 FLORIN");
        fireEvent.click(screen.getByTestId("claim-3"));
        expect(m.claim).toHaveBeenCalledWith(3);
        expect(screen.getByTestId("claim-3").textContent).toBe("Claiming…");
        expect((screen.getByTestId("claim-3") as HTMLButtonElement).disabled).toBe(true);
        await act(async () => { settle(`0x${"77".repeat(32)}`); });
        expect(screen.getByTestId("claim-3").textContent).toBe("Claim my share");
        expect(screen.queryByTestId("rewards-error")).toBeNull();
    });

    it("a refused claim shows its reason", async () => {
        m.claim = vi.fn(async () => { throw new Error("NothingToClaim"); });
        render(<RewardsView />);
        await act(async () => { fireEvent.click(screen.getByTestId("claim-3")); });
        expect(screen.getByTestId("rewards-error").textContent).toBe("NothingToClaim");
    });

    it("holds the claim while nothing is claimable", () => {
        showing([period({ claimable: 0n })]);
        render(<RewardsView />);
        expect((screen.getByTestId("claim-3") as HTMLButtonElement).disabled).toBe(true);
    });

    it("holds the claim, and says why, while the wallet holds no live member stake", () => {
        showing([period()], false);
        render(<RewardsView />);
        expect((screen.getByTestId("claim-3") as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByTestId("member-stake-note-3").textContent).toMatch(/A claim needs a live member stake/);
    });

    it("offers no claim for a claimed period, nor for one still accruing", () => {
        showing([period({ claimed: true, claimable: 0n }), period({ periodId: 4, periodClosed: false })]);
        render(<RewardsView />);
        expect(screen.queryByTestId("claim-3")).toBeNull();
        expect(screen.getByTestId("period-claimed-3")).toBeTruthy();
        expect(screen.queryByTestId("claim-4")).toBeNull();
    });
});
