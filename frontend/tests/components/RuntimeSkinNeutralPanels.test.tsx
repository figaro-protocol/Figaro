import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuctionActionModule } from '@/components/modules/AuctionActionModule';
import { ProcessGraphModule } from '@/components/modules/ProcessGraphModule';
import type { ResolvedInstitutionSkinBundle } from '@/lib/shared/runtimeResolution';

const useDutchAuctionMock = vi.fn();
const institutionProcessWorkspaceMock = vi.fn();

vi.mock('@/lib/mechanisms/useDutchAuction', async () => {
    const actual = await vi.importActual<typeof import('@/lib/mechanisms/useDutchAuction')>('@/lib/mechanisms/useDutchAuction');
    return {
        ...actual,
        useDutchAuction: (...args: unknown[]) => useDutchAuctionMock(...args),
    };
});

vi.mock('@/components/core/InstitutionProcessWorkspace', () => ({
    InstitutionProcessWorkspace: (props: unknown) => {
        institutionProcessWorkspaceMock(props);
        return <div data-testid="process-workspace-body">Process workspace body</div>;
    },
}));

const skinBundle: ResolvedInstitutionSkinBundle = {
    sourceKind: 'runtime-bound',
    skinId: 'binding-runtime-neutral-local-anvil',
    subjectAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    bindingId: 'binding:runtime-neutral:local-anvil',
    branding: {
        branding: {
            displayName: 'Runtime Neutral',
            accentColor: '#1f6feb',
            themeClass: 'runtime-shell-neutral',
        },
        logoURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-logo.png',
        heroImageURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-hero.png',
        cssURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-theme.css',
        assets: {},
    },
};

