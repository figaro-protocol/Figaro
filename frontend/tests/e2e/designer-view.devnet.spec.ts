/**
 * designer-view.devnet.spec.ts
 *
 * Phase 5 A9: the read-only assembly inspector at
 * /assemblies/designer/view (`ViewAssemblyClient`). No devnet spec
 * covered the on-chain read-only resolution path before.
 *
 * `ViewAssemblyClient` resolves a slug from a localStorage draft first,
 * else from the chain (`AssemblyRegistered` event → IPFS assemblyTemplate), else
 * an error. This spec covers the on-chain branch and the not-found branch:
 *
 *   1. Publish an assembly via the canvas, then open /view/<slug> — it
 *      resolves from chain, the source badge reads "on-chain", the node states
 *      the clause the composition carries (read out of the PINNED template,
 *      the same reading the review screen makes of the bytes it is about to
 *      anchor), and a published assembly offers Fork (not Edit).
 *      Fork it unchanged and open its Review: the fork's composition hash is
 *      the anchored one (`AssemblyRegistry.bindings` read out-of-band), so the
 *      Review screen says it is already anchored and publish stays closed.
 *   2. A slug that is neither a draft nor on-chain → the not-found error.
 *
 * Additive UI-tier coverage. Requires Anvil + ./deploy-local.sh + Kubo.
 */
import type { Hex } from 'viem';
import { test, expect, ANVIL_ACCOUNTS } from './devnet-multi-test';
import { publishProbeAssembly } from './probeAssembly';
import { discoverAnchoredAssemblies, localPublicClient, readLocalDeploymentConfig } from './devnet-helpers';
import { ASSEMBLY_REGISTRY_ABI } from '@/lib/kernel/contracts';
import { deriveAssemblySlug } from '@/lib/shared/assemblyTemplate';


test.describe('Assembly read-only inspector — /view?slug= (devnet)', () => {

    // The publish leg is canvas → review → IPFS pin → on-chain tx.
    test.setTimeout(180_000);

    test('publishes an assembly, then inspects it read-only at /view?slug=', async ({ page }) => {
        // Publish a per-run-unique assembly via the REAL canvas (the nonce lives
        // in the probe clause id, so the content-derived slug is fresh each run —
        // no snapshot/revert needed; devnet is a mainnet rehearsal).
        const { slug, name, clauseId } = await publishProbeAssembly(page);

        // ── The publish actually anchored, read back out-of-band ─────
        const anchored = (await discoverAnchoredAssemblies()).some((t) => t.slug === slug);
        expect(anchored, 'the published probe assembly is anchored on AssemblyRegistry').toBe(true);

        // ── Inspect the published assembly read-only ─────────────────
        // The publish flow deleted the local draft, so /view/<slug> resolves from
        // chain. `just-published=1` rides out the AssemblyRegistered indexer race.
        await page.goto(
            `/assemblies/designer/view?slug=${slug}&just-published=1&e2e=devnet`,
            { waitUntil: 'domcontentloaded' },
        );

        await expect(page.getByTestId('assembly-view-page')).toBeVisible({ timeout: 30000 });
        // Resolved from chain (AssemblyRegistered → IPFS assemblyTemplate), not a draft.
        await expect(page.getByTestId('view-source-badge')).toContainText('on-chain', { timeout: 15000 });
        // The on-chain assemblyTemplate's editorial name rendered in the toolbar.
        await expect(page.getByTestId('view-toolbar')).toContainText(name);
        // The composition survives the round trip: the node states the clause
        // the designer composed, read out of the pinned template — an assembly
        // whose terms the inspector cannot state is one nobody can check.
        await expect(
            page.locator(`[data-testid^="node-clauses-"] span[title="${clauseId}"]`),
            'the published node states the composed clause',
        ).toHaveCount(1, { timeout: 30000 });
        await expect(
            page.locator('[data-testid^="node-clauses-empty-"]'),
            'a published order carrying terms never reads as termless',
        ).toHaveCount(0);
        // Published assemblies offer Fork; drafts offer Edit.
        await expect(page.getByTestId('view-fork-button')).toBeVisible();
        await expect(page.getByTestId('view-edit-button')).toHaveCount(0);

        // Fork DOES something: no prompt, a local draft under `<slug>-fork`,
        // and the editor open on it (beta r4: the founder's dead button).
        await page.getByTestId('view-fork-button').click();
        await page.waitForURL(new RegExp(`/assemblies/designer/edit/?\\?slug=${slug}-fork(-\\d+)?$`), { timeout: 15000 });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });

        // ── An unchanged fork reviewed for publish (beta r9: the founder reached
        //    "Confirm publish — irreversible" with the original's hash). Identity
        //    is the composition, so the fork IS the anchored assembly: the Review
        //    screen reads the binding at the edge and says so before the wallet. ──
        // The fork carries the composition, not the prose: the designer names and
        // describes it (the founder's edit) — editorial text is outside the hash.
        await page.getByTestId('designer-name-input').fill(`${name} (fork)`);
        await page.getByTestId('designer-summary-input').fill('The same composition under a new name.');
        await page.getByTestId('designer-description-input').fill('Only the name and the descriptions changed.');
        await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
        await page.getByTestId('designer-review').click();
        await page.waitForURL(/\/assemblies\/designer\/view\/?\?slug=.*intent=publish/, { timeout: 15000 });
        await expect(page.getByTestId('review-banner')).toBeVisible({ timeout: 30000 });
        const reviewedHash = await page.getByTestId('designer-composition-hash').getAttribute('title') as Hex;
        expect(reviewedHash, 'the review screen states the composition it would anchor').toMatch(/^0x[0-9a-f]{64}$/i);
        // The chain fact, read out-of-band — never from the screen that claims it:
        // the binding under the reviewed hash exists, and it is the one just published.
        const [registeredBy, registeredAt] = await localPublicClient().readContract({
            address: readLocalDeploymentConfig().assemblyRegistry as Hex,
            abi: ASSEMBLY_REGISTRY_ABI,
            functionName: 'bindings',
            args: [reviewedHash],
        }) as readonly [Hex, bigint, boolean, string];
        expect(registeredAt, 'AssemblyRegistry.bindings(reviewedHash) is anchored').toBeGreaterThan(0n);
        expect(deriveAssemblySlug(reviewedHash), 'the unchanged fork is the published composition').toBe(slug);
        expect(registeredBy.toLowerCase(), 'anchored by the publishing wallet').toBe(ANVIL_ACCOUNTS[0].toLowerCase());
        // The reaction in the UI: the Review screen names the anchored slug and
        // closes the publish button.
        await expect(page.getByTestId('review-already-anchored'), 'the Review screen says the composition is anchored')
            .toContainText(slug, { timeout: 30000 });
        await expect(page.getByTestId('review-confirm-publish'), 'publish is closed for an anchored composition')
            .toBeDisabled();
    });

    test('a slug that is neither a draft nor on-chain shows the not-found error', async ({ page }) => {
        const missingSlug = `a9-missing-${Date.now()}`;

        await page.goto(
            `/assemblies/designer/view?slug=${missingSlug}&e2e=devnet`,
            { waitUntil: 'domcontentloaded' },
        );

        await expect(page.getByTestId('assembly-view-error')).toBeVisible({ timeout: 30000 });
        await expect(page.getByRole('heading', { name: 'Assembly not found' })).toBeVisible();
    });
});
