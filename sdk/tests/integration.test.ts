/**
 * Integration test: full SDK lifecycle against Anvil.
 *
 * Requires Anvil running at http://127.0.0.1:8545
 * Skip with: SKIP_ANVIL=1 npm test
 *
 * Flow:
 *   1. Deploy MockERC20 + FigaroCore
 *   2. Mint tokens, approve bonds
 *   3. Build commitment via SDK, sign, commit
 *   4. Fetch events via SDK, reconstruct state
 *   5. Verify bond math matches on-chain balances
 *   6. Resolve process, verify settlement
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createPublicClient, createWalletClient, http, parseAbi, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import * as fs from "node:fs";
import * as path from "node:path";

import {
    CORE_ABI,
    ERC20_ABI,
    fetchCoreEvents,
    ProcessGraph,
    buildCommitment,
    buildDomain,
    calculateBonds,
    calculateSettlement,
    OrderState,
} from "../src/index.js";
import type { FigaroAddresses } from "../src/types.js";

// ── Skip unless Anvil is reachable ──────────────────────────────────────────

const ANVIL_URL = "http://127.0.0.1:8545";
const SKIP = process.env.SKIP_ANVIL === "1";

async function anvilReachable(): Promise<boolean> {
    try {
        const res = await fetch(ANVIL_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
            signal: AbortSignal.timeout(2000),
        });
        return res.ok;
    } catch {
        return false;
    }
}

// ── Anvil pre-funded accounts ───────────────────────────────────────────────

const BUYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const SELLER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;

const buyerAccount = privateKeyToAccount(BUYER_KEY);
const sellerAccount = privateKeyToAccount(SELLER_KEY);

// ── Contract bytecode loaders ───────────────────────────────────────────────

function loadBytecode(contractPath: string): Hex {
    const repoRoot = path.resolve(import.meta.dirname, "../..");
    const artifact = JSON.parse(
        fs.readFileSync(path.join(repoRoot, "out", contractPath), "utf-8"),
    );
    return artifact.bytecode.object as Hex;
}

// ── Test suite ──────────────────────────────────────────────────────────────

describe.skipIf(SKIP)("SDK Integration (Anvil)", () => {
    const transport = http(ANVIL_URL);

    const publicClient = createPublicClient({ chain: foundry, transport });

    const buyerWallet = createWalletClient({
        chain: foundry,
        transport,
        account: buyerAccount,
    });
    const sellerWallet = createWalletClient({
        chain: foundry,
        transport,
        account: sellerAccount,
    });

    let coreAddress: Address;
    let tokenAddress: Address;
    let addresses: FigaroAddresses;
    let alive = false;

    beforeAll(async () => {
        alive = await anvilReachable();
        if (!alive) return;

        // Deploy MockERC20
        const tokenBytecode = loadBytecode("MockERC20.sol/MockERC20.json");
        const tokenHash = await buyerWallet.deployContract({
            abi: parseAbi([
                "constructor(string name, string symbol)",
                "function mint(address to, uint256 amount) external",
                "function approve(address spender, uint256 amount) external returns (bool)",
                "function balanceOf(address account) external view returns (uint256)",
            ]),
            bytecode: tokenBytecode,
            args: ["TestToken", "TT"],
        });
        const tokenReceipt = await publicClient.waitForTransactionReceipt({ hash: tokenHash });
        tokenAddress = tokenReceipt.contractAddress!;

        // Deploy FigaroCore
        const coreBytecode = loadBytecode("FigaroCore.sol/FigaroCore.json");
        const coreHash = await buyerWallet.deployContract({
            abi: CORE_ABI,
            bytecode: coreBytecode,
            args: [],
        });
        const coreReceipt = await publicClient.waitForTransactionReceipt({ hash: coreHash });
        coreAddress = coreReceipt.contractAddress!;

        addresses = {
            core: coreAddress,
            attestationCoordinator: "0x0000000000000000000000000000000000000000" as Address,
            dutchAuction: "0x0000000000000000000000000000000000000000" as Address,
            clauseRegistry: "0x0000000000000000000000000000000000000000" as Address,
        };
    }, 30_000);

    it("deploys contracts successfully", () => {
        if (!alive) return;
        expect(coreAddress).toBeDefined();
        expect(tokenAddress).toBeDefined();
    });

    it("full lifecycle: commit → reconstruct → resolve → verify", async () => {
        if (!alive) return;

        const PAYMENT = 100n * 10n ** 18n;
        // For root orders, cumulativeValue = payment after commit
        // So both bonds are 2 × payment
        const bonds = calculateBonds(PAYMENT, PAYMENT);

        // ── 1. Mint tokens to both parties ──────────────────────────────
        const MOCK_ABI = parseAbi([
            "function mint(address to, uint256 amount) external",
            "function approve(address spender, uint256 amount) external returns (bool)",
            "function balanceOf(address account) external view returns (uint256)",
        ]);

        await buyerWallet.writeContract({
            address: tokenAddress,
            abi: MOCK_ABI,
            functionName: "mint",
            args: [buyerAccount.address, bonds.buyerBond],
        }).then((h) => publicClient.waitForTransactionReceipt({ hash: h }));

        await buyerWallet.writeContract({
            address: tokenAddress,
            abi: MOCK_ABI,
            functionName: "mint",
            args: [sellerAccount.address, bonds.sellerBond],
        }).then((h) => publicClient.waitForTransactionReceipt({ hash: h }));

        // ── 2. Approve FigaroCore to spend bonds ────────────────────────
        await buyerWallet.writeContract({
            address: tokenAddress,
            abi: MOCK_ABI,
            functionName: "approve",
            args: [coreAddress, bonds.buyerBond],
        }).then((h) => publicClient.waitForTransactionReceipt({ hash: h }));

        await sellerWallet.writeContract({
            address: tokenAddress,
            abi: MOCK_ABI,
            functionName: "approve",
            args: [coreAddress, bonds.sellerBond],
        }).then((h) => publicClient.waitForTransactionReceipt({ hash: h }));

        // ── 3. Build commitment via SDK ─────────────────────────────────
        const domain = buildDomain(31337, coreAddress);
        const agreementHash = "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;

        const { commitment, typedData } = buildCommitment(
            {
                processId: "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
                buyer: buyerAccount.address,
                seller: sellerAccount.address,
                currency: tokenAddress,
                payment: PAYMENT,
                expectedCumulativeValue: PAYMENT,
                agreementHash,
            },
            domain,
        );

        // ── 4. Sign (both parties) ──────────────────────────────────────
        const buyerSig = await buyerWallet.signTypedData(typedData);
        const sellerSig = await sellerWallet.signTypedData(typedData);

        // ── 5. Commit order on-chain ────────────────────────────────────
        const commitHash = await buyerWallet.writeContract({
            address: coreAddress,
            abi: CORE_ABI,
            functionName: "commit",
            args: [commitment, buyerSig, sellerSig],
        });
        const commitReceipt = await publicClient.waitForTransactionReceipt({ hash: commitHash });
        expect(commitReceipt.status).toBe("success");

        // ── 6. Fetch events and reconstruct state via SDK ───────────────
        const events = await fetchCoreEvents(publicClient, addresses, 0n);
        const graph = new ProcessGraph();
        graph.applyEvents(events);

        // There should be exactly one process with one order
        const active = graph.getActiveProcesses();
        expect(active.length).toBe(1);

        const process = active[0];
        expect(process.rootBuyer).toBe(buyerAccount.address);
        expect(process.orders.size).toBe(1);

        const order = Array.from(process.orders.values())[0];
        expect(order.buyer).toBe(buyerAccount.address);
        expect(order.seller).toBe(sellerAccount.address);
        expect(order.payment).toBe(PAYMENT);
        expect(order.state).toBe(OrderState.Active);

        // ── 7. Verify on-chain bond balances ────────────────────────────
        const coreBalance = await publicClient.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [coreAddress],
        }) as bigint;
        // Core should hold buyerBond + sellerBond
        expect(coreBalance).toBe(bonds.buyerBond + bonds.sellerBond);

        // ── 8. Resolve process (buyer-only) ─────────────────────────────
        const resolveHash = await buyerWallet.writeContract({
            address: coreAddress,
            abi: CORE_ABI,
            functionName: "resolveProcess",
            args: [process.processId, [commitment]],
        });
        const resolveReceipt = await publicClient.waitForTransactionReceipt({ hash: resolveHash });
        expect(resolveReceipt.status).toBe("success");

        // ── 9. Verify settlement math via SDK ───────────────────────────
        const settlement = calculateSettlement(PAYMENT, bonds.sellerBond, bonds.buyerBond);
        // Buyer gets: buyerBond - payment = 2*payment - payment = payment
        // Seller gets: sellerBond + payment = 2*payment + payment = 3*payment
        expect(settlement.buyerPayout).toBe(PAYMENT);
        expect(settlement.sellerPayout).toBe(3n * PAYMENT);

        // ── 10. Verify on-chain balances post-resolution ────────────────
        const [buyerBal, sellerBal, coreBal] = await Promise.all([
            publicClient.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: "balanceOf",
                args: [buyerAccount.address],
            }) as Promise<bigint>,
            publicClient.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: "balanceOf",
                args: [sellerAccount.address],
            }) as Promise<bigint>,
            publicClient.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: "balanceOf",
                args: [coreAddress],
            }) as Promise<bigint>,
        ]);

        // Core should be empty after resolution
        expect(coreBal).toBe(0n);
        // Buyer started with buyerBond, gets back settlement.buyerPayout
        expect(buyerBal).toBe(settlement.buyerPayout);
        // Seller started with sellerBond, gets back settlement.sellerPayout
        expect(sellerBal).toBe(settlement.sellerPayout);

        // ── 11. Reconstruct post-resolution state ───────────────────────
        const events2 = await fetchCoreEvents(publicClient, addresses, 0n);
        const graph2 = new ProcessGraph();
        graph2.applyEvents(events2);

        const resolvedProcess = graph2.getProcess(process.processId);
        expect(resolvedProcess).toBeDefined();
        expect(resolvedProcess!.resolved).toBe(true);

        const resolvedOrder = Array.from(resolvedProcess!.orders.values())[0];
        expect(resolvedOrder).toBeDefined();
        expect(resolvedOrder!.state).toBe(OrderState.Resolved);
    }, 60_000);
});
