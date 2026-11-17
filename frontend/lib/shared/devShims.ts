/**
 * devShims.ts — browser-only development and test wallet shims.
 *
 * This module is imported once as a side-effect by wagmi.ts, so its shims
 * attach on the pages that mount the wallet stack (the `(app)` and `(tools)`
 * pages), never on a marketing page. It runs only in the browser (guarded by
 * `typeof window !== "undefined"`), never in a production build, and only
 * when the relevant env vars are set.
 *
 * Shims provided:
 *  1. Dev provider  — minimal EIP-1193 provider for NEXT_PUBLIC_DEV_ADDRESS.
 *  2. Test signer   — viem WalletClient backed by NEXT_PUBLIC_TEST_PRIVATE_KEY.
 *
 * The debug public client, which serves reads only, is
 * `lib/shared/debugClient.ts`, attached by `lib/shared/publicClient.ts`.
 */

import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { localAnvil } from "./chains";

const log = (...args: unknown[]) =>
    console.log("[figaro][devShims]", ...args);

type DevSignerWallet = ReturnType<typeof createWalletClient>;
type DevSendTransactionArgs = Parameters<DevSignerWallet["sendTransaction"]>[0];
function asTransactionRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toBigIntValue(value: unknown): bigint | null {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
        return BigInt(value);
    }
    return null;
}

// ---------------------------------------------------------------------------
// 1. Dev address provider (NEXT_PUBLIC_DEV_ADDRESS)
// ---------------------------------------------------------------------------
export function attachDevProvider(): void {
    if (typeof window === "undefined") return;
    // Parity with attachTestSigner (finding 8): a production build must never
    // inject a fake provider, even if NEXT_PUBLIC_DEV_ADDRESS leaked into the
    // bundle. Belt-and-suspenders behind the build-time flag guard in
    // next.config.mjs.
    if (process.env.NODE_ENV === "production") return;
    const devAddr = process.env.NEXT_PUBLIC_DEV_ADDRESS;
    if (!devAddr) return;
    try {
        if (!window.ethereum) {
            window.ethereum = {
                isMetaMask: false,
                request: async ({ method }: { method: string }) => {
                    if (
                        method === "eth_accounts" ||
                        method === "eth_requestAccounts"
                    ) {
                        return [devAddr.toLowerCase()];
                    }
                    throw new Error(
                        `Dev provider: unsupported method "${method}"`
                    );
                },
            };
            log("dev provider attached (NEXT_PUBLIC_DEV_ADDRESS)");
        }
    } catch (e) {
        log("attachDevProvider failed", e);
    }
}

// ---------------------------------------------------------------------------
// 2. Test signer (NEXT_PUBLIC_USE_TEST_SIGNER + NEXT_PUBLIC_TEST_PRIVATE_KEY)
// ---------------------------------------------------------------------------
export function attachTestSigner(): void {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV === "production") return;
    if (process.env.NEXT_PUBLIC_USE_TEST_SIGNER !== "1") return;
    const pk = process.env.NEXT_PUBLIC_TEST_PRIVATE_KEY;
    if (!pk) return;
    try {
        const account = privateKeyToAccount(pk as `0x${string}`);
        const wallet = createWalletClient({
            account,
            transport: http(localAnvil.rpcUrls.default.http[0]),
        });
        const pub = createPublicClient({
            chain: localAnvil,
            transport: http(localAnvil.rpcUrls.default.http[0]),
        });

        if (!window.ethereum) window.ethereum = {};
        window.__viem_wallet_client = wallet;

        window.ethereum.request = async ({
            method,
            params,
        }: {
            method: string;
            params?: unknown;
        }) => {
            if (
                method === "eth_accounts" ||
                method === "eth_requestAccounts"
            ) {
                return [account.address.toLowerCase()];
            }
            if (method === "eth_sendTransaction") {
                const txParams = Array.isArray(params) ? params[0] : params;
                const tx = asTransactionRecord(txParams);
                const opts: DevSendTransactionArgs = {
                    account,
                    chain: localAnvil,
                    to: tx.to as `0x${string}`,
                };
                const value = toBigIntValue(tx.value);
                if (value !== null) opts.value = value;
                if (typeof tx.data === "string") opts.data = tx.data as `0x${string}`;
                const gas = toBigIntValue(tx.gas ?? tx.gasLimit);
                if (gas !== null) opts.gas = gas;
                const gasPrice = toBigIntValue(tx.gasPrice);
                if (gasPrice !== null) opts.gasPrice = gasPrice;
                return wallet.sendTransaction(opts);
            }
            if (method === "eth_sendRawTransaction") {
                return pub.request({
                    method: "eth_sendRawTransaction",
                    params: [Array.isArray(params) ? params[0] : params],
                });
            }
            throw new Error(`Test signer: unsupported method "${method}"`);
        };
        log("test signer attached (NEXT_PUBLIC_USE_TEST_SIGNER)");
    } catch (e) {
        log("attachTestSigner failed", e);
    }
}
