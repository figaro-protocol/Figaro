# Documentation Map

The canonical home for live Figaro documentation. The code is in `src/`;
release versioning starts at `v0.1.0` (see `CHANGELOG.md`). This map lists
the whitelisted docs and names one owner per concept; a file not on the list
is a deletion candidate.

## Ownership Map — one owner per concept

Every concept has exactly ONE owning statement; every other surface (agent prompts,
skills, memories, marketing prose, other docs) states it only as a summary plus
a pointer to its owner. When the owner changes, sweep the pointers — never fork the
content. (This is the instruction-system form of "derive, don't store.")

| Concept | Owner |
|---|---|
| The system: 2 Core mechanisms + 6 nouns | the cryptoeconomic-system paper, `/papers/figaro-as-a-cryptoeconomic-system` (public); `THEORY.md` carries the mechanism's restatement; the agent frame is maintainer-private build tooling |
| The `clause.block` seam (fields = protocol, block = presentation) | `CLAUSES.md` § "Clause-spec format" |
| The coordinator pattern (composing the Core) | `CONTRACTS.md` § Coordinators |
| The data layer — the public/sealed seam, and the rule that decides it | `DATA_LAYER.md` |
| Open-world lens, composition model, semantic layer | `OPEN_WORLD.md` §1–§3 |
| The equilibrium theorem and its proof | the asymmetric-bonding paper (`frontend/app/(marketing)/papers/asymmetric-bonding/page.tsx`); its figures once in `sdk/src/equilibrium.json`, guarded |
| The equilibrium bound to the Core's transfers | `THEORY.md` |
| The six invariants, stated once | `frontend/app/(marketing)/(research)/invariants/page.tsx` (each mapped to its code, test and formal layer in `VERIFICATION_MAP.md`) |
| Vision, post-firm economy, where value goes after the firm | the cryptoeconomic-system paper, `/papers/figaro-as-a-cryptoeconomic-system` (public; the agent's frame is `CLAUDE.md` § "What this is") |
| Intentional vulnerability-lookalike patterns | `DESIGN_DECISIONS.md` |
| What the protocol has no contract for (not listed = does not exist) | `CONTRACTS.md` § "What the protocol has no contract for" |
| Contract inventory | `CONTRACTS.md` |
| Clause table, validation architecture, adding-a-clause | `CLAUSES.md` |
| The agreement registry — the registered agreement, its key, the assembly's merkle root over its agreements, the membership proof, the fold | `CLAUSES.md` § "The registered agreement and the assembly — units above the clause" (the contract surface: `CONTRACTS.md` § Registries) |
| Route catalog, lib map, designer surface | `FRONTEND.md` |
| Wire formats, agreement/assembly projection, the assembly→orders walk, checkout planning | `sdk/README.md` (+ the `sdk/dist` docblocks after `npm --prefix sdk run build`) |
| Test-harness inventory, layer boundaries | `TESTING.md` |
| Guard scripts — each guard's rule, rationale, and ruling | maintainer-private build tooling (not shipped in a public clone; TESTING.md inventories test harnesses, not guards) |
| Commands, env vars, services, deploy scripts | `LOCAL_DEV.md` |
| Design system — color/type/spacing tokens, component shapes, a11y anti-patterns | `DESIGN_TOKENS.md` |
| Canonical names per tier | `LEXICON.md` |
| The florin — the token, its supply, its allocation | `FLORIN_TOKEN.md` |
| Designer rewards — who earns the 600M, on what meter and schedule | `DESIGNER_REWARDS.md` |
| The DAO — what it is for, how it spends, who holds the treasury | `DAO.md` |
| Batch-scaling design (BUILT — witness prover/verifier/sequencer beside the direct path) | `SCALING_STRATEGY.md` |
| Open release tasks (testnet + mainnet) | `RELEASE_READINESS.md` |
| External-audit handover (scope in both languages, the baseline commit, validation gate, accepted risks) | `AUDITOR_HANDOVER.md` |
| Why the flow-map gets built under a uniform reward, and what the stake does and does not do | `DATA_LAYER.md` |
| Comparative-substrates analysis (firm/platform/court/bond as institutional axes: fiscal legibility, monetary neutrality, transparency-verifiability-privacy conjunction, discriminating alignment) | `/papers/coordination-substrates` (`frontend/app/(marketing)/papers/coordination-substrates/page.tsx`) |
| Designer-reward contract surfaces (UsageCounter, RpgfMinter) | `CONTRACTS.md` |
| Maintainer preferences, incidents, rulings | memory dir (`MEMORY.md` index) — maintainer-private, not shipped in this repo; the docs above carry every conclusion |
| Open work | GitHub Issues (public); the maintainer's working punch-list is private |

## What a wallet can do

One row per verb a wallet can perform, a person's or an agent's, each cell a name read from its owner (the function from `CONTRACTS.md`, the SDK export from `sdk/README.md`'s synopsis, the route from `FRONTEND.md`'s catalog, the test from the suites `TESTING.md` inventories), and `none` where the tree holds no name, which is a gap `scripts/lint-verb-table.sh` counts; the tier is looked up: the four contracts are the Core, the registries and the reward, florin and composition contracts are protocol tier, surfaces are runtime. Who names the wallet's position in a process or a registry (buyer, seller, designer of record, member); any wallet holds any of them, and one wallet may hold all. The Core and protocol verbs are closed by construction, the contracts' external state-changing functions and the off-chain acts around them; everything composed above them is the open set, which a row names only as an axis, never as an instance.

| Verb | Who | Tier | Where | Held by |
|---|---|---|---|---|
| register as a member | any wallet | protocol | fn `register` · sdk `MEMBERS_REGISTRY_ABI`, `parseMemberProfileDocument` · route `/members/review` | `test/app/MembersRegistryTest.t.sol`, `frontend/tests/e2e/members-onboarding.devnet.spec.ts` · doc `docs/CONTRACTS.md` |
| update the member's declaration | member | protocol | fn `updateProfile` · sdk `MEMBERS_REGISTRY_ABI`, `parseMemberCatalogDocument` · route `/members/edit/identity`, `/members/edit/catalog` | `test/app/MembersRegistryTest.t.sol`, `frontend/tests/e2e/member-edit-ui.devnet.spec.ts` · doc `docs/CONTRACTS.md` |
| withdraw a member's stake | member | protocol | fn `requestWithdrawal`, `withdraw` · sdk `MEMBERS_REGISTRY_ABI` · route `/members/manage` | `test/app/MembersRegistryTest.t.sol`, `frontend/tests/e2e/member-withdraw.devnet.spec.ts` · doc `docs/CONTRACTS.md` |
| publish a clause: any relationship, buyer↔seller or seller↔seller | designer | protocol | fn `registerClause` · sdk `computeClauseKey`, `parseClauseSpec` (`/clauses`), `CLAUSE_REGISTRY_ABI` · route `/clauses/register` | `test/build/registries/ClauseRegistryTest.t.sol`, `frontend/tests/e2e/permissionless-clause.devnet.spec.ts` · doc `docs/CLAUSES.md` |
| publish a registered agreement: any set of registered clauses for one order | designer | protocol | fn `registerAgreement` · sdk `composeOrderAgreement`, `agreementHashOf`, `AGREEMENT_REGISTRY_ABI` · route `/assemblies/designer` | `test/build/registries/AgreementRegistryTest.t.sol`, `frontend/tests/lib/registerComposedAgreement.test.ts`, `frontend/tests/e2e/agreement-compose.devnet.spec.ts` · doc `docs/CLAUSES.md` |
| publish an assembly: any composition of registered agreements | designer | protocol | fn `registerAssembly` · sdk `buildAssembly`, `assemblyHashOf`, `ASSEMBLY_REGISTRY_ABI` · route `/assemblies/designer` | `test/build/registries/AssemblyRegistryTest.t.sol`, `frontend/tests/e2e/permissionless-clause.devnet.spec.ts` · doc `docs/CLAUSES.md` |
| withdraw a clause's stake | designer of record | protocol | fn `withdrawDeposit` · sdk `deriveClauseWithdrawGate` (`/derive`) · route `/clauses/register` | `test/build/registries/ClauseRegistryTest.t.sol`, `sdk/tests/withdraw.test.ts`, `frontend/tests/e2e/clause-authoring.devnet.spec.ts` · doc `docs/CONTRACTS.md` |
| withdraw a registered agreement's stake | designer of record | protocol | fn `withdrawDeposit` · sdk `deriveAgreementWithdrawGate` (`/derive`) · route none | `test/build/registries/AgreementRegistryTest.t.sol`, `sdk/tests/withdraw.test.ts` · doc `docs/CONTRACTS.md` |
| withdraw an assembly's stake | designer of record | protocol | fn `withdrawDeposit` · sdk `deriveAssemblyWithdrawGate` (`/derive`) · route `/assemblies/designer/view` | `test/build/registries/AssemblyRegistryTest.t.sol`, `frontend/tests/e2e/assembly-withdraw.devnet.spec.ts` · doc `docs/CONTRACTS.md` |
| declare a contract's mechanism clause | any wallet, for itself (a contract declaring its own mechanism) | protocol | fn `setMechanismClause` · sdk `CLAUSE_REGISTRY_ABI` · route n/a, a contract calls it | `test/build/registries/ClauseRegistryTest.t.sol` · doc `docs/CONTRACTS.md` |
| bind an assembly | seller | protocol | fn `updateProfile` · sdk `checkSellerBindsAssembly` · route `/members/assemblies` | `frontend/tests/lib/sellerBoundAssembly.test.tsx`, `frontend/tests/e2e/seller-binding.devnet.spec.ts` · doc `docs/OPEN_WORLD.md` |
| select a bound assembly and fill the fields left to the buyer | buyer | protocol | fn n/a, off-chain act · sdk `planAssemblyOrders`, `reconstructOrdersFromAssembly`, `instantiateRootAgreement` (`/agent`) · route `/s/view`, `/s/checkout` | `sdk/tests/reconstructOrders.test.ts`, `frontend/tests/lib/checkoutRequiredFills.test.ts`, `frontend/tests/e2e/checkout-assembly-choice.devnet.spec.ts` · doc `sdk/README.md` |
| request an offer from a seller over a coordination channel | buyer | runtime | fn n/a, off-chain act · sdk `buildQuoteRequest` (`/agent`), `requestQuotes` (`/agent`), `HttpChannel` (`/agent`), `CoordinationChannel` (`/agent`), `QuoteRequestTerms` (`/agent`) · route `/s/checkout` | `sdk/tests/dispatchRace.test.ts`, `sdk/tests/httpChannel.test.ts`, `frontend/tests/e2e/rfq-checkout.devnet.spec.ts` · doc `docs/AI_AGENT_COORDINATION.md` |
| sign a commitment | buyer | Core | fn `hashStruct` · sdk `buildCommitment`, `assertAgreementSignable`, `originateProcess` (`/agent`) · route `/s/checkout` | `test/core/kernel/Eip712ParityTest.t.sol`, `sdk/tests/commitments.test.ts`, `frontend/tests/e2e/sign-countersign.devnet.spec.ts` · doc `docs/CONTRACTS.md` |
| counter-sign a commitment | seller | Core | fn `hashStruct` · sdk `makeSellerOfferHandler` (`/agent`), `verifyCommitmentSignature` · route `/orders` | `sdk/tests/originate.test.ts`, `sdk/tests/verifyCommitmentSignature.test.ts`, `frontend/tests/e2e/orders-accept.devnet.spec.ts` · doc `docs/CONTRACTS.md` |
| approve the bond for each order: the buyer for all its orders, each seller for its own | buyer or seller | Core | fn n/a, an ERC-20 approve of the process's token · sdk `calculateRootApproval`, `calculateSubOrderApproval`, `assertApprovalCoversBond` · route `/s/checkout`, `/orders` | `sdk/tests/bonds.test.ts`, `frontend/tests/lib/useApproveThenAct.test.tsx` · doc `sdk/README.md` |
| commit | any wallet holding both signatures | Core | fn `commit` · sdk `commit` (`/agent`), `calculateBonds` · route `/orders` | `test/core/kernel/FigaroCoreTest.t.sol`, `sdk/tests/originate.test.ts`, `frontend/tests/e2e/orders-accept.devnet.spec.ts` · doc `docs/CONTRACTS.md` |
| fund a bond from a token the party holds: any route, a wallet-side swap before commit or any swap-and-commit coordinator | buyer or seller | protocol | fn `swapAndCommit` · sdk `buildSwapWitnessTypedData` · route `/sign` | `test/app/WitnessSwapAndCommitCoordinatorTest.t.sol`, `sdk/tests/swapFunding.test.ts`, `frontend/tests/e2e/swap-funded-checkout.devnet.spec.ts` · doc `docs/CONTRACTS.md` |
| attest to a clause of the party's own order | buyer or seller of the order | Core | fn `attestAsSeller`, `attestAsBuyer` · sdk `attestAsSeller` (`/agent`), `attestAsBuyer` (`/agent`), `buildSignedClauseInclusionProof` · route `/orders/view` | `test/core/attestation/AttestationCoordinatorTest.t.sol`, `sdk/tests/attestation.test.ts`, `frontend/tests/e2e/permissionless-clause.devnet.spec.ts` · doc `docs/CONTRACTS.md` |
| resolve | buyer | Core | fn `resolveProcess` · sdk `executeAction` (`/agent`), `resolveProcess` (`/agent`), `calculateResolution` · route `/orders/view` | `test/core/kernel/FigaroCoreTest.t.sol`, `sdk/tests/integration.test.ts`, `frontend/tests/e2e/orders-accept.devnet.spec.ts` · doc `docs/CONTRACTS.md` |
| submit a proved batch of commitments, attestations and resolutions | any wallet, each commit carrying both signatures, each attestation its party's and each resolution its buyer's authorization | Core | fn `settleBatch` · sdk `SequencerClient` (`/agent`), `hashResolveProcess` · route n/a, any wallet running a sequencer submits it | `test/core/verifier/FigaroBatchVerifierTest.t.sol`, `sdk/tests/batch-e2e.test.ts`, `frontend/tests/e2e/batch-events.devnet.spec.ts` · doc `docs/SCALING_STRATEGY.md` |
| count the use of a clause, a registered agreement or an assembly in a resolved process | any wallet | protocol | fn `recordClauseUsage`, `recordAgreementUsage`, `recordAssemblyUsage` · sdk `recordProcessUsage` (`/agent`), `buildUsageClaims` · route `/orders/view` | `test/build/rewards/UsageCounterTest.t.sol`, `sdk/tests/recordProcessUsage.test.ts`, `frontend/tests/lib/planUsageRecords.test.ts` · doc `docs/DESIGNER_REWARDS.md` |
| claim a designer reward | designer of record, a member | protocol | fn `claim` · sdk `computeRpgfAllocations`, `RPGF_MINTER_ABI` · route `/rewards` | `test/build/rewards/RpgfMinterTest.t.sol`, `test/build/rewards/RpgfIntegrationTest.t.sol`, `frontend/tests/e2e/rpgf-rewards.devnet.spec.ts` · doc `docs/DESIGNER_REWARDS.md` |
| sell the data of a clause of a resolved process | any party of the resolved process, as seller of the sale | protocol | fn `commit` · sdk `fetchProcessesResolved`, `buildSignedClauseInclusionProof`, `clauseByField` · route `/members/assemblies`, `/members/catalog` | `sdk/tests/processesResolved.test.ts`, `frontend/tests/e2e/data-market.devnet.spec.ts`, `frontend/tests/e2e/data-purchase-ui.devnet.spec.ts` · doc `docs/DATA_LAYER.md` |
| hand sealed content to the counterparty | buyer or seller | runtime | fn n/a, off-chain act · sdk `generateOrderKeypair` (`/handoff`), `wrapWithSharedSecret` (`/handoff`) · route `/orders/view` | `sdk/tests/handoff.test.ts`, `frontend/tests/e2e/content-delivery.devnet.spec.ts` · doc `docs/DATA_LAYER.md` |
| compose a process with another contract on the chain: any contract, around commit or after resolution | buyer or seller | protocol | fn n/a, off-chain act · sdk `addressesFromDeploymentRecord`, `projectValueFlow` (`/derive`), `VenueEvent` (`/derive`) · route `/orders/view` | `sdk/tests/graphProjections.test.ts`, `frontend/tests/e2e/payout-routing.sepolia.spec.ts` · doc `docs/OPEN_WORLD.md` |
| bring the open data of a process to a forum: any forum | buyer or seller of the process | protocol | fn n/a, off-chain act · sdk `fetchAttestationRecords`, `fetchCoreEvents` · route `/evidence-display`, `/audit/view` | `frontend/tests/lib/processTimelineOutsideRpc.test.ts`, `frontend/tests/e2e/verification-coverage.devnet.spec.ts` · doc `docs/DATA_LAYER.md` |
| read the network | any wallet, or none | runtime | fn n/a, off-chain act · sdk `fetchCoreEvents`, `reconstruct`, `reconstructDiscovery` · route `/registries`, `/audit`, `/data/explore` | `sdk/tests/events.test.ts`, `sdk/tests/discovery.test.ts`, `frontend/tests/e2e/registries.devnet.spec.ts`, `frontend/tests/e2e/data-explore.devnet.spec.ts` · doc `docs/DATA_LAYER.md` |
| register the florin's minters, mint the genesis allocation and renounce | the deploying wallet, once at genesis | protocol | fn `registerMinter`, `mint`, `renounceDeployerMint` · sdk `FLORIN_TOKEN_ABI` · route n/a, a deploy act | `test/build/florin/FlorinToken.t.sol`, `test/script/DeployWiringTest.t.sol` · doc `docs/FLORIN_TOKEN.md` |

## Content architecture — the four public surfaces

Four surfaces publish to the world, and one folder never does. The test that
decides where any page or section goes:

| If the content is… | It lives on… |
|---|---|
| Who it is for, what they do, why it works — one screen, pictures | the **marketing site** (the three doors + home + the tellings) |
| A surface that reads or writes live chain state (needs a wallet or the live registry) | an **app page** (`app/(app)/`) |
| A *how* with an identifier — a hash, a field, a contract, an error, a command, a spec | **docs-site** (published at `/docs`) |
| A standalone scholarly argument | a **paper**, under Working Groups |
| Internal build and discipline reference for the maintainer and agents | **`docs/`** — never published |

**`docs/` is not public documentation.** It is the build reference: this folder,
read by the maintainer and by agents working on Figaro, part of the build
process. It is never rendered to the public. docs-site does NOT mirror it; the two never
touch.

**docs-site is the public technical manual**, written for an outsider who builds
on the protocol. Its lesson from the genesis clean-room experiment
(`work/2026-09-10-genesis-cleanroom/`): a cold reader with ordinary priors slides
into a different, coherent, defensible design unless the whole model is held at
once — so docs-site STATES the whole (the two mechanisms, the six nouns, the
forest) before any per-object detail, and never assumes the reader induces it.

**Where the technical detail behind the doors goes:** the four hashes and the
clause-spec format, how an assembly is composed and the assembly hash,
document-anchoring, on-chain and off-chain composition, sharp edges, the invariant
list, the contract catalog with its inheritance/install/deployments/errors, and
the verification stack with its counts all move to docs-site. Each marketing door
keeps one screen — what a clause is, what an assembly is, how the code is secured
— and links to docs-site for the rest. `/security` stays a one-screen marketing
page at its predictable URL (status, brief, disclosure channel, the audit
posture), detail on docs-site. `/registries` and the other live-chain readers
are app pages. sdk/README stays the SDK manual, rendered into docs-site.

## Layer ownership — the instruction system

Each layer owns one thing; every other layer states it as a summary plus a pointer.

| Layer | Owns |
|---|---|
| `CLAUDE.md` | discipline — how agents work, the frame, agent permissions; not inventories |
| `.claude/rules/*.md` | the discipline for one part of the tree, loaded when an agent reads or edits a file its `paths:` names; a rule with no `paths:` loads beside `CLAUDE.md` |
| `docs/` | the internal build reference and one owner per concept (this map) |
| docs-site | the public technical manual |
| `.claude/agents/*.md` | one public surface each (marketing-copy, builders-docs, papers-editor, runtime-ui) |
| `scripts/lint-*.sh` | the mechanical rules that enforce the above |
| memory dir (private) | rulings, preferences, lessons |

## Start Here

1. `/papers/figaro-as-a-cryptoeconomic-system` — the whole, read through the field's definitions (the three costs of trade between strangers; what it governs, guarantees and is; what emerges; the institution); `CLAUDE.md` § "What this is" is the agent's frame of the same
2. `THEORY.md` — the equilibrium bound to the Core's transfers; the six invariants are the invariants page's, and the theorem itself is the asymmetric-bonding paper's
3. `FLORIN_TOKEN.md` — token canonical reference (`DESIGNER_REWARDS.md` and `DAO.md` sit beside it: three concepts, three files)

## Main Groups

- **Protocol and framing**: `THEORY.md`, `FLORIN_TOKEN.md`, `DESIGNER_REWARDS.md`, `DAO.md` (the whole is the cryptoeconomic-system paper's)
- **Runtime and frontend**: `OPEN_WORLD.md` (the open-world paradigm + runtime composition model + semantic-derivation layer), `FRONTEND.md` (route + lib catalog), `DESIGN_TOKENS.md` (MUJI theme spec), `AI_AGENT_COORDINATION.md`
- **Inventories**: `CONTRACTS.md`, `CLAUSES.md`, `FRONTEND.md`, `TESTING.md`, `LOCAL_DEV.md` — the five split-out inventory docs (contracts / clauses / frontend / tests / commands; `CLAUSES.md` also carries the anchoring doctrine)
- **Composition and disclosure**: `DATA_LAYER.md` (the emissions clause + witness-stage disclosure channel is owned by `CLAUSES.md`, which also carries the two load-bearing disclosure rulings: reader-derived scope, offsets out of scope)
- **Scaling**: `SCALING_STRATEGY.md` (carries the batch-sequencer architecture + sequencer trust model)
- **Status and readiness**: `RELEASE_READINESS.md` (the open release tasks, TODO only — closed work is deleted; git is the log)
- **Audit / verification**: `AUDITOR_HANDOVER.md` (scope in both languages, the baseline commit, change policy, validation gate, accepted risks), `DESIGN_DECISIONS.md`, `VERIFICATION_MAP.md`
- **Research**: the paper corpus (the project's lineage is stated in the asymmetric-bonding paper's acknowledgment; naming in `FLORIN_TOKEN.md` § "Name")
