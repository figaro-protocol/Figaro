import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CartModule } from '@/components/modules/CartModule';
import { SellerDiscoveryModule } from '@/components/modules/SellerDiscoveryModule';
import type { ResolvedAssemblySkinBundle } from '@/lib/shared/runtimeResolution';

const useRegisteredCataloguesMock = vi.fn();
const useCartStoreMock = vi.fn();

vi.mock('@/lib/mechanisms/useRegisteredCatalogues', () => ({
    useRegisteredCatalogues: (...args: unknown[]) => useRegisteredCataloguesMock(...args),
}));

vi.mock('@/lib/marketplace/cartStore', () => ({
    useCartStore: (...args: unknown[]) => useCartStoreMock(...args),
}));

vi.mock('@/components/modules/MerchantBrandingModule', () => ({
    MerchantBrandingModule: ({ children }: { children: ReactNode }) => <div data-testid="merchant-branding-wrapper">{children}</div>,
    MerchantLogo: ({ fallbackEmoji = '🍽️' }: { fallbackEmoji?: string }) => <div data-testid="merchant-logo">{fallbackEmoji}</div>,
}));

vi.mock('@/components/shared/ContentImage', () => ({
    ContentImage: ({ alt }: { alt?: string }) => <div data-testid="content-image">{alt ?? 'image'}</div>,
}));

vi.mock('@/components/modules/OperatorRegistrationModule', () => ({
    OperatorServiceDisplay: () => null,
    AgentBadge: () => null,
}));

vi.mock('wagmi', () => ({
    useAccount: () => ({
        address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        isConnected: true,
    }),
    useReadContract: () => ({ data: 999999999999n }),
}));

vi.mock('@/hooks/core/useTokenApproval', () => ({
    __esModule: true,
    default: () => ({
        needsApproval: () => false,
        approve: vi.fn(),
        isApprovePending: false,
        isApproveConfirming: false,
        isApproveSuccess: false,
    }),
}));

vi.mock('@/lib/core/useCommitmentFlow', () => ({
    useCommitmentFlow: () => ({
        initiateAsParty: vi.fn(),
        broadcast: vi.fn(),
        payload: null,
        step: 'idle',
        error: null,
        reset: vi.fn(),
    }),
}));

vi.mock('@/hooks/core/useTokenDecimals', () => ({
    default: () => ({ decimals: 18 }),
}));

