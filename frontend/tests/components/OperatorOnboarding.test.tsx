import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OperatorOnboarding } from '@/components/operators/OperatorOnboarding';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const useAccountMock = vi.fn();
const useOperatorProfileMock = vi.fn();
const useRegistrationDepositMock = vi.fn();
const useDepositLockPeriodMock = vi.fn();
const useRegisterOperatorMock = vi.fn();
const useUpdateOperatorProfileMock = vi.fn();
const useDeactivateOperatorMock = vi.fn();
const useReactivateOperatorMock = vi.fn();
const useWithdrawDepositMock = vi.fn();
const publishJSONMock = vi.fn();
const getBlockMock = vi.fn();

vi.mock('wagmi', () => ({
    useAccount: () => useAccountMock(),
    usePublicClient: () => ({ getBlock: getBlockMock }),
    useChainId: () => 31337,
    useReadContract: () => ({ data: undefined }),
    useWriteContract: () => ({ writeContractAsync: vi.fn(), data: undefined, isPending: false }),
    useWaitForTransactionReceipt: () => ({ isLoading: false, isSuccess: false }),
}));

vi.mock('@rainbow-me/rainbowkit', () => ({
    ConnectButton: () => <button>Connect Wallet</button>,
}));

vi.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => '/',
}));

vi.mock('@/lib/mechanisms/useOperatorRegistry', () => ({
    OperatorRole: { None: 0, Merchant: 1, Driver: 2, Both: 3 },
    useOperatorProfile: (...args: unknown[]) => useOperatorProfileMock(...args),
    useRegistrationDeposit: () => useRegistrationDepositMock(),
    useDepositLockPeriod: () => useDepositLockPeriodMock(),
    useRegisterOperator: () => useRegisterOperatorMock(),
    useUpdateOperatorProfile: () => useUpdateOperatorProfileMock(),
    useDeactivateOperator: () => useDeactivateOperatorMock(),
    useReactivateOperator: () => useReactivateOperatorMock(),
    useWithdrawDeposit: () => useWithdrawDepositMock(),
}));

vi.mock('@/lib/shared/ipfsService', () => ({
    DEFAULT_IPFS_SERVICE: {
        publishJSON: (...args: unknown[]) => publishJSONMock(...args),
        resolveFetchUrl: (uri: string) => uri,
    },
}));

// ── Default hook return values ────────────────────────────────────────────────

function defaultWriteHook(overrides?: object) {
    return {
        isPending: false,
        isConfirming: false,
        isSuccess: false,
        error: null,
        hash: undefined,
        ...overrides,
    };
}

function setupConnected() {
    useAccountMock.mockReturnValue({
        address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        isConnected: true,
    });
    useOperatorProfileMock.mockReturnValue({ data: undefined, isLoading: false, refetch: vi.fn() });
    useRegistrationDepositMock.mockReturnValue({ data: 1000000000000000n });
    useDepositLockPeriodMock.mockReturnValue({ data: 0n });
    useRegisterOperatorMock.mockReturnValue({ ...defaultWriteHook(), register: vi.fn() });
    useUpdateOperatorProfileMock.mockReturnValue({ ...defaultWriteHook(), updateProfile: vi.fn() });
    useDeactivateOperatorMock.mockReturnValue({ ...defaultWriteHook(), deactivate: vi.fn() });
    useReactivateOperatorMock.mockReturnValue({ ...defaultWriteHook(), reactivate: vi.fn() });
    useWithdrawDepositMock.mockReturnValue({ ...defaultWriteHook(), withdraw: vi.fn() });
    getBlockMock.mockResolvedValue({ timestamp: 1000000n });
    publishJSONMock.mockReset();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OperatorOnboarding — not connected', () => {
    beforeEach(() => {
        useAccountMock.mockReturnValue({ address: undefined, isConnected: false });
        useOperatorProfileMock.mockReturnValue({ data: undefined, isLoading: false, refetch: vi.fn() });
        useRegistrationDepositMock.mockReturnValue({ data: undefined });
        useDepositLockPeriodMock.mockReturnValue({ data: undefined });
        useRegisterOperatorMock.mockReturnValue({ ...defaultWriteHook(), register: vi.fn() });
        useUpdateOperatorProfileMock.mockReturnValue({ ...defaultWriteHook(), updateProfile: vi.fn() });
        useDeactivateOperatorMock.mockReturnValue({ ...defaultWriteHook(), deactivate: vi.fn() });
        useReactivateOperatorMock.mockReturnValue({ ...defaultWriteHook(), reactivate: vi.fn() });
        useWithdrawDepositMock.mockReturnValue({ ...defaultWriteHook(), withdraw: vi.fn() });
    });

    it('shows connect wallet prompt when wallet is disconnected', () => {
        render(<OperatorOnboarding />);

        expect(screen.getByText('Connect your wallet to continue')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Connect Wallet' })).toBeInTheDocument();
    });
});