function createAuctionProps(overrides?: Record<string, unknown>) {
    const defaultMechanisms = [
        {
            kind: 'auction',
            id: 'mock-auction-mechanism',
            label: 'Mock Auction',
            config: {},
            name: 'Mock Auction',
            description: 'Mock auction mechanism',
            riskClass: 'low-risk-coordinator' as 'low-risk-coordinator',
            moduleBindings: [],
            capabilities: [],
            state: 'active',
            visible: true,
            enabled: true,
            contracts: [],
            touchesAssets: false,
            recognizedRoles: [],
            guarantees: [],
            attachments: [],
        },
    ];
    const binding = {
        id: 'mock-binding',
        name: 'Mock Binding',
        moduleId: 'mock-module',
        componentKind: 'mock-kind',
        semanticInput: 'mock-input',
        slot: 'mock-slot',
        priority: 0,
    };
    // Add all required ModuleRenderContext properties
    const mockAssembly = {
        identity: { id: 'mock-id', name: 'Mock Institution', slug: 'mock', description: 'desc', networkTargets: ['mock-network'], version: '1.0.0' },
        contracts: [],
        mechanisms: [],
        roles: [],
        policies: [],
        modules: [],
        capabilities: [],
        schema: {},
        publication: {},
        views: [],
        capabilityPresentation: [],
        visibilityDefaults: {
            showGraphByDefault: true,
            showAdvancedMechanisms: false,
            showRiskBoundaries: false,
            showGuarantees: false,
            showGHGDisclosure: false,
            showOperatorRegistry: false,
            showEconomicBreakdowns: false,
            showBuilderMode: false,
            showAuditMode: false,
        },
        builderMetadata: {
            assemblyClass: 'mock-class',
            compositionLevel: 1 as 1,
            requiresCustomModules: false,
        },
    };
    return {
        moduleId: 'auction-actions',
        binding,
        context: {
            assembly: mockAssembly,
            services: {
                identity: {
                    getFallbackSource: () => ({
                        id: 'mock-source',
                        url: 'http://mock',
                        data: {},
                        listSubjectRecords: () => [],
                        listInstitutionBindings: () => [],
                        listSellerCatalogueMetadata: () => [],
                    }),
                    loadSourceFromUrl: async () => ({
                        id: 'mock-source',
                        url: 'http://mock',
                        data: {},
                        listSubjectRecords: () => [],
                        listInstitutionBindings: () => [],
                        listSellerCatalogueMetadata: () => [],
                    }),
                    resolveAssemblyContext: () => undefined,
                },
                catalogue: {
                    fetchMerchantCatalogue: async () => null,
                    invalidateMerchantCatalogue: () => undefined,
                    publishMerchantCatalogue: async () => ({ success: true, cid: 'mock-cid', uri: 'ipfs://mock-cid' }),
                    publishDriverOffering: async () => ({ success: true, cid: 'mock-cid', uri: 'ipfs://mock-cid' }),
                },
                discovery: {
                    isRegistryConfigured: () => true,
                    listFallbackRestaurants: () => ({ restaurants: [], source: { ipfs: 0, mock: 1 } }),
                    listRestaurants: async () => ({ restaurants: [], source: { ipfs: 0, mock: 1 } }),
                },
                evidenceTransport: {
                    pinJSON: vi.fn(),
                    publishJSON: vi.fn(),
                    uploadFile: vi.fn(),
                    buildURI: vi.fn(),
                    fetchJSON: vi.fn(),
                    fetchFile: vi.fn(),
                    buildPath: vi.fn(),
                    buildGatewayUrl: vi.fn(),
                    resolveFetchUrl: vi.fn(),
                },
                coordinationMessaging: {
                    getChannel: vi.fn(),
                    sendHandoffKey: vi.fn(),
                    subscribeHandoffKey: vi.fn(),
                    sendEcdhPubkey: vi.fn(),
                    subscribeEcdhPubkey: vi.fn(),
                    sendManifest: vi.fn(),
                    subscribeManifest: vi.fn(),
                    sendHandoffIntent: vi.fn(),
                    subscribeHandoffIntent: vi.fn(),
                    sendHandoffArtifact: vi.fn(),
                    subscribeHandoffArtifact: vi.fn(),
                    sendWrappedKey: vi.fn(),
                    subscribeWrappedKey: vi.fn(),
                    sendCommitmentPayload: vi.fn(),
                    subscribeCommitmentPayload: vi.fn(),
                    subscribeAnyCommitmentPayload: vi.fn(),
                },
                handoffPersistence: {
                    saveHandoffKey: vi.fn(),
                    getHandoffKey: vi.fn(),
                    removeHandoffKey: vi.fn(),
                    savePendingHandoffIntent: vi.fn(),
                    getPendingHandoffIntent: vi.fn(),
                    removePendingHandoffIntent: vi.fn(),
                    saveManifest: vi.fn(),
                    getManifest: vi.fn(),
                    removeManifest: vi.fn(),
                    saveHandoffArtifact: vi.fn(),
                    getHandoffArtifact: vi.fn(),
                    removeHandoffArtifact: vi.fn(),
                    persistHandoffArtifactsForOrder: vi.fn(),
                    recoverHandoffKeys: vi.fn(),
                    purgeHandoffArtifacts: vi.fn(),
                    schedulePurge: vi.fn(),
                    sweepDuePurges: vi.fn(),
                },
            },
            runtimeContext: undefined,
            selectedRoleKind: 'mock-role',
            selectedBoundSubject: undefined,
            shellPresentation: {
                sourceKind: 'runtime-bound' as const,
                label: 'Mock Shell',
                accentColor: '#1f6feb',
                themeClass: 'mock-theme',
                title: 'Mock Shell Title',
                subtitle: 'Mock Shell Subtitle',
            },
            skinBundle,
            processModel: null,
            selectedOrder: {
                orderId: '0xabc123',
                processId: 'process-1',
                buyer: '0x000000000000000000000000000000000000b0b0' as `0x${string}`,
                seller: '0x000000000000000000000000000000000000c0c0' as `0x${string}`,
                state: 'Active',
                currency: '0x0000000000000000000000000000000000000001' as `0x${string}`,
                payment: 2000000000000000n,
                cumulativeValue: 2000000000000000n,
                createdAt: 0,
                updatedAt: 0,
                capabilities: [
                    {
                        id: 'cap-claim',
                        label: 'Claim Job',
                        action: {
                            kind: 'claim-auction',
                            executionType: 'prototype' as 'prototype',
                            auctionId: '0xabc123',
                        },
                        actionKind: 'claim-auction',
                        mechanismId: 'mock-auction-mechanism',
                        scopeType: 'order' as 'order',
                        scopeId: '0xabc123',
                        enabled: true,
                        visible: true,
                        preconditions: [],
                        source: {
                            truthClass: 'ui-local' as 'ui-local',
                            sourceLabel: 'mock',
                        },
                    },
                ],
                parentOrderIds: [],
                attachments: [],
            },
            capabilities: [],
            executableCapabilityIds: new Set(['cap-claim']),
            executingCapabilityId: null,
            mechanisms: defaultMechanisms,
            riskBoundaries: {},
            roles: [],
            onSelectRole: () => { },
            onExecuteCapability: () => { },
            onSelectOrder: () => { },
            onComposeSubOrder: () => { },
            ...(overrides || {}),
        },
    };
}

