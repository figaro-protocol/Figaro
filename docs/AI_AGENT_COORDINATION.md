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

Pre-defined agents are **maintainer-private by default**; "public" is the exception, only when explicitly designed for it.

- **Public ecosystem agents** (this document's subject; any user, acting for their own wallet, never the repo) are prompt definitions in `ecosystem-agents/`, one per capacity:
  - **`figaro-operator`** — *operate* a wallet: sign every transaction on the owner's behalf (accept, resolve, originate, attest) using `@figaro/sdk/agent`, guided by the owner's policy (HITL by default; refuse-all until a rule is set). Role is read from process state, so the same operator is buyer in one process and seller in another.
  - **`figaro-clause-author` / `figaro-assembly-designer`** — author or **fork** a clause/assembly and register it on the permissionless registries (a Layer-A `ClauseSpec` / an `AssemblyTemplate` → IPFS → `ClauseRegistry`/`AssemblyRegistry`, under the **user's** key). The clause or assembly belongs to the user (RPGF rewards it).
- **Maintainer-private repo agents** (the Claude Code subagents that build THIS repo, for the maintainer only): definitions live in `.claude/agents/*.md`. They touch the repo (that is their job); nothing in this document applies to them.

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
  "commitment": { /* the EIP-712 Commitment: processId, buyer, seller, currency, payment,
                     expectedCumulativeValue, agreementHash, salt, deadline */ },
  "agreement":  { /* the full off-chain agreement whose merkle root == agreementHash,
                     pinned inline so the recipient hydrates everything from one message */ },
  "buyerSig":   "0x…",   // filled by the buyer
  "sellerSig":  "0x…",   // filled by the seller on accept; absent until then
  "buyerFunding":  { /* OPTIONAL — the buyer's swap-funded bond leg, witness-signed:
                        when present, whoever broadcasts routes through
                        WitnessSwapAndCommitCoordinator.swapAndCommit, not the kernel's
                        commit. Absent when the buyer self-funds. */ },
  "quoteRequest":  { /* OPTIONAL — present ONLY on an RFQ quote-request draft, naming the
                        pricedFields the candidate may re-price. Absent on every offer. */ }
}
```

It serializes to compact JSON (bigints → hex). The envelope is the entire wire
payload — there is no side channel.

Two of the commitment's fields carry rules a hand-rolled implementation gets wrong:

- **`processId`** — a ROOT commitment signs `ZERO_PROCESS_ID` (32 zero bytes) and the
  kernel derives the real id at commit; a sub-order carries the root's DERIVED id. Signing
  a made-up id for a root is a commit that never lands.
- **`deadline` is CHAIN time, and it is mandatory.** The kernel compares it against
  `block.timestamp` and reverts `DeadlineExpired`; the SDK's origination calls take
  `deadline` as a REQUIRED parameter with no default, precisely so nobody reaches for the
  host clock. Read it from the chain (`readChainTimestamp`) and offset from there
  (`computeDeadline`) — wall-clock drift between a signer's machine and the chain expires
  offers that both parties signed in good faith.

### The exchange

1. **Buyer** instantiates a discovered assembly's root order (merges its own terms
   onto the template's clause bag), signs its half, and sends the envelope to the
   seller over a coordination channel.
2. **Seller** runs the anti-tamper gate (below), applies BOTH of its decision floors
   (below), and — if accepting — approves its 2× cumulative-value bond and returns the
   envelope with `sellerSig` filled. Declining returns nothing.
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
- the agreement's parties match the commitment;
- **and, when the checker holds the clause specs, the terms inside the agreement do not
  contradict the struct.** The hash check above proves the document is the one the buyer
  signed; it says nothing about whether that document's TERMS match the execution data.
  Currency and payment live in both places at once — as merkle leaves under
  `agreementHash` and as fields of the kernel commitment — so the gate additionally
  asserts leaf == struct on both, plus pin == leaf wherever the assembly composes a
  denomination pin, and refuses any section that violates its own clause spec (a missing
  required term included). In the SDK this is `validateOffer`'s fourth parameter, a
  `SpecSource` built from the live `ClauseRegistry → IPFS` specs; **a leaf/struct
  contradiction is treated as TAMPER — it throws, exactly like a forged signature.**
  Without a `SpecSource` this half is skipped, and the offer is counter-signed with no
  content check whatsoever: the check is only as present as the specs the checker loaded.

A clean offer a *decision floor* rejects returns "declined" (no signature); only a
malformed, forged, or term-contradicting one throws. This gate is the whole reason the
handshake is safe between strangers over an untrusted transport.

### The seller's decision model — two floors, both opt-in, both decline by default

The gate above answers "is this offer honest?". Whether to counter-sign an honest offer is
a second question, and the answer is **no** until the operator says otherwise — twice.
Counter-signing bonds the seller 2× an attacker-chosen `expectedCumulativeValue` in an
attacker-chosen `currency`, so autonomy is opt-IN at two independent seams:

- **The business floor (`accept`)** — an operator-written predicate over the offer. Omit
  it, or return false, and the offer is declined.
- **The economic floor (`OfferPolicy`)** — bounds on the fields the seller bonds against:
  `requireRootShape` (a root order signs `processId` zero and `expectedCumulativeValue ==
  payment`; omit it for a seller serving sub-orders in a chain), `currencyAllowlist` (the
  operator's own currencies — never a bundled token list), and `maxValue` (the magnitude
  cap). Omit the policy and every offer is declined; supply one that omits the allowlist or
  the cap and it REJECTS rather than waving the offer through — an empty allowlist vouches
  for no currency, an absent cap bounds no magnitude.

Both floors decline (return nothing), never throw — a throw stays reserved for tamper. A
seller-side handler registered bare therefore answers every stranger with silence, which is
the correct default for a wallet that has not yet been told what it is willing to bond.

### The transport seam

The transport is a one-method interface — `sendOffer(seller, offer) → signed offer | null`
(`CoordinationChannel`). The origination loops depend on **only** that method, so the
wire is genuinely swappable. The SDK ships three implementations: `InProcessChannel` (a
test transport that routes both agents in one process — real sign/validate/bond logic,
only the network elided), `A2aChannel` (below), and **`HttpChannel`, the first real transport** — the buyer
POSTs the serialized envelope to the seller's endpoint and awaits the counter-signed
reply, and `makeHttpOfferResponder` turns a seller's `OfferHandler` into a
framework-agnostic HTTP handler. `HttpChannel` is **keyed by the coordination endpoint
the seller publishes in its DID Document**: `didWebEndpointResolver` resolves the DID,
verifies the wallet binding, and returns the `service` endpoint to route the offer to
(see "Agent Service Endpoints" below). `verify-origination-http.devnet.mjs` proves a
full bonded process originates over a real socket. Transport is provider-agnostic by
doctrine — `A2aChannel` (`sdk/src/agent/a2aChannel.ts`, with `makeA2aOfferResponder`
on the seller side) implements the same `CoordinationChannel` interface over the A2A
message format, and XMTP can too — the way dispute resolution is not any one forum.

---

## How an agent derives each graph

The five graphs are `PUBLIC_GRAPH_MODEL.md`'s; this section is how a reader gets from logs
to a view. None of them is a feed to subscribe to — each is a derivation over events plus
the documents those events commit to.

### Process graph — events, reconstructed

`fetchCoreEvents(client, addresses, fromBlock)` then `reconstruct(events)` (`@figaro/sdk`)
returns the processes as a map; `FigaroContext.sync()` (`@figaro/sdk/agent`) does both and
adds the live registry catalogue. What a wallet may then DO is read off that state
(`proposeActions` / `proposeInitiations`, above), never off a stored role.

Two things the kernel does not hold, which no amount of querying will produce:

- **There is no pending order and no open job board.** `OrderState` is `Active` or
  `Resolved` — an order exists only once BOTH signatures committed it. An offer awaiting
  acceptance lives on the coordination channel, so work reaches a seller by being ROUTED to
  it (`makeSellerOfferHandler`, or the race / RFQ handlers), not by the seller finding it on
  chain.
- **There is no unfilled edge.** The kernel sees a linear chain of commits against a
  monotonic accumulator; parent-order edges are a committed TERM — `figaro-topology`'s
  `parentOrderHashes`, empty for a root — so the DAG is reconstructed off-chain from
  agreements, never queried from the kernel.

Settlement history is derivable — `OrderResolved` / `ProcessResolved` per address, in
`blockNumber` order — and it is a record, not a rating: nothing scores it and nothing gates
on it. Read it knowing `fetchCoreEvents` is direct-path by construction; attestations are
the one stream that folds both settlement universes (`fetchAttestationRecords`), so an
address absent from a reconstruction has not necessarily been idle.

### Geo graph — locality under a DECLARED standard

`figaro-geolocation` commits `origin` and `destination` under a required
`geocodeStandard`, and that axis is open: cell grids (geohash, h3, s2, olc) and
jurisdiction codes (iso3166-1/-2, unlocode) are equally valid declarations, and geohash is
one value of the field — the built frontend's default — never the model. So the first move
on any locality read is the standard the leaf DECLARES; a reader that speaks one standard
skips the leaves it cannot parse rather than misreading them.

Where the declared standard is geohash, `@figaro/sdk/derive` ships the readers:
`geohashCommonPrefix` (shared-prefix length as coarse proximity), `geohashesMatch(a, b,
precision)` — **the precision is the caller's parameter, not a protocol constant** —
`geohashCentroidDistanceKm`, `encodeGeohash` / `decodeGeohash`, `haversineDistance`.
Another declared standard needs its own reader; nothing in the protocol privileges one.

Locality as EVIDENCE of where work happened is a different clause and a different surface:
`figaro-proximity-policy` commits the acceptable detection `bands` and its stage-1
attestation records the band actually witnessed. Any aggregate over zones is aggregation
the reader performs, bounded by which orders composed a locality clause at all.

### Disclosure graph — a committed methodology plus a declared stage

`figaro-emissions` commits one term, `standard` (the methodology), and declares a **stage-1**
evidence shape: `gramsCO2e` plus an optional `evidenceUri`. That is the machinery in
general form — a spec's `stages` maps a stage number (the same `stage` the
`AttestationCoordinator` event carries) to the field shape of the evidence filed at it, so
one generic reader handles a never-seen clause: `validateContent(content, spec, { stage: 1 })`
routes to the stage fields, and the identical content fails against the committed-content
shape, which is the point.

The stream is `fetchAttestationRecords` (both universes), sliced by `filterByClause` /
`filterByStage` / `filterByProcess` / `filterByOrder` (`@figaro/sdk/derive`). Of the
evidence itself a record carries only `contentRef = keccak256(content)`, so a report is
assembled by fetching pre-images and checking them against the anchors —
`/audit/view?process=` is the built example of that assembly.

Derivable: which orders committed a methodology, and which filed evidence against it.
**Not derivable: whether the disclosure is substantively true** — the protocol ensures
referential integrity, not accuracy (`PUBLIC_GRAPH_MODEL.md` §3).

### Settlement graph — the figures, and what is derived from them

`OrderCommitted` carries `payment` and `cumulativeValue`. The bonds are **not stored** —
they are derived at the invariant 2×, `calculateBonds(cumulativeValue, payment)` →
`{sellerBond, buyerBond, totalLocked}`, with `calculateSettlement` for the payouts. Timing
comes from the events' `blockNumber`: commit-to-resolve is a chain interval, never a host
clock reading.

Aggregate what the events actually name — value by currency, by seller, by assembly. A
clearing price is not a network object: whoever wants one computes it over the orders they
chose to treat as comparable, and the protocol neither publishes that comparison nor
endorses it.

### Cross-process graph — provenance from committed hashes

Two committed terms carry it: `figaro-assembly-provenance`'s `compositionHash` (which
registered assembly a process instantiated — the same value the once-per-process assembly
credit is claimed from, which counts only while that composition holds a live
`AssemblyRegistry` binding) and `figaro-topology`'s `parentOrderHashes` (the edges the
kernel does not store). Both are merkle leaves under `agreementHash`, so a provenance claim
is verifiable by inclusion proof against the on-chain root instead of trusted from an index.

That supports asking which processes instantiated a given assembly and how their orders
relate. It does not support "template compliance": nothing on chain compares a live
agreement against the template it came from. What IS enforced is that every composed
section validates against its clause spec before a signature is emitted
(`assertAgreementSignable`) and, on the batched path, inside the proof.

---

## Coordination signals — what the network actually emits

THEORY.md calls these signals **economic pheromones**, and the metaphor is exact about
one thing: nobody emits them for anybody else. There is **no signalling channel, no
broadcast, no ranking and no analytics feed** — every signal below is an ordinary event
or view, written because some wallet did something for its own account. Any aggregate
picture is the reader's own derivation, never a surface someone maintains.

What is emitted, and what each thing is evidence of:

- **A wallet published a profile, and staked to keep it surfaced.**
  `MembersRegistry.MemberRegistered(member, metadataURI)` and `MemberProfileUpdated`; the
  URI resolves to the member-profile document (`parseMemberProfileDocument`) carrying the
  name, optional branding, accepted tokens, an optional `catalogueURI`, and optional
  `services`. `MemberWithdrawalRequested` / `MemberWithdrawn` are the same signal run
  backwards. Evidence of: a counterparty holding a live, reclaimable ETH deposit — never a
  score, never a gate.
- **New terms and new deal-shapes exist.** `ClauseRegistry.ClauseRegistered` and
  `AssemblyRegistry.AssemblyRegistered` carry the author and a `contentURI`; the content
  resolves chain → IPFS. Either registry's `DepositWithdrawn` de-surfaces the entry for new
  compositions while every agreement already bound to it keeps resolving.
- **Someone bonded.** `FigaroCore.OrderCommitted`, with `OrderSeller` and `OrderCurrency`
  beside it: a value at one link of a chain, in a named token, backed 2×. The TERMS behind
  it are merkle leaves under `agreementHash` — the chain holds the root; the document is
  fetched from wherever it was pinned, and a fingerprint whose pre-image is unreachable is
  party-private by design, not a hole in the data.
- **Work advanced.** `AttestationCoordinator.Attestation(orderHash, processId, attester,
  clauseId, stage, contentRef)`. `clauseId` and `stage` are what make the stream readable
  without knowing any clause in advance — `filterByClause` / `filterByStage` /
  `filterByProcess` (`@figaro/sdk/derive`) slice it. `contentRef` is `keccak256(content)`;
  the pre-image never enters calldata.
- **A process ended.** `OrderResolved` and `ProcessResolved` — the whole process settling
  at once on the buyer's single call, atomically and terminally.
- **What the network is actually composed OF.**
  `UsageCounter.UsageRecorded(clauseOrAssembly, period, processId, seller, c, d, score)`,
  plus `BatchUsageRecorded` on the batch path (cumulative — it REPLACES rather than adds);
  `scoreOf(clauseOrAssembly, period)` sums both. The `d` term counts DISTINCT LIVE-STAKED
  sellers, so it reads as adoption breadth priced at one deposit per seller — the nearest
  thing on the network to a demand signal for a clause or an assembly. It exists only
  because buyers call `recordProcessUsage` at settlement; unrecorded usage is permanently
  deniable.

**Where, when, how much, and under what standard are clause TERMS, not signal types.** A
location, a window, a temperature range or a credential is a filled field of whatever
clause the designer composed, so an agent finds it by declared FIELD
(`specDeclaresField`) against the spec it fetched, never by clause id — and finds nothing
where no such clause was composed. Absence is absence: a wallet that emitted no signal is
unknown, not idle, and nothing stands in for it.

Whether these signals add up to a usable map of the network is therefore not a protocol
guarantee — it depends on which clauses got composed and filled
(`PUBLIC_GRAPH_MODEL.md` § "Why the flow-map gets built" owns that incentive argument;
the economics it serves are `VISION.md`'s).

---

## What an agent does — the five nouns, derived

**There is no agent type, and nothing to look one up in.** The protocol admits any signer
on equal footing and stores no role, species or capability field: what a wallet may do
right now is DERIVED — from its position in a process (read from chain state) and from the
specs of the clauses that process composed. The things anyone does are the protocol's five
nouns; an agent does them with the same calls any UI makes, and one wallet commonly holds
several at once — buyer in one process, seller in another, author of the clause a third
composes.

- **Buyer** — derived as `process.rootBuyer == my address`; nothing configures it.
  `proposeActions(process, myAddress)` (`@figaro/sdk/agent`) returns the buyer's actions on
  a synced process — `resolve-process` (only the buyer can end one, atomically and
  terminally) and `attest-as-buyer`; `proposeInitiations(ctx.getAssemblies(), myAddress)`
  returns the processes the wallet could START, one per discovered assembly. Origination is
  `originateProcess` / `originateChain` (the handshake above); resolution is
  `resolve-process` followed in the same breath by `recordProcessUsage`, without which the
  process credits no clause author and no assembly designer.
- **Seller** — derived as an order naming my address as its seller; the same
  `proposeActions` call returns `attest-as-seller` for it. Work arrives through the
  handshake — `makeSellerOfferHandler` (the anti-tamper gate plus two decline-by-default
  floors), `makeSellerRaceHandler` / `makeSellerQuoteHandler` on the formation legs. Being
  DISCOVERABLE is `MembersRegistry.register(metadataURI)`; being REACHABLE for inbound
  offers is a `services` endpoint inside that profile. Two different things, and neither is
  a status.
- **Clause author** — no process role at all:
  `ClauseRegistry.registerClause(clauseId, version, contentHash, contentURI)` under the
  author's own key, over a spec pinned off-chain. Permissionless, first-write-wins,
  deposit-backed; the capacity's prompt is `ecosystem-agents/figaro-clause-author.md`.
- **Assembly designer** — `AssemblyRegistry.registerAssembly(compositionHash, contentURI)`
  over a published template. Composition is the designer's act and happens only there,
  never mid-checkout and never mid-process (`OPEN_WORLD.md` §1, pattern 1); the prompt is
  `ecosystem-agents/figaro-assembly-designer.md`.
- **Composition** — dispatched from the spec, never from a table the agent carries: a
  clause declares what it composes with in `block.design.composes` (`interface` names a
  standard composition interface; `forumUrl` deep-links a provider's own web UI), and the
  concrete on-chain instance is chain-specific and supplied at runtime. An agent routes to
  what the composed clause DECLARES — which is why a forum, a swap route or a fiscal leg it
  has never heard of still resolves.

Reading needs none of this and no wallet: `fetchCoreEvents` + `reconstruct` (`@figaro/sdk`)
run against an RPC endpoint and an IPFS gateway, which is the whole permission model for
observing the network.

---

## Design Implications

1. **No API keys**: All graph data is on-chain or in public events. Any agent
   can index it without platform permission.
2. **No rate limits**: Coordination throughput is limited by block space, not
   by platform-imposed throttling.
3. **No data moats**: Competitors and collaborators see the same signals.
   Advantage comes from better *interpretation*, not better *access*.
4. **Spec-routed agents port; example-shaped ones don't**: an agent that routes by the
   fields a clause DECLARES — read from the spec it fetched (`specDeclaresField`) — works
   over every assembly composing that clause, whoever authored it and whatever is being
   traded. One that branches on a clause id, an assembly, or a worked example works until
   the next registration. Local commerce is one example among unbounded kinds, never the
   model: even the geocode standard is a declared value (`figaro-geolocation`'s
   `geocodeStandard`), so "geohash" is content in a document, never an assumption in code.

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
- **Reputation** → Figaro issues none. The settlement record is public and
  any counterparty may weigh it; the protocol keeps no score, and nothing
  gates on history (ERC-8004's permissionless feedback is Sybil-vulnerable
  precisely because it reifies a score)
- **Validation** → Buyer dominance + 2× bond asymmetry already enforces
  honesty without independent validators

### Agent Service JSON Convention

An autonomous agent includes a `services` section in its member metadata.
The convention lives in the member profile document itself — it is member
metadata, not a clause, and gets no registry anchoring.

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

All fields are optional. A `services` key declares **coordination reachability, not
species**: it says "an inbound offer, race draft or quote request routed to this endpoint
will get an answer." Its absence means only that the wallet publishes no inbound endpoint —
unreachable for inbound offers, and reachable by every other route (a human at a keyboard,
an agent that originates outbound, a wallet coordinated out of band). It does not mean
"human."

**There is no agent status to detect.** The protocol admits any signer on equal footing and
records no species anywhere: autonomy is a policy choice about how a wallet decides, never a
structural property of the wallet (see "The operator" above). A surface that branches on the
presence of `services` is branching on *routability* — which endpoint, if any, to POST an
offer to — and must not present that as identifying who or what is behind the key.

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
origination offer is routed. The frontend provides the `useDidDocument()` and
`useDidConsistency()` hooks in `lib/agent/useDidWeb.ts` (consistency, not proof —
the DID wallet-binding check is routing hygiene; authentication stays with the
envelope signatures).

### Trust Model Difference

| Concern | ERC-8004 | Figaro |
|---------|----------|--------|
| Identity | ERC-721 mint | MembersRegistry event + bond history |
| Trust | Permissionless feedback (Sybil-vulnerable) | 2× bonding equilibrium (MAD) |
| Reputation | Arbitrary int128 ratings | None issued — an open settlement record the reader weighs |
| Validation | External provers (zkML, TEE) | Buyer dominance + on-chain evidence |

An agent's settlement record states facts — which orders it was on, what it
bonded, how each resolved — and a counterparty reads and weighs that record
for itself; no score summarizes it and no gate consumes it. The bonding
mechanism IS the validation layer.
