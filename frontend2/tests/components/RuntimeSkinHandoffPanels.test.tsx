import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HandoffDetailsModule } from '@/components/modules/HandoffDetailsModule';
import { HandoffKeyExchangeModule } from '@/components/modules/HandoffKeyExchangeModule';
import { HandoffTrackerModule } from '@/components/modules/HandoffTrackerModule';
import type { ResolvedAssemblySkinBundle } from '@/lib/shared/runtimeResolution';

const useAccountMock = vi.fn();
const useWalletClientMock = vi.fn();

vi.mock('wagmi', () => ({
    useAccount: () => useAccountMock(),
    useWalletClient: () => useWalletClientMock(),
}));

const skinBundle: ResolvedAssemblySkinBundle = {
    sourceKind: 'runtime-bound',
    skinId: 'binding-handoff-guild-local-anvil',
    subjectAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    bindingId: 'binding:handoff-guild:local-anvil',
    branding: {
        branding: {
            displayName: 'Handoff Guild',
            accentColor: '#1f6feb',
            themeClass: 'runtime-shell-handoff-guild',
        },
        assets: {},
        logoURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-logo.png',
        heroImageURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-hero.png',
        cssURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-theme.css',
    },
};

function createBaseContext(overrides?: Record<string, unknown>) {
    return {
        selectedRoleKind: 'buyer',
        shellPresentation: {
            title: 'Handoff Guild',
        },
        skinBundle,
        mechanisms: [
            {
                kind: 'coordinator',
                pickupGeohash: 'dr5reg',
                deliveryOrderId: 'handoff-1',
                deliveryStage: 3,
                auctionStarted: true,
                assignedDriver: '0x2222222222222222222222222222222222222222',
                dropoffGeohash: 'dr5reh',
            },
            {
                kind: 'auction',
            },
        ],
        services: {
            coordinationMessaging: {
                sendHandoffKey: vi.fn().mockResolvedValue(undefined),
            },
            handoffPersistence: {
                getHandoffKey: vi.fn().mockReturnValue({ keyB64: 'handoff-key-123' }),
            },
        },
        selectedOrder: {
            orderId: 'order-1',
            processId: 'process-1',
        },
        ...(overrides ?? {}),
    };
}

function createProps(moduleId: string, overrides?: Record<string, unknown>) {
    return {
        moduleId,
        binding: {} as never,
        context: createBaseContext(overrides),
    } as any;
}

describe('runtime skin-aware handoff panels', () => {
    beforeEach(() => {
        useAccountMock.mockReset();
        useWalletClientMock.mockReset();

        useAccountMock.mockReturnValue({
            address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            isConnected: true,
        });
        useWalletClientMock.mockReturnValue({
            data: undefined,
        });
    });

    it('renders the handoff tracker inside a skinned runtime wrapper', () => {
        render(<HandoffTrackerModule {...createProps('handoff-tracker')} />);

        expect(screen.getByTestId('handoff-tracker-module')).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(screen.getByText('Handoff Guild')).toHaveStyle({ color: '#1f6feb' });
        expect(screen.getByText('Fulfiller heading to pickup')).toBeInTheDocument();
    });

    it('renders the key-exchange panel with shell chrome and preserves secure-send behavior', async () => {
        const sendHandoffKey = vi.fn().mockResolvedValue(undefined);

        render(
            <HandoffKeyExchangeModule
                {...createProps('handoff-key-exchange', {
                    services: {
                        coordinationMessaging: {
                            sendHandoffKey,
                        },
                        handoffPersistence: {
                            getHandoffKey: vi.fn().mockReturnValue({ keyB64: 'handoff-key-123' }),
                        },
                    },
                })}
            />,
        );

        expect(screen.getByTestId('handoff-key-module')).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(screen.getByText('Handoff Guild')).toHaveStyle({ color: '#1f6feb' });

        await waitFor(() => {
            expect(sendHandoffKey).toHaveBeenCalledWith(expect.objectContaining({
                recipientAddress: '0x2222222222222222222222222222222222222222',
                orderId: 'order-1',
                keyB64: 'handoff-key-123',
            }));
        });

        expect(await screen.findByTestId('key-exchange-status')).toHaveTextContent('Key sent to fulfiller');
    });

    it('renders handoff details with shell chrome and accent-styled buyer controls', () => {
        render(<HandoffDetailsModule {...createProps('handoff-details')} />);

        expect(screen.getByTestId('handoff-details-module')).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(screen.getByText('Handoff Guild')).toHaveStyle({ color: '#1f6feb' });

        fireEvent.click(screen.getByTestId('cos-btn-E'));
        expect(screen.getByTestId('cos-btn-E')).toHaveStyle({ borderColor: '#1f6feb' });

        fireEvent.change(screen.getByTestId('input-destination-address'), {
            target: { value: '123 Main St' },
        });

        fireEvent.click(screen.getByTestId('handoff-verified-checkbox'));

        expect(screen.getByTestId('btn-confirm-handoff')).toHaveStyle({ backgroundColor: '#1f6feb' });
    });

    it('keeps the submitted handoff state inside the skinned wrapper', () => {
        render(<HandoffDetailsModule {...createProps('handoff-details')} />);

        fireEvent.change(screen.getByTestId('input-destination-address'), {
            target: { value: '456 Oak Ave' },
        });
        fireEvent.click(screen.getByTestId('handoff-verified-checkbox'));
        fireEvent.click(screen.getByTestId('btn-confirm-handoff'));

        expect(screen.getByTestId('handoff-details-module')).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(screen.getByText('Handoff Guild')).toHaveStyle({ color: '#1f6feb' });
        expect(screen.getByText('Handoff details confirmed')).toBeInTheDocument();
    });
});