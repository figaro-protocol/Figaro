/**
 * local-commerce.devnet.spec.ts — MEAL/GROCERY DELIVERY, the local-commerce
 * runtime, end to end.
 *
 * The everyday scenario the protocol generalizes: a buyer orders a meal from
 * a merchant and a courier delivers it. Two co-equal orders — the merchant
 * order (the meal, requested as delivery via the modalities clause) and the
 * courier order (the transfer) — one process, one resolve. Every leg runs
 * THROUGH THE UI; every chain effect is verified out-of-band:
 *
 *   author   → the delivery scenario is WRITTEN on the designer canvas (a
 *              root order composing merchant-process + modalities=delivery;
 *              a drawn courier sub-order composing courier-process, the
 *              hand-off clause (face-to-face), the proximity policy nested
 *              under it (a single zone-wifi band — the hand-off witness),
 *              and geolocation with its public geohash cells — drawn, never
 *              spawned) and published to the AssemblyRegistry. Idempotent:
 *              the composition is content-addressed, so a re-run discovers
 *              the anchored assembly by SHAPE and consumes it.
 *   bind     → the merchant (Rosa's Kitchen, a pre-populated seller) pins the
 *              assembly to its profile through the seller-edit surface and
 *              DESIGNATES its courier (Cardinal Couriers); the courier pins
 *              the assembly it participates in (the even-surfacing rule:
 *              only a bound seller's catalogue is readable anywhere).
 *   checkout → the buyer orders the pizza from the merchant's page; the
 *              method line shows the delivery assembly; the P&L breakdown
 *              prices the courier LIVE from the courier's own catalogue;
 *              the buyer signs BOTH orders through the one confirm gate.
 *   accept   → merchant accepts first (root creates the process), courier
 *              second (extends it) — exact bond deltas asserted after each:
 *              buyer 2× payment per order, merchant 2×1, courier 2×2 (the
 *              courier bonds against CUMULATIVE upstream value).
 *   attest   → the story on the timeline: the merchant walks its WHOLE
 *              ladder, then the courier walks its WHOLE ladder — stage labels
 *              DERIVED from the registered specs (chain → IPFS), never a
 *              roster in this file — each stage through the ONE generic
 *              capability rail, each event landing on the timeline. The
 *              COURIER then files the zone witness of the committed
 *              single-band proximity policy through the rail's standalone
 *              witness form — evidence of the custodial transfer is the
 *              proximity clause's own capability, never engine pairing
 *              (custody is reader-derived; ruled 2026-07-28). The BUYER
 *              co-witnesses through the same form (who must witness is never
 *              engine policy). The hand-off clause's DECLARED
 *              interaction (block.runtime.interaction: qr-challenge) mounts the
 *              QR order-identity panel on the courier's page — presented
 *              payload verified round-trip; no panel on the merchant's
 *              order, which declares none. The geolocation clause's declared
 *              interaction (ecdh-address) runs the PRIVATE-ADDRESS
 *              ceremony: the courier requests, the buyer answers with the
 *              ECDH-encrypted addressee block whose fingerprint anchors
 *              on-chain (buyer attestation), the courier decrypts and the
 *              panel verifies against the anchor — the chain never learns
 *              the plaintext. The same ceremony then runs in REVERSE
 *              (driving role swapped): the courier shares its precise
 *              pickup point over the same per-order keypairs, anchored as
 *              a SELLER attestation; the buyer decrypts and verifies —
 *              one role-neutral panel, both directions.
 *   resolve  → the buyer resolves ONCE: merchant net +1, courier net +1,
 *              buyer net −2, escrow back to baseline.
 *   audit    → the full evidentiary record, permissionless-clause grade:
 *              a financial statement per seller + the consolidation; the cash-flow log
 *              carrying EVERY kernel transfer (2 rows per commit, 2 per order
 *              at resolve — 8 exactly); the clause evidence with every
 *              committed leaf, all EIGHT ladder stages and all THREE decoded hand-off witnesses; BOTH agreements
 *              pinned to IPFS with the hash verifier recomputing each merkle
 *              root to the on-chain agreementHash; the audit-bundle PDF
 *              downloaded (real %PDF bytes) and the dispute panel's evidence
 *              bundle pinned to IPFS, verified out-of-band.
 *
 * Cast (scenario labels only — the kernel sees ordinary wallets):
 *   author   anvil[0]  (any wallet designs; neither party here)
 *   buyer    anvil[2]  (used as a buyer by no other spec)
 *   merchant anvil[7]  Rosa's Kitchen  (seeded; catalogue: Margherita pizza @1)
 *   courier  anvil[8]  Cardinal Couriers (seeded; catalogue: Standard delivery @1)
 *
 * No evmSnapshot/evmRevert — devnet is a mainnet rehearsal; both gates are
 * idempotent and the run leaves its state on-chain for out-of-band checks.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + populate-test-data + Kubo + :3100.
 */
import fs from 'fs';
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createPublicClient, defineChain, http, parseAbi, parseEther, type Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import {
    assertPinnedInIpfs,
    confirmAgreementPreviews,
    DELIVERY_CLAUSES,
    DELIVERY_DEVICE,
    ensureDeliveryAssembly,
    fillDeliveryCheckout,
    ladderLabelsFromChain,
    readLocalDeploymentConfig,
    memberProfileBindings,
} from './devnet-helpers';
import { ANVIL_ACCOUNTS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';
import { computeClauseKey } from '@figaro/sdk';
import { ATTESTATION_COORDINATOR_ABI } from '@figaro/sdk';
import { calculateBonds, computeSectionLeaf, type AgreementSection } from '@figaro/sdk';
import { encodeGeohash } from '@figaro/sdk/derive';
import type { Page } from '@playwright/test';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

const BUYER = ANVIL_ACCOUNTS[2] as Hex; // anvil[2] — a buyer no other spec uses
const MERCHANT = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 7 }).address as Hex; // Rosa's Kitchen
const COURIER = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 8 }).address as Hex; // Cardinal Couriers

