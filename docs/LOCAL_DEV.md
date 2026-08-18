# Local Development

Everything needed to run, test, and deploy Figaro locally. CLAUDE.md holds the
discipline; this file holds the commands, env vars, and service/script
inventories. The `scripts/lint-claude-md.sh` env-var and deploy-script drift
guards read from this file.

---

## Commands

```bash
# --- Contracts (Foundry) — --via-ir required; default profile fails on stack depth ---
forge test --via-ir

# --- Symbolic / formal / fuzz ---
./scripts/test-halmos.sh      # Halmos symbolic execution (z3). Prereq: brew install z3 && pipx install halmos
./scripts/test-echidna.sh     # Echidna property fuzzing.       Prereq: brew install echidna
./scripts/test-tla.sh         # TLA+ (46 invariants / 4 models — see TESTING.md § TLA+). Prereq: Java 11+ (script auto-fetches tla2tools.jar)
./scripts/test-certora.sh     # Certora (paid cloud). Prereq: pip install certora-cli ; export CERTORAKEY=...
                              #   Prelude: scripts/lint-token-ops.sh gates certora/token-ops.inventory
cd prover && cargo test       # Rust prover workspace. Prereq: SP1 toolchain (cargo prove); without it,
                              #   cargo test -p figaro-clause -p figaro-kernel (host-only crates, = prover-ci)
                              #   against every ERC20 transfer call site in src/.

# Direct Halmos invocation (single contract)
FOUNDRY_PROFILE=halmos halmos --contract HalmosFigaroCore \
  --solver-timeout-assertion 5m --solver z3

# --- Frontend ---
cd frontend && npm run dev               # Dev server
cd frontend && npm run type-check
cd frontend && npx vitest run            # UI logic — component + unit tier
cd frontend && npm run test:e2e:mobile   # responsive/viewport chrome
cd frontend && npm run test:e2e:devnet   # e2e — real UI against Anvil + contracts
cd frontend && E2E_CHAIN=sepolia SMOKE_SELLER_KEY=0x… SMOKE_BUYER_KEY=0x… npx playwright test --project=sepolia   # the Sepolia smoke (funded keys; TESTING.md § projects)
                                         #   webServer = prod build on :3100 (~90 s). Kill :3100 after FORCE_REDEPLOY
                                         #   or app-code edits (stale baked build); PLAYWRIGHT_WEB_MODE=dev for HMR iteration.

# --- SDK ---
cd sdk && npm test
cd sdk && npm run build                  # tsc → dist/
cd sdk && npm run lint                   # tsc --noEmit

# --- Deploy to local Anvil ---
./scripts/devup.sh                       # ⭐ one-shot, idempotent: clean-rebuilds sdk/dist, ensures Anvil + IPFS, deploys the protocol
./scripts/devdown.sh                     # the inverse: stops Anvil + Kubo (and ONLY those). KEEP_IPFS=1 leaves Kubo pinning
# …or the individual steps it wraps:
./scripts/deploy-local.sh                # deploys the stack AND pins+anchors clauses (incl. mandatory commerce/topology) — self-sufficient
./scripts/deploy-mainnet.sh              # MAINNET wrapper for script/DeployMainnet.s.sol — refuses without MAINNET_DEPLOY_CONFIRM=yes + all env vars + chain-id 1 read-back; never run casually
./scripts/deploy-sepolia.sh              # SEPOLIA wrapper for script/DeploySepolia.s.sol — same guard structure (SEPOLIA_DEPLOY_CONFIRM=yes + chain-id 11155111 read-back); SKIP_VERIFY=1 for the Anvil-fork rehearsal only
./scripts/deploy-swap-coordinator.sh     # deploy WitnessSwapAndCommitCoordinator ALONE onto a LIVE public stack (script/DeploySwapCoordinator.s.sol): FIGARO_CORE from the chain's record, PERMIT2 canonical, SWAP_ROUTER = Uniswap SwapRouter02 probed by BEHAVIOUR (factory()/WETH9() must be contracts); merges the three addresses into deployments/<chainId>.json; SKIP_VERIFY=1 = fork rehearsal (record diverted). Sepolia: deployed 2026-08-18
./scripts/check-sp1-gateway-route.sh     # both wrappers' Guard 4 (also standalone): SP1_VERIFIER_GATEWAY must ROUTE the proof form (SP1_PROOF_MODE groth16|plonk) for the sp1-sdk version prover/Cargo.lock pins — read live from the gateway + Succinct's sp1-contracts; fails closed offline
```

Full harness inventory (file lists, property names, rule counts) → `TESTING.md`.

