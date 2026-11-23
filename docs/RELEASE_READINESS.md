# Release Readiness

Status: the open work before the stack goes public, on Sepolia first and then on
mainnet and the other chains, which run the same code. TODO tasks only:
closed work is deleted in the session that closes it, and `git log` is the history.
Results are recorded in `docs/VERIFICATION_MAP.md` § 14, and accepted risks in
`docs/DESIGN_DECISIONS.md`. `docs/AUDITOR_HANDOVER.md` is left as it stands and
is not updated; a new handover is written when an audit is engaged.

## Deployment Targets

The public deployment target is **Ethereum mainnet**.
**Polygon** is an intended additional deployment. A **Cairo rewrite** of the contracts
(Starknet) is planned as a later line of work. Testnet rehearses the mainnet deployment
(testnet = mainnet rehearsal); chain-coupled compositions resolve against these targets —
Kleros courts are live on Ethereum mainnet.

## Current Verdict

There is one line of work, and it ends before the first public deploy. A test network
and mainnet run the same code, on the same kind of chain, under the same rules; they
differ only in what their tokens are worth. A deployed contract and the guest cannot be
changed, so every task below is done before the stack goes public on any chain, and none
waits for a later network. **Public on testnet** is the launch flip: the site leaves
noindex, and strangers read it and trade on Sepolia; it is blocked on the seven items
below. The seventh is every security matter: the in-house security program's pass over
the audit scope (Task 2), which stands in place of an external audit, the frontend's
delivery integrity (Task 11) and the hardening (Task 14). **A deploy** to mainnet, or to
any other chain, is the same act repeated: the same broadcast, the same registrations and
the same checks of § "Deployment verification, on every chain", on a chain whose tokens
have value. Only the act and the values that exist only at it (a wallet's address, the
key built from the release guest, a gas figure read on that chain) are left to it.

## Public on testnet

1. **The model is coherent.** Each open design thread is ruled, built, and held by a
   test that fails on the old behavior: no clause written into an agreement the
   designer did not compose, `figaro-commerce` composed or left out like any
   clause; dispute resolution chosen by the buyer at checkout for every agreement of the
   process, its field required once the clause is composed; the utility token as the
   designer's assembly-level pin that overrides the buyer's selection, the assembly-wide
   mechanism kept; topology as the agreement format's own leaf; and a seller's attestation only about
   a clause of its own order.
   Who verifies, piece by piece (an agent is given only a piece with a machine check):
   - [agent] no clause written in, commerce composed like any clause —
     `frontend/tests/lib/designerComposesEveryClause.test.ts`,
     `frontend/tests/components/AgreementDrawerOffersEveryClause.test.tsx`,
     `sdk/tests/projection.test.ts` and `frontend/tests/e2e/designer-agreement-drawer.devnet.spec.ts` green;
   - [agent] dispute resolution chosen by the buyer at checkout, its field required once
     composed — `frontend/tests/lib/checkoutBuyerFieldComplement.test.ts` and
     `frontend/tests/e2e/local-commerce.devnet.spec.ts` green;
   - [agent] the utility token as the assembly-level pin — `frontend/tests/components/PinnedTokenNote.test.tsx`
     and `frontend/tests/e2e/assembly-chain.devnet.spec.ts` green;
   - [agent] topology as the agreement format's own leaf — `sdk/tests/topologyLeaf.test.ts`
     and `sdk/tests/projection.test.ts` green;
   - [agent] a seller's attestation only about a clause of its own order —
     `test/core/attestation/AttestationCoordinatorTest.t.sol` green;
   - [maintainer] that the list above is the whole set of open threads: a reading, never a run.
2. **The site tells it correctly.** The maintainer has corrected the home page and the
   three landings, and every door page has had its copy sitting.
3. **The papers stand.** The corpus passes the peer-review-ready gates, and each paper
   under external review has had its passes.
