/**
 * direct-sale-runtime.devnet.spec.ts
 *
 * RUNTIME (lifecycle Phase 4) for the on-site `direct-sale` scenario — the
 * tracked, proximity-verified counterpart of kiosk-sale. The REAL bilateral
 * commit + the full handoff certification, both parties through the UI:
 *
 *   1. Buyer (anvil[0]) browses the onboarded café, places a consume-onsite
 *      order, and relays the signed commitment to the seller's inbox.
 *   2. Café (anvil[6], "Aurora Café") accepts in /inbox → on-chain bilateral
 *      commit. No RPC auto-sign; no seeded payload. The acceptance IS the
 *      commit — arrival and approval are core, not a merchant-process event.
 *   3. The merchant walks figaro-merchant-process-v1 (prep-started →
 *      ready-for-pickup → handed-off) and fires the cross-witness
 *      figaro-proximity-proof-v1 at handoff; the buyer co-witnesses proximity.
 *   4. Buyer resolves the process.
 *
 * Consumes the seller + assembly from chain→IPFS (authored by
 * scenario-direct-sale + sellers-onboarding). Exercises every clause the
 * assembly composes — fulfilment (consume-onsite), merchant-process, and
 * proximity-policy/proof — each via its driving role. The per-test snapshot
 * rolls back only this order; the persisted seller + assembly survive.
 *
 * Prerequisite: scenario-direct-sale (anchors the assembly) and
 * sellers-onboarding (onboards Aurora Café) have run against this devnet.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + the dev server.
 */
import { test, expect, ANVIL_ACCOUNTS, gotoAsWallet } from './devnet-multi-test';
import { type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    CORE_PROCESS_VIEW_ABI,
    ERC20_BALANCE_ABI,
    SELLER_REGISTERED_EVENT_ABI,
    acceptOrderInInboxUI,
    assertPinnedInIpfs,
    ensureTokenApprovals,
    localPublicClient,
    placeBilateralOrderUI,
    readLocalDeploymentConfig,
    useChainSnapshot,
    walkMerchantToHandoff,
} from './devnet-helpers';
import { SELLER_ROSTER } from './seller-roster';
import { formatToken } from '../../lib/shared/utils';

// Buyer = anvil[0]; seller = the direct-sale roster seller (anvil[6]).
const BUYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const CAFE_SELLER_KEY = '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e' as const;
const BUYER_ADDR = ANVIL_ACCOUNTS[0];

const cafe = SELLER_ROSTER.find((s) => s.assemblies.includes('direct-sale'));

useChainSnapshot(test);

