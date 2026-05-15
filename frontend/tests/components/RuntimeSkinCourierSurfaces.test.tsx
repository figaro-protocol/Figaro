import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JobMarketModule } from '@/components/modules/JobMarketModule';
import { makeSkinBundle } from './_skinBundleFixture';

const useCourierOfferingMock = vi.fn();

vi.mock('wagmi', () => ({
    useAccount: () => ({
        address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        isConnected: true,
    }),
    usePublicClient: () => undefined,
}));

vi.mock('@/lib/mechanisms/useCourierOffering', () => ({
    useCourierOffering: (...args: unknown[]) => useCourierOfferingMock(...args),
}));

vi.mock('@/lib/shared/merchantBranding', () => ({
    resolveContentURI: (uri: string) => uri,
}));

vi.mock('@/lib/core/contracts', () => ({
    CONTRACTS: {
        dutchAuction: '',
    },
    DUTCH_AUCTION_ABI: [],
}));

const skinBundle = makeSkinBundle({
    slug: 'courier-guild',
    displayName: 'Courier Guild',
    themeClass: 'runtime-shell-courier-guild',
});

function createProps(overrides?: Record<string, unknown>) {
    return {
        moduleId: 'job-market',
        binding: {} as never,
        context: {
            shellPresentation: {
                title: 'Courier Guild',
            },
            skinBundle,
            ...(overrides ?? {}),
        },
    } as any;
}

describe('runtime skin-aware courier surfaces', () => {
    beforeEach(() => {
        useCourierOfferingMock.mockReset();
        useCourierOfferingMock.mockReturnValue({
            offering: {
                displayName: 'Courier One',
                vehicleType: 'bike',
                branding: {
                    avatarURI: 'ipfs://example/courier.png',
                },
                serviceAreas: [
                    {
                        geohashPrefix: 'dr5reh',
                        label: 'Downtown',
                    },
                ],
                minimumFee: '0.002',
            },
        });
    });

    it('renders job-market shell label and accent-styled claim controls', () => {
        render(<JobMarketModule {...createProps()} />);

        expect(screen.getByTestId('job-market-module')).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(screen.getByText('Courier Guild')).toHaveStyle({ color: '#1f6feb' });
        expect(screen.getByTestId('courier-profile-banner')).toHaveStyle({ borderTopColor: '#1f6feb' });
        expect(screen.getByTestId('btn-claim-1')).toHaveStyle({ backgroundColor: '#1f6feb' });
        expect(screen.getByText('0.0018 ETH')).toHaveStyle({ color: '#1f6feb' });
    });

    it('styles the clear filter control with the resolved accent', () => {
        render(<JobMarketModule {...createProps()} />);

        fireEvent.change(screen.getByTestId('geohash-filter-input'), {
            target: { value: '9q8' },
        });

        expect(screen.getByTestId('btn-clear-geohash-filter')).toHaveStyle({ color: '#1f6feb' });
    });
});
