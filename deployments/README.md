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
  "batchVerifier": "0x..."
}
```

A public deployment's record carries only the contracts
`script/DeployMainnet.s.sol` actually deploys — no devnet mocks
(`MockERC20`, `MockPermitToken`, the swap/permit2 mocks, `MockTreasuryMultisig`,
`MockDisperse`). `scripts/deploy-mainnet.sh` writes `deployments/1.json` in
this shape as part of a mainnet deploy.

## Status today

Nothing is here yet — Figaro has not made a public deployment. The `/spec`
page's "Canonical deployments" section currently states this in prose
(hand-maintained network/chain-ID/status table); Ethereum mainnet is listed
as "Pending external audit."

## What changes at first public deploy

This directory becomes the **source of truth** for public-network addresses,
committed per deploy (`deployments/<chainId>.json`). `/spec` and any other
surface that needs to publish or read canonical addresses should read from
here rather than repeat them in prose — the same discipline
`.deployments/local.json` already follows for the devnet (`docs/LOCAL_DEV.md`
documents the local record; `sdk/README.md` documents the record's key → SDK
mapping — `addressesFromDeploymentRecord`).
