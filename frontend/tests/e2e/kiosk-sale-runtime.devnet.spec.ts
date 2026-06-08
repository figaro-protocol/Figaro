/**
 * kiosk-sale-runtime.devnet.spec.ts
 *
 * RUNTIME (lifecycle Phase 4) for the kiosk-sale scenario — the REAL bilateral
 * commit, end to end, both parties through the UI, no shortcut:
 *
 *   1. Buyer (anvil[0]) browses the onboarded kiosk seller, adds the product,
 *      places the order, confirms the pre-sign agreement preview, and relays
 *      the pinned commitment payload to the seller's inbox.
 *   2. Seller (anvil[5], "Kiosk Corner") opens /inbox, sees the pending order
 *      arrive over the live coordination subscription, accepts it, confirms the
 *      pre-sign preview, counter-signs and broadcasts — the bilateral
 *      `FigaroCore.commit` lands on-chain. No RPC auto-signing; no seeded
 *      payload. The buyer never signs for the seller.
 *   3. Buyer resolves the process from /orders/<processId>.
 *
 * Consumes the seller + assembly from chain→IPFS (authored by
 * scenario-kiosk-sale + sellers-onboarding). Devnet == mainnet-on-a-laptop:
 * the payload is pinned to real IPFS; only the XMTP notification hop is the
 * e2e coordination channel. The per-test snapshot rolls back only this order —
 * the persisted seller + assembly survive.
 *
 * Prerequisite: scenario-kiosk-sale (anchors the assembly) and
 * sellers-onboarding (onboards Kiosk Corner) have run against this devnet.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + the dev server.
 */
import { test, expect, ANVIL_ACCOUNTS, gotoAsWallet } from './devnet-multi-test';
import {
    createPublicClient,
    defineChain,
    http,
    parseAbi,
    type Hex,
} from 'viem';
import {
    acceptOrderInInboxUI,
    assertPinnedInIpfs,
    discoverSellerByAssembly,
    ensureTokenApprovalsByAddress,
    evmRevert,
    evmSnapshot,
    placeBilateralOrderUI,
    readLocalDeploymentConfig,
} from './devnet-helpers';
import { formatToken } from '../../lib/shared/utils';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

// Buyer = anvil[0] (the connected wallet). The seller is DISCOVERED from chain →
// IPFS by its on-chain binding — no roster, no keys; approvals via unlocked RPC.
const BUYER_ADDR = ANVIL_ACCOUNTS[0] as Hex;

