import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { _setSignPreviewMode_TESTING_ONLY } from '@/lib/checkout/orderPreview';

// Default test mode: auto-approve commitment-sign confirmation modals so
// unit tests don't deadlock waiting for a Provider that isn't mounted.
// Tests that exercise the gate explicitly can call
// _setSignPreviewMode_TESTING_ONLY(null) per-test to restore normal
// Provider-driven behavior.
_setSignPreviewMode_TESTING_ONLY('auto-approve');

// Cleanup after each test
afterEach(() => {
    cleanup();
});

// Mock Next.js router
vi.mock('next/navigation', () => ({
    useRouter() {
        return {
            push: vi.fn(),
            replace: vi.fn(),
            prefetch: vi.fn(),
        };
    },
    useSearchParams() {
        return new URLSearchParams();
    },
    usePathname() {
        return '/';
    },
}));

// Mock Wagmi hooks
vi.mock('wagmi', () => ({
    createConfig() {
        return {};
    },
    // The connector transport (connectorFirstTransport's default wallet leg):
    // in unit tests there is never a connected wallet, so the leg rejects —
    // exactly what the real unstable_connector does when disconnected —
    // and callers fall through to the http leg. Tests that exercise the
    // wallet leg inject their own fake Transport instead.
    unstable_connector() {
        return () => ({
            config: {},
            request: async () => {
                throw new Error('unit tests have no connected wallet');
            },
            value: undefined,
        });
    },
    useAccount() {
        return {
            address: '0x1234567890123456789012345678901234567890',
            isConnected: false,
        };
    },
    useChainId() {
        return 1;
    },
    useConnect() {
        return {
            connect: vi.fn(),
            connectAsync: vi.fn(),
            connectors: [],
            isPending: false,
        };
    },
    useConnectors() {
        return [];
    },
    useDisconnect() {
        return {
            disconnect: vi.fn(),
            disconnectAsync: vi.fn(),
        };
    },
    useWriteContract() {
        return {
            writeContract: vi.fn(),
            writeContractAsync: vi.fn(),
            data: undefined,
            isPending: false,
        };
    },
    useWaitForTransactionReceipt() {
        return {
            isLoading: false,
            isSuccess: false,
        };
    },
    useReadContract() {
        return {
            data: undefined,
        };
    },
    usePublicClient() {
        return null;
    },
    useWatchContractEvent() {
        return undefined;
    },
    useSignTypedData() {
        return {
            signTypedDataAsync: vi.fn(),
        };
    },
}));
