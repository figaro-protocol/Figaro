import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SwapFundingPanel } from "@/app/(app)/s/checkout/_components/SwapFundingPanel";
import { fundingAuthorization, fundingBlocksTheAct } from "@/lib/composition/useSwapFunding";
import { fundingMargin } from "@/lib/composition/useFundingMargin";

const TOKEN = "0x1111111111111111111111111111111111111111" as const;
const PARTY = "0x2222222222222222222222222222222222222222" as const;

// A chosen funding token is pulled through Permit2 at commit. Until its
// allowance has been READ and is ENOUGH, an accept or a place-order would
// broadcast a commit that reverts — so the state is derived once and both the
// panel and the action beside it read it.
describe("fundingAuthorization — where a chosen funding token stands with Permit2", () => {
    const base = { fundingToken: TOKEN, allowanceKnown: true, needsApproval: false, isAuthorizing: false };

    it("is none while no funding token is chosen", () => {
        expect(fundingAuthorization({ ...base, fundingToken: null })).toBe("none");
    });

    it("is reading until the allowance read has come back", () => {
        expect(fundingAuthorization({ ...base, allowanceKnown: false, needsApproval: true })).toBe("reading");
    });

    it("is needed when the allowance is known and short", () => {
        expect(fundingAuthorization({ ...base, needsApproval: true })).toBe("needed");
    });

    it("is authorizing while the approval is pending or confirming", () => {
        expect(fundingAuthorization({ ...base, needsApproval: true, isAuthorizing: true })).toBe("authorizing");
    });

    it("is reading, never needed, while a stale allowance is being read again after an approval", () => {
        // The caller passes allowanceKnown = read AND not being re-read.
        expect(fundingAuthorization({ ...base, allowanceKnown: false, needsApproval: true })).toBe("reading");
    });

    it("is ready when the allowance is known and covers the bond", () => {
        expect(fundingAuthorization(base)).toBe("ready");
    });
});

describe("fundingBlocksTheAct — the act waits for a chosen funding token to be authorized", () => {
    it("lets the act through with no funding token, or with one that is ready", () => {
        expect(fundingBlocksTheAct("none")).toBe(false);
        expect(fundingBlocksTheAct("ready")).toBe(false);
    });

    it("holds the act while the allowance is unread, short, or being approved", () => {
        expect(fundingBlocksTheAct("reading")).toBe(true);
        expect(fundingBlocksTheAct("needed")).toBe(true);
        expect(fundingBlocksTheAct("authorizing")).toBe(true);
    });
});

describe("SwapFundingPanel — the panel shows the state it was given", () => {
    const props = {
        candidates: [], party: PARTY, currencySymbol: "MOCK", decimals: 18,
        fundingToken: TOKEN, onSelect: () => {}, onAuthorize: () => {}, margin: null,
    };

    it("carries the state as an attribute a reader can wait on", () => {
        render(<SwapFundingPanel {...props} authorization="reading" />);
        expect(screen.getByTestId("swap-funding-panel").getAttribute("data-authorization")).toBe("reading");
    });

    it("offers the authorize button only when authorization is needed or under way", () => {
        const { rerender } = render(<SwapFundingPanel {...props} authorization="needed" />);
        expect(screen.getByTestId("funding-authorize")).toBeEnabled();
        rerender(<SwapFundingPanel {...props} authorization="authorizing" />);
        expect(screen.getByTestId("funding-authorize")).toBeDisabled();
        rerender(<SwapFundingPanel {...props} authorization="reading" />);
        expect(screen.queryByTestId("funding-authorize")).toBeNull();
        rerender(<SwapFundingPanel {...props} authorization="ready" />);
        expect(screen.queryByTestId("funding-authorize")).toBeNull();
    });

    it("says so while the allowance is being read, and once the token is authorized", () => {
        const { rerender } = render(<SwapFundingPanel {...props} authorization="reading" />);
        expect(screen.getByTestId("funding-authorization-status").textContent).toMatch(/Checking/);
        rerender(<SwapFundingPanel {...props} authorization="ready" />);
        expect(screen.getByTestId("funding-authorization-status").textContent).toMatch(/authorized/i);
    });
});

// The party sets the slippage margin here, in the chooser, BEFORE the quote
// its signature binds: the cap (`maxInput`) and the route are built from it,
// and the signing modal only shows them.
describe("SwapFundingPanel — the slippage margin field", () => {
    const state = (over: Partial<Parameters<typeof fundingMargin>[0]> = {}) =>
        fundingMargin({ text: null, defaultBps: 100, quotedInput: 1_000_000n, balance: 10_000_000n, ...over });
    const props = {
        candidates: [], party: PARTY, currencySymbol: "MOCK",
        fundingToken: TOKEN, onSelect: () => {}, onAuthorize: () => {}, authorization: "ready" as const,
    };
    const margin = (over: Partial<Parameters<typeof fundingMargin>[0]> = {}, extra: Record<string, unknown> = {}) => ({
        ...state(over), venue: "uniswap-v3" as const, decimals: 6, symbol: "AAA", onChange: () => {}, ...extra,
    });

    it("shows the venue's margin and the max input it yields, in the funding token's units", () => {
        render(<SwapFundingPanel {...props} margin={margin()} />);
        expect(screen.getByTestId("funding-margin-input")).toHaveValue(1);
        expect(screen.getByTestId("funding-margin-max-input")).toHaveTextContent("1.01 AAA");
        expect(screen.queryByTestId("funding-margin-error")).toBeNull();
    });

    it("hands each edit to the chooser's state, and shows the max input that follows", () => {
        const seen: string[] = [];
        const { rerender } = render(<SwapFundingPanel {...props} margin={margin({}, { onChange: (t: string) => seen.push(t) })} />);
        fireEvent.change(screen.getByTestId("funding-margin-input"), { target: { value: "2" } });
        expect(seen).toEqual(["2"]);
        rerender(<SwapFundingPanel {...props} margin={margin({ text: "2" })} />);
        expect(screen.getByTestId("funding-margin-max-input")).toHaveTextContent("1.02 AAA");
    });

    it("names a refused margin: out of range, or beyond the balance", () => {
        const { rerender } = render(<SwapFundingPanel {...props} margin={margin({ text: "11" })} />);
        expect(screen.getByTestId("funding-margin-error")).toHaveTextContent("Enter a margin from 0% to 10%.");
        expect(screen.getByTestId("funding-margin-input")).toHaveAttribute("aria-invalid", "true");
        expect(screen.queryByTestId("funding-margin-max-input")).toBeNull();
        rerender(<SwapFundingPanel {...props} margin={margin({ text: "5", balance: 1_040_000n })} />);
        expect(screen.getByTestId("funding-margin-error")).toHaveTextContent("Your balance is below the max input at this margin.");
    });

    it("on the devnet venue, says the swap spends the whole max input", () => {
        const { rerender } = render(<SwapFundingPanel {...props} margin={margin({ defaultBps: 0 }, { venue: "devnet-mock" })} />);
        expect(screen.getByTestId("funding-margin-exact-input")).toHaveTextContent("This venue spends the whole max input.");
        rerender(<SwapFundingPanel {...props} margin={margin()} />);
        expect(screen.queryByTestId("funding-margin-exact-input")).toBeNull();
    });

    it("renders no field until a funding token is chosen", () => {
        render(<SwapFundingPanel {...props} fundingToken={null} authorization="none" margin={margin()} />);
        expect(screen.queryByTestId("funding-margin-input")).toBeNull();
    });
});
