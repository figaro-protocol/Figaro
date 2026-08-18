# V5 Release Readiness

Status: canonical release gate note for the live V5 kernel, protocol, and runtime.

Last updated: 2026-08-13 (the Solidity freeze is STAMPED at `c7f85d0d` — Task 1 closed, see the Freeze Notice; Tasks 4 and 5 collapsed to their closed records; Task 12 items 2–3 updated to verified tree state — `SECURITY.md` and the seven CI workflows exist — and since the same-day publication, both are LIVE). Earlier, 2026-07-29: the reward mechanism was ratified UNIFORM — `UsageCounter` + `RpgfMinter` pay each clause or assembly pro-rata on real usage alone, gated by the two-sided live ETH stake; the per-clause weight (`BOOSTED_WEIGHT`/`BASE_WEIGHT`, `rpgfTag`), the 15% per-wallet cap, and the entire quadratic-funding/match-round apparatus (`MatchPool`) were DELETED. Owners: `docs/PUBLIC_GRAPH_MODEL.md` (mechanism) + `CONTRACTS.md` § "Teardown state — CLOSED" (contract status). Earlier: the optimistic reward apparatus — posted roots, ETH bonds, challenge windows, the arbitrator seam and its mocks — was deleted 2026-07-27 and replaced by the count-at-resolve `UsageCounter`; the `cloudflare/` closed-beta apparatus was deleted — Task 7 is a plain testnet rehearsal now; `FigaroBatchVerifier` and the Rust `prover/` were rebuilt witness-based 2026-07-16, so Task 8 is live).

This note is the current answer to a simple question: what is ready now, what is still open, and what must happen before a public release is treated as complete.

## Deployment Targets

Ruled by the maintainer 2026-07-23: the public deployment target is **Ethereum mainnet**.
**Polygon** is a possible additional deployment. A **Cairo rewrite** of the contracts
(Starknet) is planned as a later line of work. Testnet rehearses the mainnet deployment
(testnet = mainnet rehearsal); chain-coupled compositions resolve against these targets —
Kleros courts are live on Ethereum mainnet.

## Current Verdict

The live V5 Solidity surface is internally consistent and the runtime hardening pass has closed the highest-value browser, build, and event-reconstruction risks.

Public release should still be treated as blocked on one explicit governance-free process decision:

1. freeze the Solidity surface
2. run a final external audit pass against that frozen surface

This is not because the current pass surfaced a new contract defect. It is because the kernel is the irreducible payoff matrix, so the prudent pre-release move is independent review after churn stops, not more architectural motion during the audit window.

## What Is Ready

- the live kernel and mechanism module inventory is stable enough to validate as one V5 surface
- the full Foundry suite passes on the active contracts
- the frontend type-check and production build have been brought green in this hardening pass
- focused Vitest and Playwright coverage has been used to validate the live runtime flows that matter most for release posture
- event-sourced state reconstruction assumptions used by the SDK and frontend were rechecked against the live kernel events
- fee-on-transfer rejection remains explicit in both the kernel and the active test suite

## Remaining Tasks

The concrete tasks that remain before the public-release gate is closed:

### Task 1: Freeze The Audited Solidity Surface — CLOSED 2026-08-13

The freeze is declared AND stamped: freeze commit `c7f85d0d` (the last commit touching
the frozen scope — see the Freeze Notice below for the stamp record and the
classification of post-2026-08-04 frozen-scope commits). Any later Solidity edit is a
new review event under the Post-Audit Policy.

### Task 2: Run The Final External Audit Pass

Required output:

1. choose the auditor or audit process
2. hand over the frozen Solidity surface and active docs
3. resolve findings or explicitly accept non-critical findings in writing
4. record the final audit outcome in the release docs

### Task 3: Resolve Mainnet Registry Parameters — RESOLVED 2026-07-31 (reference values landed; maintainer ratifies before broadcast)

The RPGF paper's §7 turned this from a judgment into arithmetic, and the reference values
are now in `script/DeployMainnet.s.sol` with the reasoning inline (placeholders removed).
The working, so the choice is auditable:

