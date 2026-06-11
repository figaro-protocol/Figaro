/**
 * direct-sale-runtime.devnet.spec.ts
 *
 * RUNTIME (lifecycle Phase 4) for the on-site `direct-sale` scenario — the
 * tracked, proximity-verified counterpart of kiosk-sale. The REAL bilateral
 * commit + the full handoff certification, both parties through the UI:
 *
 *   1. Buyer (anvil[0]) browses the onboarded café, places a consume-onsite
 *      order, and relays the signed commitment to the seller's inbox.
 *   2. Café accepts in /inbox → on-chain bilateral commit. No RPC auto-sign;
 *      no seeded payload. The acceptance IS the commit — arrival and approval
 *      are core, not a merchant-process event.
 *   3. The café walks figaro-merchant-process-v1 (prep-started →
 *      ready-for-pickup → handed-off) and witnesses the committed proximity
 *      band — all through the ONE clause-generic capability rail
 *      (`capability-execute-submit-clause-attestation`; labels are the
 *      clause's own event codes, no clause names in the runtime surface).
 *   4. The buyer co-witnesses proximity (the proof clause is bilateral),
 *      then resolves the process.
 *
 * Consumes the seller + assembly from chain→IPFS (authored by
 * scenario-direct-sale; seller onboarded against this devnet). Exercises every
 * clause the assembly composes — fulfilment (consume-onsite),
 * merchant-process, and proximity-policy/proof — each via its driving role.
 *
 * PERSISTED, like mainnet: no chain snapshot/revert. Each run places a NEW
 * order, drives it to atomic resolution, and leaves the settled process as
 * terminal on-chain state — exactly what a participant leaves behind.
 *
 * Prerequisite: scenario-direct-sale (anchors the assembly) and an onboarded
 * seller whose profile binds `direct-sale`, against this devnet.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + the dev server.
 */
import { test, expect, ANVIL_ACCOUNTS, gotoAsWallet } from './devnet-multi-test';
import { type Hex } from 'viem';
import {
    CORE_PROCESS_VIEW_ABI,
    ERC20_BALANCE_ABI,
    acceptOrderInInboxUI,
    assertPinnedInIpfs,
    discoverSellerByAssembly,
    ensureTokenApprovalsByAddress,
    localPublicClient,
    placeBilateralOrderUI,
    readLocalDeploymentConfig,
} from './devnet-helpers';
import { formatToken } from '../../lib/shared/utils';

// Buyer = anvil[0] (the connected wallet). The seller is DISCOVERED from
// SellerRegistry events + IPFS by its on-chain binding — no roster, no keys;
// wallets + approvals go through the unlocked RPC by address.
const BUYER_ADDR = ANVIL_ACCOUNTS[0] as Hex;

// The composed clauses' own event codes — read from the agreement at runtime
// by the engine; the spec drives the rail by these labels, exactly as a human
// reads the buttons. (The committed proximity band labels both witnesses.)
const MERCHANT_STAGES = ['prep-started', 'ready-for-pickup', 'handed-off'] as const;
const PROXIMITY_BAND = 'zone-wifi';

