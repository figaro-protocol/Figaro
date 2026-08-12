# @figaro/sdk

TypeScript SDK for the Figaro Protocol — self-enforcing agreements between strangers.

Event parsing, state reconstruction, EIP-712 commitment building, bond math,
agent coordination, the template→orders projection, and the runtime handoff
key-agreement. Three runtime dependencies: `viem`, plus `@noble/curves` +
`@noble/hashes` for the handoff ECDH/AES-GCM (audited, zero-dependency crypto).

## Install

```bash
npm install @figaro/sdk viem
```

`viem` is a **peer dependency**, not a bundled one (`sdk/package.json` declares
`"peerDependencies": { "viem": "^2.55.1" }`) — install it explicitly alongside
the SDK, or the first chain call throws a missing-module error rather than a
Figaro-shaped one.

> **Honest scope:** `@figaro/sdk` is not yet published to the npm registry —
> publication (with provenance attestation) is a tracked pre-release task.
> Until then, install from a repo checkout: `"@figaro/sdk": "file:../sdk"`
> (build it first: `npm run build --workspace sdk` from the repo root).

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
from. It installs nothing: Foundry (`anvil`, `cast`) and a running Kubo must
already be there. Full prerequisites, env vars and the native-Kubo recipe:
`docs/LOCAL_DEV.md`.

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

Two siblings run the same recipe with exactly one thing changed:
`verify-origination-chain.devnet.mjs` (a three-order value-added chain, one
seller taking two of the nodes) and `verify-origination-http.devnet.mjs` (the
offer envelope crosses a real HTTP socket instead of the in-process channel).

**5. Close it — the buyer resolves.** The script stops at a live bonded process,
which is the state the mechanism is about. Ending it is a single call, and only
the buyer can make it:

```ts
import { proposeActions, executeAction } from "@figaro/sdk/agent";

// The proposer rebuilds the commitment structs resolveProcess needs from the
// events themselves — nothing had to be stored client-side.
const [resolve] = proposeActions(ctx.getProcess(processId)!, buyer)
  .filter((a) => a.type === "resolve-process");
await executeAction(walletClient, publicClient, addresses, resolve);

// AND RECORD THE USAGE — at settlement, not later. The RPGF path pays clause
// authors and assembly designers from records the BUYER's side writes when the
// process resolves; a deferred record is permanently deniable (a seller can
// unstake, a period can close — docs/DESIGN_DECISIONS.md §21). One call, the
// headless twin of what the frontend does at the same moment; excluded
// protocol-floor clauses reverting inside it is routine, and the report says
// what landed:
import { recordProcessUsage } from "@figaro/sdk/agent";
const report = await recordProcessUsage(walletClient, publicClient, addresses.usageCounter, [
  { commitment: resolve.commitments[0], agreement }, // the agreement each order signed
]);
```

Every order in the process settles atomically, `ProcessResolved` lands, and the
process reads `resolved` on the next `ctx.sync()`. No timeout, no arbitrator, no
third party who can do this instead — and resolution is terminal. A buyer agent
that resolves without recording credits no author and no designer — the reward
mechanism's uniformity across actors is exactly this call.

**6. Know the traps before you extend this.** The site's `/pitfalls` page is the
canonical list; the first one a chain integration hits is **sub-order
approval** — every `commit`, root or sub-order, pulls the FULL per-order bond
and nets nothing against bonds the kernel already holds, so approving the
increment reverts inside the settlement token with `ERC20InsufficientAllowance`
while the earlier bonds stay locked until the buyer resolves. Size it with
`calculateSubOrderApproval` and check it with `assertApprovalCoversBond` (both
below).

## Five Entry Points

### `@figaro/sdk` — Protocol Primitives

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
  buildCommitment,
  buildDomain,
  Topology,
  maxOrdersResolvablePerProcess,
} from "@figaro/sdk";

// `addresses` everywhere below is a `FigaroAddresses` ({ core, token, … }).
// A PUBLISHED DEPLOYMENT RECORD uses different key names (`figaroCore`,
// `tokenAddress`, …) — do not spread it verbatim; map it once:
const addresses = addressesFromDeploymentRecord(deploymentRecord);

