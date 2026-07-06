# @figaro/factotum

Reference participation agent for the Figaro Protocol.

A factotum is a fork-and-modify starting point for any agent — human-driven or autonomous, AI or rule-based — that wants to act on Figaro. It wires `@figaro/core/agent` to a wallet, a role binding (inferred from process state), and a pluggable policy.

This is the **operational** form of Figaro's actor-neutrality claim. The protocol does not distinguish between human and AI participants; both interact through the same kernel primitives — a wallet, EIP-712 signatures, and on-chain commitments. This package shows what that looks like in code.

> See `docs/v5/AI_AGENT_COORDINATION.md` for the underlying doctrine: how agents discover work via public graph signals, and how ERC-8004 service endpoints are encoded in `SellerRegistry.metadataURI`.

---

## Architecture

```
sync → propose → policy → execute
```

1. **Sync** — `FigaroContext` reconstructs every process from on-chain events. No subgraph, no indexer, no API.
2. **Propose** — `proposeActions(briefing, myAddress)` returns the actions available to this address given current process state. Role is inferred (buyer / seller / auditor) from the process graph, not configured.
3. **Policy** — a pluggable decision layer. Default: human-in-the-loop (HITL) — every action prompts. Alternative: autonomous, with a rule function you write.
4. **Execute** — `executeAction(walletClient, addresses, action)` builds and submits the transaction. Sequential, never parallel.

The factotum loops on a polling interval. For production, replace polling with a WebSocket subscription to relevant events.

---

## Quickstart (local Anvil)

```bash
# 1. Build the SDK first — the factotum imports from @figaro/core's compiled dist/.
cd ../../sdk && npm install && npm run build

# 2. From the repo root, deploy contracts to local Anvil.
cd ../.. && ./deploy-local.sh
# → prints contract addresses; copy them into .env below.

# 3. Install factotum dependencies and configure.
cd sdk/factotum
npm install
cp .env.example .env
# Edit .env: set PRIVATE_KEY (use a fresh test key) and the four contract addresses.

# 4. Run in HITL mode.
npm run dev
```

The factotum will print its address, sync the chain, and prompt for approval each time it has a proposed action.

To act as a different role, fund a different test address and use that key. The proposer will surface buyer / seller / auditor actions automatically based on process membership.

---

## Walkthrough — first 5 minutes

What you'll actually see, running against local Anvil with a buyer wallet that just placed an order through the runtime UI.

```text
$ npm run dev

[factotum] address 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
[factotum] policy hitl
[factotum] polling every 15000ms
```

The first three lines are the agent identifying itself: which wallet, which policy, how often it syncs. Address-only — no name, no service descriptor, because the protocol does not care.

After ~15 seconds the loop ticks. The proposer reconstructs every active process the wallet is a party to and surfaces the actions available right now:

```text
[factotum] 1 proposed action(s) across 1 process(es)

[factotum/hitl] proposed action:
{
  "type": "commit-sub-order",
  "description": "Commit a sub-order to process 0x4e9b... as buyer",
  "processId": "0x4e9b...",
  "buyer": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "currentCumulativeValue": "1500000",
  "currency": "0x5FbDB..."
}
[factotum/hitl] context: { processId: '0x4e9b...' }
[factotum/hitl] approve? (y/N)
```

The action is the canonical kernel call — buyer commits to a sub-order, locking 2× payment as bond. Read the description and the typed fields. Verify the `processId` matches the order you placed. Verify `currentCumulativeValue` matches what you expect (the executor will round-trip it through your signed commitment, so any mismatch reverts the on-chain call rather than executing the wrong amount).

If anything looks off, type `n` and the action is rejected. The proposer will see the same opportunity next tick and re-surface it; rejection here is non-destructive.

If everything looks right, type `y`:

```text
[factotum/hitl] approve? (y/N) y
[factotum] executed: commit-sub-order → 0x8c7e3a...
```

Bonds locked, on-chain. The transaction hash is your audit trail.

A few minutes later the seller has done their attestation work (handoff, fulfilment) and the process is ready to resolve. The next tick:

```text
[factotum] 1 proposed action(s) across 1 process(es)

[factotum/hitl] proposed action:
{
  "type": "resolve-process",
  "description": "Resolve process 0x4e9b... — release bonds, settle payment",
  "processId": "0x4e9b...",
  "caller": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "totalBuyerPayout": "200000",
  "totalSellerPayout": "1300000"
}
[factotum/hitl] context: { processId: '0x4e9b...' }
[factotum/hitl] approve? (y/N) y
[factotum] executed: resolve-process → 0x2d4f8b...
```

Bonds return, payment settles, the process closes. The factotum loops on, waiting for the next process this wallet becomes a party to.

That's the whole loop. The same code path serves any role — buyer, seller, auditor — because the proposer infers role from process state, not from configuration. Fund a different test address with a different role, run the same factotum, get different actions.

---

## Policy: the most important file you'll change

`src/policy.ts` defines the contract between the factotum and the rest of the world. Everything that decides "should this transaction actually be sent?" lives here.

Two policies ship by default:

- **`makeHitlPolicy()`** — prompts on stdin for each proposed action. This is the safety floor. Treat it as the model for any custom HITL workflow (Slack approvals, web UI, mobile push — same interface, different prompt mechanism).
- **`makeAutonomousPolicy(shouldExecute)`** — applies a rule function without prompting. The shipped `defaultRefuseAll` rule rejects everything; this is intentional. A fresh clone running in autonomous mode does nothing on chain until you write your rule.

To write a real autonomous policy, replace the rule:

