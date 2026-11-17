/**
 * debugClient.ts — the browser-only debug public client, for development builds.
 *
 * Attached once as a side-effect by `lib/shared/publicClient.ts`, so it runs
 * on every page that reads the chain, marketing pages included. It serves
 * reads only and imports no wallet code. It runs only in the browser and
 * never in a production build.
 *
 * What it attaches:
 *  - `window.figaroPublicClient`: a public client on the page's RPC, its
 *    `readContract` logged (`components/runtime/RpcBanner.tsx` falls back to it);
 *  - `window.figaroReadFee(address, abi)`: a console helper;
 *  - a wrapper of `window.fetch` that logs each JSON-RPC method and a receipt
 *    poll's answer, so a Playwright trace reads what the page asked.
 *
 * The wallet shims (the dev provider and the test signer) are
 * `lib/shared/devShims.ts`, attached by `lib/shared/wagmi.ts`.
 */

import { createPublicClient, http, type Abi } from "viem";
import { localAnvil } from "./chains";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";

const log = (...args: unknown[]) =>
    console.log("[figaro][devShims]", ...args);

type DebugClient = ReturnType<typeof createPublicClient>;
type DebugReadContract = DebugClient["readContract"];
type DebugReadContractArgs = Parameters<NonNullable<DebugReadContract>>[0];
type DebugClientLike = Record<string, unknown> & {
    readContract: (opts: DebugReadContractArgs) => Promise<unknown>;
};

function asDebugClientLike(client: DebugClient): DebugClientLike {
    return client as unknown as DebugClientLike;
}

/** The JSON-RPC method names a request body carries (one call or a batch), for the trace log. */
function rpcMethodsOf(body: unknown): string[] {
    if (typeof body !== "string") return [];
    try {
        const parsed = JSON.parse(body) as { method?: string } | Array<{ method?: string }>;
        const calls = Array.isArray(parsed) ? parsed : [parsed];
        return calls.map((c) => c?.method ?? "?");
    } catch {
        return [];
    }
}

export function attachDebugClient(rpcUrl: string): void {
    if (typeof window === "undefined") return;
    // Parity with attachDevProvider / attachTestSigner: never ship the debug
    // global + the global fetch monkey-patch to a production build
    // (read-only, so not a theft risk, but it's overhead + a debug
    // surface prod has no reason to carry).
    if (process.env.NODE_ENV === "production") return;
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

        // Instrument window.fetch to surface RPC calls in Playwright traces
        if (!window.__figaro_fetch_wrapped) {
            const orig = window.fetch.bind(window);
            window.fetch = async (...args: Parameters<typeof fetch>) => {
                // The JSON-RPC method(s) in the body, so a trace reads what the page asked.
                const methods = rpcMethodsOf(args[1]?.body);
                if (methods.length === 0) log("fetch → (no json body)", typeof args[0], args[0] instanceof Request ? "Request" : String(args[0]).slice(0, 80), typeof args[1]?.body);
                log("fetch →", args[0], methods);
                const res = await orig(...args);
                // A receipt poll's answer: null (not yet mined) or the receipt's status.
                let note = "";
                if (methods.includes("eth_getTransactionReceipt") || methods.includes("eth_getTransactionByHash")) {
                    try {
                        const body = (await safeJsonFromResponse(res.clone())) as { result?: { status?: string } | null } | Array<{ result?: { status?: string } | null }>;
                        const first = Array.isArray(body) ? body[0] : body;
                        note = first?.result ? `result.status=${first.result.status ?? "(tx)"}` : "result=null";
                    } catch {
                        note = "receipt=unreadable";
                    }
                }
                log("fetch ←", String(args[0]), res.status, methods, note);
                return res;
            };
            window.__figaro_fetch_wrapped = true;
        }
    } catch (e) {
        log("attachDebugClient failed", e);
    }
}