// Fetch all FigaroCore events from a block range. The return is a GROUPED
// object — { orderCommitted, orderResolved, processResolved }, each a typed
// array — NOT one flat log list. (Attestations are NOT in here: they live on
// the AttestationCoordinator, a separate contract — read those with
// EV_ATTESTATION + parseAttestationLogs; see @figaro/sdk/derive.)
// `fetchCoreEvents` (and `fetchDiscoveryEvents`, `fetchUsageRecords`,
// `fetchBatchUsageRecords`) chunk `getLogs` internally in sub-ranges of
// `DEFAULT_LOG_CHUNK_SIZE` (9,500 blocks) so a wide range doesn't exceed a
// public RPC provider's block-range cap; pass a trailing `chunkSize` to tune
// it for a stricter (or more permissive) provider.
const events = await fetchCoreEvents(client, addresses, 0n);

// Reconstruct full process/order state from events
const topology = new Topology();
topology.applyEvents(events);

const process = topology.getProcess(processId);
const active = topology.getActiveProcesses();

// Calculate bond requirements
const bonds = calculateBonds(cumulativeValue, payment);
// → { sellerBond, buyerBond, totalLocked }

// Per-process resolve ceiling on the active chain (a process grown past
// this can NEVER settle — check before every commit; the kernel cannot)
const cap = await maxOrdersResolvablePerProcess(client);

// Build EIP-712 typed data for signing
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
nets nothing against bonds it already holds from earlier orders in the process
(`src/kernel/FigaroCore.sol:208-209` — `payment × 2` from the buyer, `expectedCumulativeValue × 2`
from the seller). Approve the settlement ERC-20 for both legs before each commit:

```ts
import { calculateRootApproval, calculateSubOrderApproval } from "@figaro/sdk";

// Root order:
const { buyerApproval, sellerApproval } = calculateRootApproval(payment);
// → buyerApproval = 2 × payment,  sellerApproval = 2 × payment

// Sub-order (extends an existing process):
const approvals = calculateSubOrderApproval(payment, newCumulativeValue);
// → buyerApproval  = 2 × payment
//   sellerApproval = 2 × newCumulativeValue  — the WHOLE cumulative bond for
//   this order, NOT the increment over the previous order's bond.
```

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
import { assertApprovalCoversBond } from "@figaro/sdk";

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
         WITNESS_SWAP_AND_COMMIT_COORDINATOR_ABI } from "@figaro/sdk";

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
         sectionDataHash, verifyCommitmentSignature } from "@figaro/sdk";

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

### `@figaro/sdk/agent` — Agent Coordination

Context sync, network discovery, action proposer, human-in-the-loop queue,
autonomous execution, did:web identity, and the coordination transports that
carry an offer between two agents — `InProcessChannel`, `HttpChannel`, and
`A2aChannel` (the Agent2Agent wire), all one interface.

