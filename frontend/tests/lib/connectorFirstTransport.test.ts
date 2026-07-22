/**
 * connectorFirstTransport — the connected-wallet read routing policy.
 *
 * The transport's one job is per-request routing: e2e sessions go straight to
 * the http/mock leg (the wallet leg must never be consulted — the dev/test
 * window.ethereum shims serve only account/sign methods); otherwise the
 * connected wallet's EIP-1193 provider serves the read first and ANY wallet
 * failure falls through to http. The wallet leg is injected as a fake
 * Transport — the real leg is wagmi's `unstable_connector`, whose
 * disconnected/wrong-chain guards are wagmi's contract, not ours to re-test.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Transport } from "viem";
import { connectorFirstTransport } from "@/lib/shared/mockTransport";

const RPC_URL = "http://127.0.0.1:8545";

function fakeWalletTransport(request: (args: { method: string; params?: unknown }) => Promise<unknown>): Transport {
    return (() => ({
        config: { key: "fake", name: "Fake", request: vi.fn(), retryCount: 0, retryDelay: 0, timeout: 0, type: "fake" },
        request,
        value: undefined,
    })) as unknown as Transport;
}

/** Mock global fetch so exercising the http leg is observable and hermetic. */
function mockHttpLeg(result: unknown) {
    const fetchMock = vi.fn(async () =>
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

beforeEach(() => {
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
});

describe("connectorFirstTransport", () => {
    it("routes a read through the connected wallet's provider; http is untouched", async () => {
        const fetchMock = mockHttpLeg("0xdead");
        const walletRequest = vi.fn(async () => "0x2a");
        const transport = connectorFirstTransport(RPC_URL, undefined, fakeWalletTransport(walletRequest))({});

        await expect(transport.request({ method: "eth_blockNumber" })).resolves.toBe("0x2a");
        expect(walletRequest).toHaveBeenCalledOnce();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("falls through to http on ANY wallet-leg failure", async () => {
        const fetchMock = mockHttpLeg("0x1");
        const walletRequest = vi.fn(async () => {
            throw new Error("Provider is disconnected.");
        });
        const transport = connectorFirstTransport(RPC_URL, undefined, fakeWalletTransport(walletRequest))({});

        await expect(transport.request({ method: "eth_blockNumber" })).resolves.toBe("0x1");
        expect(walletRequest).toHaveBeenCalledOnce();
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("never consults the wallet leg in a devnet e2e session", async () => {
        window.sessionStorage.setItem("figaro:e2e-mode", "devnet");
        const fetchMock = mockHttpLeg("0x5");
        const walletRequest = vi.fn(async () => "0xbad");
        const transport = connectorFirstTransport(RPC_URL, undefined, fakeWalletTransport(walletRequest))({});

        await expect(transport.request({ method: "eth_blockNumber" })).resolves.toBe("0x5");
        expect(walletRequest).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("never consults the wallet leg in a mock e2e session — the mock short-circuit answers", async () => {
        window.sessionStorage.setItem("figaro:e2e-mode", "mock");
        const fetchMock = mockHttpLeg("0xbad");
        const walletRequest = vi.fn(async () => "0xbad");
        const transport = connectorFirstTransport(RPC_URL, undefined, fakeWalletTransport(walletRequest))({});

        // mockAwareHttp's ?e2e=mock short-circuit serves the stubbed default.
        await expect(transport.request({ method: "eth_blockNumber" })).resolves.toBe("0x0");
        expect(walletRequest).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