const CORE_VIEW_ABI = parseAbi([
    'function processes(bytes32 processId) view returns (address rootBuyer, address currency, uint256 cumulativeValue, uint32 activeOrderCount)',
]);
const ERC20_BAL_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('kiosk-sale runtime — buyer checkout → seller accept → resolve (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // Two UI signatures (buyer + seller), an IPFS pin, an on-chain commit,
    // an indexer poll for the active row, and an on-chain resolve.
    test.setTimeout(240_000);

    test('a real bilateral sale commits and resolves, both parties through the UI', async ({ page }) => {
        // Accept every native window.confirm — confirm-receipt raises one
        // before resolving (and checkout may too).
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        // Discover the seller from chain → IPFS by its on-chain binding (throws if
        // not onboarded). Both wallets approve the payment token by address via the
        // unlocked RPC — no keys.
        const kiosk = await discoverSellerByAssembly('kiosk-sale');
        await ensureTokenApprovalsByAddress(coreAddress, tokenAddress, BUYER_ADDR, kiosk.address);

        // Real token balances are the ground truth for the whole point of the
        // protocol — bonds lock at commit, payment moves at resolve, bonds
        // return. Read them out-of-band (fresh ERC-20 balanceOf) at each stage.
        const balanceOf = (who: `0x${string}`) => publicClient.readContract({
            address: tokenAddress, abi: ERC20_BAL_ABI, functionName: 'balanceOf', args: [who],
        }) as Promise<bigint>;
        const sellerAddr = kiosk!.address as `0x${string}`;
        const buyerAddr = BUYER_ADDR as `0x${string}`;
        const [buyer0, seller0, core0] = await Promise.all([
            balanceOf(buyerAddr), balanceOf(sellerAddr), balanceOf(coreAddress),
        ]);

        // ── 1. Buyer places the order through the UI and relays it ──────────
        // The buyer SEES the fulfilment modality the assembly declared —
        // "Pickup" — in the checkout selector (not an opaque assembly name).
        await placeBilateralOrderUI(page, { seller: kiosk!.address, expectFulfilmentLabel: 'Pickup' });

        // Out-of-band: the relayed commitment payload is REALLY pinned in IPFS
        // (the same proof the assembly + seller stages run). Read the CID the
        // buyer relayed over the coordination channel, then check Kubo directly.
        const payloadCid = await page.evaluate(() => {
            const raw = window.localStorage.getItem('__FIGARO_COORDINATION_MOCK_MESSAGES__');
            if (!raw) return null;
            const msgs = JSON.parse(raw) as Array<{ type: string; payloadCid?: string }>;
            const last = [...msgs].reverse().find((m) => m.type === 'COMMITMENT_PAYLOAD');
            return last?.payloadCid ?? null;
        });
        expect(payloadCid, 'buyer relayed a commitment payload CID').toBeTruthy();
        await assertPinnedInIpfs(payloadCid as string);

        // ── 2. Seller accepts in the inbox UI → on-chain bilateral commit ───
        const processId = await acceptOrderInInboxUI(page, kiosk!.address);
        expect(processId).toMatch(/^0x[0-9a-fA-F]{64}$/);

        // The commit really landed: the process exists on-chain with the buyer
        // as rootBuyer and one active order.
        const committed = await publicClient.readContract({
            address: coreAddress,
            abi: CORE_VIEW_ABI,
            functionName: 'processes',
            args: [processId],
        });
        expect(committed[0].toLowerCase()).toBe(BUYER_ADDR.toLowerCase()); // rootBuyer
        expect(committed[3]).toBe(1); // activeOrderCount

        // Bonds are now LOCKED in the kernel. Single order ⇒ cumulativeValue
        // == payment; buyerBond = 2×payment, sellerBond = 2×cumulativeValue.
        const payment = committed[2];
        expect(payment).toBeGreaterThan(0n);
        const buyerBond = payment * 2n;
        const sellerBond = payment * 2n;
        const [buyer1, seller1, core1] = await Promise.all([
            balanceOf(buyerAddr), balanceOf(sellerAddr), balanceOf(coreAddress),
        ]);
        expect(buyer0 - buyer1, 'buyer bond debited at commit').toBe(buyerBond);
        expect(seller0 - seller1, 'seller bond debited at commit').toBe(sellerBond);
        expect(core1 - core0, 'kernel escrows both bonds').toBe(buyerBond + sellerBond);

        // ── 3. Buyer resolves the process through the UI ────────────────────
        await gotoAsWallet(page, BUYER_ADDR, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ state: 'visible', timeout: 30000 });

        // The committed fulfilment modality is surfaced at runtime, too — the
        // buyer's order page shows it's a pickup.
        await expect(page.getByTestId('order-fulfilment-modality'))
            .toContainText(/Pickup/i, { timeout: 30000 });

        // Resolve the process — a capability now (one flow; replaces the bespoke
        // confirm-receipt button). The executor raises the window.confirm the
        // persistent dialog handler above accepts.
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await resolveBtn.waitFor({ state: 'visible', timeout: 30000 });
        await resolveBtn.click();

        // Resolution settles the process: no active orders remain on-chain.
        await expect.poll(
            async () => {
                const p = await publicClient.readContract({
                    address: coreAddress,
                    abi: CORE_VIEW_ABI,
                    functionName: 'processes',
                    args: [processId],
                });
                return Number(p[3]);
            },
            { timeout: 90000, message: 'process should resolve to 0 active orders' },
        ).toBe(0);

        // Settlement is real, not just a counter going to zero: the payment
        // moved buyer→seller and EVERY bond came back. Kernel holds nothing.
        const [buyer2, seller2, core2] = await Promise.all([
            balanceOf(buyerAddr), balanceOf(sellerAddr), balanceOf(coreAddress),
        ]);
        expect(buyer0 - buyer2, 'buyer net cost == payment (bond refunded)').toBe(payment);
        expect(seller2 - seller0, 'seller net gain == payment (bond refunded)').toBe(payment);
        expect(core2, 'kernel returns to its starting balance — no stuck funds').toBe(core0);

        // The buyer's order page tells the human it settled — WITH amounts, not
        // just "Completed". Payment sent == payment; bond returned == buyerBond.
        await expect(page.getByTestId('order-status-pill')).toHaveText(/Completed/i, { timeout: 30000 });
        const buyerSettlement = page.getByTestId('settlement-proceeds');
        await expect(buyerSettlement).toBeVisible({ timeout: 30000 });
        await expect(buyerSettlement).toContainText(/Payment sent/i);
        await expect(page.getByTestId('settlement-payment')).toContainText(formatToken(payment));
        await expect(page.getByTestId('settlement-bond-returned')).toContainText(formatToken(buyerBond));

        // The seller sees the mirror: payment received + their bond returned.
        await gotoAsWallet(page, sellerAddr, `/orders/${processId}?e2e=devnet`);
        await expect(page.getByTestId('order-status-pill')).toHaveText(/Completed/i, { timeout: 30000 });
        const sellerSettlement = page.getByTestId('settlement-proceeds');
        await expect(sellerSettlement).toBeVisible({ timeout: 30000 });
        await expect(sellerSettlement).toContainText(/Payment received/i);
        await expect(page.getByTestId('settlement-bond-returned')).toContainText(formatToken(sellerBond));
    });
});
