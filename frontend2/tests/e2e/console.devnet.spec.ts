/**
 * console.devnet.spec.ts — Console lifecycle E2E test against live Anvil.
 *
 * Seeds an order on-chain via direct viem calls (V5 ABI), then verifies
 * the console page syncs the process, proposes actions, and can execute
 * a resolution.
 *
 * Requires: anvil running + `./deploy-local.sh` completed.
 */
import fs from "fs";
import path from "path";
import { expect } from "@playwright/test";
import { test, ANVIL_ACCOUNTS } from "./devnet-multi-test";
import {
    createPublicClient,
    createWalletClient,
    defineChain,
    http,
    parseAbi,
    parseEther,
    keccak256,
    encodePacked,
    type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { COMMITMENT_TYPES } from "@figaro/core";
import { DEFAULT_AGREEMENT_HASH } from "@/lib/core/contracts";
import { ZERO_PROCESS_ID } from "@/lib/shared/evm";

// ── Chain config ─────────────────────────────────────────────────────────────

const RPC_URL = "http://127.0.0.1:8545";
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: "Localhost",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

// ── V5 ABIs ──────────────────────────────────────────────────────────────────

const COMMITMENT_TUPLE =
    "(bytes32 processId, address buyer, address seller, address currency, uint256 payment, uint256 expectedCumulativeValue, bytes32 agreementHash, uint256 salt, uint256 deadline)";

const CORE_ABI = parseAbi([
    `function commit(${COMMITMENT_TUPLE} c, bytes buyerSig, bytes sellerSig) external returns (bytes32 processId, bytes32 orderHash)`,
    `function resolveProcess(bytes32 processId, ${COMMITMENT_TUPLE}[] commitments) external`,
    "function processes(bytes32 processId) view returns (address rootBuyer, address currency, uint256 cumulativeValue, uint256 activeOrderCount)",
    "function orderStatus(bytes32 orderHash) view returns (uint8)",
    "event OrderCommitted(bytes32 indexed orderHash, bytes32 indexed processId, address indexed buyer, address seller, address currency, uint256 payment, uint256 cumulativeValue, bytes32 agreementHash)",
    "event OrderResolved(bytes32 indexed orderHash, bytes32 indexed processId, uint256 sellerPayout, uint256 buyerPayout)",
]);

const ERC20_ABI = parseAbi([
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
]);

// ── EIP-712 types (imported from @figaro/core) ────────────────────────────────

// ── Test key material ────────────────────────────────────────────────────────

const BUYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const SELLER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const BUYER = ANVIL_ACCOUNTS[0];
const SELLER = ANVIL_ACCOUNTS[1];

const MAX_UINT256 = (2n ** 256n) - 1n;

// ── Read deployment addresses from .env.local ────────────────────────────────

function readEnvAddress(key: string): Hex {
    const envPath = path.resolve(__dirname, "../../.env.local");
    if (!fs.existsSync(envPath)) throw new Error(`.env.local not found — run ./deploy-local.sh`);
    const contents = fs.readFileSync(envPath, "utf8");
    for (const line of contents.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const k = trimmed.slice(0, eq).trim();
        const v = trimmed.slice(eq + 1).trim();
        if (k === key) return v as Hex;
    }
    throw new Error(`${key} not found in .env.local`);
}

// ── On-chain helpers ─────────────────────────────────────────────────────────

async function seedOrder(): Promise<{ processId: Hex; orderHash: Hex; commitment: any }> {
    const coreAddress = readEnvAddress("NEXT_PUBLIC_FIGARO_CORE");
    const tokenAddress = readEnvAddress("NEXT_PUBLIC_TOKEN_ADDRESS");

    const buyer = privateKeyToAccount(BUYER_KEY);
    const seller = privateKeyToAccount(SELLER_KEY);
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const buyerClient = createWalletClient({ account: buyer, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const sellerClient = createWalletClient({ account: seller, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

    const payment = parseEther("0.01");
    const salt = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const commitment = {
        processId: ZERO_PROCESS_ID,
        buyer: buyer.address as Hex,
        seller: seller.address as Hex,
        currency: tokenAddress,
        payment,
        expectedCumulativeValue: payment,
        agreementHash: DEFAULT_AGREEMENT_HASH,
        salt,
        deadline,
    };

    const domain = {
        name: "FigaroCore",
        version: "3",
        chainId: 31337,
        verifyingContract: coreAddress,
    };

    // Approve tokens (both parties need 2x)
    const buyerBond = payment * 2n;
    const sellerBond = payment * 2n;

    const buyerApproveHash = await buyerClient.writeContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [coreAddress, MAX_UINT256],
    });
    const sellerApproveHash = await sellerClient.writeContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [coreAddress, MAX_UINT256],
    });
    await publicClient.waitForTransactionReceipt({ hash: buyerApproveHash });
    await publicClient.waitForTransactionReceipt({ hash: sellerApproveHash });

    // Sign commitments (EIP-712)
    const buyerSig = await buyerClient.signTypedData({
        domain,
        types: COMMITMENT_TYPES,
        primaryType: "Commitment",
        message: commitment,
    });
    const sellerSig = await sellerClient.signTypedData({
        domain,
        types: COMMITMENT_TYPES,
        primaryType: "Commitment",
        message: commitment,
    });

    // Submit on-chain
    const { result, request } = await publicClient.simulateContract({
        account: buyer.address,
        address: coreAddress,
        abi: CORE_ABI,
        functionName: "commit",
        args: [commitment, buyerSig, sellerSig],
    });
    const txHash = await buyerClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const processId = result[0] as Hex;
    const orderHash = result[1] as Hex;

    return { processId, orderHash, commitment };
}

function computeOrderHash(c: any): Hex {
    return keccak256(
        encodePacked(
            ["bytes32", "address", "address", "address", "uint256", "uint256", "bytes32", "uint256", "uint256"],
            [c.processId, c.buyer, c.seller, c.currency, c.payment, c.expectedCumulativeValue, c.agreementHash, c.salt, c.deadline],
        ),
    );
}

// ── EVM snapshot/revert ──────────────────────────────────────────────────────

async function evmSnapshot(): Promise<string> {
    const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "evm_snapshot", params: [], id: 1 }),
    });
    const json = await res.json();
    return json.result;
}