describe('OperatorOnboarding — not registered', () => {
    beforeEach(() => {
        setupConnected();
    });

    it('renders the registration form', () => {
        render(<OperatorOnboarding />);

        expect(screen.getByPlaceholderText('e.g. Tasty Burger')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument();
    });

    it('displays the required deposit amount', () => {
        render(<OperatorOnboarding />);

        // deposit appears in both the info box and the submit button label
        const matches = screen.getAllByText(/0\.001 ETH/i);
        expect(matches.length).toBeGreaterThan(0);
    });

    it('submit button is disabled when name is empty', () => {
        render(<OperatorOnboarding />);

        const btn = screen.getByRole('button', { name: /register/i });
        expect(btn).toBeDisabled();
    });

    it('submit button is enabled after typing a name', async () => {
        render(<OperatorOnboarding />);

        await userEvent.type(screen.getByPlaceholderText('e.g. Tasty Burger'), 'My Shop');

        const btn = screen.getByRole('button', { name: /register/i });
        expect(btn).not.toBeDisabled();
    });

    it('calls publishJSON and then register on submit with Both role when no service types selected', async () => {
        const registerMock = vi.fn().mockResolvedValue(undefined);
        useRegisterOperatorMock.mockReturnValue({ ...defaultWriteHook(), register: registerMock });
        publishJSONMock.mockResolvedValue({ uri: 'ipfs://QmNew', cid: 'QmNew', gatewayUrl: '' });

        render(<OperatorOnboarding />);

        await userEvent.type(screen.getByPlaceholderText('e.g. Tasty Burger'), 'My Shop');
        await userEvent.click(screen.getByRole('button', { name: /register/i }));

        await waitFor(() => {
            expect(publishJSONMock).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'My Shop' }),
            );
        });
        // no service types selected → OperatorRole.Both (3)
        await waitFor(() => {
            expect(registerMock).toHaveBeenCalledWith(3, 'ipfs://QmNew', 1000000000000000n);
        });
    });

    it('derives Merchant role when only merchant service types are selected', async () => {
        const registerMock = vi.fn().mockResolvedValue(undefined);
        useRegisterOperatorMock.mockReturnValue({ ...defaultWriteHook(), register: registerMock });
        publishJSONMock.mockResolvedValue({ uri: 'ipfs://QmMerchant', cid: 'QmMerchant', gatewayUrl: '' });

        render(<OperatorOnboarding />);

        await userEvent.type(screen.getByPlaceholderText('e.g. Tasty Burger'), 'My Shop');
        // Check "Pickup" service type (maps to Merchant)
        await userEvent.click(screen.getByRole('checkbox', { name: /pickup/i }));
        await userEvent.click(screen.getByRole('button', { name: /register/i }));

        await waitFor(() => {
            // OperatorRole.Merchant = 1
            expect(registerMock).toHaveBeenCalledWith(1, 'ipfs://QmMerchant', 1000000000000000n);
        });
    });

    it('derives Driver role when only delivery service type is selected', async () => {
        const registerMock = vi.fn().mockResolvedValue(undefined);
        useRegisterOperatorMock.mockReturnValue({ ...defaultWriteHook(), register: registerMock });
        publishJSONMock.mockResolvedValue({ uri: 'ipfs://QmDriver', cid: 'QmDriver', gatewayUrl: '' });

        render(<OperatorOnboarding />);

        await userEvent.type(screen.getByPlaceholderText('e.g. Tasty Burger'), 'My Shop');
        // Check "Delivery" service type (maps to Driver)
        await userEvent.click(screen.getByRole('checkbox', { name: /delivery/i }));
        await userEvent.click(screen.getByRole('button', { name: /register/i }));

        await waitFor(() => {
            // OperatorRole.Driver = 2
            expect(registerMock).toHaveBeenCalledWith(2, 'ipfs://QmDriver', 1000000000000000n);
        });
    });

    it('shows error status when publishJSON fails', async () => {
        publishJSONMock.mockRejectedValue(new Error('IPFS unavailable'));

        render(<OperatorOnboarding />);

        await userEvent.type(screen.getByPlaceholderText('e.g. Tasty Burger'), 'My Shop');
        await userEvent.click(screen.getByRole('button', { name: /register/i }));

        await waitFor(() => {
            expect(screen.getByText('IPFS unavailable')).toBeInTheDocument();
        });
    });

    it('shows the agent endpoints toggle', () => {
        render(<OperatorOnboarding />);

        expect(screen.getByText(/agent endpoints/i)).toBeInTheDocument();
    });

    it('reveals agent endpoint fields when toggle is clicked', async () => {
        render(<OperatorOnboarding />);

        await userEvent.click(screen.getByText(/agent endpoints/i));

        expect(screen.getByPlaceholderText('did:web:example.com')).toBeInTheDocument();
    });

    it('includes a link to the catalogue builder', () => {
        render(<OperatorOnboarding />);

        expect(screen.getByRole('link', { name: /build your catalogue/i })).toBeInTheDocument();
    });
});