```ts
import { FigaroContext, proposeActions, proposeInitiations, ActionQueue } from "@figaro/sdk/agent";
import { commit, executeAction } from "@figaro/sdk/agent";

// Sync on-chain state into a live context — the agent's own processes AND the
// live-staked network catalogue (clauses, sellers, assemblies).
const ctx = new FigaroContext(client, addresses);
await ctx.sync();

// Discover what exists (cold start): getAssemblies() / getMembers() / getClauses()
const assemblies = ctx.getAssemblies();

// FigaroContext wraps the low-level discovery primitives, which are ROOT
// `@figaro/sdk` exports — NOT `@figaro/sdk/agent`. Use them directly for a
// one-shot catalogue read without a context:
import { fetchDiscoveryEvents, reconstructDiscovery } from "@figaro/sdk";
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
import { buildSectionInclusionProof, sectionDataHash, computeClauseKey } from "@figaro/sdk";
import { attestAsSeller } from "@figaro/sdk/agent";
import { parseClauseSpec, encodeContentFromSpec } from "@figaro/sdk/clauses";
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
// from @figaro/sdk/agent); attestViaResolver is in ATTESTATION_COORDINATOR_ABI —
// call it directly (writeContract) when the seller is a resolver contract.

// Autonomous origination — the two-party handshake over a coordination channel:
// buyer instantiates a discovered assembly + signs; seller validates + counter-signs.
import { originateProcess, makeSellerOfferHandler, InProcessChannel } from "@figaro/sdk/agent";
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
import { A2aChannel, makeA2aOfferResponder, didWebEndpointResolver } from "@figaro/sdk/agent";
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
import { validateDraft, counterSignDraft, verifyRaceReply, selectRaceWinner } from "@figaro/sdk/agent";
const reply = await counterSignDraft(courierWallet, draft, { chainId, core }, accept, policy, specs);
// Buyer side: exact struct-hash equality against the SENT draft, then recovery —
// a doctored reply cannot ride a valid signature.
const check = await verifyRaceReply(reply!, draft, { chainId, core });
const winner = selectRaceWinner(replies); // cheapest countersigner; ties by arrival
// Packaged fan-out + mountable responder (the RFQ leg below has the same pair):
import { requestCounterSignatures, makeSellerRaceHandler } from "@figaro/sdk/agent";
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
import { buildQuoteRequest, requestQuotes, makeSellerQuoteHandler } from "@figaro/sdk/agent";
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
import { strippingReviver } from "@figaro/sdk";
import { deserializeCommitmentPayload } from "@figaro/sdk/agent";

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
import { SequencerClient } from "@figaro/sdk/agent";
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
await seq.status();  // { state_root, pending_ops, pending_usage_claims, batches_settled }
// Errors are SequencerError with .statusCode: 400 signature/witness-gate
// rejection (carrying the kernel's own reason string) or malformed JSON, 422
// not a valid operation shape, 413 over the 1 MiB body cap, 503 mempool at
// capacity — capacity, never rejection; retry after the next batch.

// did:web: an agent resolves a counterparty's DID Document, verifies the on-chain
// address it binds, and reads the coordination endpoint to route an offer to
// (build your own with buildSellerDidDocument).
import { resolveDidWeb, didDocumentMatchesAddress, extractServiceEndpoints } from "@figaro/sdk/agent";
const { document } = await resolveDidWeb("did:web:seller.example.com");
const bound = document ? didDocumentMatchesAddress(document, "0xSeller...", 1) : false;
const [endpoint] = document ? extractServiceEndpoints(document, "MCPEndpoint") : [];
```

### `@figaro/sdk/derive` — Clause-Agnostic Derivations

Clause-agnostic attestation filtering, geo math, and the commits==resolves
withdraw gate.

```ts
import {
  computeClauseKey, fetchCoreEvents, EV_ATTESTATION, parseAttestationLogs,
} from "@figaro/sdk";
import {
  filterByClause,
  haversineDistance,
  geohashesMatch,
  deriveInFlightOrders,
  deriveClauseWithdrawGate,
  deriveAssemblyWithdrawGate,
} from "@figaro/sdk/derive";

// Attestations live on the AttestationCoordinator, NOT in fetchCoreEvents
// (which returns only orderCommitted / orderResolved / processResolved). Read
// the Attestation logs straight from the coordinator, then parse them into
// typed AttestationEvents:
const attestationLogs = await client.getLogs({
  address: addresses.attestationCoordinator!,
  event: EV_ATTESTATION,
  fromBlock: 0n,
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

### `@figaro/sdk/clauses` — Clause-Spec Format + Content Encoding

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
} from "@figaro/sdk/clauses";

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
import { computeClauseKey, CLAUSE_REGISTRY_ABI } from "@figaro/sdk";

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
`@figaro/sdk/agent`) as the `clauseId` argument to `attestAs{Seller,Buyer}` —
one function, two moments: before registering (is this slot free?) and at
attestation time (which registered clause does this section attest?).

### `@figaro/sdk/handoff` — Runtime Handoff Wire Protocol

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
JSON-serialized `CommitmentPayload` from `@figaro/sdk/agent`; the envelope stays
small and late subscribers get a durable retrieval path). This is a DIFFERENT
exchange from `@figaro/sdk/agent`'s `CoordinationChannel`, which carries the
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
} from "@figaro/sdk/handoff";
import type { HandoffChannel } from "@figaro/sdk/handoff";

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
import { parseClauseSpec } from "@figaro/sdk/clauses";
import { parseProjectionHints } from "@figaro/sdk";
import type { SpecSource, ProjectionSpecView } from "@figaro/sdk";

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
import { buildOrderAgreement, assertAgreementSignable, sectionByField } from "@figaro/sdk";

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
chain (`@figaro/sdk/agent` `buildChainOffers`), a checkout realizing a bound
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
} from "@figaro/sdk";
import type { AssemblyTemplate } from "@figaro/sdk";

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
    // collect the seller counter-signature, then commit (see @figaro/sdk/agent).
  },
});
```