test.describe('direct-sale runtime — on-site commit, handoff certification, resolve (devnet)', () => {
    // Two UI signatures, an IPFS pin, a commit, a 4-step merchant walk + two
    // proximity proofs, an indexer poll, and a resolve.
    test.setTimeout(300_000);

    test('a real on-site sale commits, certifies the handoff, and resolves — both parties through the UI', async ({ page }) => {
        // Accept every native window.confirm — confirm-receipt raises one.
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        expect(cafe, 'direct-sale seller must be in SELLER_ROSTER').toBeTruthy();
        expect(privateKeyToAccount(CAFE_SELLER_KEY).address.toLowerCase())
            .toBe(cafe!.address.toLowerCase());

        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;
        const sellerRegistry = (process.env.NEXT_PUBLIC_SELLER_REGISTRY ?? config.sellerRegistry) as Hex;
        const publicClient = localPublicClient();

        // Prerequisite: the café must already be onboarded (consumed from chain).
        const registered = await publicClient.getContractEvents({
            address: sellerRegistry,
            abi: SELLER_REGISTERED_EVENT_ABI,
            eventName: 'SellerRegistered',
            args: { seller: cafe!.address },
            fromBlock: 0n,
        });
        expect(
            registered.length,
            `Aurora Café (${cafe!.address}) is not registered — run sellers-onboarding first`,
        ).toBeGreaterThanOrEqual(1);

        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, CAFE_SELLER_KEY);

        const balanceOf = (who: `0x${string}`) => publicClient.readContract({
            address: tokenAddress, abi: ERC20_BALANCE_ABI, functionName: 'balanceOf', args: [who],
        }) as Promise<bigint>;
        const sellerAddr = cafe!.address as `0x${string}`;
        const buyerAddr = BUYER_ADDR as `0x${string}`;
        const [buyer0, seller0, core0] = await Promise.all([
            balanceOf(buyerAddr), balanceOf(sellerAddr), balanceOf(coreAddress),
        ]);

        // ── 1. Buyer places the consume-onsite order through the UI ─────────
        await placeBilateralOrderUI(page, { seller: cafe!.address, expectFulfilmentLabel: 'Consume on-site' });

        // Out-of-band: the relayed commitment payload is really pinned in IPFS.
        const payloadCid = await page.evaluate(() => {
            const raw = window.localStorage.getItem('__FIGARO_COORDINATION_MOCK_MESSAGES__');
            if (!raw) return null;
            const msgs = JSON.parse(raw) as Array<{ type: string; payloadCid?: string }>;
            const last = [...msgs].reverse().find((m) => m.type === 'COMMITMENT_PAYLOAD');
            return last?.payloadCid ?? null;
        });
        expect(payloadCid, 'buyer relayed a commitment payload CID').toBeTruthy();
        await assertPinnedInIpfs(payloadCid as string);

        // GEO IS TESTED: direct-sale composes figaro-geo-v2, so the on-site
        // exchange must be LOCATED on the flow graph. The buyer's Layer-A gate
        // already blocked place-order if geo were empty (so reaching here proves
        // it's captured + valid); confirm it out-of-band too — follow the relayed
        // payload to the committed agreement and assert geo origin = the café's
        // profile geohash (on-site origin == destination == the venue/cell/process).
        const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? 'http://127.0.0.1:8080';
        const relayedPayload = await (await fetch(`${gateway}/ipfs/${payloadCid}`)).json() as {
            agreement?: { sections: Array<{ clause: string; data: Record<string, unknown> }> };
            agreementUri?: string;
        };
        const committedAgreement = relayedPayload.agreement
            ?? await (await fetch(`${gateway}/ipfs/${(relayedPayload.agreementUri ?? '').replace('ipfs://', '')}`)).json() as {
                sections: Array<{ clause: string; data: Record<string, unknown> }>;
            };
        const geoSection = committedAgreement.sections.find((s) => s.clause === 'figaro-geo-v2');
        expect(geoSection, 'on-site agreement carries a figaro-geo-v2 section').toBeTruthy();
        expect((geoSection!.data as { originGeohash?: string }).originGeohash,
            'geo origin = the café profile geohash (on-site exchange located)').toBe(cafe!.geohash);

        // ── 2. Café accepts in the inbox UI → on-chain bilateral commit ─────
        const processId = await acceptOrderInInboxUI(page, cafe!.address);
        expect(processId).toMatch(/^0x[0-9a-fA-F]{64}$/);

        const committed = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(committed[0].toLowerCase()).toBe(BUYER_ADDR.toLowerCase()); // rootBuyer
        expect(committed[3]).toBe(1); // activeOrderCount

        // Bonds locked at commit.
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

        // ── 3. Merchant walks the lifecycle + fires the handoff proximity ───
        await walkMerchantToHandoff(page, { processId, merchant: cafe!.address });

        // ── 4. Buyer co-witnesses proximity, then resolves ─────────────────
        await gotoAsWallet(page, BUYER_ADDR, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ state: 'visible', timeout: 30000 });

        // The committed fulfilment modality is surfaced at runtime as the
        // clause's own code (one source — the agreement; no frontend label map).
        await expect(page.getByTestId('order-fulfilment-modality'))
            .toContainText(/consume-onsite/i, { timeout: 30000 });

        // Buyer's symmetric proximity witness — through the capability rail
        // (the single flow). The capability retires once the proof lands.
        const buyerProof = page.getByTestId('capability-execute-submit-buyer-proximity-proof');
        await buyerProof.waitFor({ state: 'visible', timeout: 30000 });
        await buyerProof.click();
        await expect(buyerProof).toHaveCount(0, { timeout: 60000 });

        // Resolve the process — also a capability now (one flow; replaces the
        // bespoke confirm-receipt button). The executor raises the window.confirm
        // the persistent dialog handler above accepts.
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await resolveBtn.waitFor({ state: 'visible', timeout: 30000 });
        await resolveBtn.click();

        await expect.poll(
            async () => {
                const p = await publicClient.readContract({
                    address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
                });
                return Number(p[3]);
            },
            { timeout: 90000, message: 'process should resolve to 0 active orders' },
        ).toBe(0);

        // Settlement is real: payment moved buyer→seller, all bonds returned.
        const [buyer2, seller2, core2] = await Promise.all([
            balanceOf(buyerAddr), balanceOf(sellerAddr), balanceOf(coreAddress),
        ]);
        expect(buyer0 - buyer2, 'buyer net cost == payment').toBe(payment);
        expect(seller2 - seller0, 'seller net gain == payment').toBe(payment);
        expect(core2, 'kernel returns to starting balance — no stuck funds').toBe(core0);

        // The human sees settlement, with amounts.
        await expect(page.getByTestId('order-status-pill')).toHaveText(/Completed/i, { timeout: 30000 });
        const buyerSettlement = page.getByTestId('settlement-proceeds');
        await expect(buyerSettlement).toBeVisible({ timeout: 30000 });
        await expect(buyerSettlement).toContainText(/Payment sent/i);
        await expect(page.getByTestId('settlement-payment')).toContainText(formatToken(payment));
        await expect(page.getByTestId('settlement-bond-returned')).toContainText(formatToken(buyerBond));

        // The café sees the mirror.
        await gotoAsWallet(page, sellerAddr, `/orders/${processId}?e2e=devnet`);
        await expect(page.getByTestId('order-status-pill')).toHaveText(/Completed/i, { timeout: 30000 });
        const sellerSettlement = page.getByTestId('settlement-proceeds');
        await expect(sellerSettlement).toBeVisible({ timeout: 30000 });
        await expect(sellerSettlement).toContainText(/Payment received/i);
        await expect(page.getByTestId('settlement-bond-returned')).toContainText(formatToken(sellerBond));
    });
});
