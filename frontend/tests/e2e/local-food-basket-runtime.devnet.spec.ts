/**
 * local-food-basket-runtime.devnet.spec.ts
 *
 * RUNTIME (lifecycle Phase 4) for the `local-food-basket` scenario — the
 * FIRST multi-contributor process: a hub coordinates two independent
 * producers and a courier, four bonded relationships the buyer commits to
 * atomically, every role through its own UI:
 *
 *   1. The hub (anvil[4]) is seeded binding the assembly; its profile
 *      DESIGNATES the contributors via ordered counterpartyBindings — the
 *      courier-process binding names the courier; the topology binding's
 *      address array fills the two BARE producer orders in commit order
 *      (farm, then bakery). Producers (anvil[17]/[18]) are seeded with
 *      single-item catalogues — each sub-order prices LIVE from its own
 *      seller's first available item.
 *   2. Buyer places ONE basket order; the 4-node assembly relays all four;
 *      each seller counter-signs its OWN order in its inbox, in plan order
 *      (the kernel's cumulative-value chain makes commit order load-bearing).
 *   3. The hub walks its merchant-process ladder; the courier walks its
 *      ladder + witnesses proximity; the BARE producer orders compose no
 *      runtime clauses — nothing to walk, by design.
 *   4. Buyer co-witnesses the courier order's proof and resolves — atomic
 *      settlement of all four orders.
 *
 * PERSISTED, like mainnet: no chain snapshot/revert.
 *
 * Prerequisite: scenario-local-food-basket (anchors the assembly) on this
 * devnet; the courier is chain-discovered (the local-commerce designee).
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + the dev server.
 */
import { test, expect, ANVIL_ACCOUNTS } from './devnet-multi-test';
import { parseToken } from '../../lib/shared/utils';
import { type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CORE_ABI } from '@figaro/core';
import {
    CORE_PROCESS_VIEW_ABI,
    courierAddressFor,
    discoverSellerByAssembly,
    discoverSellers,
    ensureTokenApprovalsByAddress,
    localPublicClient,
    acceptOrderInInboxUI,
    pinJSONToIPFS,
    placeBilateralOrderUI,
    readLocalDeploymentConfig,
    seedRegisteredSeller,
    walkClauseAttestations,
} from './devnet-helpers';
import { anvilKeyAt } from '../anvilAccounts';

const BUYER_ADDR = ANVIL_ACCOUNTS[0] as Hex;
// The hub — this spec's own seller, at a wallet no scenario seller uses.
const HUB_KEY = anvilKeyAt(4);
const HUB_ADDR = privateKeyToAccount(HUB_KEY).address;
// The producers — derived live from the default mnemonic. Index census:
// 0-3 keys table, 4 hub, 5-12 populate sellers, 13 wizard, 14-16 the
// permissionless probes — 17/18 are free.
const FARM_KEY = anvilKeyAt(17);
const FARM_ADDR = privateKeyToAccount(FARM_KEY).address;
const BAKERY_KEY = anvilKeyAt(18);
const BAKERY_ADDR = privateKeyToAccount(BAKERY_KEY).address;
// Producer catalogue prices — each sub-order commits at its seller's own
// first-available item price (the live-pricing rule, lead included).
const FARM_PRICE = '0.2';
const BAKERY_PRICE = '0.1';

async function seedContributor(opts: {
    key: `0x${string}`; address: string; name: string;
    itemId: string; itemName: string; price: string; category: string;
    tokenAddress: Hex;
}): Promise<void> {
    const { uri: catalogueURI } = await pinJSONToIPFS({
        subjectAddress: opts.address,
        version: '1.0.0',
        unitSystem: 'metric' as const,
        menu: [{
            id: opts.itemId,
            name: opts.itemName,
            description: `Seeded by local-food-basket-runtime`,
            price: opts.price,
            pricingPolicy: 'fixed',
            category: opts.category,
            available: true,
        }],
    });
    await seedRegisteredSeller({
        walletKey: opts.key,
        profile: {
            name: opts.name,
            description: 'local-food-basket contributor',
            catalogueURI,
            acceptedTokens: [{ address: opts.tokenAddress, symbol: 'MOCK', chainId: 31337 }],
            defaultTokenAddress: opts.tokenAddress,
        },
    });
}