```ts
import { makeAutonomousPolicy } from "./policy.js";
import { computeCurrentPrice } from "@figaro/core/extensions";

const myPolicy = makeAutonomousPolicy<ProposedAction, ApprovalContext>((action, ctx) => {
  if (action.kind === "claimAuction") {
    const price = computeCurrentPrice(/* ... */);
    if (price > MY_PROFITABILITY_THRESHOLD) {
      return { execute: false, reason: "price exceeds threshold" };
    }
    return { execute: true };
  }
  return { execute: false, reason: "kind not whitelisted" };
});
```

The policy interface is generic over the action type, so its tests can run without `@figaro/core/agent` being built. See `src/policy.test.ts`.

---

## Reference policies — `src/policies/`

Five named policies cover common roles. Import and configure rather than writing `shouldExecute` from scratch.

| Policy | Use for |
|---|---|
| `basicSellerPolicy` | Single seller accepting commits within configured bounds |
| `sellerOfRecordPolicy` | Fan-out actor (airline, ocean carrier) — seller to buyer, buyer to sub-order sellers |
| `auctionBidderPolicy` | Dutch auction bidder with margin gate (any seller earning by claiming auctions) |
| `auditorPolicy` | Passive observer — attestations only, no commits or resolutions |
| `buyerWithBudgetPolicy` | Buyer-side variant with per-commit and total-budget caps |

Each is a factory that takes config and returns a `Policy<ProposedAction, TContext>`:

```ts
import { auctionBidderPolicy } from "@figaro/factotum/policies";

const policy = auctionBidderPolicy({
  estimateMyCost: (action, ctx) => /* seller-specific */ 0n,
  minMarginBps: 500n, // 5% minimum margin
});
```

Wire it into `src/index.ts` in place of the default. Property tests on the rule logic live in `src/policies/policies.test.ts` and run without needing chain access.

The `sdk/factotum/examples/*/roles.md` files show these policies in context per scenario.

## Plugging in an LLM

The factotum is LLM-agnostic. The policy interface is a synchronous-or-async function over actions; what's behind it is up to you.

To use an LLM for non-trivial decisions (e.g., "is this multi-stop batch worth the deviation?"), wrap your LLM call inside `shouldExecute`:

```ts
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const policy = makeAutonomousPolicy<ProposedAction, ApprovalContext>(async (action, ctx) => {
  if (action.kind === "claimAuction") {
    const verdict = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [{ role: "user", content: `Should I claim this? ${JSON.stringify(action)}` }],
    });
    // Parse verdict, return execute boolean.
  }
  return { execute: false };
});
```

Two cautions:

1. LLM latency is real — a 2-second model call inside a tight loop limits your throughput. Cache decisions, batch context, or move the LLM out of the hot path.
2. LLM decisions are non-deterministic. For high-value actions (commit, resolve), keep HITL; reserve autonomous LLM decisions for low-stakes filters (which jobs to surface, which to ignore).

---

## Identity: ERC-8004 and `did:web`

If you want your agent to be discoverable by other agents — not required, but useful at protocol scale — register a `services` block in your `SellerRegistry.metadataURI`:

```json
{
  "subjectAddress": "0xYourAgent",
  "archetypeId": "autonomous-driver",
  "services": {
    "did": "did:web:agent-42.example.com"
  },
  "capabilities": ["route-optimization", "live-eta"]
}
```

The SDK provides `resolveDidWeb()`, `didDocumentMatchesAddress()`, and `buildSellerDidDocument()` in `@figaro/core/extensions`. See `docs/v5/AI_AGENT_COORDINATION.md` for the convention; ERC-8004 alignment is metadata-only and requires no contract changes.

---

## Security posture

The Figaro project is security-first by construction. Carry that posture into your fork:

- **Use a hardware-isolated signer in production.** Never commit a key with meaningful balances. Hot-key compromise on a long-running agent is catastrophic — the agent has wallet access by design.
- **Test against a fork before mainnet.** Anvil with a forked state is a few minutes of setup and saves orders of magnitude.
- **Default to HITL.** Autonomous mode is for actions whose worst case is bounded (e.g., "claim auctions under $5"). For commits, resolutions, or anything affecting other parties' bonds, keep a human in the loop.
- **Validate proposed actions in the policy, not just trust them.** The proposer is correct, but defense in depth is cheap. Re-derive bond amounts. Re-check addresses. Bound gas. The policy is your last line.
- **Log everything.** Settlement disputes off-chain need an audit trail; the chain has half the story.
- **Test the policy.** `policy.test.ts` is independent of the SDK by design — your custom rule can be unit-tested without spinning up Anvil.

---

## See also

- `sdk/factotum/examples/` — worked end-to-end scenarios showing per-role factotum policies for a multi-party shipping assembly and a passenger-airline assembly.

## What the factotum is not

- **Not production-ready.** It's a reference, not a finished product. There's no retry/backoff, no pending-tx tracking, no nonce management beyond what viem does, no metrics, no health checks. Add what you need.
- **Not a strategy.** It will execute what the proposer suggests; it does not decide which markets to enter, which prices are profitable, or which counterparties to trust. That's your policy.
- **Not the only way.** The factotum is one wiring of `@figaro/core/agent`. If you have a different runtime (Python, Rust, Go), the protocol doesn't care — re-implement the loop in your language. The only requirements are: a wallet, EIP-712 signing, and event-derived state.

---

## Files

- `src/index.ts` — CLI entry, env loading, policy selection.
- `src/factotum.ts` — main loop: sync → propose → policy → execute.
- `src/policy.ts` — pluggable decision layer (HITL + autonomous).
- `src/policy.test.ts` — independent unit tests for the policy abstraction.
- `.env.example` — environment variables; copy to `.env` before running.

---

## License

MIT (matches `@figaro/core`).