4. **Sepolia works end to end.** The stack is redeployed on the current commitment type,
   every reference assembly is registered, and one trade is resolved through the site
   with a real wallet.
   - [maintainer] the redeploy and the registrations, in the Ledger session — check:
     `node scripts/check-deployment.mjs` exits 0 against `deployments/11155111.json`;
   - [agent] the smoke over every reference assembly — check: the Sepolia smoke's exit code,
     recorded with its transaction hashes in `docs/VERIFICATION_MAP.md` § 14;
   - [maintainer] one trade resolved through the site with a real wallet — check: the resolved
     process's transaction hash, recorded in `docs/VERIFICATION_MAP.md` § 14.

   The orders an order follows are a leaf of the agreement format (`Agreement.follows`,
   `sdk/src/agreement.ts`), and no clause carries them. A network seeded with the clause
   `figaro-topology` carrying them breaks in three places:
   - A registered `figaro-topology` is an ordinary clause: the drawer offers it, and nothing
     writes it into an agreement. An agreement a designer composed with it is refused at the
     sign gate for its required `follows` field, since checkout fills `Agreement.follows`
     and never that field, unless a party fills it by hand.
   - An assembly pinned in the entry bytes `{"agreement":i,"clauses":{…}}` does not hash to its
     registered key: the key is computed over `{"agreement":i,"clauses":{…},"follows":[…]}`
     (`agreementLeafBytes`, `sdk/src/assembly.ts`). `anchorProcessDesign` (`sdk/src/anchored.ts`)
     recomputes the key from the fetched document and refuses it.
   - An order whose edges sit in a `figaro-topology` clause shows no edges: every reader
     reads `Agreement.follows` only.

   The commerce clause's key leaves `block` out (`computeClauseKey`; the contract notice of
   `src/registries/ClauseRegistry.sol`), and a key has one content URI and no update:
   `registerClause` refuses a key already registered (`AlreadyRegistered`). A chain whose
   registered `figaro-commerce` document declares another `block.design.article` keeps
   serving that document under the same key. The drawer groups the clause under the word
   that document declares (`groupClausesByArticle`, `frontend/lib/shared/clauseSpecSource.ts`),
   and `/registries` lists it under that word (`frontend/lib/registries/explorer.ts`). The
   clause stays selectable, and a designer composes it like any clause.

   So the site built from this code goes up only against a deployment seeded in the present
   format: every reference assembly pinned and registered in the present entry bytes, and
   no reference agreement composing `figaro-topology`.
5. **The flip.** Robots' `Disallow` and the noindex meta are lifted, a sitemap of the
   canonical public pages is published, and the deployed headers are checked on the
   live host (Task 12). The bundle ships no pinning key: each publishing wallet pins
   through its own node or a pinning service it chose (Task 6). The build is refused if
   any shipped token carries a personal field: a pinning service writes its account
   owner's email into every key it issues.
   - [maintainer] the pinning key an earlier testnet build shipped is revoked — check:
     read at the pinning service;
   - [agent] no shipped token carries a personal field — check:
     `node scripts/check-export-no-personal-info.mjs` exits 0 on the build;
   - [agent] the sitemap and the lifted robots and noindex — check: `npm run estate:crawl`
     exits 0 over the export and the sitemap lists every canonical public page;
   - [maintainer] the deployed headers on the live host (Task 12) — check: read on the host
     after the upload, which only the maintainer runs.
