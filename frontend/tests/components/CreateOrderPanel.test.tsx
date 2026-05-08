import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => {
    const payload = {
        commitment: {
            processId: '0x' + '00'.repeat(32),
            buyer: '0x1234567890123456789012345678901234567890',
            seller: '0x9999999999999999999999999999999999999999',
            currency: '0x2222222222222222222222222222222222222222',
            payment: 10n,
            expectedCumulativeValue: 10n,
            agreementHash: '0x' + '11'.repeat(32),
            salt: 1n,
            deadline: 2n,
        },
        buyerSig: '0x' + '12'.repeat(65),
    };

    return {
        clearCreateOrderPrefillMock: vi.fn(),
        resyncMock: vi.fn(async () => undefined),
        broadcastMock: vi.fn(async () => '0xabc123'),
        initiateAsPartyMock: vi.fn(),
        signAndBroadcastMock: vi.fn(),
        resetCommitmentFlowMock: vi.fn(),
        approveMock: vi.fn(async () => undefined),
        signPermitForTxMock: vi.fn(async () => ({
            target: '0x2222222222222222222222222222222222222222',
            data: '0x1234',
        })),
        commitmentPayload: payload,
        figaroState: {
            resync: vi.fn(async () => undefined),
            ctx: null,
            createOrderPrefill: null,
            clearCreateOrderPrefill: vi.fn(),
        },
        commitmentState: {
            initiateAsParty: vi.fn(),
            broadcast: vi.fn(async () => '0xabc123'),
            signAndBroadcast: vi.fn(),
            step: 'idle',
            error: null,
            payload: null,
            reset: vi.fn(),
        },
        tokenApprovalState: {
            supportsPermit: false,
            needsApproval: vi.fn(() => false),
            approve: vi.fn(async () => undefined),
            signPermitForTx: vi.fn(async () => ({
                target: '0x2222222222222222222222222222222222222222',
                data: '0x1234',
            })),
            isApprovePending: false,
            isApproveConfirming: false,
        },
        tokenDecimalsState: {
            decimals: 18,
            loading: false,
        },
    };
});

vi.mock('wagmi', () => ({
    useAccount: () => ({ address: '0x1234567890123456789012345678901234567890' }),
    useChainId: () => 31337,
    usePublicClient: () => ({
        waitForTransactionReceipt: vi.fn(async () => undefined),
    }),
    useWalletClient: () => ({
        data: {
            account: '0x1234567890123456789012345678901234567890',
            chain: { id: 31337 },
            sendTransaction: vi.fn(async () => '0xpermit'),
        },
    }),
}));

vi.mock('@/lib/console/provider', () => ({
    useFigaro: () => mocks.figaroState,
}));

// lib/console/provider.tsx has a dynamic import for this path which no longer exists.
// Vite resolves all dynamic imports statically, so the mock must be registered here.
vi.mock('@/app/(app)/builders/authoring/actions', () => ({
    publishAssemblyAction: vi.fn(),
}));

vi.mock('@/lib/core/useCommitmentFlow', () => ({
    useCommitmentFlow: () => mocks.commitmentState,
}));

vi.mock('@/hooks/core/useTokenApproval', () => ({
    __esModule: true,
    default: () => mocks.tokenApprovalState,
}));

vi.mock('@/hooks/core/useTokenDecimals', () => ({
    __esModule: true,
    default: () => mocks.tokenDecimalsState,
}));

vi.mock('@/components/core/BondApprovalPanel', () => ({
    __esModule: true,
    default: ({ approved, onApprove, onSignPermit, supportsPermit }: {
        approved: boolean;
        onApprove?: () => Promise<void>;
        onSignPermit?: () => Promise<void>;
        supportsPermit?: boolean;
    }) => (
        <div>
            <span>{approved ? 'Approved' : 'Needs approval'}</span>
            <button type="button" onClick={() => void onApprove?.()}>
                Approve Bond
            </button>
            {supportsPermit && (
                <button type="button" onClick={() => void onSignPermit?.()}>
                    Sign Permit
                </button>
            )}
        </div>
    ),
}));

vi.mock('@/components/core/CommitmentSharePanel', () => ({
    CommitmentSharePanel: ({ onBroadcast }: { onBroadcast?: () => void }) => (
        <button type="button" onClick={onBroadcast}>
            Broadcast Shared Commitment
        </button>
    ),
}));

import { CreateOrderPanel } from '@/components/console/CreateOrderPanel';
import { ZERO_ADDRESS } from '@/lib/shared/evm';

