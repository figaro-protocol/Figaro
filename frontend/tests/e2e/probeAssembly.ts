/**
 * probeAssembly.ts — shared devnet test helper: register a per-run-unique novel
 * clause and publish an assembly carrying it, through the REAL designer canvas.
 *
 * Why a per-run nonce: devnet is a mainnet REHEARSAL — specs leave their state
 * on-chain and DON'T snapshot/revert (lint-no-devnet-revert). Assembly identity
 * is the compositionHash, and `AssemblyRegistry.registerAssembly` reverts on an
 * anchored composition, so a FIXED composition would collide with a prior run.
 * The nonce lives in the clause id (`figaro-probe-attest-<Date.now()>`), so each
 * run composes a genuinely unique assembly → a fresh compositionHash, no
 * collision, no revert.
 * (A date-in-name is a TEST-only throwaway; production evolves a clause by bumping
 * its `version` — see the punch-list version-axis item.)
 *
 * One home for the clause-registration + canvas-publish choreography the publish
 * specs share (permissionless-clause, designer-view, published-list-ui).
 */
import {
    createWalletClient, defineChain, http, type Hex,
} from 'viem';

/** Untagged — the probe clause claims no RPGF incentive tag. */
import { privateKeyToAccount } from 'viem/accounts';
import type { Page } from '@playwright/test';
import { expect } from './devnet-multi-test';
import { readLocalDeploymentConfig, pinJSONToIPFS, localPublicClient } from './devnet-helpers';
import { ANVIL_KEYS } from '../anvilAccounts';
import { computeClauseKey, CLAUSE_REGISTRY_ABI } from '@figaro/sdk';
import { canonicalContentHash } from '@/lib/shared/canonicalJson';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const PROBE_VERSION = 1;

/** A runtime-attestable lifecycle clause with one enum ladder — modelled on the
 *  SHAPE of merchant-process, but a name nothing in this repo knows. */
export function makeProbeSpec(clauseId: string, title: string, version: number = PROBE_VERSION) {
    return {
        clauseId,
        version,
        title,
        description:
            'A runtime-attestable lifecycle clause that no code in this repo knows — the open-world certification probe.',
        fields: [
            {
                name: 'probeStage',
                type: 'enum',
                values: ['probe-opened', 'probe-advanced', 'probe-closed'],
                valueLabels: {
                    'probe-opened': 'Probe opened',
                    'probe-advanced': 'Probe advanced',
                    'probe-closed': 'Probe closed',
                },
                required: true,
                description: 'Probe lifecycle stage.',
            },
        ],
        // Deliberately MINIMAL block (design.article only, no other section):
        // a third-party spec omitting attributes must still surface —
        // absence degrades to empty values (resolved-empty = absence).
        block: { design: { article: 'attestations' } },
    };
}

/** A WITNESS-declaring clause nothing in this repo knows — a committed policy
 *  field plus a declared `stages[1]` runtime record. Certifies the feedback
 *  loop's open-world property: a never-seen clause declaring witness stages
 *  surfaces the generic rail form, files, decodes, and renders with ZERO
 *  per-clause code. */
export function makeProbeWitnessSpec(clauseId: string, title: string, version: number = PROBE_VERSION) {
    return {
        clauseId,
        version,
        title,
        description:
            'A witness-declaring clause that no code in this repo knows — the open-world feedback-loop probe.',
        fields: [
            {
                name: 'probePolicy',
                type: 'string',
                required: true,
                minLength: 1,
                description: 'Committed probe policy token.',
            },
        ],
        stages: {
            1: [
                {
                    name: 'probeReading',
                    type: 'integer',
                    required: true,
                    min: 0,
                    label: 'Probe reading',
                    description: 'Runtime probe reading — the witness value.',
                },
                {
                    name: 'evidenceUri',
                    type: 'string',
                    required: false,
                    minLength: 0,
                    maxLength: 512,
                    description: 'Optional reference to off-chain evidence.',
                },
            ],
        },
        // Minimal block on purpose — see makeProbeSpec.
        block: { design: { article: 'logistics' } },
    };
}

/** Register the probe clause permissionlessly via ClauseRegistry.registerClause —
 *  the documented registration path the protocol's own clauses use. Idempotent:
 *  skips if already registered (Playwright retry re-mints the nonce anyway). */
