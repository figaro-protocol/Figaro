import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CapabilityRail } from '@/components/core/CapabilityRail';
import { MechanismInspectorCard } from '@/components/core/MechanismInspectorCard';
import { ProcessSummaryCard } from '@/components/core/ProcessSummaryCard';
import { RoleSwitcher } from '@/components/core/RoleSwitcher';
import type {
    CapabilityModel,
    MechanismModel,
    ProcessModel,
    RiskBoundaryModel,
    RoleContext,
} from '@/lib/semantic/models';
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

const role: RoleContext = {
    id: 'role-restaurant',
    roleKind: 'restaurant',
    displayName: 'Restaurant',
    description: 'Seller role',
    visibility: 'primary',
    scopeType: 'institution',
    scopeId: 'figaro-eats',
    mechanismIds: [],
    prototype: false,
    authoritySource: {
        truthClass: 'institution-declared',
        sourceLabel: 'test',
    },
    activeCapabilities: [],
    activeObligations: [],
};

const capability: CapabilityModel = {
    id: 'capability-accept-order',
    label: 'Accept Order',
    actionKind: 'accept-order',
    action: {
        executionType: 'prototype',
        kind: 'accept-order',
    },
    mechanismId: 'core-orders',
    scopeType: 'institution',
    scopeId: 'figaro-eats',
    preconditions: ['wallet connected'],
    source: {
        truthClass: 'protocol-enforced',
        sourceLabel: 'test',
    },
};

const mechanism: MechanismModel = {
    id: 'core-orders',
    kind: 'coordination',
    name: 'Core Orders',
    description: 'Protocol settlement primitives for bonded orders.',
    riskClass: 'contract-boundary' as never,
    moduleBindings: ['order-action'],
    contracts: ['FigaroCore'],
    touchesAssets: true,
    recognizedRoles: ['restaurant'],
    guarantees: [
        {
            id: 'guarantee-bonded',
            mechanismId: 'core-orders',
            label: 'Bonded settlement',
            description: 'Both parties post collateral.',
            guaranteeClass: 'economic',
            source: {
                truthClass: 'protocol-enforced',
                sourceLabel: 'test',
            },
        },
    ],
    attachments: [
        {
            id: 'attachment-manifest',
            mechanismId: 'core-orders',
            targetType: 'institution',
            targetId: 'figaro-eats',
            label: 'Manifest',
            attachmentKind: 'document',
            state: 'ready',
            visibleByDefault: true,
            source: {
                truthClass: 'institution-declared',
                sourceLabel: 'test',
            },
        },
    ],
};

const riskBoundary: RiskBoundaryModel = {
    id: 'risk-core-orders',
    mechanismId: 'core-orders',
    riskClass: 'contract-boundary' as never,
    touchesAssets: true,
    canCustody: false,
    canReprice: false,
    canOnlySignal: false,
    dependsOn: ['FigaroCore'],
    failureModes: ['counterparty defaults'],
};

const process: ProcessModel = {
    processId: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    rootOrderId: 'root-order-1',
    orders: [],
    relations: [],
    stateSummary: 'Active',
    capabilities: [],
    attachments: [],
    upstreamLinks: [],
    downstreamLinks: [],
};

describe('runtime skin-aware chrome', () => {
    it('renders the role switcher with shell label and accent styling', () => {
        render(
            <RoleSwitcher
                roles={[role]}
                selectedRoleKind="restaurant"
                onSelectRole={vi.fn()}
                contextLabel="Bob's Pizza Palace"
                skin={skinBundle}
            />,
        );

        expect(screen.getByText("Bob's Pizza Palace")).toBeInTheDocument();
        expect(screen.getByText('I am a…')).toHaveStyle({ color: '#1f6feb' });
        expect(screen.getByTestId('role-btn-restaurant')).toHaveStyle({
            borderColor: '#1f6feb',
            color: '#1f6feb',
        });
    });

    it('renders the capability rail with accent styling on executable actions', () => {
        render(
            <CapabilityRail
                capabilities={[capability]}
                executableCapabilityIds={new Set([capability.id])}
                executingCapabilityId={null}
                onExecute={vi.fn()}
                contextLabel="Bob's Pizza Palace"
                skin={skinBundle}
            />,
        );

        expect(screen.getByText('What You Can Do')).toHaveStyle({ color: '#1f6feb' });
        expect(screen.getByRole('button', { name: 'Accept Order' })).toHaveStyle({
            borderColor: '#1f6feb',
            color: '#1f6feb',
        });
    });

    it('renders the mechanism inspector with accent-styled risk chrome', () => {
        render(
            <MechanismInspectorCard
                mechanism={mechanism}
                riskBoundary={riskBoundary}
                skin={skinBundle}
            />,
        );

        expect(screen.getByText('Core Orders')).toBeInTheDocument();
        expect(screen.getAllByText('contract-boundary')[0]).toHaveStyle({
            borderColor: '#1f6feb',
            color: '#1f6feb',
        });
    });

    it('renders the selected process summary with accent-styled selection chrome', () => {
        render(
            <ProcessSummaryCard
                process={process}
                orderCount={3}
                selected
                onSelect={vi.fn()}
                skin={skinBundle}
            />,
        );

        const trigger = screen.getByTestId(`process-summary-${process.processId}`);
        expect(trigger.firstElementChild).toHaveAttribute('data-skin', skinBundle.skinId);
        expect(trigger.firstElementChild).toHaveStyle({ borderColor: '#1f6feb' });
        expect(screen.getByText('Active')).toHaveStyle({
            borderColor: '#1f6feb',
            color: '#1f6feb',
        });
    });
});