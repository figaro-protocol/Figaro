import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { _setSignPreviewMode_TESTING_ONLY } from '@/lib/core/orderPreview';

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
    useAccount() {
        return {
            address: '0x1234567890123456789012345678901234567890',
            isConnected: false,
        };
    },
    useChainId() {
        return 1;
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

// Mock RainbowKit
vi.mock('@rainbow-me/rainbowkit', () => ({
    ConnectButton: () => null,
}));