describe('CreateOrderPanel', () => {
    beforeEach(() => {
        mocks.clearCreateOrderPrefillMock.mockReset();
        mocks.resyncMock.mockReset();
        mocks.broadcastMock.mockReset();
        mocks.initiateAsPartyMock.mockReset();
        mocks.signAndBroadcastMock.mockReset();
        mocks.resetCommitmentFlowMock.mockReset();
        mocks.approveMock.mockReset();
        mocks.signPermitForTxMock.mockReset();

        mocks.figaroState = {
            resync: mocks.resyncMock,
            ctx: null,
            createOrderPrefill: null,
            clearCreateOrderPrefill: mocks.clearCreateOrderPrefillMock,
        };

        mocks.commitmentState = {
            initiateAsParty: mocks.initiateAsPartyMock,
            broadcast: mocks.broadcastMock,
            signAndBroadcast: mocks.signAndBroadcastMock,
            step: 'idle',
            error: null,
            payload: null,
            reset: mocks.resetCommitmentFlowMock,
        };

        mocks.tokenApprovalState = {
            supportsPermit: false,
            needsApproval: vi.fn(() => false),
            approve: mocks.approveMock,
            signPermitForTx: mocks.signPermitForTxMock,
            isApprovePending: false,
            isApproveConfirming: false,
        };

        mocks.tokenDecimalsState = {
            decimals: 18,
            loading: false,
        };
    });

    it('loads forwarded sub-order prefills into the form', async () => {
        mocks.figaroState = {
            ...mocks.figaroState,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            createOrderPrefill: {
                seller: '0x9999999999999999999999999999999999999999',
                payment: '0.5',
                currency: '0x2222222222222222222222222222222222222222',
                agreementHash: '0x' + '33'.repeat(32),
                isSubOrder: true,
                processId: '0x' + '44'.repeat(32),
            } as any,
        };

        render(<CreateOrderPanel />);

        await waitFor(() => {
            expect(screen.getByText(/Loaded a sub-order draft for process/i)).toBeInTheDocument();
        });

        expect(screen.getByDisplayValue('0x9999999999999999999999999999999999999999')).toBeInTheDocument();
        expect(screen.getByDisplayValue('0.5')).toBeInTheDocument();
        expect(screen.getByDisplayValue('0x' + '44'.repeat(32))).toBeInTheDocument();
        expect(mocks.clearCreateOrderPrefillMock).toHaveBeenCalledTimes(1);
        expect(mocks.resetCommitmentFlowMock).toHaveBeenCalledTimes(1);
    });

    it('broadcasts shared commitments through the shared commitment flow', async () => {
        const user = userEvent.setup();
        mocks.commitmentState = {
            ...mocks.commitmentState,
            step: 'awaiting-counter',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            payload: mocks.commitmentPayload as any,
        };

        render(<CreateOrderPanel />);

        await user.click(screen.getByRole('button', { name: 'Broadcast Shared Commitment' }));

        await waitFor(() => {
            expect(mocks.broadcastMock).toHaveBeenCalledWith(mocks.commitmentPayload);
        });

        expect(mocks.resyncMock).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Order committed successfully!')).toBeInTheDocument();
    });

    it('blocks submission until the buyer bond is approved', async () => {
        const user = userEvent.setup();
        mocks.tokenApprovalState = {
            ...mocks.tokenApprovalState,
            needsApproval: vi.fn(() => true),
        };

        render(<CreateOrderPanel />);

        await user.type(screen.getByPlaceholderText('0x...'), '0x9999999999999999999999999999999999999999');
        await user.type(screen.getByPlaceholderText(ZERO_ADDRESS), '0x2222222222222222222222222222222222222222');
        await user.click(screen.getByRole('button', { name: 'Create Commitment' }));

        await waitFor(() => {
            expect(screen.getByText('Approve the buyer bond before creating the commitment.')).toBeInTheDocument();
        });

        expect(mocks.initiateAsPartyMock).not.toHaveBeenCalled();
        expect(mocks.signAndBroadcastMock).not.toHaveBeenCalled();
    });

    it('rejects payments that exceed token decimal precision', async () => {
        const user = userEvent.setup();
        mocks.tokenDecimalsState = {
            decimals: 6,
            loading: false,
        };

        render(<CreateOrderPanel />);

        const sellerInput = screen.getByPlaceholderText('0x...');
        const currencyInput = screen.getByPlaceholderText(ZERO_ADDRESS);
        await user.type(sellerInput, '0x9999999999999999999999999999999999999999');
        await user.type(currencyInput, '0x2222222222222222222222222222222222222222');

        const paymentInput = screen.getByDisplayValue('0.01');
        await user.clear(paymentInput);
        await user.type(paymentInput, '0.1234567');
        await user.click(screen.getByRole('button', { name: 'Create Commitment' }));

        await waitFor(() => {
            expect(screen.getByText('Payment amount exceeds token decimal precision for this token')).toBeInTheDocument();
        });

        expect(mocks.initiateAsPartyMock).not.toHaveBeenCalled();
        expect(mocks.signAndBroadcastMock).not.toHaveBeenCalled();
    });
});