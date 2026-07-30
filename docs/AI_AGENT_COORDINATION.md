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

## "Agent" names two worlds — pin the referent before reasoning

Pre-defined agents are **operator-private by default**; "public" is the exception, only when explicitly designed for it.

- **Public ecosystem agents** (this document's subject; any user, acting for their own wallet, never the repo) are prompt definitions in `ecosystem-agents/`, one per capacity:
  - **`figaro-operator`** — *operate* a wallet: sign every transaction on the owner's behalf (accept, resolve, originate, attest) using `@figaro/sdk/agent`, guided by the owner's policy (HITL by default; refuse-all until a rule is set). Role is read from process state, so the same operator is buyer in one process and seller in another.
  - **`figaro-clause-author` / `figaro-assembly-designer`** — author or **fork** a clause/assembly and register it on the permissionless registries (spec/`DesignDraft` → IPFS → `ClauseRegistry`/`AssemblyRegistry`, under the **user's** key). The artifact belongs to the user (RPGF rewards it).
- **Operator-private repo agents** (the Claude Code subagents that build THIS repo, for the operator only): definitions live in `.claude/agents/*.md`. They touch the repo (that is their job); nothing in this document applies to them.

---

## The operator — how an agent transacts

The `figaro-operator` prompt (`ecosystem-agents/figaro-operator.md`) is the *how* to this document's *what*: it directs an agent to wire `@figaro/sdk/agent` to a wallet, infer role binding from process state, and act under the owner's policy (HITL by default; a refuse-all floor). The same primitives serve a human at a keyboard and an autonomous agent — a wallet, EIP-712 signatures, on-chain commitments. Any runtime works; the protocol does not care which. Autonomous-vs-HITL is a policy choice, never structural.

---

## The origination handshake — a transport-agnostic wire protocol

Discovery (below) tells an agent *what exists* and *where to reach* a counterparty.
Starting a bonded process together is a second thing: a two-party exchange with a
defined message, defined validation, and a defined transport seam — **a wire
protocol, not a library**. `@figaro/sdk/agent` is one implementation of it
(`sdk/src/agent/coordination.ts`, `originate.ts`); any runtime that speaks the same
envelope and the same rules interoperates without importing it — the same way a
contract integrates through a wire ABI, not a shared codebase.

### The offer envelope

Originating a process is a two-party commit: the buyer builds a commitment and signs
it; the seller must counter-sign the **same** EIP-712 struct before it can land. The
message that carries this is the offer envelope (`CommitmentPayload`):

```jsonc
{
  "commitment": { /* the EIP-712 Commitment: buyer, seller, currency, payment,
                     expectedCumulativeValue, agreementHash, salt, deadline */ },
  "agreement":  { /* the full off-chain agreement whose merkle root == agreementHash,
                     pinned inline so the recipient hydrates everything from one message */ },
  "buyerSig":   "0x…",   // filled by the buyer
  "sellerSig":  "0x…"    // filled by the seller on accept; absent until then
}
```

It serializes to compact JSON (bigints → hex). The envelope is the entire wire
payload — there is no side channel.

### The exchange

1. **Buyer** instantiates a discovered assembly's root order (merges its own terms
   onto the template's clause bag), signs its half, and sends the envelope to the
   seller over a coordination channel.
2. **Seller** runs the anti-tamper gate (below), applies its accept policy, and — if
   accepting — approves its 2× cumulative-value bond and returns the envelope with
   `sellerSig` filled. Declining returns nothing.
3. **Buyer** approves its 2× payment bond and submits the two-party commit. No
   counter-signature ⇒ no commit — **the protocol never fabricates the counterparty's
   signature, it carries it.**

A value-added chain is N handshakes (one per node, each to that node's own seller);
any single decline aborts before any commit lands, and commits submit root-first in
cumulative order so the kernel sees a consistent running total.

### The anti-tamper gate (what a seller MUST check before counter-signing)

A seller counter-signs only an offer that is internally consistent, and **throws** —
never silently declines — on a tampered one:

- the buyer signature is present, and **cryptographically recovers to the named buyer**;
- the named seller is *me*;
- the agreement **hashes to the committed `agreementHash`** (a buyer cannot sign one
  agreement and pin another);
- the agreement's parties match the commitment.

A clean offer the *policy* rejects returns "declined" (no signature); only a malformed
or forged one throws. This gate is the whole reason the handshake is safe between
strangers over an untrusted transport.

### The transport seam

The transport is a one-method interface — `sendOffer(seller, offer) → signed offer | null`
(`CoordinationChannel`). The origination loops depend on **only** that method, so the
wire is genuinely swappable. The SDK ships two implementations: `InProcessChannel` (a
test transport that routes both agents in one process — real sign/validate/bond logic,
only the network elided) and **`HttpChannel`, the first real transport** — the buyer
POSTs the serialized envelope to the seller's endpoint and awaits the counter-signed
reply, and `makeHttpOfferResponder` turns a seller's `OfferHandler` into a
framework-agnostic HTTP handler. `HttpChannel` is **keyed by the coordination endpoint
the seller publishes in its DID Document**: `didWebEndpointResolver` resolves the DID,
verifies the wallet binding, and returns the `service` endpoint to route the offer to
(see "Agent Service Endpoints" below). `verify-origination-http.devnet.mjs` proves a
full bonded process originates over a real socket. Transport is provider-agnostic by
doctrine (XMTP or A2A implement the same interface), the way dispute resolution is not
any one forum.

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

### Settlement Graph → Economic Decision-Making

Agents make economic decisions by monitoring:
- Bond flows and settlement payouts over time (settlement flows)
- Settled courier payments over time (market rate for delivery services)
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
| Driver (AI) | Geo, Process, Capital | Optimize multi-stop routes, update its own catalogue rate |
| Food preparer | Process | Accept/decline orders, manage prep pipeline |
| Buyer | Process, GHG | Place orders, verify disclosures |
| Market observer | Settlement, Geo | Monitor settlement flows, demand density, catalogue coverage |
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
depend on ERC-8004 — the bonding mechanism already provides trust, and the
public, derived settlement history already provides the track record (never
a score, never a gate). However, autonomous agents
that want cross-protocol discoverability can declare ERC-8004-compatible
service endpoints in their `MembersRegistry.metadataURI` JSON.

### Why This Is a Metadata Convention, Not a Contract Change

Figaro's `MembersRegistry` already stores an arbitrary `metadataURI` per
seller. The URI resolves to a JSON file for the relevant participant
surface. Agents simply include a `services` key in that JSON.

No new contracts are needed:
- **Identity** → `MembersRegistry` already handles this (metadataURI)
- **Reputation** → Bond-weighted settlement history is strictly superior to
  ERC-8004's permissionless feedback (which has Sybil vulnerability)
- **Validation** → Buyer dominance + 2× bond asymmetry already enforces
  honesty without independent validators

### Agent Service JSON Convention

An autonomous agent includes a `services` section in its seller metadata.
The clause can be anchored in `ClauseRegistry` as
`erc8004-agent-services` for reference integrity.

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
    { "address": "0xF10R1N...", "symbol": "FLORIN" }
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

The SDK provides `resolveDidWeb()`, `didDocumentMatchesAddress()`,
`extractServiceEndpoints()`, and `buildSellerDidDocument()` in `@figaro/sdk/agent`
(did:web is an agent-identity concern). Together these close the discovery→handshake
loop: resolve the DID, verify the wallet binding with `didDocumentMatchesAddress()`,
then pull the coordination endpoint with `extractServiceEndpoints(doc, "MCPEndpoint")`
(or whichever transport type the caller speaks) — that endpoint is where the
origination offer is routed. The frontend provides the `useDidVerification()` hook in
`lib/agent/useDidWeb.ts`.

### Trust Model Difference

| Concern | ERC-8004 | Figaro |
|---------|----------|--------|
| Identity | ERC-721 mint | MembersRegistry event + bond history |
| Trust | Permissionless feedback (Sybil-vulnerable) | 2× bonding equilibrium (MAD) |
| Reputation | Arbitrary int128 ratings | Settlement volume + token acceptance |
| Validation | External provers (zkML, TEE) | Buyer dominance + on-chain evidence |

An agent that has settled 1,000 orders with 2× bonds locked each time
has proven more than any number of ERC-8004 feedback scores can convey.
The bonding mechanism IS the validation layer.
