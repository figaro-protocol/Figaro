# @figaro-protocol/sdk

TypeScript SDK for the Figaro Protocol — self-enforcing agreements between strangers.

Event parsing, state reconstruction, EIP-712 commitment building, bond math,
agent coordination, the template→orders projection, and the runtime handoff
key-agreement. Three runtime dependencies: `viem`, plus `@noble/curves` +
`@noble/hashes` for the handoff ECDH/AES-GCM (audited, zero-dependency crypto).

## Install

```bash
npm install @figaro-protocol/sdk viem
```

`viem` is a **peer dependency**, not a bundled one (`sdk/package.json` declares
`"peerDependencies": { "viem": "^2.55.1" }`) — install it explicitly alongside
the SDK, or the first chain call throws a missing-module error rather than a
Figaro-shaped one.

> **Provenance:** `@figaro-protocol/sdk` is live on the npm registry with a
> Sigstore provenance attestation binding the tarball to this repository and
> the workflow that built it — `npm audit signatures` verifies it downstream.
> Working from a repo checkout instead? Wire `"@figaro-protocol/sdk": "file:../sdk"`
> (build it first: `npm run build --workspace sdk` from the repo root).

**Trap — a consumer `npm install` can DELETE the SDK's `dist/`.** Read this
before you wire the `file:` dependency; it is the one way to make the SDK
unimportable by following its own install instructions.

Installed from the **registry** (`npm install @figaro-protocol/sdk`)? It cannot
reach you — npm never runs a registry dependency's `prepare`, so nothing re-runs
the `rm -rf dist` below: measured, the published tarball's `dist/` arrives intact
with no `tsc` anywhere on `PATH`, and if you ever delete it, a plain
`npm install @figaro-protocol/sdk` re-extracts it. What follows is
**repo-checkout-only**.

`sdk/package.json` declares `"prepare": "npm run build"`, and npm runs a `file:`
dependency's `prepare` on **every** consumer install. `build` is
`rm -rf dist && tsc`. The `rm` always succeeds. So if `tsc` cannot be resolved
from the SDK's own directory, the rebuild dies with `sh: tsc: command not found`,
the install exits `127`, and `dist/` is **gone** — the package the README just
told you to install no longer has an entry point (`Cannot find package
'@figaro-protocol/sdk'`). `--ignore-scripts` does **not** save you: measured, npm runs the
linked package's `prepare` regardless and `dist/` still goes.

`tsc` is a devDependency of the `sdk` workspace, hoisted to the **checkout
root's** `node_modules`. That is the whole fix — do this once, in this order,
before the consumer install:

```bash
git clone https://github.com/figaro-protocol/Figaro && cd Figaro
npm install                       # root: hoists typescript for the sdk workspace
npm run build --workspace sdk     # produces sdk/dist
```

…and point `file:` at the `sdk` directory **inside that checkout**, never at a
copy you moved somewhere else. Then the consumer's install finds `tsc` up the
directory chain and its `prepare` *rebuilds* `dist/` instead of destroying it.
Already hit it? Nothing is lost: rerun those two commands from the repo root.
(Do not "fix" this by editing `sdk/package.json` — that `prepare` hook is what
keeps the workspace build honest.)

## Your first commit

The shortest path from nothing to a bonded order on chain, on a devnet you own.
Every step is a command in a checkout of the public repo — which is also how you
install the SDK today (see Install above). Nothing here is hosted by anyone: your
Anvil, your IPFS node, contracts you deployed, the standard public Anvil test
keys. The SDK calls are the same ones you make against a public chain; only the
addresses, the RPC URL and the signer change.

**1. Bring up the devnet.** From the repo root:

```bash
./scripts/devup.sh
```

One shot, idempotent, safe to re-run: clean-rebuilds `sdk/dist`, ensures Anvil on
`:8545` and a Kubo daemon (API `:5001`, gateway `:8080`), deploys the protocol
stack, and pins every clause spec to IPFS + anchors it on `ClauseRegistry`. It
writes the deployed addresses to `frontend/.env.local` (and
`.deployments/local.json`) — that file is where every step below reads addresses
from. It installs nothing: run `npm install` once at the repo root first (that
is what puts `tsc` where the SDK build below finds it — see the Install trap
above), and Foundry (`anvil`, `cast`) plus a running Kubo must already be there.
Full prerequisites, env vars and the native-Kubo recipe: `docs/LOCAL_DEV.md`.

**2. Put something on the network to discover.** A fresh chain is an EMPTY
network — no assemblies, no members, nothing to buy, and discovery correctly
returns nothing. Fill it either way:

- **the real path**, identical to what you would do on a public chain: publish a
  profile + catalogue (`MembersRegistry` — "Member Profile + Catalogue
  Documents" below) and register an assembly
  (`AssemblyRegistry.registerAssembly`), each against its registration deposit;
- **the shortcut**, to reach a commit today — the repo's test seeder, which
  registers a few seed assemblies and sellers through those same contracts:

```bash
cd frontend && node scripts/populate-test-data.mjs   # idempotent
```

**3. Build the SDK.**

```bash
npm run build --workspace sdk    # from the repo root; devup already ran it
```

**4. Originate.** `sdk/scripts/verify-origination.devnet.mjs` is the runnable
form of the whole handshake — two agents holding nothing but private keys, no
browser and no human:

```bash
cd sdk && node scripts/verify-origination.devnet.mjs
```

What it does, in order:

1. **Discovers the network.** `new FigaroContext(publicClient, addresses)` +
   `await ctx.sync()` folds the registry event streams into a live catalogue. It
   picks its assembly by HYDRATING each `contentURI` from the IPFS gateway and
   taking the first single-order template — no hardcoded id — and locates the
   commerce clause by the field it DECLARES (`lineItems`), never by clause name.
2. **Registers the seller loop.** `makeSellerOfferHandler(…)` on an
   `InProcessChannel`, with both refusal floors filled in explicitly (an `accept`
   business rule plus an economic `policy` bounding currency and magnitude) and
   the registry-built `SpecSource` (`specs`), which arms the merkle-leaf sign
   gate. A handler missing either floor declines every offer.
3. **Runs the buyer loop.** `originateProcess(…)` instantiates the discovered
   template's root agreement with the buyer's overrides, runs the merkle-leaf
   sign gate (`assertAgreementSignable` — every section conforms to its spec,
   and the currency/payment TERMS equal the commitment struct's mirrors; a
   missing required term or a leaf/struct contradiction refuses to sign), signs
   the EIP-712 commitment against a CHAIN-time deadline (`readChainTimestamp` +
   `computeDeadline` — never the machine clock), and hands the offer to the
   channel. The seller re-hashes the agreement against the committed
   `agreementHash`, runs the same gate through its own `specs`, applies its
   floors, approves its 2× bond and counter-signs. The buyer approves its own
   2× bond and submits `FigaroCore.commit`.
4. **Asserts what landed.** The commit receipt must be `success`: one
   `OrderCommitted` on the kernel, both bonds pulled into it.
5. **Reads it back out of band.** A second `ctx.sync()`, then
   `ctx.getProcessesAsBuyer(buyer)` — the process is found from chain events,
   not from the return value of the call that created it, carrying the expected
   seller and payment.

A green run prints:

```
✓ discovered a single-order seed assembly
✓ located the commerce clause by its declared field
✓ origination returned a tx (seller counter-signed, commit submitted)
✓ initiate-process commit landed on chain (status success)
✓ the originated process is discoverable on chain with the right seller + payment

AUTONOMOUS ORIGINATION PROVEN — no human in the loop
```

Three siblings run the same recipe with exactly one thing changed:
`verify-origination-chain.devnet.mjs` (a three-order value-added chain, one
seller taking two of the nodes), `verify-origination-http.devnet.mjs` (the
offer envelope crosses a real HTTP socket instead of the in-process channel),
and `verify-origination-a2a.devnet.mjs` (the same envelope rides the A2A
JSON-RPC interop wire via `A2aChannel`).

**5. Close it — the buyer resolves.** The script stops at a live bonded process,
which is the state the mechanism is about. Ending it is a single call, and only
the buyer can make it:

```ts
import { proposeActions, executeAction } from "@figaro-protocol/sdk/agent";

// The proposer rebuilds the commitment structs resolveProcess needs from the
// events themselves — nothing had to be stored client-side.
const [resolve] = proposeActions(ctx.getProcess(processId)!, buyer)
  .filter((a) => a.type === "resolve-process");
await executeAction(walletClient, publicClient, addresses, resolve);

// AND RECORD THE USAGE — at settlement, not later. The RPGF path pays clause
// authors and assembly designers from records the BUYER's side writes when the
// process resolves; a deferred record is permanently deniable (a seller can
// unstake, a period can close — docs/DESIGN_DECISIONS.md §21). One call, the
// headless twin of what the frontend does at the same moment. The mandatory
// clauses EARN — commerce and topology are scored for their author of record
// like any other — so the only routine revert inside it is the excluded
// figaro-assembly-provenance leg (attribution plumbing; its designer accrues
// through recordAssemblyUsage instead). Read the report, not the absence of an
// exception, and read excludedClauseOrAssembly(key) off the deployment you are
// calling rather than assuming any list:
import { instantiateRootAgreement, recordProcessUsage } from "@figaro-protocol/sdk/agent";
// The agreement is REBUILT, never stored: step 4's template + the same overrides and
// specs re-instantiate it identically, and its merkle root IS the committed
// `agreementHash` the counter opens each section's proof against. Note the return
// shape: this is the bare Agreement — when you need its hash, compute it with
// `computeAgreementHash(agreement)` (root export); only `buildOrderAgreement`
// returns the `{ agreement, agreementHash }` pair.
const agreement = instantiateRootAgreement(template, { buyer, seller: resolve.commitments[0].seller, overrides, specs });
const report = await recordProcessUsage(walletClient, publicClient, addresses.usageCounter!, [  // optional on the record type; present on every shipped record
  { commitment: resolve.commitments[0], agreement }, // the agreement each order signed
]);
```

Every order in the process settles atomically, `ProcessResolved` lands, and the
process reads `resolved` on the next `ctx.sync()`. No timeout, no arbitrator, no
third party who can do this instead — and resolution is terminal. A buyer agent
that resolves without recording credits no author and no designer — the reward
mechanism's uniformity across actors is exactly this call.

**Two things bite here. Both are silent.**

*The two `processId`s.* `resolveProcess(bytes32 processId, Commitment[]
commitments)` takes **two different ids that share a name**, and they are not
interchangeable: the ARGUMENT is the kernel's DERIVED process id (the storage
key it looks the process up by), while every struct INSIDE `commitments` must be
the one the parties SIGNED — and a root order signed `processId = 0`. The kernel
recomputes `keccak256(processId ‖ hashStruct(c))` from both
(`src/kernel/FigaroCore.sol:280-285`), so putting the derived id inside the root
struct — the natural move, since that is what `OrderCommitted` carries and what
event reconstruction hands you — yields a hash that matches no committed order
and reverts `OrderNotCommitted`. The bridge is `restoreSignedProcessId(c,
chainId, core)` (root export): it re-derives the id from the struct-as-root and,
if that reproduces the id the event carried, hands the struct back with
`processId = 0`; a genuine sub-order is returned untouched. `executeAction`
(above) applies it to every element for you, which is the reason to prefer it —
the lower-level `resolveProcess(walletClient, core, processId, commitments)`
does NOT, and neither does hand-rolled `cast`.

*`AccrualClosed()`.* `recordClauseUsage` and `recordAssemblyUsage` both open by
calling `UsageCounter.currentPeriod()`, which reverts `AccrualClosed()` once the
last accrual period has ended (`src/protocol/usage/UsageCounter.sol:389-395`) —
the nine annual periods are the RPGF mechanism's whole life, and after the ninth
boundary usage is permanently unrecordable. Two consequences before that day: a
record is attributed to the period **open when you call**, not the one the
process resolved in, so crossing a boundary between resolve and record moves the
credit into the next period's budget and denominator; and `recordProcessUsage`
tolerates per-leg reverts by design, so a closed accrual does not throw — it
returns a report where every leg sits in `failures` and `recorded` is `0`. Check
before you trust a run, and never after: `currentPeriod()` (it reverts, so wrap
it — the revert IS the answer), `periodClosed(uint8)`, `periodCount()`, and
`periodEnd(uint256)` are all in `USAGE_COUNTER_ABI`, and `AccrualClosed()` is in
it too so the revert decodes by name instead of arriving as opaque bytes. This
is the mechanical form of the at-settlement rule: record in the same
transaction batch as the resolve and none of it can happen.

**6. Know the traps before you extend this.** The site's `/pitfalls` page is the
canonical list; the first one a chain integration hits is **sub-order
approval** — every `commit`, root or sub-order, pulls the FULL per-order bond
and nets nothing against bonds the kernel already holds, so approving the
increment reverts inside the settlement token with `ERC20InsufficientAllowance`
while the earlier bonds stay locked until the buyer resolves. Size it with
`calculateSubOrderApproval` and check it with `assertApprovalCoversBond` (both
below).

## Six Entry Points