6. **The stack is hardened.** The repository's secret scanning, push protection, Dependabot
   security updates and protection of `main` are on; the frontend's high security gaps are
   closed; the
   site is built from a clean checkout of a named commit; an automated accessibility check runs
   against WCAG AA; one public page states what is testnet-only, unaudited, or not yet built; and
   the SDK's next major version is published with the redeploy, so what a builder installs
   matches the contracts.
   - [maintainer] the repository's switches (secret scanning, push protection, Dependabot
     security updates, protection of `main`) — check: each reads on in the repository settings;
   - [agent] the frontend's high security gaps — check: `node scripts/audit-frontend.mjs` reports
     zero highs. It does: `npm audit --omit=dev` in `frontend/` reports one low and nothing
     higher. The six highs of the full `npm audit` (`brace-expansion`, `browserslist`,
     `picomatch`, `smol-toml`, `undici`, `vite`) are in build and test tooling, which the
     static export does not ship. The low is `katex` (GHSA-238p-pmpm-9mq7: a prototype
     pollution already in the process can bypass the `trust` option). It is set aside:
     `frontend/components/papers/Math.tsx` calls `renderToString` with `trust` at its default
     (off) on TeX the paper pages carry, at build time. The fix is 0.18.2 or later, a major
     step from 0.17: 0.18.0 prefixes KaTeX's inner CSS classes and 0.19.0 reports missing
     glyph metrics through `strict`. The outer classes `frontend/scripts/paper-latex.mjs`
     reads (`katex`, `katex-display`, `katex-html`) stay the same in 0.19.1, so the step
     waits only for a build that runs the paper checks over the new output;
   - [agent] a clean-checkout build of a named commit — check: the build script's exit code from
     a fresh clone;
   - [agent] the accessibility check — check: `frontend/tests/e2e/accessibility.stranger.spec.ts`
     green over the export;
   - [agent] the public page stating what is testnet-only, unaudited or not yet built — check:
     the stranger crawl finds it;
   - [maintainer] the SDK's next major version published with the redeploy — check:
     `npm view @figaro-protocol/sdk version` equals the version the deployment record names.

7. **Every security matter is closed.** Tasks 2, 11 and 14 below, each to its own check.
   No security task waits for mainnet: deployed code cannot be changed, so a finding
   made after the mainnet deploy could not be fixed there.

## Open Tasks

Task numbers are stable; missing numbers are closed tasks — `git log` has each.

### Task 2: Pass The In-House Security Program Over The Audit Scope

No audit firm is engaged; the security work is the project's own, at every
layer, with the bug bounty; a new handover is written when an audit is engaged.

The written result, layer by layer, is `docs/VERIFICATION_MAP.md` § 16. What is left
is to run the checklist's tools that have not run, rerun the gate benches on the
current code, and triage the open CodeQL alerts (§ 16.10).

1. every layer named with its tooling and its evidence — the Solidity (Foundry
   invariants, Halmos, Certora, Echidna, Slither, Semgrep, mutation), the Rust
   (the mirror, mutation, differential fuzz), the SDK and the signer, the
   frontend and the ecosystem agents, the deployment and the estate — correct by
   construction wherever the opportunity exists
2. audit firms' open-source tooling applied where it fits this stack; the survey
   of their tools and programs lands here, with what each costs
3. findings resolved, or accepted in writing in `docs/DESIGN_DECISIONS.md`
4. the outcome stated in the release docs and in the footer's one line, "Formally
   verified. Use as-is."

The program's checklist, from the survey of audit firms' open-source tooling and
programs (sources in the commit that added it; an item marked *unverified* was
read from a search summary, never the firm's own page):

- **Repository controls, free.** Secret scanning with push protection, Dependabot
  security updates and the protection of `main` are on (read from the
  repository settings); CodeQL runs in advanced setup
  (`.github/workflows/codeql.yml`) over the workflows, TypeScript and Rust. Still to
  add, one CI step each: `zizmor` to audit the workflows and the OpenSSF Scorecard to
  score the repository.
- **The trusted dependency.** SP1 has published five high- or medium-rated
  advisories; RustSec carries none of them, so `cargo audit` cannot see them.
  `prover/Cargo.lock` pins `sp1-sdk` 6.8.1, past every fix. A CI check reads the
  GitHub advisory database for the `sp1*` crates directly.
- **Solidity.** In use: Foundry invariants, Halmos (dormant upstream since
  2025-08), Certora through the cloud, Echidna, Slither, Semgrep, Mythril by
  hand, mutation testing. To add where they pay: Medusa (coverage-guided
  fuzzing beside Echidna), `crytic/properties` for the florin's ERC-20
  properties, Aderyn, `necessist` over the Foundry tests (a test that passes
  with a statement removed is no test), Gambit over the CVL rules (today
  mutation-checked by hand), Kontrol over the Foundry tests. The GPL Certora
  Prover may run locally, which would bring Certora into CI — *unverified*.
- **Rust.** In use: the mirror, `cargo-mutants`, differential fuzz, Clippy,
  `cargo audit`. To add: Kani proof harnesses on the guest's mirror (they live in
  test files, so the guest code and its key do not move), `cargo-fuzz`,
  `cargo-deny` and `cargo-vet` for the supply chain, `necessist` and `mewt` over
  the Rust tests.