---

## Deployment scripts (`script/`)

- `script/Deploy.s.sol` — devnet (Anvil); uses mock verifier and mock tokens. The wrapper deploys from a RANDOMIZED throwaway deployer (funded from anvil[0]) so contract addresses are per-machine unique — the universal Anvil-default addresses trip MetaMask/Blockaid threat lists ("deceptive request" on the commit signature). Explicit `PRIVATE_KEY` env overrides (testnet/mainnet path). Mints MOCK/permit tokens to anvil[0..19] explicitly.
- `script/DeployMainnet.s.sol` — mainnet; no mocks; reads all sensitive params from env (`PRIVATE_KEY`, `FOUNDER_WALLET`, `SUPPORTERS_WALLET`, `DAO_WALLET`, `SP1_VERIFIER_GATEWAY`, `SP1_PROGRAM_VKEY`, `RPGF_GENESIS`, `SWAP_ROUTER` = Uniswap SwapRouter02 on the chain — probed for behaviour; `PERMIT2` defaults to the canonical address). Deploys the kernel, all three registries (Clause / Members / Assembly), BOTH coordinators (attestation + the swap-funded on-ramp `WitnessSwapAndCommitCoordinator`, added 2026-08-18 — it had been omitted since it landed 2026-07-12), `FigaroBatchVerifier`, then FlorinToken with UsageCounter + RpgfMinter registered at genesis (400M founder/supporters/DAO genesis mint, then deployer-mint renounce). No match pool: a round is not a genesis contract.
- `script/DeploySepolia.s.sol` — Sepolia; mirror of `DeployMainnet.s.sol` with exactly ONE testnet divergence (`MockTreasuryMultisig` deployed as the DAO wallet — mock-as-code, mainnet Safe = config). Real yearly periods + 28d cooldown: the weekly compression was reverted 2026-08-14 — Sepolia is the public incremental release; compressed-time rehearsal is devnet's job. Env contract = mainnet's minus `DAO_WALLET` (so `SWAP_ROUTER` too — Sepolia's SwapRouter02 `0x3bFA…48E`).
- `script/MintTokens.s.sol` — utility: mint test tokens to existing devnet accounts.

`forge script` is harness-denied; deploy via the `.sh` wrappers, not by calling `forge script` directly.

---

## Docker-hosted services

Four project tools run in Docker, not natively on the host. **Convention:
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

- **IPFS (Kubo).** Pins member profiles, catalogues, agreements, uploaded media via `lib/shared/ipfsService.ts`. Endpoint `http://127.0.0.1:5001`; image `ipfs/kubo:v0.42.0` (pinned — `latest` at 0.40.1 segfaulted in its DHT reprovider; upgrade deliberately, container `figaro-ipfs` runs with `--restart unless-stopped`). Kubo's default CORS needs the dev origin allowlisted + a restart before pinning works.
  - **Native Kubo (no Docker) — required on macOS the current Docker Desktop no longer supports (e.g. Ventura 13.x).** Docker Desktop ≥ the macOS-14 cutoff won't install on Ventura, and the last Ventura-compatible build's VM wedged under sustained pinning. `devup.sh` uses *anything listening on :5001* (`nc -z`), so run Kubo natively instead: `brew install ipfs` (Kubo 0.42.0, same version); init a repo at a dedicated path so a stale `~/.ipfs` can't interfere — `export IPFS_PATH="$HOME/.ipfs-figaro"; ipfs init`; allowlist the dev origins — `ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://localhost:3000","http://127.0.0.1:3000","http://localhost:3100","http://127.0.0.1:3100"]'` + `Access-Control-Allow-Methods '["POST","GET","OPTIONS"]'`; then run it detached and **offline** (no DHT ⇒ no reprovider stalls; every devnet CID is local anyway) — `IPFS_PATH="$HOME/.ipfs-figaro" nohup ipfs daemon --offline > /tmp/figaro-ipfs-native.log 2>&1 &`. `devup`/`devdown` reference the `figaro-ipfs` Docker container by name but do not require it when :5001 is already served natively; take a native daemon down by killing that process, not `devdown.sh`.
- **Mythril.** Symbolic execution via `scripts/mythril-docker.sh` (image `mythril/myth`). Opportunistic, not in the standard test loop.
- **GraphQL indexing (subgraph).** `graph-node` + Postgres stack when a subgraph indexer is being exercised. Opportunistic; no subgraph artifacts currently in the repo.
- **LaTeX → PDF.** No in-repo LaTeX targets — the paper corpus is web-native (`/papers/<slug>` pages); the `paper/` folder was removed (2026-05-28). The `texlive/texlive` image (`pdflatex -interaction=nonstopmode`, two-pass for `\Cref` / citations) remains the way to build any ad-hoc or git-restored `.tex`; no native LaTeX on the host.

---

## Environment variables (`.env.local` in `frontend/`)

```
# Kernel + core registries
NEXT_PUBLIC_FIGARO_CORE=0x...
NEXT_PUBLIC_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_ATTESTATION_COORDINATOR=0x...
NEXT_PUBLIC_CLAUSE_REGISTRY=0x...
NEXT_PUBLIC_MEMBERS_REGISTRY=0x...
NEXT_PUBLIC_ASSEMBLY_REGISTRY=0x...

# Swap-and-commit funding (composition) — the coordinator plus its Permit2 and
# swap venue. Devnet: MockWitnessPermit2 + MockUniversalRouter (deploy-local.sh
# writes all three; the mock quotes from its own rate, no quoter). Sepolia +
# mainnet: canonical Permit2 + Uniswap SwapRouter02 (the coordinator approves
# the router and it pulls by ERC-20 allowance — SwapRouter02's shape, not the
# Universal Router's) + QuoterV2 for the frontend's quotes. The frontend
# DERIVES which venue the router is by probing it (lib/composition/swapVenue.ts).
NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR=0x...
NEXT_PUBLIC_PERMIT2=0x...
NEXT_PUBLIC_SWAP_ROUTER=0x...
NEXT_PUBLIC_SWAP_QUOTER=

# Multisender — batch dispersal for post-settlement fiscal routing. Devnet:
# MockDisperse (mirrors Disperse.app's verified interface); mainnet: the
# canonical Disperse deployment (0xD152f5…2150, same address across chains)
NEXT_PUBLIC_MULTISENDER=0x...

# The florin + the RPGF distribution. UsageCounter records verified usage of
# each clause or assembly as it happens; the minter (registered at genesis) pays each tranche pro
# rata from a closed accrual period. Nothing is posted, bonded, or challenged,
# so there is no arbitrator address.
NEXT_PUBLIC_FLORIN_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_USAGE_COUNTER=0x...
NEXT_PUBLIC_RPGF_MINTER=0x...
NEXT_PUBLIC_DAO_TREASURY=0x...

# No match-pool / quadratic-funding address: MatchPool and all QF were deleted
# (2026-07-29 — the 300M DAO funds public goods by discretionary decision, not a
# crowd/match mechanism). The 600M RPGF pays uniform pro rata on real usage.

# Batch-settlement proof path (FigaroBatchVerifier; MockSP1Verifier accepts
# any proof on devnet — a real deployment wires Succinct's SP1 verifier
# gateway + the program vkey via DeployMainnet's SP1_VERIFIER_GATEWAY /
# SP1_PROGRAM_VKEY env)
NEXT_PUBLIC_BATCH_VERIFIER=0x...

# Batch-settlement RELAY the frontend READS batched trade from (prover/sequencer,
# or any other relay). Deliberately EMPTY: settling a batch is permissionless, so
# a relay is one publisher among any number and there is no default endpoint of
# ours. Unset = batched trade is unreadable here, which /audit states plainly.
# Readers can override it per-browser (the client-side endpoint override read
# by readUserEndpoints()). Nothing a relay publishes is
# trusted: lib/audit/batchRelay.ts re-derives every struct, signature and payout
# and anchors the batch's state root on chain before rendering it.
NEXT_PUBLIC_BATCH_RELAY_URL=

# Wallet + dev helpers — injected-only (Task 7.2, 2026-08-03): RainbowKit has
# no wagmi-3 support, so the wallet-provider fallback is the bare injected()
# connector; there is no WalletConnect project id to configure.
NEXT_PUBLIC_ENABLE_TEST_HELPERS=true   # devnet only

# Chain reads — public networks only. NEXT_PUBLIC_RPC_URL is the DEFAULT read
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
# the DEVNET build only; empty = dev) or `production` (TESTNET and MAINNET — the
# testnet rehearses mainnet's network). Anything else is refused at first use. The
# dev-only installation housekeeping runs only on `dev`.
NEXT_PUBLIC_XMTP_ENV=

# Managed pinning service — DEPLOY BUILDS ONLY (testnet tier, RELEASE_READINESS
# Task 6.1). Presence of the JWT switches ipfsService add/unpin to a
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
(The former `EVIDENCE_DISPLAY_FRAME_ANCESTORS` env var and the frontend
middleware that read it were removed with the migration.)
