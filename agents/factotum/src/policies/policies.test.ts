import { describe, it, expect } from "vitest";
import type { ProposedAction, CommitSubOrderAction } from "@figaro/core/agent";
import {
  basicSellerPolicy,
  sellerOfRecordPolicy,
  auctionBidderPolicy,
  auditorPolicy,
  buyerWithBudgetPolicy,
} from "./index.js";

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

function makeCommit(value: bigint, buyer: `0x${string}` = ZERO_ADDR): CommitSubOrderAction {
  return {
    type: "commit-sub-order",
    description: "test commit",
    processId: ZERO_HASH,
    buyer,
    currentCumulativeValue: value,
    currency: ZERO_ADDR,
  };
}

function makeAttest(side: "seller" | "buyer" = "seller"): ProposedAction {
  return {
    type: side === "seller" ? "attest-as-seller" : "attest-as-buyer",
    description: "test attest",
    processId: ZERO_HASH,
    attester: ZERO_ADDR,
    orderHashes: [],
  };
}

function makeResolve(): ProposedAction {
  return {
    type: "resolve-process",
    description: "test resolve",
    processId: ZERO_HASH,
    caller: ZERO_ADDR,
    commitments: [],
    settlements: [],
    totalBuyerPayout: 0n,
    totalSellerPayout: 0n,
  };
}

describe("basicSellerPolicy", () => {
  it("accepts commits within bounds", async () => {
    const policy = basicSellerPolicy({ maxValue: 1000n });
    const decisions = await policy.decide([{ action: makeCommit(500n) }]);
    expect(decisions[0].action).toBe("approve");
  });

  it("rejects commits above maxValue", async () => {
    const policy = basicSellerPolicy({ maxValue: 1000n });
    const decisions = await policy.decide([{ action: makeCommit(1500n) }]);
    expect(decisions[0].action).toBe("reject");
    expect(decisions[0].reason).toMatch(/max value/);
  });

  it("respects minValue", async () => {
    const policy = basicSellerPolicy({ minValue: 100n, maxValue: 1000n });
    const decisions = await policy.decide([{ action: makeCommit(50n) }]);
    expect(decisions[0].action).toBe("reject");
    expect(decisions[0].reason).toMatch(/min value/);
  });

  it("respects trustedBuyers whitelist", async () => {
    const trusted = "0x1234567890123456789012345678901234567890" as const;
    const other = "0xabcdef0123456789012345678901234567890123" as const;
    const policy = basicSellerPolicy({
      maxValue: 1000n,
      trustedBuyers: new Set([trusted]),
    });
    const trustedDec = await policy.decide([{ action: makeCommit(500n, trusted) }]);
    const otherDec = await policy.decide([{ action: makeCommit(500n, other) }]);
    expect(trustedDec[0].action).toBe("approve");
    expect(otherDec[0].action).toBe("reject");
  });

  it("auto-approves attestations", async () => {
    const policy = basicSellerPolicy({ maxValue: 1000n });
    const decisions = await policy.decide([{ action: makeAttest("seller") }]);
    expect(decisions[0].action).toBe("approve");
  });
});

describe("sellerOfRecordPolicy", () => {
  it("accepts attestations and routine commits", async () => {
    const policy = sellerOfRecordPolicy({ routineProcurementLimit: 10000n });
    const decisions = await policy.decide([
      { action: makeCommit(5000n) },
      { action: makeAttest("seller") },
      { action: makeAttest("buyer") },
    ]);
    expect(decisions[0].action).toBe("approve");
    expect(decisions[1].action).toBe("approve");
    expect(decisions[2].action).toBe("approve");
  });

  it("escalates large commits", async () => {
    const policy = sellerOfRecordPolicy({ routineProcurementLimit: 10000n });
    const decisions = await policy.decide([{ action: makeCommit(50000n) }]);
    expect(decisions[0].action).toBe("reject");
    expect(decisions[0].reason).toMatch(/threshold/);
  });

  it("escalates resolutions", async () => {
    const policy = sellerOfRecordPolicy({ routineProcurementLimit: 10000n });
    const decisions = await policy.decide([{ action: makeResolve() }]);
    expect(decisions[0].action).toBe("reject");
    expect(decisions[0].reason).toMatch(/human review/);
  });
});

describe("auctionBidderPolicy", () => {
  it("approves commits with sufficient margin", async () => {
    const policy = auctionBidderPolicy({
      estimateMyCost: () => 1000n,
      minMarginBps: 500n, // 5%
    });
    // Offered 1100 against cost 1000 = 10% margin = 1000bps >= 500bps threshold
    const decisions = await policy.decide([{ action: makeCommit(1100n) }]);
    expect(decisions[0].action).toBe("approve");
  });

  it("rejects commits below margin", async () => {
    const policy = auctionBidderPolicy({
      estimateMyCost: () => 1000n,
      minMarginBps: 1000n, // 10%
    });
    // Offered 1050 against cost 1000 = 5% margin = 500bps < 1000bps
    const decisions = await policy.decide([{ action: makeCommit(1050n) }]);
    expect(decisions[0].action).toBe("reject");
    expect(decisions[0].reason).toMatch(/margin/);
  });

  it("refuses to bid blind on zero cost estimate", async () => {
    const policy = auctionBidderPolicy({
      estimateMyCost: () => 0n,
      minMarginBps: 500n,
    });
    const decisions = await policy.decide([{ action: makeCommit(1000n) }]);
    expect(decisions[0].action).toBe("reject");
    expect(decisions[0].reason).toMatch(/blind/);
  });
});

describe("auditorPolicy", () => {
  it("approves attestations only", async () => {
    const policy = auditorPolicy();
    const decisions = await policy.decide([
      { action: makeAttest("seller") },
      { action: makeAttest("buyer") },
      { action: makeCommit(500n) },
      { action: makeResolve() },
    ]);
    expect(decisions[0].action).toBe("approve");
    expect(decisions[1].action).toBe("approve");
    expect(decisions[2].action).toBe("reject");
    expect(decisions[3].action).toBe("reject");
  });
});

describe("buyerWithBudgetPolicy", () => {
  it("tracks budget across commits", async () => {
    const tracker = { value: 0n };
    const policy = buyerWithBudgetPolicy({
      totalBudget: 1000n,
      perCommitLimit: 600n,
      budgetSpent: tracker,
    });
    const first = await policy.decide([{ action: makeCommit(400n) }]);
    expect(first[0].action).toBe("approve");
    expect(tracker.value).toBe(400n);

    const second = await policy.decide([{ action: makeCommit(500n) }]);
    expect(second[0].action).toBe("approve");
    expect(tracker.value).toBe(900n);

    const third = await policy.decide([{ action: makeCommit(200n) }]);
    expect(third[0].action).toBe("reject");
    expect(third[0].reason).toMatch(/budget/);
  });

  it("rejects commits above per-commit limit even within total budget", async () => {
    const policy = buyerWithBudgetPolicy({
      totalBudget: 10000n,
      perCommitLimit: 100n,
    });
    const decisions = await policy.decide([{ action: makeCommit(500n) }]);
    expect(decisions[0].action).toBe("reject");
    expect(decisions[0].reason).toMatch(/per-commit limit/);
  });

  it("auto-resolves processes (buyer dominance)", async () => {
    const policy = buyerWithBudgetPolicy({
      totalBudget: 10000n,
      perCommitLimit: 1000n,
    });
    const decisions = await policy.decide([{ action: makeResolve() }]);
    expect(decisions[0].action).toBe("approve");
  });
});
