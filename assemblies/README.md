# Reference assemblies — the onboarding set

Each file here is a canonical `AssemblyTemplate` — a real-world composition a
newcomer can recognize, fork, and bind to on day one. They pre-populate the
`AssemblyRegistry` at deploy (the populate path pins and anchors them; identity
is the content-derived `compositionHash`, first-write-wins, so re-anchoring is
a no-op and independently authoring the same composition collapses onto the
same on-chain binding). This directory is `clauses/`' sibling: clauses are the
vocabulary, these are worked sentences.

**This is a user-onboarding surface, distinct from the e2e scenario machinery**
(which exists to prove the frontend generic). Every reference scenario is also
e2e-tested, and those tests are part of the onboarding story — read them to see
the scenario driven end to end, down to the ERC-20 balance changes
asserted from chain:

| Reference | Composition | The story | Proven by |
|---|---|---|---|
| `pos.json` | 1 order | A buyer and a seller at the counter — no processor between them | `orders-accept.devnet.spec.ts` (single-order accept) |
| `local-delivery.json` | 2 orders | Merchant + gig courier deal direct, both bonded, keeping the platform's cut | `local-commerce.devnet.spec.ts` (full cycle incl. dispute-free settlement) |
| `freelancer.json` | 1 order | A digital deliverable over the encrypted hand-off — no marketplace fee | `content-delivery.devnet.spec.ts` |
| `freelancer-value-chain.json` | 3 orders | A lead freelancer + contributors, one settlement | `freelancer-chain.devnet.spec.ts` (full cycle: three encrypted deliveries, one settlement) |
| `tradelens.json` | 6 orders | The containerised import chain: shipper → inspection → forwarder → reefer carrier → customs → drayage | `scenario-tradelens` + `tradelens-runtime` |
| `aerial-survey.json` | 1 order | A credentialed drone operator flies a committed window and route; the flight's co-produced record is part of the service (each party holds its copy) | `data-market.devnet.spec.ts` (full cycle: adopt, dual posture, ERC-20 balance assertions, self-authenticating data-terms leaf) |
| `aerial-survey-open-data.json` | 1 order | The SAME flight with the disclosure regime `open` — one changed design fill, a different compositionHash: regime variants are sibling assemblies, and whether a market flies open or closed is decided by adoption, never by the protocol | sibling of the above (hash-distinctness in the conformance suite; `data-market.devnet.spec.ts` asserts both siblings anchored under distinct compositionHashes) |
| `data-stream-subscription.json` | 1 order | A window of licensed access to another member's live records — credential over the encrypted hand-off, every record a leaf provable against the settled agreement that produced it; gas is paid once per subscription, never per data point | `data-market.devnet.spec.ts` (full cycle: license anchored to the settled flight process, encrypted hand-off evidence, self-authenticating license leaf) |
| `equipment-hire.json` | 1 order | A renter books equipment straight from its owner — the same shape as the point-of-sale reference, plus the designer's own settlement token pinned once for the whole composition, so no token picker ever appears at checkout | `equipment-hire.devnet.spec.ts` (full cycle: no picker, the pin drives the commitment and every value leg, the commerce/pin provenance pair asserted from the committed agreement) |

`documents/` ships the raw bytes of every document a template affixes (consent
anchors commit the document's keccak256 and `ipfs://` locator INSIDE the
composition — the bytes must pin byte-identical on any network for the
composition hash to reproduce; the populate path pins them first).

A reference that composes `figaro-utility-token` (`equipment-hire.json`) is the
one exception to "re-anchoring is a no-op over the checked-in bytes": the
clause's `currency` is a live ERC-20 address, new on every fresh deploy, so the
checked-in file carries the zero address as a sentinel and the populate path
(`populate-test-data.mjs`'s `fillDeployTimeCurrency`) substitutes the real
deployment's token address before anchoring — the anchored compositionHash is
over the SUBSTITUTED template, never the sentinel. A spec that wants this
reference's slug hashes the substituted template too
(`referenceAssemblySlugWithLiveCurrency`, `devnet-helpers.ts`), not the raw file.

Conformance: `frontend/tests/lib/referenceAssemblies.test.ts` — every template
parses, hashes, resolves its topology, composes only registered clauses,
carries the mandatory clauses on every order, carries its editorial identity
(the name/summary/description a stranger reads first), and every affixed
document reproduces its committed hash from the shipped bytes.

Editorial prose here is audience-owned (the general-public register). Adding a
reference: compose it (the designer canvas or by hand), verify with the
conformance test, and give it the story a newcomer would recognize.
