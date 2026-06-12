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

# --- Prover (Rust) ---
cd prover && cargo test -p figaro-kernel
cd prover && cargo test -p figaro-sequencer

# --- Deploy to local Anvil ---
./scripts/devup.sh                       # ⭐ one-shot, idempotent: ensures Anvil + IPFS, deploys protocol + Kleros
# …or the individual steps it wraps:
./scripts/deploy-local.sh
./scripts/deploy-mock-kleros.sh          # run AFTER deploy-local.sh for the Kleros mock flow
```

Full harness inventory (file lists, property names, rule counts) → `TESTING.md`.

---

## Deployment scripts (`script/`)

- `script/Deploy.s.sol` — devnet (Anvil); uses mock verifier and mock tokens.
- `script/DeployMainnet.s.sol` — mainnet; no mocks; reads all sensitive params from env. Wires `FigaroBatchVerifier` + `RpgfMinter` to a real SP1 verifier — the proof path is in the mainnet launch, not a later phase.
- `script/DeployMockKleros.s.sol` — devnet only; deploys `MockKlerosArbitrator` + `MockKlerosArbitrableProxy`. Run via `./scripts/deploy-mock-kleros.sh` after `./scripts/deploy-local.sh`.
- `script/MintTokens.s.sol` — utility: mint test tokens to existing devnet accounts.

`forge script` is harness-denied; deploy via the `.sh` wrappers, not by calling `forge script` directly.

---

## Docker-hosted services

Four project tools run in Docker, not natively on the host. **Convention: the
agent runs `docker run` / `exec` / `compose` / `restart`; the user keeps Docker
Desktop alive.** Caveat: containers started via `run_in_background` may be reaped
by the harness — long-lived services (IPFS daemon, graph-node) should be started
by the user in their own terminal, same convention as Anvil.

- **IPFS (Kubo).** Pins seller profiles, catalogues, manifests, uploaded media via `lib/shared/ipfsService.ts`. Endpoint `http://127.0.0.1:5001`; image `ipfs/kubo:latest`. Kubo's default CORS needs the dev origin allowlisted + a restart before pinning works.
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
NEXT_PUBLIC_CLAUSE_REGISTRATION_HELPER=0x...
NEXT_PUBLIC_SELLER_REGISTRY=0x...
NEXT_PUBLIC_ASSEMBLY_REGISTRY=0x...
NEXT_PUBLIC_DUTCH_AUCTION=0x...

# Carbon-offset receipts (Path A) + its devnet aggregator mock
NEXT_PUBLIC_PROCESS_OFFSET_RECEIPT=0x...
NEXT_PUBLIC_MOCK_OFFSET_AGGREGATOR=0x...

# FIG token + RPGF minter
NEXT_PUBLIC_FIG_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_RPGF_MINTER=0x...

# Batch verifier
NEXT_PUBLIC_BATCH_VERIFIER=0x...

# Dispute resolution (devnet Kleros mock — set via scripts/deploy-mock-kleros.sh)
NEXT_PUBLIC_KLEROS_ARBITRABLE_PROXY=0x...
NEXT_PUBLIC_KLEROS_ARBITRATOR_EXTRA_DATA=0x...
NEXT_PUBLIC_KLEROS_MOCK_BANNER=true

# Wallet + dev helpers
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
NEXT_PUBLIC_ENABLE_TEST_HELPERS=true   # devnet only

# IPFS — used by ipfsService.ts + sellerBranding.ts. Defaults target local Kubo; any IPFS-API/gateway endpoint works (Pinata, web3.storage, self-hosted).
NEXT_PUBLIC_IPFS_API_URL=http://127.0.0.1:5001
NEXT_PUBLIC_IPFS_GATEWAY_URL=http://127.0.0.1:8080
```