vi.mock('@/lib/core/contracts', () => ({
    CONTRACTS: {
        mockToken: '0x0000000000000000000000000000000000000001',
        permitToken: '0x0000000000000000000000000000000000000002',
        core: '0x0000000000000000000000000000000000000003',
    },
    ERC20_ABI: [
        { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
    ],
}));

vi.mock('@/components/core/CommitmentSharePanel', () => ({
    CommitmentSharePanel: () => <div data-testid="commitment-share-panel" />,
}));

const skinBundle: ResolvedAssemblySkinBundle = {
    sourceKind: 'runtime-bound',
    skinId: 'binding-neighbourhood-eats-local-anvil',
    subjectAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    bindingId: 'binding:neighbourhood-eats:local-anvil',
    branding: {
        branding: {
            displayName: 'Neighbourhood Eats',
            accentColor: '#1f6feb',
            themeClass: 'runtime-shell-neighbourhood',
        },
        assets: {},
        logoURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-logo.png',
        heroImageURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-hero.png',
        cssURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-theme.css',
    },
};

const restaurant = {
    id: 'rest-1',
    name: 'Bob\'s Pizza Palace',
    cuisine: 'Pizza',
    description: 'Wood-fired pizzas and bonded checkout.',
    deliveryTime: '25 min',
    minimumOrder: '0.02',
    image: '🍕',
    address: '0x2222222222222222222222222222222222222222',
    acceptedTokens: [
        {
            address: '0x3333333333333333333333333333333333333333',
            symbol: 'FIG',
        },
    ],
    menu: [
        {
            id: 'pizza-margherita',
            name: 'Margherita',
            description: 'Tomato, basil, mozzarella.',
            price: '0.01',
            image: 'ipfs://example/margherita.png',
            category: 'Pizza',
            available: true,
        },
    ],
};

function createDiscoveryProps(overrides?: Record<string, unknown>) {
    return {
        moduleId: 'seller-discovery',
        binding: {} as never,
        context: {
            selectedRoleKind: 'buyer',
            services: {
                discovery: {},
            },
            shellPresentation: {
                title: 'Neighbourhood Eats',
            },
            skinBundle,
            ...(overrides ?? {}),
        },
    } as any;
}

function createCartProps(overrides?: Record<string, unknown>) {
    return {
        moduleId: 'cart',
        binding: {} as never,
        context: {
            selectedRoleKind: 'buyer',
            shellPresentation: {
                title: 'Neighbourhood Eats',
            },
            skinBundle,
            ...(overrides ?? {}),
        },
    } as any;
}

describe('runtime skin-aware buyer surfaces', () => {
    beforeEach(() => {
        useRegisteredCataloguesMock.mockReset();
        useCartStoreMock.mockReset();
    });

    it('renders discovery shell label and accent-styled buyer controls', () => {
        const addItem = vi.fn();
        const removeItem = vi.fn();

        useRegisteredCataloguesMock.mockReturnValue({
            restaurants: [restaurant],
            isLoading: false,
        });
        useCartStoreMock.mockReturnValue({
            items: [],
            addItem,
            removeItem,
        });

        render(<SellerDiscoveryModule {...createDiscoveryProps()} />);

        expect(screen.getByTestId('seller-discovery-module')).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(screen.getByText('Neighbourhood Eats')).toHaveStyle({ color: '#1f6feb' });

        fireEvent.click(screen.getByTestId('cuisine-filter-Pizza'));
        expect(screen.getByTestId('cuisine-filter-Pizza')).toHaveStyle({ backgroundColor: '#1f6feb' });

        fireEvent.click(screen.getByTestId('restaurant-card'));

        expect(screen.getByTestId('btn-back-to-restaurants')).toHaveStyle({ color: '#1f6feb' });
        expect(screen.getByTestId('btn-add-pizza-margherita')).toHaveStyle({ backgroundColor: '#1f6feb' });
    });

    it('renders cart shell label and accent-styled checkout controls', () => {
        useCartStoreMock.mockReturnValue({
            items: [
                {
                    menuItemId: 'pizza-margherita',
                    restaurantId: 'rest-1',
                    restaurantAddress: '0x2222222222222222222222222222222222222222',
                    restaurantName: 'Bob\'s Pizza Palace',
                    name: 'Margherita',
                    price: '0.01',
                    quantity: 2,
                    imageURI: 'ipfs://example/margherita.png',
                },
            ],
            addItem: vi.fn(),
            removeItem: vi.fn(),
            clearCart: vi.fn(),
            getTotalPrice: () => '0.02',
            getItemCount: () => 2,
            deliveryMaxPrice: '0.003',
            setDeliveryMaxPrice: vi.fn(),
            fulfillmentMode: 'pickup',
            setFulfillmentMode: vi.fn(),
        });

        render(<CartModule {...createCartProps()} />);

        expect(screen.getByTestId('cart-module')).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(screen.getByTestId('cart-fab')).toHaveStyle({ backgroundColor: '#1f6feb' });

        fireEvent.click(screen.getByTestId('cart-fab'));

        expect(screen.getByTestId('cart-panel')).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(screen.getByText('Neighbourhood Eats')).toHaveStyle({ color: '#1f6feb' });
        expect(screen.getByTestId('cart-total')).toHaveStyle({ color: '#1f6feb' });
        expect(screen.getByTestId('btn-place-order-cart')).toHaveStyle({ backgroundColor: '#1f6feb' });
    });
});