test.describe('local-food-basket runtime — 4-order multi-contributor commit, coordination, resolve (devnet)', () => {
    // Three seeds + a 4-order commit (4 inbox accepts) + two walks + witness +
    // resolve — every role through its UI.
    test.setTimeout(540_000);

    test('buyer commits the 4-order basket; hub + courier coordinate; buyer resolves — all through the UI', async ({ page }) => {
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;
        const publicClient = localPublicClient();

        // The courier is chain-discovered (the local-commerce designee).
        const sellers = await discoverSellers();
        const lcMerchant = await discoverSellerByAssembly('local-commerce', { withCourier: true }, sellers);
        const courierAddr = courierAddressFor(lcMerchant, 'local-commerce');

        // ── Seed the hub + the two producers (idempotent re-registration) ──
        await seedContributor({
            key: FARM_KEY, address: FARM_ADDR, name: 'Stonebrook Farm',
            itemId: 'produce-box', itemName: 'Produce box', price: FARM_PRICE,
            category: 'produce', tokenAddress,
        });
        await seedContributor({
            key: BAKERY_KEY, address: BAKERY_ADDR, name: 'Hearth Bakery',
            itemId: 'bread-loaf', itemName: 'Bread loaf', price: BAKERY_PRICE,
            category: 'bread', tokenAddress,
        });
        // The hub binds the assembly and DESIGNATES the contributors. Binding
        // ORDER is load-bearing: every node carries figaro-topology-v1, so the
        // courier-process binding must come FIRST or the courier order would
        // consume a producer address; the topology binding's array then fills
        // the two bare producer orders in commit order.
        const { uri: hubCatalogueURI } = await pinJSONToIPFS({
            subjectAddress: HUB_ADDR,
            version: '1.0.0',
            unitSystem: 'metric' as const,
            menu: [{
                id: 'basket-weekly',
                name: 'Weekly basket',
                description: 'The hub-assembled local-food basket',
                price: '0.5',
                pricingPolicy: 'fixed',
                category: 'basket',
                available: true,
            }],
        });
        await seedRegisteredSeller({
            walletKey: HUB_KEY,
            profile: {
                name: 'Commons Food Hub',
                description: 'Aggregates independent local producers',
                catalogueURI: hubCatalogueURI,
                acceptedTokens: [{ address: tokenAddress, symbol: 'MOCK', chainId: 31337 }],
                defaultTokenAddress: tokenAddress,
                assemblyBindings: [{
                    bindingId: `local-food-basket:${HUB_ADDR.toLowerCase()}`,
                    subjectAddress: HUB_ADDR as `0x${string}`,
                    assemblySlug: 'local-food-basket',
                    counterpartyBindings: [
                        { clauseId: 'figaro-courier-process-v1', addresses: [courierAddr] },
                        { clauseId: 'figaro-topology-v1', addresses: [FARM_ADDR, BAKERY_ADDR] },
                    ],
                }],
            },
        });

        await ensureTokenApprovalsByAddress(
            coreAddress, tokenAddress,
            BUYER_ADDR, HUB_ADDR, FARM_ADDR, BAKERY_ADDR, courierAddr,
        );

        // ── 1. Buyer commits the basket: ONE order placed, FOUR relayed ─────
        await placeBilateralOrderUI(page, {
            seller: HUB_ADDR,
            method: 'deliver:seller-assigned',
        });
        // Counter-signs in PLAN order — the kernel's cumulative-value chain
        // makes commit order load-bearing: root first, then farm, bakery,
        // courier (the template's topological order).
        const processId = await acceptOrderInInboxUI(page, HUB_ADDR);
        await acceptOrderInInboxUI(page, FARM_ADDR);
        await acceptOrderInInboxUI(page, BAKERY_ADDR);
        await acceptOrderInInboxUI(page, courierAddr);

        const committed = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(committed[0].toLowerCase()).toBe(BUYER_ADDR.toLowerCase()); // rootBuyer
        expect(committed[3]).toBe(4); // hub + farm + bakery + courier, all active

        // Each producer's order committed at ITS OWN catalogue price — the
        // live-pricing rule, verified out-of-band per seller.
        const orders = await publicClient.getContractEvents({
            address: coreAddress, abi: CORE_ABI, eventName: 'OrderCommitted',
            args: { processId }, fromBlock: 0n,
        });
        expect(orders.length).toBe(4);
        const paymentOf = (addr: string) => (orders.find(
            (e) => ((e.args as { seller?: string }).seller ?? '').toLowerCase() === addr.toLowerCase(),
        )?.args as { payment?: bigint } | undefined)?.payment;
        expect(paymentOf(FARM_ADDR)).toBe(parseToken(FARM_PRICE, 18));
        expect(paymentOf(BAKERY_ADDR)).toBe(parseToken(BAKERY_PRICE, 18));

        // ── 2. Hub + courier coordinate — the ONE clause-agnostic rail. The
        //    BARE producer orders compose no runtime clauses: nothing to walk,
        //    by design (a supply order is just a bonded relationship). The hub
        //    composes NO proximity of its own, so its handed-off click
        //    CROSS-WITNESSES the proof on the courier order (the topology-
        //    adjacent carrier — both edge-sellers witness the same proof);
        //    the courier's arrived-pickup pairs its own-order witness. ───────
        await walkClauseAttestations(page, {
            wallet: HUB_ADDR, processId, clicks: 3, who: 'hub',
        });
        await walkClauseAttestations(page, {
            wallet: courierAddr, processId, clicks: 5, who: 'courier',
        });

        // ── 3. Buyer co-witnesses the courier order's proof, then resolves ──
        await walkClauseAttestations(page, {
            wallet: BUYER_ADDR, processId, clicks: 1, who: 'buyer',
        });
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await resolveBtn.waitFor({ state: 'visible', timeout: 30000 });
        await resolveBtn.click();

        await expect(page.getByTestId('order-status-pill')).toHaveText(/Completed/i, { timeout: 90000 });

        // Out-of-band: atomic settlement zeroed all four active orders.
        const resolved = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(Number(resolved[3])).toBe(0);
    });
});
