/**
 * dispute-ui.devnet.spec.ts
 *
 * Phase 5 C7: UI coverage of dispute creation + evidence submission
 * through DisputeStatusPanel — and the runtime verification of audit
 * finding F8 (2026-05-20 dispute-resolution audit), which re-homed
 * the panel onto `/audit/[processId]`.
 *
 * The panel is process-scoped and mounts once on the audit page beside
 * the audit-bundle PDF — in the three-layer dispute model the audit
 * documents and the forum-submission documents are one record. Flow:
 *   1. Seed a root order (buyer <-> seller).
 *   2. Open /audit/<processId> as the buyer.
 *   3. Raise Dispute -> MockKlerosArbitrableProxy.createDispute
 *      (metaEvidence pinned to IPFS) -> Dispute event.
 *   4. Submit Evidence -> audit-bundle PDF built in-browser + pinned ->
 *      MockKlerosArbitrableProxy.submitEvidence -> Evidence event.
 *
 * Requires the mock-Kleros stack: ./deploy-mock-kleros.sh must have run
 * after ./deploy-local.sh so NEXT_PUBLIC_KLEROS_ARBITRABLE_PROXY is set.
 *
 * Requires Anvil + ./deploy-local.sh + ./deploy-mock-kleros.sh + Kubo.
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
    createRootOrder,
    ensureTokenApprovals,
    readLocalDeploymentConfig,
    waitForWalletConnected,
} from './devnet-helpers';
import {
    ARBITRATION_KLEROS_CLAUSE_KEY,
    canonicalizeAgreement,
    type Agreement,
} from '../../lib/core/agreement';
import { ANVIL_KEYS } from '../anvilAccounts';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

const BUYER_KEY = ANVIL_KEYS[0];
const SELLER_KEY = ANVIL_KEYS[1];

// MockKlerosArbitrableProxy mirrors Kleros's ERC-1497 event shapes.
const KLEROS_PROXY_EVENT_ABI = parseAbi([
    'event Dispute(address indexed arbitrator, uint256 indexed disputeID, uint256 metaEvidenceID, uint256 evidenceGroupID)',
    'event Evidence(address indexed arbitrator, uint256 indexed evidenceGroupID, address indexed party, string evidence)',
]);


test.describe('Dispute create + evidence via the audit page (devnet)', () => {
    let blockBefore: bigint;

    test.beforeEach(async () => {
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        blockBefore = await publicClient.getBlockNumber();
    });

    // On-chain seed + two Kleros txs + an in-browser audit-bundle PDF build.
    test.setTimeout(180_000);

    test('buyer raises a dispute and submits evidence from /audit/[processId]', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;
        const klerosProxy = process.env.NEXT_PUBLIC_KLEROS_ARBITRABLE_PROXY as Hex | undefined;
        if (!coreAddress || !tokenAddress) {
            throw new Error('Missing FIGARO_CORE / TOKEN_ADDRESS env');
        }
        if (!klerosProxy) {
            throw new Error('NEXT_PUBLIC_KLEROS_ARBITRABLE_PROXY not set — run ./deploy-mock-kleros.sh');
        }

        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, SELLER_KEY);

        // Layer-3 recourse is clause-driven — the audit page's klerosConfig
        // requires a `figaro-arbitration-kleros-v1` section that names a
        // Kleros court AND the env-resolved proxy. Commit an agreement that
        // authors the General Court so the panel surfaces the Raise Dispute
        // affordance.
        const agreement: Agreement = {
            version: 'a1',
            buyer: ANVIL_ACCOUNTS[0] as `0x${string}`,
            seller: ANVIL_ACCOUNTS[1] as `0x${string}`,
            sections: [
                {
                    clause: ARBITRATION_KLEROS_CLAUSE_KEY,
                    data: { klerosCourt: 'general', klerosMinJurors: 3 },
                },
            ],
        };

        const { processId, commitment } = await createRootOrder({
            buyerKey: BUYER_KEY,
            sellerKey: SELLER_KEY,
            coreAddress,
            tokenAddress,
            payment: 1_000_000_000_000_000_000n,
            agreement,
        });

        // Pre-populate the buyer wallet's localStorage with the agreement
        // body keyed by the chain-side hash (same function createRootOrder
        // used). `useProcessAgreements` hydrates via the localStorage cache
        // first, so seeding here makes the jurisdiction clause readable
        // without round-tripping IPFS.
        const agreementHash = commitment.agreementHash;
        const canonical = canonicalizeAgreement(agreement);
        await page.addInitScript(
            ({ hash, body }: { hash: string; body: string }) => {
                try {
                    window.localStorage.setItem(`figaro:agreement:${hash}`, body);
                } catch { /* storage unavailable */ }
            },
            { hash: agreementHash, body: canonical },
        );

        // F8: DisputeStatusPanel is process-scoped on the audit page — the
        // route param drives it directly.
        await gotoAsWallet(page, ANVIL_ACCOUNTS[0], `/audit/${processId}?e2e=devnet`);

        // The Raise Dispute button is disabled until the wallet connects.
        // waitForWalletConnected reads window.__FIGARO_WALLET__ — the
        // connection state ClientInit publishes live from wagmi — a
        // DOM-free, page-agnostic signal that does not depend on the
        // header rendering a wallet-balance element.
        await waitForWalletConnected(page, ANVIL_ACCOUNTS[0]);

        const panel = page.getByTestId('audit-dispute-section');
        await panel.waitFor({ timeout: 30_000 });

        // ── Raise Dispute ────────────────────────────────────────────
        // The button carries no data-testid — locate by accessible name.
        const raiseButton = panel.getByRole('button', { name: /Raise Dispute/i });
        await expect(raiseButton).toBeEnabled({ timeout: 15_000 });
        await raiseButton.click();

        // On success the panel flips to the "dispute exists" branch.
        // Covers the metaEvidence IPFS pin + the createDispute tx.
        await expect(panel.getByText(/Pending ruling/i)).toBeVisible({ timeout: 90_000 });

        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const disputeEvents = await publicClient.getContractEvents({
            address: klerosProxy,
            abi: KLEROS_PROXY_EVENT_ABI,
            eventName: 'Dispute',
            fromBlock: blockBefore,
        });
        expect(disputeEvents.length).toBeGreaterThanOrEqual(1);

        // ── Submit Evidence ──────────────────────────────────────────
        // Builds the process-scoped audit-bundle PDF in-browser, pins it,
        // and submits the URI as Kleros evidence.
        const submitButton = panel.getByTestId('dispute-submit-evidence-button');
        await expect(submitButton).toBeEnabled({ timeout: 15_000 });
        await submitButton.click();

        // The panel shows the submission tx hash once submitEvidence
        // resolves — generous timeout for the in-browser PDF build.
        await expect(panel.getByText(/Last submission tx/i)).toBeVisible({ timeout: 120_000 });

        const evidenceEvents = await publicClient.getContractEvents({
            address: klerosProxy,
            abi: KLEROS_PROXY_EVENT_ABI,
            eventName: 'Evidence',
            args: { party: ANVIL_ACCOUNTS[0] as Hex },
            fromBlock: blockBefore,
        });
        expect(evidenceEvents.length).toBeGreaterThanOrEqual(1);
    });
});
