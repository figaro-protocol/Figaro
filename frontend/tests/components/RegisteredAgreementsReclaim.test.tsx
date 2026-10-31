/**
 * RegisteredAgreementsReclaim — the designer of record's reclaim of a
 * registered agreement's stake (`AgreementRegistry.withdrawDeposit`), the
 * agreement's row on the designer landing beside the wallet's clauses and
 * assemblies. Rows are the connected wallet's own registrations only; each
 * row is labeled by its pinned document's name, gated by the advisory
 * commits==resolves gate, and calls `useWithdrawAgreement` with its key.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WithdrawGate } from "@figaro-protocol/sdk/derive";

const DESIGNER = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;
const STRANGER = "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc" as const;
const KEY_A = `0x${"a1".repeat(32)}` as const;
const KEY_B = `0x${"b2".repeat(32)}` as const;
const KEY_C = `0x${"c3".repeat(32)}` as const;
const TX = `0x${"ab".repeat(32)}` as const;

type Row = {
    agreementHash: `0x${string}`;
    registeredBy: `0x${string}`;
    contentURI: string;
    blockNumber: bigint;
    transactionHash: `0x${string}`;
    stakeWithdrawn: boolean;
};

const OPEN_GATE: WithdrawGate = { canWithdraw: true, inFlightCount: 0, unverifiedCount: 0 } as WithdrawGate;

const mocks = vi.hoisted(() => ({
    address: undefined as `0x${string}` | undefined,
    scan: { data: null as Row[] | null, isLoading: false, failed: false, error: null as string | null, refetch: () => {} },
    docs: new Map<string, { name?: string; clauses: Record<string, unknown> }>(),
    gate: null as WithdrawGate | null,
    withdraw: vi.fn(),
    scopedTo: [] as (string | undefined)[],
}));

vi.mock("next/link", async () => {
    const React = await import("react");
    return {
        default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
            React.createElement("a", { href, ...rest }, children),
    };
});
vi.mock("wagmi", () => ({
    useAccount: () => ({ address: mocks.address, isConnected: !!mocks.address }),
}));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/lib/protocol/useAgreementRegistry", () => ({
    usePublishedAgreements: (registeredBy: `0x${string}` | undefined) => {
        mocks.scopedTo.push(registeredBy);
        return mocks.scan;
    },
    useWithdrawAgreement: () => ({ withdraw: mocks.withdraw, isPending: false }),
    fetchRegisteredAgreement: async () => null,
    getRegisteredAgreement: (key: string) => mocks.docs.get(key.toLowerCase()),
    useRegisteredAgreementsVersion: () => 0,
}));
vi.mock("@/lib/protocol/withdrawGate", async () => {
    const actual = await vi.importActual<typeof import("@/lib/protocol/withdrawGate")>("@/lib/protocol/withdrawGate");
    return { ...actual, useWithdrawGate: () => ({ gate: mocks.gate, isLoading: false }) };
});

import { RegisteredAgreementsReclaim } from "@/app/(tools)/assemblies/designer/_components/RegisteredAgreementsReclaim";

function row(agreementHash: `0x${string}`, registeredBy: `0x${string}`, stakeWithdrawn = false): Row {
    return {
        agreementHash,
        registeredBy,
        contentURI: `ipfs://Qm${agreementHash.slice(2, 10)}`,
        blockNumber: 7n,
        transactionHash: TX,
        stakeWithdrawn,
    };
}

describe("RegisteredAgreementsReclaim", () => {
    beforeEach(() => {
        mocks.address = DESIGNER;
        mocks.scan = { data: null, isLoading: false, failed: false, error: null, refetch: () => {} };
        mocks.docs.clear();
        mocks.gate = OPEN_GATE;
        mocks.withdraw.mockReset();
        mocks.withdraw.mockResolvedValue(TX);
        mocks.scopedTo = [];
    });

    it("asks for a wallet before showing any reclaim, and reads no foreign scope", () => {
        mocks.address = undefined;
        render(<RegisteredAgreementsReclaim />);
        expect(screen.getByTestId("agreements-reclaim-no-wallet")).toBeTruthy();
        expect(screen.queryByTestId("agreement-withdraw-button")).toBeNull();
    });

    it("reads the registry scoped to the connected wallet", () => {
        mocks.scan = { ...mocks.scan, data: [] };
        render(<RegisteredAgreementsReclaim />);
        expect(mocks.scopedTo.every((s) => s === DESIGNER)).toBe(true);
        expect(screen.getByTestId("agreements-reclaim-empty")).toBeTruthy();
    });

    it("shows a failed registry read as a failure, never as an empty list", () => {
        mocks.scan = { ...mocks.scan, data: [], failed: true, error: "rpc down" };
        render(<RegisteredAgreementsReclaim />);
        expect(screen.getByTestId("agreements-reclaim-failed").textContent).toMatch(/rpc down/);
        expect(screen.queryByTestId("agreements-reclaim-empty")).toBeNull();
    });

    it("offers the reclaim only on the designer of record's own registrations", () => {
        mocks.scan = { ...mocks.scan, data: [row(KEY_A, DESIGNER), row(KEY_B, STRANGER)] };
        render(<RegisteredAgreementsReclaim />);
        expect(screen.getByTestId(`agreement-reclaim-row-${KEY_A}`)).toBeTruthy();
        expect(screen.queryByTestId(`agreement-reclaim-row-${KEY_B}`)).toBeNull();
        expect(screen.getAllByTestId("agreement-withdraw-button")).toHaveLength(1);
    });

    it("labels a row by its pinned document's name and clause count; an unread document by its key", () => {
        mocks.docs.set(KEY_A.toLowerCase(), { name: "Courier leg", clauses: { [KEY_C]: {}, [KEY_B]: {} } });
        mocks.scan = { ...mocks.scan, data: [row(KEY_A, DESIGNER), row(KEY_C, DESIGNER)] };
        render(<RegisteredAgreementsReclaim />);
        const named = screen.getByTestId(`agreement-reclaim-row-${KEY_A}`);
        expect(named.textContent).toMatch(/Courier leg/);
        expect(named.textContent).toMatch(/2 clauses/);
        const unread = screen.getByTestId(`agreement-reclaim-row-${KEY_C}`);
        expect(unread.textContent).toMatch(/document not read yet/);
        expect(unread.textContent).toMatch(/0xc3c3c3c3/);
    });

    it("reclaims the stake with the row's agreement key and flips the row to reclaimed", async () => {
        mocks.scan = { ...mocks.scan, data: [row(KEY_A, DESIGNER)] };
        render(<RegisteredAgreementsReclaim />);
        const button = screen.getByTestId("agreement-withdraw-button") as HTMLButtonElement;
        expect(button.disabled).toBe(false);
        fireEvent.click(button);
        await waitFor(() => expect(mocks.withdraw).toHaveBeenCalledWith(KEY_A));
        await waitFor(() =>
            expect(screen.getByTestId(`agreement-reclaim-state-${KEY_A}`).textContent).toBe("stake reclaimed"),
        );
        expect((screen.getByTestId("agreement-withdraw-button") as HTMLButtonElement).disabled).toBe(true);
    });

    it("shows the registry's refusal on the row", async () => {
        mocks.withdraw.mockRejectedValue(new Error("Only the wallet that registered this agreement can reclaim its registration stake."));
        mocks.scan = { ...mocks.scan, data: [row(KEY_A, DESIGNER)] };
        render(<RegisteredAgreementsReclaim />);
        fireEvent.click(screen.getByTestId("agreement-withdraw-button"));
        expect((await screen.findByTestId("agreement-withdraw-error")).textContent).toMatch(/Only the wallet that registered/);
    });

    it("keeps an already-reclaimed registration listed, its reclaim disabled", () => {
        mocks.scan = { ...mocks.scan, data: [row(KEY_A, DESIGNER, true)] };
        render(<RegisteredAgreementsReclaim />);
        expect(screen.getByTestId(`agreement-reclaim-state-${KEY_A}`).textContent).toBe("stake reclaimed");
        expect((screen.getByTestId("agreement-withdraw-button") as HTMLButtonElement).disabled).toBe(true);
    });

    it("disables the reclaim while a verified in-flight trade composes the agreement, or while the gate is unknown", () => {
        mocks.scan = { ...mocks.scan, data: [row(KEY_A, DESIGNER)] };
        mocks.gate = { canWithdraw: false, inFlightCount: 1, unverifiedCount: 0 } as WithdrawGate;
        const { unmount } = render(<RegisteredAgreementsReclaim />);
        const blocked = screen.getByTestId("agreement-withdraw-button") as HTMLButtonElement;
        expect(blocked.disabled).toBe(true);
        expect(blocked.title).toMatch(/1 in-flight trade still composes/);
        unmount();
        mocks.gate = null;
        render(<RegisteredAgreementsReclaim />);
        expect((screen.getByTestId("agreement-withdraw-button") as HTMLButtonElement).disabled).toBe(true);
    });

    it("surfaces unverifiable in-flight trades as a caveat beside an enabled reclaim", () => {
        mocks.scan = { ...mocks.scan, data: [row(KEY_A, DESIGNER)] };
        mocks.gate = { canWithdraw: true, inFlightCount: 0, unverifiedCount: 2 } as WithdrawGate;
        render(<RegisteredAgreementsReclaim />);
        expect((screen.getByTestId("agreement-withdraw-button") as HTMLButtonElement).disabled).toBe(false);
        expect(screen.getByTestId("agreement-withdraw-caveat").textContent).toMatch(/2 in-flight trades could not be checked/);
    });
});