**The generated API reference — every export, every signature.** TypeDoc over
this same source is served at
[figaroprotocol.com/sdk-api](https://www.figaroprotocol.com/sdk-api/index.html),
one page per entry point — all six: the root package plus `/agent`, `/derive`,
`/clauses`, `/handoff`, and `/signer`. `npm run docs` from `sdk/` regenerates
the whole reference from a checkout. This README stays the
manual — recipes, traps, and the order to do things in; the reference is where
you look a signature up.

### Where each entry point can run

Nothing here is browser-only, and only one thing is Node-only. The column that
matters is the last one: what the entry point actually needs from its host.

| Entry point | Browser | Node | What it needs from the host |
|---|---|---|---|
| root | yes | yes | `fetch` + `AbortSignal` (chain reads through `viem`, IPFS reads); no filesystem, no sockets. Bundles into a UI as-is. |
| `/agent` | yes | yes | Same as root, plus an outbound HTTP request per coordination hop (`HttpChannel`, `A2aChannel`, `SequencerClient`, `did:web` resolution). In a browser those are cross-origin — the counterparty's endpoint must send CORS headers, which is why most agent loops run server-side. |
| `/derive` | yes | yes | Nothing. Pure functions over values you already hold — no chain client, no network. |
| `/clauses` | yes | yes | Nothing but `viem`'s encoders. Parse, validate and encode clause content with no chain and no network at all. |
| `/handoff` | yes | yes | The WebCrypto global (`crypto.subtle`) for AES-GCM: present in Node, and in a browser only in a **secure context** (https, or localhost) — over plain http the wrap/unwrap calls throw. |
| `/signer` | **no** | yes | `node:net`, `node:fs`, `node:crypto`, `node:path` — a UNIX socket and a keystore file. It is a **daemon plus a client**: run the daemon with the `figaro-signer` bin, then `socketSignerAccount` connects to its socket from your Node process. Never bundle this into a browser build. |

Verified by importing each built entry point under bare Node (`sdk/dist/*`),
and by the module graph: `/signer` is the only one that reaches a `node:`
builtin, and `/handoff` the only one that reaches `crypto.subtle`.

### Synopsis — which entry point is each export from?

Nothing is re-exported: **every name below lives in exactly one entry point**,
so this table answers the question you hit while reading a recipe ("was
`attestAsSeller` root or `/agent`?") without scrolling back to an `import`
line. It is a SYNOPSIS, not a reference — one line per export, no signatures.
Scope: **every export a recipe on this page calls.** For the full surface —
every export of all six entry points, with signatures, parameters and types —
[figaroprotocol.com/sdk-api](https://www.figaroprotocol.com/sdk-api/index.html).

Constants follow a rule instead of a row: every `*_ABI`, `EV_*` (event
definition) and `RPGF_*` constant is a **root** export.

| Export | Entry point | What it does |
|---|---|---|
| `A2aChannel` | `/agent` | Coordination channel over the A2A JSON-RPC wire; a declining seller comes back as `null`. |
| `a2aMessageFromOffer` | `/agent` | Wrap a commitment payload as an A2A message for the wire. |
| `ActionQueue` | `/agent` | Typed queue holding proposed actions for human approval before execution. |
| `addressesFromDeploymentRecord` | root | Map a published deployment record's keys onto `FigaroAddresses` — never spread the record. |
| `assertAgreementSignable` | root | The ONE pre-signature thrower: every section conforms to its spec, and the terms equal the struct. |
| `assertApprovalCoversBond` | root | Throws when an approval is short of the full per-order bond the kernel will pull. |
| `attestAsSeller` | `/agent` | Submit a seller attestation for one clause section of a committed order. |
| `buildChainOffers` | `/agent` | Buyer-sign a whole chain's offers, in commit order, through the one template walk. |
| `buildCommitment` | root | Build the `Commitment` struct and the EIP-712 typed data to sign. |
| `buildDomain` | root | The EIP-712 domain for a chain id + `FigaroCore` address. |
| `buildOrderAgreement` | root | Build one order's agreement document and its merkle tree from its clause map. |
| `buildQuoteRequest` | `/agent` | Build an UNSIGNED RFQ draft, priced at the buyer's ceiling. |
| `buildSectionInclusionProof` | root | Merkle proof that one clause section sits under a signed `agreementHash`. |
| `buildSwapWitnessTypedData` | root | Permit2 witness typed data for the swap-and-commit funding leg. |
| `buildUsageClaims` | root | Turn a settled BATCH order plus its agreement into the RPGF claims a sequencer proves. |
| `calculateBonds` | root | `sellerBond = 2 × cumulativeValue`, `buyerBond = 2 × payment`. |
| `calculateRootApproval` | root | The ERC-20 approval each party needs before a ROOT commit. |
| `calculateSettlement` | root | What each party receives after `resolveProcess`: its bond back, and exactly `payment` crossing. |
| `calculateSubOrderApproval` | root | The approval before a SUB-order commit — the FULL bond, never the increment. |
| `canonicalContentHash` | root | `keccak256` over the canonical serialization — the digest the registries anchor. |
| `canonicalize` | root | THE canonical-JSON convention: sorted keys at every depth, array order kept, no whitespace. |
| `checkEndpointLogAgreement` | root | Agreement over the event sets N endpoints returned for one pinned range — pure, caller-fetched. |
| `commit` | `/agent` | Submit `FigaroCore.commit` with both signatures; any holder of the payload may broadcast. |
| `computeAgreementHash` | root | The agreement's merkle root over its sorted section leaves. |
| `computeClauseKey` | root | `keccak256(abi.encode(clauseId, version))` — the registry key, and the attest calls' `clauseId`. |
| `computeDeadline` | root | A deadline from CHAIN time; pair with `readChainTimestamp` — there is no wall-clock fallback. |
| `computeRpgfAllocations` | root | Off-chain mirror of the 600M pro-rata split for a closed accrual period. |
| `computeSectionLeaf` | root | One merkle leaf — double-hashed, so a leaf preimage can never be replayed as an internal node. |
| `counterSignDraft` | `/agent` | Candidate side: validate an inbound race draft and countersign, or decline. |
| `decodeContentFromSpec` | `/clauses` | Canonical ABI bytes back to JSON content — the exact inverse of `encodeContentFromSpec`. |
| `deriveAssemblyWithdrawGate` | `/derive` | Whether an assembly's registration deposit is withdrawable, and what still blocks it. |
| `deriveClauseWithdrawGate` | `/derive` | Whether a clause's registration deposit is withdrawable, and what still blocks it. |
| `deriveInFlightOrders` | `/derive` | Every committed order whose process has not resolved. |
| `deriveSharedSecretAsReceiver` | `/handoff` | ECDH shared secret from the sender's public key and your private key. |
| `deriveSharedSecretAsSender` | `/handoff` | ECDH shared secret from your private key and the receiver's public key. |
| `deserializeCommitmentPayload` | `/agent` | Parse a wire envelope back into a `CommitmentPayload`. |
| `didDocumentMatchesAddress` | `/agent` | Does this DID document name this wallet? A consistency check, never proof of control. |
| `didWebEndpointResolver` | `/agent` | Resolve a seller's coordination endpoint through `did:web`, address-checked. |
| `DISABLED_SWAP_FUNDING_LEG` | root | The inert swap-funding leg — pass it for the party that is not swapping. |
| `encodeContentFromSpec` | `/clauses` | JSON clause content to canonical ABI bytes — one generic encoder, no per-clause path. |
| `executeAction` | `/agent` | The single dispatch point for any `ProposedAction`; restores each root's signed `processId` for you. |
| `extractOverlays` | `/derive` | Group attestations into one overlay graph per clause family PRESENT — the open graph class. |
| `extractServiceEndpoints` | `/agent` | Read a DID document's `service` entries — WHERE to reach the agent behind it. |
| `fetchAttestationRecords` | root | Attestations from BOTH settlement universes, address-filtered and tagged per row. |
| `fetchBatchUsageRecords` | root | `BatchUsageRecorded` events — the batch half of the RPGF mirror. |
| `fetchCoreEvents` | root | Every `FigaroCore` event in a block range, grouped and typed; chunks `getLogs` internally. |
| `fetchDiscoveryEvents` | root | Registry events (clauses, assemblies, members); an unconfigured registry contributes nothing. |
| `fetchEndpointLogAgreement` | root | The same agreement report, fetched from caller-supplied clients over one pinned `[fromBlock, toBlock]`. |
| `fetchUsageRecords` | root | `UsageRecorded` events — the direct-path half of the RPGF mirror. |
| `FigaroContext` | `/agent` | The stateful agent context; `sync()` folds chain events into a live catalogue and process set. |
| `fillCargoSection` | root | Fold the order's summed mass and volume onto its cargo leaf, found by declared field. |
| `fillClassSections` | root | Fold catalogue-authored class values (freight class, hazmat, cold chain, …) onto their leaves. |
| `fillCommerceSection` | root | Write payment, currency and (root only) the cart's line items into the commerce leaf. |
| `fillDerivedSections` | root | Run every logistics fill the order composes — cargo, class, profile, then dimweight. |
| `fillDimweightSection` | root | Billed weight = max(gross mass, volumetric) onto the dimweight leaf. DERIVED, never authored. |
| `fillProfileSections` | root | Fold the seller's profile-authored clause values onto their leaves. |
| `fillProvenanceSection` | root | Write the template's own `compositionHash` into the provenance leaf. |
| `filterByClause` | `/derive` | Narrow attestation events to one clause. |
| `generateOrderKeypair` | `/handoff` | A fresh ephemeral secp256k1 keypair for a single order's handoff. |
| `geohashesMatch` | `/derive` | Do two geohashes agree at a given precision? Default 6 characters. |
| `getRateQuantityResolver` | root | Look up a registered rate-quantity resolver by its source name. |
| `haversineDistance` | `/derive` | Great-circle distance between two lat/lng points, in kilometres. |
| `HttpChannel` | `/agent` | Coordination channel over plain HTTP; `204` is the seller declining, not an error. |
| `InProcessChannel` | `/agent` | In-process channel — both parties run real sign/validate logic; only the wire is elided. |
| `instantiateRootAgreement` | `/agent` | Instantiate a template's ROOT order into the signable agreement; same inputs rebuild it identically. |
| `makeA2aOfferResponder` | `/agent` | Turn a seller's `OfferHandler` into a framework-agnostic A2A responder. |
| `makeSellerOfferHandler` | `/agent` | SELLER LOOP: validate, apply both refusal floors, approve the bond, counter-sign. |
| `makeSellerQuoteHandler` | `/agent` | Mountable seller responder for the RFQ quote leg. |
| `makeSellerRaceHandler` | `/agent` | Mountable candidate responder for the dispatch-race leg. |
| `marketShape` | `/derive` | Per-assembly aggregates over the process graph; attribution is caller-supplied, never guessed. |
| `maxOrdersResolvablePerProcess` | root | The largest N whose `resolveProcess` fits the active chain's block gas budget. |
| `offerFromA2aMessage` | `/agent` | Read a commitment payload back out of an A2A message; `null` when the message is not an offer. |
| `originateProcess` | `/agent` | BUYER LOOP: instantiate, sign, offer, await the counter-signature, approve, commit. |
| `parseAttestationLogs` | root | Decode `Attestation` logs — filter by contract ADDRESS; the topic hash is shared with the batch path. |
| `parseClauseSpec` | `/clauses` | Parse and validate an unknown value as a `ClauseSpec` (the spec's own structure, not its content). |
| `parseFieldSpec` | `/clauses` | Parse ONE field spec — for fields declared outside a clause's content `fields`. |
| `parseMemberCatalogueDocument` | root | Strict parse of a pinned catalogue document; throws on malformed input. |
| `parseMemberProfileDocument` | root | Strict parse of a pinned profile document; throws on malformed input. |
| `parseProjectionHints` | root | Read a spec's `block` projection hints — design fills, checkout fills, article. |
| `planSubOrderSellers` | root | Topologically order an assembly's sub-orders and resolve each one's bound seller. |
| `planTemplateOrders` | root | A template's agreements in commit order, each with its clause bag and complete version map. |
| `profileValuesFor` | root | The profile-authored clause values a given seller publishes, read from its catalogue. |
| `projectAgentServices` | root | Read the agent service endpoints out of a profile document, tolerating partial ones. |
| `projectProcessGraph` | `/derive` | The process graph, labelled protocol-enforced — `reconstruct()`'s topology as a first-class object. |
| `projectSettlementGraph` | `/derive` | Per-order bonds locked and payouts at resolve, grouped into the kernel's LINEAR per-process chains. |
| `projectValueFlow` | `/derive` | Denomination nodes and flow edges; venue legs are caller-parsed, so no venue list is bundled. |
| `proposeActions` | `/agent` | Every action a wallet may take on a process it is already in. |
| `proposeInitiations` | `/agent` | Every process a wallet could START — one per live-staked assembly. |
| `readChainTimestamp` | root | The chain's `block.timestamp`: the only clock a protocol deadline may be computed from. |
| `readUtilityTokenPin` | root | The designer's pinned settlement token, read from a template's composed clauses. |
| `reconstruct` | root | Rebuild the full process topology from parsed core events. |
| `reconstructDiscovery` | root | Rebuild the live registry view; a member's current profile URI is EVENT-derived, not a getter. |
| `reconstructOrdersFromTemplate` | root | THE template→orders walk: root signs `processId = 0`, children carry real parent order hashes. |
| `recordProcessUsage` | `/agent` | Record direct-path RPGF usage AT settlement; per-leg reverts land in `failures`, never thrown. |
| `registerRateQuantitySource` | root | Register a resolver for a catalogue's rate-quantity source (a composition tenant, no core edit). |
| `requestCounterSignatures` | `/agent` | Fan out race drafts, verify each reply by exact struct match, rank cheapest first. |
| `requestQuotes` | `/agent` | Fan out RFQ requests, verify each reply by reconstruction, rank cheapest first. |
| `resolveDidWeb` | `/agent` | Resolve a `did:web` identifier — https-only, no redirects, size-capped (SSRF-hardened). |
| `resolveProcess` | `/agent` | The low-level buyer-only resolve. Does NOT restore signed root ids — prefer `executeAction`. |
| `resolveSubOrderPricing` | root | Price a sub-order live from its own contributor's catalogue. |
| `restoreSignedProcessId` | root | Turn an event-derived ROOT commitment back into the struct that was signed (`processId = 0`). |
| `sectionByField` | root | Find the agreement section whose spec DECLARES a field — never look one up by clause name. |
| `sectionDataHash` | root | A section's canonical-JSON fingerprint; a content-withheld section carries it directly. |
| `selectRaceWinner` | `/agent` | Cheapest verified countersigner wins; ties break by arrival order. |
| `SequencerClient` | `/agent` | HTTP client for a sequencer relay — submission (the batch path's entry point) and the publication reads. |
| `socketSignerAccount` | `/signer` | A viem account backed by the policy-signer daemon's socket. |
| `strippingReviver` | root | A `JSON.parse` reviver that drops `__proto__`/`constructor`/`prototype` keys. |
| `templateCompositionHash` | root | The `compositionHash` `AssemblyRegistry` binds — an assembly's identity IS its composition. |
| `topologicalOrder` | root | Order ids so every node follows its parents; `throw` or degrade on a cycle. |
| `Topology` | root | The mutable shadow state an agent keeps, updated incrementally as events arrive. |
| `tryParseMemberProfileDocument` | root | Lenient profile parse — returns `null` instead of throwing, for discovery lists. |
| `unwrapWithSharedSecret` | `/handoff` | Decrypt what `wrapWithSharedSecret` produced. |
| `validateCommitmentAgreement` | root | The non-throwing form of `assertAgreementSignable` — returns the findings instead. |
| `validateContent` | `/clauses` | Validate clause content against its spec; on a closed clause, unknown fields are rejected. |
| `validateDraft` | `/agent` | The structural check a candidate MUST run before countersigning a race draft. |
| `verifyCommitmentSignature` | root | Does this signature over this commitment recover to this signer? Refuse early, off chain. |
| `verifyInclusionProof` | root | Does this leaf sit under this root? The off-chain mirror of the on-chain `MerkleProof.verify`. |
| `verifyRaceReply` | `/agent` | Buyer side: the reply's struct must EXACTLY equal the draft, and recover to the drafted candidate. |
| `walletRecord` | `/derive` | One wallet's public trading record; resolved-empty is the answer for a wallet with no history. |
| `warnProcessLogFillsTrap` | root | Warn when a spec pins design/checkout fills on a process-log clause — content that commits unchecked. |
| `withholdSectionContent` | root | Swap a section's plaintext for its fingerprint — same leaf, same root, the content never travels. |
| `wrapWithSharedSecret` | `/handoff` | Encrypt a string payload under the ECDH shared secret (12-byte IV ‖ AES-256-GCM, base64url). |
| `writeTopologySection` | root | Write the REAL parent order hashes into the topology leaf; the template carries only local ids. |

### `@figaro-protocol/sdk` — Protocol Primitives

*Lost track of where a name below lives? → [Synopsis](#synopsis--which-entry-point-is-each-export-from).*

Event parsing, state reconstruction, EIP-712 commitments, bond calculations,
chain gas ceilings. Also home to the distribution mirror —
`computeRpgfAllocations` (`src/rpgf/formula.json`): a deterministic integer
pipeline that reproduces, off chain, what `UsageCounter` + `RpgfMinter` compute
on chain for the 600M retroactive distribution. Usage is counted as the facts
happen — recorded against a resolved order — so **there is nothing to post,
nothing to bond and nothing to dispute**. Trade settled through
`FigaroBatchVerifier` never acquires kernel status, so it reaches the counter by
a second route: `buildUsageClaims` turns a settled batch order plus its
agreement into the claims a sequencer proves, and the mirror folds BOTH event
streams (`fetchUsageRecords` + `fetchBatchUsageRecords`). Reading only the first
under-reports every clause or assembly whose trade moved to batches, and the two merge as
SCORES, never as components. The reward is UNIFORM (no tag,
category or weight — every clause or assembly's score is `icbrt(c·d²·10^18)`, its real
usage alone) and UNCAPPED; the only eligibility gate is a two-sided live ETH
stake (usage counts only for a live-staked seller-of-record, and an author earns
only while the clause or assembly's registration deposit stays un-withdrawn). The mirror
exists to display a distribution, predict a claim, and verify a recorded
accrual; `formula.json` is the normative prose statement of the mechanism and
the source of every constant the mirror uses.

```ts
import {
  addressesFromDeploymentRecord,
  fetchCoreEvents,
  reconstruct,
  calculateBonds,
  calculateSettlement,
  buildCommitment,
  buildDomain,
  Topology,
  maxOrdersResolvablePerProcess,
} from "@figaro-protocol/sdk";

// `addresses` everywhere below is a `FigaroAddresses` ({ core, token, … }).
// A PUBLISHED DEPLOYMENT RECORD uses different key names (`figaroCore`,
// `tokenAddress`, …) — do not spread it verbatim; map it once:
const addresses = addressesFromDeploymentRecord(deploymentRecord);
// The mapping reads the keys it knows and IGNORES every other one, silently
// and by design: a record carrying extras the SDK has never heard of (a local
// development record's own keys, a future deployment's additions) maps cleanly.
// Only a missing `figaroCore` throws. Keys that carry no SDK field at all —
// `florinToken`, `swapQuoter`, `chainId`, `deploymentBlock` — you read off the
// record yourself; `deploymentBlock` is the `fromBlock` every scan below wants.
// WHICH TOKEN CAN YOU SPEND? On a devnet record the settlement balances sit in the
// MOCK tokens — `tokenAddress` (MOCK) and `permitTokenAddress` (MPMT), 100,000 of
// each pre-funded to the standard Anvil test keys. `florinToken` is not a settlement
// currency on such a record: its deployer mint is renounced and those wallets hold
// zero, so an order denominated in it reverts `ERC20InsufficientBalance` the moment
// the kernel pulls a bond. Read balances off the record's tokens, never assume one.

// Fetch all FigaroCore events from a block range. The return is a GROUPED
// object — { orderCommitted, orderResolved, processResolved }, each a typed
// array — NOT one flat log list. (Attestations are NOT in here: they live on
// the AttestationCoordinator, a separate contract — read those with
// EV_ATTESTATION + parseAttestationLogs; see @figaro-protocol/sdk/derive.)
// `fetchCoreEvents` (and `fetchDiscoveryEvents`, `fetchUsageRecords`,
// `fetchBatchUsageRecords`) chunk `getLogs` internally in sub-ranges of
// `DEFAULT_LOG_CHUNK_SIZE` (9,500 blocks) so a wide range doesn't exceed a
// public RPC provider's block-range cap; pass a trailing `chunkSize` to tune
// it for a stricter (or more permissive) provider.
const events = await fetchCoreEvents(client, addresses, 0n);

// Cross-endpoint corroboration. A load-balanced public RPC is a POOL whose
// members can answer the SAME query differently — the same pinned block range
// has returned 2 vs 0 orders and 0 vs 16 clause registrations across runs —
// and a single-endpoint reader silently under-reports. With a second endpoint
// configured, make agreement a checked fact. Pin the range first: a moving
// "latest" resolves differently per endpoint and reports mere lag as
// divergence.
const toBlock = await client.getBlockNumber();
const report = await fetchEndpointLogAgreement(
  [
    { endpoint: "https://rpc-one.example", client },
    { endpoint: "https://rpc-two.example", client: secondClient },
  ],
  { address: addresses.core, fromBlock: BigInt(record.deploymentBlock), toBlock },
);
// → per-endpoint counts with each endpoint's missing keys named, the
//   union/intersection delta (`disputedKeys`), and a verdict you render:
//   "agree" | "diverge" | "unchecked". Below two endpoints the verdict is
//   "unchecked" — corroboration needs a second witness, and its absence is
//   absence, never a warning. Fetched the sets yourself (any event shape)?
//   `checkEndpointLogAgreement(range, sets, keyOf)` is the same report with
//   no fetching inside.

// Reconstruct full process/order state from events
const topology = new Topology();
topology.applyEvents(events);

const process = topology.getProcess(processId);
const active = topology.getActiveProcesses();

// Calculate bond requirements
const bonds = calculateBonds(cumulativeValue, payment);
// → { sellerBond, buyerBond, totalLocked }

// And what those locked funds become once the buyer resolves. This is the
// arithmetic to assert your balance deltas against — read the balances out of
// band after the resolve, never off the screen that claims to have moved them.
const settlement = calculateSettlement(payment, bonds.sellerBond, bonds.buyerBond);
// → { sellerPayout: payment + sellerBond,   // bond back, plus the payment
//     buyerPayout:  buyerBond − payment,    // bond back, minus the payment
//     netTransfer:  payment }               // exactly `payment` crosses, and nothing else
// At payment = cumulativeValue = 100: bonds 200/200, payouts 300/100, net 100.

// Per-process resolve ceiling on the active chain (a process grown past
// this can NEVER settle — check before every commit; the kernel cannot)
const cap = await maxOrdersResolvablePerProcess(client);

// Build EIP-712 typed data for signing.
//
// THE FIELD ORDER BELOW IS CANONICAL, NOT STYLISTIC. There is exactly one
// authoritative ordering: `CommitmentTypes.COMMITMENT_TYPEHASH`
// (`src/kernel/CommitmentTypes.sol:31-33`), the type string the kernel hashes
// and recovers both signatures against. The SDK derives its own typehash from
// the same field list and exports it — `COMMITMENT_TYPEHASH` (a root
// `@figaro-protocol/sdk` export) is
// 0xea70b4a1b704921c6919c3e8358981256c050e862e155886edf8828ee897f75c.
// Anything that transcribes the struct (the `cast` tuple below, a non-JS
// client, a Rust signer) must reproduce that order: permute two fields and the
// struct hash changes, so the kernel recovers a different address and rejects
// the bond.
const domain = buildDomain(chainId, coreAddress);
const { commitment, typedData } = buildCommitment(
  {
    processId: "0x0000000000000000000000000000000000000000000000000000000000000000",
    buyer,
    seller,
    currency,
    payment,
    expectedCumulativeValue: payment,
    agreementHash,
  },
  domain,
);
```

**Calling the kernel without the SDK.** A `cast`-only participant talks to
`FigaroCore` directly with two functions:

```
commit((bytes32 processId, address buyer, address seller, address currency,
        uint256 payment, uint256 expectedCumulativeValue, bytes32 agreementHash,
        uint256 salt, uint256 deadline) c, bytes buyerSig, bytes sellerSig)
resolveProcess(bytes32 processId, <that same tuple>[] commitments)   // buyer only
```

That tuple's field order is the same canonical one — `COMMITMENT_TYPEHASH` in
`src/kernel/CommitmentTypes.sol:31-33`. The sketch above and the
`buildCommitment` literal earlier are two transcriptions of that one source;
check either against the SDK's re-export
(`COMMITMENT_TYPEHASH === keccak256(toBytes(yourTypeString))`) before signing
anything you hand-rolled.

A ROOT commitment signs `processId = 0` (the kernel derives the real id and
returns it); a sub-order carries the root's derived `processId`. `buyerSig` /
`sellerSig` are EIP-712 signatures over the `Commitment` struct under domain
`{ name: "FigaroCore", version: "3", chainId, verifyingContract: <core> }`. The
SDK wrappers (`buildDomain` + `buildCommitment`) encode exactly these EIP-712
type/domain details — a raw caller must reproduce them byte-for-byte or the
kernel's on-chain recovery rejects the bond. Reach for the wrappers unless you
have a reason not to; this sketch is only enough to orient a raw caller.

**Token approvals before commit — the whole per-order bond, every time.** The
kernel pulls the FULL per-order bonds on EVERY `commit`, root or sub-order, and
nets nothing against bonds it already holds from earlier orders in the process.

Two different things state that, and it is worth keeping them apart. The
KERNEL only *pulls exactly*: `src/kernel/FigaroCore.sol:208-209` is two
`_pullExact` transfer calls, `c.payment * 2` from `c.buyer` and
`c.expectedCumulativeValue * 2` from `c.seller`, with no approval commentary
and no netting logic anywhere in the file — if the allowance falls short the
`transferFrom` reverts inside the settlement token and the kernel never sees
the reason. WHAT TO APPROVE is therefore an off-chain calculation, and the
SDK's `calculateRootApproval` / `calculateSubOrderApproval` (`sdk/src/bonds.ts`)
are the authority for it. Approve the settlement ERC-20 for both legs before
each commit:

```ts
import { calculateRootApproval, calculateSubOrderApproval } from "@figaro-protocol/sdk";

// Root order:
const { buyerApproval, sellerApproval } = calculateRootApproval(payment);
// → buyerApproval = 2 × payment,  sellerApproval = 2 × payment

// Sub-order (extends an existing process):
const approvals = calculateSubOrderApproval(payment, newCumulativeValue);
// → buyerApproval  = 2 × payment
//   sellerApproval = 2 × newCumulativeValue  — the WHOLE cumulative bond for
//   this order, NOT the increment over the previous order's bond.
```

**Worked: one root plus a two-link chain.** Whole settlement-token units (scale
by your token's `decimals`). Each row is one `commit`; the seller column is
THAT order's seller, bonding twice the cumulative value at their own link.

| Order | `payment` | `expectedCumulativeValue` | Buyer approves | Seller approves | The common mistake |
|---|---|---|---|---|---|
| 1 — root | 100 | 100 | **200** | **200** | — (root: the two legs coincide, which is why the trap only bites later) |
| 2 — sub-order | 40 | 140 | **80** | **280** | approving **80** — 2 × the 40 increment — instead of 2 × 140 |
| 3 — sub-order | 25 | 165 | **50** | **330** | approving **50** — 2 × the 25 increment — instead of 2 × 165 |

Read the rows as `calculateRootApproval(100n)` and
`calculateSubOrderApproval(40n, 140n)` / `calculateSubOrderApproval(25n, 165n)`
— they are that output. Two things the table makes visible that the prose
doesn't: the BUYER is charged again on every order (200 + 80 + 50 = 330 pulled
across the three commits, not 330 total value bonded once), and the seller's
number GROWS with the chain even though their own link only added 40 or 25.
Every one of those 330 + 810 units stays locked in the kernel until the buyer
calls `resolveProcess`; nothing is released order by order.

Approving the *increment* instead of the full `2 × newCumulativeValue` is the
reverting mistake: `commit` reverts inside the settlement token with
`ERC20InsufficientAllowance`, and the bonds already pulled for the earlier
orders stay locked in the kernel until the buyer resolves the process. (The
helper was `calculateSubOrderSellerApproval` before; it is now
`calculateSubOrderApproval` and returns both legs.)

Catch the mistake before it reverts on-chain: pass the approval you're about
to submit and the calculator's own output to `assertApprovalCoversBond` —
it throws with the specific "never approve only the increment" message
instead of leaving you to decode `ERC20InsufficientAllowance`.

```ts
import { assertApprovalCoversBond } from "@figaro-protocol/sdk";

const required = calculateSubOrderApproval(payment, newCumulativeValue);
assertApprovalCoversBond({ buyerApproval, sellerApproval }, required); // throws if either falls short
```

## Bonding in a token you do not hold — a DIRECT-path composition

A party who does not hold the process settlement currency can still bond in one
transaction, through `WitnessSwapAndCommitCoordinator.swapAndCommit`: it pulls
their input token via a Permit2 WITNESS signature, swaps it at the coordinator's
immutable venue, forwards the proceeds to the party's own address, then calls
`FigaroCore.commit`. The kernel still pulls the bond from the named party, so the
commitment stays bilaterally signed and the coordinator never becomes a
counterparty. The SDK ships the off-chain half — the typed data whose hash IS the
digest Permit2 verifies:

```ts
import { buildSwapWitnessTypedData, DISABLED_SWAP_FUNDING_LEG,
         SWAP_ROUTER_02_ABI,
         WITNESS_SWAP_AND_COMMIT_COORDINATOR_ABI } from "@figaro-protocol/sdk";
import { encodeFunctionData } from "viem";

// `swapData` IS THE VENUE'S OWN CALLDATA, forwarded verbatim after the
// coordinator approves the router for your input token — so the venue must PULL
// by ERC-20 allowance. The immutable venue is Uniswap's SwapRouter02 (the deploy
// probes factory() + WETH9() before wiring one), and its exactOutputSingle
// pulls exactly that way: deliver an EXACT output — the bond — for at most
// `amountInMaximum` of input. Build the bytes with this package's
// SWAP_ROUTER_02_ABI, which carries that shape:
//
//   recipient       — the COORDINATOR: it measures the output-balance delta,
//                     then forwards everything to the party, so the kernel's
//                     pull finds the bond and any residual stays the party's.
//   amountOut       — the leg's bond, mirroring the kernel pull exactly:
//                     2 × payment (buyer leg) or
//                     2 × expectedCumulativeValue (seller leg).
//   amountInMaximum — maxInput, the SAME cap the witness signs below.
const swapData = encodeFunctionData({
  abi: SWAP_ROUTER_02_ABI,
  functionName: "exactOutputSingle",
  args: [{
    tokenIn: inputToken,
    tokenOut: settlementCurrency,
    fee: 500,                  // the pool's fee tier — quote the tiers, take the cheapest
    recipient: coordinator,
    amountOut: bondAmount,
    amountInMaximum: maxInput,
    sqrtPriceLimitX96: 0n,
  }],
});

// The witness binds { router, inputToken, maxInput, keccak256(swapData) } into
// the digest, so a relayer cannot substitute the swap route and skim the
// slippage. `coordinator` is Permit2's spender (it performs the pull).
const typedData = buildSwapWitnessTypedData({
  chainId, permit2, coordinator, router, inputToken,
  maxInput, nonce, deadline, swapData,
});
const permitSignature = await walletClient.signTypedData({ account, ...typedData });

// swapAndCommit(c, buyerSig, sellerSig, buyerFunding, sellerFunding) — one leg
// per party; pass DISABLED_SWAP_FUNDING_LEG for a party that self-funds.
// Per-party prerequisites: approve(FigaroCore) for the bond currency (as
// always) plus a one-time approve(Permit2) for the input token.
```

**There is no batch-path equivalent, and none can exist in-batch.** A sequencer
accepts a `Commit` operation that is the commitment plus both signatures and
nothing else — no funding leg in the wire format, none in the proof — and
`FigaroBatchVerifier.settleBatch` pulls each party's NET deposit with
`transferFrom` when the batch lands. So on the batch path: **swap in your own
wallet first**, then sign the commitment in the process currency, hold that
balance, and approve `FigaroBatchVerifier` (not `FigaroCore`) until the batch
settles. POST-settlement composition is identical on both paths — both deliver
ERC-20 to the party's own address, so wallet-side routing of what you received is
path-blind.

## Routing what you received — a POST-settlement composition

The kernel has already paid out, so this is a wallet spending its own balance:
one settled receipt, many earmarked recipients, one atomic transaction — fiscal
remittance, a savings address, a co-worker's share, an obligation. The network
already supplies the contract, so the protocol owns none of it: **Disperse**
(`0xD152f549545093347A162Dce210e7293f1452150`), verified, ownerless, live since
2018 at the same address across 16 chains. It reads no `FigaroCore` state, no
bond and no registry; it is composition, not protocol. So the SDK carries the
ADDRESS but not the interface: `addressesFromDeploymentRecord` maps a record's
`multisender` key onto `addresses.multisender`, and there is no `DISPERSE_ABI`
export — you declare the three functions yourself. A record that omits the key
(the published Sepolia record does) is not a missing deployment: the canonical
contract sits at the same address on every chain it is on, so read it off the
record when it is there and use the canonical address when it is not — after
checking `getCode` is non-empty on the chain you are actually on.

```ts
import { ERC20_ABI } from "@figaro-protocol/sdk";
import { parseAbi } from "viem";

// The canonical Disperse surface — three functions, no owner, no fee.
const DISPERSE_ABI = parseAbi([
  "function disperseToken(address token, address[] recipients, uint256[] values)",
  "function disperseTokenSimple(address token, address[] recipients, uint256[] values)",
  "function disperseEther(address[] recipients, uint256[] values) payable",
]);

const legs = [                                   // shares of the settled receipt,
  { recipient: taxAddress,     amount: parseEther("21") },   // in the order's OWN
  { recipient: savingsAddress, amount: parseEther("30") },   // currency units
  { recipient: partnerAddress, amount: parseEther("49") },
];
const total = legs.reduce((sum, leg) => sum + leg.amount, 0n);

// `disperseToken` PULLS the aggregate with transferFrom, then pays each leg —
// so it needs an allowance for the TOTAL, and the approval target is the
// multisender, never FigaroCore. (`disperseTokenSimple` pulls per leg instead:
// same allowance, one transferFrom per recipient — cheaper for two legs,
// dearer for ten. `disperseEther` is the native-token form and refunds any
// remainder to the caller.)
const allowance = await publicClient.readContract({
  address: token, abi: ERC20_ABI, functionName: "allowance",
  args: [account.address, multisender],
});
if (allowance < total) {
  await publicClient.waitForTransactionReceipt({
    hash: await walletClient.writeContract({
      address: token, abi: ERC20_ABI, functionName: "approve", args: [multisender, total],
    }),
  });
}

// Simulate first: EVERY batch is atomic, so one over-balance leg reverts the
// whole call — better before the wallet prompt than after it.
const args = [token, legs.map((l) => l.recipient), legs.map((l) => l.amount)] as const;
await publicClient.simulateContract({
  address: multisender, abi: DISPERSE_ABI, functionName: "disperseToken", args, account,
});
const hash = await walletClient.writeContract({
  address: multisender, abi: DISPERSE_ABI, functionName: "disperseToken", args,
});
```

Measured on a local chain against the mirrored devnet interface: three token
legs settle in one transaction at ~117k gas, each recipient's balance equal to
its leg, and an over-balance batch reverts in simulation with nothing partially
routed. **The trail is the point.** Which address received which share of which
receipt is now a chain fact anyone the wallet chooses can be shown — a
self-sovereign fiscal record produced as a byproduct of being paid, not a report
assembled afterwards. Nothing here is protocol-aware: do it whenever you like,
in any token you hold, for receipts from either settlement path.

## Verifying what you are about to sign

**Settlement is UI-independent; presentation at the signing moment is not.** The
kernel verifies both EIP-712 signatures itself over a struct whose
`agreementHash` is the merkle ROOT of the agreement's sections — so what was
agreed is fixed by arithmetic once committed, and no origin can restate it. But
the wallet prompt shows 32 bytes, and the readable document sits beside it on
some page: a compromised origin can display document `D` while the struct binds
`hash(D′)`. Nothing in the signing flow catches that. Recompute the root
yourself, off-origin, before signing:

```ts
import { computeAgreementHash, computeSectionLeaf,
         sectionDataHash, verifyCommitmentSignature } from "@figaro-protocol/sdk";

// `shown` — the agreement JSON you were displayed.
// `typedData` — the EIP-712 payload the WALLET displayed (domain + message).
for (const section of shown.sections) {
  console.log(section.clause, sectionDataHash(section),   // what this hash covers
                              computeSectionLeaf(section));
}
if (computeAgreementHash(shown).toLowerCase() !==
    typedData.message.agreementHash.toLowerCase()) {
  throw new Error("MISMATCH — the page showed one document and asked the " +
                  "wallet to bind another. Do not sign.");
}

// After the fact: did an address really sign this struct? (uint256 fields
// arrive from a wallet as strings — pass bigints.)
await verifyCommitmentSignature(commitment, sig, commitment.buyer,
                                { chainId, core });
```

`scripts/verify-signed-agreement.mjs` in the repo is a ready-made runner for the
above (agreement file + typed-data file, optional `--buyer-sig`/`--seller-sig`,
exit 0 only if every check passed). Struct-level legibility inside the wallet is
a KERNEL question and is deliberately out of scope: `Commitment` binds the
agreement by root, the kernel is frozen, and that root-binding is exactly what
makes this off-origin check possible.

## Recovering an in-flight process

A half-committed process — the root landed but a sub-order's counter-signature
never arrived, or a client crashed mid-checkout — is recoverable from chain
state alone, because `OrderCommitted` carries the FULL commitment payload
(`processId, buyer, seller, currency, payment, cumulativeValue, agreementHash,
salt, deadline` — everything except the two signatures).

1. `const events = await fetchCoreEvents(client, addresses, fromBlock)` and read
   `events.orderCommitted` for the process (or `reconstruct(events)` for the live
   `ProcessState`).
2. Re-derive the `Commitment` struct from an event's fields — the payload IS the
   struct. `reconstruct` also gives you the running `cumulativeValue` and
   `activeOrderCount`, so a resuming sub-order signs the correct
   `expectedCumulativeValue` (previous cumulative + this order's payment).
3. Continue: re-request the missing counter-signature for that struct and
   re-broadcast the `commit`, or — as the buyer — `resolveProcess` the orders
   that DID commit. Nothing the chain can't re-derive is stranded; the bonds the
   kernel already pulled stay against their orders until the buyer resolves.

### `@figaro-protocol/sdk/agent` — Agent Coordination

*Lost track of where a name below lives? → [Synopsis](#synopsis--which-entry-point-is-each-export-from).*

Context sync, network discovery, action proposer, human-in-the-loop queue,
autonomous execution, did:web identity, and the coordination transports that
carry an offer between two agents — `InProcessChannel`, `HttpChannel`, and
`A2aChannel` (the Agent2Agent wire), all one interface.

```ts
import { FigaroContext, proposeActions, proposeInitiations, ActionQueue } from "@figaro-protocol/sdk/agent";
import { commit, executeAction } from "@figaro-protocol/sdk/agent";

// Sync on-chain state into a live context — the agent's own processes AND the
// live-staked network catalogue (clauses, sellers, assemblies).
const ctx = new FigaroContext(client, addresses);
await ctx.sync();

// Discover what exists (cold start): getAssemblies() / getMembers() / getClauses()
const assemblies = ctx.getAssemblies();

// FigaroContext wraps the low-level discovery primitives, which are ROOT
// `@figaro-protocol/sdk` exports — NOT `@figaro-protocol/sdk/agent`. Use them directly for a
// one-shot catalogue read without a context:
import { fetchDiscoveryEvents, reconstructDiscovery } from "@figaro-protocol/sdk";
const discovery = reconstructDiscovery(await fetchDiscoveryEvents(client, addresses, 0n));

// Propose actions on a process the agent is in, and originations from discovery
const actions = proposeActions(ctx.getProcess(processId)!, myAddress);
const initiations = proposeInitiations(assemblies, myAddress);

// Human-in-the-loop: queue actions for approval with optional review context
type ApprovalContext = {
  bindingId?: string;
  party?: string;          // "buyer" | "seller"
  runtimeSummary?: string; // free-form context for the approver
};

const queue = new ActionQueue<ApprovalContext>();
queue.enqueueAll(actions.map((action) => ({
  action,
  approvalContext: {
    bindingId: "binding:my-seller:local-anvil",
    party: "seller",
    runtimeSummary: "Seller of record · process 0x9c2b…",
  },
})));
// ... user reviews and approves ...
const approved = queue.approve(1);
console.log(approved.approvalContext?.runtimeSummary);

// Autonomous: submit transactions directly after collecting both EIP-712 signatures
const result = await commit(walletClient, publicClient, coreAddress, commitment, buyerSig, sellerSig);
// Or dispatch from a proposed action. resolve-process is self-contained; commit/
// attest/initiate take signed `inputs` — the SDK never fabricates a signature.
const result = await executeAction(walletClient, publicClient, addresses, approvedAction);

// Attest one clause end-to-end from a hydrated Agreement. Pick the clause from
// the agreement's OWN sections — never a bundled list.
import { buildSectionInclusionProof, sectionDataHash, computeClauseKey } from "@figaro-protocol/sdk";
import { attestAsSeller } from "@figaro-protocol/sdk/agent";
import { parseClauseSpec, encodeContentFromSpec } from "@figaro-protocol/sdk/clauses";
import { keccak256 } from "viem";

const section = agreement.sections[0]; // e.g. { clause: "figaro-assembly-provenance", version, data }

// 1. Inclusion proof — buildSectionInclusionProof takes the RAW section name.
const { proof } = buildSectionInclusionProof(agreement, section.clause);
// 2. Section FINGERPRINT — keccak256 of the committed canonical bytes. The
//    coordinator takes only the hash, never the preimage, so a `private`-
//    disposition section's plaintext never touches public calldata.
const sectionHash = sectionDataHash(section);
// 3. Content FINGERPRINT — hash the ABI-encoded content (which lives OFF-chain).
//    Omit content to RE-ASSERT the committed section: contentRef = sectionHash.
const parsed = parseClauseSpec(specJson);
if (!parsed.ok) throw new Error(parsed.errors[0].message);
const content = encodeContentFromSpec(parsed.spec, section.data);
const contentRef = keccak256(content);
// 4. Attest. `clauseId` is the bytes32 HASH — NOT the raw name from step 1.
// `stage` vocabulary: 0 = the clause's COMMITTED content (encode with no
// stage option); N ≥ 1 = a runtime witness whose field shape is the spec's
// own `stages[N]` declaration (encode with `{ stage: N }`); a process-log
// ladder attests its enum's index as the stage. The vocabulary is the
// clause spec's data — the SDK and the chain assign it no meaning.
const clauseId = computeClauseKey(section.clause, section.version);
// `roleCommitment`/`targetCommitment` are the SIGNED commitment structs (a root
// order carries processId = 0), NOT the reconstruction-derived form. For
// SAME-ORDER attestation pass the SAME commitment as both role and target
// (one struct in both slots) — two distinct commitments are only the
// cross-order case (seller attesting from a different order in the process).
await attestAsSeller(
  walletClient, addresses.attestationCoordinator!,
  roleCommitment, targetCommitment, clauseId, /* stage */ 0, sectionHash, proof, contentRef,
);
// The coordinator has THREE attest entry points, all merkle-binding identically
// to the signed agreement — they differ only in how caller authority is proven:
//   • attestAsSeller     — the order's seller attests (role + target commitments;
//                          pass the same struct twice for same-order attestation).
//   • attestAsBuyer      — the root buyer attests (target commitment only; the
//                          commit invariant makes msg.sender == c.buyer the check).
//   • attestViaResolver  — the order's seller is a MECHANISM CONTRACT implementing
//                          IRoleResolver, which authorizes msg.sender via
//                          isAuthorized(orderHash, caller): delegated attestation
//                          for contract-seller mechanisms.
// The SDK ships wrappers for the first two (attestAsSeller / attestAsBuyer, both
// from @figaro-protocol/sdk/agent); attestViaResolver is in ATTESTATION_COORDINATOR_ABI —
// call it directly (writeContract) when the seller is a resolver contract.

// Autonomous origination — the two-party handshake over a coordination channel:
// buyer instantiates a discovered assembly + signs; seller validates + counter-signs.
import { originateProcess, makeSellerOfferHandler, InProcessChannel } from "@figaro-protocol/sdk/agent";
// REFUSE-ALL FLOOR, BOTH HALVES: with no `accept` business rule OR no economic
// `policy` the handler declines EVERY offer. Autonomy is opt-in — these are
// where you bound currency/magnitude before the seller bonds against them.
// (A `() => true` accept-all is possible but unsafe.)
channel.register(sellerAddr, makeSellerOfferHandler(sellerWallet, publicClient, addresses, {
    accept: (offer) => offer.commitment.currency === myAcceptedToken
        && offer.commitment.expectedCumulativeValue <= myMaxBond,
    policy: { requireRootShape: true, currencyAllowlist: [myAcceptedToken], maxValue: myMaxBond },
    specs, // the merkle-leaf sign gate — a leaf/struct contradiction or missing
           // required term REFUSES before counter-signing; omit it and no
           // content check runs on this side
}));
const tx = await originateProcess(buyerWallet, publicClient, addresses, {
    channel, template, buyer, seller, currency, payment, chainId, core, overrides,
    deadline, // CHAIN time: computeDeadline(await readChainTimestamp(publicClient))
    specs,    // same gate before the buyer signs + the mechanical provenance fill
});

// TRANSPORTS — `CoordinationChannel` is ONE method (`sendOffer`), and the SDK
// ships three implementations of it: `InProcessChannel` (both agents in one
// process — tests), `HttpChannel` (a bare POST to the endpoint the seller
// publishes), and `A2aChannel` (the Agent2Agent wire). Only the channel
// changes: the handshake, the anti-tamper gate, and the refuse-all floor are
// the same object underneath, and the SDK never fabricates the counterparty
// signature on any of them.

// A2A — reach for it when the counterparty already speaks Agent2Agent (use
// HttpChannel when it just exposes an offer URL). The offer envelope rides as
// the `data` part of an A2A message, and the JSON-RPC `message/send`
// request/response IS the handshake's request/response — so a third-party A2A
// agent interoperates WITHOUT importing this SDK: it sees an ordinary message
// whose data part carries the envelope, counter-signs, and replies in kind.
import { A2aChannel, makeA2aOfferResponder, didWebEndpointResolver } from "@figaro-protocol/sdk/agent";
// BUYER: resolve the seller's A2A endpoint — a did:web service entry of type
// "A2AEndpoint", a static map, or a read of the seller's published profile
// (`projectAgentServices(profileJson).services.a2a`, below) — then originate
// over it exactly as above.
const a2a = new A2aChannel({
    resolveEndpoint: didWebEndpointResolver(sellerToDid, { serviceType: "A2AEndpoint", chainId }),
});
const a2aTx = await originateProcess(buyerWallet, publicClient, addresses,
    { channel: a2a, template, buyer, seller, currency, payment, chainId, core, overrides });
// SELLER: the SDK ships no server. `makeA2aOfferResponder` is a pure
// request→response function any server drives (node:http, express, a
// serverless function), wrapping the SAME `makeSellerOfferHandler` — so the
// refuse-all floor is unchanged: no `accept` OR no `policy` declines everything.
const respond = makeA2aOfferResponder(
    makeSellerOfferHandler(sellerWallet, publicClient, addresses, { accept, policy, specs }), // the two floors + the sign gate
);
const { status, body } = await respond(rawRequestBody); // status is always 200 — JSON-RPC carries the outcome
// The three handshake outcomes on the wire, mirroring HttpChannel's 200/204/422:
//   • result message WITH a data part  → counter-signed (sendOffer returns the envelope);
//   • result message with NO data part → policy DECLINE (sendOffer returns null);
//   • JSON-RPC error → sendOffer THROWS — `-32002` when the seller's anti-tamper
//     gate rejected the offer, `-32602`/`-32700` for a malformed request. A
//     rejection is never a silent decline.
// An unresolvable endpoint is ABSENCE, not a decline: sendOffer returns null.
// Hand-rolling either side (a non-SDK A2A agent, a custom server)? The codec is
// exported: `a2aMessageFromOffer(offer, "user" | "agent", messageId)` and
// `offerFromA2aMessage(message)` — null when the message carries no data part,
// THROWS on a malformed one (malformed is not absence). `messageId` is
// correlation metadata only; the envelope's own signatures authenticate.

// The dispatch race — market formation with zero contracts, the seller-signs-
// first INVERSE of the handshake above: a buyer relays the SAME unsigned draft
// shape to k candidates (each draft naming that candidate at their own posted
// price), candidates counter-sign to answer "available", and the buyer signs
// EXACTLY ONE winner — the single buyer signature is both the selection event
// and the seller-address answer. A draft binds nobody and cannot be broadcast
// (the kernel needs both signatures); a losing countersignature expires inert
// at the struct deadline. Same two candidate-side floors as counterSignOffer,
// and the same optional `specs` merkle-leaf gate: with a SpecSource, a draft
// whose commerce leaf contradicts the struct is refused before any signature.
import { validateDraft, counterSignDraft, verifyRaceReply, selectRaceWinner } from "@figaro-protocol/sdk/agent";
const reply = await counterSignDraft(courierWallet, draft, { chainId, core }, accept, policy, specs);
// Buyer side: exact struct-hash equality against the SENT draft, then recovery —
// a doctored reply cannot ride a valid signature.
const check = await verifyRaceReply(reply!, draft, { chainId, core });
const winner = selectRaceWinner(replies); // cheapest countersigner; ties by arrival
// Packaged fan-out + mountable responder (the RFQ leg below has the same pair):
import { requestCounterSignatures, makeSellerRaceHandler } from "@figaro-protocol/sdk/agent";
channel.register(courierAddr, makeSellerRaceHandler(courierWallet, { chainId, core }, { accept, policy, specs }));
const race = await requestCounterSignatures(channel, drafts, { chainId, core }); // { replies, winner }

// The RFQ leg — same choreography, the CANDIDATE authors the price (bespoke
// jobs, thin markets — no posted figure fits). The request goes out at the
// buyer's CEILING (their reservation price, inside the signed struct so the
// cap is enforceable); the candidate's pricing function quotes below it; the
// counter-draft re-prices ONLY the fields the buyer named (`pricedFields` —
// the buyer names their own clause, the SDK names none). The buyer verifies
// by RECONSTRUCTION: the same substitution applied to their OWN draft must
// reproduce the reply hash-for-hash — a quote can change the price and
// nothing else. Cheapest verified quote wins; the buyer signs exactly one.
import { buildQuoteRequest, requestQuotes, makeSellerQuoteHandler } from "@figaro-protocol/sdk/agent";
channel.register(courierAddr, makeSellerQuoteHandler(courierWallet, { chainId, core }, {
    quote: (draft) => myPriceFor(draft),           // null declines; > ceiling declines
    policy: { requireRootShape: true, currencyAllowlist: [myToken], maxValue: myMaxBond },
}));
const drafts = candidates.map((seller) => buildQuoteRequest({
    template, buyer, seller, currency, ceiling, chainId, core,
    pricedFields: [{ clause: "figaro-commerce", path: "payment" },
                   { clause: "figaro-commerce", path: "lineItems.0.unitPrice" }],
    overrides,
}));
const { winner: quoted } = await requestQuotes(channel, drafts, { chainId, core });

// A relayed offer envelope is untrusted input. `deserializeCommitmentPayload`
// parses through the root-exported `strippingReviver`, dropping any
// `__proto__` / `constructor` / `prototype` keys at parse time — a malicious
// envelope cannot pollute the prototype chain of the receiving agent. Reuse
// `strippingReviver` for any other untrusted JSON you parse (IPFS bodies,
// channel payloads): `JSON.parse(body, strippingReviver)`.
import { strippingReviver } from "@figaro-protocol/sdk";
import { deserializeCommitmentPayload } from "@figaro-protocol/sdk/agent";

// Submitting to the BATCH path — SequencerClient. `FigaroBatchVerifier.
// settleBatch` is PERMISSIONLESS (no caller gate, no owner, no fee), but it
// takes an SP1 proof over a whole batch, so the ordinary route is to hand the
// signed operation to a sequencer: an HTTP relay that pools operations, proves
// the batch, and settles it. This client emits EXACTLY the wire format the
// endpoint accepts — never hand-roll the JSON.
//
// A RELAY, NOT AN AUTHORITY: it holds no key of yours, its admission checks
// call the same kernel functions the proof runs (so it rejects earlier than
// the proof, never accepts more), and its honest powers are censor and delay —
// never forge. Fall back to direct FigaroCore submission with the SAME
// signed operations. There is no hosted public endpoint today; the URL is deployment
// config, like an RPC URL. Surface + run-your-own recipe: prover/sequencer.
//
// A batch operation is the SIGNED PAYLOAD AND NOTHING ELSE — there is no
// funding leg, so swap-and-commit does not exist here. Bonding in a token you
// do not hold means swapping in your own WALLET first, then submitting; and
// settleBatch pulls your net deposit, so approve FigaroBatchVerifier, not the
// kernel. (See "Bonding in a token you do not hold" above.)
import { SequencerClient } from "@figaro-protocol/sdk/agent";
const seq = new SequencerClient({ url: SEQUENCER_URL });
if (!(await seq.isAvailable())) { /* direct path instead */ }
const { id } = await seq.submitCommit(commitment, buyerSig, sellerSig);
// Admission is IDEMPOTENT on ON-CHAIN IDENTITY (order hash / process id /
// attestation identity) — a retry, even a RE-SIGNED one, returns the original
// id and enqueues nothing. `{ id }` is a queue receipt, NOT settlement:
// confirm from chain (BatchSettled, the ERC-20 transfers, scoreOf).
// FigaroCore.orderStatus(orderHash) stays 0 for this order FOREVER — 0 means
// "not on this path", never "not settled". Gating any read on orderStatus is
// blind to everything that settles here; see docs/SCALING_STRATEGY.md §
// "Two settlement paths, two DISJOINT state universes".
await seq.submitResolve(processId, commitments, buyerSig);
await seq.submitAttestAsSeller({ role, target, clauseId, stage, contentRef, sellerSig, proof });
await seq.submitUsageClaim(claim);  // the RPGF leg — build with buildUsageClaims
await seq.status();  // { state_root, pending_ops, pending_usage_claims, batches_settled, archive }

// READING BATCHED TRADE BACK. A batch-settled order has no kernel event and no
// per-order flag on chain, so do NOT chase stateRoot() and BatchSettled by
// hand: the relay PUBLISHES the batch universe's mirror of the kernel's
// events, and the client encodes the 404 rule you must not get wrong.
const view = await seq.process(processId);   // the orders + the resolution facts
const one  = await seq.order(orderHash);     // one published order
const page = await seq.batches({ from: 0 }); // ≤50 a page; follow next_cursor
// `null` means "not in THIS relay's archive" — settled by another relay,
// settled directly against FigaroCore, or aged out of retention. It NEVER
// means the trade did not happen. Check status().archive against your cursor
// BEFORE replaying, or a dropped range is skipped silently. Every other
// failure THROWS, so an unreachable relay never reads as an absent record.
// The relay is untrusted TRANSPORT: verify what it returns against the chain —
// the ERC-20 transfers settleBatch executed, and scoreOf for the usage leg.
// Errors are SequencerError with .statusCode: 400 signature/witness-gate
// rejection (carrying the kernel's own reason string) or malformed JSON, 422
// not a valid operation shape, 413 over the 1 MiB body cap, 503 mempool at
// capacity — capacity, never rejection; retry after the next batch.

// did:web: an agent resolves a counterparty's DID Document, verifies the on-chain
// address it binds, and reads the coordination endpoint to route an offer to
// (build your own with buildSellerDidDocument).
import { resolveDidWeb, didDocumentMatchesAddress, extractServiceEndpoints } from "@figaro-protocol/sdk/agent";
const { document } = await resolveDidWeb("did:web:seller.example.com");
const bound = document ? didDocumentMatchesAddress(document, "0xSeller...", 1) : false;
const [endpoint] = document ? extractServiceEndpoints(document, "MCPEndpoint") : [];
```

#### The sequencer wire: seven endpoints

What `SequencerClient` speaks, so you can read a relay's answer (or a curl of
it) without guessing. Seven routes, in two halves — submission and publication.
Amounts on this wire are **hex quantities** (`"0x7d0"`, never `"2000"`) and
fields are `snake_case`; the conversion helpers above are the only thing that
should build them.

| Route | Request | `200` body | Client method |
|---|---|---|---|
| `POST /submit` | `{ "operation": { "Commit" \| "Resolve" \| "AttestAsSeller" \| "AttestAsBuyer": {…} } }` — a serde externally-tagged enum | `{ "id": n }` — a queue receipt, **not** settlement | `submitCommit` · `submitResolve` · `submitAttestAsSeller` · `submitAttestAsBuyer` |
| `POST /submit-usage` | `{ "claim": <UsageClaim> }` | `{ "pending": n }` | `submitUsageClaim` |
| `GET /health` | — | `{ status, pending_ops, pending_usage_claims, batches_settled }` | none — `isAvailable()` probes `/status` instead |
| `GET /status` | — | the `/health` fields plus `state_root`, `dead_lettered_ops`, `last_settle_error`, `archive: { first_batch, last_batch, retained_batches, max_batches }` | `status()` |
| `GET /orders/{orderHash}` | 32-byte hex in the path | `{ order_hash, process_id, commit, resolution }` — either leg `null` | `order()` → `null` on `404` |
| `GET /processes/{processId}` | 32-byte hex in the path | `{ process_id, orders[], resolution }` | `process()` → `null` on `404` |
| `GET /batches?from=&limit=` | `from` defaults to the oldest retained batch; `limit` defaults to 10, **clamped to 50** | `{ batches[], next_cursor, retained }` | `batches()` — follow `next_cursor` |

`/submit` is idempotent on **on-chain identity** (order hash / process id /
attestation identity): a retry, even a re-signed one, returns the original `id`
and enqueues nothing. `/submit-usage` is idempotent on claim **bytes** only —
weaker, so do not lean on it for identity dedup.

Every failure is `{ "error": "<reason>" }` with one of these codes, and the
client raises it as a `SequencerError` carrying `.statusCode`:

| Code | When | Note |
|---|---|---|
| `400` | admission rejection (EIP-712 recovery failed, or the recovered address is not the party named in the struct; a usage claim with a zero clause-or-assembly or no agreement hash), malformed JSON, an unparsable hash in a read path, a non-numeric `/batches` parameter | the relay's reason string is carried verbatim into the error message |
| `413` | body over the 1 MiB cap | a full attestation witness is tens of KB — this is abuse headroom, not a normal limit |
| `415` | wrong content type | send `application/json` |
| `422` | valid JSON that is not the operation or claim shape | wrong shape, unknown variant, missing field |
| `404` | `/orders` and `/processes` only | **absence in THIS relay**, never "the trade did not happen"; the client returns `null` rather than throwing |
| `503` | mempool at capacity | capacity, never rejection — retry after the next batch settles |

`/batches` never answers `404`: an empty relay returns an empty page.

Full wire shapes (every field of every publication response), the environment
table, and the run-your-own recipe are in
[`prover/sequencer/README.md`](https://github.com/figaro-protocol/Figaro/blob/main/prover/sequencer/README.md).

### `@figaro-protocol/sdk/derive` — Clause-Agnostic Derivations

*Lost track of where a name below lives? → [Synopsis](#synopsis--which-entry-point-is-each-export-from).*

Clause-agnostic attestation filtering, geo math, the commits==resolves withdraw
gate, and the **graph projections** — the semantic graphs a Figaro deployment
emits, as first-class objects you can query. The model they project is
`docs/PUBLIC_GRAPH_MODEL.md`; this section is the calling convention.

```ts
import {
  computeClauseKey, fetchCoreEvents, EV_ATTESTATION, parseAttestationLogs,
} from "@figaro-protocol/sdk";
import {
  filterByClause,
  haversineDistance,
  geohashesMatch,
  deriveInFlightOrders,
  deriveClauseWithdrawGate,
  deriveAssemblyWithdrawGate,
} from "@figaro-protocol/sdk/derive";

// Attestations live on the AttestationCoordinator, NOT in fetchCoreEvents
// (which returns only orderCommitted / orderResolved / processResolved). Read
// the Attestation logs straight from the coordinator, then parse them into
// typed AttestationEvents:
const attestationLogs = await client.getLogs({
  address: addresses.attestationCoordinator!,
  event: EV_ATTESTATION,
  fromBlock: BigInt(record.deploymentBlock),  // never 0n on a public network
});
const attestations = parseAttestationLogs(attestationLogs);

// Derive the on-chain clause key (name, version), then filter for it. The SDK
// knows no specific clause — the stage/contentRef meaning is clause-spec data
// read at the edge, never baked in here.
const clauseId = computeClauseKey("figaro-emissions", 1);
const forClause = filterByClause(attestations, clauseId);

// Geo: check delivery proximity
const close = geohashesMatch("dr5ru7", "dr5ru8", 5); // true (5-char prefix match)
const km = haversineDistance(40.71, -74.00, 34.05, -118.24); // ~3944 km

// Withdraw gate (advisory): a clause-or-assembly author must not reclaim their
// registration stake while deals composed from that clause or assembly are in flight.
// The join is derived at read time from chain + IPFS, never stored:
const events = await fetchCoreEvents(client, addresses, 0n);
const inFlight = deriveInFlightOrders(events); // committed, process unresolved
// You resolve each ref's pinned agreement (the SDK does no IPFS I/O), pairing
// it as { processId, agreement } — a null agreement (party-private/unreachable)
// is COUNTED as unverified and surfaced, but never blocks: agreement bodies are
// party-private, and the on-chain inclusion-proof hardening doesn't lock the
// stake on unrevealed deals either. Then:
const clauseGate = deriveClauseWithdrawGate("figaro-emissions", agreements);
const assemblyGate = deriveAssemblyWithdrawGate(assemblyTemplate, agreements);
// gate.canWithdraw === (inFlightCount === 0); unverifiedCount is a caveat
```

#### The graph projections

Pure folds over events you already fetched — no chain client, no network. Each
projection carries the **truth boundary** of its own rows (`TruthBoundary`: one
of `protocol-enforced`, `institution-declared`, `protocol-derived`,
`composition-derived`), so a consumer never conflates a protocol guarantee with
an institution-level claim.

```ts
import { fetchCoreEvents, fetchAttestationRecords } from "@figaro-protocol/sdk";
import {
  projectProcessGraph, projectSettlementGraph, extractOverlays, projectValueFlow,
  marketShape, walletRecord,
} from "@figaro-protocol/sdk/derive";

const core = await fetchCoreEvents(client, addresses, BigInt(record.deploymentBlock));
const process    = projectProcessGraph(core);      // boundary: "protocol-enforced"
const settlement = projectSettlementGraph(core);   // boundary: "protocol-enforced"

// Overlays: ONE per attestable clause family the corpus actually contains.
// fetchAttestationRecords folds BOTH settlement universes and tags each row;
// you supply the content bytes (an attestation's contentRef is keccak256 of
// off-chain content — the chain never holds the preimage) and a SpecSource.
// null content, or an unresolvable spec, degrades that entry to
// FINGERPRINT-ONLY rather than fabricating a value.
const atts = await fetchAttestationRecords(client, addresses, BigInt(record.deploymentBlock));
const overlays = extractOverlays(atts.map((event) => ({ event, content: null })), specs);

// Composition: venue events are parsed by YOU against the venue's own ABI
// (resolved from the deployment record or a clause field) — nothing bundles a
// venue list, and a venue this code has never seen feeds the same shape.
const valueFlow = projectValueFlow(settlement, swapLegs, pins);

// Queries are thin folds over the graphs. Assembly attribution is
// CALLER-SUPPLIED: a process you cannot key is reported in
// `unattributedProcessCount`, never binned under a guess.
const shape = marketShape(process, (processId) => assemblyKeyFor(processId));
const rec   = walletRecord(process, "0x…");        // empty arrays = no history
```

The five graphs named in `PUBLIC_GRAPH_MODEL.md` are the canonical presentation
grouping; **the class is open**. Process and Settlement fall out of the
must-have clauses by construction, overlays are spec-derived one per attestable
clause family in use, and composition graphs come from whatever on-network
venues a record touches — so `extractOverlays` groups by the attestation's
opaque on-chain clause key and decodes through the spec you loaded, and a family
registered after this SDK shipped flows through unchanged.

### `@figaro-protocol/sdk/clauses` — Clause-Spec Format + Content Encoding

*Lost track of where a name below lives? → [Synopsis](#synopsis--which-entry-point-is-each-export-from).*

The single off-chain source of truth for clause-content well-formedness and
canonical ABI encoding. It is **fully generic**: it parses a clause's spec JSON
(fetched from `ClauseRegistry` → IPFS at runtime) and applies the same rules to
ANY clause — no clause is known to this module, nothing is bundled. Adding a
clause adds a spec, never a code path here.

**Validation surfaces (present state).** Well-formedness is checked in ONE place
off-chain: this Layer-A TypeScript module (frontend form gates + SDK agent-action
preflight). On-chain, the `AttestationCoordinator` merkle-binds each attestation
to its signed agreement and content-hashes the evidence — it does NOT validate
clause content. So a never-seen clause is attestable with zero per-clause on-chain
code.

> On the BATCHED path the proof apparatus (rebuilt 2026-07-16) DOES validate
> content in-proof: a Rust mirror of this same Layer A validates and re-encodes
> the content against the clause's spec supplied as a witness input, and
> `FigaroBatchVerifier` settles only if the witness's hash matches
> `ClauseRegistry.contentHashOf` — so never-seen clauses stay attestable AND
> batch-settleable with zero per-clause code. There are no per-clause validator
> contracts, permanently. The contract catalogue that states this is published
> at `/spec`; the clause-authoring path is at `/clauses`.

```ts
import {
  parseClauseSpec,
  parseFieldSpec, // parse ONE field spec (for field specs outside a clause's
                  // content `fields` — e.g. a composition's runtime-input fields)
  validateContent,
  encodeContentFromSpec,
  decodeContentFromSpec,
} from "@figaro-protocol/sdk/clauses";

// 1. Parse a clause spec (typically fetched from ClauseRegistry → IPFS)
const parsed = parseClauseSpec(specJson);
if (!parsed.ok) throw new Error(parsed.errors[0].message);
// NOTE: `parsed.spec` deliberately omits the spec's `block` slice — that is
// presentation metadata the SDK does not own. The `contentHash` you register
// on ClauseRegistry covers the RAW canonical JSON document (including
// `block`): pin and hash the raw document; never re-serialize `parsed.spec`.

// 2. Validate content against the spec (closed clauses: unknown fields rejected).
//    Content first, spec second; pass `{ stage }` for a per-stage witness shape.
const result = validateContent({ handoff: ["face-to-face"] }, parsed.spec);
if (!result.ok) throw new Error(result.errors[0].message);

// 3. Encode content to canonical ABI bytes straight from the parsed spec. ONE
//    generic encoder drives every clause — there are no per-clause encoders.
const bytes = encodeContentFromSpec(parsed.spec, { handoff: ["face-to-face"] });
// The content lives OFF-chain; pass its FINGERPRINT `keccak256(bytes)` as the
// `contentRef` arg to attestAs{Seller,Buyer} (never the preimage — calldata is public).
// `decodeContentFromSpec(parsed.spec, bytes)` is the exact inverse (readers/audit).
```

Format is a closed subset of JSON Schema. Field types: `string` (with
format `bytes32-hex` / `address-hex` / `bytes-hex` / `iso-datetime`),
`integer`, `bigint` (decimal-string for JSON safety), `boolean`, `enum`,
`array`, `object`. Per-stage overrides via `spec.stages[stage]`.

**Before you register: `computeClauseKey` is the pre-registration collision
check.** `ClauseRegistry.registerClause` is permissionless and
first-write-wins (`src/protocol/registries/ClauseRegistry.sol:154-170`) — an
`id`+`version` someone already registered is taken **permanently** (no
overwrite, no version bump onto the same slot; the adding-a-clause checklist
is `docs/CLAUSES.md`). Compute the exact key the registry hashes and read
whether it is already live BEFORE spending the registration deposit:

```ts
import { computeClauseKey, CLAUSE_REGISTRY_ABI } from "@figaro-protocol/sdk";

const key = computeClauseKey("figaro-my-new-clause", 1); // keccak256(abi.encode(clauseId, version))
const taken = await client.readContract({
  address: addresses.clauseRegistry!,
  abi: CLAUSE_REGISTRY_ABI,
  functionName: "registered",
  args: [key],
});
if (taken) throw new Error("this id+version is already registered — pick another");
```

The same `computeClauseKey` reappears later (below, and in
`@figaro-protocol/sdk/agent`) as the `clauseId` argument to `attestAs{Seller,Buyer}` —
one function, two moments: before registering (is this slot free?) and at
attestation time (which registered clause does this section attest?).

**Then pin and hash the RAW document — `canonicalize` and
`canonicalContentHash` (both root exports).** These are the two calls behind
"pin and hash the raw document" above, and getting them wrong is silent:
`registerClause` takes whatever `bytes32` you hand it, so a spec pinned in one
serialization and hashed in another registers fine and then fails every
reader, because verification is always *fetch → re-canonicalize → re-hash*.
Pin the exact bytes you hashed:

```ts
import { canonicalize, canonicalContentHash } from "@figaro-protocol/sdk";

// `spec` is the RAW document — the whole JSON including `block`, NOT
// `parsed.spec` (which drops `block`; see the note in the first snippet).
const bytes = canonicalize(spec);              // sorted keys at every depth,
                                               // array order preserved, no whitespace
const contentHash = canonicalContentHash(spec); // === keccak256(utf8Bytes(bytes))

// Pin THOSE bytes — not JSON.stringify(spec, null, 2), not a re-serialization
// of anything you parsed. A pretty-printed pin hashes to a different value and
// the clause never verifies for anyone.
const contentURI = await pinToIpfs(bytes);     // your node, your pin service

// Deposit is a deploy-time immutable — read it, never hardcode it. Under AND
// over both revert with WrongDeposit, and an overpay is not refunded.
const deposit = await client.readContract({
  address: addresses.clauseRegistry!, abi: CLAUSE_REGISTRY_ABI,
  functionName: "registrationDeposit",
});
await walletClient.writeContract({
  address: addresses.clauseRegistry!, abi: CLAUSE_REGISTRY_ABI,
  functionName: "registerClause",
  args: ["figaro-my-new-clause", 1n, contentHash, contentURI], // version is uint64
  value: deposit,
});
```

`canonicalize` is THE one canonical-JSON convention in the protocol — the same
function hashes agreement sections and assembly compositions, which is why a
reader who fetched your spec from any gateway can re-derive `contentHash`
independently. To check your own work against a live deployment before you
trust it, recompute the hash of a spec someone already registered and compare
it to `ClauseRegistry.contentHashOf(key)` (in `CLAUSE_REGISTRY_ABI`).
If your recomputation matches the anchor, your pipeline is right.

### `@figaro-protocol/sdk/handoff` — Runtime Handoff Wire Protocol

*Lost track of where a name below lives? → [Synopsis](#synopsis--which-entry-point-is-each-export-from).*

The wire vocabulary two wallets speak when a pending commitment (or a sealed
handoff key) travels between them at runtime. The SDK owns only the message
shapes, the `HandoffChannel` transport seam, and the key agreement — the
**transports live with the consumer** (XMTP, an in-memory test bus, an inert
links-only null channel), so a second frontend implements one channel and
reproduces the exact key-exchange bytes from this entry point alone.

Four `ChannelMessage` shapes cross the channel (all safe on a PUBLIC transport):
`HandoffKeyMessage` (`HANDOFF_KEY`, a bare AES key — only when the transport is
itself confidential), `EcdhPubkeyMessage` (`ECDH_PUBKEY`, the receiver's
per-order ephemeral public key), `EcdhWrappedKeyMessage` (`ECDH_WRAPPED_KEY`,
the AES key wrapped under the ECDH secret), and `CommitmentSignatureMessage`
(`COMMITMENT_PAYLOAD`, a **bare IPFS CID** — no `ipfs://` prefix — of a pinned,
JSON-serialized `CommitmentPayload` from `@figaro-protocol/sdk/agent`; the envelope stays
small and late subscribers get a durable retrieval path). This is a DIFFERENT
exchange from `@figaro-protocol/sdk/agent`'s `CoordinationChannel`, which carries the
bilateral OFFER between agents — different vocabulary, different seam.

The ECDH secret reproduces `eciesjs@0.5`'s `encapsulate`/`decapsulate` byte-for-
byte (golden-vector-pinned): the 32-byte secret is `HKDF-SHA256(senderPub ||
sharedPoint)`, no salt, no info. **Direction matters** — the SENDER's public key
is folded into the HKDF input, so the two sides call *different* halves and the
reverse pairing yields a DIFFERENT secret:

- the **sender** (who will encrypt) calls `deriveSharedSecretAsSender(myPriv, receiverPub)`,
- the **receiver** calls `deriveSharedSecretAsReceiver(senderPub, myPriv)`.

```ts
import {
  generateOrderKeypair,
  deriveSharedSecretAsSender,
  deriveSharedSecretAsReceiver,
  wrapWithSharedSecret,
  unwrapWithSharedSecret,
} from "@figaro-protocol/sdk/handoff";
import type { HandoffChannel } from "@figaro-protocol/sdk/handoff";

// RECEIVER: mint a per-order ephemeral keypair, publish the public key.
const kp = generateOrderKeypair(); // { privateKeyHex, publicKeyHex } — compressed 66-char pub
await channel.sendEcdhPubkey({ recipientAddress: senderAddr, orderId, pubKeyHex: kp.publicKeyHex });

// SENDER: on the receiver's pubkey, derive with OWN priv + receiver's pub, then
// wrap the AES handoff key (a base64url string) and send the blob publicly.
const secretS = deriveSharedSecretAsSender(myPrivHex, receiverPubHex);
const wrappedKeyB64 = await wrapWithSharedSecret(keyB64, secretS); // base64url: 12-byte IV || AES-256-GCM
await channel.sendWrappedKey({ recipientAddress: receiverAddr, orderId, wrappedKeyB64 });

// RECEIVER: derive with sender's pub + OWN priv (the same 32 bytes), unwrap.
const secretR = deriveSharedSecretAsReceiver(senderPubHex, kp.privateKeyHex);
const keyB64Back = await unwrapWithSharedSecret(wrappedKeyB64, secretR);
// keyB64Back === keyB64 → the receiver holds the AES key and opens the sealed payload.
```

A `HandoffChannel` implementation carries each `ChannelMessage` shape between two
wallet addresses with matched `send*`/`on*` pairs (`sendEcdhPubkey`/`onEcdhPubkey`,
`sendWrappedKey`/`onWrappedKey`, `sendCommitmentPayload`/`onCommitmentPayload`
plus `onAnyCommitmentPayload` for the connected wallet, and the direct
`sendHandoffKey`/`onHandoffKey`), and a `destroy()` teardown. `senderIdentity`
in each callback is transport-specific (an XMTP inbox id, a wallet address) — the
SDK does not constrain it. Full signatures: `dist/handoff/messages.d.ts` +
`dist/handoff/ecdh.d.ts`.

### `@figaro-protocol/sdk/signer` — The Policy Signer

*Lost track of where a name below lives? → [Synopsis](#synopsis--which-entry-point-is-each-export-from).*

The protocol-shaped half of the sandboxed signer runtime
(`docs/AI_AGENT_COORDINATION.md` § "The sandboxed signer runtime"): a daemon
that holds the wallet key in ITS process only (encrypted V3 keystore,
passphrase at start) and exposes signing as an operation over a local UNIX
socket — every request passing an out-of-model policy gate before anything is
signed. The gate enforces: EIP-712 **domain binding** (chainId + a
verifyingContract on the policy's allowlist — `FigaroCore` and
`FigaroBatchVerifier`, the batch universe's own domain), a **contract +
selector allowlist** for transactions, **per-action and rolling-period value
ceilings** (token risk = the wallet's own bond side of a Commitment plus every
`approve` at its amount; native risk = a payable call's `value`, refused
unless the policy grants a native ceiling), a **simulation veto** (`eth_call`
plus best-effort asset tracing), and an **audit log**. `personal_sign` is
refused always. The rolling window persists in a signer-owned journal — a
restart cannot reset the ceiling.

Run it:

```sh
npx figaro-signer --policy deployments/signer-policy.11155111.json \
  --keystore ~/operator.keystore.json --socket /tmp/figaro-signer.sock
# passphrase: FIGARO_SIGNER_PASSPHRASE env, or the hidden prompt
```

Consume it — the account drops into the `WalletClient` the agent layer
already takes; the agent's code path is unchanged and the key is unreachable:

```ts
import { socketSignerAccount } from "@figaro-protocol/sdk/signer";
import { createWalletClient, http } from "viem";

const account = socketSignerAccount({ socketPath: "/tmp/figaro-signer.sock", address: operated });
const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
```

A reference policy for the live Sepolia stack ships at
`deployments/signer-policy.11155111.json`, generated from the deployment
record and the SDK ABIs — addresses and selectors are derived, never
hand-typed. The host-shaped half (the sandbox wrapper carrying the policy's
`egress` allowlist) lives beside the agent prompts, not in this package.

## Projection: from Composed Clauses to the Hashed Agreement

An adopted assembly template ships its clause maps mostly empty — an empty `{}`
means the designer *selected* the clause but set no fields, deferring them
downstream (the seller at first use, the buyer at checkout — `assembly.d.ts`).
Turning a hydrated template into the filled, hashed `Agreement` that
`buildCommitment` signs is a **deterministic projection**: both parties, and any
second frontend, must reproduce it byte-exactly because its outputs are hashed
(`agreementHash` — the merkle root the commitment signs; `compositionHash` —
assembly identity). The SDK now ships that projection (`dist/projection.d.ts`) —
you no longer hand-assemble sections.

**The SDK holds NO spec cache.** Every projection function takes a `SpecSource`
— the consumer's window onto its loaded `ClauseRegistry → IPFS` specs:

```ts
import { parseClauseSpec } from "@figaro-protocol/sdk/clauses";
import { parseProjectionHints } from "@figaro-protocol/sdk";
import type { SpecSource, ProjectionSpecView } from "@figaro-protocol/sdk";

// Build a SpecSource from the raw spec JSON you fetched from the registry.
// A view is the Layer-A spec PLUS the hash-load-bearing `block` hints
// (`design.article`, `design.scope`, `design.fills`, `checkout.catalogueFills`,
// `checkout.profileFills`) that parseProjectionHints extracts — everything
// else in `block` is presentation the SDK never reads. `design.fills` names
// the content fields the DESIGNER authors into the template (the tailoring);
// the template keeps those values and strips every other clause's to `{}`.
//
// `block.design.article` is normally your clause's own group name (free text:
// "coordination", "logistics", …). TWO values are RESERVED and change
// agreement semantics:
//   "mandatory"    — auto-folds into EVERY template agreement (specIsMandatory)
//   "attestations" — an empty anchor at commit, content attested later
//                    (specIsProcessLog)
// Pick either by accident — say you group an attestation clause under
// "attestations" — and your clause behaves differently with no error raised.
// Registration is permanent and first-write-wins, so choose before you register.
//
// `warnProcessLogFillsTrap(view)` catches the one construction that never
// makes sense under "attestations": declaring `design.fills` or
// `checkout.catalogueFills`/`profileFills` (designer/catalogue/profile
// content pins) on a clause the article marks a process-log. A process-log
// section is unvalidated at commit (`validateCommitmentAgreement` skips it
// outright), so a pinned fill there is content the author believes is
// checked that in fact never is. It's a WARNING, not a parse error —
// "attestations" is correct and meaningful for a real process-log clause
// (`figaro-merchant-process`, `figaro-courier-process` both use it, with no
// fill list — the shape a genuine one always has); this fires only on that
// specific fills-on-process-log combination.
function makeSpecSource(rawSpecsByKey: Map<string, unknown>): SpecSource {
  const views = new Map<string, ProjectionSpecView>();
  for (const [key, raw] of rawSpecsByKey) {   // key = `${clauseId}@${version}`
    const parsed = parseClauseSpec(raw);
    if (!parsed.ok) throw new Error(parsed.errors[0].message);
    views.set(key, { ...parsed.spec, hints: parseProjectionHints(raw) });
  }
  return {
    get: (clauseId, version) => {
      if (version != null) return views.get(`${clauseId}@${version}`);
      // no version → the highest loaded version of this clause
      let best: ProjectionSpecView | undefined, bestV = -1;
      for (const [k, v] of views) {
        if (!k.startsWith(`${clauseId}@`)) continue;
        const n = Number(k.slice(clauseId.length + 1));
        if (n > bestV) { bestV = n; best = v; }
      }
      return best;
    },
    list: () => [...views.values()],
  };
}
```

A spec that is not (yet) loaded returns `undefined` from `get`, and the
projection degrades exactly as the registry-reading frontend does (no defaults
injected, validation skipped for that section, field lookups fall back to
data-key presence). Consumers that need strictness gate on their cache being
warm before projecting.

**One order.** `buildOrderAgreement` takes the complete clause map
(`{ [clauseId]: fieldValues }`), injects each spec's own declared-field defaults
for omitted fields (the SPEC speaks; the code injects nothing of its own), sorts
sections deterministically, and returns the `Agreement` + its merkle-root
`agreementHash`. `assertAgreementSignable` is the single Layer-A gate every
signature routes through — buyer sign, seller counter-sign, and the checkout's
pre-wallet check all call it, so no path signs an agreement whose sections
violate their specs, whose settlement currency differs between the signed TERM
and the signed STRUCT, or whose hash mismatches its recomputed root
(`validateCommitmentAgreement` is the non-throwing form, returning
`{ ok, issues }`). The mirror check is why the gate takes the commitment's
`{ currency, payment }` pair (a full `Commitment` satisfies it): both are
clause leaves under `agreementHash` (the commerce clause's `currency` and
`payment` fields) AND fields of the kernel commitment, and the gate asserts
each leaf equals its struct mirror — plus, where the assembly composes a
denomination pin, that the pin equals the currency leaf. The negative half matters just as much: `buildOrderAgreement`
itself validates NOTHING — it is pure projection (apply spec defaults, sort,
hash) — so a caller that builds an agreement and skips `assertAgreementSignable`
can still produce a signable-looking object with content that violates its own
clause specs.

```ts
import { buildOrderAgreement, assertAgreementSignable, sectionByField } from "@figaro-protocol/sdk";

// clauses: clauseId → field values (design-time ∪ runtime fill); clauseVersions:
// clauseId → the registered version composed (template-sourced; absent entries
// fall back to the loaded spec's version).
const { agreement, agreementHash } = buildOrderAgreement(
  buyer, seller, clauses, specs, clauseVersions,
);
// The 4th argument is the commitment's mirrored pair (currency + payment) —
// the struct side of the leaf==struct assertion; a full Commitment satisfies
// it. The last argument is the label used in the error.
assertAgreementSignable(agreement, agreementHash, specs, commitment, "checkout"); // throws on any Layer-A issue

// Read sections by DECLARED FIELD, never by clause id — any registered clause
// carrying the field participates.
const commerce = sectionByField(agreement, "lineItems", specs);
```

## From Adopted Template to Signed Agreement — the ONE walk

Every consumer that turns a template into kernel orders — an agent originating a
chain (`@figaro-protocol/sdk/agent` `buildChainOffers`), a checkout realizing a bound
assembly, a designer displaying a draft — performs the same walk: order the
template agreements so parents precede children, detect the root, replace
template-local parent ids with real EIP-712 order hashes, accumulate cumulative
value, and derive each order's hash and the process id from the root.
`reconstructOrdersFromTemplate` (`dist/reconstructOrders.d.ts`) is that walk's
single home — hand-assembling sections order-by-order is no longer the recipe.

**Who fills what**: the designer selected the clauses and authored any
`design.fills` values (the tailoring); the seller filled profile/catalogue
master data at first use (`checkout.profileFills` / `checkout.catalogueFills`,
folded at checkout); the buyer fills the remaining checkout values here as
per-node `overrides` — the buyer owns every content field named in no fills
list. The SDK never fabricates a
signature — the caller signs each node's `typedData` (per node via `onOrder`).

```ts
import {
  fetchDiscoveryEvents, reconstructDiscovery,
  reconstructOrdersFromTemplate, planTemplateOrders,
} from "@figaro-protocol/sdk";
import type { AssemblyTemplate } from "@figaro-protocol/sdk";

// 1. Hydrate the adopted template: discovery → the assembly pointer → IPFS.
const graph = reconstructDiscovery(await fetchDiscoveryEvents(client, addresses, 0n));
const asm = graph.getAssemblies().find((a) => a.compositionHash === compositionHash);
const template: AssemblyTemplate = await (await fetch(gateway(asm!.contentURI))).json();

// PURE STRUCTURE for display (no parties, values, or signatures): commit-ordered
// nodes with complete version maps + local parent edges.
const planned = planTemplateOrders(template);

// 2. The full realization. `specs` present ⇒ checkout semantics (spec-default
//    projection via buildOrderAgreement, process-log clauses stay empty
//    anchors); omit it for the raw override-merge (agent-origination semantics).
//    Commits MUST be submitted in the returned order — root first — so the
//    kernel sees a consistent running cumulative total.
const orders = await reconstructOrdersFromTemplate(template, {
  buyer, currency, chainId, core: addresses.core, specs,
  // One ReconstructNodeSpec per template node: who sells it, what it pays, and
  // the per-clause checkout values (keyed by clauseId — the SDK names none).
  nodes: (node) => ({
    seller: sellerFor(node.nodeId),
    payment: paymentFor(node.nodeId),
    // The settlement currency is a TERM (a merkle leaf on the commerce
    // clause) that the commitment's `currency` param above MIRRORS — write
    // the same address into both, or the sign gate refuses the agreement.
    // A pinned assembly's value comes from its denomination clause
    // (`readUtilityTokenPin` resolves it); otherwise it is the buyer's pick
    // from the seller's accepted tokens, else the seller's default.
    overrides: { "figaro-commerce": { currency, payment: paymentFor(node.nodeId).toString(), lineItems } },
  }),
  // Per-node seam, invoked in commit order as each order is realized — sign,
  // pin the party-private agreement, share, or compose here. SHARING is
  // out-of-band by design: hand the counterparty the pinned agreement URI +
  // the signed commitment over any channel you both reach (the handoff
  // coordination channel, a link, a QR); whoever ends up holding both
  // signatures may broadcast the commit — the kernel checks signatures,
  // never the sender.
  onOrder: async (order) => {
    const buyerSig = await buyerWallet.signTypedData(order.typedData);
    // order.isRoot ⇒ processId ZERO on the signed struct (kernel derives it);
    // sub-orders carry the root's derived processId and their parents' REAL
    // order hashes. order.cumulativeValue is the running total AFTER this order.
    // Pin order.agreement (party-private evidence, referenced on-chain by hash),
    // collect the seller counter-signature, then commit (see @figaro-protocol/sdk/agent).
  },
});
```

For a single non-templated order, use `buildOrderAgreement` (above) directly and
feed its `agreementHash` into `buildCommitment` as in the `@figaro-protocol/sdk` entry
point. The empty agreement hashes to `bytes32(0)`; there is no separate "root"
object — the `agreementHash` IS the merkle root over the section leaves.

## Checkout Planning

Buyer-side checkout planning — the fill-where-composed section writers, the
sub-order seller plan, live contributor pricing, and the open rate-quantity
registry — are root exports (`dist/checkoutPlan.d.ts`). Everything here shapes
COMMITTED bytes (agreement sections the merkle root hashes) or the payment
figures the commitments sign, so a second frontend must reproduce it exactly. **No
clause is ever named**: sections are found by their DECLARED FIELDS (`lineItems`,
`parentOrderHashes`, `massGrams`, `billedMassGrams`) or their spec hints
(`catalogueFills`) through the caller's `SpecSource` — a fill whose clause isn't
composed is a no-op, so the same call serves the root and every sub-order.

```ts
import {
  fillCommerceSection, writeTopologySection, fillDerivedSections,
  fillCargoSection, fillClassSections, fillProfileSections, fillDimweightSection,
  planSubOrderSellers, resolveSubOrderPricing, profileValuesFor,
  registerRateQuantitySource, getRateQuantityResolver, topologicalOrder,
} from "@figaro-protocol/sdk";
```

- **Section fills** (by declared field): `fillCommerceSection` (settlement
  terms — `lineItems` supplied only for the root cart), `writeTopologySection`
  (the REAL parent-order hashes into `parentOrderHashes`), and the logistics
  fills `fillDerivedSections` folds together — `fillCargoSection` (mass/volume
  sum × quantity), `fillClassSections` (catalogue-authored freight-class/hazmat/…),
  `fillProfileSections` (the seller's PROFILE-authored master data — dimweight's
  divisor, a declared credential id — restricted to each spec's declared
  `block.checkout.profileFills` subset, with the template's committed terms winning),
  and the DERIVED `fillDimweightSection` (`billed = max(gross, volumetric)`,
  divisor read from the profile-folded leaf).
- **Sub-order sellers**: `planSubOrderSellers` topologically orders the non-root
  orders and resolves each one's seller from the adopting seller's counterparty
  bindings via a per-clause binding cursor — a clause shared by sibling orders
  draws distinct wallets by commit order, so the ordering must match the
  checkout's commit order (throws on a cyclic topology; `topologicalOrder` is the
  underlying pure math). `seller` is `null` when no counterparty is bound.
- **Pricing**: `resolveSubOrderPricing` prices a sub-order from its contributor's
  OWN catalogue (`billedQuantity × unitPrice = payment` always holds, so the
  committed line item replays the payment with no reference back to the mutable
  catalogue); `profileValuesFor` looks up a seller's profile-authored clause
  values for the profile fold.
- **Open rate-quantity registry**: `registerRateQuantitySource(source, resolver)`
  / `getRateQuantityResolver(source)` — a `pricingPolicy: "rate"` item resolves
  its billed quantity through this last-write-wins registry (shipped tenants:
  `checkout-quantity` = the buyer enters units; `order-geodistance` = derived from
  the order's committed geolocation endpoints). A booking-window or routed-distance
  composition registers a new tenant without touching checkout code.

Signatures and the exact fold rules live in the `dist/checkoutPlan.d.ts`
docblocks — treat them as the contract; this list is the map, not the territory.

### Worked example — the fill pipeline in sequence

The fills above are always run in the SAME shape: start from a node's clause
map, run every fill its composed clauses declare, hand the result to
`reconstructOrdersFromTemplate` as that node's `overrides`. One node — root or
sub-order — looks like this:

```ts
import {
  reconstructOrdersFromTemplate, fillCommerceSection, fillClassSections,
  fillProfileSections, fillProvenanceSection, profileValuesFor,
  templateCompositionHash, type AssemblyCheckoutLineItem, type PlannedTemplateOrder,
} from "@figaro-protocol/sdk";

// Hardcoded here for brevity. Building `lineItems` from a fetched
// `MemberCatalogueMetadata` item has no exported helper — there is no
// `catalogueItemToLineItem` in the SDK — so do the mapping yourself:
// `id` → `itemId`, `price` (human decimal) → `unitPrice` (smallest unit, via
// viem's `parseUnits(item.price, tokenDecimals)` — see `CatalogueItemMetadata.price`'s
// doc comment), and `clauseValues` copied through UNCHANGED (same
// `{clauseId: fieldValues}` shape `fillClassSections` reads below).
const lineItems: AssemblyCheckoutLineItem[] = [
  { itemId: "espresso", name: "Espresso", quantity: 2, unitPrice: "150000000000000000" },
];

await reconstructOrdersFromTemplate(template, {
  buyer, currency, chainId, core: addresses.core!, specs,
  nodes: (planned: PlannedTemplateOrder) => {
    // `planned.clauses` is ALREADY the assembly-scope FOLD: planTemplateOrders
    // (the walk `reconstructOrdersFromTemplate` runs internally) merges
    // `template.assemblyClauses` into every node's bag before you ever see
    // it — start the fills from `planned.clauses`, never from a fresh
    // `{ ...node.clauses }` you build off a raw `template.agreements[i]` lookup.
    const filled = fillProvenanceSection(
      fillProfileSections(
        fillClassSections(
          fillCommerceSection(planned.clauses, payment, currency, specs, lineItems),
          lineItems, specs,
        ),
        profileValuesFor(seller, memberCatalogues), specs,
      ),
      templateCompositionHash(template), specs,
    );
    return { seller, payment, overrides: filled };
  },
  onOrder: async (order) => { /* sign, pin, share — see "the ONE walk" above */ },
});
```

**The sequencing nuance the fold does NOT save you from.** Each fill above
finds its target clause by DECLARED FIELD, searching only the keys of the map
you pass it (`composedClauseDeclaring`, `checkoutPlan.ts`) — it never reads
`template.assemblyClauses` itself. So the fold's guarantee is scoped to
`planned.clauses`, not to whatever local map your own code builds. The moment
you have a reason to rebuild that map from the raw template yourself — e.g. to
hand `resolveSubOrderPricing` its `node: TemplateAgreement` argument, which
`planned.clauses` alone doesn't satisfy — you must re-apply the same fold by
hand before running any fill:

```ts
const rawNode = template.agreements.find((a) => a.id === planned.nodeId)!;
const clauses = { ...template.assemblyClauses, ...rawNode.clauses }; // ← the pre-merge
const filled = fillProvenanceSection(clauses, templateCompositionHash(template), specs);
```

Skip the pre-merge and `fillProvenanceSection` (which writes the mandatory,
assembly-scoped `figaro-assembly-provenance` clause — `docs/CLAUSES.md`) finds
no clause in `rawNode.clauses` declaring `compositionHash` and silently
no-ops. The section is still PRESENT in the signed agreement either way — the
fold inside `reconstructOrdersFromTemplate` guarantees that — but it arrives
**empty** (`{}`) instead of carrying the hash that makes the process
creditable to its assembly's designer of record
(`UsageCounter.recordAssemblyUsage`).

## Member Profile + Catalogue Documents

Two off-chain JSON documents describe a participant. Both are **Layer-A** — their
types and strict parsers are exported from the ROOT `@figaro-protocol/sdk` (next to
`RegisteredMember` / `reconstructDiscovery`), so an integrator reading a
participant learns the shape from the SDK instead of the frontend bundle. Neither
document is bundled — each is pinned to IPFS and read at runtime.

The profile is ONE document for every participant — there is no buyer half and no
seller half. It is already split on stable↔volatile (identity envelope here, the
volatile item list behind `catalogueURI`); a buyer/seller split would be a second,
crossing axis, and the fields it would divide (`acceptedTokens`, `catalogueURI`,
location, branding) serve either side unchanged. Registering is how a wallet
PUBLISHES, never how it QUALIFIES — transacting through the kernel needs no
registration at all.

- **Profile** (`MemberProfileMetadata`) — the stable identity envelope pinned at
  `MembersRegistry.metadataURI`. `name` is the ONLY required field; everything
  else is optional (`subjectAddress`, `description`, `specialty`, `location`,
  `branding`, `assets`, `acceptedTokens`, `defaultTokenAddress`,
  `profileClauseValues`, `assemblyBindings`, `buyerAssemblies`,
  `disclosurePolicy`, `services`, and `catalogueURI` — the pointer to the
  catalogue). Token
  acceptance is an identity declaration, not a market position. Carries no
  role / archetype / category taxonomy — what a seller does is inferred from the
  catalogue.
  - `subjectAddress` is the wallet the profile speaks for. Optional in the
    on-chain-pinned shape because the registry already binds wallet →
    `metadataURI`, so a solitary document need not repeat it — but stamp it
    anyway: the moment profiles are materialised side by side (an indexer's
    array, a fixture file, a catalogue joined to its profile) it is the only
    join key, and `MemberCatalogueMetadata` REQUIRES its own. Treat it as
    non-clearable once set; a patch that drops it silently orphans the
    document.
  - `assemblyBindings` is an array of `AssemblyBindingRecord` — one entry per
    assembly the wallet participates in, each
    `{ bindingId, subjectAddress, assemblySlug, counterpartyBindings? }`. Each
    `counterpartyBindings` entry is `{ clauseId, addresses[] }`: the wallets the
    seller designates for a sub-order carrying that process clause (e.g. a
    courier-process clause → the courier wallets checkout fills the courier
    sub-order from; order is significant — checkout takes the first reachable, or
    surfaces the list). Without this field the cart has nowhere to read a
    sub-order counterparty's wallet from. The seller's ROLE in the assembly is
    event-derived, never declared here.
  - `disclosurePolicy` is an array of `DisclosurePolicyEntry` — the member's
    self-declared terms for the records they co-produce inside bonded processes
    (the voluntary data market), each
    `{ compositionHash, clauseId, posture, offered, whitelist?, calendar? }`. The
    data a row names is DERIVED, never a stored taxonomy: `compositionHash` (the
    `AssemblyRegistry` key of an assembly the member binds) × `clauseId` (the
    record's leaf section) name clauses the member already composes.
    `posture: "buyer" | "seller"` says which side the member co-produced the
    record on — members hold both, on the same terms structure. `offered` is the
    toggle (`false` = explicit withholding); `whitelist` narrows who may buy/see
    (absent = any counterparty, once offered); `calendar` says when
    (`{ embargoDaysAfterSettlement?, notBefore?, notAfter? }`). Prices never
    appear here — a data product is priced as an item in the member's own
    catalogue (fixed | rate), the item referencing the class via `dataSold`.
    Field absent = the paper-contract default: each party holds its own
    copy; absence of a policy is NOT a policy of openness.
  - `buyerAssemblies` is an array of `BuyerAssemblySubscription` — the buyer's
    assembly SUBSCRIPTIONS, `{ compositionHash }` each: which registered
    assemblies this member buys through and monetizes records from.
    Independent of `assemblyBindings` (the seller's list — a wallet does not
    buy through the assemblies it sells through); subscribing is the buyer's
    verb, binding stays the seller's. Buyer-posture `disclosurePolicy` entries
    derive their candidate classes from this list.
- **Catalogue** (`MemberCatalogueMetadata`) — the volatile item list pinned at
  `profile.catalogueURI`. Required: `subjectAddress`, `items[]`, `version` — and
  `version` is a **string** (`"1"`, never `1`): `parseMemberCatalogueDocument`
  throws `…version must be a string.` on a number rather than coercing it.
  Each item requires `id`, `name`, `price`, `available`; optional are
  `description`, `category`, `image`, `dataSold` (marks a DATA-PRODUCT
  item: `{ compositionHash, clauseId, posture }` referencing one of the
  member's own declared data offers — the policy declares the terms,
  this item is the price), physical measures (`massGrams`,
  `volumeMl`, `lengthMm`/`widthMm`/`heightMm`), rate pricing
  (`pricingPolicy: "fixed" | "rate"`, `rateUnit`, `rateQuantitySource`), and
  the catalogue-sourced `clauseValues` map. Split off the profile so an item
  edit re-pins one small JSON, not the whole identity envelope.

```ts
import {
  reconstructDiscovery,
  parseMemberProfileDocument,       // throws on malformed input
  tryParseMemberProfileDocument,    // returns null on malformed input
  parseMemberCatalogueDocument,
  projectAgentServices,             // pull ERC-8004 agent endpoints from a profile
} from "@figaro-protocol/sdk";
import type { MemberProfileMetadata, MemberCatalogueMetadata } from "@figaro-protocol/sdk";

// 1. Discovery hands you the metadataURI for each registered seller.
const graph = reconstructDiscovery(events);
// → RegisteredMember { member, metadataURI } — the wallet field is `.member`,
// NOT `.seller` (a member is any registered wallet; the role is event-derived
// elsewhere, never a stored field on this record).
const registeredMember = graph.getMembers()[0];

// 2. Fetch + parse the profile document (IPFS/HTTP fetch is yours to make).
const profileJson = await (await fetch(gateway(registeredMember.metadataURI))).json();
const profile: MemberProfileMetadata = parseMemberProfileDocument(profileJson);
const { reachable, services } = projectAgentServices(profileJson);

// 3. Follow catalogueURI to the item list.
if (profile.catalogueURI) {
  const catJson = await (await fetch(gateway(profile.catalogueURI))).json();
  const catalogue: MemberCatalogueMetadata = parseMemberCatalogueDocument(catJson);
}
```

**Publish flow (write side).** Build a document, validate it by round-tripping
it through the strict parser, pin it, then anchor the URI on-chain:

```ts
import { MEMBERS_REGISTRY_ABI } from "@figaro-protocol/sdk";

const doc: MemberProfileMetadata = { name: "Bob Pizza", catalogueURI: "ipfs://Qm…" };
parseMemberProfileDocument(doc);                 // throws if malformed — validate before pinning
const metadataURI = await pinJSON(doc);          // your IPFS pin → "ipfs://…"

// First registration (payable — sends the registration deposit):
//   MembersRegistry.register(metadataURI)
// Subsequent profile edits (re-pin, then point the registry at the new URI):
//   MembersRegistry.updateProfile(metadataURI)
```

**Raw call signatures for the two clause-or-assembly registries** (for `cast send` /
direct-ABI callers — the exact parameter types are the function's identity, so
a mistyped one reverts with an opaque selector mismatch, not a friendly error):

```solidity
// ClauseRegistry.sol:156 — cast selector: registerClause(string,uint64,bytes32,string)
function registerClause(string calldata clauseId, uint64 version, bytes32 contentHash, string calldata contentURI) external payable

// AssemblyRegistry.sol:148 — cast selector: registerAssembly(bytes32,string)
function registerAssembly(bytes32 compositionHash, string calldata contentURI) external payable

// ClauseRegistry.sol:207 — a composed MECHANISM contract declaring which clause
// it speaks. Permissionless, not payable, writes no storage: it only emits
// MechanismClauseSet(msg.sender, idHash) for indexers, and reverts
// NotRegistered(idHash) if that clause was never anchored. Note the argument is
// the identity HASH (computeClauseKey(id, version)) — not the bare string name
// registerClause takes.
function setMechanismClause(bytes32 idHash) external
```

`version` is `uint64`, not the `uint256` a caller might reach for by habit; and
`registerAssembly` takes no version parameter at all — `compositionHash` alone
is the identity. Both registering calls are `payable`; `msg.value` must equal
`registrationDeposit()` exactly (`setMechanismClause` is not — it takes no deposit).

**All three registries take the same reclaimable ETH deposit.** `MembersRegistry`,
`ClauseRegistry`, and `AssemblyRegistry` each require a `registrationDeposit` on
the registering call (`register` / `registerClause` / `registerAssembly`, all
`payable`) — a spam-deterrent stake, not a fee: no party can seize it, and `msg.value`
must equal it EXACTLY (there is no sweep). The amount is a deploy-time immutable;
read it from the contract's `registrationDeposit()` view rather than hardcoding a
figure. Clause and assembly deposits come back in one call —
`withdrawDeposit(idHash | compositionHash)`, which de-surfaces the clause or assembly while
leaving the binding permanent, because agreements committed against them keep
resolving forever.

**A member's deposit comes back in TWO calls**, and the split is load-bearing:

```ts
// 1. Leave the surface. Takes effect immediately: the dedup guard clears, the
//    member disappears from discovery, and the wallet may register again at once.
//    MembersRegistry.requestWithdrawal()
// 2. Take the deposit back, once `withdrawalCooldown` seconds have passed.
//    MembersRegistry.withdraw()          // reverts CooldownActive(releaseAt) before then
```

Read the schedule from `withdrawalCooldown()`, `pendingDeposit(member)` and
`releaseAt(member)`. The cooldown is what makes the deposit a real Sybil price:
without it one deposit is recycled through identity after identity, so fabricating
breadth costs no capital at all. De-surfacing and release are deliberately
different moments — nobody is held on a surface they asked to leave, while the
capital stays committed. **Anything tracking who is currently surfaced must fold
`MemberWithdrawalRequested`, not `MemberWithdrawn`**; the latter is the custody
event and can arrive a whole cooldown later. `reconstructDiscovery` already does.

**Reading an assembly binding.** `AssemblyRegistry.bindings(compositionHash)` returns
the tuple `(address registeredBy, uint64 registeredAt, bool depositWithdrawn, string contentURI)`.
The existence check is `registeredAt != 0`, NOT the bool: after a normal registration
`depositWithdrawn` is `false` and stays false while the deposit is still staked (the
surfaced state) — it flips to `true` only once the registering wallet reclaims the deposit. So a
freshly registered assembly correctly reads `depositWithdrawn == false`; that false is
"deposit still held," not "registration failed."

`ClauseRegistry`'s parallel stake struct (`depositOf[idHash]`, surfaced to the SDK as
`RegisteredClause.registeredBy`) spells the same field the same way — both registries
name the registering wallet `registeredBy` (one role, one name), and
`RpgfMinter._isAuthor` treats it as the clause-or-assembly's author for 600M reward
eligibility.

The catalogue follows the same shape: `parseMemberCatalogueDocument(cat)` →
`pinJSON(cat)` → set the resulting URI as the profile's `catalogueURI` and
`updateProfile`. First-write-wins binding means the wallet→profile edge is
permanent; `updateProfile` swaps only the pointer.

There is no on-chain getter for a profile — `MembersRegistry` exposes
`register`/`updateProfile`/`requestWithdrawal`/`withdraw` and no view returning a
member's current `metadataURI`, by design (state is event-derived; discovery
reconstructs it). `registered(member)` answers only whether the stake is live.
The event log is the read path: verify an update landed by re-running discovery
(`reconstructDiscovery(await fetchDiscoveryEvents(client, addresses, 0n))`).

## Data products — sell, deliver, verify, subscribe

A data sale is not a special mode of the protocol. It is an **ordinary bonded
order whose value-added IS access to records** — so everything above applies
unchanged: the same 2× bonds, the same bilateral signature, the same atomic
resolve. What is specific is which clauses the order composes, and one property
that falls out of the merkle commitment: the records a buyer receives are
**self-authenticating** — each disclosed section verifies against a chain fact,
so provenance never rests on the seller's word.

Four moments below. The clause ids named are **worked examples of an open set**,
never a fixed corpus: a designer can compose different clauses for the same
trade, so route by the field a clause DECLARES (`sourceProcesses`,
`contentHandoff`, `licenseScope`) with `sectionByField`, never by matching a
name.

### 1. SELL — declare the terms, price the item

Two documents you already own (both from "Member Profile + Catalogue Documents"
above), each carrying exactly half of the offer:

- The **profile's `disclosurePolicy`** carries the DISCLOSURE terms: one entry
  per kind of record,
  `{ compositionHash, clauseId, posture, offered, whitelist?, calendar? }`.
  What a row names is derived, never a stored taxonomy — the assembly you bind
  or subscribe to × the clause whose leaf holds the record × the side you traded
  on. Absence of a row is the paper-contract default (each party holds its own
  copy), **not** a policy of openness; `offered: false` is an explicit
  withholding, which is a different statement.
- The **catalogue item's `dataSold`** carries the PRICE: `{ compositionHash,
  clauseId, posture }` pointing at one of your own declared rows, plus the
  ordinary `price` / `pricingPolicy` fields every other item uses. Prices never
  appear in the policy, and the terms of the SALE (§2) ride the item's
  `clauseValues`, not `dataSold`.

```ts
import { parseMemberProfileDocument, parseMemberCatalogueDocument } from "@figaro-protocol/sdk";

// The record is a LEAF of an assembly this wallet already trades under — here,
// the flight-record leaf of a survey assembly, co-produced as its seller. Pick
// it by reading the assembly's own composed clauses, never from a list of
// "data clauses": any leaf of any assembly you traded under can be a product.
const dataOffer = {
  compositionHash: surveyCompositionHash,
  clauseId: "figaro-geolocation",
  posture: "seller" as const,
};

const profile = {
  name: "Survey operator",
  catalogueURI: "ipfs://…",
  disclosurePolicy: [{ ...dataOffer, offered: true,
                       calendar: { embargoDaysAfterSettlement: 30 } }],
};
const catalogue = {
  subjectAddress: me, version: "1",
  items: [{
    id: "telemetry-2026q3", name: "Flight telemetry — 2026 Q3",
    price: "50", available: true,              // HUMAN DECIMAL, like every item
    dataSold: dataOffer,                        // WHAT is sold — the policy row above
    clauseValues: {                             // the SALE's catalogue-authored terms
      "figaro-data-license": {
        licenseScope: "Flight telemetry — 2026 Q3 survey window",
        access: "stream", redistribution: "prohibited",
        sourceProcesses: [processIdA, processIdB],
      },
    },
  }],
};
parseMemberProfileDocument(profile);            // validate BEFORE pinning — both throw
parseMemberCatalogueDocument(catalogue);        // on malformed input
// …then pin + updateProfile exactly as the publish flow above does.
```

Both postures are first class: a wallet sells the records it produced as a
seller AND the records it produced as a buyer, on the same terms structure. A
buyer-posture row draws its candidate assemblies from `buyerAssemblies`, a
seller-posture row from `assemblyBindings`.

### 2. COMPOSE — the sale is an order like any other

The sale composes the settlement clause plus, typically, a license clause and a
hand-off clause; where the subject is **this process's own** co-produced records
rather than someone else's, a data-terms clause composes into that process
instead, fixing the disclosure regime the parties co-sign.

```ts
const clauses = {
  "figaro-commerce":        { currency, payment: price.toString(), lineItems },
  "figaro-data-license":    {
    licenseScope:   "Flight telemetry — 2026 Q3 survey window",
    purpose:        "internal analytics only; model training excluded",
    access:         "stream",          // or "snapshot" — §4
    redistribution: "prohibited",      // co-signed evidence, not an on-chain block
    sourceProcesses: [processIdA, processIdB],  // the provenance anchors — §3
  },
  "figaro-content-handoff": { contentHandoff: ["encrypted-transfer"] },
};
const { agreement, agreementHash } = buildOrderAgreement(buyer, seller, clauses, specs, versions);
assertAgreementSignable(agreement, agreementHash, specs, commitment, "data sale");
```

The literal map above is the hand-authored form. In a catalogue checkout you do
not write those license values at all — `fillClassSections` folds them out of
the line item's `clauseValues` onto the leaf, found by the spec's declared
`block.checkout.catalogueFills` and never by clause name (Checkout Planning
above). One hazard rides with it: the fold takes the **first** line carrying
values for that clause, so keep one data product per order rather than mixing
two licenses into one cart.

Two placement rules the specs themselves state, readable with
`parseProjectionHints` — do not hand-place these:

- The license terms are **catalogue-authored**: `figaro-data-license` declares
  all five of its fields in `block.checkout.catalogueFills`, so the record's
  owner writes them on the data item and checkout folds them into the agreement
  both parties sign. The item's price stays the item's own field, and who may
  buy and when stay the profile's policy — neither is a field on the clause.
- The disclosure regime is **designer-authored**: `figaro-data-terms` declares
  `disclosure` in `block.design.fills` (the designer fixes `closed` /
  `each-own` / `open` at design time, so **regime variants are sibling
  assemblies**, not a runtime toggle), while `buyerDisclosure` is the buyer's
  per-order choice over their own half, filled at checkout and committed at
  signing.

Then originate it like any other order — "From Adopted Template to Signed
Agreement — the ONE walk" is unchanged, and so is every gate in it.

**Why a bond makes this tradeable at all.** Data cannot be inspected before
purchase without giving it away, which is what makes pricing it hard everywhere
else. Here the seller's 2× bond stands in for pre-inspection: the seller is
staked against the delivery being what the co-signed license says it is, and the
buyer resolves only after receiving it.

### 3. DELIVER + VERIFY — the self-authenticating leaf

**Delivery** rides the hand-off clause's `encrypted-transfer` mode: the artifact
— or, more usually, the decryption key or the stream credential, since the
corpus itself moves over whatever transport you already have — travels the
**per-order ECDH channel**. The ceremony is exactly the one in
`@figaro-protocol/sdk/handoff` above (`generateOrderKeypair` →
`deriveSharedSecretAsSender` / `deriveSharedSecretAsReceiver` →
`wrapWithSharedSecret` / `unwrapWithSharedSecret`); nothing about a data sale
changes it. Two joins that are specific:

- **Completion evidence is the delivered bytes' hash.** The hand-off clause
  declares a stage-1 witness carrying `contentHash` (`keccak256` of what you
  actually sent) and an optional `contentUri` — **omit the locator for a
  counterparty-private transfer**; it exists for the public-release and
  repository-grant modes. File it with the same `attestAsSeller` recipe as any
  other clause (see `/agent` above): the proof merkle-binds the section to the
  signed agreement, and only the fingerprint reaches calldata, so the payload
  never becomes public.
- **The buyer re-hashes what it received** and compares to the attested
  `contentHash`. That is the whole delivery check, and it needs no third party.

**Verification** is the part that has no analogue off-chain. When the license
names `sourceProcesses`, every disclosed record is provable against a chain
fact:

```ts
import {
  fetchCoreEvents, computeAgreementHash, buildSectionInclusionProof,
  verifyInclusionProof, withholdSectionContent, sectionByField,
} from "@figaro-protocol/sdk";

// (a) Read the provenance anchors off the license by DECLARED FIELD.
const license = sectionByField(saleAgreement, "sourceProcesses", specs);
const sourceIds = license!.data.sourceProcesses as `0x${string}`[];

// (b) The ROOT comes from the chain, never from the licensor. OrderCommitted
//     carries the agreementHash the two parties actually signed.
const events = await fetchCoreEvents(client, addresses, BigInt(record.deploymentBlock));
const rootsFor = (processId: string) => events.orderCommitted
  .filter((e) => e.processId.toLowerCase() === processId.toLowerCase())
  .map((e) => e.agreementHash);

// (c) The licensor hands over the source agreement with every section it is
//     NOT licensing in CONTENT-WITHHELD form — same leaf, same root, and the
//     withheld plaintext never travels.
const disclosed = {
  ...sourceAgreement,
  sections: sourceAgreement.sections.map((s) =>
    s.clause === licensedClause ? s : withholdSectionContent(s)),
};

// (d) Whole-document check: the root you recompute must BE the committed one.
const chainRoot = rootsFor(sourceIds[0])[0];
if (computeAgreementHash(disclosed) !== chainRoot) throw new Error("not the committed document");

// (e) Per-leaf check, for when only a leaf and its proof travel:
const { leaf, proof } = buildSectionInclusionProof(disclosed, licensedClause);
if (!verifyInclusionProof(chainRoot, leaf, proof)) throw new Error("leaf not under the committed root");
```

Verified end to end against the shipped `dist`: the withheld form reproduces the
plaintext form's root exactly, the disclosed leaf verifies against it, and a leaf
built from tampered section data does **not** — the check is not vacuous.

**State the boundary honestly to whoever you build for.** What this proves is
that *this content sat under that agreement's root, signed by those two parties,
at that commit* — provenance and integrity, not veracity: no chain can testify
that a sensor was pointed where its record says. And `redistribution:
"prohibited"` is not enforcement — copying cannot be prevented on chain. The
co-signed term is timestamped evidence for the layers outside the kernel (the
co-sellers' live interest in the same unresolved process, a composed arbitration
forum, ordinary courts), the same posture as every other off-chain obligation.

### 4. SUBSCRIBE — `access: "stream"` is the repeated game

`snapshot` is a one-time delivery verified by content hash. `stream` is the
sustainable form and the more interesting one: **each period's delivery is a
further bonded order (or hand-off) under the same agreement's terms**, and a
renewal is a new bonded process. That is what makes the obligation self-policing
without any enforcement machinery — a licensee who breaches loses the continuing
stream, a seller who degrades it loses the renewal, and gas is paid per
subscription rather than per data point. Who triggers period N+1 is the buyer's
side of the repeated game: their agent re-runs the sign-and-commit ceremony under
whatever policy rule the owner set — there is deliberately no on-chain scheduler,
keeper, or streaming-payment machinery to do it for them, because a standing
third actor with the power to move the next period is exactly the kind of party
the kernel exists to remove.

A worked reference of exactly this shape ships with the protocol and anchors on
the devnet "Your first commit" brings up — an assembly composing a license
clause, a hand-off clause and a schedule clause for the access window, published
as *Data stream subscription*. Whether you are on that devnet or a public chain,
find it the way you find any assembly — **by shape, from the registry**, never by
a name and never from a bundled file (a chain that anchors none returns nothing,
which is the correct answer, not an error):

```ts
const graph = reconstructDiscovery(await fetchDiscoveryEvents(client, addresses, fromBlock));
for (const a of graph.getAssemblies()) {
  const template = await (await fetch(gateway(a.contentURI))).json();
  const composed = Object.keys(template.agreements[0].clauses);
  const licenses = composed.some((c) => (specs.get(c)?.fields ?? []).some((f) => f.name === "licenseScope"));
  if (licenses) { /* this template sells access to records */ }
}
```

Fork it, compose your own, or compose none of it — a data sale needs no
particular assembly, only the clauses your buyer and you both sign.

## Claiming the author's mint — `RpgfMinter.claim`

Everything above earns. If the wallet registered a clause or an assembly and
other people's trade composed it, the 600M retroactive distribution is claimed
by the **author of record** — the wallet each registry stored as `registeredBy`,
and only while its registration deposit is still un-withdrawn (that is the
author-side half of the two-sided live-stake gate; the seller-side half lives in
`UsageCounter`). One call per wallet per period, carrying **every** clause and
assembly that wallet authored:

```ts
import { computeClauseKey, RPGF_MINTER_ABI, USAGE_COUNTER_ABI } from "@figaro-protocol/sdk";

// The keys are the registries' own identities: a clause is
// computeClauseKey(id, version); an assembly IS its compositionHash.
const mine = [computeClauseKey("figaro-my-clause", 1), myCompositionHash];

// A period must be CLOSED before it can be claimed (claim reverts
// PeriodStillAccruing otherwise), and `claimable` returns 0 — not a revert —
// for a wallet that already claimed. Read before you write:
const closed = await client.readContract({
  address: addresses.usageCounter!, abi: USAGE_COUNTER_ABI,
  functionName: "periodClosed", args: [periodId],
});
const amount = await client.readContract({
  address: addresses.rpgfMinter!, abi: RPGF_MINTER_ABI,
  functionName: "claimable", args: [periodId, me, mine],
});

if (closed && amount > 0n) {
  await walletClient.writeContract({
    address: addresses.rpgfMinter!, abi: RPGF_MINTER_ABI,
    functionName: "claim", args: [periodId, mine],   // periodId is uint8
  });
}
```

The list is a **lookup key, never a claim of ownership**: each entry is verified
against its own registry, so a key you do not author reverts `NotAuthorOfRecord`
and a repeated entry reverts `DuplicateClauseOrAssembly`. `claim` adds two of
its own: `AlreadyClaimed` (once per wallet per period) and
`NoClausesOrAssemblies` (the empty list). Every one of those fragments is in
`RPGF_MINTER_ABI`, so they decode by name instead of arriving as opaque bytes.

**`claimable` is a weaker preflight than it looks, in two ways — measured, not
inferred.** It shares `claim`'s entitlement path, so a malformed list usually
reverts there first and you learn it without spending gas; but when the period
has NO score at all the path short-circuits to `0` before checking anything, and
a duplicate list, and even a key the caller does not author, both answer `0`
rather than reverting. And it never checks CLOSURE — during accrual it returns a
live figure that moves with every recorded usage and cannot yet be claimed;
`claim` is the one that refuses, with `PeriodStillAccruing`. So a `0` is four
facts wearing one answer (already claimed · nothing scored by you · nothing
scored at all · a list that would have reverted on a live period), and a
non-zero on an open period is an estimate, not an entitlement. Read
`periodClosed` beside it, always. Once a period is closed there is no claim
expiry, no owner and no sweep — its arithmetic is stable forever, so a late
claim is exactly the same share as a prompt one.

The amount is `periodAmount · yourScore / totalScoreInPeriod`, uniform: no tag,
category, weight or cap. To predict it before the period closes, or to audit a
claim afterwards, run the off-chain mirror `computeRpgfAllocations` (Protocol
Primitives above) — and fold **both** usage event streams, or every clause whose
trade moved to the batch path under-reports.

## Design Principles

- **Minimal dependencies** — `viem` for chain I/O, `@noble/curves` + `@noble/hashes`
  for the handoff key-agreement (both audited, zero-dependency). No ethers, no
  web3.js, no framework lock-in.
- **Pure where possible** — price curves, bond math, and state reconstruction are pure functions. Chain reads are isolated and clearly marked.
- **ECDSA signers only** — the SDK builds EIP-712 typed data, and any signer that
  produces a standard secp256k1 ECDSA signature works: an EOA, a hardware wallet, or
  an MPC / threshold scheme that outputs one signature. `FigaroCore` verifies both
  commitment signatures by `ECDSA.recover` alone (`src/kernel/FigaroCore.sol:161-166`) — it
  runs no ERC-1271 check — so an ERC-1271 contract wallet (a Safe or other smart
  account) CANNOT hold a kernel party role. A contract that must transact routes
  through a funded EOA it controls (this is how the DAO treasury buys — it never
  signs a commitment itself).
- **Event-sourced state** — `Topology` reconstructs the full process/order topology from on-chain events. No subgraph dependency.
- **Live kernel event contract** — reconstruction assumes `OrderCommitted` carries the full commitment payload (`agreementHash`, `salt`, `deadline`) and that order/process closure is derived from `OrderResolved` plus `ProcessResolved`.
- **Agent-native** — the proposer generates typed actions; the HITL queue and autonomous gateway are two execution modes for the same action type.

## Versioning & stability

`@figaro-protocol/sdk` is pre-1.0 (currently `0.1.1`). Per semver's pre-1.0 convention,
**minor version bumps may include breaking changes** — there is no stable
public API yet. Pin an exact version or a narrow range if you need
reproducible builds against this package.

Every published change is recorded in the repo-root
[`CHANGELOG.md`](../CHANGELOG.md) (Keep a Changelog format) — check it before
upgrading. Each published version is tagged in the public repository:
`v0.1.0` marks the repository release, `sdk-v<version>` the commit that
version was built and published from. Verify the tie yourself rather than
taking it on trust — `npm audit signatures` checks the provenance attestation
that binds the tarball to that repository and that commit.

## Test

```bash
cd sdk && npm test
```

Autonomous-origination proofs (against a live devnet — `./scripts/devup.sh` first, then
`npm run build`): `node scripts/verify-origination.devnet.mjs` (single order),
`node scripts/verify-origination-chain.devnet.mjs` (multi-order chain),
`node scripts/verify-origination-http.devnet.mjs` (the two agents talk over a real HTTP
socket via `HttpChannel`, not the in-process channel), and
`node scripts/verify-origination-a2a.devnet.mjs` (the same over the A2A interop wire).

## License

MIT
