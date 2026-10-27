# Local Development

Everything needed to run, test, and deploy Figaro locally. This file holds the
commands, env vars, and service/script inventories. The maintainers'
pre-commit guard battery (private tooling) checks env-var and deploy-script
drift against this file.

---

## Commands

```bash
# --- Contracts (Foundry) — --via-ir required; default profile fails on stack depth ---
git clone --recurse-submodules <repo> && cd Figaro   # or: forge install (four lib/ submodules, pinned in foundry.lock)
foundryup --version v1.5.1                           # the version CI pins (.github/workflows/foundry-ci.yml)
forge build --via-ir
forge test --via-ir

# --- Symbolic / formal / fuzz ---
./scripts/test-halmos.sh      # Halmos symbolic execution (z3). Prereq: brew install z3 && pipx install halmos
./scripts/test-echidna.sh     # Echidna property fuzzing.       Prereq: brew install echidna
./scripts/test-tla.sh         # TLA+ (64 invariants / 5 models — see TESTING.md § TLA+). Prereq: Java 11+ and a one-time manual `tla2tools.jar` download into `formal/` (the script prints the curl and exits if absent)
(cd formal/lean && lake build) # Lean 4 equilibrium proof (see TESTING.md § Lean 4). Prereq: elan (curl elan.lean-lang.org); toolchain auto-pinned
./scripts/test-certora.sh     # Certora (paid cloud). Prereq: pip install certora-cli ; export CERTORAKEY=...
                              #   Prelude: the maintainers' pre-commit guard battery gates
                              #   certora/token-ops.inventory against every ERC20 token-moving
                              #   call site in production src/.
./scripts/test-cross-impl-fuzz.sh  # Differential fuzz under one seed: FigaroCore vs its mirror; agreement tree, three legs; clause engine, SDK vs guest
                              #   (args: [seed] [steps]; FUZZ_ROUNDS=n for n consecutive seeds).
# --- Mutation runs and the test-first proof (maintainer-side; each holds .mewt.lock and prints the gate layers the change re-runs) ---
./scripts/mewt-run.sh <target.sol> [log]            # mewt over one Solidity contract, detached
./scripts/cargo-mutants-run.sh <crate> [log] [args] # cargo-mutants over figaro-kernel or figaro-clause, in place, detached (MUTANTS_DRY_RUN=1 prints the command)
bash scripts/check-red-on-parent.sh [<commit>]      # the change's new tests fail on src/ before it (a `Red-on-parent:` trailer in the message runs it at commit-msg)
source scripts/frozen-scope.sh && gate_layers       # "full gate" or "quick layers only" for a change from the handover's baseline to HEAD
cd prover && cargo test       # Rust prover workspace. Prereq: SP1 toolchain (cargo prove); without it,
                              #   cargo test -p figaro-clause -p figaro-kernel (host-only crates, = prover-ci).

# Direct Halmos invocation (single contract)
FOUNDRY_PROFILE=halmos halmos --contract HalmosFigaroCore \
  --solver-timeout-assertion 5m --solver z3

# --- Frontend ---
cd frontend && npm run dev               # Dev server
cd frontend && npm run type-check
cd frontend && npx vitest run            # UI logic — component + unit tier
cd frontend && npm run check:paper-pdfs  # after a build: every paper PDF's text layer keeps each inline formula in its sentence (pypdf, python3 -I)
cd frontend && npm run test:e2e:mobile   # responsive/viewport chrome
cd frontend && npm run test:e2e:devnet   # e2e — real UI against Anvil + contracts
cd frontend && E2E_CHAIN=sepolia SMOKE_SELLER_KEY=0x… SMOKE_BUYER_KEY=0x… npx playwright test --project=sepolia   # the Sepolia smoke (funded keys; TESTING.md § projects)
cd frontend && npm run estate:crawl      # whole-estate residue/vocab sweep (scripts/estate-crawl.mjs): every sitemap route + machine text (/llms.txt, index.txt, /_headers) + ALL pinned contentURIs from the three registries; read-only, exit 1 on any hit; ESTATE_SKIP_PINS=1 for site-only
                                         #   crawls the LIVE deployed site by default (ESTATE_SITE_URL overrides) — no local webServer involved.

# --- SDK ---
cd sdk && npm test
cd sdk && npm run build                  # tsc → dist/
cd sdk && npm run lint                   # tsc --noEmit

# --- Deploy to local Anvil ---
./scripts/devup.sh                       # ⭐ one-shot, idempotent: clean-rebuilds sdk/dist, ensures Anvil + IPFS, deploys the protocol; on an already-deployed chain it re-runs the deploy's genesis population (clauses, agreements, reference assemblies — a key already bound is skipped). "Already deployed" is the devnet preflight passing (frontend/scripts/verify-devnet-deployment.mjs), which also requires an OPEN accrual: the devnet runs the nine annual reward periods of every public network, and each run of the rewards spec advances the chain's clock past one of them, so after nine runs every usage recording reverts AccrualClosed and the usage specs fail — the preflight refuses that chain and devup redeploys it
./scripts/devdown.sh                     # the inverse: stops Anvil + Kubo (and ONLY those). KEEP_IPFS=1 leaves Kubo pinning
# …or the individual steps it wraps:
./scripts/deploy-local.sh                # deploys the stack AND pins+anchors clauses (incl. mandatory commerce/topology), then each reference assembly's distinct agreements (one stake each; a key already registered is skipped), then the assemblies, the MockERC20 standing for their ZERO_ADDRESS currency — the Sepolia genesis on a devnet, registered by anvil[0]; no member. Self-sufficient
./scripts/deploy-mainnet.sh              # MAINNET wrapper for script/DeployMainnet.s.sol — refuses without MAINNET_DEPLOY_CONFIRM=yes + all env vars + chain-id 1 read-back; never run casually
./scripts/deploy-sepolia.sh              # SEPOLIA wrapper for script/DeploySepolia.s.sol — same guard structure (SEPOLIA_DEPLOY_CONFIRM=yes + chain-id 11155111 read-back); SKIP_VERIFY=1 for the Anvil-fork rehearsal only; FORGE_GAS_MULTIPLIER=<percent> widens forge's gas limits when the live chain's fork charges more for a creation than forge's own simulation (Glamsterdam on Sepolia: 200 lands what 130 ran out of gas on); the same knob on deploy-mainnet.sh and deploy-swap-coordinator.sh
./scripts/deploy-swap-coordinator.sh     # deploy WitnessSwapAndCommitCoordinator ALONE onto a LIVE public stack (script/DeploySwapCoordinator.s.sol): FIGARO_CORE from the chain's record, PERMIT2 canonical, SWAP_ROUTER = Uniswap SwapRouter02 probed by BEHAVIOR (factory()/WETH9() must be contracts); merges the three addresses into deployments/<chainId>.json; SKIP_VERIFY=1 = fork rehearsal (record diverted).
node scripts/check-deployment.mjs <record.json> deployments/<chainId>.expected.json [--artifacts out]   # what must hold on chain after the deploy and the genesis registration, written before them; deploy-local.sh runs it on devnet; a null expectation (undecided) fails
./scripts/check-sp1-gateway-route.sh     # both wrappers' Guard 4 (also standalone): SP1_VERIFIER_GATEWAY must ROUTE the proof form (SP1_PROOF_MODE groth16|plonk) for the sp1-sdk version prover/Cargo.lock pins — read live from the gateway + Succinct's sp1-contracts; fails closed offline; prints the routed verifier as SP1_VERIFIER, which the wrappers export and the scripts bind (the contract refuses a gateway)

# --- Public site export (the direct upload's file tree) ---
# The maintainers' private site-build script runs these four steps in order on a clean
# checkout of a named commit already on origin/main (a temporary git worktree, every
# package installed with `npm ci` from its lockfile), stops at the first failure, and
# copies the export into frontend/out/, the one tree a direct upload ships.
# After the upload, the private probe reads the new deployment's own address
# (https://<id>.figaro-protocol.pages.dev, never the domain, which the edge cache can hide behind)
# and passes only when its pages match frontend/out byte for byte.
cd frontend && env -u NEXT_DISTDIR -u FIGARO_ALLOW_TEST_HELPERS npm run build   # the site's static export → frontend/out/ (NEXT_DISTDIR unset, so the export lands in out/); its postbuild writes each paper's PDF beside its page and fails without Tectonic (§ "Paper PDFs"); a public-network build also sets NEXT_PUBLIC_CHAIN, the record's addresses and the pin key (§ Environment variables)
cd docs-site && npm run build            # the docs-site's static export → docs-site/out/ (basePath /docs; prebuild assembles the content)
rm -rf frontend/out/docs && cp -R docs-site/out frontend/out/docs   # the docs-site under the site's /docs: docs-site/out/index.html is served at /docs/
node scripts/check-export-no-personal-info.mjs frontend/out   # refuses the upload if the export carries an email, a private-list name outside a citation, or a token whose decoded JSON holds a personal field; the testnet pinning key passes only while robots.txt disallows every crawler (RELEASE_READINESS § "Public on testnet", item 5)
```