const {
    courier: COURIER_CLAUSE,
    merchant: MERCHANT_CLAUSE,
    modalities: MODALITIES_CLAUSE,
    handoff: HANDOFF_CLAUSE,
    geo: GEO_CLAUSE,
    proximity: PROXIMITY_CLAUSE,
} = DELIVERY_CLAUSES;

// The committed PUBLIC half of where the delivery goes lives in the shared
// DELIVERY_DEVICE (the author-if-absent helper types the destination cell;
// the device affordance reads these Playwright-set coordinates).

// The PRIVATE half — the addressee block the buyer shares over the ECDH
// channel. Never touches the chain in cleartext.
const ADDRESSEE = {
    name: 'Ada Liana',
    street: '12 Rue du Marché',
    unit: '3rd floor, door B',
    instructions: 'Ring twice.',
    // Notify-party + special-handling ride the SAME block (a BOL's consignee
    // block carries all three) — private detail, never committed clause
    // content; the notify party is data, never a participant.
    notifyName: 'Nonna Lucia',
    notifyContact: '+39 055 123 456',
    handling: 'Fragile — keep the box level',
};

// The REVERSE direction of the same ceremony — the courier's precise pickup
// point, shared buyer-ward over the same per-order keypairs (a SELLER answer,
// anchored as a seller attestation).
const PICKUP = {
    name: 'Cardinal Couriers depot',
    street: '4 Market Lane',
    unit: 'rear door',
    // Handling marks travel the reverse direction the same way.
    handling: 'This way up',
};

// The two transfer ladders' stage labels are DERIVED from the registered
// specs at run time — ClauseRegistered → contentURI → IPFS, the same read
// every consumer does. No stage roster lives in this file: if the spec's
// ladder changes, the walk follows it (`ladderLabelsFromChain`, below).

/** Wait for ClientInit's devnet auto-connect (the "Connect Wallet" button goes). */
async function waitForConnected(page: Page) {
    await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
        null,
        { timeout: 30000 },
    );
}

