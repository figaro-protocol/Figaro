# Reference assemblies — the onboarding set

Each file here is a real-world composition a newcomer can recognize, fork, and
bind to on day one, written in the readable shape: one agreement per order
(`agreements[]`), each naming the written agreement it binds (`agreement`, a
file in `agreements/`, the sibling directory) and carrying its own topology
(`parentOrderHashes`, `order-<j>` labels); `assemblyClauses` by clause name
(`name@version`) for the terms composed once for the whole design. The
agreements are written first and reused: `agreements/counter-sale.json` is
bound by `pos.json` and `equipment-hire.json`, `freelance-deliverable.json` by
`freelancer.json` and the root of `freelancer-value-chain.json`. The files keep
that shape; the populate path builds the registered shape from it at deploy:
`composeAuthoredAgreement` (in the SDK) composes each written agreement —
names resolved to keys, the clauses of its mandatory pick merged, the key derived — and
`assembleAuthored` builds each assembly over the agreements its agreements
name (each binds the agreement's key; its fill is the topology clause's
parents), then the seeding pins and registers each DISTINCT agreement once on
`AgreementRegistry` (one stake each; a key already registered is skipped) and
registers the assembly on `AssemblyRegistry`. Identity is content-derived on
both registries (the `agreementKey`, a merkle root over the composed clauses;
the `compositionHash`, a merkle root over the agreements), first-write-wins,
so re-anchoring is a no-op and independently composing the same design
collapses onto the same on-chain bindings. This directory and `agreements/`
are `clauses/`' siblings: clauses are the vocabulary, agreements the terms of one
order, these the worked sentences.

**This is a user-onboarding surface, distinct from the e2e scenario machinery**
(which exists to prove the frontend generic). Every reference scenario is also
e2e-tested, and those tests are part of the onboarding story — read them to see
the scenario driven end to end, down to the ERC-20 balance changes
asserted from chain:

| Reference | Composition | The story | Proven by |
|---|---|---|---|
| `pos.json` | 1 order | A buyer and a seller at the counter, both bonded, the payment transferred at the buyer's resolution | `orders-accept.devnet.spec.ts` (single-order accept) |
| `local-commerce.json` | 2 orders | Merchant + gig courier each bonded in its own order with the buyer, both paid at one resolution | `local-commerce.devnet.spec.ts` (full cycle incl. dispute-free resolution) |
| `freelancer.json` | 1 order | A digital deliverable over the encrypted hand-off, paid at the buyer's resolution | `content-delivery.devnet.spec.ts` |
| `freelancer-value-chain.json` | 3 orders | A lead freelancer + contributors, one resolution | `freelancer-chain.devnet.spec.ts` (full cycle: three encrypted deliveries, one resolution) |
| `tradelens.json` | 6 orders | The containerized import chain: shipper → inspection → forwarder → reefer carrier → customs → drayage | `scenario-tradelens` + `tradelens-runtime` |
| `aerial-survey.json` | 1 order | A credentialed drone operator flies a committed window and route; the flight's co-produced record is part of the service (each party holds its copy) | `data-market.devnet.spec.ts` (full cycle: adopt, dual posture, ERC-20 balance assertions, self-authenticating data-terms leaf) |
| `aerial-survey-open-data.json` | 1 order | The SAME flight with the disclosure regime `open` — one changed design fill, a different compositionHash: regime variants are sibling assemblies, and whether a market flies open or closed is decided by adoption, never by the protocol | sibling of the above (`data-market.devnet.spec.ts` asserts both siblings anchored under distinct compositionHashes) |
| `data-stream-subscription.json` | 1 order | A window of licensed access to another member's live data — credential over the encrypted hand-off, every entry a leaf provable against the resolved agreement that produced it; gas is paid once per window, never per data point | `data-market.devnet.spec.ts` (full cycle: license anchored to the resolved flight process, encrypted hand-off evidence, self-authenticating license leaf) |
| `equipment-hire.json` | 1 order | A renter books equipment straight from its owner — the same shape as the point-of-sale reference, plus the designer's own denomination pinned once for the whole composition, so no token picker ever appears at checkout | `equipment-hire.devnet.spec.ts` (full cycle: no picker, the pin drives the commitment and every value leg, the commerce/pin provenance pair asserted from the committed agreement) |

`documents/` ships the raw bytes of every document a assembly affixes (consent
anchors commit the document's keccak256 and `ipfs://` locator INSIDE the
agreement — the bytes must pin byte-identical on any network for the
`agreementKey`, and so the composition hash, to reproduce; the populate path
pins them first).

A reference that composes `figaro-utility-token` (`equipment-hire.json`) is the
one exception to "re-anchoring is a no-op over the checked-in bytes": the
clause's `currency` is a live ERC-20 address, new on every fresh deploy, so the
checked-in file carries the zero address as a sentinel and the populate path
(`populate-clauses.mjs`'s `fillDeployTimeCurrency`) substitutes the real
deployment's token address before anchoring — the anchored compositionHash is
over the SUBSTITUTED assembly, never the sentinel. A spec that wants this
reference's slug hashes the substituted assembly too
(`referenceAssemblySlugWithLiveCurrency`, `devnet-helpers.ts`), not the raw file.

Conformance: `frontend/tests/lib/referenceAssemblies.test.ts` — every written
agreement names itself, says what it is and is bound by a reference assembly;
every assembly parses, hashes, resolves its topology, composes only registered
clauses, carries the mandatory clauses on every order, carries its editorial
identity (the name/summary/description a stranger reads first), and every
affixed document reproduces its committed hash from the shipped bytes.

Each document may carry a `faq`: the questions a party to that assembly asks and
the designer's answers (where orders come from, what a party needs in hand, how
and when each side is paid). It is editorial, excluded from the composition hash,
and the users' FAQ renders every published assembly's entries from the registry at
runtime — the site never lists them.

Editorial prose here is audience-owned (the general-public register). Adding a
reference: write its agreements in `agreements/` (or name ones already there),
compose the assembly over them (the designer canvas or by hand), verify with
the conformance test, and give it the story a newcomer would recognize.
