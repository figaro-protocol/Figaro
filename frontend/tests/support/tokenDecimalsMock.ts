/**
 * The one stand-in for `@/hooks/useTokenDecimals` the unit tests share, in the
 * real hook's shape: `{ decimals, ready, loading }`, `ready` exactly when the
 * decimals are known. From an async factory, as Vitest hoists `vi.mock`:
 *
 *     vi.mock("@/hooks/useTokenDecimals", async () => (await import("../support/tokenDecimalsMock")).tokenDecimalsMock(18));
 *
 * `decimals` is a number, or a function read on every call (with the token
 * the hook was asked about) for a test that changes it between renders.
 */
export function tokenDecimalsMock(decimals: number | undefined | ((token?: string) => number | undefined)) {
    return {
        default: (token?: string) => {
            const value = typeof decimals === "function" ? decimals(token) : decimals;
            return { decimals: value, ready: value !== undefined, loading: false } as const;
        },
    };
}