Full harness inventory (file lists, property names, rule counts) → `TESTING.md`.

---

## Deployment scripts (`script/`)

- `script/Deploy.s.sol` — devnet (Anvil); uses mock verifier and mock tokens. The wrapper deploys from a RANDOMIZED throwaway deployer (funded from anvil[0]) so contract addresses are per-machine unique — the universal Anvil-default addresses trip MetaMask/Blockaid threat lists ("deceptive request" on the commit signature). Explicit `PRIVATE_KEY` env overrides (testnet/mainnet path). Mints MOCK/permit tokens to anvil[0..19] explicitly.
- `script/DeployMainnet.s.sol` — mainnet; no mocks; reads all sensitive params from env (`PRIVATE_KEY`, `FOUNDER_WALLET`, `SUPPORTERS_WALLET`, `DAO_WALLET`, `SP1_VERIFIER` (the routed verifier the wrapper resolves on `SP1_VERIFIER_GATEWAY`), `SP1_PROGRAM_VKEY`, `RPGF_GENESIS`, `SWAP_ROUTER` = Uniswap SwapRouter02 on the chain — probed for behavior; `PERMIT2` defaults to the canonical address). Deploys the Core, all four registries (Clause / Members / Agreement / Assembly; `deployments/<chainId>.json` names `agreementRegistry` beside `assemblyRegistry`), BOTH coordinators (attestation + the swap-funded on-ramp `WitnessSwapAndCommitCoordinator`), `FigaroBatchVerifier`, then FlorinToken with UsageCounter + RpgfMinter registered at genesis (400M founder/supporters/DAO genesis mint, then deployer-mint renounce). No match pool: a round is not a genesis contract.
- `script/DeploySepolia.s.sol` — Sepolia; mirror of `DeployMainnet.s.sol` with exactly ONE testnet divergence (`MockTreasuryMultisig` deployed as the DAO wallet — mock-as-code, mainnet Safe = config). Real yearly periods + 28d cooldown: Sepolia is the public incremental release; the devnet runs the same yearly periods and a test closes one by advancing the chain's clock. Env contract = mainnet's minus `DAO_WALLET`, plus `SWAP_QUOTER`; `SWAP_ROUTER` stays required (Sepolia's SwapRouter02 is supplied via env, not defaulted).
- `script/DeploySepoliaPair.s.sol` — Sepolia, pair only: the counter↔verifier pair against the stack `deployments/11155111.json` names, run by `deploy-sepolia.sh` under `PAIR_ONLY=1` (EXISTING_* read from `deployments/11155111.json`, `EXISTING_AGREEMENT_REGISTRY` among them, `RPGF_GENESIS` derived from the live counter's `periodEnd[0]`, the file updated in place: `usageCounter`, `batchVerifier`, `programVKey`). After a pair redeploy the live `RpgfMinter` keeps the counter it was deployed with, because the florin's minter registration is renounced.
- `script/MintTokens.s.sol` — utility: mint test tokens to existing devnet accounts.

`forge script` is harness-denied; deploy via the `.sh` wrappers, not by calling `forge script` directly.

## Prover host (`scripts/prover-box/`)

The rented-machine recipe for the batch universe's relay-operator role:
provision → reproducible guest build (docker ELF + vkey) → sequencer build →
fork rehearsal → live resolve, with the laptop driving batches through
`npm run batch:drive` over an SSH tunnel. `scripts/prover-box/README.md` owns
the order of operations and the lessons (swap floor, keyed fork upstream,
`SP1_SKIP_PROGRAM_BUILD` discipline); `prover/sequencer/README.md` owns the
sequencer environment table. The usage-claim pre-filter reads one registry per
kind, so the sequencer takes `AGREEMENT_REGISTRY_ADDRESS` (env only, no flag)
beside `CLAUSE_REGISTRY_ADDRESS` and `ASSEMBLY_REGISTRY_ADDRESS`. The
pre-filter keys on the counter address, and it drops a claim whose registry
read fails — a zero registry address does not disable it.

---

## Docker-hosted services

The project tools below run in Docker — except Kubo, which is NATIVE on the
current dev host (its own bullet rules it). **Convention:
whoever runs the testing stack — a contributor or a coding agent — runs it
end to end (Anvil, Kubo, and the frontend server included),
starting/stopping/restarting as testing needs, and reports what it started,
on which port, and how to take it down.** Start long-lived services detached through the repo's own
scripts (`devup.sh` starts Anvil detached → `/tmp/figaro-anvil.log`) or as
Docker containers (which outlive the spawning shell), never as opaque
one-off daemons. **Taking it down is one command: `./scripts/devdown.sh`** —
the inverse of `devup.sh`, stopping Anvil + Kubo and nothing else. It reports
a stray `:3100` rather than killing it (that may be a Playwright run in
flight) and never touches `:3000` (the interactive dev server).

- **IPFS (Kubo).** Pins member profiles, catalogs, agreements, uploaded media via `lib/shared/ipfsService.ts`. Endpoint `http://127.0.0.1:5001`; image `ipfs/kubo:v0.42.0` (pinned — `latest` at 0.40.1 segfaulted in its DHT reprovider; upgrade deliberately, container `figaro-ipfs` runs with `--restart unless-stopped`). Kubo's default CORS needs the dev origin allowlisted + a restart before pinning works.
  - **Native Kubo (no Docker) — required where current Docker Desktop will not install (macOS Ventura 13.x).** Docker Desktop ≥ the macOS-14 cutoff won't install on Ventura, and the last Ventura-compatible build's VM wedged under sustained pinning. `devup.sh` uses *anything listening on :5001* (`nc -z`), so run Kubo natively instead: `brew install ipfs` (Kubo 0.42.0, same version); init a repo at a dedicated path so a stale `~/.ipfs` can't interfere — `export IPFS_PATH="$HOME/.ipfs-figaro"; ipfs init`; allowlist the dev origins — `ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://localhost:3000","http://127.0.0.1:3000","http://localhost:3100","http://127.0.0.1:3100"]'` + `Access-Control-Allow-Methods '["POST","GET","OPTIONS"]'`; then run it detached and **offline** (no DHT ⇒ no reprovider stalls; every devnet CID is local anyway) — `IPFS_PATH="$HOME/.ipfs-figaro" nohup ipfs daemon --offline > /tmp/figaro-ipfs-native.log 2>&1 &`. `devup`/`devdown` reference the `figaro-ipfs` Docker container by name but do not require it when :5001 is already served natively; take a native daemon down by killing that process, not `devdown.sh`.
- **Mythril.** Symbolic execution via `scripts/mythril-docker.sh` (image `mythril/myth`). Opportunistic, not in the standard test loop.
- **GraphQL indexing (subgraph).** `graph-node` + Postgres stack when a subgraph indexer is being exercised. Opportunistic; no subgraph artifacts currently in the repo.
- **LaTeX → PDF.** The paper corpus is web-native (`/papers/<slug>` pages); the site build typesets each paper's PDF from its exported page with **Tectonic**, native on the host (§ "Paper PDFs" below). The `texlive/texlive` image (`pdflatex -interaction=nonstopmode`, two-pass for `\Cref` / citations) remains the way to build any other ad-hoc or git-restored `.tex`.

### Paper PDFs — the Tectonic prerequisite

`npm run build` in `frontend/` ends with `frontend/scripts/build-paper-pdfs.mjs` (the npm `postbuild` hook, after `prettify-export.mjs`), which writes `out/papers/<slug>/<slug>.pdf` beside every exported paper page (FRONTEND.md § "Static export" owns the step). It needs:

- **Tectonic** on `PATH` (`tectonic --version`). Without it the build FAILS — no export ships a paper page with a dead PDF link. `brew install tectonic` where Homebrew has a bottle; on macOS 13 (Ventura) Homebrew has none and builds LLVM and Rust from source, so install the release binary instead: `tectonic-<version>-x86_64-apple-darwin.tar.gz` from https://github.com/tectonic-typesetting/tectonic/releases, unpacked into a directory on `PATH`. Frontend CI installs the Linux release binary, pinned by version and checksum. Tectonic fetches the TeX files it uses on its first run and caches them, so the first build needs the network.
- **Playwright's Chromium** (`npx playwright install chromium`), which renders each SVG figure to PDF.

The Playwright e2e harness build (`FIGARO_ALLOW_TEST_HELPERS=1`) skips the step. After a build, `npm run check:paper-pdfs` checks every PDF's text layer (pypdf under `python3 -I`; TESTING.md § "Frontend Vitest").

---

## Environment variables (`.env.local` in `frontend/`)

```
# The Core and the registries
NEXT_PUBLIC_FIGARO_CORE=0x...
NEXT_PUBLIC_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_ATTESTATION_COORDINATOR=0x...
NEXT_PUBLIC_CLAUSE_REGISTRY=0x...
NEXT_PUBLIC_MEMBERS_REGISTRY=0x...
NEXT_PUBLIC_AGREEMENT_REGISTRY=0x...
NEXT_PUBLIC_ASSEMBLY_REGISTRY=0x...

# Swap-and-commit funding (composition) — the coordinator plus its Permit2 and
# swap venue. Devnet: MockWitnessPermit2 + MockSwapVenue (deploy-local.sh
# writes all three; the mock quotes from its own rate, no quoter). Sepolia +
# mainnet: canonical Permit2 + Uniswap SwapRouter02 (the coordinator approves
# the router and it pulls by ERC-20 allowance — SwapRouter02's shape, not the
# Universal Router's) + QuoterV2 for the frontend's quotes. The frontend
# DERIVES which venue the router is by probing it (lib/composition/swapVenue.ts).
NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR=0x...
NEXT_PUBLIC_PERMIT2=0x...
NEXT_PUBLIC_SWAP_ROUTER=0x...
NEXT_PUBLIC_SWAP_QUOTER=

# Multisender — batch dispersal for post-resolution fiscal routing. Devnet:
# MockDisperse (mirrors Disperse.app's verified interface); Sepolia + mainnet:
# the canonical Disperse deployment (0xD152f5…2150, same address across chains),
# the deployment record's `multisender` — one of the checkout fingerprint's fields,
# so a public build without it shows no fingerprint
NEXT_PUBLIC_MULTISENDER=0x...

# The florin + the RPGF distribution. UsageCounter records verified usage of
# each clause, agreement or assembly as it happens; the minter (registered at genesis) pays each tranche pro
# rata from a closed accrual period. Nothing is posted, bonded, or challenged,
# so there is no arbitrator address.
NEXT_PUBLIC_FLORIN_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_USAGE_COUNTER=0x...
NEXT_PUBLIC_RPGF_MINTER=0x...
NEXT_PUBLIC_DAO_TREASURY=0x...

# The 300M DAO funds public goods by discretionary decision. The 600M RPGF pays
# uniform pro rata on real usage.

# Batch-resolution proof path (FigaroBatchVerifier; MockSP1Verifier accepts
# any proof on devnet; the devnet verifier pins the guest fingerprint of the
# sequencer the tree built when prover/target/release/sequencer is present,
# else a dev constant, so a relay can start against it — a real deployment
# wires the SP1 verifier the gateway routes (resolved by the deploy wrapper from
# SP1_VERIFIER_GATEWAY into SP1_VERIFIER) + the program vkey via DeployMainnet's
# SP1_VERIFIER / SP1_PROGRAM_VKEY env)
NEXT_PUBLIC_BATCH_VERIFIER=0x...

# ANALYST the data explorer (/data/explore) asks free-form questions of — an agent
# anyone runs over the public event record (ecosystem-agents/figaro-analyst.md;
# runnable at ecosystem-agents/runtime/figaro-analyst.mjs). Deliberately EMPTY:
# who hosts an analyst and pays its inference is a deployment's choice, and
# defaulting readers onto an endpoint of ours would make a convenience look like
# an authority. Unset = NO prompt box; the explorer's derived views are projected
# in the reader's own browser either way. Overridable per-reader
# (readUserEndpoints().analystUrl) — a user-run analyst is the one that can also
# read the substance that user OWNS or BOUGHT. Its /prompt route asks for the
# bearer token the analyst writes at start; the reader stores it beside their own
# endpoint (readUserEndpoints().analystToken), and it is never sent to this default.
NEXT_PUBLIC_ANALYST_URL=

# Wallet + dev helpers — injected-only: RainbowKit has
# no wagmi-3 support, so the wallet-provider fallback is the bare injected()
# connector; there is no WalletConnect project id to configure.
NEXT_PUBLIC_ENABLE_TEST_HELPERS=true   # devnet only

# Chain reads — public networks only. NEXT_PUBLIC_CHAIN selects the target chain
# ("sepolia" → Sepolia; unset → the local Anvil devnet — lib/shared/chains.ts);
# a public-network build MUST set it or the export targets Anvil.
# NEXT_PUBLIC_RPC_URL is the DEFAULT read
# endpoint (a connected wallet's provider takes over); NEXT_PUBLIC_DEPLOYMENT_BLOCK
# is where every event scan starts (the deployment record's `deploymentBlock`) —
# public gateways cap eth_getLogs ranges, so the event cache scans from here in
# adaptive chunks. Devnet leaves both unset (Anvil, block 0).
NEXT_PUBLIC_RPC_URL=
NEXT_PUBLIC_DEPLOYMENT_BLOCK=

# IPFS — used by ipfsService.ts + memberBranding.ts. Defaults target local Kubo; any IPFS-API/gateway endpoint works (Pinata, web3.storage, self-hosted).
NEXT_PUBLIC_IPFS_API_URL=http://127.0.0.1:5001
NEXT_PUBLIC_IPFS_GATEWAY_URL=http://127.0.0.1:8080
# Optional second gateway for READS: tried when the primary fails a read (non-OK
# or network error). Public deployments pair a dedicated gateway on the site's
# own pin service (primary — instant for everything that service pinned) with a
# public gateway (fallback — reaches content pinned anywhere; finds a fresh pin
# only after minutes). A user's own gateway override is the whole chain. Devnet
# leaves it unset (an EMPTY value means none).
NEXT_PUBLIC_IPFS_FALLBACK_GATEWAY_URL=

# XMTP coordination network — DEPLOYMENT CONFIG: `dev` (XMTP's public dev network;
# the DEVNET build only; empty = dev under `next dev`) or `production` (TESTNET and
# MAINNET — the testnet rehearses mainnet's network). A production `next build`
# refuses to run unless it is named (frontend/next.config.mjs; the e2e harness's
# FIGARO_ALLOW_TEST_HELPERS=1 builds excepted). Anything else is refused at first
# use. The dev-only installation housekeeping runs only on `dev`.
NEXT_PUBLIC_XMTP_ENV=

# Managed pinning service — DEPLOY BUILDS ONLY (testnet tier, RELEASE_READINESS
# Task 6). Presence of the JWT switches ipfsService add/unpin to a
# Pinata-style pinning API; a user's own endpoint override still wins; dev and
# e2e builds carry no JWT and stay on Kubo. NEVER in a checked-in env file —
# pass via the deploy command:  set -a; source ~/.figaro-deploy.env; set +a; npm run build
# NEXT_PUBLIC_IPFS_PIN_SERVICE_JWT=<scoped pin-only JWT>
# NEXT_PUBLIC_IPFS_PIN_SERVICE_API=https://api.pinata.cloud   (default)
```

The `/evidence-display` forum iframing allowlist is a **hosting/CDN-layer**
concern, not an app env var. Since the static-export migration (`output:
export`) the app runs no server middleware, so the CSP `frame-ancestors` that
lets an arbitration forum iframe `/evidence-display` is set at the edge along
with the rest of the security headers (see `docs/FRONTEND.md` § "Static
export") — the SPACE-SEPARATED list of forum origins in CSP source syntax, e.g.
`'self' https://resolve.kleros.io https://*.kleros.io`. Unset, the route admits
no third-party ancestor — a forum is deployment config, never a code default.