test.describe('direct-sale runtime — on-site commit, handoff certification, resolve (devnet)', () => {
    // Two UI signatures, an IPFS pin, a commit, a 3-step merchant walk + two
    // proximity witnesses, an indexer poll, and a resolve.
    test.setTimeout(300_000);

    test('a real on-site sale commits, certifies the handoff, and resolves — both parties through the UI', async ({ page }) => {
        // Accept every native window.confirm — resolve raises one.
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;
        const publicClient = localPublicClient();

        // Discover the seller from chain → IPFS by its on-chain binding.
        const cafe = await discoverSellerByAssembly('direct-sale');

        await ensureTokenApprovalsByAddress(coreAddress, tokenAddress, BUYER_ADDR, cafe.address);

        const balanceOf = (who: `0x${string}`) => publicClient.readContract({
            address: tokenAddress, abi: ERC20_BALANCE_ABI, functionName: 'balanceOf', args: [who],
        }) as Promise<bigint>;
        const sellerAddr = cafe!.address as `0x${string}`;
        const buyerAddr = BUYER_ADDR as `0x${string}`;
        const [buyer0, seller0, core0] = await Promise.all([
            balanceOf(buyerAddr), balanceOf(sellerAddr), balanceOf(coreAddress),
        ]);

        // ── 1. Buyer places the consume-onsite order through the UI ─────────
        await placeBilateralOrderUI(page, { seller: cafe!.address, fulfilmentMode: 'consume-onsite' });

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

        // THE PROJECTION IS PURE: the committed agreement carries exactly what
        // the assembly composed — the template's clauses plus the companions
        // their specs declare (proximity-policy's sisterClauseId emits the
        // proximity-proof anchor at commit; nothing else is injected). Follow
        // the relayed payload to the committed agreement and assert the
        // composed clauses are all materialized — the proof section is also
        // what the runtime engine derives both witness capabilities from.
        const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? 'http://127.0.0.1:8080';
        const relayedPayload = await (await fetch(`${gateway}/ipfs/${payloadCid}`)).json() as {
            agreement?: { sections: Array<{ clause: string; data: Record<string, unknown> }> };
            agreementUri?: string;
        };
        const committedAgreement = relayedPayload.agreement
            ?? await (await fetch(`${gateway}/ipfs/${(relayedPayload.agreementUri ?? '').replace('ipfs://', '')}`)).json() as {
                sections: Array<{ clause: string; data: Record<string, unknown> }>;
            };
        const committedClauses = committedAgreement.sections.map((s) => s.clause);
        for (const composed of [
            'figaro-commerce-v1',
            'figaro-topology-v1',
            'figaro-modalities-v1',
            'figaro-handoff-v1',
            'figaro-merchant-process-v1',
            'figaro-proximity-policy-v1',
            'figaro-proximity-proof-v1',
        ]) {
            expect(committedClauses, `committed agreement materializes ${composed}`).toContain(composed);
        }

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

        // ── 3. Café walks the lifecycle + witnesses proximity — ONE rail ────
        // The rail is EVENT-DRIVEN: it re-derives from the indexer, so each
        // stage's button appears only once the prior attestation has been
        // indexed. Several generic capabilities can render at once (the
        // merchant-process ladder AND the seller's proximity witness), so every
        // click filters by the stage's own event code — as a human reads it.
        await gotoAsWallet(page, sellerAddr, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ state: 'visible', timeout: 30000 });
        const railBtn = page.getByTestId('capability-execute-submit-clause-attestation');

        for (const stage of MERCHANT_STAGES) {
            const btn = railBtn.filter({ hasText: stage });
            await expect(btn, `merchant rail surfaces ${stage}`).toBeEnabled({ timeout: 90_000 });
            await btn.click();
        }
        // The proof clause is bilateral — the seller witnesses the committed band.
        const sellerProof = railBtn.filter({ hasText: PROXIMITY_BAND });
        await expect(sellerProof, 'seller proximity witness surfaces').toBeEnabled({ timeout: 90_000 });
        await sellerProof.click();
        // UI reaction: ladder fully attested + proof witnessed → all of the
        // seller's generic capabilities retire.
        await expect(railBtn, 'seller rail retires once the clauses are run').toHaveCount(0, { timeout: 90_000 });

        // ── 4. Buyer co-witnesses proximity, then resolves ─────────────────
        await gotoAsWallet(page, BUYER_ADDR, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ state: 'visible', timeout: 30000 });

        // The committed fulfilment modality is surfaced at runtime as the
        // clause's own code (one source — the agreement; no frontend label map).
        await expect(page.getByTestId('order-fulfilment-modality'))
            .toContainText(/consume-onsite/i, { timeout: 30000 });

        // Buyer's symmetric proximity witness — same generic rail, same label.
        const buyerProof = page.getByTestId('capability-execute-submit-clause-attestation')
            .filter({ hasText: PROXIMITY_BAND });
        await expect(buyerProof, 'buyer proximity witness surfaces').toBeEnabled({ timeout: 90_000 });
        await buyerProof.click();
        await expect(buyerProof, 'buyer witness retires once the proof lands').toHaveCount(0, { timeout: 90_000 });

        // Resolve the process — also a capability (one flow). The executor
        // raises the window.confirm the persistent dialog handler accepts.
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
