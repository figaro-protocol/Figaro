/**
 * Extended Playwright test fixtures for multi-wallet devnet tests.
 *
 * Injects the multi-account EIP-1193 provider (inject-ethereum-multi.js) which
 * exposes window.__FIGARO_SWITCH_ACCOUNT__(address) for wallet switching.
 *
 * Usage in tests:
 *   import { test, expect, ANVIL_ACCOUNTS, gotoAsWallet } from './devnet-multi-test';
 *
 *   test('seller accepts offer', async ({ page }) => {
 *       // page starts as account[0] (buyer)
 *       await gotoAsWallet(page, ANVIL_ACCOUNTS[1].address, '/inbox');
 *       ...
 *   });
 */
import path from 'path';
import { test as base, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { ensureWalletHasMockTokens, waitForWalletConnected, ANVIL_ACCOUNTS } from './test-helpers';
import {
    canonicalizeAgreement,
    computeAgreementHash,
    type Agreement,
} from '../../lib/core/agreement';

const multiInjectPath = path.resolve(__dirname, './fixtures/inject-ethereum-multi.js');

export { ANVIL_ACCOUNTS };
export type AnvilAccount = typeof ANVIL_ACCOUNTS[number];

// Re-export expect for convenience
export { expect };

/**
 * Custom test fixture: injects the multi-account provider on the default page,
 * which starts as account[0] (buyer).
 */
export const test = base.extend<{ page: Page }>({
    page: async ({ page }, use) => {
        await page.addInitScript({ path: multiInjectPath });
        await use(page);
    },
});


/**
 * Pre-populate a page's localStorage with an agreement so the
 * connected wallet (which didn't witness the on-chain commit because
 * the test seeded it via viem) can resolve `agreementHash` to the
 * full clause body when the UI calls `hydrateAgreement`. Mimics what
 * happens in production when the counterparty receives the
 * CommitmentPayload over XMTP — `useCommitmentFlow.ts:354-356` writes
 * the same key on the receiving side.
 *
 * Needed by seller-side tests on `/orders/[processId]`: the page's
 * merchantActions.signal builds an inclusion proof against the
 * committed agreement, and without local hydration the UI shows
 * "Agreement assemblyDoc unavailable for 0x... — cannot generate
 * inclusion proof".
 *
 * Storage key + canonical-JSON format match `agreementStore.ts`
 * (STORE_PREFIX = "figaro:agreement:", value = canonicalizeAgreement).
 */
export async function seedAgreementForWallet(
    page: Page,
    agreement: Agreement,
    options: { uri?: string } = {},
): Promise<void> {
    const agreementHash = computeAgreementHash(agreement);
    const canonical = canonicalizeAgreement(agreement);
    await page.addInitScript(
        ({ hash, body, uri }: { hash: string; body: string; uri: string | null }) => {
            try {
                window.localStorage.setItem(`figaro:agreement:${hash}`, body);
                if (uri) window.localStorage.setItem(`figaro:agreement-uri:${hash}`, uri);
            } catch {
                // localStorage unavailable; downstream UI assertion will
                // fail with a clearer signal.
            }
        },
        { hash: agreementHash, body: canonical, uri: options.uri ?? null },
    );
}

/**
 * Pre-set the active EIP-1193 account on the default page fixture
 * BEFORE page scripts run, then navigate. The fixture has already
 * injected `inject-ethereum-multi.js` which exposes
 * `__FIGARO_SWITCH_ACCOUNT__`; this helper schedules another init
 * script that calls it with the target account, so wagmi mounts
 * already-connected to that account (rather than mounting as anvil[0]
 * and then receiving an `accountsChanged` event).
 *
 * Use this when a test exercises a wallet OTHER than the default
 * buyer (anvil[0]) — e.g. seller-side `/orders/[processId]`,
 * spectator views, or the merchant `/inbox`. Mirrors the inline
 * pattern from `inbox.devnet.spec.ts` lifted into a reusable helper.
 *
 * Defaults `waitUntil` to `domcontentloaded`; full `load` collides
 * with Next.js dev-server cold-compile races (see
 * `reference_e2e_flake_patterns.md` #7).
 */
export async function gotoAsWallet(
    page: Page,
    walletAddress: string,
    path: string,
    opts: { waitUntil?: 'load' | 'domcontentloaded' } = {},
): Promise<void> {
    await page.addInitScript((addr: string) => {
        if (typeof (window as any).__FIGARO_SWITCH_ACCOUNT__ === 'function') {
            (window as any).__FIGARO_SWITCH_ACCOUNT__(addr);
        }
    }, walletAddress);
    await page.goto(path, { waitUntil: opts.waitUntil ?? 'domcontentloaded' });
}

/**
 * Pin the serialized commitment payload to the local Kubo daemon and
 * return the resulting CID. Mirrors the production `pinBlob` path that
 * `CommitmentSharePanel.handleSendViaXmtp` uses, so the seller's IPFS
 * dereference (`fetchCommitmentPayloadJsonByCid`) finds the payload on
 * the gateway when the inbox subscriber fires.
 */
async function pinCommitmentPayloadJsonToLocalIpfs(payloadJson: string): Promise<string> {
    const apiUrl = process.env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
    const blob = new Blob([payloadJson], { type: 'application/json' });
    const form = new FormData();
    form.append('file', blob);
    const res = await fetch(`${apiUrl}/api/v0/add?pin=true`, { method: 'POST', body: form });
    if (!res.ok) {
        throw new Error(`IPFS pin failed: ${res.status} ${res.statusText}`);
    }
    const result = (await res.json()) as { Hash?: unknown };
    if (typeof result.Hash !== 'string' || result.Hash.length === 0) {
        throw new Error('IPFS pin returned no CID');
    }
    return result.Hash;
}

/**
 * Pre-inject a CommitmentPayload arrival into the mock CoordinationChannel's
 * localStorage so the seller's `/inbox` `subscribeAnyCommitmentPayload`
 * picks it up as a pending order when the page mounts. Simulates an
 * XMTP arrival in devnet mode (`?e2e=devnet` triggers the mock channel
 * per `lib/handoff/channel.ts:172-178`).
 *
 * Wire shape mirrors `lib/handoff/mockChannel.ts`'s
 * `StoredCommitmentSignatureMessage` — the envelope carries a `payloadCid`
 * and the production receiver dereferences it via the IPFS gateway. The
 * payload is pinned to the local Kubo daemon here so the seller-side
 * fetch resolves the same byte string back.
 *
 * The Inbox subscriber filters by `payload.commitment.seller
 * === address` (Inbox.tsx) — pass a `commitment` whose `seller`
 * matches the wallet the page is connected as.
 */
export async function simulateXmtpCommitmentArrival(
    page: Page,
    opts: {
        orderId: string;
        /** JSON-serializable payload — the inbox's deserializer expects a
         *  CommitmentPayload (`useCommitmentFlow.ts:124-130`). The minimum
         *  fields the inbox checks are `commitment.buyer` and
         *  `commitment.seller`. */
        payload: Record<string, unknown>;
        /** Sender wallet (buyer in the typical flow). */
        senderIdentity: string;
    },
): Promise<void> {
    const MOCK_STORAGE_KEY = '__FIGARO_COORDINATION_MOCK_MESSAGES__';
    const payloadJson = JSON.stringify(opts.payload);
    const payloadCid = await pinCommitmentPayloadJsonToLocalIpfs(payloadJson);
    const message = {
        type: 'COMMITMENT_PAYLOAD' as const,
        orderId: opts.orderId,
        payloadCid,
        ts: Date.now(),
        senderIdentity: opts.senderIdentity,
    };

    await page.addInitScript(
        ({ storageKey, msg }) => {
            try {
                const raw = window.localStorage.getItem(storageKey);
                const existing = raw ? (JSON.parse(raw) as unknown[]) : [];
                window.localStorage.setItem(storageKey, JSON.stringify([...existing, msg]));
            } catch {
                // localStorage unavailable — silent; the test assertion
                // will fail downstream with a clearer signal than a
                // pre-page-load exception here.
            }
        },
        { storageKey: MOCK_STORAGE_KEY, msg: message },
    );
}

