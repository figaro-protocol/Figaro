# Development Guide

This is the current V5 local-development path for the live runtime and kernel.
It reflects the repo as it exists now: `FigaroCore`, mechanism modules,
frontend runtime, and FIG token contracts are all deployed by the same local
stack bootstrap.

## Happy Path

### 1. Start Anvil

```bash
anvil
```

Expected default endpoint:

- RPC: `http://127.0.0.1:8545`
- Chain ID: `31337`

### 2. Deploy the full local stack

```bash
./deploy-local.sh
```

What this does:

- runs `forge script script/Deploy.s.sol:Deploy --broadcast`
- deploys `FigaroCore`, `AttestationCoordinator`, `SchemaRegistry`,
  `OperatorRegistry`, `DutchAuction`, `FigToken`, `FigEmission`, both
  `FigTimeLock` contracts, `MockToken`, and `MockPermitToken`
- registers the reference schemas in `SchemaRegistry`
- writes contract addresses to `frontend/.env.local`
- writes the same deployment manifest to `.deployments/local.json`

Optional overrides:

```bash
RPC_URL=http://127.0.0.1:8545 ./deploy-local.sh
PRIVATE_KEY=0x... ./deploy-local.sh
```

### 3. Install frontend dependencies

```bash
cd frontend
npm install
```

### 4. Start the frontend runtime

```bash
cd frontend
npm run dev
```

Expected local app URL:

- `http://localhost:3000`

## Validation Commands

### Contracts

```bash
forge test
```

Current live baseline:

- 11 suites
- 182 tests

### Frontend build

```bash
cd frontend
npm run build
```

### Frontend unit tests

```bash
cd frontend
npx vitest run
```

### Browser tests

Mock mode:

```bash
cd frontend
npx playwright test --project=mock
```

Devnet mode:

```bash
cd frontend
npx playwright test --project=devnet
```

Devnet assumes:

- Anvil is running
- `./deploy-local.sh` has already written the local addresses

## Environment Files

`./deploy-local.sh` is the canonical source for local contract addresses.

Files it updates:

- `frontend/.env.local`
- `.deployments/local.json`

`frontend/.env.local.example` is only a template. After a fresh local deploy,
the generated `frontend/.env.local` should be treated as the source of truth.

## Practical Notes

- Do not rely on archived V3 or V4 deploy notes when booting the live stack.
- `deploy-local.sh` already deploys the FIG token contracts; there is no
  separate `--with-fig` mode in the current local flow.
- After changing any frontend env vars manually, restart `npm run dev`.
- Prefer `forge test` over `forge clean && forge test`; use cache unless you
  are explicitly debugging stale artifacts.
