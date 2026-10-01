import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
    SwapFundingPanel,
    fundingAuthorization,
    fundingBlocksTheAct,
} from "@/app/(app)/s/checkout/_components/SwapFundingPanel";

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
        fundingToken: TOKEN, onSelect: () => {}, onAuthorize: () => {},
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