- **SDK, frontend, agents.** Semgrep and CodeQL are the only firm-published
  tools that reach TypeScript and the Node sandbox; `mewt` reaches the SDK tests.
  The client-surface re-review's eight domains stay the review frame.
- **Deployment and monitoring.** OpenZeppelin Monitor (self-hosted) beside the
  daily scan; SEAL's frameworks for incident management, monitoring and supply
  chain; SEAL Wargames would rehearse the disclosure and advisory legs the Rekt
  Test leaves unrehearsed (cost not published).
- **Checklists to score against,** beside the Rekt Test, Trail of Bits' maturity
  categories and L2BEAT already scored: OWASP Smart Contract Top 10 with its
  checklist, Cyfrin's audit checklist, Hacken's methodology v3.0, OpenZeppelin's
  audit-readiness guide, Immunefi's severity classification (to map
  `SECURITY.md`'s table onto).
- **Programs that cost nothing or by quote.** HackerOne Community Edition lists a
  bounty without charge, keeping five percent of a cash payout only, for an
  OSI-licensed project with a `SECURITY.md`; Cantina's free bounty tier, *unverified*. Guardian's
  audit grant was applied for and still priced out, so no audit firm's grant
  route is open.
  Contest platforms price by quote: Sherlock's own market reference puts a
  mid-complexity audit at tens of thousands of dollars; Code4rena is winding
  down; Immunefi and Cantina quote per pool. Vanta and Testlio do not apply to
  this stack; 20squares' open-game engine addresses the equilibrium the Lean
  proof already covers.

### Task 14: Hardening

- The domain's DNS carries CAA, naming the one certificate authority that may issue for it.
- A status page for the relay and the services it depends on.
- The bug bounty listed on a platform, and event-driven alerting on the contracts beside the
  daily scan (`SECURITY.md` § Monitoring).

### Task 3 (residue): state each deployment's γ-curve point

The registry parameters are hardcoded in `script/DeployMainnet.s.sol` (reasoning
inline; derivation in `/papers/substrate-broadening-rpgf` §7). Before each public
broadcast: re-measure `g` — the marginal cost of one fabricated resolved process,
batch path — on the target chain, and state the deployment's point on the γ curve
where the release facts are kept.

### Task 6: Content durability

- **Sovereign per-party pinning (Option 3).** Shift durability to the parties: each
  publishing wallet's client pins what it publishes, so no single operator holds
  availability — no central pinning dependency in the trust
  model. (The same on every chain, testnet included: no build carries a pinning
  account. A browser publishes through the wallet's own IPFS node, or a pinning
  service the user chose with its own token, both set in this browser at
  `/members/edit/endpoints` (`readUserEndpoints`, `activePublishTarget` in
  `frontend/lib/shared/ipfsService.ts`); with neither set, a publishing page
  says so in one line, offers the setting, and pins nothing.)
- **Retrieval-availability floor: 6 years, user-extensible.** An agreement must stay
  fetchable by its CID for the longest plausible dispute/audit window, anchored to
  the tax-audit horizon (~5 audit years + 1 declaration year). The window varies by
  jurisdiction, so 6 years is a floor, not a fixed term — each agreement carries a
  per-party option to extend.

### Task 7: Testnet — the Polygon leg + the doc flip

Sepolia is live and rehearsed. Remaining:

- Polygon: the testnet is **Amoy** — confirm at
  execution time, then pin chain id + RPC in the network config. After each deploy,
  /spec's per-network deployments table and the SDK's published addresses fill from
  the real deployment records — the record is the source, never hand-typed
  constants.
- Flip the device-only deployment-context statements across the repo docs (a
  maintainer act).

### Task 9: Florin treasury tail

