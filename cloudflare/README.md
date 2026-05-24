# Cloudflare deployment layer

This directory holds the Cloudflare-side infrastructure for the Figaro private beta. The Figaro repo proper is the application; this directory is what runs in front of it on Cloudflare's edge and what serves as the backing chain.

## Architecture

```
                        figaroprotocol.com
                             │
                             ▼
                    ┌─────────────────┐
                    │  CF DNS / Cert  │
                    └─────────────────┘
                             │
                             ▼
            <opaque-subdomain>.figaroprotocol.com
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌───────┐      ┌───────────┐  ┌─────────┐
        │ /     │      │ /rpc      │  │ <other> │
        │  gate │      │ rpc-proxy │  │  404    │
        │worker │      │  worker   │  └─────────┘
        └───┬───┘      └─────┬─────┘
            │ pass-through   │ proxy
            ▼ (if session    ▼
        ┌───────────┐      ┌──────────────────┐
        │ CF Pages  │      │ CF Container     │
        │ (Next.js  │      │ Anvil + state.json│
        │  app)     │      └──────────────────┘
        └───────────┘
```

Two Workers and one Container:

- **`workers/gate`** — code-redemption + session establishment. Validates `?code=…`, mints a session in KV, sets a cookie, hands off to the Pages app. Without a valid session, every request to the subdomain returns the access-code form. The cookie is the only authentication for the rest of the stack.
- **`workers/rpc-proxy`** — JSON-RPC method allowlist + contract-address allowlist. Forwards approved RPC calls to the backing Anvil container and rejects everything else. Blocks `eth_getCode`, `debug_*`, `anvil_*`, and any `eth_call` to a non-allowlisted address. Without this Worker, the kernel bytecode is one decompile away from public.
- **`anvil-container`** — Docker image running `anvil --state /data/state.json`. State persists across restarts. State resets between cohorts are a `rm /data/state.json && restart` operation.

## Deployment runbook

Three components, deployed in sequence. Each has its own README for the gritty details.

### 0. One-time setup (~30 minutes)

```bash
# Install Wrangler if you don't have it.
npm i -g wrangler
wrangler login

# Authenticate Docker for the Cloudflare Container registry.
wrangler containers login
```

### 1. Provision KV namespaces (~5 minutes)

The gate Worker uses two KV namespaces (`CODES`, `SESSIONS`); the RPC proxy uses one (`CONTRACT_ALLOWLIST`). Create them once:

```bash
cd cloudflare
wrangler kv:namespace create CODES
wrangler kv:namespace create SESSIONS
wrangler kv:namespace create CONTRACT_ALLOWLIST
```

Each command returns an `id`. Paste the returned IDs into the corresponding `wrangler.toml` files (see `workers/*/wrangler.toml` for the exact placeholder lines).

### 2. Build and push the Anvil container (~5 minutes)

```bash
cd anvil-container
docker build -t figaro-anvil:latest .
wrangler containers push figaro-anvil:latest
```

The image is now available in your Cloudflare account; the rpc-proxy Worker pulls it in by tag (set in `workers/rpc-proxy/wrangler.toml`).

### 3. Deploy the rpc-proxy Worker (~2 minutes)

```bash
cd ../workers/rpc-proxy
npm install
wrangler deploy
```

This deploys the Worker and binds it to the Anvil container instance. State persistence requires a Durable Object volume — see `workers/rpc-proxy/README.md` for the exact wrangler.toml shape.

### 4. Deploy the gate Worker (~2 minutes)

```bash
cd ../gate
npm install
wrangler deploy
```

### 5. Wire up DNS (~5 minutes)

In your Cloudflare dashboard, point the opaque subdomain (e.g., `q7m4-2026.figaroprotocol.com`) at the gate Worker. Add a route in the Worker dashboard for `<subdomain>/*` → `figaro-gate` and `<subdomain>/rpc` → `figaro-rpc-proxy`. The order matters: the more-specific `/rpc` route must be evaluated before the catch-all `/*`.

### 5.5 Deploy the mock Kleros stack on Anvil (~2 minutes)

The /dispute UI exercises the full Kleros submission flow end-to-end. On private testnet there is no real Kleros stack, so the testnet uses a Solidity mock that mimics the ArbitrableProxy interface. Same UI code path; mainnet flips the env vars to point at real Kleros.

```bash
# From the repo root, against the running Anvil container:
forge script --via-ir \
  --rpc-url <anvil-rpc-url> \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast \
  script/DeployMockKleros.s.sol:DeployMockKleros
```

The script prints the deployed addresses. Set them in the frontend env (Cloudflare Pages dashboard or `.env.local` for local dev):

```bash
NEXT_PUBLIC_KLEROS_ARBITRABLE_PROXY=<MockKlerosArbitrableProxy address>
NEXT_PUBLIC_KLEROS_ARBITRATOR_EXTRA_DATA=0x   # any value; mock ignores it
NEXT_PUBLIC_KLEROS_MOCK_BANNER=true            # shows "TESTNET — simulated" banner on /dispute
```

Then add the proxy address to the rpc-proxy Worker's `CONTRACT_ALLOWLIST`:

```bash
wrangler kv:key put --namespace-id=<ALLOWLIST_ID> \
  "0x<mock-proxy-lowercased>" \
  '{"name":"MockKlerosArbitrableProxy","deployedAt":"2026-04-29","note":"testnet mock"}'
```

To simulate a ruling (for UI-state testing), the operator can call the mock-only `mockSetRuling` method:

```bash
cast send <MockKlerosArbitrableProxy> \
  'mockSetRuling(uint256,uint256)' <localID> <rulingValue> \
  --rpc-url <anvil-rpc-url> \
  --private-key $DEPLOYER_PRIVATE_KEY
```

For mainnet (later): unset `NEXT_PUBLIC_KLEROS_MOCK_BANNER` and point `NEXT_PUBLIC_KLEROS_ARBITRABLE_PROXY` at the real Kleros proxy on Ethereum mainnet. Same UI code; same flow; real arbitration on the other end.

### 6. Issue the first access code (~1 minute)

```bash
cd ../gate
wrangler kv:key put --namespace-id=<CODES_ID> "PUT-CODE-HERE" '{"issuedAt":"2026-04-29","note":"first beta participant"}'
```

The first beta participant visits `https://<subdomain>.figaroprotocol.com/?code=PUT-CODE-HERE`. The gate Worker redeems the code, sets a session cookie, and redirects to the Next.js app served by Pages.

## What's NOT in this directory

- The Next.js app itself (lives in `frontend/` in the parent repo). Deploy via `wrangler pages deploy frontend/.next` or via the Cloudflare Pages dashboard's Git integration.
- Contract deployment scripts (live in `script/` in the parent repo). Run `./scripts/deploy-local.sh` against the Anvil container's RPC endpoint to populate it.
- The actual access codes (out of scope — the Project Operator generates and distributes them privately).

## Why this exists in code, not just a backlog item

Future contributors to this project will find this directory before they find the backlog. The Workers are commented; the Dockerfile is documented; the README has a runbook. Cloudflare-layer intent is now part of the codebase rather than tribal knowledge.

If you change the architecture (e.g., move to Fly.io for the chain, swap CF for Vercel), update this directory in the same change. The code is the documentation; the documentation is the code.
