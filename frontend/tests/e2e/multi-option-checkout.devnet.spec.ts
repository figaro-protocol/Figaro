/**
 * multi-option-checkout.devnet.spec.ts
 *
 * A seller binding MORE than one assembly: the checkout Method dropdown
 * exists exactly because there is a real choice (single-binding sellers
 * auto-commit and render a static method line — no one-option dropdown).
 * Switching the option swaps the agreement under review — the delivery
 * assembly brings the courier order's agreement group + the coordination
 * value; the on-site assembly is a single group. The order then commits
 * under the CHOSEN assembly.
 *
 * The seller is discovered from chain BY SHAPE (a profile binding ≥ 2
 * assemblies — populate-test-data seeds one), never by name. Manual-review
 * F2, 2026-06-12.
 *
 * Requires Anvil + ./deploy-local.sh + Kubo; scenario assemblies anchored
 * (the devnet-authoring project runs first).
 */
import { test, expect, ANVIL_ACCOUNTS, gotoAsWallet } from './devnet-multi-test';
import { createPublicClient, http, type Hex } from 'viem';
import {
    acceptOrderInInboxUI,
    discoverSellers,
    ensureTokenApprovalsByAddress,
    placeBilateralOrderUI,
    readLocalDeploymentConfig,
    CORE_PROCESS_VIEW_ABI,
    LOCAL_ANVIL,
    RPC_URL,
} from './devnet-helpers';

const BUYER_ADDR = ANVIL_ACCOUNTS[0];
const ONSITE = 'consume-onsite';

test.describe('multi-option checkout (devnet)', () => {
    // Discovery + IPFS + two agreement re-compositions + sign + commit.
    test.setTimeout(240_000);

    test('the dropdown exists because the seller binds two assemblies; switching swaps the agreement; the order commits under the chosen one', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;

        // Discover BY SHAPE from chain — never a roster: the seller whose
        // profile binds at least two assemblies.
        const sellers = await discoverSellers();
        const multi = sellers.find((s) => s.assemblyBindings.length >= 2);
        expect(multi, 'a multi-binding seller is registered (populate-test-data seeds one)').toBeTruthy();

        await ensureTokenApprovalsByAddress(coreAddress, tokenAddress, BUYER_ADDR, multi!.address);

        await placeBilateralOrderUI(page, {
            seller: multi!.address,
            method: ONSITE,
            beforePlace: async () => {
                // The dropdown renders ONLY when there is a real choice.
                const select = page.getByTestId('select-method');
                const values = await select.locator('option').evaluateAll(
                    (options) => options.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== ''),
                );
                expect(values.length, 'a dropdown means more than one option').toBeGreaterThanOrEqual(2);
                const deliverValue = values.find((v) => v !== ONSITE)!;

                // Switch to the delivery assembly: the courier order's
                // agreement group + the coordination value appear.
                await select.selectOption(deliverValue);
                await expect(page.locator('[data-testid^="agreement-order-"]')).toHaveCount(2, { timeout: 20000 });
                await expect(page.getByTestId('checkout-agreement-terms')).toContainText('seller-assigned');

                // Back to on-site: a single agreement group, the modality
                // value visible in the review.
                await select.selectOption(ONSITE);
                await expect(page.locator('[data-testid^="agreement-order-"]')).toHaveCount(1, { timeout: 20000 });
                await expect(page.getByTestId('checkout-agreement-terms')).toContainText(ONSITE);
            },
        });
        const processId = await acceptOrderInInboxUI(page, multi!.address);
        expect(processId).toMatch(/^0x[0-9a-fA-F]{64}$/);

        // Reaction in the UI: the buyer's order page renders. Out-of-band:
        // exactly ONE active order — the on-site assembly committed, not the
        // two-order delivery one.
        await gotoAsWallet(page, BUYER_ADDR, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const state = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(state[3]).toBe(1);
    });
});
