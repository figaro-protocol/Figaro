# RPC Proxy Worker

JSON-RPC method allowlist + contract-address allowlist + Anvil container backing.

The structural defense for the kernel-private posture. Without this Worker, beta participants can `eth_getCode(<FigaroCore>)` and decompile the result; with it, that method is blocked at the edge and the only way to reach the chain is through approved methods on approved addresses.

## Allow / block lists

### Allowed methods

| Category | Methods |
|---|---|
| Read state | `eth_call`, `eth_estimateGas`, `eth_chainId`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getBlockByHash`, `eth_getTransactionReceipt`, `eth_getTransactionByHash`, `eth_getLogs`, `eth_gasPrice`, `eth_maxPriorityFeePerGas`, `eth_feeHistory`, `eth_getBalance`, `eth_getTransactionCount` |
| Subscribe (WS) | `eth_subscribe`, `eth_unsubscribe` |
| Write | `eth_sendRawTransaction` |
| Net | `net_version`, `web3_clientVersion` |

### Hard-blocked methods

These are the bytecode / state leakers, blocked even if added to the allowlist by mistake:

- `eth_getCode`
- `eth_getStorageAt`
- `debug_traceTransaction`
- `debug_traceCall`
- `debug_traceBlockByNumber`
- `debug_traceBlockByHash`

### Blocked namespaces

- `anvil_*` (Anvil-specific cheat methods — `anvil_setStorageAt`, `anvil_impersonateAccount`, etc.)
- `personal_*` (account management — should not reach Anvil from a participant)

## Address allowlist (CONTRACT_ALLOWLIST namespace)

For `eth_call` and `eth_estimateGas`, the Worker checks that the `to` address is in the `CONTRACT_ALLOWLIST` KV namespace. Calls to arbitrary addresses are rejected.

### Schema

- **Key:** lowercased `0x...` 40-hex address
- **Value:** JSON metadata (operator-only — clients never see this)
  ```json
  {
    "name": "FigaroCore",
    "deployedAt": "2026-04-29",
    "verified": false,
    "note": "kernel — frozen"
  }
  ```

### Operator commands

```bash
# Add the deployed FigaroCore address to the allowlist:
wrangler kv:key put --namespace-id=<ALLOWLIST_ID> \
  "0x<core-address-lowercased>" \
  '{"name":"FigaroCore","deployedAt":"2026-04-29"}'

# Add the AttestationCoordinator:
wrangler kv:key put --namespace-id=<ALLOWLIST_ID> \
  "0x<coordinator-address-lowercased>" \
  '{"name":"AttestationCoordinator","deployedAt":"2026-04-29"}'

# Repeat for each protocol-tier contract: SchemaRegistry,
# OperatorRegistry, DutchAuction, FigaroBatchVerifier, each
# schema validator, the FIG token, the RpgfMinter.

# To revoke (e.g., after redeploying a contract):
wrangler kv:key delete --namespace-id=<ALLOWLIST_ID> "0x<old-address>"
```

## Containerized Anvil

The backing chain runs as a Cloudflare Container, declared in `wrangler.toml`:

```toml
[[containers]]
class_name = "AnvilContainer"
image = "registry.cloudflare.com/<account>/figaro-anvil:latest"
max_instances = 1

[[durable_objects.bindings]]
name = "ANVIL"
class_name = "AnvilContainer"
```

The Worker accesses the container via the `ANVIL` Durable Object binding. The DO ID is fixed (`"anvil-singleton"`) so all RPC calls route to the same container instance, which holds shared chain state.

State persistence: the container's `--state /data/state.json` flag points at a Durable Object volume that survives container restarts. To wipe state for a new cohort, see `../../anvil-container/README.md`.

## Local development

```bash
npm install

# Create namespaces (preview):
wrangler kv:namespace create SESSIONS --preview
wrangler kv:namespace create CONTRACT_ALLOWLIST --preview

# Build and run the Anvil container locally:
cd ../../anvil-container && docker build -t figaro-anvil .
docker run -p 8545:8545 figaro-anvil

# In another terminal, run the Worker:
cd ../workers/rpc-proxy && wrangler dev
```

`wrangler dev` for Containers is in beta — see Cloudflare's current docs for any deviations from the standard Worker dev flow.

## Follow-ons (non-blocking for v1)

- WebSocket subscription forwarding (currently `eth_subscribe` is allowlisted but the forwarding path through the Container needs WS-specific handling).
- Per-session rate limiting (currently relies on CF's defaults).
- Method-level metrics (Sentry counters per method, useful for tuning the allowlist).
- Address-rotation playbook for live contract redeployments (currently manual: delete old key, add new key).
