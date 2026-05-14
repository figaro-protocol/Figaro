import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    AgentBadge,
    OperatorServiceDisplay,
    OperatorRegistrationModule,
} from '@/components/modules/OperatorRegistrationModule';

const useAgentServicesMock = vi.fn();
const useDidVerificationMock = vi.fn();
const pinJSONMock = vi.fn();

vi.mock('wagmi', () => ({
    useAccount: () => ({
        address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        isConnected: true,
    }),
}));

vi.mock('@/lib/mechanisms/useOperatorRegistry', () => ({
    useRegistrationDeposit: () => ({ data: 1000000000000000n }),
    useWithdrawDeposit: () => ({
        withdraw: vi.fn(),
        isPending: false,
        isConfirming: false,
        isSuccess: false,
        error: null,
        hash: undefined,
    }),
    useAgentServices: (...args: unknown[]) => useAgentServicesMock(...args),
}));

vi.mock('@/lib/mechanisms/useDidWeb', () => ({
    useDidVerification: (...args: unknown[]) => useDidVerificationMock(...args),
    isDidWeb: (s: string) => s?.startsWith('did:web:'),
}));

vi.mock('@/lib/shared/ipfsService', () => ({
    DEFAULT_IPFS_SERVICE: {
        pinJSON: (...args: unknown[]) => pinJSONMock(...args),
        buildURI: (cid: string) => `ipfs://${cid}`,
    },
}));

vi.mock('@/lib/shared/moduleChrome', () => ({
    deriveModuleChrome: () => ({
        accentTone: undefined,
        shellLabel: 'Test Shell',
        cardStyle: undefined,
        labelStyle: undefined,
    }),
}));

function createRegistrationProps(overrides?: Record<string, unknown>) {
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
            shellPresentation: { title: 'Test' },
            ...(overrides ?? {}),
        },
    } as any;
}

describe('AgentBadge', () => {
    it('renders with protocol indicators', () => {
        render(
            <AgentBadge services={{ mcp: 'https://a.com/mcp', a2a: 'https://a.com/a2a', rest: '' }} />,
        );
        const badge = screen.getByTestId('agent-badge');
        expect(badge).toHaveTextContent('Agent');
        expect(badge).toHaveTextContent('MCP');
        expect(badge).toHaveTextContent('A2A');
        expect(badge).not.toHaveTextContent('REST');
    });

    it('renders badge without protocols when none set', () => {
        render(<AgentBadge services={{}} />);
        const badge = screen.getByTestId('agent-badge');
        expect(badge).toHaveTextContent('Agent');
        expect(badge).not.toHaveTextContent('(');
    });
});

