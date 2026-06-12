/**
 * devShims.ts — browser-only development and test provider shims.
 *
 * This module is imported once as a side-effect by wagmi.ts.  It runs only in
 * the browser (guarded by `typeof window !== "undefined"`) and only when the
 * relevant env vars are set.  It has no effect in production builds where
 * neither NEXT_PUBLIC_DEV_ADDRESS nor NEXT_PUBLIC_USE_TEST_SIGNER is set.
 *
 * Shims provided:
 *  1. Debug client  — attaches window.figaroPublicClient for browser console use.
 *  2. Dev provider  — minimal EIP-1193 provider for NEXT_PUBLIC_DEV_ADDRESS.
 *  3. Test signer   — viem WalletClient backed by NEXT_PUBLIC_TEST_PRIVATE_KEY.
 */

import { createPublicClient, createWalletClient, http, type Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { localAnvil } from "./chains";

const log = (...args: unknown[]) =>
    console.log("[figaro][devShims]", ...args);

type DebugClient = ReturnType<typeof createPublicClient>;
type DebugReadContract = DebugClient["readContract"];
type DebugReadContractArgs = Parameters<NonNullable<DebugReadContract>>[0];
type DevSignerWallet = ReturnType<typeof createWalletClient>;
type DevSendTransactionArgs = Parameters<DevSignerWallet["sendTransaction"]>[0];
type DebugClientLike = Record<string, unknown> & {
    readContract: (opts: DebugReadContractArgs) => Promise<unknown>;
};
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

function asDebugClientLike(client: DebugClient): DebugClientLike {
    return client as unknown as DebugClientLike;
}

// ---------------------------------------------------------------------------
// 1. Debug public client attached to window
// ---------------------------------------------------------------------------
export function attachDebugClient(rpcUrl: string): void {
    if (typeof window === "undefined") return;
    try {
        const client = createPublicClient({
            chain: localAnvil,
            transport: http(rpcUrl),
        });

        // Wrap readContract so Playwright traces capture call/response/error
        const origRead = client.readContract;
        if (origRead) {
            const wrapped = async (opts: DebugReadContractArgs) => {
                log("readContract →", opts?.address, opts?.functionName);
                try {
                    const res = await origRead.call(client, opts);
                    log("readContract ←", res);
                    return res;
                } catch (err) {
                    log("readContract ✗", err);
                    throw err;
                }
            };
            window.figaroPublicClient = {
                ...(client as unknown as Record<string, unknown>),
                readContract: wrapped,
            };
        } else {
            window.figaroPublicClient = asDebugClientLike(client);
        }

        // Convenience helper: window.figaroReadFee(address, abi)
        window.figaroReadFee = async (addr: `0x${string}`, abi: Abi | readonly unknown[]) => {
            const c = window.figaroPublicClient ?? asDebugClientLike(client);
            return c.readContract({ address: addr, abi, functionName: "feeRate" });
        };

        // Instrument window.fetch to surface /rpc calls in Playwright traces
        if (!window.__figaro_fetch_wrapped) {
            const orig = window.fetch.bind(window);
            window.fetch = async (...args: Parameters<typeof fetch>) => {
                log("fetch →", args[0]);
                const res = await orig(...args);
                log("fetch ←", String(args[0]), res.status);
                return res;
            };
            window.__figaro_fetch_wrapped = true;
        }
    } catch (e) {
        log("attachDebugClient failed", e);
    }
}

// ---------------------------------------------------------------------------
// 2. Dev address provider (NEXT_PUBLIC_DEV_ADDRESS)
// ---------------------------------------------------------------------------
export function attachDevProvider(): void {
    if (typeof window === "undefined") return;
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
// 3. Test signer (NEXT_PUBLIC_USE_TEST_SIGNER + NEXT_PUBLIC_TEST_PRIVATE_KEY)
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
            transport: http("/rpc"),
        });
        const pub = createPublicClient({
            chain: localAnvil,
            transport: http("/rpc"),
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
