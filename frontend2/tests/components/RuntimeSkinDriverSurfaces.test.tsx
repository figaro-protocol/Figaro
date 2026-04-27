import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JobMarketModule } from '@/components/modules/JobMarketModule';
import type { ResolvedAssemblySkinBundle } from '@/lib/shared/runtimeResolution';

const useDriverOfferingMock = vi.fn();

vi.mock('wagmi', () => ({
    useAccount: () => ({
        address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        isConnected: true,
    }),
    usePublicClient: () => undefined,
}));

vi.mock('@/lib/mechanisms/useDriverOffering', () => ({
    useDriverOffering: (...args: unknown[]) => useDriverOfferingMock(...args),
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

const skinBundle: ResolvedAssemblySkinBundle = {
    sourceKind: 'runtime-bound',
    skinId: 'binding-driver-guild-local-anvil',
    subjectAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    bindingId: 'binding:driver-guild:local-anvil',
    branding: {
        branding: {
            displayName: 'Driver Guild',
            accentColor: '#1f6feb',
            themeClass: 'runtime-shell-driver-guild',
        },
        assets: {},
        logoURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-logo.png',
        heroImageURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-hero.png',
        cssURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-theme.css',
    },
};

function createProps(overrides?: Record<string, unknown>) {
    return {
        moduleId: 'job-market',
        binding: {} as never,
        context: {
            selectedRoleKind: 'courier',
            shellPresentation: {
                title: 'Driver Guild',
            },
            skinBundle,
            ...(overrides ?? {}),
        },
    } as any;
}

describe('runtime skin-aware driver surfaces', () => {
    beforeEach(() => {
        useDriverOfferingMock.mockReset();
        useDriverOfferingMock.mockReturnValue({
            offering: {
                displayName: 'Courier One',
                vehicleType: 'bike',
                branding: {
                    avatarURI: 'ipfs://example/driver.png',
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
        expect(screen.getByText('Driver Guild')).toHaveStyle({ color: '#1f6feb' });
        expect(screen.getByTestId('driver-profile-banner')).toHaveStyle({ borderTopColor: '#1f6feb' });
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