describe('OperatorServiceDisplay', () => {
    beforeEach(() => {
        useAgentServicesMock.mockReset();
        useDidVerificationMock.mockReset();
        useDidVerificationMock.mockReturnValue({ verified: false, isLoading: false, error: null });
    });

    it('renders nothing when operator is not an agent', () => {
        useAgentServicesMock.mockReturnValue({ data: null, isLoading: false });
        const { container } = render(
            <OperatorServiceDisplay address="0x70997970C51812dc3A010C7d01b50e0d17dc79C8" />,
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders nothing when loading', () => {
        useAgentServicesMock.mockReturnValue({ data: null, isLoading: true });
        const { container } = render(
            <OperatorServiceDisplay address="0x70997970C51812dc3A010C7d01b50e0d17dc79C8" />,
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders agent badge and endpoints when agent data present', () => {
        useAgentServicesMock.mockReturnValue({
            data: {
                isAgent: true,
                services: {
                    mcp: 'https://agent.example.com/mcp',
                    a2a: 'https://agent.example.com/a2a',
                    rest: '',
                    did: 'did:web:agent.example.com',
                    ens: 'agent.figaro.eth',
                },
                capabilities: ['route-optimization', 'live-eta'],
            },
            isLoading: false,
        });

        render(
            <OperatorServiceDisplay address="0x70997970C51812dc3A010C7d01b50e0d17dc79C8" />,
        );

        const display = screen.getByTestId('operator-service-display');
        expect(display).toBeInTheDocument();

        // Agent badge
        expect(screen.getByTestId('agent-badge')).toHaveTextContent('Agent');

        // ENS badge
        expect(screen.getByText('agent.figaro.eth')).toBeInTheDocument();

        // Endpoints
        expect(screen.getByText('https://agent.example.com/mcp')).toBeInTheDocument();
        expect(screen.getByText('https://agent.example.com/a2a')).toBeInTheDocument();

        // Capabilities
        expect(screen.getByText('route-optimization')).toBeInTheDocument();
        expect(screen.getByText('live-eta')).toBeInTheDocument();
    });

    it('renders DID verification badge for did:web identifiers', () => {
        useAgentServicesMock.mockReturnValue({
            data: {
                isAgent: true,
                services: { did: 'did:web:agent.example.com' },
                capabilities: [],
            },
            isLoading: false,
        });
        useDidVerificationMock.mockReturnValue({ verified: true, isLoading: false, error: null });

        render(
            <OperatorServiceDisplay address="0x70997970C51812dc3A010C7d01b50e0d17dc79C8" />,
        );

        const didBadge = screen.getByTestId('did-badge');
        expect(didBadge).toHaveTextContent('✓');
        expect(didBadge).toHaveTextContent('did:web');
    });
});

describe('OperatorRegistrationModule — agent service fields', () => {
    beforeEach(() => {
        useAgentServicesMock.mockReset();
        useAgentServicesMock.mockReturnValue({ data: null, isLoading: false });
        useDidVerificationMock.mockReset();
        useDidVerificationMock.mockReturnValue({ verified: false, isLoading: false, error: null });
        pinJSONMock.mockReset();
        pinJSONMock.mockResolvedValue('QmTestCid');
    });

    it('shows the toggle for agent field configuration', () => {
        render(<OperatorRegistrationModule {...createRegistrationProps()} />);
        expect(screen.getByTestId('toggle-agent-fields')).toHaveTextContent(
            'Configure as autonomous agent',
        );
    });

    it('reveals agent service fields on toggle click', async () => {
        const user = userEvent.setup();
        render(<OperatorRegistrationModule {...createRegistrationProps()} />);

        await user.click(screen.getByTestId('toggle-agent-fields'));

        const fields = screen.getByTestId('agent-service-fields');
        expect(fields).toBeInTheDocument();
        expect(screen.getByPlaceholderText('https://agent.example.com/mcp')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('https://agent.example.com/a2a')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('https://agent.example.com/v1')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('did:web:agent.example.com')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('agent.figaro.eth')).toBeInTheDocument();
    });

    it('publishes agent metadata to IPFS and submits URI on register', async () => {
        const user = userEvent.setup();
        const props = createRegistrationProps();

        render(<OperatorRegistrationModule {...props} />);

        await user.click(screen.getByTestId('toggle-agent-fields'));
        await user.type(screen.getByPlaceholderText('https://agent.example.com/mcp'), 'https://a.com/mcp');
        await user.type(screen.getByPlaceholderText('did:web:agent.example.com'), 'did:web:a.com');

        await user.click(screen.getByRole('button', { name: 'Register Operator' }));

        await waitFor(() => {
            expect(pinJSONMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    services: expect.objectContaining({
                        mcp: 'https://a.com/mcp',
                        did: 'did:web:a.com',
                    }),
                }),
            );
        });

        await waitFor(() => {
            expect(props.context.onExecuteCapability).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'register-operator-capability' }),
                { kind: 'register-operator', metadataURI: 'ipfs://QmTestCid' },
            );
        });
    });

    it('falls back to manual metadata URI when agent fields are hidden', async () => {
        const user = userEvent.setup();
        const props = createRegistrationProps();

        render(<OperatorRegistrationModule {...props} />);

        // Agent fields hidden — manual URI input visible
        const uriInput = screen.getByPlaceholderText('Metadata URI (optional)');
        await user.type(uriInput, 'ipfs://manual-cid');
        await user.click(screen.getByRole('button', { name: 'Register Operator' }));

        expect(pinJSONMock).not.toHaveBeenCalled();
        expect(props.context.onExecuteCapability).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'register-operator-capability' }),
            { kind: 'register-operator', metadataURI: 'ipfs://manual-cid' },
        );
    });
});
