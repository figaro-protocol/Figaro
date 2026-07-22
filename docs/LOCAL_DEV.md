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
./scripts/test-tla.sh         # TLA+ (24 invariants / 3 models). Prereq: Java 11+ (script auto-fetches tla2tools.jar)
./scripts/test-certora.sh     # Certora (paid cloud). Prereq: pip install certora-cli ; export CERTORAKEY=...
                              #   Prelude: scripts/lint-token-ops.sh gates certora/token-ops.inventory
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
```

Full harness inventory (file lists, property names, rule counts) → `TESTING.md`.

---

## Deployment scripts (`script/`)

- `script/Deploy.s.sol` — devnet (Anvil); uses mock verifier and mock tokens. The wrapper deploys from a RANDOMIZED throwaway deployer (funded from anvil[0]) so contract addresses are per-machine unique — the universal Anvil-default addresses trip MetaMask/Blockaid threat lists ("deceptive request" on the commit signature). Explicit `PRIVATE_KEY` env overrides (testnet/mainnet path). Mints MOCK/permit tokens to anvil[0..19] explicitly.
- `script/DeployMainnet.s.sol` — mainnet; no mocks; reads all sensitive params from env. Deploys the kernel + protocol contracts + FlorinToken (400M founder/DAO genesis mint, then deployer-mint renounce). No proof/batch path — it was removed in the teardown.
- `script/MintTokens.s.sol` — utility: mint test tokens to existing devnet accounts.

`forge script` is harness-denied; deploy via the `.sh` wrappers, not by calling `forge script` directly.

---

## Docker-hosted services

Four project tools run in Docker, not natively on the host. **Convention
(re-ruled 2026-07-09): the agent runs the testing stack end to end — Anvil,
Kubo, and the frontend server included — starting/stopping/restarting as
testing needs; the user keeps Docker Desktop alive.** The agent's duty is
transparency: report what it started, on which port, and how to take it down.
Mechanism caveat: processes started via `run_in_background` may be reaped by
the harness — start long-lived services detached through the repo's own
scripts (`devup.sh` starts Anvil detached → `/tmp/figaro-anvil.log`) or as
Docker containers (which outlive the spawning shell), never as opaque
one-off daemons. **Taking it down is one command: `./scripts/devdown.sh`** —
the inverse of `devup.sh`, stopping Anvil + Kubo and nothing else. It reports
a stray `:3100` rather than killing it (that may be a Playwright run in
flight) and never touches `:3000` (yours).

- **IPFS (Kubo).** Pins seller profiles, catalogues, agreements, uploaded media via `lib/shared/ipfsService.ts`. Endpoint `http://127.0.0.1:5001`; image `ipfs/kubo:v0.42.0` (pinned — `latest` at 0.40.1 segfaulted in its DHT reprovider; upgrade deliberately, container `figaro-ipfs` runs with `--restart unless-stopped`). Kubo's default CORS needs the dev origin allowlisted + a restart before pinning works.
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
NEXT_PUBLIC_SELLER_REGISTRY=0x...
NEXT_PUBLIC_ASSEMBLY_REGISTRY=0x...

# Swap-and-commit funding (composition) — the coordinator plus its Permit2 and
# swap venue. Devnet: MockWitnessPermit2 + MockUniversalRouter (deploy-local.sh
# writes all three); mainnet: canonical Permit2 + the real Uniswap Universal Router.
NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR=0x...
NEXT_PUBLIC_PERMIT2=0x...
NEXT_PUBLIC_SWAP_ROUTER=0x...

# The florin + the optimistic RPGF distribution (minter registered at genesis;
# the arbitrator is the composed bond-settlement forum — MockArbitrator on
# devnet, a real arbitration-provider adapter elsewhere)
NEXT_PUBLIC_FLORIN_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_RPGF_MINTER=0x...
NEXT_PUBLIC_RPGF_ARBITRATOR=0x...
NEXT_PUBLIC_DAO_TREASURY=0x...

# The no-custody donation rail for crowd-steered match rounds (a genesis
# singleton like the registries; match pools are per-round, deployed by
# whoever opens a round — the /rounds page reads the pool's own rail)
NEXT_PUBLIC_DONATION_RAIL=0x...

# Batch-settlement proof path (FigaroBatchVerifier; MockSP1Verifier accepts
# any proof on devnet — a real deployment wires Succinct's SP1 verifier
# gateway + the program vkey via DeployMainnet's SP1_VERIFIER_GATEWAY /
# SP1_PROGRAM_VKEY env)
NEXT_PUBLIC_BATCH_VERIFIER=0x...

# Wallet + dev helpers
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
NEXT_PUBLIC_ENABLE_TEST_HELPERS=true   # devnet only

# IPFS — used by ipfsService.ts + sellerBranding.ts. Defaults target local Kubo; any IPFS-API/gateway endpoint works (Pinata, web3.storage, self-hosted).
NEXT_PUBLIC_IPFS_API_URL=http://127.0.0.1:5001
NEXT_PUBLIC_IPFS_GATEWAY_URL=http://127.0.0.1:8080
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
