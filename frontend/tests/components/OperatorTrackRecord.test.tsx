import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OperatorTrackRecord } from "@/components/core/OperatorTrackRecord";
import type { OperatorTrackRecord as TrackRecord } from "@/lib/core/indexer";

const WITH_HISTORY: TrackRecord = {
    operatingSinceBlock: 100n,
    operatingSinceTimestamp: 1_717_200_000n,
    completedProcesses: 7,
    activeProcesses: 2,
    ordersSold: 14,
    ordersBought: 6,
    valueTransacted: [
        { currency: "0xc6b407503de64956ad3cf5ab112ca4f56aa13517", total: 5_000_000_000_000_000_000n },
    ],
    buyersServed: 9,
    sellersUsed: 4,
    auctionJobsWon: 3,
    attestationsEmitted: 25,
    attestationsBySchema: [{ schemaId: "0xabc", count: 25 }],
};

const NO_HISTORY: TrackRecord = {
    operatingSinceBlock: 50n,
    operatingSinceTimestamp: 1_717_200_000n,
    completedProcesses: 0,
    activeProcesses: 0,
    ordersSold: 0,
    ordersBought: 0,
    valueTransacted: [],
    buyersServed: 0,
    sellersUsed: 0,
    auctionJobsWon: 0,
    attestationsEmitted: 0,
    attestationsBySchema: [],
};

describe("OperatorTrackRecord", () => {
    it("renders every reconstructed indicator", () => {
        render(<OperatorTrackRecord record={WITH_HISTORY} isLoading={false} />);
        expect(screen.getByTestId("operator-track-record")).toBeInTheDocument();
        // The eight stat tiles — distinct values, one per indicator.
        for (const value of ["7", "2", "14", "6", "9", "4", "3", "25"]) {
            expect(screen.getByText(value)).toBeInTheDocument();
        }
        // Value transacted, formatted per currency.
        expect(screen.getByTestId("track-record-value")).toHaveTextContent("5");
    });

    it("shows an honest empty state — no fabricated rating — when there is no history", () => {
        render(<OperatorTrackRecord record={NO_HISTORY} isLoading={false} />);
        expect(screen.getByTestId("track-record-empty")).toBeInTheDocument();
        expect(screen.queryByText("processes completed")).not.toBeInTheDocument();
    });

    it("renders a loading state while the graph is reconstructed", () => {
        render(<OperatorTrackRecord record={null} isLoading={true} />);
        expect(screen.getByTestId("track-record-loading")).toBeInTheDocument();
    });

    it("renders nothing when there is no record and no load in flight", () => {
        const { container } = render(<OperatorTrackRecord record={null} isLoading={false} />);
        expect(container).toBeEmptyDOMElement();
    });
});