function createProcessProps(overrides?: Record<string, unknown>) {
    const binding = {
        id: 'mock-binding',
        name: 'Mock Binding',
        moduleId: 'mock-module',
        componentKind: 'mock-kind',
        semanticInput: 'mock-input',
        slot: 'mock-slot',
        priority: 0,
    };
    // Add all required ModuleRenderContext properties
    const mockAssembly = {
        identity: { id: 'mock-id', name: 'Mock Institution', slug: 'mock', description: 'desc', networkTargets: ['mock-network'], version: '1.0.0' },
        contracts: [],
        mechanisms: [],
        roles: [],
        policies: [],
        modules: [],
        capabilities: [],
        schema: {},
        publication: {},
        views: [],
        capabilityPresentation: [],
        visibilityDefaults: {
            showGraphByDefault: true,
            showAdvancedMechanisms: false,
            showRiskBoundaries: false,
            showGuarantees: false,
            showGHGDisclosure: false,
            showOperatorRegistry: false,
            showEconomicBreakdowns: false,
            showBuilderMode: false,
            showAuditMode: false,
        },
        builderMetadata: {
            assemblyClass: 'mock-class',
            compositionLevel: 1 as 1,
            requiresCustomModules: false,
        },
    };
    return {
        moduleId: 'process-graph',
        binding,
        context: {
            assembly: mockAssembly,
            services: {
                identity: {
                    getFallbackSource: () => ({
                        id: 'mock-source',
                        url: 'http://mock',
                        data: {},
                        listSubjectRecords: () => [],
                        listInstitutionBindings: () => [],
                        listSellerCatalogueMetadata: () => [],
                    }),
                    loadSourceFromUrl: async () => ({
                        id: 'mock-source',
                        url: 'http://mock',
                        data: {},
                        listSubjectRecords: () => [],
                        listInstitutionBindings: () => [],
                        listSellerCatalogueMetadata: () => [],
                    }),
                    resolveAssemblyContext: () => undefined,
                },
                catalogue: {
                    fetchMerchantCatalogue: vi.fn(),
                    invalidateMerchantCatalogue: vi.fn(),
                    publishMerchantCatalogue: vi.fn(),
                    publishDriverOffering: vi.fn(),
                },
                discovery: {
                    isRegistryConfigured: () => true,
                    listFallbackRestaurants: () => ({ restaurants: [], source: { ipfs: 0, mock: 1 } }),
                    listRestaurants: async () => ({ restaurants: [], source: { ipfs: 0, mock: 1 } }),
                },
                evidenceTransport: {
                    pinJSON: vi.fn(),
                    publishJSON: vi.fn(),
                    uploadFile: vi.fn(),
                    buildURI: vi.fn(),
                    fetchJSON: vi.fn(),
                    fetchFile: vi.fn(),
                    buildPath: vi.fn(),
                    buildGatewayUrl: vi.fn(),
                    resolveFetchUrl: vi.fn(),
                },
                coordinationMessaging: {
                    getChannel: vi.fn(),
                    sendHandoffKey: vi.fn(),
                    subscribeHandoffKey: vi.fn(),
                    sendEcdhPubkey: vi.fn(),
                    subscribeEcdhPubkey: vi.fn(),
                    sendManifest: vi.fn(),
                    subscribeManifest: vi.fn(),
                    sendHandoffIntent: vi.fn(),
                    subscribeHandoffIntent: vi.fn(),
                    sendHandoffArtifact: vi.fn(),
                    subscribeHandoffArtifact: vi.fn(),
                    sendWrappedKey: vi.fn(),
                    subscribeWrappedKey: vi.fn(),
                    sendCommitmentPayload: vi.fn(),
                    subscribeCommitmentPayload: vi.fn(),
                    subscribeAnyCommitmentPayload: vi.fn(),
                },
                handoffPersistence: {
                    saveHandoffKey: vi.fn(),
                    getHandoffKey: vi.fn(),
                    removeHandoffKey: vi.fn(),
                    savePendingHandoffIntent: vi.fn(),
                    getPendingHandoffIntent: vi.fn(),
                    removePendingHandoffIntent: vi.fn(),
                    saveManifest: vi.fn(),
                    getManifest: vi.fn(),
                    removeManifest: vi.fn(),
                    saveHandoffArtifact: vi.fn(),
                    getHandoffArtifact: vi.fn(),
                    removeHandoffArtifact: vi.fn(),
                    persistHandoffArtifactsForOrder: vi.fn(),
                    recoverHandoffKeys: vi.fn(),
                    purgeHandoffArtifacts: vi.fn(),
                    schedulePurge: vi.fn(),
                    sweepDuePurges: vi.fn(),
                },
            },
            runtimeContext: undefined,
            selectedRoleKind: 'mock-role',
            selectedBoundSubject: undefined,
            shellPresentation: {
                sourceKind: 'runtime-bound' as const,
                label: 'Mock Shell',
                accentColor: '#1f6feb',
                themeClass: 'mock-theme',
                title: 'Mock Shell Title',
                subtitle: 'Mock Shell Subtitle',
            },
            skinBundle,
            processModel: {
                processId: 'process-1',
                rootOrderId: 'root-1',
                orders: [],
                relations: [],
                stateSummary: 'Active',
                capabilities: [],
                createdAt: 0,
                updatedAt: 0,
                attachments: [],
                upstreamLinks: [],
                downstreamLinks: [],
            },
            selectedOrder: null,
            capabilities: [],
            executableCapabilityIds: new Set<string>(),
            executingCapabilityId: null,
            mechanisms: [],
            riskBoundaries: {},
            roles: [],
            onSelectRole: () => { },
            onExecuteCapability: () => { },
            onSelectOrder: () => { },
            onComposeSubOrder: () => { },
            ...(overrides || {}),
        },
    };
}

