# Figaro Frontend - Usage Guide

This guide walks through using the Figaro frontend to validate the protocol design through interactive visualization and testing.

## Setup

1. **Deploy locally** (from project root):
   ```bash
   ./setup-local.sh
   ```

2. **Configure wallet**:
   - Import test account to MetaMask using private key from setup output
   - Add localhost network (RPC: http://localhost:8545, Chain ID: 31337)
   - Get WalletConnect Project ID from https://cloud.walletconnect.com/
   - Update `frontend/.env.local` with your project ID

3. **Start frontend**:
   ```bash
   cd frontend
   npm run dev
   ```

4. Open http://localhost:3000

## Interface Overview

### Header
- **Figaro Protocol** branding
- **Connect Wallet** button (RainbowKit)

### Dashboard
- **Protocol Stats**: Total orders, active, resolved, locked bonds
- **Order Controls** (left panel): Create and resolve orders
- **Bond Calculator**: Real-time bond computation
- **Token Balances**: User balance, contract balance, locked bonds
- **Order Graph** (main area): Visual DAG representation

## Testing Scenarios

### Scenario 1: Simple Linear Chain

**Objective**: Validate basic order creation and resolution

1. **Create Order #1**:
   - Order Type: Linear
   - Buyer: Your address (auto-fill from wallet)
   - Seller: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
   - Cumulative Value: 10
   - Payment: 10
   - Click "Create Order"

2. **Observe**:
   - Order appears in graph as yellow (active) node
   - Seller Bond: 20 tokens (2× cumulative)
   - Buyer Bond: 20 tokens (2× payment)
   - Total Locked: 40 tokens
   - Contract balance increases by 40

3. **Create Order #2** (downstream):
   - Order Type: **Linear** (auto-sets parent to Order #1)
   - Buyer: Same address
   - Seller: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
   - Cumulative Value: 12 (10 + 2 new value)
   - Payment: 2
   - Click "Create Order"
   - **Wait for transaction to mine** (⛏️ Mining block...)
   - **Note**: Order #2 has parentOrderIds=[1], enforcing dependency

4. **Observe**:
   - Second order appears in graph
   - Seller Bond: 24 tokens (2× 12)
   - Buyer Bond: 4 tokens (2× 2)
   - Total Locked: 68 tokens (40 + 28)

5. **Resolve Orders** (CRITICAL - Test Dependency Enforcement):
   - **Try to resolve Order #2 first** → Should **FAIL** with "Parent order not resolved"
   - This proves on-chain enforcement works!
   - Navigate to "Active Orders" section
   - Click "Resolve" on Order #1
   - Wait for transaction (⛏️ Mining...)
   - Confirm transaction
   - Order #1 turns green (resolved)
   - Seller receives: 20 + 10 = 30 tokens
   - Buyer receives: 20 - 10 = 10 tokens
   - Locked bonds decrease by 40
   - **Now resolve Order #2** → Should succeed

**Validation**:
- ✅ **Coordination cascade enforced**: Cannot resolve Order #2 before Order #1
- ✅ Seller bonds grow progressively (20 → 24)
- ✅ Buyer bonds stay local (20 → 4)
- ✅ Only buyer can resolve
- ✅ Token conservation: contract balance = locked bonds
- ✅ Graph shows parent→child edges

---

### Scenario 2: Diamond Pattern (Fork + Merge)

**Objective**: Test DAG structure with parallel paths merging

1. **Create Base Order**:
   - Buyer: Your address
   - Seller A: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
   - Cumulative: 10, Payment: 10
   - Bonds: Seller 20, Buyer 20

2. **Create Parallel Order**:
   - Order Type: Fork
   - Buyer: Same address
   - Seller B: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
   - Cumulative: 5, Payment: 5
   - Bonds: Seller 10, Buyer 10

3. **Create Merge Order**:
   - Order Type: Merge
   - Buyer: Same address
   - Seller C: 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
   - Cumulative: 15 (10 + 5 merged)
   - Payment: 0 (integration work)
   - Parent Order IDs: 1,2
   - Bonds: Seller 30, Buyer 0

4. **Observe Graph**:
   - Three nodes visible
   - Two edges pointing to merge node
   - Visual representation of diamond dependency

5. **Test Coordination Pressure**:
   - Do NOT resolve Order #1 or #2
   - Observe: Order #3 (merge) cannot be resolved until parents are
   - Seller C has 30 tokens locked
   - Seller A has 20 tokens locked
   - Seller B has 10 tokens locked
   - **Total pressure: 60 tokens** forcing coordination

**Validation**:
- ✅ DAG structure visible in graph
- ✅ Progressive collateralization (10 → 30 for integrator)
- ✅ Coordination cascade: downstream depends on upstream
- ✅ If Seller C fails, ALL sellers must coordinate

---

### Scenario 3: Griefing Attack Test

**Objective**: Verify buyer accountability prevents unreasonable rejection

1. **Create Order**:
   - Buyer: Your address
   - Seller: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
   - Cumulative: 20, Payment: 20
   - Bonds: Seller 40, Buyer 40

2. **Observe Buyer's Position**:
   - Buyer has 40 tokens locked
   - Opportunity cost: Cannot use funds elsewhere
   - Reputation: On-chain record of unresolved order

3. **Test Griefing**:
   - Do NOT resolve the order
   - Wait and observe:
     - Your 40 tokens remain locked
     - No benefit to you
     - Seller's 40 tokens also locked
     - Both lose capital access

4. **Economic Analysis** (use Bond Calculator):
   - Input: Cumulative 20, Payment 20
   - Buyer Bond: 40 tokens
   - If buyer rejects maliciously:
     - Loses 40 tokens opportunity cost
     - Loses reputation (order visible on-chain)
     - Loses future business (sellers check history)
   - **Total cost > any conceivable gain**

**Validation**:
- ✅ Buyer's capital at risk (not just seller's)
- ✅ No escape hatch (no timeout refund)
- ✅ Reputation damage (on-chain visibility)
- ✅ Griefing is irrational (costs more than it hurts)

---

### Scenario 4: Multi-Step Process Tree

**Objective**: Validate complex process tree with 5+ steps

1. **Create Chain**:
   ```
   You ← Supplier1 (raw materials) → 10 ETH
   You ← Supplier2 (processing)     → 12 ETH cumulative
   You ← Manufacturer (assembly)    → 18 ETH cumulative
   You ← Distributor (logistics)    → 20 ETH cumulative
   You ← Retailer (final delivery)  → 25 ETH cumulative
   ```

2. **Observe Bond Growth**:
   - Supplier1: 20 tokens
   - Supplier2: 24 tokens
   - Manufacturer: 36 tokens
   - Distributor: 40 tokens
   - Retailer: 50 tokens
   - **Progressive increase ensures deep-chain coordination**

3. **Test Resolution Order**:
   - Try resolving out of order
   - Observe that graph structure allows flexible resolution
   - Each resolution releases specific bonds

**Validation**:
- ✅ Bonds grow geometrically
- ✅ Downstream sellers have more at risk
- ✅ Coordination cascade works across 5+ steps
- ✅ Graph visualization scales to complex chains

---

## Key Observations

### Game Theory Mechanics

1. **Asymmetric Bonding**:
   - Seller: 2× cumulative (risk compounds)
   - Buyer: 2× payment (risk stays local)
   - Creates Nash equilibrium

2. **Progressive Collateralization**:
   - Use Bond Calculator to see bond growth
   - Later-stage sellers = higher stakes
   - Automatic accountability up the chain

3. **Buyer Authority**:
   - Only buyer can resolve
   - "Resolve" button disabled for non-buyers
   - No timeout escape for sellers

### Token Conservation

Monitor **Token Balances** panel:
- User balance decreases by bonds when creating orders
- Contract balance = sum of locked bonds
- Solvency indicator: ✓ if contract balance ≥ locked bonds
- On resolution: tokens distributed according to bond formula

### Graph Visualization

Colors indicate state:
- **Yellow**: Active (bonds locked)
- **Green**: Resolved (funds distributed)
- **Animated edges**: Active process tree connections

Node details show:
- Buyer/Seller addresses
- Cumulative value vs payment
- Locked bonds (for active orders)

---

## Critical Design Notes

### Transaction Timing (Blockchain vs Web App)

**This is a DAPP, not a web app.** UI updates ONLY after blockchain confirmation:

1. **Click "Create Order"** → Shows "⏳ Sending transaction..."
2. **Transaction sent** → Shows "⛏️ Mining block..."
3. **Block mined** → Shows "✅ Order created!"
4. **Refresh page** → Order appears in UI

**Do NOT expect immediate updates**. The UI reflects blockchain state, not pending transactions.

### Parent Dependencies & Coordination

**Linear Mode** (default):
- Automatically sets `parentOrderIds = [previousOrderId]`
- Order #2 → parentOrderIds=[1]
- Order #3 → parentOrderIds=[2]
- **Enforces sequential resolution**

**Fork/Merge Modes**:
- Manually specify parent IDs: "1,2,3"
- Supports complex DAG structures
- All parents must resolve before children

**Critical**: The contract WILL REVERT if you try to resolve a child before its parents. This is on-chain enforcement, not UI validation.

### Why No ProcessId Yet?

Current limitation: Orders are tracked individually. For production:
- Need explicit processId grouping
- Batch resolution of entire processes
- Filter graph by process
- This is a known TODO for v2

---

## Common Issues

### "Only buyer can resolve"
- Ensure connected wallet matches order's buyer address
- Check Order Controls panel for your orders

### "Insufficient balance"
- Need 2× (cumulative + payment) for bonds
- Mint more test tokens if needed

### Graph not updating
- Refresh page
- Check contract events in console
- Verify transactions confirmed on chain

### Wallet connection issues
- Ensure WalletConnect Project ID is set
- Try MetaMask directly
- Verify network is localhost:8545

---

## Advanced Testing

### Stress Test: 10+ Active Orders

Create many orders to observe:
- Total locked bonds scaling
- Graph layout handling
- Contract solvency maintenance
- Gas costs at scale

### Fork Test: Multiple Parallel Suppliers

Create 3+ parallel orders (same buyer, different sellers) to validate:
- Independent bond tracking
- Parallel resolution
- Merge patterns

### Reputation Test: Buyer Behavior

Create and resolve/not resolve orders to observe:
- On-chain history visibility
- Buyer resolution rate
- Pattern recognition

---

## Validation Checklist

Use this checklist to validate protocol design:

- [ ] Asymmetric bonding works (2× cumulative vs 2× payment)
- [ ] Progressive collateralization increases with chain depth
- [ ] Only buyer can resolve orders
- [ ] Seller has no escape hatch (no timeout refund)
- [ ] Token conservation: contract balance = locked bonds
- [ ] Solvency maintained across all operations
- [ ] DAG structures (diamond, multi-level) work correctly
- [ ] Graph visualization scales to complex chains
- [ ] Griefing is economically irrational (buyer loses capital)
- [ ] Coordination cascade: downstream failure affects upstream

---

## Next Steps

After validating the design:

1. **Document Findings**: Note any UX insights or edge cases
2. **Test Alternative Scenarios**: Try non-standard order patterns
3. **Audit Preparation**: Use frontend to demonstrate invariants to auditors
4. **User Feedback**: Share with potential users for validation

---

## Support

For issues or questions:
- Check browser console for detailed errors
- Review contract events on block explorer
- Consult [THEORY.md](../docs/v5/THEORY.md) for game theory details
- See [TEST_SUMMARY.md](../TEST_SUMMARY.md) for test coverage

**Remember**: This is a validation tool. The protocol's security comes from game theory, not UI enforcement.