Before the stack goes public: stand up the real DAO treasury on each chain it is
deployed to — a canonical Safe at `DAO_WALLET` with real keys, whose address
follows by CREATE2 from the owners, the threshold and the salt the chain's
expectations file states (`scripts/safe-treasury.mjs`; the deploy wrapper
creates it) — and rehearse the
threshold-ECDSA signing ceremony on Sepolia. It protects keys, so it waits for no later
network. Devnet uses a `MockTreasuryMultisig` placeholder; the treasury's address is
config, never code.
Who holds the treasury, and the discipline on spending it: `docs/DAO.md`.

The implementation as rehearsed, which the design in `DAO.md` never states and which
changes as the DAO sees fit:

The operator account the DAO meets the ecosystem through is an **operator EOA**, an
externally-owned account carrying an EIP-7702 delegation to
governance-controlled code — the same delegation shape `DESIGN_DECISIONS.md`
§ key-loss documents for any buyer. The delegated code is **MetaMask Delegation
Framework's `EIP7702StatelessDeleGator`** at its canonical CREATE2 address
`0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B` (v1.3.0) — audited,
off-the-shelf, and the same address on every network, so a rehearsal is
literal (`DelegationManager` `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3`).
The multisig's authority is an ERC-7710 delegation the operator grants it,
bounded by caveat enforcers and redeemed through the framework's
`DelegationManager` to act from the operator's address.

The treasury contract itself can never sign commitments — `FigaroCore` is
ECDSA-only — so the multisig authorizes *upstream*: it pays the operator per
procurement, and through the delegated code it can act from the operator's
address for `msg.sender`-authorized calls (resolution, recovery) and bound what
the operator may do, while the operator's own key produces the EIP-712
signatures.

That operator EOA is the DAO's identity in every registry and every trade. It
holds the DAO's member profile — buyer side, and seller side when the DAO sells
(merchandise, tickets, its co-produced data) — and it is the buyer of record
when the DAO procures through the protocol. Its blast radius is bounded by the
delegation and by per-procurement funding. The operator EOA and its delegation
are created BEFORE the DAO's member profile is registered under it
(`RELEASE_READINESS.md` Task 13 owns the ordering); the vault address itself
holds no profile.

Devnet rehearses the shape: `Deploy.s.sol` stands up `MockTreasuryMultisig` (an
anvil-placeholder 2-of-3) as the 300M mint target, and
`test/rewards/TreasuryProcurement.t.sol` drives fund → bonded commit → resolve →
sweep-back, asserting the treasury's net spend is exactly the payment.
Threshold-ECDSA — a multisig in cryptography, an EOA on chain — is the recorded
upgrade for the operator's key, rehearsed on a testnet before adoption.


### Task 11: WYSIWYS tail — frontend delivery integrity

The signing-moment mitigations already shipped
(`scripts/verify-signed-agreement.mjs` + the `/audit` signature verdicts); this task
is the delivery-of-the-frontend half:

1. **Content-addressing is the primary integrity mechanism.** Every public release
   is pinned as the static export it already is; the release CID is recorded in the
   repo (tag/release notes). "Verify the frontend" = load it by CID from your own
   gateway — the CID covers every asset including the HTML SRI cannot. Per-asset SRI
   is subsumed for CID users; for DNS-origin users it is a cheap-if-easy addition,
   never a gate.
2. **Reproducible builds are attempted, published as a recipe, and claimed only when
   proven.** Pin the toolchain, strip nondeterminism, publish the exact rebuild steps
   so anyone can rebuild and diff against the release CID. No public "reproducible"
   claim until CI has produced the same CID on two independent machines.
3. **Second-frontend verification is stated in its honest present form.** `/security`
   says: trust no single origin — verify the typed data on your own machine with the
   SDK verifier (or any independent implementation built on the SDK; the
   `clause.block` seam makes frontends replaceable). No statement implying a second
   frontend exists. Copy edits go through the repo's copy-owner agents
   (`.claude/agents/`: figaro-marketing-copy, figaro-builders-docs) at execution time.

### Task 12 (residue): the launch flip

