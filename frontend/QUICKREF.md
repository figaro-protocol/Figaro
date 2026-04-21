# Figaro Frontend - Quick Reference

This is a local validation cheat sheet. For the current runtime architecture
and active documentation path, start with [../docs/v5/CURRENT_STATE.md](../docs/v5/CURRENT_STATE.md).

## 🚀 Setup (1 minute)

```bash
# From project root
./setup-local.sh

# Update WalletConnect Project ID in frontend/.env.local
# Then:
cd frontend && npm run dev
```

Open http://localhost:3000

## 📝 Key Addresses (Anvil Local)

```
Account 0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  Private: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
  
Account 1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
  Private: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

Account 2: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
  Private: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
```

## 🎯 Quick Tests

### Linear Chain (2 minutes)
```typescript
Order 1: You → Seller1, cumValue=10, payment=10
Order 2: You → Seller2, cumValue=12, payment=2
Resolve both → Observe bond growth (20→24)
```

### Diamond Pattern (3 minutes)
```typescript
Order 1: You → SellerA, cumValue=10, payment=10
Order 2: You → SellerB, cumValue=5, payment=5
Order 3: You → SellerC, cumValue=15, payment=0, parents=[1,2]
Observe: Seller C bonds 30 (2×15 merged value)
```

## 📊 Bond Formula

```
Seller Bond = 2 × Cumulative Value (progressive)
Buyer Bond  = 2 × Payment (local)
Total       = Seller Bond + Buyer Bond
```

**Example**: 
- Cumulative: 10 ETH → Seller bonds 20 ETH
- Payment: 2 ETH → Buyer bonds 4 ETH
- Total locked: 24 ETH

## 🔧 Common Commands

```bash
# Start Anvil
anvil --port 8545

# Deploy contracts
forge script script/Deploy.s.sol --broadcast --rpc-url http://localhost:8545

# Frontend dev server
cd frontend && npm run dev

# Type check
npm run type-check

# Build production
npm run build

# Kill Anvil
kill $(lsof -t -i:8545)
```

## 🎨 UI Components

```typescript
<OrderControls />      // Create/resolve orders
<OrderGraph />         // React Flow visualization
<BondCalculator />     // Real-time bond math
<TokenBalances />      // Balance monitoring
<ProtocolStats />      // Dashboard stats
```

## 📡 Contract Interactions

### Create Order
```typescript
writeContract({
  address: figaroAddress,
  abi: FIGARO_ABI,
  functionName: "processOrders",
  args: [[], [output]],
});
```

### Resolve Order
```typescript
writeContract({
  address: figaroAddress,
  abi: FIGARO_ABI,
  functionName: "processOrders",
  args: [[input], []],
});
```

### Read Order
```typescript
// Use the narrow getters in V3. You can call them individually or via a batched multicall.
useReadContract({
  address: figaroAddress,
  abi: FIGARO_ABI,
  functionName: "getOrderCore",
  args: [orderId],
});

// Also fetch amounts/flags/location as needed:
useReadContract({ functionName: "getOrderAmounts", args: [orderId] });
useReadContract({ functionName: "getOrderFlags", args: [orderId] });
useReadContract({ functionName: "getOrderLocation", args: [orderId] });
```

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Contract not found | Update `.env.local` with deployed addresses |
| Wallet won't connect | Get WalletConnect Project ID |
| "Not buyer" error | Only order buyer can resolve |
| Graph not showing | Refresh page, check console |
| Insufficient balance | Mint more test tokens |

## 📦 State Management

```typescript
// Zustand store
const orders = useOrderStore(state => state.orders);
const addOrder = useOrderStore(state => state.addOrder);
const activeOrders = useOrderStore(state => state.getActiveOrders());
const totalLocked = useOrderStore(state => state.getTotalLockedBonds());
```

## 🎯 Validation Checklist

- [ ] Asymmetric bonding (2× formulas work)
- [ ] Progressive collateralization visible
- [ ] Only buyer can resolve (access control)
- [ ] Token conservation (balance = bonds)
- [ ] Solvency maintained
- [ ] DAG structures work
- [ ] Graph scales to complex chains
- [ ] Griefing is irrational (buyer loses)

## 🔗 Links

- Frontend README: [frontend/README.md](README.md)
- Usage Guide: [frontend/USAGE.md](USAGE.md)
- Protocol Theory: [THEORY.md](../docs/v5/THEORY.md)
- Test Summary: [TEST_SUMMARY.md](../TEST_SUMMARY.md)

## 💡 Tips

1. **Use Bond Calculator** before creating orders
2. **Check Token Balances** for solvency verification
3. **Watch Graph** for visual confirmation
4. **Test with small amounts** first
5. **Import test accounts** to simulate multi-party

## 🚨 Remember

- This is a **validation tool** for protocol design
- Current runtime quick reference for local validation and operator-path testing
- Local network only (no testnet/mainnet)
- Use test accounts only (never real private keys)

---

**Questions?** Check [USAGE.md](USAGE.md) for detailed scenarios, [README.md](README.md) for local setup, or [../docs/v5/CURRENT_STATE.md](../docs/v5/CURRENT_STATE.md) for the active documentation map.
