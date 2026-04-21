# Figaro Protocol — Frontend

Next.js 14 (App Router) frontend for the Figaro Protocol runtime, builder surfaces, and institution prototypes.
TypeScript, Tailwind CSS, wagmi v2, viem v2, RainbowKit v2.

This frontend should be treated primarily as the runtime and authoring surface for composed institutions.
Concrete archetypes such as Eats may be rendered here as institution assemblies, and may also exist in downstream repos when service-layer specialization or independent product iteration is useful.

When in doubt, interpret this frontend as the shared runtime surface for many
institution assemblies, not as a single-purpose app shell. Archetypes such as
Eats are concrete packaged expressions of that runtime, not the full definition
of what the frontend is for.

For the current documentation map, start with [../docs/v5/CURRENT_STATE.md](../docs/v5/CURRENT_STATE.md). This file is primarily a local-development quickstart and a legacy implementation overview, not the canonical architecture inventory.

## Quick Start

```bash
cd frontend
npm install
```

### 2. Configure Environment

Copy the example environment file and update with your values:

```bash
cp .env.local.example .env.local
```

Get a WalletConnect Project ID from [https://cloud.walletconnect.com/](https://cloud.walletconnect.com/)

### 3. Deploy Contracts (Local Network)

In a separate terminal, start a local Ethereum node and deploy contracts:

```bash
# From project root
anvil  # Start local node

# In another terminal
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
```

Copy the deployed contract addresses to your `.env.local` file.

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Run Devnet E2E

```bash
npm run test:e2e:devnet
```

The devnet test command now performs a preflight against `http://127.0.0.1:8545` before Playwright starts. It fails fast if `.env.local` points at contracts that do not exist on the current Anvil chain, which usually means you need to rerun `./deploy-local.sh` from the repo root and restart the frontend.

## Usage Guide

### Creating Orders

1. **Connect Wallet**: Click "Connect Wallet" in the header
2. **Select Order Type**:
   - **Linear**: Simple chain (A → B → C)
   - **Fork**: One parent, multiple children (A → [B, C])
   - **Merge**: Multiple parents, one child ([A, B] → C)
3. **Fill Order Details**:
   - Buyer address (your address for testing)
   - Seller address
   - Cumulative Value (total value through process tree)
   - Payment (value added at this step)
4. **Click "Create Order"**: Transaction will be sent to your wallet

### Understanding Bonds

The **Bond Calculator** shows real-time bond calculations:

- **Seller Bond**: 2× Cumulative Value (progressive collateral)
- **Buyer Bond**: 2× Payment (local collateral)
- **Total Locked**: Sum of both bonds

This asymmetric bonding creates a Nash equilibrium where cooperation is optimal.

### Resolving Orders

1. Navigate to **Active Orders** section
2. Only the **buyer** can resolve their orders
3. Click **Resolve** button for an active order
4. Confirm transaction in wallet
5. Funds distributed:
   - Seller receives: `sellerBond + payment`
   - Buyer receives: `buyerBond - payment`

### Graph Visualization

The order graph shows:
- **Yellow nodes**: Active orders (locked bonds)
- **Green nodes**: Resolved orders (funds distributed)
- **Animated edges**: Active process tree connections
- **Node details**: Buyer, seller, values, and bonds

## Architecture

### Tech Stack

- **Next.js 14**: React framework with app router
- **TypeScript**: Type-safe development
- **Wagmi + Viem**: Ethereum interactions
- **RainbowKit**: Wallet connection UI
- **React Flow**: Graph visualization
- **Zustand**: State management
- **Tailwind CSS**: Styling

### File Structure

```
frontend/
├── app/
│   ├── page.tsx          # Main dashboard
│   ├── layout.tsx        # Root layout
│   ├── providers.tsx     # Web3 providers
│   └── globals.css       # Global styles
├── components/
│   ├── OrderGraph.tsx    # Graph visualization
│   ├── OrderControls.tsx # Order creation/resolution
│   ├── BondCalculator.tsx# Bond computation
│   ├── TokenBalances.tsx # Balance display
│   ├── ProtocolStats.tsx # Protocol statistics
│   └── ui/               # Reusable UI components
├── lib/
│   ├── contracts.ts      # Contract ABIs
│   ├── wagmi.ts          # Wagmi configuration
│   ├── store.ts          # Zustand store
│   └── utils.ts          # Utility functions
└── package.json
```

## Testing Scenarios

### Scenario 1: Linear Chain (Alice → Bob → Charlie)

1. **Order #1**: Alice (buyer) ← Bob (seller)
   - Cumulative: 10 ETH, Payment: 10 ETH
   - Bonds: Bob 20 ETH, Alice 20 ETH
2. **Order #2**: Alice (buyer) ← Charlie (seller)
   - Cumulative: 12 ETH, Payment: 2 ETH
   - Bonds: Charlie 24 ETH, Alice 4 ETH
3. **Resolve Order #1**: Alice approves Bob's work
4. **Resolve Order #2**: Alice approves Charlie's delivery

### Scenario 2: Diamond Pattern (Fork + Merge)

1. **Order #1**: Alice ← Bob (10 ETH)
2. **Order #2**: Alice ← Charlie (5 ETH) [parallel to Order #1]
3. **Order #3**: Alice ← Dave (15 ETH cumulative) [merges #1 + #2]
   - Dave bonds 30 ETH (2× 15 ETH cumulative)
   - If Dave fails, Bob and Charlie must coordinate to fix

### Scenario 3: Coordination Pressure Test

1. Create multiple orders with same buyer
2. Observe total locked bonds increasing
3. See how seller bonds grow progressively
4. Test resolution - only buyer can unlock funds
5. Observe token conservation (contract balance = locked bonds)

## Key Concepts

### Asymmetric Bonding

```
Seller Bond = 2 × Cumulative Value
Buyer Bond = 2 × Payment

Why?
- Seller risk compounds with chain position
- Buyer risk stays local
- Creates Nash equilibrium
```

### Progressive Collateralization

As orders chain together, seller bonds grow geometrically:
- Position 1: 2×P₁
- Position 2: 2×(P₁ + P₂)
- Position 3: 2×(P₁ + P₂ + P₃)

This ensures deep-chain coordination.

### Token Conservation

Invariant: `Contract Balance ≥ Sum(Active Bonds)`

The frontend displays solvency status:
- ✓ Solvent: Contract can cover all bonds
- ✗ Insolvent: Critical error (should never happen)

## Development

### Type Checking

```bash
npm run type-check
```

### Create An Assembly Template

```bash
npm run create:assembly -- --name "Figaro Returns" --slug figaro-returns --class reference-returns --level 2 --register --dry-run
```

To scaffold from an existing assembly instead of a blank template:

```bash
npm run create:assembly -- --from figaro-procurement --name "Figaro Returns" --slug figaro-returns --class reference-returns --level 2 --register --dry-run
```

To rename copied identifiers during clone mode:

```bash
npm run create:assembly -- --from figaro-procurement --name "Figaro Returns" --slug figaro-returns --class reference-returns --level 2 --rename-role supplier:vendor --rename-mechanism fulfillment-coordinator:returns-coordinator --register --dry-run
```

To unregister an assembly later:

```bash
npm run create:assembly -- --slug figaro-returns --unregister --dry-run
```

To unregister and delete the authored assembly document in one step:

```bash
npm run create:assembly -- --slug figaro-returns --unregister --delete-file --dry-run
```

Clone mode keeps the source institution's mechanism, role, module, and capability structure, while rewriting top-level identity fields and common slug-bound fields for the new institution.

This helper writes a new authored assembly JSON file under `lib/shared/assemblies/` and, when `--register` is provided, updates `lib/shared/institutionAssembly.ts` so the derived manifest and registry pick it up automatically.

Use `--dry-run` first to inspect the generated document before writing it.

For the implemented authoring, parsing, validation, and registry flow, see `ASSEMBLY_AUTHORING.md`.

### Builder Authoring Studio

There is now an interactive authoring route at `/builders/authoring`.

It supports:

1. blank drafts
2. clone-from-registered assembly drafts
3. per-section JSON editing
4. live derived-institution preview
5. JSON export
6. publish and register into the workspace
7. unregister from the workspace, optionally deleting the authored JSON document

The route uses the same parser, validation, and derived builder workspace as the registered prototype flow.

Recommended path:

1. open `/builders/authoring`
2. clone an existing assembly or start blank
3. edit metadata and section JSON
4. confirm the live preview and draft readiness panel
5. export JSON if you want to inspect the exact document
6. publish and register when ready

### Linting

```bash
npm run lint
```

### Build Production

```bash
npm run build
npm run start
```

## Troubleshooting

### "Contract not found" error

- Ensure contracts are deployed to local network
- Update `.env.local` with correct addresses
- Restart development server

### "Insufficient allowance" error

- Approve token spending for Figaro contract
- Check token balance
- Ensure you have enough for bonds

### Graph not updating

- Check browser console for errors
- Verify contract events are being emitted
- Refresh page to reset state

### Wallet connection issues

- Ensure WalletConnect Project ID is set
- Try different wallet (MetaMask, WalletConnect, etc.)
- Check network - should be on localhost/hardhat

## Contributing

This frontend demonstrates the Figaro protocol design. To contribute:

1. Test different order patterns
2. Report UI/UX issues
3. Suggest improvements for visualization
4. Validate game theory mechanics

## License

MIT
