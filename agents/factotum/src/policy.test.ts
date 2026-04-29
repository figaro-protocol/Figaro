import { describe, it, expect } from "vitest";
import { makeAutonomousPolicy, makeHitlPolicy, defaultRefuseAll } from "./policy.js";

describe("makeAutonomousPolicy", () => {
  it("default refuse-all is the security floor — autonomous mode does nothing without a custom rule", async () => {
    const policy = makeAutonomousPolicy<{ kind: string }>(defaultRefuseAll);
    const decisions = await policy.decide([
      { action: { kind: "commit" } },
      { action: { kind: "attest" } },
      { action: { kind: "claim" } },
    ]);
    expect(decisions).toHaveLength(3);
    expect(decisions.every((d) => d.action === "reject")).toBe(true);
    expect(decisions[0].reason).toMatch(/replace shouldExecute/);
  });

  it("allows whitelisting specific action kinds", async () => {
    const policy = makeAutonomousPolicy<{ kind: string }>((action) => ({
      execute: action.kind === "attest",
      reason: action.kind === "attest" ? undefined : "kind not whitelisted",
    }));
    const decisions = await policy.decide([
      { action: { kind: "commit" } },
      { action: { kind: "attest" } },
    ]);
    expect(decisions[0].action).toBe("reject");
    expect(decisions[1].action).toBe("approve");
  });

  it("passes approvalContext into the rule for context-aware decisions", async () => {
    type Action = { kind: string; bond: bigint };
    type Context = { processId: string };
    const seen: Array<{ action: Action; context?: Context }> = [];
    const policy = makeAutonomousPolicy<Action, Context>((action, context) => {
      seen.push({ action, context });
      return { execute: action.bond < 1000n, reason: action.bond < 1000n ? undefined : "bond too high" };
    });
    await policy.decide([
      { action: { kind: "commit", bond: 500n }, approvalContext: { processId: "0xabc" } },
      { action: { kind: "commit", bond: 5000n }, approvalContext: { processId: "0xdef" } },
    ]);
    expect(seen).toHaveLength(2);
    expect(seen[0].context?.processId).toBe("0xabc");
    expect(seen[1].context?.processId).toBe("0xdef");
  });
});

describe("makeHitlPolicy", () => {
  it("constructs with the expected name", () => {
    const policy = makeHitlPolicy<unknown>();
    expect(policy.name).toBe("hitl");
  });
});