For a single non-templated order, use `buildOrderAgreement` (above) directly and
feed its `agreementHash` into `buildCommitment` as in the `@figaro/sdk` entry
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
} from "@figaro/sdk";
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
} from "@figaro/sdk";

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
types and strict parsers are exported from the ROOT `@figaro/sdk` (next to
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
  else is optional (`description`, `specialty`, `location`, `branding`, `assets`,
  `acceptedTokens`, `defaultTokenAddress`, `profileClauseValues`, `assemblyBindings`,
  `disclosurePolicy`, `services`, and `catalogueURI` — the pointer to the
  catalogue). Token
  acceptance is an identity declaration, not a market position. Carries no
  role / archetype / category taxonomy — what a seller does is inferred from the
  catalogue.
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
    catalogue (fixed | rate), the item referencing the class via `recordClass`.
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
  `profile.catalogueURI`. Required: `subjectAddress`, `items[]`, `version`.
  Each item requires `id`, `name`, `price`, `available`; optional are
  `description`, `category`, `image`, `recordClass` (marks a DATA-PRODUCT
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
} from "@figaro/sdk";
import type { MemberProfileMetadata, MemberCatalogueMetadata } from "@figaro/sdk";

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
import { MEMBERS_REGISTRY_ABI } from "@figaro/sdk";

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
// ClauseRegistry.sol:154 — cast selector: registerClause(string,uint64,bytes32,string)
function registerClause(string calldata clauseId, uint64 version, bytes32 contentHash, string calldata contentURI) external payable

// AssemblyRegistry.sol:148 — cast selector: registerAssembly(bytes32,string)
function registerAssembly(bytes32 compositionHash, string calldata contentURI) external payable
```

`version` is `uint64`, not the `uint256` a caller might reach for by habit; and
`registerAssembly` takes no version parameter at all — `compositionHash` alone
is the identity. Both are `payable`; `msg.value` must equal `registrationDeposit()` exactly.

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
the tuple `(address author, uint64 registeredAt, bool depositWithdrawn, string contentURI)`.
The existence check is `registeredAt != 0`, NOT the bool: after a normal registration
`depositWithdrawn` is `false` and stays false while the deposit is still staked (the
surfaced state) — it flips to `true` only once the author reclaims the deposit. So a
freshly registered assembly correctly reads `depositWithdrawn == false`; that false is
"deposit still held," not "registration failed."

`ClauseRegistry`'s parallel stake struct (`depositOf[idHash]`, surfaced to the SDK as
`RegisteredClause.registrar`) names the same field `registrar` rather than `author` — the
two names identify the same concept under each registry's own vocabulary (the
registering wallet), and `RpgfMinter._isAuthor` treats both as the clause-or-assembly's author for
600M reward eligibility.

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

`@figaro/sdk` is pre-1.0 (currently `0.1.0`). Per semver's pre-1.0 convention,
**minor version bumps may include breaking changes** — there is no stable
public API yet. Pin an exact version or a narrow range if you need
reproducible builds against this package.

Every published change is recorded in the repo-root
[`CHANGELOG.md`](../CHANGELOG.md) (Keep a Changelog format) — check it before
upgrading. The first git tag (`v0.1.0`) is minted by the maintainer at the
first public push; this package has no tagged releases before that point.

## Test

```bash
cd sdk && npm test
```

Autonomous-origination proofs (against a live devnet — `./scripts/devup.sh` first, then
`npm run build`): `node scripts/verify-origination.devnet.mjs` (single order),
`node scripts/verify-origination-chain.devnet.mjs` (multi-order chain), and
`node scripts/verify-origination-http.devnet.mjs` (the two agents talk over a real HTTP
socket via `HttpChannel`, not the in-process channel).

## License

MIT
