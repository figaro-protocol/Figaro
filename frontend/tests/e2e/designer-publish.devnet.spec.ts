/**
 * designer-publish.devnet.spec.ts
 *
 * Phase 3b of the e2e remediation plan: full publish flow from
 * canvas → review → on-chain registerAssembly.
 *
 * Investigation note (resolved): an earlier draft of this spec
 * imported `test` from `@playwright/test` directly, which DOESN'T
 * inject the multi-wallet EIP-1193 provider. That left
 * `window.ethereum === undefined` on every navigation, so
 * ClientInit's devnet auto-connect found no connector and the
 * review page persisted in "Connect Wallet" state. Importing from
 * `./devnet-multi-test` is the right fix — every working
 * `*.devnet.spec.ts` uses that fixture.
 *
 * Also noted (NOT addressed): the canvas's Publish button
 * (`router.push(/view/<slug>?intent=publish)` at
 * DesignerCanvas.tsx:434) drops any `?e2e=` query param.
 * Production-relevant if other query-param-driven modes get added;
 * test-mode-only impact today. Worked around by re-navigating to
 * `/view/<slug>?intent=publish&e2e=devnet` directly.
 *
 * Requires Anvil + ./deploy-local.sh + Kubo.
 */
import { test, expect } from './devnet-multi-test';
import {
    createPublicClient,
    defineChain,
    http,
    keccak256,
    parseAbi,
    toHex,
    type Hex,
} from 'viem';
import { evmRevert, evmSnapshot, readLocalDeploymentConfig } from './devnet-helpers';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

const ASSEMBLY_REGISTRY_ABI = parseAbi([
    'event AssemblyRegistered(bytes32 indexed slugHash, address indexed author, string slug, bytes32 contentHash, string metadataURI)',
]);

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('Designer publish (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // Multi-route nav + IPFS pin + on-chain tx pushes this past 60s.
    test.setTimeout(180_000);

    test('full publish round-trip — canvas → review → IPFS pin → AssemblyRegistered → visible on /assemblies', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const assemblyRegistry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY
            ?? config.assemblyRegistry) as Hex;

        // Unique slug per run so retries / parallel-run-residue don't
        // collide on the first-write-wins SlugAlreadyRegistered guard.
        const draftName = `pub-${Date.now()}`;
        const expectedSlug = draftName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

        await page.addInitScript(() => {
            try {
                window.localStorage.removeItem('figaro:designer:current');
                window.localStorage.removeItem('figaro:designer:drafts');
            } catch { /* noop */ }
        });
        await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

        await page.getByTestId('designer-name-input').fill(draftName);
        await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
        await page.getByTestId('designer-review').click();

        // Canvas navigates to /view/<slug>?intent=publish. Re-goto with
        // ?e2e=devnet appended — the canvas drops the query param.
        await page.waitForURL(new RegExp(`/builders/designer/view/${expectedSlug}`), { timeout: 15000 });
        await page.goto(
            `/builders/designer/view/${expectedSlug}?intent=publish&e2e=devnet`,
            { waitUntil: 'domcontentloaded' },
        );

        const confirmBtn = page.getByTestId('review-confirm-publish');
        await confirmBtn.waitFor({ state: 'visible', timeout: 15000 });
        // Wait for ClientInit's devnet auto-connect — the Connect
        // Wallet header button disappears once isConnected flips true.
        await page.waitForFunction(
            () => {
                const buttons = Array.from(document.querySelectorAll('button'));
                return !buttons.some((b) => b.textContent?.trim() === 'Connect Wallet');
            },
            null,
            { timeout: 30000 },
        );
        await confirmBtn.click();

        // Receipt appears once publish() resolves (IPFS pin +
        // registerAssembly tx receipt).
        await expect(page.getByText(/Published\b/i).first()).toBeVisible({ timeout: 60000 });

        // On-chain assertion — AssemblyRegistered for the canvas-authored slug.
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const slugHash = keccak256(toHex(expectedSlug));
        const events = await publicClient.getContractEvents({
            address: assemblyRegistry,
            abi: ASSEMBLY_REGISTRY_ABI,
            eventName: 'AssemblyRegistered',
            args: { slugHash },
            fromBlock: 0n,
        });
        expect(events.length).toBe(1);
        expect(events[0].args.slug).toBe(expectedSlug);
        // metadataURI is whatever the canvas pinned to IPFS — non-empty.
        expect(events[0].args.metadataURI).toMatch(/^ipfs:\/\/[A-Za-z0-9]+/);

        // ── Read-back: the freshly-published assembly is visible on the public
        //    /assemblies inventory (on-chain event → standalone indexer → render),
        //    i.e. discoverable + adoptable by any reader exactly as on mainnet.
        //    This closes the round-trip the authoring flow exists to produce:
        //    author → IPFS pin → AssemblyRegistered on chain → visible on /assemblies.
        await page.goto('/assemblies?e2e=devnet', { waitUntil: 'domcontentloaded' });
        await expect(page.locator(`#assembly-${expectedSlug}`)).toBeVisible({ timeout: 30000 });
    });
});
