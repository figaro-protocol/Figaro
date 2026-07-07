# AI Agent Coordination via Public Graphs

This document describes how autonomous agents — human or AI — coordinate
through the public graph data emitted by Figaro institutions. It is the
operational corollary of the "Post-Firm Economy" thesis in THEORY.md.

---

## The Coordination Problem

Traditional platforms solve coordination through centralized matching:
the platform decides which driver gets which job, which restaurant sees
which order, and what prices clear the market. The platform is the
intermediary, the data silo, and the rent-extractor.

Figaro replaces this with **permissionless graph publication**. Every
institution emits public coordination signals (see PUBLIC_GRAPH_MODEL.md)
that any agent can read, analyze, and act on.

---

## "Agent" names three worlds — pin the referent before reasoning

Pre-defined agents are **operator-private by default**; "public" is the exception, only when explicitly designed for it. The public exceptions act for a **user's wallet** and **never touch the repo**.

- **Public participant agents — transacting** (this document's subject; any wallet acting on Figaro): the machinery is `@figaro/core/agent`; `sdk/factotum/` is the runnable reference participant — fork it, give it a wallet, it acts for whoever holds the key (buyer, seller, auditor). Worked walkthroughs: `sdk/factotum/examples/`.
- **Public ecosystem agents — authoring** (any user contributing to the network): `sdk/ecosystem-agents/` — `figaro-clause-author`, `figaro-assembly-author`. They help a user author or **fork** a clause/assembly and register it on the permissionless registries (spec/`DesignDraft` → IPFS → `ClauseRegistry`/`AssemblyRegistry`, under the **user's** key). The artifact belongs to the user (RPGF rewards it). **Never** the repo, the kernel, or this frontend.
- **Operator-private repo agents** (the Claude Code subagents that build THIS repo, for the operator only): definitions live in `.claude/agents/*.md`; `agent-sdk/` (`@figaro/agent-sdk`) packages **those** for non-Claude runtimes. Not the protocol SDK — never touches the chain; nothing in this document applies to it.

---

## Reference Implementation

`sdk/factotum/` ships a runnable reference participation agent: a fork-and-modify TypeScript starting point that wires `@figaro/core/agent` to a wallet, role binding (inferred from process state), and a pluggable policy. Treat the doctrine in this document as the *what*; the factotum is the *how*. See `sdk/factotum/README.md` for architecture, the policy contract, LLM integration patterns, and ERC-8004 / `did:web` discoverability.

The factotum is intentionally minimal — it is not a strategy or a production system. It is the concrete demonstration that humans and autonomous agents interact with the kernel through the same primitives (a wallet, EIP-712 signatures, on-chain commitments). Re-implementations in other languages are expected; the protocol does not care which runtime you use.

---

## How Agents Use Each Graph

### Process Graph → Work Discovery

An agent queries the process graph to find:
- Pending orders awaiting acceptance (seller agents)
- Active deliveries awaiting drivers (courier agents)
- Settlement history for reliability assessment (any agent)

Courier agents monitor open delivery demand (unfilled courier edges in
committed processes) and accept work whose catalogue-rate economics meet
their profitability threshold. (The Dutch-auction coordination surface was
abandoned 2026-07-02; pricing is a catalogue concern — e.g. rate × geohash
distance.)

### Geo Graph → Spatial Routing

The geohash layer enables:
- **Job filtering**: Driver agents filter available deliveries by proximity
  to their current position (4-char prefix match for coarse area, 6-char
  for neighborhood).
- **Demand heat maps**: Aggregating pickup geohashes over time reveals
  demand density by zone — no centralized analytics platform needed.
- **Route optimization**: Knowing pickup and drop-off zones before claiming
  a job lets agents estimate travel time and profitability.
- **Multi-stop batching**: Agents can identify nearby pickups and cluster
  deliveries for efficiency.

### GHG Graph → Compliance Signaling

Automated compliance agents can:
- Monitor disclosure completeness across a process
- Flag orders missing required seller disclosures
- Aggregate emissions data across reporting boundaries
- Generate audit-ready reports from on-chain anchors + off-chain content

### Capital Graph → Economic Decision-Making

Agents optimize capital allocation by monitoring:
- Bond flows and settlement payouts over time (capital efficiency)
- Settled courier payments over time (market rate for delivery services)
- Bond sizes relative to order values (risk assessment)
- Settlement velocity (time from Active to Resolved)

### Cross-Process Graph → Process Provenance Intelligence

For multi-institution workflows:
- Track provenance across linked processes
- Identify bottlenecks in multi-step processs
- Verify template compliance across institutions

---

## Economic Pheromones

The term "economic pheromones" (THEORY.md) describes how these public signals
function as decentralized coordination:

1. A food-preparation role publishes a geohash when it registers → signal: "food is
   prepared here"
2. A buyer creates an order with a drop-off geohash → signal: "demand exists
   in this zone"
3. A courier order commits at a catalogue-rate payment → signal: "delivery
   in this zone clears at X"
4. The courier's attestations advance → signal: "this zone is being served"
5. Settlement completes → signal: "this route was profitable"

Over time, agents accumulate a spatial-temporal model of supply and demand
without any party intentionally publishing analytics. The coordination
emerges from individual self-interested actions — exactly as Coase predicted
firms would dissolve when transaction costs reach zero.

---

## Agent Types

| Agent Type | Graph Consumed | Action Taken |
|------------|---------------|--------------|
| Driver (human) | Geo, Process, Capital | Filter jobs by zone, accept work |
| Driver (AI) | Geo, Process, Capital | Optimize multi-stop routes, dynamic pricing |
| Food preparer | Process | Accept/decline orders, manage prep pipeline |
| Buyer | Process, GHG | Place orders, verify disclosures |
| Capital allocator | Capital | Monitor settlement flows and working-capital use |
| Compliance | GHG, Cross-Process | Audit disclosure completeness |
| Analytics | All | Generate reports, predict demand |

---

## Design Implications

1. **No API keys**: All graph data is on-chain or in public events. Any agent
   can index it without platform permission.
2. **No rate limits**: Coordination throughput is limited by block space, not
   by platform-imposed throttling.
3. **No data moats**: Competitors and collaborators see the same signals.
   Advantage comes from better *interpretation*, not better *access*.
4. **Composable agents**: An agent built for Local Commerce delivery routing can be
   adapted for any other archetype that uses geohash coordination.

---

## Agent Service Endpoints (ERC-8004 Interop)

ERC-8004 ("Trustless Agents", DRAFT Aug 2025) defines a standard for
agent discoverability via service endpoint declarations. Figaro does not
depend on ERC-8004 — the bonding mechanism already provides trust, and
settlement history already provides reputation. However, autonomous agents
that want cross-protocol discoverability can declare ERC-8004-compatible
service endpoints in their `SellerRegistry.metadataURI` JSON.

### Why This Is a Metadata Convention, Not a Contract Change

Figaro's `SellerRegistry` already stores an arbitrary `metadataURI` per
seller. The URI resolves to a JSON file for the relevant participant
surface. Agents simply include a `services` key in that JSON.

No new contracts are needed:
- **Identity** → `SellerRegistry` already handles this (metadataURI)
- **Reputation** → Bond-weighted settlement history is strictly superior to
  ERC-8004's permissionless feedback (which has Sybil vulnerability)
- **Validation** → Buyer dominance + 2× bond asymmetry already enforces
  honesty without independent validators

### Agent Service JSON Convention

An autonomous agent includes a `services` section in its seller metadata.
The clause can be anchored in `ClauseRegistry` as
`erc8004-agent-services-v1` for reference integrity.

```json
{
  "subjectAddress": "0xAgent...",
  "name": "Driver Agent #42",
  "description": "Multi-stop delivery optimization agent",

  "services": {
    "mcp": "https://agent-42.example.com/mcp",
    "a2a": "https://agent-42.example.com/a2a",
    "rest": "https://agent-42.example.com/v1",
    "did": "did:web:agent-42.example.com"
  },

  "capabilities": [
    "route-optimization",
    "live-eta",
    "proof-of-delivery",
    "multi-stop-batching"
  ],

  "acceptedTokens": [
    { "address": "0xUSDC...", "symbol": "USDC" },
    { "address": "0xFIG...", "symbol": "FIG" }
  ]
}
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `services.mcp` | URL | Model Context Protocol endpoint |
| `services.a2a` | URL | Agent-to-Agent protocol endpoint |
| `services.rest` | URL | REST API base URL |
| `services.did` | `did:web:...` | W3C did:web identifier — resolves to a DID Document via HTTPS |
| `services.ens` | string | ENS name |
| `capabilities` | string[] | Self-declared capability tags |

All fields are optional. An seller with no `services` key is a
human-operated participant — the default case. Frontends detect agent
status by checking for the presence of the `services` key.

### did:web Identity Resolution

The `services.did` field uses the W3C [did:web Method Specification](https://w3c-ccg.github.io/did-method-web/).
A `did:web` identifier resolves to a DID Document hosted at a well-known
HTTPS URL:

- `did:web:example.com` → `https://example.com/.well-known/did.json`
- `did:web:example.com:sellers:alice` → `https://example.com/sellers/alice/did.json`

The DID Document contains verification methods with the seller's
Ethereum address in CAIP-10 format (`eip155:<chainId>:<address>`),
enabling cryptographic verification that the DID controller matches
the on-chain seller address.

```json
{
  "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/suites/secp256k1recovery-2020/v2"],
  "id": "did:web:agent-42.example.com",
  "verificationMethod": [{
    "id": "did:web:agent-42.example.com#controller",
    "type": "EcdsaSecp256k1RecoveryMethod2020",
    "controller": "did:web:agent-42.example.com",
    "blockchainAccountId": "eip155:1:0xAgent..."
  }],
  "authentication": ["did:web:agent-42.example.com#controller"],
  "service": [{
    "id": "did:web:agent-42.example.com#mcp",
    "type": "MCPEndpoint",
    "serviceEndpoint": "https://agent-42.example.com/mcp"
  }]
}
```

The SDK provides `resolveDidWeb()`, `didDocumentMatchesAddress()`, and
`buildSellerDidDocument()` in `@figaro/core/agent` (did:web is an agent-identity
concern). The frontend
provides the `useDidVerification()` hook in
`lib/agent/useDidWeb.ts`.

### Trust Model Difference

| Concern | ERC-8004 | Figaro |
|---------|----------|--------|
| Identity | ERC-721 mint | SellerRegistry event + bond history |
| Trust | Permissionless feedback (Sybil-vulnerable) | 2× bonding equilibrium (MAD) |
| Reputation | Arbitrary int128 ratings | Settlement volume + token acceptance |
| Validation | External provers (zkML, TEE) | Buyer dominance + on-chain evidence |

An agent that has settled 1,000 orders with 2× bonds locked each time
has proven more than any number of ERC-8004 feedback scores can convey.
The bonding mechanism IS the validation layer.
