import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CoordinatorActionModule } from '@/components/modules/CoordinatorActionModule';
import { DisclosureModule } from '@/components/modules/DisclosureModule';
import { DISCLOSURE_KIND } from '@/lib/mechanisms/contracts';
import { makeSkinBundle } from './_skinBundleFixture';

const useOrderDisclosureTasksMock = vi.fn();
const useProcessDisclosureSummaryMock = vi.fn();

vi.mock('@/lib/mechanisms/useGHGDisclosure', () => ({
    useOrderDisclosureTasks: (...args: unknown[]) => useOrderDisclosureTasksMock(...args),
    useProcessDisclosureSummary: (...args: unknown[]) => useProcessDisclosureSummaryMock(...args),
    formatActualGrams: (grams: bigint) => `${grams.toString()} g CO2e`,
}));

const skinBundle = makeSkinBundle();

function createCoordinatorProps(overrides?: Record<string, unknown>) {
    return {
        moduleId: 'coordinator-action',
        binding: {} as never,
        context: {
            mechanisms: [
                {
                    id: 'delivery-coordinator',
                    kind: 'coordinator',
                    name: 'Delivery Coordinator',
                    description: '',
                    riskClass: 'low-risk-coordinator',
                    moduleBindings: [],
                    contracts: [],
                    touchesAssets: false,
                    recognizedRoles: ['courier'],
                    guarantees: [],
                    attachments: [],
                },
            ],
            selectedOrder: {
                orderId: 'order-1',
                capabilities: [
                    {
                        id: 'declare-en-route',
                        label: 'Declare En Route',
                        actionKind: 'submit-courier-process-signal',
                        action: {
                            executionType: 'transaction',
                            kind: 'submit-courier-process-signal',
                            eventType: 'en-route-pickup',
                            orderHash: 'order-1',
                        },
                    },
                ],
            },
            executableCapabilityIds: new Set(['declare-en-route']),
            executingCapabilityId: null,
            onExecuteCapability: vi.fn(),
            skinBundle,
            ...(overrides ?? {}),
        },
    } as any;
}

function createDisclosureProps(overrides?: Record<string, unknown>) {
    return {
        moduleId: 'disclosure',
        binding: {} as never,
        context: {
            selectedRoleKind: 'merchant',
            processModel: {
                processId: 'process-1',
            },
            mechanisms: [
                {
                    id: 'ghg-disclosure',
                    kind: 'disclosure',
                    name: 'GHG Disclosure',
                    description: '',
                    riskClass: 'protocol-derived',
                    moduleBindings: [],
                    contracts: [],
                    touchesAssets: false,
                    recognizedRoles: ['merchant'],
                    guarantees: [],
                    attachments: [],
                },
            ],
            selectedOrder: {
                orderId: 'order-1',
                capabilities: [
                    {
                        id: 'submit-ghg-actual',
                        label: 'Submit Actual',
                        action: {
                            executionType: 'transaction',
                            kind: 'submit-disclosure-inventory',
                        },
                    },
                ],
            },
            executableCapabilityIds: new Set(['submit-ghg-actual']),
            onExecuteCapability: vi.fn(),
            skinBundle,
            ...(overrides ?? {}),
        },
    } as any;
}

describe('runtime skin-aware coordination panels', () => {
    beforeEach(() => {
        useOrderDisclosureTasksMock.mockReset();
        useOrderDisclosureTasksMock.mockReturnValue({
            tasks: [
                {
                    stage: DISCLOSURE_KIND.commitment,
                },
            ],
            loading: false,
            refresh: vi.fn(),
        });

        useProcessDisclosureSummaryMock.mockReset();
        useProcessDisclosureSummaryMock.mockReturnValue({
            summary: {
                totalActualGrams: 1250n,
                attestationCount: 2,
                commitmentCount: 1,
                actualCount: 1,
            },
            loading: false,
        });
    });

    it('renders coordinator actions with skin-aware executable signal buttons', () => {
        render(<CoordinatorActionModule {...createCoordinatorProps()} />);

        expect(screen.getByTestId('coordinator-action-module')).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(screen.getByText('Delivery Coordinator')).toHaveStyle({ color: '#1f6feb' });
        expect(screen.getByRole('button', { name: 'Declare En Route' })).toHaveStyle({ backgroundColor: '#1f6feb' });
    });

    it('renders disclosure summaries and actual submission chrome with the resolved accent', () => {
        render(<DisclosureModule {...createDisclosureProps()} />);

        expect(screen.getByTestId('disclosure-module')).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(screen.getByText('GHG Disclosure')).toHaveStyle({ color: '#1f6feb' });
        expect(screen.getByText('1250 g CO2e')).toBeInTheDocument();
        expect(screen.getByTestId('ghg-submit-actual')).toHaveStyle({ backgroundColor: '#1f6feb' });
    });
});