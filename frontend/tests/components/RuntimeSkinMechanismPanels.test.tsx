import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EventTimelineModule } from '@/components/modules/EventTimelineModule';
import { OrderActionModule } from '@/components/modules/OrderActionModule';
import { OrderNodeModule } from '@/components/modules/OrderNodeModule';
import { ProcessCapitalSummaryModule } from '@/components/modules/ProcessCapitalSummaryModule';
import { SettlementBreakdownModule } from '@/components/modules/SettlementBreakdownModule';
import type { CapabilityModel, OrderNodeModel, ProcessModel } from '@/lib/semantic/models';
import type { ResolvedInstitutionSkinBundle } from '@/lib/shared/runtimeResolution';

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

const actionCapability: CapabilityModel = {
    id: 'resolve-capability',
    label: 'Resolve Process',
    actionKind: 'resolve-process',
    action: {
        executionType: 'transaction',
        kind: 'resolve-process',
        processId: 'process-1',
    },
    mechanismId: 'core-orders',
    scopeType: 'process',
    scopeId: 'process-1',
    preconditions: ['buyer signature present'],
    source: {
        truthClass: 'protocol-enforced',
        sourceLabel: 'test',
    },
};

const order: OrderNodeModel = {
    orderId: 'order-1',
    processId: 'process-1',
    buyer: '0x1111111111111111111111111111111111111111',
    seller: '0x2222222222222222222222222222222222222222',
    payment: 3n * 10n ** 18n,
    state: 'Active',
    parentOrderIds: [],
    attachments: [],
    capabilities: [actionCapability],
    settlementBreakdown: {
        scopeType: 'order',
        scopeId: 'order-1',
        lockedBond: {
            label: 'Locked bond',
            amount: 6n * 10n ** 18n,
            source: {
                truthClass: 'protocol-enforced',
                sourceLabel: 'test',
            },
        },
        settledAvailable: {
            label: 'Settled available',
            amount: 3n * 10n ** 18n,
            source: {
                truthClass: 'protocol-enforced',
                sourceLabel: 'test',
            },
        },
        typedOutputs: [
            {
                label: 'Seller payout',
                amount: 3n * 10n ** 18n,
                source: {
                    truthClass: 'protocol-enforced',
                    sourceLabel: 'test',
                },
            },
        ],
    },
};

const processModel: ProcessModel = {
    processId: 'process-1',
    rootOrderId: 'order-1',
    orders: [order],
    relations: [],
    stateSummary: 'Active',
    capabilities: [],
    attachments: [],
    upstreamLinks: [],
    downstreamLinks: [],
    economicSummary: {
        scopeType: 'process',
        scopeId: 'process-1',
        lockedBond: {
            label: 'Locked bond',
            amount: 6n * 10n ** 18n,
            source: {
                truthClass: 'protocol-enforced',
                sourceLabel: 'test',
            },
        },
        settledAvailable: {
            label: 'Settled available',
            amount: 3n * 10n ** 18n,
            source: {
                truthClass: 'protocol-enforced',
                sourceLabel: 'test',
            },
        },
        typedOutputs: [],
    },
};

function createProps(overrides?: Record<string, unknown>) {
    return {
        moduleId: 'module-under-test',
        binding: {} as never,
        context: {
            selectedOrder: order,
            processModel,
            executableCapabilityIds: new Set([actionCapability.id]),
            executingCapabilityId: null,
            onExecuteCapability: vi.fn(),
            onSelectOrder: vi.fn(),
            skinBundle,
            shellPresentation: {
                title: "Bob's Pizza Palace",
            },
            ...(overrides ?? {}),
        },
    } as any;
}

describe('runtime skin-aware mechanism panels', () => {
    it('renders order actions with accent-styled execution buttons', () => {
        render(<OrderActionModule {...createProps()} />);

        expect(screen.getByTestId('order-action-module')).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(screen.getByText('Order Actions')).toHaveStyle({ color: '#1f6feb' });
        expect(screen.getByRole('button', { name: 'Resolve Process' })).toHaveStyle({ backgroundColor: '#1f6feb' });
    });

    it('renders process capital summaries with accent progress chrome', () => {
        render(<ProcessCapitalSummaryModule {...createProps()} />);

        const module = screen.getByTestId('process-capital-module');
        expect(module).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(screen.getByText('Process Capital Summary')).toHaveStyle({ color: '#1f6feb' });
        expect(screen.getByTestId('capital-net-exposure')).toHaveStyle({ borderColor: '#1f6feb' });
    });

    it('renders settlement breakdowns with skin-aware chrome', () => {
        render(<SettlementBreakdownModule {...createProps()} />);

        expect(screen.getByTestId('settlement-breakdown-module')).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(screen.getByText('Settlement Breakdown')).toHaveStyle({ color: '#1f6feb' });
    });

    it('renders timelines with accent-styled header and filter pills', () => {
        render(<EventTimelineModule {...createProps()} />);

        expect(screen.getByTestId('event-timeline-module')).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(screen.getByText('Order Timeline')).toHaveStyle({ color: '#1f6feb' });
        expect(screen.getByTestId('timeline-filter-all')).toHaveStyle({ borderColor: '#1f6feb' });
    });

    it('renders order nodes with accent-styled action buttons while preserving state tone', () => {
        render(<OrderNodeModule {...createProps()} />);

        expect(screen.getByTestId('order-node-module')).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(screen.getByText('Order #order-1')).toHaveStyle({ color: '#1f6feb' });
        expect(screen.getAllByRole('button', { name: 'Resolve Process' })[0]).toHaveStyle({ backgroundColor: '#1f6feb' });
        expect(screen.getByText('Active')).toBeInTheDocument();
    });
});