Un-gate the site from crawlers, and set the site URL — ONLY on the maintainer's
explicit order. `frontend/app/layout.tsx` hardcodes `robots: noindex, nofollow`
sitewide (a deliberate pre-publication hold; `frontend/public/robots.txt`
Disallow-all is its sibling) — both flip at launch, not before.
`NEXT_PUBLIC_SITE_URL` must be set for the deploy build or `metadataBase` falls
back to `figaro.example` and every og:image/sitemap URL is dead — verify it in the
deploy environment before the export is uploaded.

### Task 13: Genesis Registration Ownership

The rule: the DAO treasury vault is the designer of record for
`figaro-commerce` only (`deployments/<chainId>.expected.json`
§ registrations.byClause) and, after genesis, any clause it develops and
registers; every
other reference clause and every reference assembly is registered by the founder's
wallet, from the founder's own balance; each member profile is registered by its
own wallet — the founder direct as a buyer-side member, the DAO under its
EIP-7702-delegated operator EOA, never the vault address (Task 9). Registrar = designer of record = who the 600M reserve rewards
(`RpgfMinter._isAuthor(kind, key, account)` reads `depositOf(key).registeredBy`
for the clause kind, and `claim` reads the claimant's live member stake); first-write-wins and permanent per key — a clause key is
`keccak256` of the canonical spec without its `block`, so a registration is
one exact spec. The procedure is rehearsed end to end on the testnet.

Before any public genesis seeding, on any chain:

1. The seeding run is a WRITTEN registration plan — each clause key (with the
   spec name and version it was resolved from) and its registrar — that the
   maintainer reviews BEFORE the first broadcast; the vault-registrar mode is
   invoked with `SEED_CLAUSES` naming exactly the clauses the plan gives the vault, as
   `name` or `name@version`, which `populate-clauses.mjs` resolves to keys over the specs
   it loads from `clauses/`, and every other run uses the founder's Ledger as
   direct registrar.
2. Rehearse the plan on an Anvil fork of the target chain with the real devices before its broadcast.
3. Keep `CONTRACTS.md` § "Designer rewards", `DESIGNER_REWARDS.md`, and `DAO.md` in
   sync if the rule moves.

## Deployment verification, on every chain

Deploy-time checks to run against each public deployment before it is treated as
live, the same on every chain. The ones the chain can answer are stated ahead in
`deployments/<chainId>.expected.json` (Sepolia's `11155111`, mainnet's `1`) and read by
`scripts/check-deployment.mjs` (run with `--artifacts` from a
`forge build --via-ir` at the release commit): it must report nothing that does not
hold before the deployment record is published. The registry stakes and the members' waiting
time are decided: `script/DeployMainnet.s.sol` deploys 0.05 ETH for each of the four
registries and 28 days, the values Sepolia runs. A deployment record's remaining `null`s are values
that exist only at the deploy: the wallets' addresses and the key built from the
release guest. `jq '[paths(. == null)]' deployments/<chainId>.expected.json`
lists them. A wallet name the plan uses with no entry in `wallets` is not
listed there; the written plan (`scripts/seed/seed.sh plan`) prints it as a
wallet the expectations file does not name.
One revision ties the release together: `RELEASE_COMMIT`, the full sha every
bench ran at. `scripts/check-release-revision.mjs` refuses a missing sha, a
tree that is not clean, and a HEAD that differs from it in the code, the
guest, the proofs or the build. The prover box's key build
(`scripts/prover-box/build-guest.sh <sha>`), the fork rehearsal and both
deploy wrappers run it before anything else. The wrapper writes the sha into
the deployment record as `releaseCommit`, and `scripts/check-deployment.mjs`
fails when its own checkout differs from it. The check binds the result to
the code, the guest key and the gateway. The list below is the procedure around it:

- Verify the `--rpc-url` target by hand immediately before every `--broadcast`.
  The Sepolia and mainnet wrappers read the chain id back and refuse any other
  chain (their Guard 3); the devnet script (`scripts/deploy-local.sh`) deploys
  to whatever `RPC_URL` names, so pointed at a public chain it deploys its mock
  stack there.
- `SP1_VERIFIER_GATEWAY` = Succinct's Groth16 gateway, on which the deploy wrapper looks up the routed verifier it binds as `SP1_VERIFIER` (the contract refuses a gateway):
  `0x397A5f7f3dBd538f23DE225B51f532c34448dA9B` with `SP1_PROOF_MODE=groth16` — the
  deploy wrappers' Guard 4 (`scripts/check-sp1-gateway-route.sh`) refuses to
  broadcast otherwise: the gateway must ROUTE the proof's form, not merely exist.
  And `SP1_PROGRAM_VKEY` recomputed from the CURRENT guest at deploy time, on
  the prover box's reproducible build (`scripts/prover-box/build-guest.sh`, or
  `sequencer --vkey` from a binary built there) — any guest rebuild supersedes
  the pinned vkey; never reuse an old value. Each deploy wrapper refuses unless
  `SP1_PROGRAM_VKEY`, the key the checkout's release relay prints and the key
  `deployments/<chainId>.expected.json` states are one value, so the built key
  is written into the expectations file before the deploy. The wrapper reads the pinned value
  back into the deployment record as `programVKey`, and the sequencer refuses
  to start against a verifier whose `programVKey()` is not its own guest's.