export async function registerProbeClause(
    clauseId: string,
    spec: ReturnType<typeof makeProbeSpec> | ReturnType<typeof makeProbeWitnessSpec>,
    version: number = PROBE_VERSION,
): Promise<void> {
    const cfg = readLocalDeploymentConfig();
    const registry = (process.env.NEXT_PUBLIC_CLAUSE_REGISTRY ?? cfg.clauseRegistry) as Hex;
    const pub = localPublicClient();
    const idHash = computeClauseKey(clauseId, version);

    const already = await pub.readContract({
        address: registry, abi: CLAUSE_REGISTRY_ABI, functionName: 'registered', args: [idHash],
    });
    if (already) return;

    const registrar = privateKeyToAccount(ANVIL_KEYS[0] as Hex);
    const wallet = createWalletClient({ account: registrar, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const { uri } = await pinJSONToIPFS(spec);
    // Digest over the CANONICAL form — the same convention populate-clauses.mjs
    // anchors and loadClauseSpec verifies after fetch.
    const contentHash = canonicalContentHash(spec);
    // Registering = staked intent (K4): the probe posts the registry's
    // deposit like any registrar.
    const deposit = await pub.readContract({
        address: registry, abi: CLAUSE_REGISTRY_ABI, functionName: 'registrationDeposit',
    });
    const { request } = await pub.simulateContract({
        account: registrar.address, address: registry, abi: CLAUSE_REGISTRY_ABI,
        functionName: 'registerClause',
        args: [clauseId, BigInt(version), contentHash, uri],
        value: deposit,
    });
    await pub.waitForTransactionReceipt({ hash: await wallet.writeContract(request) });
}

/** Wait for ClientInit's devnet auto-connect (the "Connect Wallet" button goes). */
async function waitForConnected(page: Page): Promise<void> {
    await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
        null,
        { timeout: 30000 },
    );
}

export interface PublishedProbe {
    slug: string;
    name: string;
    clauseId: string;
}

/**
 * Register a per-run-unique probe clause, then author + publish a single-node
 * assembly carrying it through the REAL canvas (select node → drawer → check the
 * novel clause → name → review → confirm-publish). Returns the content-derived
 * slug, the editorial name, and the clause id. No snapshot/revert — the nonce
 * guarantees a fresh slug.
 */
export async function publishProbeAssembly(page: Page): Promise<PublishedProbe> {
    const nonce = `${Date.now()}`;
    const clauseId = `figaro-probe-attest-${nonce}`;
    const name = `Probe assembly ${nonce}`;
    await registerProbeClause(clauseId, makeProbeSpec(clauseId, `Probe attestation ${nonce}`));

    await page.goto('/assemblies/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
    await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

    const rootNode = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])').first();
    await rootNode.waitFor({ state: 'visible', timeout: 10000 });
    await rootNode.click();
    await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByTestId('drawer-tab-registry').click();
    await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
    const novel = page.getByTestId(`drawer-registry-clause-${clauseId}`);
    await expect(novel, 'the drawer surfaces the just-registered probe clause').toHaveCount(1, { timeout: 20000 });
    await novel.check();

    await page.getByTestId('designer-name-input').fill(name);
    await page.getByTestId('designer-summary-input').fill('Publish-flow coverage: a unique probe assembly.');
    await page.getByTestId('designer-description-input').fill('Single-node assembly carrying a per-run probe clause.');
    await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
    await page.getByTestId('designer-review').click();

    await page.waitForURL(/\/assemblies\/designer\/view\?slug=asm-/, { timeout: 15000 });
    const handle = page.url().match(/[?&]slug=(asm-[a-z0-9-]+)/)?.[1];
    expect(handle, 'review navigated to a draft handle').toBeTruthy();
    await page.goto(`/assemblies/designer/view?slug=${handle}&intent=publish&e2e=devnet`, { waitUntil: 'domcontentloaded' });

    const confirmBtn = page.getByTestId('review-confirm-publish');
    await confirmBtn.waitFor({ state: 'visible', timeout: 30000 });
    await waitForConnected(page);
    await confirmBtn.click();
    await page.getByTestId('assembly-publish-receipt').waitFor({ timeout: 60000 });
    const slug = (await page.getByTestId('receipt-slug').textContent())?.trim();
    expect(slug, 'receipt shows the content slug').toMatch(/^asm-/);

    return { slug: slug as string, name, clauseId };
}
