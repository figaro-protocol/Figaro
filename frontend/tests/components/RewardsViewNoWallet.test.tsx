/**
 * `/rewards` with no wallet. The periods are public: `useRpgfRewards` reads
 * `periodCount`, each period's budget, minted figure, closed flag and total
 * score whatever the address, so each period shows with no address at all.
 * One address's part (its accrual, `claimable`, `claimed`) is read only for
 * the connected wallet or the one `?wallet=` names; with neither, the hook
 * returns defaults for it (`claimable` 0, `claimed` false), and the page shows
 * none of it: no "claimable" or "claimed" status, no balance, no score of
 * yours. The claim is signed by the connected wallet, so it is offered only
 * when the connected wallet is the address shown; a named address alone never
 * gets one.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RpgfPeriodState } from "@/lib/composition/useRpgfRewards";

const NAMED = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;
const OTHER = "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc" as const;
const CLAUSE = `0x${"ab".repeat(32)}` as const;

const m = vi.hoisted(() => ({
    connected: undefined as `0x${string}` | undefined,
    named: undefined as `0x${string}` | undefined,
    read: undefined as unknown,
    balanceRead: { status: "absent" } as unknown,
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: m.connected, isConnected: !!m.connected }),
    useChainId: () => 31337,
    usePublicClient: () => undefined,
    useReadContract: () => ({ data: undefined, isLoading: false }),
    useDisconnect: () => ({ disconnect: () => undefined }),
}));
vi.mock("@/hooks/useConnectInjected", () => ({ useConnectInjected: () => () => undefined }));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
// The helper's rule: the connected wallet, else the address ?wallet= names.
// `named` set beside `connected` stands for a page whose shown address is not
// the connected wallet.
vi.mock("@/lib/shared/viewedWallet", () => ({
    useViewedWallet: (connected: `0x${string}` | undefined) => m.named ?? connected,
}));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true }) }));
vi.mock("@/lib/composition/useRpgfRewards", () => ({
    useRpgfRewards: (subject: `0x${string}` | undefined) => ({
        available: true, account: subject, claim: async () => undefined, refresh: () => undefined, read: m.read,
    }),
}));
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 18, ready: true, loading: false }) }));
vi.mock("@/hooks/useTokenBalance", () => ({
    default: (_token: unknown, owner: unknown) => ({ read: owner ? m.balanceRead : { status: "absent" }, refetch: () => undefined }),
}));

import { RewardsView } from "@/app/(app)/rewards/_components/RewardsView";

/** A closed period as the hook returns it with no address: the public reads, and the defaults. */
const CLOSED_NO_ADDRESS: RpgfPeriodState = {
    periodId: 0, amount: 10n ** 21n, minted: 3n * 10n ** 18n, periodClosed: true, totalScore: 42n,
    claimable: 0n, claimed: false, myScore: 0n, accruals: [],
};
const ACCRUING: RpgfPeriodState = { ...CLOSED_NO_ADDRESS, periodId: 1, periodClosed: false, minted: 0n, totalScore: 7n };
/** The same closed period read for an address that accrued in it. */
const CLOSED_FOR_ADDRESS: RpgfPeriodState = {
    ...CLOSED_NO_ADDRESS,
    accruals: [{ clauseOrAssembly: CLAUSE, kind: 0, label: "clause 0xabab", family: "clause", c: 1n, d: 1n, score: 3n, claimed: false }],
    myScore: 3n, claimable: 5n * 10n ** 18n,
};

function periodsRead(periods: RpgfPeriodState[], memberLive: boolean | null = null) {
    m.read = { status: "present", value: { periods, memberLive } };
}

beforeEach(() => {
    m.connected = undefined;
    m.named = undefined;
    m.balanceRead = { status: "present", value: 9n * 10n ** 18n };
    periodsRead([CLOSED_NO_ADDRESS, ACCRUING]);
});

describe("/rewards — no wallet and no address named, the periods read present", () => {
    it("no wallet, read present: each period's budget, minted figure, total score and phase show", () => {
        render(<RewardsView />);
        expect(screen.getByTestId("period-card-0").textContent).toMatch(/Period 1 — 1,?000 FLORIN/);
        expect(screen.getByTestId("period-total-score-0").textContent).toMatch(/42/);
        expect(screen.getByTestId("period-total-score-0").textContent).toMatch(/minted so far 3 FLORIN/);
        expect(screen.getByTestId("period-status-0").textContent).toBe("closed");
        expect(screen.getByTestId("period-status-1").textContent).toBe("accruing");
    });

    it("shows nothing that is one address's: no claimable or claimed status, no balance, no score, no claim", () => {
        render(<RewardsView />);
        const page = screen.getByTestId("rewards-page").textContent ?? "";
        expect(screen.getByTestId("period-status-0").textContent).not.toMatch(/claim/);
        expect(screen.queryByTestId("florin-balance")).toBeNull();
        expect(screen.queryByTestId("period-no-accrual-0")).toBeNull();
        expect(screen.queryByTestId("period-claimable-0")).toBeNull();
        expect(screen.queryByTestId("period-claimed-0")).toBeNull();
        expect(screen.queryByTestId("claim-0")).toBeNull();
        expect(page).not.toMatch(/Nothing you designed/);
    });

    it("in flight, the loading line speaks of the periods, not of an accrual", () => {
        m.read = { status: "pending" };
        render(<RewardsView />);
        expect(screen.getByTestId("rewards-loading").textContent).toMatch(/Reading the reward periods/);
        expect(screen.getByTestId("rewards-loading").textContent).not.toMatch(/your|this address/);
    });

    it("resolved empty, the line speaks of no wallet", () => {
        periodsRead([]);
        render(<RewardsView />);
        expect(screen.getByTestId("rewards-no-periods").textContent).not.toMatch(/this wallet|your/i);
    });
});

describe("/rewards — the claim is the connected wallet's, for the address shown", () => {
    it("a named address with no wallet connected: its accrual and claimable figure show, and no claim is offered", () => {
        m.named = NAMED;
        periodsRead([CLOSED_FOR_ADDRESS], true);
        render(<RewardsView />);
        expect(screen.getByTestId("period-status-0").textContent).toBe("claimable");
        expect(screen.getByTestId("period-accruals-0").textContent).toMatch(/This address's clauses/);
        expect(screen.getByTestId("period-claimable-0").textContent).toMatch(/5 FLORIN/);
        expect(screen.getByTestId("florin-balance").textContent).toMatch(/This address's florin balance: 9/);
        expect(screen.queryByTestId("claim-0")).toBeNull();
    });

    it("a connected wallet that is not the address shown is offered no claim", () => {
        m.connected = OTHER;
        m.named = NAMED;
        periodsRead([CLOSED_FOR_ADDRESS], true);
        render(<RewardsView />);
        expect(screen.getByTestId("period-claimable-0")).toBeInTheDocument();
        expect(screen.queryByTestId("claim-0")).toBeNull();
    });

    it("the connected wallet, shown: the claim is offered", () => {
        m.connected = NAMED;
        periodsRead([CLOSED_FOR_ADDRESS], true);
        render(<RewardsView />);
        expect(screen.getByTestId("claim-0")).toBeInTheDocument();
    });
});