- The genesis state root is computed, not deploy-time-verified against the Rust
  value — treat one REAL batch resolving cleanly post-deploy as the genesis-root
  proof, not the deploy transaction succeeding.
- `FlorinToken.deployer` == the expected deployer EOA; `FlorinToken.deployerMintRenounced` == `true` after minter setup; `FlorinToken.totalSupply()` == the expected genesis allocation; every registered minter is an intended allocation contract.
- `AttestationCoordinator.core` == the deployed `FigaroCore` address.
- After genesis clause registration (`frontend/scripts/populate-clauses.mjs` — NOT
  run by the deploy script, and its signer falls back to the anvil test key when
  `REGISTRAR_PRIVATE_KEY` is unset): `ClauseRegistry` `registeredBy` for the
  `figaro-commerce` key == `DAO_WALLET`. The treasury is
  receives designer rewards as designer of record only if this holds (`/dao`,
  `DAO.md`); nothing else enforces it.
- `MembersRegistry.registrationDeposit` == 0.05 ETH and `.withdrawalCooldown` == 28 days; `ClauseRegistry`, `AgreementRegistry` and `ProcessRegistry` `.registrationDeposit` == 0.05 ETH (NOT the devnet `0.001 ether` / `0` placeholders). Every one is immutable and cannot be corrected after deploy.
- `UsageCounter.members` == the deployed `MembersRegistry` (the live-stake gate reads it), `UsageCounter.periodEnd(0..8)` == the nine annual boundaries derived from `RPGF_GENESIS`, and `UsageCounter.minSellers` == 3 — these are immutable and cannot be corrected after deploy. `RpgfMinter.counter` / `.clauses` / `.assemblies` point at the deployed instances, and `.periodAmount` (45M/45M · 60M×3 · 82.5M×4 — the 15/30/55 rising-tranche grouping) sums to 600M and its length is validated on-chain against `periodCount()`.
- Every token a process can be denominated in is non-rebasing and non-fee-on-transfer.
- **No test members on mainnet — ever.** The rehearsal
  doctrine covers procedure, not tooling: the member-registering smoke specs
  (`*.sepolia.spec.ts` — `live-order` drives the onboarding wizard and registers a
  "Smoke counter …" profile) are TESTNET-ONLY and are never pointed at mainnet.
  Mainnet verification is read-only checks plus real content by real wallets.
  Verify after any mainnet verification run: a MembersRegistry read shows no
  test-flavored member surfaced.