**The formula (proof in the paper; constants below are the deploy's).** A fabricated
staked-seller identity costs `δ = D·T/P` of committed capital per accrual period — one
deposit `D` recycles through at most `P/T` sequential identities under cooldown `T`. With
`g` the measured marginal cost of one fabricated settled process (batch path), the
attacker's committed capital per unit of fabricated score is `γ = δ + g` when `δ ≤ 2g`,
else `≈ 1.89·δ^(2/3)·g^(1/3)` — linear in score either way, which the staked-seller
breadth statistic is what makes possible. Capturing a share `φ` of a period costs
`γ·S_h·φ/(1−φ)`: convex, unbounded at `φ → 1`.

**The chosen values and their anchors (each anchor named for what it is):**

1. **`MembersRegistry(0.05 ether, 28 days)`.** `D = 0.05 ETH` clears the spam floor
   ~100× over registration gas while staying inside what a genuine small seller commits
   to be discoverable — the honest-ceiling half is a judgment and is labeled as one.
   `T = 28 days` against annual periods gives `P/T ≈ 13`, so `δ ≈ 3.8e-3 ETH` per
   identity-period; de-surfacing stays immediate at request, only the ETH release waits,
   and a seller who stays pays nothing. Denominated in ETH only — the deploy-time
   fiat-anchor approach was declined 2026-07-30 (florin unpriced by design; appreciation
   is a forecast).
2. **`ClauseRegistry(0.05 ether)` / `AssemblyRegistry(0.05 ether)`, no cooldown** —
   withdrawal is one-shot per key with a permanent binding, so nothing recycles. These
   stakes do MORE work than the seller stake per unit: author-side RPGF eligibility
   requires the deposit live AT CLAIM, so the capital is held for the whole period,
   undiscounted — and it prices the clause-or-assembly-replication lever (an adversary multiplying
   score across `m` self-authored clauses in the same fabricated agreements holds `m`
   full deposits for the period; portfolio cost stays linear in score with the clause
   deposit entering under a square root — paper §7.3 scopes this).

**Stated honestly, as the paper does:** above `δ = 2g` the deposit's bite grows only as
`δ^(2/3)` — gas-bought volume substitutes for identities under the cube root — so these
values buy a published, recomputable, convex capture-cost curve, not farm-proofness; the
ratified posture ("aligns the honest majority, does not deter a determined Sybil";
dilution, never theft) is unchanged. The state machine under all of it is Halmos-proved
(cooldown unskippable, no deposit recycling, counter admits usage iff the stake is live).

**Anchors RATIFIED by the maintainer 2026-07-31** (the 0.05 ETH honest-ceiling and the
28-day cooldown) — the landed values are final deploy config. Remaining before
broadcast: re-measure `g` on the target chain and record the deployment's point on the
γ curve in the release record.

### Task 4: AssemblyRegistry Mainnet-Parity Decision — CLOSED

**Disposition taken: deploy it (2026-07-27).** `script/DeployMainnet.s.sol` deploys `AssemblyRegistry(0.05 ether)` (the Task-3 ratified stake) alongside the other two registries; both deployer-log lines print from `_logAddresses()`. The devnet/mainnet asymmetry is closed; no output remains.

### Task 5: Launch Scenario — Assembly Seeding Decision — CLOSED

**Decided (2026-06-03): no pre-seeding on either surface.** Both devnet and mainnet rely on permissionless on-chain publication — assemblies authored through the designer UI, sellers onboarded through the registration wizard; no seed path diverges from the mainnet path. `script/DeployMainnet.s.sol` seeds no assemblies (recorded); no output remains.

### Task 6: IPFS Content Persistence — Pinning Durability

The chain stores only the agreement fingerprint (`agreementHash` / assembly `contentHash`); the agreement itself lives on IPFS, and every downstream consumer — counterparty validation, indexer graph reconstruction, a dispute forum — retrieves it by CID. IPFS does **not** auto-replicate: pinned content lives only on the node(s) that pin it, so a single Kubo node is a single point of failure. The devnet runs one native (brew-installed) Kubo node (API `:5001` and gateway `:8080` are two interfaces to the *same* node), which is correct for device-only dev (wiped each `devup`, no long-lived commitments). On a live network a commitment's agreement must stay fetchable by its CID for the life of any possible dispute, so content durability must outlive any single node.

Required output:

1. **Testnet — managed pinning service (Option 1) — WIRED 2026-08-13.**
   The `ipfsService` add/unpin seam gained a deploy-build adapter (JWT env →
   Pinata-style API; user's own node still wins; keccak block-put stays
   Kubo-only, best-effort by its caller's design). Round-trip verified live;
   the site export is the first mirror pin. Env vars: `docs/LOCAL_DEV.md`.
   Original requirement: Pin every published agreement, assembly template, and profile to a managed multi-node pinning service (Pinata / Filebase / Storacha) so content survives the loss of the dev node. The pin path (`frontend/lib/shared/ipfsService.ts`) targets the service API; add the service endpoint/key as env vars in `docs/LOCAL_DEV.md` + `frontend/.env.local`.
2. **Mainnet — sovereign per-party pinning (Option 3).** Shift durability to the parties: each publishing wallet's client pins what it authors, so no single operator is the custodian of availability — matching the ownerless / permissionless doctrine. No central pinning dependency in the mainnet trust model.
3. **Retrieval-availability floor: 6 years, user-extensible.** An agreement must stay fetchable by its CID for the longest plausible dispute/audit window, anchored to the tax-audit horizon: most administrations can audit ~5 years back, plus 1 year because a year's transactions are declared the following year → a **6-year minimum**. The window varies by jurisdiction and shifts over time, so 6 years is a floor, not a fixed term — each agreement carries a per-party option to extend (longer retention for higher-stakes or longer-tail commitments).

### Task 7: Testnet Deployment Rehearsal (ACTIVE)

**Active — the deploy decision flipped 2026-08-12** (Sepolia first, then Polygon
Amoy; testnet planning began 2026-08-13).
(The Cloudflare closed-beta apparatus — gate Worker + access codes, rpc-proxy
allowlist, beta Anvil container, `cloudflare/` runbook — was deleted 2026-07-09
with the no-beta ruling; there is no beta phase, so the rehearsal targets an
ordinary public deployment. Hosting is PICKED (2026-07-13): **Cloudflare Pages**
serves the rehearsal URL — free static tier, native `_headers` support, direct
upload of the export, no build coupling — with an **IPFS + ENS mirror** as the
ownerless companion (re-pinnable by anyone; gateways serve no custom headers,
so the mirror trades the header layer for re-pinnability). The security headers
are artifact-enforced: `frontend/public/_headers` ships inside the export
(FRONTEND.md § Static export). The frontend is a static-exportable protocol
surface with user-owned RPC/IPFS endpoints, so no edge middleware is presumed.) Order: deploy-script audits → Sepolia smoke-test
→ flip the device-only deployment-context statements across the repo docs (a
maintainer act).

Required output:

1. ~~Audit `script/Deploy.s.sol` + `script/DeployMainnet.s.sol`~~ — DONE 2026-08-03, verdict
   clean: the env-var contract hard-reverts everywhere (no `envOr`, no silent defaults);
   `DeployMainnet.s.sol` imports zero mocks; the `UsageCounter`↔`FigaroBatchVerifier`
   adjacent-pair address prediction is `require`-asserted in both scripts; the Task-3
   ratified registry values are hardcoded literals (correct-by-construction, no env lever).
   Process residuals folded into the smoke-test item below.
2. ~~Resolve the wagmi-2 advisory gate~~ — **RESOLVED 2026-08-03**: RainbowKit still has no
   wagmi-3 support (rainbow-me/rainbowkit#2575 open), so the ruled fallback landed — wagmi 3,
   RainbowKit/WalletConnect removed, injected connector only (one `ConnectWallet` +
   `useConnectInjected`; extension wallets via EIP-6963 unaffected; WalletConnect-only mobile
   wallets no longer connect). `npm audit --omit=dev`: 39 (11 high) → 2, both in the Next
   tree (`next` + its bundled `postcss`; major-only fix, static-export-inapplicable per the
   Pre-Mainnet note; build-host hygiene bump advisable). A third residual — `ws` reached via
   `viem → isows`, runtime browser code, NOT Next — was mis-attributed to Next here until
   2026-08-04; fixed by a non-breaking bump (`ws` 8.18.3 → 8.21.2, Vitest 585/585 green
   after). Full verification in the migration commit.
3. Sepolia smoke-test of the deployed stack through the UI (the devnet e2e pattern against a
   public testnet). Rehearsal checks from the 2026-08-03 deploy-script audit: (a) neither
   script guards `block.chainid`, so verify the `--rpc-url` target by hand immediately before
   every `--broadcast` — the devnet script would happily deploy its mock stack to a public
   chain; (b) the genesis state root is computed, not deploy-time-verified against the Rust
   value — treat one REAL batch settling cleanly post-deploy as the genesis-root proof, not
   the deploy transaction succeeding; (c) confirm Succinct publishes an SP1 verifier gateway
   on Sepolia (or self-deploy one) before setting `SP1_VERIFIER_GATEWAY`.
   **(c) LESSON, 2026-08-18 — the gateway must ROUTE the proof form, not merely exist.**
   Succinct runs one gateway per proof form per chain and each routes by the proof's
   verifier-version selector (`bytes4(SP1Verifier<Form>.VERIFIER_HASH())`). The Sepolia
   stack bound `0x3B60…185e` — the RETIRED PLONK gateway (`OLD_SP1_VERIFIER_GATEWAY_PLONK`
   in Succinct's `deployments/11155111.json`): it routes PLONK verifiers only — no
   Groth16 route at all — so a Groth16 proof (the sequencer's form) reverts
   `RouteNotFound` on the deployed `FigaroBatchVerifier`. (The proof's selector is the
   CIRCUIT version the locked SP1 prover embeds — `SP1_CIRCUIT_VERSION`, v6.1.0 for sp1
   6.3–6.4 — not the sdk version and not `v<major>.0.0`; the guard reads it from the SP1
   repo at the locked tag.) Immutable pointers (verifier→gateway, UsageCounter→verifier,
   RpgfMinter→UsageCounter, florin minters at genesis) mean the fix is a whole-stack
   redeploy. **Ruled 2026-08-18: the design is Groth16 and stays Groth16 — no PLONK
   workaround on the testnet; the gateway rebinding joins the redeploy list (Task 13's
   group: everything that requires redeploying the Sepolia stack is straightened out
   first, then ONE redeploy).** The address was the agent's wrong recall on 2026-08-14
   (Succinct's original PLONK-only gateway, labelled Groth16 in the deploy env; verified
   for code existence, never for routing) — never a design choice. **Mainnet gate and
   the redeploy's value:** `SP1_VERIFIER_GATEWAY` = Succinct's Groth16 gateway
   `0x397A5f7f3dBd538f23DE225B51f532c34448dA9B` (routes the embedded circuit's Groth16
   verifier — v6.1.0 → `0xb69f…4e2`, verified live 2026-08-18 on Sepolia and mainnet)
   with `SP1_PROOF_MODE=groth16` — the
   deploy wrappers' Guard 4 (`scripts/check-sp1-gateway-route.sh`) refuses to broadcast
   otherwise; correct the value in the deploy env before that run.
   **(b) sequencing:** one real batch settling happens on the REDEPLOYED stack, Groth16.
   The proof needs a host this repo's laptop is not (Succinct's floor for the Groth16
   wrap: ~14 GB RAM, through the `sp1-gnark` Docker image unless `native-gnark`): whoever
   requests a proof pays for it — the relay operator, on rented hardware or the Succinct
   Prover Network (the sequencer's `network` backend waits on its alloy 1.x bump) — never
   the protocol and never its users (the ruled cost model). For the rehearsal that is the
   maintainer, once, as the relay operator of the day.
4. Testnet setup — the two networks, in order (maintainer-ruled 2026-08-12; targets per
   the Deployment Targets section: Sepolia first, Polygon second). Sepolia prerequisites
   landed 2026-08-14:
   - ~~Per-network deploy config/env~~ — DONE: `script/DeploySepolia.s.sol` (mirror of
     mainnet with ONE testnet divergence: mock treasury as DAO wallet; the weekly-period
     compression was reverted 2026-08-14 — real yearly schedule: the testnet rehearses
     mainnet's real parameters) +
     `scripts/deploy-sepolia.sh` (chain-id 11155111 read-back; `SKIP_VERIFY=1` for the
     Anvil-fork rehearsal). Fork-rehearsed end-to-end the same day: full stack (11.5M
     gas), 27 clauses + 9 reference assemblies registered THROUGH the mock treasury
     (chain-verified — a rehearsal of the vault mechanism only: the ownership rule is
     mandatory-clauses-only under the DAO, Task 13), DAO member via treasury execute,
     founder member direct. Seeding is `populate-clauses.mjs` treasury mode (Sepolia USDC
     `0x1c7D…7238` as the reference-assembly settlement fill, ruled 2026-08-14).
     Live nudge 2 landed 2026-08-17: `pos` + `local-commerce` (their 9 clauses + 2
     anchors) registered through the vault with the founder's Ledger approving on
     the device (`VAULT_LEDGER_HD_PATH` → `cast send --ledger`, one tap per
     registration; `SEED_ASSEMBLIES` names the nudge), chain-verified.
   - A funded deployer key: Sepolia deployer `0xaB6002…647c` live, accumulating via
     faucets toward ~2.1 ETH (1.90 ETH of registry deposits dominate; deploy gas ≈
     0.025). SP1 verifier gateway confirmed deployed on Sepolia (item 3c) at the
     canonical `0x3B6041…185e`.
   - Remaining maintainer inputs at broadcast: FOUNDER_WALLET / SUPPORTERS_WALLET
     addresses, the Task-3 ratification (0.05 stakes), and an `ETHERSCAN_API_KEY`
     for `--verify`.
   - Polygon's current testnet is **Amoy** (Mumbai is retired) — confirm at execution
     time, then pin chain id + RPC in the network config.
   - After each deploy: /spec's per-network deployments table and the SDK's published
     addresses fill from the real deployment records — the record is the source, never
     hand-typed constants.

(Kleros subcourt-ID verification and IPFS content durability for this path are already covered by the Pre-Mainnet Deployment Verification checks and Task 6 above.)

### Task 8: SP1 Prover End-to-End — REBUILT (2026-07-16)

The proof apparatus deleted in the 2026-06-25 teardown was rebuilt witness-based
and is live: `FigaroBatchVerifier` + the Rust `prover/` (2026-07-16). (The RPGF
distribution returned on a separate track and needs no proving at all — see
`CONTRACTS.md` § RPGF.) Canonical state: `CONTRACTS.md` § "Teardown
state — CLOSED". A real local SP1 Core proof of the canonical batch generates
and verifies; the cross-language batch e2e (`sdk/tests/batch-e2e.test.ts`) and
`BatchVerifierTokenOps.spec` are green. Mainnet deploy wires Succinct's SP1
verifier gateway + the program vkey (`DeployMainnet.s.sol`,
`SP1_VERIFIER_GATEWAY`/`SP1_PROGRAM_VKEY`). The FROZEN AUDIT SCOPE was
re-established to include the rebuilt surface on 2026-08-03 (see the frozen-scope
table) — the batch/proof path is a composition ABOVE the frozen kernel, deployed
and rehearsed with the rest of the stack, not a kernel change.

### Task 9: Florin custody tail

At/after mainnet: stand up the real DAO treasury — a canonical Safe at `DAO_WALLET`
with real keys, and the threshold-ECDSA signing ceremony rehearsed on testnet first.
Devnet uses a `MockTreasuryMultisig` placeholder; mainnet is config, never code.
Custody posture and treasury discipline: `docs/FLORIN_TOKEN.md`.

### Task 10: npm package provenance for `@figaro/sdk`

At publish (testnet tier): establish published-package ↔ audited-repo traceability
(npm provenance attestation) so a consumer can verify the SDK on npm was built from
this repo.

**BUILT 2026-08-18 — `.github/workflows/sdk-release.yml`:** a tag `sdk-v<version>`
(refused unless it equals `sdk/package.json`'s version) type-checks, tests the pure
surface (`SKIP_ANVIL=1`), builds, and runs `npm publish --provenance --access public`
with `id-token: write` — npm records the Sigstore attestation binding the tarball to
this repo, workflow, and commit (`npm audit signatures` verifies it downstream). The
package is unpublished today; the maintainer's one-time acts before the first tag:
create the npm organisation that owns the `@figaro` scope, mint a granular publish
token for `@figaro/sdk` (2FA bypass for automation) as the repo secret `NPM_TOKEN`;
after the first publish, optionally move to npm Trusted Publishing (OIDC — this
workflow as the trusted publisher) and delete the token. Then `git tag sdk-v0.1.0 &&
git push origin sdk-v0.1.0` (tags only on the maintainer's instruction).

### Task 11: WYSIWYS tail — frontend delivery integrity (RULED 2026-08-03)

Sequenced after the GitHub remote/CI item (publishing hashes and proving rebuilds
needs CI + a public repo). The signing-moment mitigations already shipped
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

### Task 12: GitHub Publication — CLOSED 2026-08-13 except item 1a (the launch flip)

**PUBLISHED 2026-08-13**: the maintainer ruled the pre-push decisions (harness ships;
full history; the noreply commit identity), created the `figaro-protocol` org, and
pushed. The repo is public at `github.com/figaro-protocol/Figaro`; all seven CI
workflows have executed GREEN; `v0.1.0` is released (Linux relay binary + sha256 +
canonical vkey in the release body); the historical v1 is archived at
`figaro-protocol/figaro-v1` with the USPTO-cited URL preserved as a pointer repo at
`adaliana/FigaroProtocol`; `/security` links the disclosure channels and GitHub
private vulnerability reporting is ENABLED (primary; the security mailbox forwards as
alternate). Item statuses:

1. **DONE — the URLs became true.** The org/repo was created under exactly the name
   the tree ships; the verification grep now matches only live URLs. (Original
   inventory, for history: the URL shipped in `frontend/components/shared/Footer.tsx`,
   `(spec)/spec/page.tsx` (the `GH` constant + inline links), `(spec)/pitfalls/page.tsx`,
   `_lib/paperGroups.ts` (per-paper resource links), `frontend/tests/components/ContractEntry.test.tsx`,
   `sdk/package.json` (`repository`/`bugs`/`homepage`), `CHANGELOG.md`,
   `.github/ISSUE_TEMPLATE/config.yml`, `(deal)/faq/page.tsx`, `(spec)/security/page.tsx`,
   `(research)/working-groups/page.tsx`, `(compose)/clauses/page.tsx`,
   `(compose)/assemblies/page.tsx`, and `sdk/README.md`/`(spec)/spec/page.tsx` prose links.
   This inventory goes stale as pages change — the executable form of the task is the
   grep itself: an exhaustive `grep -r "figaro-protocol/Figaro"` over the tracked tree
   must match only live URLs before push. Either create the org/repo under exactly that
   name (making the URLs true) or sweep all of them to the real target.
1a. **Un-gate the site from crawlers, and set the site URL.** `frontend/app/layout.tsx`
   hardcodes `robots: noindex, nofollow` sitewide (a deliberate pre-publication hold, and
   `frontend/public/robots.txt` Disallow-all is its sibling) — both flip at launch, not
   before. `NEXT_PUBLIC_SITE_URL` must be set for the deploy build or `metadataBase`
   falls back to `figaro.example` and every og:image/sitemap URL is dead — verify it in
   the deploy environment before the export is uploaded.
2. **DONE.** Root `SECURITY.md` ships; GitHub private vulnerability reporting is
   enabled and is the primary channel; `/security` links both (landed 2026-08-13).
3. **DONE.** All seven workflows executed on the maiden slate and run GREEN
   (first-run environment defects triaged 2026-08-13: husky prepare, initial-push
   path filters, platform-incomplete lockfiles, unpinned forge, node 20, sdk types,
   file:-link install order, fmt scope, trailing-slash assertions — `git log` has
   each). The Task-11 reproducible-build precondition is met; the maiden release
   run also measured the guest ELF as NOT cross-host reproducible (linux/darwin
   vkeys diverged), so releases are Linux-only until the reproducible-guest work.
4. **Repo metadata at creation.** Description, topics, default branch `main`; issues on.
   Recorded check (2026-08-07): `.git` is 247M, no tracked secrets/`.env`/keys/broadcast
   artifacts, `LICENSE` + root `README.md` present — no large-file surgery needed.

### Task 13: Genesis Registration Ownership — MAINNET GATE (opened 2026-08-17)

The first mainnet-readiness item produced by the Sepolia rehearsal, and the reason
the rehearsal exists. **The rule (maintainer, 2026-08-17):** the DAO treasury
vault is author-of-record for the **mandatory clauses only** (`figaro-commerce`,
`figaro-topology`, `figaro-assembly-provenance`) plus any clause a stranger donates
under it. **Every other reference clause and every reference assembly is registered
by the founder's wallet, from the founder's own balance; each member profile is
registered by its own wallet from its own balance** (founder direct; the DAO through
its vault). Registrar = author-of-record = who the 600M RPGF pays
(`RpgfMinter._isAuthor` reads `depositOf(...).registrar`); it is first-write-wins
and permanent per id — `withdrawDeposit` only de-surfaces.

**What Sepolia recorded (nudge 2, 2026-08-17):** the vault-registrar seeding mode,
following the over-broad "genesis seed set" wording of the 08-13 endowment record,
registered 6 non-mandatory clauses (`figaro-courier-process`, `figaro-merchant-process`,
`figaro-geolocation`, `figaro-handoff`, `figaro-modalities`, `figaro-proximity-policy`)
and both assemblies (`pos` `asm-33ce205ea77e79e8`, `local-commerce`
`asm-9398dfdc16ea296b`) under the vault. On Sepolia they stay there for life —
accepted as the testnet lesson, not repaired. From nudge 3 on, the founder registers.

**Gate criteria before mainnet genesis seeding:**
1. Ratify the mandatory-only rule above (this section is the record; the 08-13
   endowment memory carries the correction).
2. The genesis seeding run is a written registration plan — each id with its registrar — that
   the maintainer reviews BEFORE the first broadcast; the vault-registrar mode is
   invoked with `SEED_CLAUSES` naming exactly the mandatory three, and every other
   run uses the founder's Ledger as direct registrar.
3. Doc sweep done: `CONTRACTS.md` § RPGF, `LEXICON.md` vault-registrar seam, and
   `FLORIN_TOKEN.md` state the mandatory-only ownership (swept 2026-08-17 — keep
   them in sync if the rule moves).
4. Rehearsed end to end on an Anvil fork with the real devices, then on Sepolia
   (nudge 3 onward is that rehearsal), before mainnet.

**The Sepolia REDEPLOY list (maintainer, 2026-08-18: the stack is redeployed ONCE, after
every issue that requires a redeploy is straightened out — never piecemeal):**
- registration ownership per the rule above (nudge-2's 8 vault-registered ids re-registered
  under the founder; the vault keeps the mandatory three);
- the SP1 verifier gateway rebound to Succinct's Groth16 gateway (Task 7.3(c) lesson;
  Guard 4 enforces) — AND `SP1_PROGRAM_VKEY` set to the CURRENT guest's vkey: the
  2026-08-18 alloy 1.x bump (which let sp1-sdk's `network` backend compile) rebuilt the
  guest ELF, so the vkey the 08-14 stack pins (`0x00368d…1f83`, the `v0.1.0` release
  body) is superseded; recompute at redeploy time (`SP1_VKEY_ONLY=1 cargo run -p
  figaro-prove-test --release`, or read the next release tag's body) and never reuse the
  old value;
- ~~`WitnessSwapAndCommitCoordinator`~~ — DONE 2026-08-18 without a redeploy (it points at
  the kernel and nothing points back, so it deployed ALONE onto the live stack:
  `0xdfF381730811CDec3518FA38B14f92219c5127B6`, bound to canonical Permit2 and Uniswap
  SwapRouter02 `0x3bFA…48E` — the venue whose pull-by-allowance shape the coordinator
  needs; the router probed for behaviour before broadcast). Both public deploy scripts
  now deploy it (`SWAP_ROUTER` env, same probe); the frozen scope lists it; the site
  bakes the swap composition; `swap-funded-order.sepolia.spec.ts` PASSED LIVE (commit
  `0xc15aedc6…583c`, block 11516595, through the coordinator, a Uniswap V3 `Swap` in the
  WETH/USDC 0.01% pool in its receipt). Audit finding for the record: the coordinator
  landed 2026-07-12 (`a401e93c`) in the devnet script, TLA+, Foundry and the frontend but
  never in the public scripts or the scope table — an omission, not a decision.
- anything else this list accumulates before the redeploy day. The redeploy is also when
  Task 7.3(b) — one real Groth16 batch settling — is done, on the corrected stack.

## Validation Commands

Use these commands as the release gate. Expected output means successful completion with exit code `0` and the stated pass criteria. This gate asserts pass/fail; the harness inventory (suite, file, property, and rule counts) is `TESTING.md`.

### Contracts

```bash
MAINNET_RPC_URL=<mainnet rpc> forge test --via-ir
```

Expected output:

- 0 failed
- 0 skipped — the release gate RUNS the `MAINNET_RPC_URL`-gated mainnet-fork
  suite (the Permit2 witness-digest parity proof); without the env var those
  tests skip, which is a dev convenience, not a release posture

### Halmos Symbolic Proofs

```bash
./scripts/test-halmos.sh
```

Prereqs (one-time): `brew install z3 && pipx install halmos`.

Expected output: `✅ All 32 Halmos properties proved (7 FigaroCore + 7 MembersRegistry + 6 UsageCounter + 6 ClauseRegistry + 6 AssemblyRegistry).` (exit code 0)

### Certora Formal Verification

```bash
export CERTORAKEY=<key>
./scripts/test-certora.sh
```

Expected output: all 6 specs green (FigaroCore, AttestationCoordinator,
TokenOpsVerification, FlorinToken, BatchVerifierTokenOps, RpgfMinter). `Failed on rule_not_vacuous` alone is the
vacuity heuristic, not a rule failure — the results table is the authority.

### Echidna Fuzzing

```bash
./scripts/test-echidna.sh
```

Prereqs: `brew install echidna`.

Expected output: all properties hold on both harnesses (kernel + FlorinToken), exit code 0.

### TLA+ Model Checking

```bash
./scripts/test-tla.sh
```

Prereqs: Java 11+, `tla2tools.jar` in `formal/` (script header has the `curl`).

Expected output: all four models verify every invariant, TLC exit code 0.
(`SettlementUniverses.cfg` ships both named assumptions TRUE; flipping either
to FALSE is a deliberate experiment that is EXPECTED to fail — not a gate
regression.)

### SDK Tests

```bash
cd sdk && npx vitest run
```

Expected output: Vitest exits cleanly with no failing suites (the live-chain
`integration.test.ts` requires a running devnet; it skips without one — run
the gate with the devnet up so it executes).

### Frontend Type Check

```bash
cd frontend && npm run type-check
```

Expected output:

- TypeScript completes with no errors

### Frontend Production Build

```bash
cd frontend && npm run build
```

Expected output:

- Next.js production build completes successfully
- no hard build failures

### Frontend Unit And Integration Tests

```bash
cd frontend && npx vitest run
```

Expected output:

- Vitest exits cleanly with no failing suites

### Frontend Browser Validation

Devnet posture:

```bash
cd frontend && npm run test:e2e:devnet
```

Expected output:

- Anvil deployment verification passes first
- Playwright devnet project exits cleanly with no failing specs (the census is
  derived — `npx playwright test --list` — never a stored count)

High-value browser checks that must remain covered:

1. `/evidence-display` works under iframe-style embedding rules
2. handoff geolocation works under production-style headers
3. delivery-attestation geolocation works under production-style headers

## Accepted Risks

These are current design realities that are accepted by the protocol surface, not accidental defects introduced by this hardening pass:

1. buyer key loss is terminal for an active process because the kernel has no timeout or admin recovery path
2. very large processes are gas-bounded, so institution design should compose across processes instead of pushing single-process fanout toward the ceiling
3. fee-on-transfer tokens are unsupported by design and are rejected explicitly by the kernel

## Accepted Runtime Posture

These are current runtime posture decisions, not release blockers:

1. `/builders/prototype` remains an explicitly builder-scoped tooling surface rather than a consumer-facing institution route
2. `/builders/templates` is a routing surface into assembly-based template discovery, not a legacy on-chain registry UI
3. geolocation remains allowed for same-origin runtime surfaces instead of being narrowed to a brittle route allowlist, because handoff and delivery-attestation modules are runtime-composable across multiple live pages

## Pre-Mainnet Deployment Verification

Deploy-time configuration checks to run against the mainnet deployment before
it is treated as live. These are separate from the surface-freeze and
external-audit gates above:

- `FlorinToken.deployer` == the expected deployer EOA; `FlorinToken.deployerMintRenounced` == `true` after minter setup; `FlorinToken.totalSupply()` == the expected genesis allocation; every registered minter is an intended allocation contract.
- `AttestationCoordinator.core` == the deployed `FigaroCore` address.
- `MembersRegistry.registrationDeposit` / `.withdrawalCooldown` and `ClauseRegistry.registrationDeposit` == the mainnet values picked per Task 3 (NOT the devnet `0.001 ether` / `0` placeholders). Both MembersRegistry values are immutable and cannot be corrected after deploy.
- `AssemblyRegistry.registrationDeposit` == the mainnet value picked per Task 3 (NOT the devnet `0.001 ether` placeholder).
- `UsageCounter.members` == the deployed `MembersRegistry` (the live-stake gate reads it), `UsageCounter.periodEnd(0..8)` == nine annual boundaries derived from `RPGF_GENESIS`, and `UsageCounter.minSellers` == 3 — these are immutable and cannot be corrected after deploy. `RpgfMinter.counter` / `.clauses` / `.assemblies` point at the deployed instances, and `.periodAmount` (45M/45M · 60M×3 · 82.5M×4 — the 15/30/55 rising-tranche grouping, ruled 2026-07-31) sums to 600M and its length is validated on-chain against `periodCount()`.
- All settlement tokens are non-rebasing and non-fee-on-transfer.
- Kleros subcourt IDs in the deployed dispute config match the target chain on klerosboard.com (Gnosis subcourt IDs differ from Ethereum mainnet) — verify before the deployment is treated as live.
- Agreement / assembly-template / profile content is pinned for durable retrieval per Task 6 — on mainnet via sovereign per-party pinning (Option 3), never only a single Kubo node — and is fetchable by CID across the 6-year (5 + 1) retrieval-availability floor.
- Test-helper flags unset in the deploy build: `NEXT_PUBLIC_ENABLE_TEST_HELPERS`, `NEXT_PUBLIC_USE_TEST_SIGNER`, `NEXT_PUBLIC_TEST_PRIVATE_KEY`, `NEXT_PUBLIC_DEV_ADDRESS` must all be unset (else `?e2e=mock` / the injected test signer inline into the bundle). This is now enforced at build time: `frontend/next.config.mjs` ABORTS a `NODE_ENV=production` build with any of these set unless `FIGARO_ALLOW_TEST_HELPERS=1` (the escape only the Playwright e2e build sets). Confirm the CDN build runs without that escape.
- `public/_headers` CSP/HSTS set is applied at the CDN — verify at the hosting layer (cannot be checked from the repo tree). The CSP ships `'unsafe-inline'` for scripts (a static export cannot do per-request nonces); it is NOT an XSS/exfil backstop — XSS safety rests on React auto-escaping, enforced by `scripts/lint-no-dangerous-html.sh`. The script-hash hardening that removes `'unsafe-inline'` is the standing next step (`public/_headers` documents it).
- `next` npm advisories are static-export-INAPPLICABLE (this deploy ships no Next server: `output:'export'`, no middleware/rewrites/RSC-server/Server-Actions). They are build-host hygiene, NOT runtime blockers — do not conflate with the wagmi-2 gate (Task 7.2), which IS runtime-reachable. A patched 14.2.x bump is advisable for the build host.
- Ecosystem-agent tier (`ecosystem-agents/`) ships ONLY behind a sandboxed signer runtime — the F4/F5/F6 requirements those specs document are requirements ON a runtime that does not yet exist. Until it does, `figaro-operator` (raw `Bash` + an ambient signing key + attacker-authorable on-network content it ingests) is a prompt-injection → wallet-theft risk; the guarantee is behavioral-only. This is a SEPARATE release gate on shipping the agent tier, not a frontend gate (frontend+SDK security audit, 2026-07-23).
- The IPFS gateway the app resolves `ipfs://` documents through MUST be a DIFFERENT origin than the app itself. An affixed consent/criteria document may be pinned as `text/html` (`ipfsService.ts` `ALLOWED_FILE_TYPES`); on click-through the gateway serves it and any script runs in the GATEWAY origin — harmless while that is a separate origin, an app compromise if the app is ever served same-origin as its gateway (audit 2026-07-23).
- Wallet-security screening: drive one real commit signature through MetaMask against the live deployment and confirm no Blockaid "deceptive request" flag on the EIP-712 request (legitimate contracts get false-flagged — Kleros's escrow did); if flagged, file the MetaMask/Blockaid false-positive report and re-verify before launch. (Surfaced 2026-06-12: the universal Anvil default-deployer addresses tripped the list on devnet; devnet now deploys from a randomized throwaway key.)

## Freeze Notice — Solidity Surface Frozen for External Audit

**Initial freeze**: 2026-04-20. **Latest amendment (2026-08-03)**: the frozen scope was
extended to `src/protocol/usage/`, `src/protocol/verifier/`, and `src/rpgf/` — the
witness-rebuilt batch path and the ratified-uniform RPGF surface — closing Task 8's
re-establishment; their audit-fix churn ended 2026-08-01 and the whole audited Solidity
surface is now one scope. Earlier amendments landed a pre-audit findings batch (florin allocation restructured, `MerkleAirdrop`/`TrancheVesting` deleted, `DOMAIN_SEPARATOR()` getter, `totalRegisteredCap` enforcement); revised the `MembersRegistry` surface (dropped `role` from `register` + `MemberRegistered`, added `updateProfile`, removed `SellerRole` / `InvalidRole`, lockstep update to `FigaroBatchVerifier.SellerEventInput`); expanded the frozen-scope declaration to add `IClauseValidator.sol`, `AssemblyRegistry.sol`, `ProcessOffsetReceipt.sol`; and closed the post-resolve commit gate (`FigaroCore.commit`'s sub-order branch reverts `ProcessAlreadyResolved` when `ps.activeOrderCount == 0`; Rust prover mirrors; `DESIGN_DECISIONS.md` item #1 rewritten). A further amendment (2026-07-30) landed the batch-usage bridge's deploy consequences in both scripts: `UsageCounter` and `FigaroBatchVerifier` now reference each other, so they deploy as an ADJACENT PAIR with the verifier's address predicted from the deployer nonce and ASSERTED (`require(... == predictedVerifier)`) — a wrong prediction fails the deploy rather than producing a counter no verifier can write to. `UsageCounter` gains a `_batchVerifier` constructor arg, `FigaroBatchVerifier` a `_usageCounter` arg, and the genesis state root gains a fourth leg (the RPGF usage state) — the deployed root is asserted equal to the Rust `KernelState::compute_root()` on the empty state, since a mismatch would mean no batch could ever settle. An earlier amendment (2026-07-03) removed `ProcessOffsetReceipt.sol` from scope — the carbon-offset apparatus was deleted (no on-network retirement router exists on the deployment chain; see `CONTRACTS.md`). Amendment history is in `git log`; current frozen scope is below.

The following Solidity surface is declared frozen for external audit.
No feature changes, refactors, or dependency upgrades will be made to
these directories during the audit window. Any edit requires either a
narrow follow-up review or a repeat audit decision.

### Frozen scope

Paths follow the 2026-07-27 directory reorganisation (`CONTRACTS.md` § header — the
directory IS the tier map); the frozen *contracts* are unchanged by the move.

| Directory / file | Contents |
|---|---|
| `src/kernel/` | `FigaroCore.sol`, `CommitmentTypes.sol` |
| `src/protocol/registries/` | `ClauseRegistry.sol`, `MembersRegistry.sol`, `AssemblyRegistry.sol` |
| `src/protocol/coordinators/` | `AttestationCoordinator.sol`, `IRoleResolver.sol`, `WitnessSwapAndCommitCoordinator.sol` (amendment 2026-08-18, maintainer-ruled: landed 2026-07-12 after the freeze and was never listed nor deployed publicly — deployed alone onto Sepolia that day; `script/DeploySwapCoordinator.s.sol` joins the scripts row) |
| `src/protocol/usage/` | `UsageCounter.sol` |
| `src/protocol/verifier/` | `FigaroBatchVerifier.sol`, `ISP1Verifier.sol` |
| `src/rpgf/` | `RpgfMinter.sol` |
| `src/florin/` | `FlorinToken.sol`, `IFlorinMinter.sol` |
| `script/Deploy.s.sol` | Devnet deploy (defines the devnet surface) |
| `script/DeployMainnet.s.sol` | Mainnet deploy (defines the audited mainnet surface; deploys the swap coordinator since 2026-08-18) |
| `script/DeploySwapCoordinator.s.sol` | The swap coordinator alone onto a LIVE stack (Sepolia 2026-08-18; the mainnet route is `DeployMainnet.s.sol`) |

The Task-8 re-establishment landed 2026-08-03: `src/protocol/usage/`,
`src/rpgf/`, and `src/protocol/verifier/` entered the frozen scope after the
RPGF/data-seam audit's fix waves closed (their last Solidity edits, 2026-08-01,
were all scoped audit-finding fixes — the churn the freeze was waiting out).
The whole audited Solidity surface is now one frozen scope.

### Explicitly out of scope (not frozen)

- `src/mocks/` — test helpers, never deployed to mainnet
- `src/echidna/` — fuzzing harnesses, never deployed to mainnet
- `test/`, `frontend/`, `sdk/` — non-Solidity surfaces

### Verifying a freeze

To verify a file is unchanged from the freeze commit:

```bash
git diff c7f85d0d -- src/ src/florin/ script/Deploy.s.sol script/DeployMainnet.s.sol
```

Expected output: empty.

Post-stamp record (2026-08-13, same day): `script/Deploy.s.sol` received a
`forge fmt` line-rewrapping in the first-CI alignment wave (CI's pinned
formatter check covers `test/` + `script/`, which the local pre-commit glob
had not) — formatting only, no token-level change; recorded here per the
Post-Audit Policy rather than slipped through.

Post-stamp record #2 (2026-08-13, evening — a CONFIG change, maintainer-ruled):
the RPGF exclusion list shrank from three entries to one — the mandatory pair
(`figaro-commerce`, `figaro-topology`) now EARNS for its author-of-record (the DAO
treasury, which registers exactly the mandatory clauses — Task 13); only `figaro-assembly-provenance`
stays excluded (attribution plumbing). Scope: both deploy scripts' `excluded`
arrays + comment-only NatSpec in `UsageCounter.sol`; no contract bytecode changed.
Formal re-run per the Post-Audit Policy, all green: Foundry 301/301 (fork suite
included), Halmos 32/32, Certora 6/6 specs (`--wait_for_results`, run URLs in
`VERIFICATION_MAP.md` §10). Doctrine record: memory
`project_dao_endowment_ruling_2026_08_13`; paper §4/§9 revised the same day.

**STAMPED 2026-08-13: the freeze commit is `c7f85d0d`**
(`c7f85d0dd79298d1add2623993cc60b21321fed3`, 2026-08-12) — the last commit touching the
frozen scope; the stamp never moves again. Frozen-scope commits after the 2026-08-04
formal-suite runs, classified at stamping: `827fafe2` (2026-08-05) is the one
non-comment contract change — the mechanical `artifact`→`clauseOrAssembly` identifier
rename (110 code lines across UsageCounter, FigaroBatchVerifier, RpgfMinter, the
registries, both deploy scripts); `8548552f` (2026-08-11) touched only the devnet
`script/Deploy.s.sol` (coverage/Yul stack fixes, no deployed-contract change); the
rest (`bd4642bb`, `772fbda0`, `0cc275e2`, `c7f85d0d`) are comment-only. Because the
rename post-dates the 2026-08-04 hand-run results, the full formal suite is re-run at
the stamp; fresh run records live beside each method in `VERIFICATION_MAP.md`.

### Handover Checklist for the Auditor

| Document | Purpose |
|---|---|
| `docs/DESIGN_DECISIONS.md` | The catalogued intentional patterns that look like vulnerabilities (read first; count them there, never quote a stored number) |
| `docs/VERIFICATION_MAP.md` | Every invariant → code → test → formal layer |
| `docs/RELEASE_READINESS.md` (this file) | Gate criteria, remaining tasks, frozen scope |
| `docs/SCALING_STRATEGY.md` | Proof-based scaling, batch sequencer architecture, and what the sequencer is trusted for (consolidated from former `BATCH_SEQUENCER.md` + `SEQUENCER_TRUST_MODEL.md`) |

**Behaviors to surface to the auditor** (correct by design, but non-obvious — flag
them so a reviewer does not spend time re-deriving they are intentional):

- `FlorinToken.renounceDeployerMint()` emits NO event (the state is readable via
  `deployerMintRenounced`; the renounce is a one-way latch, not an event source).
- `FlorinToken.registerMinter` treats `cap == 0` as the "not a minter" sentinel — a
  minter registered with a zero cap is indistinguishable from an unregistered one.
- The kernel has an unreachable `expectedCumulativeValue ∈ (max/3, max/2]` window (bond
  math would overflow above it; it cannot be reached because a prior order's bond would
  have reverted first).
- A blacklisted seller (a token that reverts transfers to that address) bricks
  `resolveProcess` for the whole process — `FigaroCore.sol:294`; accepted (the buyer
  chose the token and the seller), a token-choice concern, not a kernel escape hatch.
- `FigaroCore.sol:238-240` — the multisig-vs-ECDSA note: the kernel recovers an ECDSA
  signer, so a smart-contract-wallet (multisig) party cannot be a kernel party directly;
  it transacts through an EOA it controls (the off-protocol auxiliary pattern).

The AI-audit history is provided for context only. The external auditor
should form their own independent findings.

### Post-Audit Policy

Any Solidity edit after the freeze commit must be:

1. Explicitly scoped to a specific finding or accepted-risk item
2. Reviewed by the original auditor or a qualified substitute
3. Recorded in the backlog with finding reference and outcome
4. Followed by a full formal-suite re-run (Certora + Halmos), not just Foundry —
   a signature change silently orphans any CVL spec that calls it, and the break
   is invisible until the gate actually runs (2026-08-03 instance: the 07-30
   usage-bridge amendment added `settleBatch`'s `BatchUsageData` parameter and
   `BatchVerifierTokenOps.spec` stopped type-checking, unnoticed for four days)

Changes to `test/`, `frontend/`, or `sdk/` do not require
re-audit unless they expose a new on-chain attack surface.

## Freeze Notice — Frontend + SDK Surface Frozen for Security Audit

**FREEZE LIFTED 2026-07-22.** The security audit this freeze was declared for is
complete: eight domains audited (findings independently verified), all findings
ruled and fixed with regressions, the three deferred items closed (Permit2
swap-confirm, abandoned-key sweep, the JS+Rust ReDoS conformance fix), the
ecosystem-agent specs hardened, and the full devnet e2e green (37/37). Frontend
and SDK are now open for feature work again. Post-audit hygiene: a change that
exposes a NEW client-side trust-boundary surface (a new untrusted-content render
path, a new signing path, a new coordination-channel message type) warrants a
scoped re-review against the eight domains — not a full re-freeze. The freeze
record below is retained for history.

**Freeze**: 2026-07-22 at commit `79b4e728`. This is the FE/SDK sibling of the
Solidity external audit above, which excludes these surfaces by declaration.
Open-world places the trust boundary in the client — the frontend is a static
export with zero server routes; it renders permissionless, attacker-authored
network state (clause specs, member metadata, agreements, XMTP messages) and is
the what-you-see-is-what-you-sign surface. The audit covers eight domains:
signing integrity, dispatch-race/RFQ market formation, untrusted-content
rendering, IPFS content-integrity, the ECDH/XMTP coordination channel,
client-side key material, app hardening + supply chain, and the
ecosystem-agent tier.

### Frozen scope

| Directory | Contents |
|---|---|
| `frontend/` | The static-export client — routes, components, `lib/`, `shared/`, `public/_headers` |
| `sdk/` | `@figaro/sdk` — all five subpath exports |
| `ecosystem-agents/` | Public ecosystem-agent specifications |

### Not freeze violations

- New clause specs in `clauses/` plus their lockstep Layer-A entries — witness
  data flowing through the generic pipeline, not engine changes.
- Test additions that pin an audit finding as a regression spec, after the
  finding is ruled.
- Fixes for ruled audit findings, each scoped to its finding (same post-audit
  policy as the Solidity freeze).

### Verifying the freeze

```bash
git diff 79b4e728 -- frontend/ sdk/ ecosystem-agents/
```

Expected output: empty, minus edits admitted under "Not freeze violations."