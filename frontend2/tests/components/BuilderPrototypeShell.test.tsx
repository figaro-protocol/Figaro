import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BuilderPrototypeShell } from '@/components/core/BuilderPrototypeShell';
import { createRuntimeIdentityDataSourceFromDocument } from '@/lib/shared/runtimeIdentityDocument';
import localRuntimeIdentityDocument from '@/lib/shared/runtime-fixtures/local-runtime-identity.json';

const createRuntimeIdentityDataSourceFromUrlMock = vi.fn();

vi.mock('@/lib/shared/runtimeFetchSource', () => ({
    createRuntimeIdentityDataSourceFromUrl: (...args: unknown[]) => createRuntimeIdentityDataSourceFromUrlMock(...args),
}));

describe('BuilderPrototypeShell', () => {
    it('shows bundled source state by default', () => {
        render(<BuilderPrototypeShell slug="figaro-eats" />);

        expect(screen.getByLabelText('Runtime identity URL')).toBeInTheDocument();
        expect(screen.getByText(/Runtime source:/)).toBeInTheDocument();
        expect(screen.getAllByText('bundled').length).toBeGreaterThan(0);
        expect(screen.getAllByText('bundled-fixture').length).toBeGreaterThan(0);
    });

    it('renders runtime-bound subject context for figaro-eats', () => {
        render(<BuilderPrototypeShell slug="figaro-eats" />);

        expect(screen.getByText('Runtime Context')).toBeInTheDocument();
        expect(screen.getByText('Bound subjects for this assembly')).toBeInTheDocument();
        expect(screen.getByText("Bob's Pizza Palace")).toBeInTheDocument();
        expect(screen.getByText(/merchant-one-hop-delivery/i)).toBeInTheDocument();
        expect(screen.getByText('signed provenance')).toBeInTheDocument();
        expect(screen.getByText(/1 binding refs/i)).toBeInTheDocument();
        expect(screen.getByText(/1 signature refs/i)).toBeInTheDocument();
        expect(screen.getByText(/Provenance: 1 metadata refs · 1 asset refs · networks local-anvil/i)).toBeInTheDocument();
    });

    it('loads a remote runtime manifest override when provided', async () => {
        const remoteManifest = {
            ...localRuntimeIdentityDocument,
            subjects: localRuntimeIdentityDocument.subjects.map((subject) =>
                subject.subjectAddress === '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
                    ? {
                        ...subject,
                        displayName: 'Remote Bob\'s Pizza Palace',
                    }
                    : subject
            ),
        };

        createRuntimeIdentityDataSourceFromUrlMock.mockResolvedValueOnce(
            createRuntimeIdentityDataSourceFromDocument(remoteManifest, 'https://example.com/runtime-identity.json')
        );

        render(
            <BuilderPrototypeShell
                slug="figaro-eats"
                runtimeIdentityUrl="https://example.com/runtime-identity.json"
            />
        );

        expect(screen.getByText('loading')).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText('remote')).toBeInTheDocument();
        });

        expect(screen.getByText('Remote Bob\'s Pizza Palace')).toBeInTheDocument();
        expect(screen.getAllByText('https://example.com/runtime-identity.json').length).toBeGreaterThan(0);
    });

    it('lets the user apply a remote manifest from the shell control', async () => {
        const user = userEvent.setup();
        const remoteManifest = {
            ...localRuntimeIdentityDocument,
            subjects: localRuntimeIdentityDocument.subjects.map((subject) =>
                subject.subjectAddress === '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
                    ? {
                        ...subject,
                        displayName: 'Applied Remote Bob\'s Pizza Palace',
                    }
                    : subject
            ),
        };

        createRuntimeIdentityDataSourceFromUrlMock.mockResolvedValueOnce(
            createRuntimeIdentityDataSourceFromDocument(remoteManifest, 'https://example.com/applied-identity.json')
        );

        render(<BuilderPrototypeShell slug="figaro-eats" />);

        await user.type(screen.getByLabelText('Runtime identity URL'), 'https://example.com/applied-identity.json');
        await user.click(screen.getByRole('button', { name: 'Apply Identity' }));

        await waitFor(() => {
            expect(screen.getByText('remote')).toBeInTheDocument();
        });

        expect(screen.getByText('Applied Remote Bob\'s Pizza Palace')).toBeInTheDocument();
        expect(screen.getAllByText('https://example.com/applied-identity.json').length).toBeGreaterThan(0);
    });

    it('lets the user reset back to the bundled manifest', async () => {
        const user = userEvent.setup();
        const remoteManifest = {
            ...localRuntimeIdentityDocument,
            subjects: localRuntimeIdentityDocument.subjects.map((subject) =>
                subject.subjectAddress === '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
                    ? {
                        ...subject,
                        displayName: 'Resettable Remote Bob\'s Pizza Palace',
                    }
                    : subject
            ),
        };

        createRuntimeIdentityDataSourceFromUrlMock.mockResolvedValueOnce(
            createRuntimeIdentityDataSourceFromDocument(remoteManifest, 'https://example.com/resettable-identity.json')
        );

        render(<BuilderPrototypeShell slug="figaro-eats" />);

        await user.type(screen.getByLabelText('Runtime identity URL'), 'https://example.com/resettable-identity.json');
        await user.click(screen.getByRole('button', { name: 'Apply Identity' }));

        await waitFor(() => {
            expect(screen.getByText('Resettable Remote Bob\'s Pizza Palace')).toBeInTheDocument();
        });

        await user.click(screen.getByRole('button', { name: 'Reset' }));

        await waitFor(() => {
            expect(screen.getAllByText('bundled').length).toBeGreaterThan(0);
        });

        expect(screen.getByDisplayValue('')).toBeInTheDocument();
        expect(screen.getByText("Bob's Pizza Palace")).toBeInTheDocument();
    });

    it('falls back to bundled runtime data when the remote manifest fails', async () => {
        createRuntimeIdentityDataSourceFromUrlMock.mockRejectedValueOnce(new Error('404 Not Found'));

        render(
            <BuilderPrototypeShell
                slug="figaro-eats"
                runtimeIdentityUrl="https://example.com/missing-identity.json"
            />
        );

        await waitFor(() => {
            expect(screen.getByText('error')).toBeInTheDocument();
        });

        expect(screen.getByText(/Remote runtime identity document failed to load; using bundled fixture fallback./i)).toBeInTheDocument();
        expect(screen.getByText(/404 Not Found/i)).toBeInTheDocument();
        expect(screen.getByText("Bob's Pizza Palace")).toBeInTheDocument();
    });

    it('renders runtime-bound subject context for figaro-procurement', () => {
        render(<BuilderPrototypeShell slug="figaro-procurement" />);

        expect(screen.getByText('Runtime Context')).toBeInTheDocument();
        expect(screen.getByText('Runtime Validation Warnings')).toBeInTheDocument();
        expect(screen.getByText(/missing-signature-refs: local-runtime-identity.json subject 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC has provenance issue missing-signature-refs./i)).toBeInTheDocument();
        expect(screen.getByText('Acme Components Supply')).toBeInTheDocument();
        expect(screen.getByText(/bonded-procurement-supplier/i)).toBeInTheDocument();
        expect(screen.getByText(/roles: supplier/i)).toBeInTheDocument();
        expect(screen.getByText('referenced-only provenance')).toBeInTheDocument();
        expect(screen.getByText(/Consistency flags: missing-signature-refs/i)).toBeInTheDocument();
    });

    it('renders runtime-bound subject context for figaro-disclosure-review', () => {
        render(<BuilderPrototypeShell slug="figaro-disclosure-review" />);

        expect(screen.getByText('Runtime Context')).toBeInTheDocument();
        expect(screen.getByText('Runtime Validation Warnings')).toBeInTheDocument();
        expect(screen.getByText(/missing-signature-refs: local-runtime-identity.json subject 0x90F79bf6EB2c4f870365E785982E1f101E93b906 has provenance issue missing-signature-refs./i)).toBeInTheDocument();
        expect(screen.getByText('GreenLedger Review Desk')).toBeInTheDocument();
        expect(screen.getByText(/disclosure-review-operator/i)).toBeInTheDocument();
        expect(screen.getByText(/roles: reviewer/i)).toBeInTheDocument();
        expect(screen.getByText('referenced-only provenance')).toBeInTheDocument();
    });

    it('renders equipment-rental assembly without runtime fixture subjects', () => {
        render(<BuilderPrototypeShell slug="figaro-equipment-rental" />);

        // No runtime fixtures for equipment-rental — Runtime Context section should not appear
        expect(screen.queryByText('Runtime Context')).not.toBeInTheDocument();
        // But the assembly is valid and renders the workspace
        expect(screen.queryByText('Unknown assembly slug')).not.toBeInTheDocument();
    });

    it('renders freelance assembly without runtime fixture subjects', () => {
        render(<BuilderPrototypeShell slug="figaro-freelance" />);

        // No runtime fixtures for freelance — Runtime Context section should not appear
        expect(screen.queryByText('Runtime Context')).not.toBeInTheDocument();
        // But the assembly is valid and renders the workspace
        expect(screen.queryByText('Unknown assembly slug')).not.toBeInTheDocument();
    });

    it('renders the not-found state for an unknown slug', () => {
        render(<BuilderPrototypeShell slug="missing-assembly" />);

        expect(screen.getByText('Unknown assembly slug')).toBeInTheDocument();
        expect(screen.getByText(/No registered assembly matched/)).toBeInTheDocument();
    });
});