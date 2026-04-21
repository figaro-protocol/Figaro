#!/bin/bash

# Figaro Protocol - Local Development Setup Script

set -e

echo "🎯 Figaro Protocol - Local Development Setup"
echo "=============================================="
echo ""

# Check if running from project root
if [ ! -f "foundry.toml" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Step 1: Check if Anvil is installed
echo "📦 Step 1: Checking dependencies..."
if ! command -v anvil &> /dev/null; then
    echo "❌ Anvil not found. Please install Foundry: https://book.getfoundry.sh/getting-started/installation"
    exit 1
fi

if ! command -v forge &> /dev/null; then
    echo "❌ Forge not found. Please install Foundry: https://book.getfoundry.sh/getting-started/installation"
    exit 1
fi

echo "✅ Foundry tools found"
echo ""

# Step 2: Start Anvil in background if not running
echo "🔧 Step 2: Starting local Ethereum node..."
if lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  Port 8545 already in use. Assuming Anvil is running..."
else
    anvil --port 8545 > /dev/null 2>&1 &
    ANVIL_PID=$!
    echo "✅ Anvil started (PID: $ANVIL_PID)"
    sleep 2
fi
echo ""

# Step 3: Deploy the canonical local stack
echo "🚀 Step 3: Deploying the canonical local stack..."
echo "   deploy-local.sh writes frontend/.env.local and .deployments/local.json"
./deploy-local.sh
echo ""

# Step 5: Install frontend dependencies if needed
if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Step 4: Installing frontend dependencies..."
    cd frontend
    npm install
    cd ..
    echo "✅ Frontend dependencies installed"
else
    echo "✅ Frontend dependencies already installed"
fi
echo ""

# Print summary
echo "=============================================="
echo "🎉 Setup Complete!"
echo "=============================================="
echo ""
echo "Contract addresses written to frontend/.env.local by deploy-local.sh."
echo ""
echo "Test Accounts (with 100k TEST tokens each):"
echo "  Account 0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)"
echo "  Account 1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (10000 ETH)"
echo "  Account 2: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC (10000 ETH)"
echo ""
echo "Private Keys (for MetaMask import):"
echo "  Account 0: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
echo "  Account 1: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
echo "  Account 2: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
echo ""
echo "Next Steps:"
echo "  1. Get WalletConnect Project ID: https://cloud.walletconnect.com/"
echo "  2. Update frontend/.env.local with your project ID"
echo "  3. Import a test account to MetaMask using private key above"
echo "  4. Connect MetaMask to localhost:8545"
echo "  5. Run: cd frontend && npm run dev"
echo "  6. Open: http://localhost:3000"
echo ""
echo "To stop Anvil: kill $(lsof -t -i:8545)"
echo ""
