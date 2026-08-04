/**
 * Integration test: the SDK ROUND-TRIP against Anvil — the one sanctioned
 * chain-touching Vitest file (skipIf-gated). It proves SDK ARTIFACTS survive
 * a real chain: a built+signed commitment is accepted by `commit`, events
 * fetch and reconstruct, and the reconstructed commitment resolves. It
 * asserts NO kernel math — bond/settlement amounts are Foundry/Certora-owned
 * (K-1/2/3/6; SDK-mirror parity lives in the Foundry parity vectors), and
 * `calculateSettlement` is unit-tested in bonds.test.ts.
 *
 * Requires Anvil running at http://127.0.0.1:8545
 * Skip with: SKIP_ANVIL=1 npm test
 *
 * Flow:
 *   1. Deploy MockERC20 + FigaroCore
 *   2. Mint tokens, approve bonds
 *   3. Build commitment via SDK, sign, commit
 *   4. Fetch events via SDK, reconstruct state
 *   5. Resolve process from the reconstruction, reconstruct again
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createPublicClient, createWalletClient, http, parseAbi, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import * as fs from "node:fs";
import * as path from "node:path";

import {
    CORE_ABI,
    fetchCoreEvents,
    Topology,
    buildCommitment,
    buildDomain,
    calculateBonds,
    COMMITMENT_TYPES,
    OrderState,
} from "../src/index.js";
import {
    buildQuoteRequest,
    requestQuotes,
    makeSellerQuoteHandler,
    InProcessChannel,
    type AssemblyTemplate,
    type OfferPolicy,
} from "../src/agent/index.js";
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

    // cacheTime: 0 — viem's default (chain.blockTime/3, 4000ms for the foundry
    // preset which declares no blockTime) caches `getBlockNumber()` across
    // calls. This suite's whole lifecycle (commit → resolve → re-fetch) runs
    // well under that window on local Anvil, so a cached block number from the
    // FIRST fetchCoreEvents call silently starves the SECOND of the blocks the
    // resolve landed in — the resolved process reads back as still-active.
    // Every read here must see the chain's actual current tip.
    const publicClient = createPublicClient({ chain: foundry, transport, cacheTime: 0 });

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

        // Deadline derives from CHAIN time — block.timestamp is the kernel's
        // clock, and a persisted devnet (or a skewed device clock) can sit
        // far from wall time; the wall-clock default reverts DeadlineExpired.
        const chainNow = (await publicClient.getBlock({ blockTag: "latest" })).timestamp;

        const { commitment, typedData } = buildCommitment(
            {
                processId: "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
                buyer: buyerAccount.address,
                seller: sellerAccount.address,
                currency: tokenAddress,
                payment: PAYMENT,
                expectedCumulativeValue: PAYMENT,
                agreementHash,
                deadline: chainNow + 3600n,
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
        const topology = new Topology();
        topology.applyEvents(events);

        // There should be exactly one process with one order
        const active = topology.getActiveProcesses();
        expect(active.length).toBe(1);

        const process = active[0];
        expect(process.rootBuyer).toBe(buyerAccount.address);
        expect(process.orders.size).toBe(1);

        const order = Array.from(process.orders.values())[0];
        expect(order.buyer).toBe(buyerAccount.address);
        expect(order.seller).toBe(sellerAccount.address);
        expect(order.payment).toBe(PAYMENT);
        expect(order.state).toBe(OrderState.Active);

        // ── 7. Resolve process (buyer-only) ─────────────────────────────
        const resolveHash = await buyerWallet.writeContract({
            address: coreAddress,
            abi: CORE_ABI,
            functionName: "resolveProcess",
            args: [process.processId, [commitment]],
        });
        const resolveReceipt = await publicClient.waitForTransactionReceipt({ hash: resolveHash });
        expect(resolveReceipt.status).toBe("success");

        // ── 8. Reconstruct post-resolution state ────────────────────────
        const events2 = await fetchCoreEvents(publicClient, addresses, 0n);
        const topology2 = new Topology();
        topology2.applyEvents(events2);

        const resolvedProcess = topology2.getProcess(process.processId);
        expect(resolvedProcess).toBeDefined();
        expect(resolvedProcess!.resolved).toBe(true);

        const resolvedOrder = Array.from(resolvedProcess!.orders.values())[0];
        expect(resolvedOrder).toBeDefined();
        expect(resolvedOrder!.state).toBe(OrderState.Resolved);
    }, 60_000);

    it("RFQ round-trip: quote request → counter-drafts → cheapest wins → commit → resolve; the loser holds NOTHING", async () => {
        if (!alive) return;

        const MOCK_ABI = parseAbi([
            "function mint(address to, uint256 amount) external",
            "function approve(address spender, uint256 amount) external returns (bool)",
            "function balanceOf(address account) external view returns (uint256)",
        ]);
        const balanceOf = (who: Address) => publicClient.readContract({
            address: tokenAddress, abi: MOCK_ABI, functionName: "balanceOf", args: [who],
        }) as Promise<bigint>;

        // The LOSING quoter: a wallet with ZERO tokens and ZERO approvals —
        // quoting is signature-only exposure, so it needs nothing to bid.
        const loserAccount = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex); // anvil[2]
        const loserWallet = createWalletClient({ chain: foundry, transport, account: loserAccount });

        const CEILING = 1000n * 10n ** 18n;
        const WINNING_QUOTE = 500n * 10n ** 18n;
        const LOSING_QUOTE = 700n * 10n ** 18n;
        const ctx = { chainId: 31337, core: coreAddress };

        // ── 1. The buyer drafts one quote request per candidate at their
        //       ceiling; the priced fields name the buyer's OWN clause. ──
        const chainNow = (await publicClient.getBlock({ blockTag: "latest" })).timestamp;
        const template: AssemblyTemplate = {
            agreements: [{ id: "order-0", clauses: { "figaro-commerce": {}, "figaro-topology": { parentOrderHashes: [] } } }],
        };
        const pricedFields = [
            { clause: "figaro-commerce", path: "payment" },
            { clause: "figaro-commerce", path: "lineItems.0.unitPrice" },
        ];
        const requestFor = (candidate: Address) => buildQuoteRequest({
            template, buyer: buyerAccount.address, seller: candidate, currency: tokenAddress,
            ceiling: CEILING, chainId: 31337, core: coreAddress, pricedFields,
            deadline: chainNow + 3600n,
            overrides: {
                "figaro-commerce": {
                    currency: tokenAddress, payment: "0",
                    lineItems: [{ itemId: "job", name: "Bespoke job", quantity: 1, unitPrice: "0" }],
                },
            },
        });

        // ── 2. Both candidates price and countersign over the channel. ──
        const quotePolicy: OfferPolicy = { requireRootShape: true, currencyAllowlist: [tokenAddress], maxValue: CEILING };
        const channel = new InProcessChannel();
        channel.register(sellerAccount.address, makeSellerQuoteHandler(sellerWallet, ctx, { quote: () => WINNING_QUOTE, policy: quotePolicy }));
        channel.register(loserAccount.address, makeSellerQuoteHandler(loserWallet, ctx, { quote: () => LOSING_QUOTE, policy: quotePolicy }));
        const drafts = [requestFor(sellerAccount.address), requestFor(loserAccount.address)];
        const { replies, winner } = await requestQuotes(channel, drafts, ctx);
        expect(replies).toHaveLength(2);
        expect(winner!.reply.commitment.seller.toLowerCase()).toBe(sellerAccount.address.toLowerCase());
        expect(winner!.reply.commitment.payment).toBe(WINNING_QUOTE);

        // ── 3. Fund + approve ONLY the parties that commit; baselines. ──
        const bonds = calculateBonds(WINNING_QUOTE, WINNING_QUOTE);
        await buyerWallet.writeContract({ address: tokenAddress, abi: MOCK_ABI, functionName: "mint", args: [buyerAccount.address, bonds.buyerBond] })
            .then((h) => publicClient.waitForTransactionReceipt({ hash: h }));
        await buyerWallet.writeContract({ address: tokenAddress, abi: MOCK_ABI, functionName: "mint", args: [sellerAccount.address, bonds.sellerBond] })
            .then((h) => publicClient.waitForTransactionReceipt({ hash: h }));
        await buyerWallet.writeContract({ address: tokenAddress, abi: MOCK_ABI, functionName: "approve", args: [coreAddress, bonds.buyerBond] })
            .then((h) => publicClient.waitForTransactionReceipt({ hash: h }));
        await sellerWallet.writeContract({ address: tokenAddress, abi: MOCK_ABI, functionName: "approve", args: [coreAddress, bonds.sellerBond] })
            .then((h) => publicClient.waitForTransactionReceipt({ hash: h }));
        const [buyer0, winner0, loser0, core0] = await Promise.all([
            balanceOf(buyerAccount.address), balanceOf(sellerAccount.address), balanceOf(loserAccount.address), balanceOf(coreAddress),
        ]);
        expect(loser0, "the losing quoter holds ZERO tokens — quoting needed none").toBe(0n);

        // ── 4. The buyer signs EXACTLY ONE quote — the selection — and
        //       commits it. The winner's countersignature is already on the
        //       struct; the losing quote expires inert at its deadline. ──
        const domain = buildDomain(31337, coreAddress);
        const buyerSig = await buyerWallet.signTypedData({
            domain, types: COMMITMENT_TYPES, primaryType: "Commitment", message: winner!.reply.commitment,
        });
        const commitReceipt = await buyerWallet.writeContract({
            address: coreAddress, abi: CORE_ABI, functionName: "commit",
            args: [winner!.reply.commitment, buyerSig, winner!.reply.sellerSig!],
        }).then((h) => publicClient.waitForTransactionReceipt({ hash: h }));
        expect(commitReceipt.status).toBe("success");
        {
            const [b, w, c] = await Promise.all([balanceOf(buyerAccount.address), balanceOf(sellerAccount.address), balanceOf(coreAddress)]);
            expect(buyer0 - b, "buyer bonded 2× the QUOTED price, not the ceiling").toBe(bonds.buyerBond);
            expect(winner0 - w, "winner bonded 2× the quoted cumulative value").toBe(bonds.sellerBond);
            expect(c - core0, "escrow holds both bonds in the quote's denomination").toBe(bonds.buyerBond + bonds.sellerBond);
        }

        // ── 5. Resolve; settlement at the QUOTE — and the loser is
        //       bit-identically untouched. ──
        const events = await fetchCoreEvents(publicClient, addresses, 0n);
        const topology = new Topology();
        topology.applyEvents(events);
        const proc = topology.getActiveProcesses().find((p) =>
            Array.from(p.orders.values()).some((o) => o.payment === WINNING_QUOTE));
        expect(proc, "the quoted order's process is live on-chain").toBeDefined();
        const resolveReceipt = await buyerWallet.writeContract({
            address: coreAddress, abi: CORE_ABI, functionName: "resolveProcess",
            args: [proc!.processId, [winner!.reply.commitment]],
        }).then((h) => publicClient.waitForTransactionReceipt({ hash: h }));
        expect(resolveReceipt.status).toBe("success");
        const [buyerF, winnerF, loserF, coreF] = await Promise.all([
            balanceOf(buyerAccount.address), balanceOf(sellerAccount.address), balanceOf(loserAccount.address), balanceOf(coreAddress),
        ]);
        expect(buyer0 - buyerF, "buyer net paid exactly the winning quote").toBe(WINNING_QUOTE);
        expect(winnerF - winner0, "winner net earned exactly their quote").toBe(WINNING_QUOTE);
        expect(loserF - loser0, "the losing quoter is untouched — signature-only exposure").toBe(0n);
        expect(coreF - core0, "escrow returned to baseline").toBe(0n);
    }, 90_000);
});
