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
const useUpdateProfileMock = vi.fn();
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
    useOperatorProfile: (...args: unknown[]) => useOperatorProfileMock(...args),
    useRegistrationDeposit: () => useRegistrationDepositMock(),
    useDepositLockPeriod: () => useDepositLockPeriodMock(),
    useRegisterOperator: () => useRegisterOperatorMock(),
    useUpdateProfile: () => useUpdateProfileMock(),
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
    useUpdateProfileMock.mockReturnValue({ ...defaultWriteHook(), updateProfile: vi.fn() });
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
        useUpdateProfileMock.mockReturnValue({ ...defaultWriteHook(), updateProfile: vi.fn() });
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

        expect(screen.getByPlaceholderText('e.g. your service name')).toBeInTheDocument();
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

        await userEvent.type(screen.getByPlaceholderText('e.g. your service name'), 'My Shop');

        const btn = screen.getByRole('button', { name: /register/i });
        expect(btn).not.toBeDisabled();
    });

    it('calls publishJSON and then register on submit', async () => {
        const registerMock = vi.fn().mockResolvedValue(undefined);
        useRegisterOperatorMock.mockReturnValue({ ...defaultWriteHook(), register: registerMock });
        publishJSONMock.mockResolvedValue({ uri: 'ipfs://QmNew', cid: 'QmNew', gatewayUrl: '' });

        render(<OperatorOnboarding />);

        await userEvent.type(screen.getByPlaceholderText('e.g. your service name'), 'My Shop');
        await userEvent.click(screen.getByRole('button', { name: /register/i }));

        await waitFor(() => {
            expect(publishJSONMock).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'My Shop' }),
            );
        });
        // Role is no longer carried in the contract call — register takes
        // (metadataURI, depositValue) only. The seller's role lives in the
        // catalogue referenced by the metadataURI.
        await waitFor(() => {
            expect(registerMock).toHaveBeenCalledWith('ipfs://QmNew', 1000000000000000n);
        });
    });

    it('shows error status when publishJSON fails', async () => {
        publishJSONMock.mockRejectedValue(new Error('IPFS unavailable'));

        render(<OperatorOnboarding />);

        await userEvent.type(screen.getByPlaceholderText('e.g. your service name'), 'My Shop');
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

describe('OperatorOnboarding — registered operator (in-place updateProfile + withdraw)', () => {
    beforeEach(() => {
        setupConnected();
        useOperatorProfileMock.mockReturnValue({
            data: ['ipfs://QmProfile', 100n] as const,
            isLoading: false,
            refetch: vi.fn(),
        });
    });

    it('shows the registered operator status bar', () => {
        render(<OperatorOnboarding />);

        expect(screen.getByText('Registered operator')).toBeInTheDocument();
    });

    it('still renders the form so an operator can edit metadata in place', () => {
        render(<OperatorOnboarding />);

        expect(screen.getByPlaceholderText('e.g. your service name')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /save profile changes/i })).toBeInTheDocument();
    });

    it('submitting the form calls updateProfile, not register', async () => {
        const updateProfileMock = vi.fn().mockResolvedValue(undefined);
        const registerMock = vi.fn().mockResolvedValue(undefined);
        useUpdateProfileMock.mockReturnValue({ ...defaultWriteHook(), updateProfile: updateProfileMock });
        useRegisterOperatorMock.mockReturnValue({ ...defaultWriteHook(), register: registerMock });
        publishJSONMock.mockResolvedValue({ uri: 'ipfs://QmNew', cid: 'QmNew', gatewayUrl: '' });

        render(<OperatorOnboarding />);

        await userEvent.type(screen.getByPlaceholderText('e.g. your service name'), 'Updated Name');
        await userEvent.click(screen.getByRole('button', { name: /save profile changes/i }));

        await waitFor(() => {
            expect(updateProfileMock).toHaveBeenCalledWith('ipfs://QmNew');
        });
        expect(registerMock).not.toHaveBeenCalled();
    });

    it('shows the Withdraw deposit button (or the lock countdown)', () => {
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

    it('calls withdraw when the Withdraw button is clicked', async () => {
        const withdrawMock = vi.fn().mockResolvedValue(undefined);
        useWithdrawDepositMock.mockReturnValue({ ...defaultWriteHook(), withdraw: withdrawMock });
        // Force lock to be elapsed so the button enables synchronously.
        const pastTimestamp = BigInt(Math.floor(Date.now() / 1000)) - 1n;
        useDepositLockPeriodMock.mockReturnValue({ data: 0n });
        getBlockMock.mockResolvedValue({ timestamp: pastTimestamp });

        render(<OperatorOnboarding />);

        // Wait for the lock-state effect to enable the button before clicking.
        const button = await waitFor(() => {
            const btn = screen.getByRole('button', { name: /withdraw deposit/i });
            expect(btn).not.toBeDisabled();
            return btn;
        });

        await userEvent.click(button);

        await waitFor(() => {
            expect(withdrawMock).toHaveBeenCalledOnce();
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
