import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogueEditorModule } from '@/components/modules/CatalogueEditorModule';
import { OperatorRegistrationModule } from '@/components/modules/OperatorRegistrationModule';
import type { ResolvedInstitutionSkinBundle } from '@/lib/shared/runtimeResolution';

const useMerchantCatalogueMock = vi.fn();
const useOperatorProfileMock = vi.fn();

vi.mock('wagmi', () => ({
    useAccount: () => ({
        address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        isConnected: true,
    }),
}));

vi.mock('@/lib/mechanisms/useMerchantCatalogue', () => ({
    useMerchantCatalogue: (...args: unknown[]) => useMerchantCatalogueMock(...args),
}));

vi.mock('@/lib/mechanisms/useOperatorRegistry', () => ({
    OperatorRole: { None: 0, Merchant: 1, Driver: 2, Both: 3 },
    useOperatorProfile: (...args: unknown[]) => useOperatorProfileMock(...args),
    useRegistrationDeposit: () => ({ data: 1000000000000000n }),
    useWithdrawDeposit: () => ({ withdraw: vi.fn(), isPending: false, isConfirming: false, isSuccess: false, error: null, hash: undefined }),
    useReactivateOperator: () => ({ reactivate: vi.fn(), isPending: false, isConfirming: false, isSuccess: false, error: null, hash: undefined }),
    useDepositLockPeriod: () => ({ data: 0n }),
    useAgentServices: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/lib/mechanisms/useDidWeb', () => ({
    useDidVerification: () => ({ verified: false, isLoading: false, error: null }),
    isDidWeb: (s: string) => s?.startsWith('did:web:'),
}));

vi.mock('@/lib/shared/ipfsService', () => ({
    DEFAULT_IPFS_SERVICE: {
        pinJSON: vi.fn().mockResolvedValue('QmTest123'),
        buildURI: vi.fn().mockReturnValue('ipfs://QmTest123'),
    },
}));

const skinBundle: ResolvedInstitutionSkinBundle = {
    sourceKind: 'runtime-bound',
    skinId: 'binding-bobs-pizza-palace-local-anvil',
    subjectAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    bindingId: 'binding:bobs-pizza-palace:local-anvil',
    branding: {
        branding: {
            displayName: "Bob's Pizza Palace",
            accentColor: '#1f6feb',
            themeClass: 'runtime-shell-pizza',
        },
        assets: {},
        logoURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-logo.png',
        heroImageURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-hero.png',
        cssURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-theme.css',
    },
};

function createCatalogueProps(overrides?: Record<string, unknown>) {
    return {
        moduleId: 'catalogue-editor',
        binding: {} as never,
        context: {
            selectedRoleKind: 'restaurant',
            services: {
                catalogue: {
                    publishMerchantCatalogue: vi.fn(),
                },
                evidenceTransport: {
                    uploadFile: vi.fn(),
                },
            },
            capabilities: [],
            onExecuteCapability: vi.fn(),
            shellPresentation: {
                title: "Bob's Pizza Palace",
            },
            skinBundle,
            ...(overrides ?? {}),
        },
    } as any;
}

function createOperatorRegistrationProps(overrides?: Record<string, unknown>) {
    return {
        moduleId: 'operator-registration-panel',
        binding: {} as never,
        context: {
            capabilities: [
                {
                    id: 'register-operator-capability',
                    label: 'Register Operator',
                    action: {
                        executionType: 'transaction',
                        kind: 'register-operator',
                    },
                },
            ],
            executableCapabilityIds: new Set(['register-operator-capability']),
            executingCapabilityId: null,
            onExecuteCapability: vi.fn(),
            shellPresentation: {
                title: "Bob's Pizza Palace",
            },
            skinBundle,
            ...(overrides ?? {}),
        },
    } as any;
}

describe('runtime skin-aware seller setup modules', () => {
    beforeEach(() => {
        useMerchantCatalogueMock.mockReset();
        useMerchantCatalogueMock.mockReturnValue({
            catalogue: null,
            isLoading: false,
            refetch: vi.fn(),
        });
        useOperatorProfileMock.mockReset();
        useOperatorProfileMock.mockReturnValue({
            data: [1, true, 'ipfs://example/catalogue.json'],
        });
    });

    it('renders the catalogue editor with shell label and accent chrome', () => {
        render(<CatalogueEditorModule {...createCatalogueProps()} />);

        const module = screen.getByTestId('catalogue-editor-module');

        expect(module).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(screen.getAllByText("Bob's Pizza Palace").length).toBeGreaterThan(0);
        expect(screen.getAllByText('Seller Setup')[0]).toHaveStyle({ color: '#1f6feb' });
        expect(screen.getByTestId('btn-add-menu-item')).toHaveStyle({ backgroundColor: '#1f6feb' });
        expect(screen.getByTestId('btn-publish-catalogue')).toHaveStyle({ backgroundColor: '#1f6feb' });
    });

    it('renders the operator registration panel with shell label and preserved execution behavior', async () => {
        const user = userEvent.setup();
        const props = createOperatorRegistrationProps();

        render(<OperatorRegistrationModule {...props} />);

        const module = screen.getByText('Operator Registration').closest('div');
        expect(module).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(screen.getByText("Bob's Pizza Palace")).toBeInTheDocument();

        const actionButton = screen.getByRole('button', { name: 'Register Operator' });
        expect(actionButton).toHaveStyle({ backgroundColor: '#1f6feb' });

        await user.type(screen.getByPlaceholderText('Metadata URI (optional)'), 'ipfs://example/operator.json');
        await user.click(actionButton);

        expect(props.context.onExecuteCapability).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'register-operator-capability' }),
            { kind: 'register-operator', metadataURI: 'ipfs://example/operator.json' },
        );
    });
});