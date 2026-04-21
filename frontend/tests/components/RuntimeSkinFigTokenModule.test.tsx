import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ComponentProps } from 'react';
import { FigTokenModule } from '@/components/modules/FigTokenModule';
import type { ResolvedInstitutionSkinBundle } from '@/lib/shared/runtimeResolution';

const useFigTokenMetricsMock = vi.fn();
const useFigBalanceMock = vi.fn();
const useStagedAirdropStageMock = vi.fn();

vi.mock('wagmi', () => ({
    useAccount: () => ({
        address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        isConnected: true,
    }),
}));

vi.mock('@/lib/mechanisms/useFigToken', () => ({
    useFigTokenMetrics: (...args: unknown[]) => useFigTokenMetricsMock(...args),
    useFigBalance: (...args: unknown[]) => useFigBalanceMock(...args),
    useStagedAirdropStage: (...args: unknown[]) => useStagedAirdropStageMock(...args),
    formatFig: (value: bigint) => value.toString(),
}));

const skinBundle: ResolvedInstitutionSkinBundle = {
    sourceKind: 'runtime-bound',
    skinId: 'binding-fig-runtime-local-anvil',
    subjectAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    bindingId: 'binding:fig-runtime:local-anvil',
    branding: {
        branding: {
            displayName: 'FIG Runtime',
            accentColor: '#1f6feb',
            themeClass: 'runtime-shell-fig',
        },
        assets: {},
        logoURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-logo.png',
        heroImageURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-hero.png',
        cssURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-theme.css',
    },
};

function createProps(overrides?: Record<string, unknown>): ComponentProps<typeof FigTokenModule> {
    return {
        moduleId: 'fig-token',
        binding: {} as never,
        context: {
            shellPresentation: {
                title: 'FIG Runtime',
            },
            skinBundle,
            ...(overrides ?? {}),
        },
    } as unknown as ComponentProps<typeof FigTokenModule>;
}

describe('runtime skin-aware FIG panels', () => {
    beforeEach(() => {
        useFigTokenMetricsMock.mockReset();
        useFigBalanceMock.mockReset();
        useStagedAirdropStageMock.mockReset();

        useFigTokenMetricsMock.mockReturnValue({
            available: true,
            totalSupply: 400000000n, // genesis: 100M founder + 300M DAO
            deployerMintRenounced: true,
        });
        useFigBalanceMock.mockReturnValue({
            balance: 900n,
        });
        useStagedAirdropStageMock.mockImplementation((stageIndex: number) => ({
            available: true,
            root: '0xabc' as `0x${string}`,
            unlockTime: BigInt(1900000000 + stageIndex * 100),
            isUnlocked: false,
        }));
    });

    it('renders FIG metrics with skin-aware shell labels and airdrop chrome', () => {
        render(<FigTokenModule {...createProps()} />);

        expect(screen.getByTestId('fig-token-module')).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(screen.getByText('FIG Runtime')).toHaveStyle({ color: '#1f6feb' });
        expect(screen.getByText('Community Airdrop')).toHaveStyle({ color: '#1f6feb' });
        expect(screen.getByTestId('fig-airdrop-stage-0')).toHaveStyle({ borderTopColor: '#1f6feb' });
        expect(screen.getByTestId('fig-airdrop-stage-1')).toHaveStyle({ borderTopColor: '#1f6feb' });
        expect(screen.getByTestId('fig-airdrop-stage-2')).toHaveStyle({ borderTopColor: '#1f6feb' });
    });

    it('keeps the skin-aware wrapper when FIG contracts are unavailable', () => {
        useFigTokenMetricsMock.mockReturnValue({
            available: false,
        });

        render(<FigTokenModule {...createProps()} />);

        expect(screen.getByTestId('fig-token-module')).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(screen.getByText('FIG Runtime')).toHaveStyle({ color: '#1f6feb' });
        expect(screen.getByText('FIG token contract not available.')).toBeInTheDocument();
    });
});
