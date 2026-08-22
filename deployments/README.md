# deployments/

The machine-readable address-publication channel for public Figaro
deployments.

## Shape

One file per network, named `<chainId>.json`, in the same shape
`.deployments/local.json` already uses for the local devnet (see
`scripts/deploy-local.sh`, which writes that file):

```json
{
  "chainId": 1,
  "figaroCore": "0x...",
  "attestationCoordinator": "0x...",
  "clauseRegistry": "0x...",
  "membersRegistry": "0x...",
  "assemblyRegistry": "0x...",
  "florinToken": "0x...",
  "usageCounter": "0x...",
  "rpgfMinter": "0x...",
  "batchVerifier": "0x...",
  "deploymentBlock": 0
}
```

`deploymentBlock` is the block the deploy script read just before
broadcasting — at or below every contract's creation block. Frontends and
agents start their event scans there (`NEXT_PUBLIC_DEPLOYMENT_BLOCK`): public
RPC gateways cap an `eth_getLogs` range (1 000 / 10 000 / 50 000 blocks by
gateway), so a from-genesis scan of a real network never completes.

A public deployment's record carries only the contracts
`script/DeployMainnet.s.sol` actually deploys — no devnet mocks
(`MockERC20`, `MockPermitToken`, the swap/permit2 mocks, `MockTreasuryMultisig`,
`MockDisperse`). `scripts/deploy-mainnet.sh` writes `deployments/1.json` in
this shape as part of a mainnet deploy.

## Status today

Sepolia is LIVE: `11155111.json` is the committed record — every address
Etherscan-verified, the site and the e2e suites read from it, and both
settlement universes have settled on the public chain (the direct-path specs
and real Groth16 batches through `FigaroBatchVerifier`). The `/spec` page's
"Canonical deployments" section renders its Sepolia rows from this record at
build time. Ethereum mainnet remains "Pending external audit" — no mainnet
record exists yet.

## Verifying the record independently

Do not take this directory's word for an address — the record is designed to be
checked from outside it:

- Every address in `11155111.json` resolves on the block explorer:
  `https://sepolia.etherscan.io/address/<address>` (verified source + ABI). The
  `/spec` page renders the same per-address explorer links from this record.
- An agent whose fetch tool the explorer blocks can verify against any RPC
  instead: `eth_getCode` at the address must return non-empty bytecode, and the
  contract's events must appear from `deploymentBlock` forward.
- The SDK that reads this record is `@figaro-protocol/sdk` on npm, published
  with a Sigstore provenance attestation binding the tarball to this
  repository — `npm audit signatures` checks it.

## The record discipline

This directory is the **source of truth** for public-network addresses,
committed per deploy (`deployments/<chainId>.json`). `/spec` and any other
surface that needs to publish or read canonical addresses reads from
here rather than repeating them in prose — the same discipline
`.deployments/local.json` already follows for the devnet (`docs/LOCAL_DEV.md`
documents the local record; `sdk/README.md` documents the record's key → SDK
mapping — `addressesFromDeploymentRecord`).

## ABIs (`abi/`)

The tracked `abi/` bundle at the repo root carries the bare ABI array for
every contract in the record shape above — the surface a non-TS integrator
needs (the TS SDK exports the same ABIs as constants). Emitted from the
forge build artifacts by `scripts/emit-abi-bundle.sh`; pre-commit's
`lint-abi-bundle.sh` fails any commit where the tracked bundle drifts from
the build, so `abi/` is always the deployed truth, never a stale copy.