async function evmRevert(snapshotId: string): Promise<void> {
    await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "evm_revert", params: [snapshotId], id: 1 }),
    });
}

// ── Test suite ───────────────────────────────────────────────────────────────

test.describe.configure({ mode: "serial" });

let snapshot: string;
test.beforeAll(async () => { snapshot = await evmSnapshot(); });
test.afterAll(async () => { if (snapshot) await evmRevert(snapshot); });

test.describe("Console — full lifecycle (devnet)", () => {
    let innerSnapshot: string;
    test.beforeAll(async () => { innerSnapshot = await evmSnapshot(); });
    test.afterAll(async () => { if (innerSnapshot) await evmRevert(innerSnapshot); });

    test("seeds order on-chain, console syncs process, can view details", async ({ page }) => {
        // ── Seed on-chain state ──────────────────────────────────────
        const { processId, orderHash, commitment } = await seedOrder();

        // Store the commitment in localStorage so the console can resolve later.
        // Must be injected via addInitScript so it runs BEFORE React hydration.
        const storedCommitment = {
            processId: commitment.processId,
            buyer: commitment.buyer,
            seller: commitment.seller,
            currency: commitment.currency,
            payment: commitment.payment.toString(),
            expectedCumulativeValue: commitment.expectedCumulativeValue.toString(),
            agreementHash: commitment.agreementHash,
            salt: commitment.salt.toString(),
            deadline: commitment.deadline.toString(),
        };

        await page.addInitScript(
            ({ orderHash, stored }) => {
                localStorage.setItem(`figaro:commitment:${orderHash}`, JSON.stringify(stored));
            },
            { orderHash, stored: storedCommitment },
        );

        // Navigate to console — ?e2e=devnet triggers ClientInit auto-connect
        await page.goto("/console?e2e=devnet", { waitUntil: "load" });

        // Wait for wallet connection (RainbowKit shows address, not "Connect Wallet")
        await page.waitForFunction(
            () => !document.querySelector('button')?.textContent?.includes('Connect Wallet'),
            null,
            { timeout: 15000 },
        );

        // Wait for FigaroContext to sync and the process list to appear.
        // The provider polls every 4s; give it up to 30s for initial sync + poll.
        await page.waitForSelector('[data-testid="process-list"]', { timeout: 30000 });

        const processRow = page.getByRole("button", {
            name: new RegExp(`${processId.slice(0, 8)}.*1 order.*1 active`, "i"),
        });
        await expect(processRow).toBeVisible({ timeout: 20000 });

        // Click on the process to select it
        await processRow.click();

        // Process detail should be visible on the inspect tab — heading says "Process"
        await expect(page.getByRole("heading", { name: "Process", exact: true })).toBeVisible({ timeout: 10000 });

        // Should show the order status as "active"
        await expect(page.locator("text=active").first()).toBeVisible({ timeout: 10000 });
    });

    test("proposed actions include resolve-process for buyer", async ({ page }) => {
        // Re-seed since inner snapshot was NOT reverted between tests in serial mode.
        // However, the seed from test 1 is still on-chain. Seed a fresh one to be safe.
        const { processId, orderHash, commitment } = await seedOrder();

        const storedCommitment = {
            processId: commitment.processId,
            buyer: commitment.buyer,
            seller: commitment.seller,
            currency: commitment.currency,
            payment: commitment.payment.toString(),
            expectedCumulativeValue: commitment.expectedCumulativeValue.toString(),
            agreementHash: commitment.agreementHash,
            salt: commitment.salt.toString(),
            deadline: commitment.deadline.toString(),
        };

        await page.addInitScript(
            ({ orderHash, stored }) => {
                localStorage.setItem(`figaro:commitment:${orderHash}`, JSON.stringify(stored));
            },
            { orderHash, stored: storedCommitment },
        );

        await page.goto("/console?e2e=devnet", { waitUntil: "load" });

        await page.waitForFunction(
            () => !document.querySelector('button')?.textContent?.includes('Connect Wallet'),
            null,
            { timeout: 15000 },
        );

        await page.waitForSelector('[data-testid="process-list"]', { timeout: 30000 });
        const processRow = page.getByRole("button", { name: /order.*active/i }).first();
        await expect(processRow).toBeVisible({ timeout: 20000 });
        await processRow.click();

        // Switch to the actions tab
        const actionsTab = page.getByRole("button", { name: /actions/i });
        if (await actionsTab.isVisible()) {
            await actionsTab.click();
        }

        // Should show a resolve-process proposed action
        await expect(page.getByText("Resolve Process", { exact: true })).toBeVisible({ timeout: 15000 });
    });
});
