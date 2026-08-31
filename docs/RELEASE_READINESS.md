# Release Readiness

Status: the open work between here and the public releases — the testnet line
(live, rehearsing mainnet) and the Ethereum mainnet release. TODO tasks only:
closed work is deleted in the session that closes it, and `git log` is the history.
The external-audit handover — freeze notice + stamp, post-audit policy, the
validation-command gate, accepted risks — is `docs/AUDITOR_HANDOVER.md`.

## Deployment Targets

The public deployment target is **Ethereum mainnet**.
**Polygon** is a possible additional deployment. A **Cairo rewrite** of the contracts
(Starknet) is planned as a later line of work. Testnet rehearses the mainnet deployment
(testnet = mainnet rehearsal); chain-coupled compositions resolve against these targets —
Kleros courts are live on Ethereum mainnet.

## Current Verdict

Public release is blocked on exactly one gate: the final external audit pass against
the frozen surface (Task 2). Everything else below is deploy-day work or sequenced
behind that gate.

## Open Tasks

Task numbers are stable; missing numbers are closed tasks — `git log` has each.

### Task 2: Run The Final External Audit Pass

1. choose the auditor or audit process
2. hand over the frozen Solidity surface and active docs (`docs/AUDITOR_HANDOVER.md`)
3. resolve findings or explicitly accept non-critical findings in writing
4. state the final audit outcome in the release docs

### Task 3 (residue): state the mainnet γ-curve point

The registry parameters are hardcoded in `script/DeployMainnet.s.sol` (reasoning
inline; derivation in `/papers/substrate-broadening-rpgf` §7). Before the mainnet
broadcast: re-measure `g` — the marginal cost of one fabricated resolved process,
batch path — on the target chain, and state the deployment's point on the γ curve
where the release facts are kept.

### Task 6: Mainnet content durability

- **Sovereign per-party pinning (Option 3).** Shift durability to the parties: each
  publishing wallet's client pins what it publishes, so no single operator holds
  availability — no central pinning dependency in the mainnet trust
  model. (The testnet tier rides the managed pinning service through the
  `ipfsService` deploy-build adapter — env vars in `docs/LOCAL_DEV.md`.)
- **Retrieval-availability floor: 6 years, user-extensible.** An agreement must stay
  fetchable by its CID for the longest plausible dispute/audit window, anchored to
  the tax-audit horizon (~5 audit years + 1 declaration year). The window varies by
  jurisdiction, so 6 years is a floor, not a fixed term — each agreement carries a
  per-party option to extend.

### Task 7: Testnet — the Polygon leg + the doc flip

Sepolia is live and rehearsed. Remaining:

- Polygon: the current testnet is **Amoy** (Mumbai is retired) — confirm at
  execution time, then pin chain id + RPC in the network config. After each deploy,
  /spec's per-network deployments table and the SDK's published addresses fill from
  the real deployment records — the record is the source, never hand-typed
  constants.
- Flip the device-only deployment-context statements across the repo docs (a
  maintainer act).

### Task 9: Florin treasury tail

At/after mainnet: stand up the real DAO treasury — a canonical Safe at `DAO_WALLET`
with real keys, and the threshold-ECDSA signing ceremony rehearsed on testnet first.
Devnet uses a `MockTreasuryMultisig` placeholder; mainnet is config, never code.
Who holds the treasury, and the discipline on spending it: `docs/DAO.md`.

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

### Task 13: Genesis Registration Ownership — the mainnet gate

