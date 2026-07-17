/**
 * Global Window augmentations for browser-only dev / test / mock globals.
 *
 * Every property here is optional — these globals are only set by:
 *   - `lib/shared/devShims.ts`        (NEXT_PUBLIC_DEV_ADDRESS / TEST_SIGNER)
 *   - `lib/kernel/testHelpers.ts`       (TEST_HELPERS_ENABLED)
 *   - `app/(app)/terminal/page.tsx`   (E2E mock harness)
 *   - `components/runtime/ClientInit.tsx` (E2E mock-API setup)
 *
 * Production code paths must guard property access with the appropriate
 * gate (`TEST_HELPERS_ENABLED`, `process.env.NODE_ENV !== "production"`,
 * `isE2EMockSession()`, etc.). The types only declare the *shape if set*;
 * they do not cause the property to exist at runtime.
 */

import type { Abi } from "viem";

interface FigaroDebugClient {
    // Method-form (bivariant) so devShims.ts can assign a more-specific
    // (opts: ReadContractParameters) => Promise<unknown> implementation
    // without forcing a viem import into this .d.ts.
    readContract(opts: unknown): Promise<unknown>;
    [key: string]: unknown;
}

interface FigaroEthereumProvider {
    isMetaMask?: boolean;
    selectedAddress?: string;
    request?: (args: { method: string; params?: unknown }) => Promise<unknown>;
    on?: (event: string, listener: (...args: unknown[]) => void) => void;
}

declare global {
    interface Window {
        // EIP-1193 provider surface (browser extension or dev shim)
        ethereum?: FigaroEthereumProvider;

        // dev / debug shims (lib/shared/devShims.ts)
        figaroPublicClient?: FigaroDebugClient;
        figaroReadFee?: (
            addr: `0x${string}`,
            abi: Abi | readonly unknown[],
        ) => Promise<unknown>;
        __figaro_fetch_wrapped?: boolean;
        __viem_wallet_client?: unknown;

        // E2E mock harness (lib/kernel/testHelpers.ts, components/runtime/ClientInit.tsx,
        // app/(app)/terminal/page.tsx)
        __FIGARO_MOCK__?: unknown;
        __FIGARO_MOCK_API__?: unknown;
        __FIGARO_ALLOWANCES__?: Record<string, string>;
        __FIGARO_MOCK_APPROVE__?: (token: string, amount: string) => Promise<boolean>;

        // E2E devnet: ClientInit publishes wagmi's live connection state
        // here so Playwright can wait on it (DOM-free, page-agnostic).
        __FIGARO_WALLET__?: {
            isConnected: boolean;
            address: string | null;
            chainId: number;
        };
    }
}

export { };