test.describe('LOCAL COMMERCE — meal delivery: canvas → bind → order → attest → one resolve pays both (devnet)', () => {
    test.setTimeout(480_000);

    test('the delivery scenario is authored on the canvas, pinned by its sellers, and run to a fully-attested settlement', async ({ page, browser }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

        // The transfer ladders' stage labels, derived from the REGISTERED specs
        // (chain → IPFS) — the walk follows the network's spec, never a roster.
        const merchantStages = await ladderLabelsFromChain(publicClient, config.clauseRegistry as Hex, MERCHANT_CLAUSE);
        const courierStages = await ladderLabelsFromChain(publicClient, config.clauseRegistry as Hex, COURIER_CLAUSE);

        // The device-location affordance (geolocation authoring + any runtime
        // fill) reads the browser Geolocation API — pin the coordinates.
        await page.context().grantPermissions(['geolocation']);
        await page.context().setGeolocation({ latitude: DELIVERY_DEVICE.lat, longitude: DELIVERY_DEVICE.lon });

        // ── AUTHOR (idempotent): the shared author-if-absent helper writes the
        //    scenario on the designer canvas when no anchored assembly matches
        //    the shape; a re-run adopts the anchored one (content-addressed,
        //    first-write-wins — the mainnet ensure-exists semantics). ──
        const deliverySlug = await ensureDeliveryAssembly(page);

        // The public inventory carries it — author → pin → anchor → visible.
        await page.goto('/assemblies?e2e=devnet', { waitUntil: 'domcontentloaded' });
        await expect(page.locator(`#assembly-${deliverySlug}`)).toBeVisible({ timeout: 30000 });

        // ── BIND (idempotent): the merchant pins the assembly + designates its
        //    courier through the seller-edit surface; the courier pins the
        //    assembly it participates in. Both verified out-of-band from the
        //    registry events + IPFS. ──
        const merchantConformant = async (): Promise<boolean> => {
            const bindings = await memberProfileBindings(MERCHANT);
            const binding = bindings.find((b) => b.assemblySlug === deliverySlug);
            return !!binding && (binding.counterpartyBindings ?? []).some(
                (cb) => cb.clauseId === COURIER_CLAUSE
                    && cb.addresses.some((a) => a.toLowerCase() === COURIER.toLowerCase()),
            );
        };
        if (!(await merchantConformant())) {
            await gotoAsWallet(page, MERCHANT, '/sellers/edit/assemblies?e2e=devnet');
            const row = page.getByTestId(`seller-assembly-row-${deliverySlug}`);
            await row.waitFor({ state: 'visible', timeout: 30000 });
            await row.locator('input[type="checkbox"]').first().check();
            const counterparties = page.getByTestId(`seller-assembly-counterparties-${deliverySlug}`);
            await counterparties.waitFor({ state: 'visible', timeout: 30000 });
            await counterparties.getByTestId(`counterparty-${COURIER_CLAUSE}-input-0`).fill(COURIER);
            await page.getByRole('button', { name: 'Save changes' }).click();
            await expect.poll(merchantConformant, {
                timeout: 60000, message: "the merchant's re-pinned profile carries the binding + courier designation",
            }).toBe(true);
        }
        if (!(await memberProfileBindings(COURIER)).some((b) => b.assemblySlug === deliverySlug)) {
            await gotoAsWallet(page, COURIER, '/sellers/edit/assemblies?e2e=devnet');
            const row = page.getByTestId(`seller-assembly-row-${deliverySlug}`);
            await row.waitFor({ state: 'visible', timeout: 30000 });
            await row.locator('input[type="checkbox"]').first().check();
            await page.getByRole('button', { name: 'Save changes' }).click();
            await expect.poll(async () =>
                (await memberProfileBindings(COURIER)).some((b) => b.assemblySlug === deliverySlug), {
                timeout: 60000, message: "the courier's re-pinned profile carries the binding",
            }).toBe(true);
        }

        // ── BASELINES for every party, before any bond moves. ──
        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
        });
        const committedBefore = (await queryCommitted()).length;
        const [buyer0, merchant0, courier0, core0] = await Promise.all([
            balanceOf(BUYER), balanceOf(MERCHANT), balanceOf(COURIER), balanceOf(core),
        ]);

        // ── CHECKOUT: the buyer orders the pizza with delivery. One bound
        //    assembly → the static method line names it; the breakdown prices
        //    the courier live from the courier's own catalogue. ──
        await gotoAsWallet(page, BUYER, `/s/view?seller=${MERCHANT}&e2e=devnet`);
        await page.getByTestId('seller-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });

        await expect(
            page.getByTestId('method-static'),
            "one binding → the method line names the merchant's delivery assembly",
        ).toHaveAttribute('data-method', deliverySlug!, { timeout: 30000 });
        await expect(page.getByTestId('cart-contributor-breakdown'), 'checkout shows the two-contributor P&L')
            .toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('cart-kit-total'), 'meal 1 + delivery 1').toHaveText(/^2(\.0*)?$/, { timeout: 15000 });
        await expect(page.getByTestId('checkout-locked-total'), 'the buyer locks 2× the total').toHaveText(/^4(\.0*)?$/, { timeout: 15000 });

        // The buyer authors the transaction particulars (modality request,
        // hand-off mode, proximity band, geolocation endpoints) — templates
        // arrive value-free by construction (ruled 2026-07-14).
        await fillDeliveryCheckout(page);

        const place = page.getByTestId('btn-place-order');
        await expect(place, 'buyer connected + assembly bound → "Place order"').toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        // The buyer signs BOTH orders through the same pre-sign gate every
        // order uses: the courier sub-order first (signed + auto-relayed to
        // the courier), the root last (relayed from the share panel).
        await confirmAgreementPreviews(page, 2);
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        // ── ACCEPTS in walk order (root creates the process, the sub extends
        //    it), exact bond deltas after each. ──
        const acceptAs = async (seller: Hex, label: string) => {
            const before = (await queryCommitted()).length;
            await gotoAsWallet(page, seller, '/orders?e2e=devnet');
            await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
            await waitForConnected(page);
            await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30000 });
            await page.getByTestId('btn-accept-order').first().click();
            await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
            await page.getByTestId('preview-confirm').click();
            await expect.poll(async () => (await queryCommitted()).length, {
                timeout: 60000, message: `${label}'s accept lands OrderCommitted on-chain`,
            }).toBe(before + 1);
            const events = await queryCommitted();
            const event = events[events.length - 1];
            const receipt = await publicClient.getTransactionReceipt({ hash: event.transactionHash });
            expect(receipt.status, `${label}'s commit transaction succeeded`).toBe('success');
            expect(event.args.seller?.toLowerCase(), `${label}'s order committed against ${label}`)
                .toBe(seller.toLowerCase());
            test.info().annotations.push({
                type: 'OrderCommitted',
                description: `${label}: order=${event.args.orderHash} payment=${event.args.payment} cumulativeValue=${event.args.cumulativeValue} tx=${event.transactionHash}`,
            });
            return event;
        };

        const merchantEvent = await acceptAs(MERCHANT, 'merchant');
        const processId = merchantEvent.args.processId!;
        expect(merchantEvent.args.payment, "meal payment = the merchant's catalogue price").toBe(parseEther('1'));
        expect(merchantEvent.args.cumulativeValue, 'root cumulative = its own payment').toBe(parseEther('1'));
        const merchantBonds = calculateBonds(merchantEvent.args.cumulativeValue!, merchantEvent.args.payment!);
        {
            const [b, m, c] = await Promise.all([balanceOf(BUYER), balanceOf(MERCHANT), balanceOf(core)]);
            expect(buyer0 - b, 'after the meal commit: buyer down by its buyer bond').toBe(merchantBonds.buyerBond);
            expect(merchant0 - m, 'after the meal commit: merchant down by its seller bond').toBe(merchantBonds.sellerBond);
            expect(c - core0, 'after the meal commit: escrow up by both bonds').toBe(merchantBonds.buyerBond + merchantBonds.sellerBond);
        }

        const courierEvent = await acceptAs(COURIER, 'courier');
        expect(courierEvent.args.processId, 'the courier order extends the SAME process').toBe(processId);
        expect(courierEvent.args.payment, "delivery payment = the courier's own catalogue price").toBe(parseEther('1'));
        expect(courierEvent.args.cumulativeValue, 'courier cumulative = meal + delivery').toBe(parseEther('2'));
        const courierBonds = calculateBonds(courierEvent.args.cumulativeValue!, courierEvent.args.payment!);
        {
            const [b, cr, c] = await Promise.all([balanceOf(BUYER), balanceOf(COURIER), balanceOf(core)]);
            expect(buyer0 - b, 'after the delivery commit: buyer down by both buyer bonds')
                .toBe(merchantBonds.buyerBond + courierBonds.buyerBond);
            expect(courier0 - cr, 'the courier bonds against CUMULATIVE upstream value, not just its own cut')
                .toBe(courierBonds.sellerBond);
            expect(c - core0, 'escrow holds every bond in the process').toBe(
                merchantBonds.buyerBond + merchantBonds.sellerBond
                + courierBonds.buyerBond + courierBonds.sellerBond,
            );
        }
        expect((await queryCommitted()).length, 'exactly two orders committed').toBe(committedBefore + 2);

        // ── ATTEST: the story on the timeline. Each seller walks its WHOLE
        //    ladder through the ONE generic capability rail — the rail offers
        //    exactly the next unattested stage, labelled from the clause spec;
        //    each executed stage lands on the timeline; a finished ladder
        //    leaves the rail. Ladder buttons are targeted by their clause
        //    (data-clause-id): the proximity WITNESS capability shares the
        //    rail and — by ruling — stays offered while the order is active. ──
        const walkLadder = async (seller: Hex, clauseId: string, stages: string[], label: string) => {
            await gotoAsWallet(page, seller, `/orders/view?process=${processId}&e2e=devnet`);
            await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
            await waitForConnected(page);
            const ladderBtn = page.locator(
                `[data-testid="capability-execute-submit-clause-attestation"][data-clause-id="${clauseId}"]`,
            );
            const attest = ladderBtn.first();
            for (const stage of stages) {
                await expect(attest, `the rail offers ${label}'s next stage: "${stage}"`)
                    .toContainText(stage, { timeout: 30000 });
                await expect(attest).toBeEnabled({ timeout: 30000 });
                await attest.click();
                await expect(
                    page.getByTestId('order-timeline').getByText(stage),
                    `"${stage}" lands on the timeline`,
                ).toBeVisible({ timeout: 60000 });
            }
            await expect(
                ladderBtn,
                `${label}'s ladder is fully attested — the rail offers no further stage`,
            ).toHaveCount(0, { timeout: 30000 });
        };
        await walkLadder(MERCHANT, MERCHANT_CLAUSE, merchantStages, 'the merchant');
        // The merchant's own order composes no interaction-declaring clause —
        // no surface mounts (the mount is DERIVED from the agreement's
        // declarations, never a blanket panel).
        await expect(
            page.getByTestId('interaction-qr-panel'),
            "no declared interaction on the merchant's order → no QR panel",
        ).toHaveCount(0);
        await walkLadder(COURIER, COURIER_CLAUSE, courierStages, 'the courier');

        // ── THE COURIER'S HAND-OFF WITNESS: evidence of the custodial
        //    transfer is the proximity clause's OWN standalone capability —
        //    the courier picks the detected band and files. No engine
        //    pairing: custody is reader-derived from the composed clauses'
        //    events (ruled 2026-07-28), and the diary stays a pure diary. ──
        const courierWitnessCap = page.locator(
            `[data-testid="capability-submit-clause-attestation"][data-clause-id="${PROXIMITY_CLAUSE}"]`,
        );
        await expect(courierWitnessCap, 'the witness capability derives for the courier').toBeVisible({ timeout: 30000 });
        await page.getByTestId(`capability-input-${PROXIMITY_CLAUSE}-band-zone-wifi`).check();
        await courierWitnessCap.getByTestId('capability-execute-submit-clause-attestation').click();
        // Witness rows carry the stable `timeline-event-stage-1` testid (the
        // spec title renders twice per row — eventLabel + clause line — so a
        // text count would double-count).
        await expect(
            page.getByTestId('timeline-event-stage-1'),
            "the courier's zone witness lands on the timeline",
        ).toHaveCount(1, { timeout: 60000 });
        // (clauseId, stage) is the on-chain discriminator: the courier LADDER's
        // arrived-pickup is ALSO ordinal 1, so the witness filter must pin the
        // proximity clause's id hash, not the stage alone.
        const proximityIdHash = computeClauseKey(PROXIMITY_CLAUSE, 1).toLowerCase();
        const proximityWitnessEvents = async () => (await publicClient.getContractEvents({
            address: config.attestationCoordinator as Hex, abi: ATTESTATION_COORDINATOR_ABI,
            eventName: 'Attestation', args: { processId }, fromBlock: 0n,
        })).filter((e) => e.args.stage === 1
            && (e.args.clauseId as string).toLowerCase() === proximityIdHash
            && (e.args.orderHash as string).toLowerCase() === courierEvent.args.orderHash!.toLowerCase());
        await expect.poll(async () => (await proximityWitnessEvents())
            .filter((e) => (e.args.attester as string).toLowerCase() === COURIER.toLowerCase()).length, {
            timeout: 60000, message: 'the courier-attested witness event lands at the declared stage',
        }).toBe(1);

        // ── DECLARED INTERACTION (block.runtime.interaction → registered surface):
        //    the hand-off clause on the courier order declares the
        //    qr-challenge standard, so the courier's own order page mounts
        //    the QR panel — the order's public identity over the visual
        //    channel at the physical hand-off. Verify the round-trip: the
        //    presented payload identifies THIS order and scanning it back
        //    confirms the match. ──
        await expect(
            page.getByTestId('interaction-qr-panel'),
            "the hand-off clause's declared interaction mounts on the courier's order page",
        ).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('interaction-qr-image'), 'the QR code renders').toBeVisible({ timeout: 15000 });
        const qrPayload = (await page.getByTestId('interaction-qr-payload').textContent())?.trim();
        const qrIdentity = JSON.parse(qrPayload!) as { processId: string; orderHash: string };
        expect(qrIdentity.processId.toLowerCase(), 'the QR carries THIS process').toBe(processId.toLowerCase());
        expect(qrIdentity.orderHash.toLowerCase(), "the QR carries the courier order's hash")
            .toBe(courierEvent.args.orderHash!.toLowerCase());
        await page.getByTestId('interaction-qr-scan-input').fill(qrPayload!);
        await expect(
            page.getByTestId('interaction-qr-match'),
            'a scanned matching payload verifies against this order',
        ).toBeVisible({ timeout: 10000 });

        // ── THE PRIVATE-ADDRESS CEREMONY (block.runtime.interaction: ecdh-address
        //    on the geolocation clause): the agreement committed only the
        //    geohash cells; the door-level ADDRESSEE BLOCK travels the ECDH
        //    channel, and its fingerprint anchors on-chain as a buyer
        //    attestation — the chain never learns the plaintext. Timing
        //    mirrors courier practice: cell before accept (bonded on), exact
        //    door after. ──
        // The courier (still on its order page) requests the address.
        await expect(
            page.getByTestId('interaction-address-panel'),
            "the geolocation clause's declared interaction mounts on the courier's page",
        ).toBeVisible({ timeout: 15000 });
        await page.getByTestId('interaction-address-request').click();

        // The buyer answers: fills the addressee block, sends it encrypted,
        // and the anchor lands on-chain (poll the Attestation event —
        // chain truth, out-of-band).
        const attestationsBefore = (await publicClient.getContractEvents({
            address: config.attestationCoordinator as Hex, abi: ATTESTATION_COORDINATOR_ABI,
            eventName: 'Attestation', args: { attester: BUYER }, fromBlock: 0n,
        })).length;
        await gotoAsWallet(page, BUYER, `/orders/view?process=${processId}&e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await page.getByTestId('interaction-address-name').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('interaction-address-name').fill(ADDRESSEE.name);
        await page.getByTestId('interaction-address-street').fill(ADDRESSEE.street);
        await page.getByTestId('interaction-address-unit').fill(ADDRESSEE.unit);
        await page.getByTestId('interaction-address-instructions').fill(ADDRESSEE.instructions);
        await page.getByTestId('interaction-address-handling').fill(ADDRESSEE.handling);
        await page.getByTestId('interaction-address-notifyName').fill(ADDRESSEE.notifyName);
        await page.getByTestId('interaction-address-notifyContact').fill(ADDRESSEE.notifyContact);
        await page.getByTestId('interaction-address-send').click();
        await expect(
            page.getByTestId('interaction-address-sent'),
            'the buyer shared the address privately + anchored its fingerprint',
        ).toBeVisible({ timeout: 60000 });
        await expect.poll(async () => (await publicClient.getContractEvents({
            address: config.attestationCoordinator as Hex, abi: ATTESTATION_COORDINATOR_ABI,
            eventName: 'Attestation', args: { attester: BUYER }, fromBlock: 0n,
        })).length, { timeout: 60000, message: "the buyer's anchor attestation lands on-chain" })
            .toBe(attestationsBefore + 1);
        const anchorEvents = await publicClient.getContractEvents({
            address: config.attestationCoordinator as Hex, abi: ATTESTATION_COORDINATOR_ABI,
            eventName: 'Attestation', args: { attester: BUYER }, fromBlock: 0n,
        });
        expect(
            (anchorEvents.at(-1)!.args as { orderHash?: string }).orderHash?.toLowerCase(),
            "the anchor binds the courier order's geolocation section",
        ).toBe(courierEvent.args.orderHash!.toLowerCase());

        // The courier decrypts and the panel verifies the received blob
        // against the on-chain anchor — readable address, tamper-evident.
        await gotoAsWallet(page, COURIER, `/orders/view?process=${processId}&e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addressDetail = page.getByTestId('interaction-address-detail');
        await addressDetail.waitFor({ state: 'visible', timeout: 30000 });
        await expect(addressDetail, 'the courier reads the decrypted addressee block')
            .toContainText(ADDRESSEE.street);
        await expect(addressDetail).toContainText(ADDRESSEE.name);
        await expect(addressDetail).toContainText(ADDRESSEE.unit);
        await expect(
            page.getByTestId('interaction-address-detail-handling'),
            'the courier reads the special-handling marks',
        ).toContainText(ADDRESSEE.handling);
        await expect(
            page.getByTestId('interaction-address-detail-notify'),
            'the courier reads who to notify on arrival, contact included',
        ).toContainText(`${ADDRESSEE.notifyName} — ${ADDRESSEE.notifyContact}`);
        await expect(
            page.getByTestId('interaction-address-verified'),
            'the decrypted detail matches the on-chain anchor',
        ).toBeVisible({ timeout: 30000 });

        // ── THE REVERSE DRIVING ROLE — same interaction, wallets swapped:
        //    the ceremony is SYMMETRIC over the order edge. The buyer's
        //    ephemeral pubkey is already on the channel (it rode the answer),
        //    so the COURIER — this order's SELLER — shares ITS precise pickup
        //    point, encrypted to the buyer, its fingerprint anchored as a
        //    SELLER attestation on the same geolocation section. One
        //    role-neutral panel drives both directions. ──
        const sellerAnchorsBefore = (await publicClient.getContractEvents({
            address: config.attestationCoordinator as Hex, abi: ATTESTATION_COORDINATOR_ABI,
            eventName: 'Attestation', args: { attester: COURIER }, fromBlock: 0n,
        })).length;
        await page.getByTestId('interaction-address-name').fill(PICKUP.name);
        await page.getByTestId('interaction-address-street').fill(PICKUP.street);
        await page.getByTestId('interaction-address-unit').fill(PICKUP.unit);
        await page.getByTestId('interaction-address-handling').fill(PICKUP.handling);
        await page.getByTestId('interaction-address-send').click();
        await expect(
            page.getByTestId('interaction-address-sent'),
            'the courier shared its pickup point privately + anchored its fingerprint',
        ).toBeVisible({ timeout: 60000 });
        await expect.poll(async () => (await publicClient.getContractEvents({
            address: config.attestationCoordinator as Hex, abi: ATTESTATION_COORDINATOR_ABI,
            eventName: 'Attestation', args: { attester: COURIER }, fromBlock: 0n,
        })).length, { timeout: 60000, message: "the courier's anchor lands as a SELLER attestation" })
            .toBe(sellerAnchorsBefore + 1);
        const sellerAnchorEvents = await publicClient.getContractEvents({
            address: config.attestationCoordinator as Hex, abi: ATTESTATION_COORDINATOR_ABI,
            eventName: 'Attestation', args: { attester: COURIER }, fromBlock: 0n,
        });
        expect(
            (sellerAnchorEvents.at(-1)!.args as { orderHash?: string }).orderHash?.toLowerCase(),
            "the seller anchor binds the same courier order's geolocation section",
        ).toBe(courierEvent.args.orderHash!.toLowerCase());

        // The BUYER decrypts the pickup point and the panel verifies it
        // against the courier's on-chain anchor — the receiving seat this
        // time, same tamper-evidence.
        await gotoAsWallet(page, BUYER, `/orders/view?process=${processId}&e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const pickupDetail = page.getByTestId('interaction-address-detail');
        await pickupDetail.waitFor({ state: 'visible', timeout: 30000 });
        await expect(pickupDetail, 'the buyer reads the decrypted pickup point')
            .toContainText(PICKUP.street);
        await expect(pickupDetail).toContainText(PICKUP.name);
        await expect(pickupDetail).toContainText(PICKUP.unit);
        await expect(
            page.getByTestId('interaction-address-detail-handling'),
            'handling marks travel the reverse direction too',
        ).toContainText(PICKUP.handling);
        await expect(
            page.getByTestId('interaction-address-verified'),
            "the pickup point matches the courier's on-chain anchor",
        ).toBeVisible({ timeout: 30000 });

        // ── BUYER CO-WITNESS: the same witness capability derives for the
        //    BUYER (who must witness is never engine policy — bilateral when
        //    both are present, unilateral + device identifier at a dead drop).
        //    The buyer files through the rail's standalone witness form. ──
        const buyerWitnessCap = page.locator(
            `[data-testid="capability-submit-clause-attestation"][data-clause-id="${PROXIMITY_CLAUSE}"]`,
        );
        await expect(buyerWitnessCap, 'the witness capability derives for the buyer too').toBeVisible({ timeout: 30000 });
        await page.getByTestId(`capability-input-${PROXIMITY_CLAUSE}-band-zone-wifi`).check();

        // ── DEVICE-LAYER EVIDENCE: the buyer captures the geolocation
        //    cross-check — the universal browser capture (NFC/BLE are
        //    progressive per device; headless Chromium has neither) — and the
        //    pinned artifact's URI fills the witness's evidenceUri through the
        //    format-registry input. The spec declares the format; the field
        //    gets the capture with zero clause-specific code. ──
        await page.getByTestId(`capability-input-${PROXIMITY_CLAUSE}-evidenceUri-capture-geolocation-cross-check`).click();
        const evidenceField = page.getByTestId(`capability-input-${PROXIMITY_CLAUSE}-evidenceUri`);
        await expect.poll(async () => evidenceField.inputValue(), {
            timeout: 30000, message: 'the captured evidence pins and its URI fills the field',
        }).toMatch(/^ipfs:\/\/.+/);
        const evidenceUri = await evidenceField.inputValue();
        // Out-of-band: the pinned artifact is REAL — fetch it straight from
        // the Kubo API. The PUBLIC artifact carries the mechanism grain only:
        // the mocked device's position appears as its ≤6-char geohash CELL
        // plus the raw capture's hash — raw coordinates never leave the device
        // (the boundary rule, ARCHITECTURE.md § "The other boundary").
        {
            const cid = evidenceUri.replace('ipfs://', '');
            const res = await fetch(`http://127.0.0.1:5001/api/v0/cat?arg=${encodeURIComponent(cid)}`, { method: 'POST' });
            expect(res.ok, 'the evidence artifact is fetchable from Kubo').toBe(true);
            const evidence = await res.json() as { kind: string; lat?: number; lon?: number; geohash?: string; rawCaptureHash?: string };
            expect(evidence.kind, 'the artifact records the capture kind').toBe('geolocation-cross-check');
            expect(evidence.geohash, "the capture is the DEVICE's CELL (the mocked geolocation, neighborhood grade)")
                .toBe(encodeGeohash(DELIVERY_DEVICE.lat, DELIVERY_DEVICE.lon, 6));
            expect(evidence.lat, 'raw coordinates never reach the public artifact').toBeUndefined();
            expect(evidence.lon).toBeUndefined();
            expect(evidence.rawCaptureHash, 'the device-held raw capture is bound for dispute-time revelation')
                .toMatch(/^0x[0-9a-f]{64}$/);
        }

        await buyerWitnessCap.getByTestId('capability-execute-submit-clause-attestation').click();
        await expect(
            page.getByTestId('timeline-event-stage-1'),
            "the buyer's co-witness joins the courier's witness on the timeline",
        ).toHaveCount(2, { timeout: 60000 });
        await expect.poll(async () => (await proximityWitnessEvents())
            .filter((e) => (e.args.attester as string).toLowerCase() === BUYER.toLowerCase()).length, {
            timeout: 60000, message: 'the buyer-attested witness event lands at the declared stage',
        }).toBe(1);

        // ── RESOLVE: buyer dominance — one signature settles both orders. ──
        const resolvedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length;
        await gotoAsWallet(page, BUYER, `/orders/view?process=${processId}&e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await expect(resolveBtn, 'the buyer can resolve the active process').toBeEnabled({ timeout: 30000 });
        await resolveBtn.click();
        await expect.poll(async () => (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length, { timeout: 60000, message: 'ProcessResolved lands on-chain' }).toBe(resolvedBefore + 1);

        // ── SETTLEMENT: the whole point — one signature pays the meal AND the
        //    delivery; the bonds were the mechanism, the net is the trade. ──
        const [buyerF, merchantF, courierF, coreF] = await Promise.all([
            balanceOf(BUYER), balanceOf(MERCHANT), balanceOf(COURIER), balanceOf(core),
        ]);
        expect(buyer0 - buyerF, 'buyer net paid meal + delivery').toBe(parseEther('2'));
        expect(merchantF - merchant0, 'merchant net earned exactly the meal price').toBe(parseEther('1'));
        expect(courierF - courier0, 'courier net earned exactly the delivery price').toBe(parseEther('1'));
        expect(coreF, 'FigaroCore escrow returned to its baseline').toBe(core0);

        // ── THE EVIDENCE WINDOW CLOSES AT RESOLVE (DESIGN_DECISIONS §7): the
        //    settled institution accepts no further attestations — the rail
        //    derives nothing for any party, witness capabilities included
        //    (on-chain, AttestationCoordinator reverts OrderResolved). ──
        await gotoAsWallet(page, COURIER, `/orders/view?process=${processId}&e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await expect(
            page.getByTestId('capability-execute-submit-clause-attestation'),
            'no attestation capability survives resolution — the evidence window is closed',
        ).toHaveCount(0, { timeout: 30000 });

        // ── AUDIT: the full evidentiary record — the financial statements
        //    (one per seller + the consolidation), the cash-flow log, every
        //    committed leaf, all EIGHT ladder stages and the TWO decoded witnesses, read from network
        //    state. The statements are documents drawn by the one generic
        //    renderer — no bespoke financials layout, no per-order "line item"
        //    breakdown (that is the invoice, carried in the audit bundle). ──
        await page.goto(`/audit/view?process=${processId}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('audit-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await expect(page.getByTestId('financials-view')).toBeVisible({ timeout: 30000 });
        // One individual statement per seller (merchant + courier) …
        await expect(
            page.locator('[data-testid="document-financial-statements-seller"]'),
            'one financial-statements document per seller',
        ).toHaveCount(2, { timeout: 30000 });
        // … plus the assembly consolidation, carrying a balance sheet + income statement.
        const consolidated = page.getByTestId('document-financial-statements-process');
        await expect(consolidated, 'the consolidated statement renders').toBeVisible({ timeout: 30000 });
        await expect(consolidated.getByText(/^Balance sheet ·/).first()).toBeVisible();
        await expect(consolidated.getByText(/^Income statement ·/).first()).toBeVisible();

        const evidence = page.getByTestId('audit-clause-evidence');
        await evidence.waitFor({ state: 'visible', timeout: 30000 });
        for (const text of [
            'Commerce terms',
            'Order topology',
            'Modalities',
            'Hand-off point',
            'Geolocation',
            'Merchant internal process events',
            'Courier internal process events',
            'Proximity-verification policy',
            ...merchantStages,
            ...courierStages,
        ]) {
            await expect(
                evidence.getByText(text).first(),
                `the "${text}" evidence leaf surfaces in the audit`,
            ).toBeVisible({ timeout: 30000 });
        }

        // The two hand-off witnesses (the courier's + the buyer's co-witness),
        // each receipted by the FINGERPRINT the chain carries. The detected band
        // and the device-captured evidence URI are part of the witness preimage,
        // which never enters calldata (WS2) — so neither is renderable from chain
        // data alone, and asserting them here asserted a decode that could only
        // ever fail silently. Restoring those two readings needs published
        // public-disposition witness content; punch-listed.
        const witnessRef = evidence.locator(`[data-testid="audit-content-ref-${PROXIMITY_CLAUSE}-1"]`);
        await expect(witnessRef, 'every witness record is receipted in the audit').toHaveCount(2, { timeout: 60000 });
        await expect(witnessRef.first().getByText(/^0x[0-9a-fA-F]{64}$/)).toBeVisible();

        // ── EVERY MONEY EVENT: one cash-flow row per kernel ERC-20 transfer —
        //    each commit pulls both deposits, the resolve refunds the buyer and
        //    pays out the seller, per order: exactly 8 rows, 2 of each kind. The
        //    cash flow is the consolidated statement's line table. ──
        const cashflowRows = page.locator('[data-testid="document-lines-financial-statements-process"] tbody tr');
        await expect(cashflowRows, 'one cash-flow row per kernel transfer').toHaveCount(8, { timeout: 30000 });
        for (const [kind, count] of [
            ['commit-buyer-deposit', 2],
            ['commit-seller-deposit', 2],
            ['resolve-buyer-refund', 2],
            ['resolve-seller-payout', 2],
        ] as const) {
            await expect(cashflowRows.filter({ hasText: kind }), `${count}× ${kind}`).toHaveCount(count);
        }

        // ── THE SIGNED CONTRACTS: each order's agreement is pinned to IPFS
        //    (the network SSoT, not a local cache) and the audit's hash
        //    verifier recomputes each merkle root over EVERY leaf to match the
        //    agreementHash the kernel stored — for BOTH orders. ──
        const ipfsApi = process.env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
        let deliverySections: AgreementSection[] = [];
        for (const [event, label, expectedLeaves] of [
            [merchantEvent, 'meal', ['figaro-commerce', 'figaro-topology', MERCHANT_CLAUSE, MODALITIES_CLAUSE]],
            [courierEvent, 'delivery', ['figaro-commerce', 'figaro-topology', COURIER_CLAUSE, HANDOFF_CLAUSE, GEO_CLAUSE, PROXIMITY_CLAUSE]],
        ] as const) {
            const agreementHash = event.args.agreementHash as `0x${string}`;
            const agreementUri = await page.evaluate(
                (key) => window.localStorage.getItem(key),
                `figaro:agreement-uri:${agreementHash}`,
            );
            expect(agreementUri, `the ${label} agreement has a network (IPFS) locator`).toMatch(/^ipfs:\/\//);
            const agreementCid = agreementUri!.replace(/^ipfs:\/\//, '');
            await assertPinnedInIpfs(agreementCid);
            const agreementJson = await (await fetch(`${ipfsApi}/api/v0/cat?arg=${agreementCid}`, { method: 'POST' })).text();
            const agreement = JSON.parse(agreementJson) as { sections: AgreementSection[] };
            if (label === 'delivery') deliverySections = agreement.sections;
            expect(
                agreement.sections.map((s) => s.clause),
                `the ${label} merkle tree carries every committed leaf`,
            ).toEqual(expect.arrayContaining([...expectedLeaves]));
            await page.getByTestId('verify-mode-agreement').click();
            await page.getByTestId('verify-agreement-input').fill(agreementJson);
            await page.getByTestId('verify-agreement-expected').fill(agreementHash);
            await expect(
                page.getByTestId('verify-result-status'),
                `the recomputed ${label} root matches the on-chain agreementHash`,
            ).toHaveText(/Matches expected hash/, { timeout: 15000 });
        }

        // ── SELECTIVE DISCLOSURE (Mode B — the privacy model, post the
        //    2026-07-02 cleartext ruling): a party reveals ONE section of a
        //    signed agreement and proves it belongs to the on-chain commitment,
        //    disclosing nothing else. Disclose only the delivery order's
        //    commerce section: the verifier recomputes its leaf hash from the
        //    pasted section alone and it matches the leaf the reference
        //    implementation derives — the same leaf under the agreement root
        //    already verified against the kernel above. No redaction artifact;
        //    the merkle structure IS the disclosure control. ──
        const disclosed = deliverySections.find((s) => s.clause === 'figaro-commerce');
        expect(disclosed, 'the delivery agreement carries a commerce section to disclose').toBeTruthy();
        await page.getByTestId('verify-mode-section').click();
        await page.getByTestId('verify-section-input').fill(JSON.stringify(disclosed));
        await page.getByTestId('verify-section-expected').fill(computeSectionLeaf(disclosed!));
        await expect(
            page.getByTestId('verify-result-status'),
            'the disclosed section alone proves against its committed leaf',
        ).toHaveText(/Matches expected hash/, { timeout: 15000 });

        // ── THE PDFs: (1) the audit-bundle PDF builds in-browser and
        //    downloads — a real PDF carrying the document set; (2) the dispute
        //    panel builds the same bundle and PINS it to IPFS — the
        //    timestamped evidence hand-off for an off-chain forum, its pin
        //    verified out-of-band. ──
        const downloadPromise = page.waitForEvent('download');
        await page.getByTestId('download-audit-bundle-button').click();
        const download = await downloadPromise;
        expect(download.suggestedFilename(), 'the audit bundle downloads as a process-named PDF')
            .toBe(`audit-bundle-${processId.slice(0, 10)}.pdf`);
        const pdfPath = await download.path();
        const pdfBytes = fs.readFileSync(pdfPath!);
        expect(pdfBytes.subarray(0, 5).toString(), 'the bundle is a real PDF').toBe('%PDF-');
        expect(pdfBytes.length, 'the bundle carries the document set, not a stub').toBeGreaterThan(5_000);

        await page.getByTestId('dispute-evidence-prepare').click();
        const evidenceResult = page.getByTestId('dispute-evidence-result');
        await evidenceResult.waitFor({ state: 'visible', timeout: 60000 });
        const bundleUri = (await evidenceResult.locator('p').first().textContent())?.trim();
        expect(bundleUri, 'the evidence bundle has an IPFS locator').toMatch(/^ipfs:\/\//);
        await assertPinnedInIpfs(bundleUri!.replace(/^ipfs:\/\//, ''));

        // ── SPECTATOR: outside-legibility. The same audit record, read with NO
        //    wallet — a fresh context with no injected provider (window.ethereum
        //    is undefined; the multi-account init script never ran here). Every
        //    CHAIN-derived surface renders for the walletless reader: the
        //    financial statements (per seller + consolidated), all eight
        //    cash-flow rows. Agreement
        //    BODIES are correctly absent — the chain stores only the fingerprint
        //    and the witnessed-URI pointer is party knowledge (agreementFetch:
        //    "you can't fetch a body you were never pointed at"); a party shares
        //    the pinned bundle to hand a forum the cleartext. Read = no account,
        //    no connection, just the process ID. ──
        const spectator = await browser.newContext({
            baseURL: test.info().project.use.baseURL,
        });
        const spectatorPage = await spectator.newPage();
        await spectatorPage.goto(`/audit/view?process=${processId}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        expect(
            await spectatorPage.evaluate(() => (window as { ethereum?: unknown }).ethereum === undefined),
            'the spectator context has NO wallet provider at all',
        ).toBe(true);
        await spectatorPage.getByTestId('audit-page').waitFor({ timeout: 30000 });
        await expect(
            spectatorPage.getByTestId('financials-view'),
            'the process financials render for a walletless reader',
        ).toBeVisible({ timeout: 30000 });
        await expect(
            spectatorPage.locator('[data-testid="document-financial-statements-seller"]'),
            'both sellers surface an individual statement for a walletless reader',
        ).toHaveCount(2, { timeout: 30000 });
        await expect(
            spectatorPage.locator('[data-testid="document-lines-financial-statements-process"] tbody tr'),
            'every kernel transfer renders for a walletless reader',
        ).toHaveCount(8, { timeout: 30000 });
        await spectator.close();
    });
});
