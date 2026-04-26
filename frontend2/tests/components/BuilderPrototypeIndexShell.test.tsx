import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BuilderPrototypeIndexShell } from '@/components/core/BuilderPrototypeIndexShell';
import { createRuntimeIdentityDataSourceFromDocument } from '@/lib/shared/runtimeIdentityDocument';
import localRuntimeIdentityDocument from '@/lib/shared/runtime-fixtures/local-runtime-identity.json';

const createRuntimeIdentityDataSourceFromUrlMock = vi.fn();

vi.mock('@/lib/shared/runtimeFetchSource', () => ({
    createRuntimeIdentityDataSourceFromUrl: (...args: unknown[]) => createRuntimeIdentityDataSourceFromUrlMock(...args),
}));

describe('BuilderPrototypeIndexShell', () => {
    beforeEach(() => {
        createRuntimeIdentityDataSourceFromUrlMock.mockReset();
    });

    it('shows bundled runtime previews by default', () => {
        render(<BuilderPrototypeIndexShell />);

        expect(screen.getByLabelText('Runtime identity URL')).toBeInTheDocument();
        expect(screen.getByText('Runtime Preview Source')).toBeInTheDocument();
        expect(screen.getByText("Bob's Pizza Palace")).toBeInTheDocument();
        expect(screen.getAllByText('bundled').length).toBeGreaterThan(0);
        expect(screen.getAllByText('bundled-fixture').length).toBeGreaterThan(0);
        expect(screen.getAllByRole('link', { name: 'Open Prototype' })[0]).toHaveAttribute('href', '/builders/prototype/figaro-eats');
    });

    it('applies a remote manifest to previews and propagated prototype links', async () => {
        const user = userEvent.setup();
        const remoteManifest = {
            ...localRuntimeIdentityDocument,
            subjects: localRuntimeIdentityDocument.subjects.map((subject) =>
                subject.subjectAddress === '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
                    ? {
                        ...subject,
                        displayName: 'Index Remote Bob\'s Pizza Palace',
                    }
                    : subject
            ),
        };

        createRuntimeIdentityDataSourceFromUrlMock.mockResolvedValueOnce(
            createRuntimeIdentityDataSourceFromDocument(remoteManifest, 'https://example.com/index.manifest.json')
        );

        render(<BuilderPrototypeIndexShell />);

        await user.type(screen.getByLabelText('Runtime identity URL'), 'https://example.com/index.manifest.json');
        await user.click(screen.getByRole('button', { name: 'Apply Identity' }));

        await waitFor(() => {
            expect(screen.getByText('remote')).toBeInTheDocument();
        });

        expect(screen.getByText('Index Remote Bob\'s Pizza Palace')).toBeInTheDocument();
        expect(screen.getAllByText('https://example.com/index.manifest.json').length).toBeGreaterThan(0);
        expect(screen.getAllByRole('link', { name: 'Open Prototype' })[0]).toHaveAttribute(
            'href',
            '/builders/prototype/figaro-eats?identity=https%3A%2F%2Fexample.com%2Findex.manifest.json'
        );
    });

    it('resets back to bundled previews and plain prototype links', async () => {
        const user = userEvent.setup();
        const remoteManifest = {
            ...localRuntimeIdentityDocument,
            subjects: localRuntimeIdentityDocument.subjects.map((subject) =>
                subject.subjectAddress === '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
                    ? {
                        ...subject,
                        displayName: 'Resettable Index Remote Bob\'s Pizza Palace',
                    }
                    : subject
            ),
        };

        createRuntimeIdentityDataSourceFromUrlMock.mockResolvedValueOnce(
            createRuntimeIdentityDataSourceFromDocument(remoteManifest, 'https://example.com/index-reset.manifest.json')
        );

        render(<BuilderPrototypeIndexShell />);

        await user.type(screen.getByLabelText('Runtime identity URL'), 'https://example.com/index-reset.manifest.json');
        await user.click(screen.getByRole('button', { name: 'Apply Identity' }));

        await waitFor(() => {
            expect(screen.getByText('Resettable Index Remote Bob\'s Pizza Palace')).toBeInTheDocument();
        });

        await user.click(screen.getByRole('button', { name: 'Reset' }));

        await waitFor(() => {
            expect(screen.getAllByText('bundled').length).toBeGreaterThan(0);
        });

        expect(screen.getByDisplayValue('')).toBeInTheDocument();
        expect(screen.getByText("Bob's Pizza Palace")).toBeInTheDocument();
        expect(screen.getAllByRole('link', { name: 'Open Prototype' })[0]).toHaveAttribute('href', '/builders/prototype/figaro-eats');
    });
});