The rule: the DAO treasury vault is the designer of record for
the **mandatory clauses only** (`figaro-commerce`, `figaro-topology`,
`figaro-assembly-provenance`) plus any clause a stranger donates under it; every
other reference clause and every reference assembly is registered by the founder's
wallet, from the founder's own balance; each member profile is registered by its
own wallet — the founder direct as a buyer-side member, the DAO under its
EIP-7702-delegated operator EOA, never the vault address (`DAO.md` § "Who holds
the treasury"). Registrar = designer of record = who the 600M reserve pays
(`RpgfMinter._isAuthor` reads `depositOf(...).registeredBy`); first-write-wins and
permanent per id. The procedure is rehearsed end to end on the testnet.

Before mainnet genesis seeding:

1. The seeding run is a WRITTEN registration plan — each id with its registrar —
   that the maintainer reviews BEFORE the first broadcast; the vault-registrar mode
   is invoked with `SEED_CLAUSES` naming exactly the mandatory three, and every
   other run uses the founder's Ledger as direct registrar.
2. Rehearse the plan on an Anvil fork with the real devices before mainnet.
3. Keep `CONTRACTS.md` § "Designer rewards", `LEXICON.md` (the vault-registrar seam),
   `DESIGNER_REWARDS.md`, and `DAO.md` in sync if the rule moves.

## Pre-Mainnet Deployment Verification

Deploy-time checks to run against the mainnet deployment before it is treated as
live. These are separate from the external-audit gate above:

- Verify the `--rpc-url` target by hand immediately before every `--broadcast` —
  neither deploy script guards `block.chainid`; the devnet script would happily
  deploy its mock stack to a public chain.
- `SP1_VERIFIER_GATEWAY` = Succinct's Groth16 gateway
  `0x397A5f7f3dBd538f23DE225B51f532c34448dA9B` with `SP1_PROOF_MODE=groth16` — the
  deploy wrappers' Guard 4 (`scripts/check-sp1-gateway-route.sh`) refuses to
  broadcast otherwise: the gateway must ROUTE the proof's form, not merely exist.
  And `SP1_PROGRAM_VKEY` recomputed from the CURRENT guest at deploy time
  (`SP1_VKEY_ONLY=1 cargo run -p figaro-prove-test --release`, or the current
  release tag's body) — any guest rebuild supersedes the pinned vkey; never reuse
  an old value.
- The genesis state root is computed, not deploy-time-verified against the Rust
  value — treat one REAL batch resolving cleanly post-deploy as the genesis-root
  proof, not the deploy transaction succeeding.
- `FlorinToken.deployer` == the expected deployer EOA; `FlorinToken.deployerMintRenounced` == `true` after minter setup; `FlorinToken.totalSupply()` == the expected genesis allocation; every registered minter is an intended allocation contract.
- `AttestationCoordinator.core` == the deployed `FigaroCore` address.
- `MembersRegistry.registrationDeposit` / `.withdrawalCooldown` and `ClauseRegistry.registrationDeposit` == the mainnet values picked per Task 3 (NOT the devnet `0.001 ether` / `0` placeholders). Both MembersRegistry values are immutable and cannot be corrected after deploy.
- `AssemblyRegistry.registrationDeposit` == the mainnet value picked per Task 3 (NOT the devnet `0.001 ether` placeholder).
- `UsageCounter.members` == the deployed `MembersRegistry` (the live-stake gate reads it), `UsageCounter.periodEnd(0..8)` == the nine annual boundaries derived from `RPGF_GENESIS`, and `UsageCounter.minSellers` == 3 — these are immutable and cannot be corrected after deploy. `RpgfMinter.counter` / `.clauses` / `.assemblies` point at the deployed instances, and `.periodAmount` (45M/45M · 60M×3 · 82.5M×4 — the 15/30/55 rising-tranche grouping) sums to 600M and its length is validated on-chain against `periodCount()`.
- Every token a process can be denominated in is non-rebasing and non-fee-on-transfer.
- **No test members on mainnet — ever.** The rehearsal
  doctrine covers procedure, not tooling: the member-registering smoke specs
  (`*.sepolia.spec.ts` — `live-order` drives the onboarding wizard and registers a
  "Smoke counter …" profile) are TESTNET-ONLY and are never pointed at mainnet.
  Mainnet verification is read-only checks plus real content by real wallets.
  Verify after any mainnet verification run: a MembersRegistry read shows no
  test-flavored member surfaced.
- Kleros subcourt IDs in the deployed dispute config match the target chain on klerosboard.com (Gnosis subcourt IDs differ from Ethereum mainnet) — verify before the deployment is treated as live.
- Agreement / assembly-template / profile content is pinned for durable retrieval per Task 6 — on mainnet via sovereign per-party pinning (Option 3), never only a single Kubo node — and is fetchable by CID across the 6-year (5 + 1) retrieval-availability floor.
- Test-helper flags unset in the deploy build: `NEXT_PUBLIC_ENABLE_TEST_HELPERS`, `NEXT_PUBLIC_USE_TEST_SIGNER`, `NEXT_PUBLIC_TEST_PRIVATE_KEY`, `NEXT_PUBLIC_DEV_ADDRESS` must all be unset (else `?e2e=mock` / the injected test signer inline into the bundle). This is now enforced at build time: `frontend/next.config.mjs` ABORTS a `NODE_ENV=production` build with any of these set unless `FIGARO_ALLOW_TEST_HELPERS=1` (the escape only the Playwright e2e build sets). Confirm the CDN build runs without that escape.
- `public/_headers` CSP/HSTS set is applied at the CDN — verify at the hosting layer (cannot be checked from the repo tree). The CSP ships `'unsafe-inline'` for scripts (a static export cannot do per-request nonces); it is NOT an XSS/exfil backstop — XSS safety rests on React auto-escaping, enforced by the maintainers' pre-commit guard battery. The script-hash hardening that removes `'unsafe-inline'` is the standing next step (`public/_headers` documents it).
- `next` npm advisories are static-export-INAPPLICABLE (this deploy ships no Next server: `output:'export'`, no middleware/rewrites/RSC-server/Server-Actions). They are build-host hygiene, NOT runtime blockers — do not conflate with runtime-reachable advisories in browser-shipped dependencies (wagmi/viem tree). A patched 14.2.x bump is advisable for the build host.
- Ecosystem-agent tier (`ecosystem-agents/`) ships ONLY behind the sandboxed signer
  runtime — **all four components must stand** (`AI_AGENT_COORDINATION.md` § the
  sandboxed signer runtime owns them): the policy signer (`@figaro-protocol/sdk/signer` —
  the key stays in its process, out-of-model gate, F1–F3), the operator pointed at the socket account,
  the data channel (`ecosystem-agents/runtime/` — framed, nonce-bounded fetches, F4 at
  the fetch boundary), and the sandbox wrapper (`run-sandboxed` — loopback-only OS
  sandbox + policy-driven egress proxy + scrubbed environment, F5/F6; deny cases
  tested on macOS). Honest residuals, named where they live: the Linux container
  variant is EXERCISED in CI on demand (`on-demand-docker.yml` Job 2, "Linux sandbox
  variant", runs the container deny cases) but never on the
  authoring host — CI-on-demand only; the read surface inside
  the sandbox is deny-listed (named secret paths), not default-denied — acceptable
  because the signing key is never on the sandboxed side at all; and `Bash` remains in
  the operator's grant *inside* the wrapper until the runtime grows typed tools. The
  gate CRITERION — no raw host shell + no ambient key + framed content — is met when
  the operator is launched through `run-sandboxed` with the signer outside; launched
  bare, the guarantee degrades to behavioral-only and the specs say so. (Separate gate
  from the frontend's, and named by the frontend+SDK security audit.)
- The IPFS gateway the app resolves `ipfs://` documents through MUST be a DIFFERENT origin than the app itself. An affixed consent/criteria document may be pinned as `text/html` (`ipfsService.ts` `ALLOWED_FILE_TYPES`); on click-through the gateway serves it and any script runs in the GATEWAY origin — harmless while that is a separate origin, an app compromise if the app is ever served same-origin as its gateway (named by the security audit).
- Wallet-security screening: drive one real commit signature through MetaMask against the live deployment and confirm no Blockaid "deceptive request" flag on the EIP-712 request (legitimate contracts get false-flagged — a Kleros contract did); if flagged, file the MetaMask/Blockaid false-positive report and re-verify before launch. (Surfaced once already: the universal Anvil default-deployer addresses tripped the list on devnet; devnet now deploys from a randomized throwaway key.)
