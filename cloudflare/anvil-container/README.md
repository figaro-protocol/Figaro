# Anvil container

Docker image running `anvil` with state persistence. The backing chain for the Figaro beta.

## Build

```bash
docker build -t figaro-anvil:latest .
```

## Push to Cloudflare's Container registry

```bash
wrangler containers push figaro-anvil:latest
```

This makes the image available for the rpc-proxy Worker's `[[containers]]` declaration.

## Run locally (for development)

```bash
docker run --rm -p 8545:8545 -v "$(pwd)/local-state:/data" figaro-anvil:latest
```

`local-state` on your host machine persists state between runs.

Then point your wallet (or `forge script`) at `http://localhost:8545` to interact with the chain.

## Environment variables

| Variable | Default | Effect |
|---|---|---|
| `ANVIL_BLOCK_TIME_SECONDS` | `1` | Anvil block time in seconds |
| `ANVIL_CHAIN_ID` | `31337` | Chain ID for the testnet |
| `ANVIL_GAS_LIMIT` | `30000000` | Per-block gas limit |
| `ANVIL_STATE_INTERVAL_SECS` | `60` | State-dump interval |

In production, set these in `../workers/rpc-proxy/wrangler.toml` under `[[containers.environment]]`.

## State management

Anvil's `--state /data/state.json` flag handles serialization. The container:

- **Loads** state from `/data/state.json` on startup if the file exists.
- **Dumps** state periodically (`--state-interval`) and on graceful shutdown.
- **Recovers** automatically if the container restarts: state survives.

### Wiping state for a new cohort

When you want to reset the testnet (e.g., between cohorts, after schema changes that aren't backward-compatible, etc.):

```bash
# Connect to the container's persistent volume.
# In Cloudflare Containers, this is via a one-shot exec:
wrangler containers exec --class AnvilContainer --instance anvil-singleton -- rm -f /data/state.json

# Then redeploy or restart so anvil reloads with empty state.
wrangler deploy --redeploy --class AnvilContainer
```

After the reset, run `./deploy-local.sh` (or its production equivalent) against the Anvil RPC endpoint to redeploy contracts.

### Backing up state before a wipe

If you want to preserve a snapshot before resetting:

```bash
wrangler containers exec --class AnvilContainer --instance anvil-singleton -- cat /data/state.json > snapshot-2026-04-29.json
```

The snapshot is a plain JSON file; you can replay it onto a fresh Anvil with `--load-state`.

## Why anvil and not Reth / Geth dev mode

Anvil is the smallest piece of infrastructure that gives you a working EVM with state persistence and full Foundry tooling compatibility. Reth's dev mode is more "real" but has more knobs and a larger surface area; for a private beta, Anvil is the right ergonomic fit.

If you outgrow it (e.g., need realistic block production timing, mempool dynamics, or large state), swap to Reth — the rpc-proxy Worker treats the backing chain as a black-box JSON-RPC endpoint and doesn't care which client it is.

## Why Foundry's image and not a custom build

Foundry ships a maintained, signed Docker image with anvil pre-installed. Building from a smaller base (alpine + custom binary) saves ~300 MB but adds a maintenance burden. For a beta, the maintenance cost outweighs the size win.