describe('runtime skin-aware neutral panels', () => {
    beforeEach(() => {
        useDutchAuctionMock.mockReset();
        institutionProcessWorkspaceMock.mockReset();
        useDutchAuctionMock.mockReturnValue({
            connected: true,
            started: true,
            currentPrice: 1800000000000000n,
            assignedDriver: undefined,
            isClaimed: false,
            clearingPrice: undefined,
            isPending: false,
            isConfirming: false,
        });
    });

    it('renders auction actions with shell chrome, accent price, and executable claim styling', () => {
        const onExecuteCapability = vi.fn();
        // Build the capability object once and use its ID everywhere
        const claimCapability = {
            id: 'cap-claim',
            label: 'Claim Job',
            action: {
                kind: 'claim-auction',
                executionType: 'transaction',
                auctionId: '0xabc123',
            },
            actionKind: 'claim-auction',
            mechanismId: 'mock-auction-mechanism',
            scopeType: 'order',
            scopeId: '0xabc123',
            enabled: true,
            visible: true,
            preconditions: [],
            source: {
                truthClass: 'ui-local',
                sourceLabel: 'mock',
            },
        };
        useDutchAuctionMock.mockReturnValue({
            connected: true,
            started: true,
            currentPrice: 1800000000000000n,
            assignedDriver: undefined,
            isClaimed: false,
            clearingPrice: undefined,
            isPending: false,
            isConfirming: false,
        });
        render(
            <AuctionActionModule
                {...createAuctionProps({
                    onExecuteCapability,
                    executingCapabilityId: null,
                    executableCapabilityIds: new Set([claimCapability.id]),
                    selectedOrder: {
                        id: '0xabc123',
                        orderId: '0xabc123',
                        processId: 'process-1',
                        buyer: '0x000000000000000000000000000000000000b0b0',
                        seller: '0x000000000000000000000000000000000000c0c0',
                        state: 'Active',
                        currency: '0x0000000000000000000000000000000000000001',
                        payment: 2000000000000000n,
                        cumulativeValue: 2000000000000000n,
                        createdAt: 0,
                        updatedAt: 0,
                        capabilities: [claimCapability],
                        parentOrderIds: [],
                        attachments: [],
                    },
                })}
            />
        );
        expect(screen.getByTestId('auction-action-module')).toBeInTheDocument();
        expect(screen.getByText('Mock Shell Title')).toBeInTheDocument();
        expect(screen.getByText('0.0018')).toBeInTheDocument();
        const claimButton = screen.getByTestId('btn-claim-job-0xabc123');
        expect(claimButton).toBeInTheDocument();
        fireEvent.click(claimButton);
        expect(onExecuteCapability).toHaveBeenCalledWith(expect.objectContaining({ id: 'cap-claim' }));
    });

    it('wraps the delegated process workspace in shell chrome while forwarding runtime props', () => {
        const executableCapabilityIds = new Set(['cap-1']);
        const onExecuteCapability = vi.fn();
        const onSelectOrder = vi.fn();
        const processModel = {
            processId: 'process-123',
            orders: [{ orderId: 'order-1' }],
        };
        render(
            <ProcessGraphModule
                {...createProcessProps({
                    processModel,
                    executableCapabilityIds,
                    onExecuteCapability,
                    onSelectOrder,
                })}
            />,
        );
        expect(screen.getByTestId('process-graph-module')).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(screen.getByText('Mock Shell Title')).toHaveStyle({ color: '#1f6feb' });
        expect(screen.getByTestId('process-workspace-body')).toBeInTheDocument();
        expect(institutionProcessWorkspaceMock).toHaveBeenCalledWith(expect.objectContaining({
            process: processModel,
            executableCapabilityIds,
            executingCapabilityId: null,
            onExecuteCapability,
            onSelectOrder,
        }));
    });

    it('keeps the empty process-graph fallback inside the skinned shell', () => {
        render(<ProcessGraphModule {...createProcessProps({ processModel: null })} />);
        expect(screen.getByTestId('process-graph-module')).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(screen.getByText('Mock Shell Title')).toHaveStyle({ color: '#1f6feb' });
        expect(screen.getByText('Select a process from the sidebar to view its graph.')).toBeInTheDocument();
    });
});