describe('OperatorOnboarding — loading', () => {
    it('shows loading text while profile is being fetched', () => {
        setupConnected();
        useOperatorProfileMock.mockReturnValue({ data: undefined, isLoading: true, refetch: vi.fn() });

        render(<OperatorOnboarding />);

        expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
});

describe('OperatorOnboarding — active registered operator', () => {
    beforeEach(() => {
        setupConnected();
        useOperatorProfileMock.mockReturnValue({
            data: [1, true, 'ipfs://QmProfile', 100n] as const,
            isLoading: false,
            refetch: vi.fn(),
        });
    });

    it('shows active operator status bar', () => {
        render(<OperatorOnboarding />);

        expect(screen.getByText('Active operator')).toBeInTheDocument();
    });

    it('shows "Update profile" as the submit button label', () => {
        render(<OperatorOnboarding />);

        expect(screen.getByRole('button', { name: /update profile/i })).toBeInTheDocument();
    });

    it('shows the deactivate button in the danger zone', () => {
        render(<OperatorOnboarding />);

        expect(screen.getByRole('button', { name: /^deactivate$/i })).toBeInTheDocument();
    });

    it('calls updateProfile on submit', async () => {
        const updateProfileMock = vi.fn().mockResolvedValue(undefined);
        useUpdateOperatorProfileMock.mockReturnValue({ ...defaultWriteHook(), updateProfile: updateProfileMock });
        publishJSONMock.mockResolvedValue({ uri: 'ipfs://QmUpdated', cid: 'QmUpdated', gatewayUrl: '' });
        global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ name: 'Old Name' }) });

        render(<OperatorOnboarding />);

        await waitFor(() => screen.getByDisplayValue('Old Name'));

        await userEvent.click(screen.getByRole('button', { name: /update profile/i }));

        await waitFor(() => {
            // profile loaded from IPFS has no serviceTypes → role defaults to Both (3)
            expect(updateProfileMock).toHaveBeenCalledWith(3, 'ipfs://QmUpdated');
        });
    });

    it('calls deactivate when the deactivate button is clicked', async () => {
        const deactivateMock = vi.fn().mockResolvedValue(undefined);
        useDeactivateOperatorMock.mockReturnValue({ ...defaultWriteHook(), deactivate: deactivateMock });

        render(<OperatorOnboarding />);

        await userEvent.click(screen.getByRole('button', { name: /^deactivate$/i }));

        await waitFor(() => {
            expect(deactivateMock).toHaveBeenCalledOnce();
        });
    });
});

describe('OperatorOnboarding — inactive operator', () => {
    beforeEach(() => {
        setupConnected();
        useOperatorProfileMock.mockReturnValue({
            data: [1, false, 'ipfs://QmProfile', 100n] as const,
            isLoading: false,
            refetch: vi.fn(),
        });
    });

    it('shows the inactive operator panel', () => {
        render(<OperatorOnboarding />);

        expect(screen.getByText('Operator inactive')).toBeInTheDocument();
    });

    it('shows the Reactivate button', () => {
        render(<OperatorOnboarding />);

        expect(screen.getByRole('button', { name: /^reactivate$/i })).toBeInTheDocument();
    });

    it('calls reactivate when the Reactivate button is clicked', async () => {
        const reactivateMock = vi.fn().mockResolvedValue(undefined);
        useReactivateOperatorMock.mockReturnValue({ ...defaultWriteHook(), reactivate: reactivateMock });

        render(<OperatorOnboarding />);

        await userEvent.click(screen.getByRole('button', { name: /^reactivate$/i }));

        await waitFor(() => {
            expect(reactivateMock).toHaveBeenCalledOnce();
        });
    });

    it('shows the Withdraw deposit button', () => {
        render(<OperatorOnboarding />);

        expect(screen.getByRole('button', { name: /withdraw deposit|locked/i })).toBeInTheDocument();
    });

    it('disables withdraw and shows lock countdown when deposit is still locked', async () => {
        const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
        useDepositLockPeriodMock.mockReturnValue({ data: 604800n });
        getBlockMock.mockResolvedValue({ timestamp: nowSeconds });

        render(<OperatorOnboarding />);

        await waitFor(() => {
            const btn = screen.getByRole('button', { name: /locked/i });
            expect(btn).toBeDisabled();
        });
    });

    it('enables withdraw when lock period has elapsed', async () => {
        const pastTimestamp = BigInt(Math.floor(Date.now() / 1000)) - 604801n;
        useDepositLockPeriodMock.mockReturnValue({ data: 604800n });
        getBlockMock.mockResolvedValue({ timestamp: pastTimestamp });

        render(<OperatorOnboarding />);

        await waitFor(() => {
            const btn = screen.getByRole('button', { name: /withdraw deposit/i });
            expect(btn).not.toBeDisabled();
        });
    });
});

describe('OperatorOnboarding — post-registration success', () => {
    it('shows the success panel after registration isSuccess fires', async () => {
        setupConnected();
        useRegisterOperatorMock.mockReturnValue({
            ...defaultWriteHook({ isSuccess: true }),
            register: vi.fn(),
        });

        render(<OperatorOnboarding />);

        await waitFor(() => {
            expect(screen.getByText(/you're registered/i)).toBeInTheDocument();
        });
    });
});
