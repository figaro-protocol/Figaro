import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogueBuilder } from '@/components/operators/CatalogueBuilder';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const publishJSONMock = vi.fn();
const useReadContractMock = vi.fn();

vi.mock('wagmi', () => ({
    useReadContract: (...args: unknown[]) => useReadContractMock(...args),
}));

vi.mock('@/lib/shared/ipfsService', () => ({
    DEFAULT_IPFS_SERVICE: {
        publishJSON: (...args: unknown[]) => publishJSONMock(...args),
        resolveFetchUrl: (uri: string) => uri,
    },
}));

// clipboard mock
Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

const VALID_TOKEN = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CatalogueBuilder', () => {
    beforeEach(() => {
        publishJSONMock.mockReset();
        useReadContractMock.mockReturnValue({ data: 'USDC', isLoading: false });
    });

    it('renders the catalogue name input', () => {
        render(<CatalogueBuilder />);

        expect(screen.getByPlaceholderText('e.g. Tasty Burger Menu')).toBeInTheDocument();
    });

    it('renders the denomination token input', () => {
        render(<CatalogueBuilder />);

        expect(screen.getByPlaceholderText('0x… token address')).toBeInTheDocument();
    });

    it('renders an initial empty item row', () => {
        render(<CatalogueBuilder />);

        expect(screen.getByPlaceholderText('e.g. Classic Burger')).toBeInTheDocument();
    });

    it('publish button is disabled when form is incomplete', () => {
        render(<CatalogueBuilder />);

        const btn = screen.getByRole('button', { name: /publish catalogue/i });
        expect(btn).toBeDisabled();
    });

    it('publish button is disabled when catalogue name is missing', async () => {
        render(<CatalogueBuilder />);

        await userEvent.type(screen.getByPlaceholderText('e.g. Classic Burger'), 'Pizza');
        await userEvent.type(screen.getByPlaceholderText('0x… token address'), VALID_TOKEN);

        const btn = screen.getByRole('button', { name: /publish catalogue/i });
        expect(btn).toBeDisabled();
    });

    it('publish button is disabled when no items have a name', async () => {
        render(<CatalogueBuilder />);

        await userEvent.type(screen.getByPlaceholderText('e.g. Tasty Burger Menu'), 'My Menu');
        await userEvent.type(screen.getByPlaceholderText('0x… token address'), VALID_TOKEN);

        const btn = screen.getByRole('button', { name: /publish catalogue/i });
        expect(btn).toBeDisabled();
    });

    it('publish button is disabled when denomination token is invalid', async () => {
        render(<CatalogueBuilder />);

        await userEvent.type(screen.getByPlaceholderText('e.g. Tasty Burger Menu'), 'My Menu');
        await userEvent.type(screen.getByPlaceholderText('e.g. Classic Burger'), 'Pizza');
        await userEvent.type(screen.getByPlaceholderText('0x… token address'), '0xbad');

        const btn = screen.getByRole('button', { name: /publish catalogue/i });
        expect(btn).toBeDisabled();
    });

    it('enables publish when name, item, and valid token address are provided', async () => {
        render(<CatalogueBuilder />);

        await userEvent.type(screen.getByPlaceholderText('e.g. Tasty Burger Menu'), 'My Menu');
        await userEvent.type(screen.getByPlaceholderText('e.g. Classic Burger'), 'Pizza');
        await userEvent.type(screen.getByPlaceholderText('0x… token address'), VALID_TOKEN);

        const btn = screen.getByRole('button', { name: /publish catalogue/i });
        expect(btn).not.toBeDisabled();
    });

    it('adds a new item row when "Add item" is clicked', async () => {
        render(<CatalogueBuilder />);

        const namePlaceholders = screen.getAllByPlaceholderText('e.g. Classic Burger');
        expect(namePlaceholders).toHaveLength(1);

        await userEvent.click(screen.getByRole('button', { name: /add item/i }));

        expect(screen.getAllByPlaceholderText('e.g. Classic Burger')).toHaveLength(2);
    });

    it('removes an item row when the remove button is clicked', async () => {
        render(<CatalogueBuilder />);

        await userEvent.click(screen.getByRole('button', { name: /add item/i }));
        expect(screen.getAllByPlaceholderText('e.g. Classic Burger')).toHaveLength(2);

        const removeButtons = screen.getAllByRole('button', { name: /remove item/i });
        await userEvent.click(removeButtons[0]);

        expect(screen.getAllByPlaceholderText('e.g. Classic Burger')).toHaveLength(1);
    });

    it('calls publishJSON with the correct catalogue document on submit', async () => {
        publishJSONMock.mockResolvedValue({ uri: 'ipfs://QmCat', cid: 'QmCat', gatewayUrl: '' });

        render(<CatalogueBuilder />);

        await userEvent.type(screen.getByPlaceholderText('e.g. Tasty Burger Menu'), 'Lunch Menu');
        await userEvent.type(screen.getByPlaceholderText('e.g. Classic Burger'), 'Margherita');
        await userEvent.type(screen.getByPlaceholderText('e.g. 12.00'), '9.50');
        await userEvent.type(screen.getByPlaceholderText('0x… token address'), VALID_TOKEN);

        await userEvent.click(screen.getByRole('button', { name: /publish catalogue/i }));

        await waitFor(() => {
            expect(publishJSONMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    version: '1',
                    name: 'Lunch Menu',
                    denominatedIn: VALID_TOKEN,
                    items: expect.arrayContaining([
                        expect.objectContaining({ name: 'Margherita', price: '9.50' }),
                    ]),
                }),
            );
        });
    });

    it('shows the published panel after successful publish', async () => {
        publishJSONMock.mockResolvedValue({ uri: 'ipfs://QmCat', cid: 'QmCat', gatewayUrl: '' });

        render(<CatalogueBuilder />);

        await userEvent.type(screen.getByPlaceholderText('e.g. Tasty Burger Menu'), 'Lunch Menu');
        await userEvent.type(screen.getByPlaceholderText('e.g. Classic Burger'), 'Margherita');
        await userEvent.type(screen.getByPlaceholderText('0x… token address'), VALID_TOKEN);

        await userEvent.click(screen.getByRole('button', { name: /publish catalogue/i }));

        await waitFor(() => {
            expect(screen.getByText('Catalogue published.')).toBeInTheDocument();
        });

        expect(screen.getByText('ipfs://QmCat')).toBeInTheDocument();
    });

    it('published panel contains a link to update operator profile with catalogue URI', async () => {
        publishJSONMock.mockResolvedValue({ uri: 'ipfs://QmCat', cid: 'QmCat', gatewayUrl: '' });

        render(<CatalogueBuilder />);

        await userEvent.type(screen.getByPlaceholderText('e.g. Tasty Burger Menu'), 'Lunch Menu');
        await userEvent.type(screen.getByPlaceholderText('e.g. Classic Burger'), 'Margherita');
        await userEvent.type(screen.getByPlaceholderText('0x… token address'), VALID_TOKEN);

        await userEvent.click(screen.getByRole('button', { name: /publish catalogue/i }));

        await waitFor(() => {
            const link = screen.getByRole('link', { name: /update operator profile/i });
            expect(link).toBeInTheDocument();
            expect(link).toHaveAttribute(
                'href',
                `/operators?catalogueURI=${encodeURIComponent('ipfs://QmCat')}`,
            );
        });
    });

    it('shows an error status when publishJSON fails', async () => {
        publishJSONMock.mockRejectedValue(new Error('IPFS timeout'));

        render(<CatalogueBuilder />);

        await userEvent.type(screen.getByPlaceholderText('e.g. Tasty Burger Menu'), 'Lunch Menu');
        await userEvent.type(screen.getByPlaceholderText('e.g. Classic Burger'), 'Margherita');
        await userEvent.type(screen.getByPlaceholderText('0x… token address'), VALID_TOKEN);

        await userEvent.click(screen.getByRole('button', { name: /publish catalogue/i }));

        await waitFor(() => {
            expect(screen.getByText('IPFS timeout')).toBeInTheDocument();
        });
    });

    it('resets to empty form when "Build another" is clicked after publish', async () => {
        publishJSONMock.mockResolvedValue({ uri: 'ipfs://QmCat', cid: 'QmCat', gatewayUrl: '' });

        render(<CatalogueBuilder />);

        await userEvent.type(screen.getByPlaceholderText('e.g. Tasty Burger Menu'), 'Lunch Menu');
        await userEvent.type(screen.getByPlaceholderText('e.g. Classic Burger'), 'Margherita');
        await userEvent.type(screen.getByPlaceholderText('0x… token address'), VALID_TOKEN);
        await userEvent.click(screen.getByRole('button', { name: /publish catalogue/i }));

        await waitFor(() => screen.getByText('Catalogue published.'));

        await userEvent.click(screen.getByRole('button', { name: /build another/i }));

        expect(screen.getByPlaceholderText('e.g. Tasty Burger Menu')).toHaveValue('');
    });

    it('copies URI to clipboard when Copy button is clicked', async () => {
        publishJSONMock.mockResolvedValue({ uri: 'ipfs://QmCat', cid: 'QmCat', gatewayUrl: '' });

        render(<CatalogueBuilder />);

        await userEvent.type(screen.getByPlaceholderText('e.g. Tasty Burger Menu'), 'Lunch Menu');
        await userEvent.type(screen.getByPlaceholderText('e.g. Classic Burger'), 'Margherita');
        await userEvent.type(screen.getByPlaceholderText('0x… token address'), VALID_TOKEN);
        await userEvent.click(screen.getByRole('button', { name: /publish catalogue/i }));

        await waitFor(() => screen.getByRole('button', { name: /copy/i }));

        await userEvent.click(screen.getByRole('button', { name: /copy/i }));

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ipfs://QmCat');
    });

    it('excludes items with empty names from the published document', async () => {
        publishJSONMock.mockResolvedValue({ uri: 'ipfs://QmCat', cid: 'QmCat', gatewayUrl: '' });

        render(<CatalogueBuilder />);

        // Fill the initial item, catalogue name, and token so canPublish becomes true
        await userEvent.type(screen.getByPlaceholderText('e.g. Classic Burger'), 'Pizza');
        await userEvent.type(screen.getByPlaceholderText('e.g. Tasty Burger Menu'), 'My Menu');
        await userEvent.type(screen.getByPlaceholderText('0x… token address'), VALID_TOKEN);

        // Add a second (empty) item row via fireEvent to avoid userEvent focus side-effects
        fireEvent.click(screen.getByRole('button', { name: /add item/i }));

        // Submit the form directly — avoids any button-click event complexity in jsdom
        fireEvent.submit(screen.getByRole('button', { name: /publish catalogue/i }).closest('form')!);

        await waitFor(() => expect(publishJSONMock).toHaveBeenCalled());
        const doc = publishJSONMock.mock.calls[0][0];
        expect(doc.items).toHaveLength(1);
        expect(doc.items[0].name).toBe('Pizza');
    });
});