- Each court `figaro-arbitration-kleros` names exists by its policy name in the Kleros arbitrator's court list on the target chain. The clause pins no court number, since Kleros numbers its courts per deployment (`docs/CLAUSES.md` § "The clauses"). `test/fixtures/kleros-courts.json` is re-read on that chain and `sdk/tests/clauses/klerosCourts.test.ts` passes before the deployment is treated as live. On Ethereum Sepolia only the General Court of the four exists.
- Agreement / assembly / profile content is pinned for durable retrieval per Task 6 — via sovereign per-party pinning (Option 3), never only a single Kubo node, on every chain — and is fetchable by CID across the 6-year (5 + 1) retrieval-availability floor.
- Test-helper flags unset in the deploy build: `NEXT_PUBLIC_ENABLE_TEST_HELPERS`, `NEXT_PUBLIC_USE_TEST_SIGNER`, `NEXT_PUBLIC_TEST_PRIVATE_KEY`, `NEXT_PUBLIC_DEV_ADDRESS` must all be unset (else `?e2e=mock` / the injected test signer inline into the bundle). This is enforced at build time: `frontend/next.config.mjs` ABORTS a `NODE_ENV=production` build with any of these set unless `FIGARO_ALLOW_TEST_HELPERS=1` (the escape only the Playwright e2e build sets). Confirm the CDN build runs without that escape.
- `public/_headers` CSP/HSTS set is applied at the CDN — verify at the hosting layer (cannot be checked from the repo tree). The header CSP carries `'unsafe-inline'` for scripts (a static export cannot do per-request nonces), and every exported page narrows it with its own Content-Security-Policy `<meta>` listing the sha256 of each inline script it ships (`frontend/scripts/csp-inline-hashes.mjs`), so an injected inline script does not run. XSS safety also rests on React auto-escaping, held by an ESLint error on `dangerouslySetInnerHTML` outside `components/papers/Math.tsx` (`frontend/eslint.config.mjs`, run by `frontend-ci` on every push).
- `next` npm advisories are static-export-INAPPLICABLE (this deploy ships no Next server: `output:'export'`, no middleware/rewrites/RSC-server/Server-Actions). They are build-host hygiene, NOT runtime blockers — do not conflate with runtime-reachable advisories in browser-shipped dependencies (wagmi/viem tree). The frontend runs Next 16, which clears every `next` advisory the audit reported on 14.2; `frontend/.audit-ignore.json` sets none aside.
- Ecosystem-agent tier (`ecosystem-agents/`) ships ONLY behind the sandboxed signer
  runtime — **all four components must stand** (`AI_AGENT_COORDINATION.md` § the
  sandboxed signer runtime owns them): the policy signer (`@figaro-protocol/sdk/signer` —
  the key stays in its process, out-of-model gate, F1–F3), the operator pointed at the socket account,
  the data channel (`ecosystem-agents/runtime/` — framed, nonce-bounded fetches, F4 at
  the fetch boundary), and the sandbox wrapper (`run-sandboxed` — an OS sandbox whose only
  loopback is the egress proxy's port + policy-driven egress proxy + scrubbed
  environment, F5/F6; deny cases tested on macOS). Honest residuals, named where they live: the Linux container
  variant is EXERCISED in CI on demand (`on-demand-docker.yml` Job 2, "Linux sandbox
  variant", runs the container deny cases and the RPC relay) but never on the
  authoring host — CI-on-demand only; and `Bash` remains in
  the operator's grant *inside* the wrapper until the runtime grows typed tools. The
  gate CRITERION — no raw host shell + no ambient key + framed content — is met when
  the operator is launched through `run-sandboxed` with the signer outside; launched
  bare, the guarantee degrades to behavioral-only and the specs say so. (Separate gate
  from the frontend's, and named by the frontend+SDK security audit.)
- The IPFS gateway the app resolves `ipfs://` documents through MUST be a DIFFERENT origin than the app itself. An affixed consent/criteria document may be pinned as `text/html` (`ipfsService.ts` `ALLOWED_FILE_TYPES`); on click-through the gateway serves it and any script runs in the GATEWAY origin — harmless while that is a separate origin, an app compromise if the app is ever served same-origin as its gateway (named by the security audit).
- Wallet-security screening: drive one real commit signature through MetaMask against the live deployment and confirm no Blockaid "deceptive request" flag on the EIP-712 request (legitimate contracts get false-flagged — a Kleros contract did); if flagged, file the MetaMask/Blockaid false-positive report and re-verify before launch. (Surfaced once already: the universal Anvil default-deployer addresses tripped the list on devnet; devnet now deploys from a randomized throwaway key.)
