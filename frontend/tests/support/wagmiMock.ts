/**
 * The one stand-in for `wagmi` the unit tests share: the connected wallet,
 * the chain id and the public client, each answered as wagmi answers them.
 *
 * Vitest hoists `vi.mock` above the imports, so a test reaches this module
 * from an async factory:
 *
 *     vi.mock("wagmi", async () => (await import("../support/wagmiMock")).wagmiMock({
 *         address: () => WALLET,
 *         client: () => CLIENT,
 *     }));
 *
 * Each option is read on every call, so a test that changes the wallet or the
 * client between renders (a hoisted `m.address`) is answered with the change.
 * `extra` adds the other hooks a test stands in for (`useWriteContract`,
 * `useReadContract`, …), and replaces any of the three on a name clash.
 */

export interface WagmiMockOptions {
    /** The connected wallet; `undefined` (the default) when none is. */
    address?: () => string | undefined;
    /** The public client; `{ chain: { id: chainId } }` when not given. */
    client?: () => unknown;
    /** The chain id `useChainId` and `useConnection` answer (default 31337). */
    chainId?: number;
}

export function wagmiMock(options: WagmiMockOptions = {}, extra: Record<string, unknown> = {}) {
    const chainId = options.chainId ?? 31337;
    return {
        useAccount: () => {
            const address = options.address?.();
            return { address, isConnected: address !== undefined, status: address !== undefined ? "connected" : "disconnected" };
        },
        useChainId: () => chainId,
        useConnection: () => ({ chainId }),
        usePublicClient: () => (options.client ? options.client() : { chain: { id: chainId } }),
        ...extra,
    };
}
