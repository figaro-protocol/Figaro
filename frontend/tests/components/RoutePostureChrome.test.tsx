import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import BuildersLayout from '@/app/builders/layout';
import FigaroEatsPage from '@/app/figaro-eats/page';
import HomePage from '@/app/page';
import InstitutionRuntimeLayout from '@/app/i/[slug]/layout';
import { AssemblyPageShell } from '@/app/assembly/[slug]/AssemblyPageShell';
import WorkbenchLayout from '@/app/workbench/layout';
import { Header } from '@/components/shared/Header';

vi.mock('@/components/shared/Footer', () => ({
    Footer: () => <div data-testid="footer" />,
}));

vi.mock('@/components/core/FeeComparison', () => ({
    FeeComparison: () => <div data-testid="fee-comparison" />,
}));

vi.mock('@rainbow-me/rainbowkit', () => ({
    ConnectButton: () => <button type="button">Connect Wallet</button>,
}));

vi.mock('@/components/shared/MobileNav', () => ({
    MobileNav: () => <div data-testid="mobile-nav" />,
}));

vi.mock('@/components/shared/NotificationBell', () => ({
    NotificationBell: () => <div data-testid="notification-bell" />,
}));

const listInstitutionArtifactsMock = vi.fn();
const resolveAssemblyRuntimeContextMock = vi.fn();

vi.mock('@/lib/shared/institutionAssemblyRegistry', () => ({
    getInstitutionArtifactBySlug: (slug: string) => {
        const artifacts = listInstitutionArtifactsMock();
        return artifacts.find((artifact: { assembly: { identity: { slug: string } } }) => artifact.assembly.identity.slug === slug) ?? undefined;
    },
    listInstitutionArtifacts: () => listInstitutionArtifactsMock(),
}));

vi.mock('@/lib/shared/runtimeResolution', () => ({
    resolveAssemblyRuntimeContext: (...args: unknown[]) => resolveAssemblyRuntimeContextMock(...args),
}));

vi.mock('@/lib/shared/runtimeIdentityRegistry', () => ({
    FIXTURE_RUNTIME_IDENTITY_SOURCE: {},
}));

vi.mock('@/components/core/AssemblyWorkspace', () => ({
    AssemblyWorkspace: () => <div data-testid="assembly-workspace" />,
}));

describe('phase 7 route posture chrome', () => {
    it('renders the shared header', () => {
        render(<Header />);

        expect(screen.getByText('Figaro Protocol')).toBeInTheDocument();
    });

    it('frames builder routes through the shared builders layout', () => {
        render(
            <BuildersLayout>
                <div data-testid="builder-child">Builder child</div>
            </BuildersLayout>,
        );

        expect(screen.getByTestId('builder-child')).toBeInTheDocument();
        expect(screen.getByTestId('footer')).toBeInTheDocument();
    });

    it('frames protocol routes through the shared workbench layout', () => {
        render(
            <WorkbenchLayout>
                <div data-testid="protocol-child">Protocol child</div>
            </WorkbenchLayout>,
        );

        expect(screen.getByTestId('protocol-child')).toBeInTheDocument();
        expect(screen.getByTestId('footer')).toBeInTheDocument();
    });

    it('frames institution routes through the shared institution layout', () => {
        listInstitutionArtifactsMock.mockReturnValue([
            {
                assembly: {
                    identity: {
                        slug: 'figaro-eats',
                        name: 'Figaro Eats',
                    },
                },
            },
        ]);

        render(
            <InstitutionRuntimeLayout params={{ slug: 'figaro-eats' }}>
                <div data-testid="institution-child">Institution child</div>
            </InstitutionRuntimeLayout>,
        );

        expect(screen.getByTestId('institution-child')).toBeInTheDocument();
        expect(screen.getByTestId('footer')).toBeInTheDocument();
    });

    it('marks the figaro-eats route as a reference archetype', () => {
        render(<FigaroEatsPage />);

        expect(screen.getByTestId('reference-archetype-runtime-link')).toHaveAttribute('href', '/assembly/figaro-eats');
    });

    it('marks the landing route as an explanatory surface', () => {
        render(<HomePage />);

    });

    it('renders the institution workspace for live institution routes', () => {
        listInstitutionArtifactsMock.mockReturnValue([]);
        resolveAssemblyRuntimeContextMock.mockReturnValue({
            artifact: {
                assembly: {
                    identity: {
                        name: 'Figaro Eats',
                    },
                },
            },
        });

        render(<AssemblyPageShell slug="figaro-eats" />);

        expect(screen.getByTestId('assembly-workspace')).toBeInTheDocument();
    });

    it('keeps the institution fallback links when the slug is unknown', () => {
        listInstitutionArtifactsMock.mockReturnValue([
            {
                assembly: {
                    identity: {
                        slug: 'figaro-eats',
                        name: 'Figaro Eats',
                    },
                },
            },
        ]);
        resolveAssemblyRuntimeContextMock.mockReturnValue(null);

        render(<AssemblyPageShell slug="missing-institution" />);

        expect(screen.getByText('No assembly matched missing-institution.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Figaro Eats' })).toHaveAttribute('href', '/assembly/figaro-eats');
    });
});