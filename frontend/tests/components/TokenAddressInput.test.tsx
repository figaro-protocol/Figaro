import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TokenAddressInput, isValidAddress, useTokenSymbol } from '@/components/sellers/TokenAddressInput';

// ── Override global wagmi mock for useReadContract ────────────────────────────

const useReadContractMock = vi.fn();

vi.mock('wagmi', () => ({
    useReadContract: (...args: unknown[]) => useReadContractMock(...args),
}));

// ── isValidAddress ────────────────────────────────────────────────────────────

describe('isValidAddress', () => {
    it('accepts a well-formed 40-hex address', () => {
        expect(isValidAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')).toBe(true);
    });

    it('accepts lower-case hex', () => {
        expect(isValidAddress('0x70997970c51812dc3a010c7d01b50e0d17dc79c8')).toBe(true);
    });

    it('rejects an address that is too short', () => {
        expect(isValidAddress('0x1234')).toBe(false);
    });

    it('rejects an address with no 0x prefix', () => {
        expect(isValidAddress('70997970C51812dc3A010C7d01b50e0d17dc79C8')).toBe(false);
    });

    it('rejects an empty string', () => {
        expect(isValidAddress('')).toBe(false);
    });

    it('rejects a non-hex character in the body', () => {
        expect(isValidAddress('0xGGGG7970C51812dc3A010C7d01b50e0d17dc79C8')).toBe(false);
    });
});

// ── TokenAddressInput ─────────────────────────────────────────────────────────

describe('TokenAddressInput', () => {
    const VALID_ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

    it('renders the text input', () => {
        useReadContractMock.mockReturnValue({ data: undefined, isLoading: false });
        render(<TokenAddressInput value="" onChange={vi.fn()} />);
        expect(screen.getByPlaceholderText('0x… token address')).toBeInTheDocument();
    });

    it('calls onChange when the user types', async () => {
        useReadContractMock.mockReturnValue({ data: undefined, isLoading: false });
        const onChange = vi.fn();
        render(<TokenAddressInput value="" onChange={onChange} />);

        await userEvent.type(screen.getByPlaceholderText('0x… token address'), 'abc');

        expect(onChange).toHaveBeenCalled();
    });

    it('shows the resolved symbol when the address is valid and symbol loaded', () => {
        useReadContractMock.mockReturnValue({ data: 'USDC', isLoading: false });
        render(<TokenAddressInput value={VALID_ADDR} onChange={vi.fn()} />);

        expect(screen.getByText('USDC')).toBeInTheDocument();
    });

    it('shows "…" while symbol is loading', () => {
        useReadContractMock.mockReturnValue({ data: undefined, isLoading: true });
        render(<TokenAddressInput value={VALID_ADDR} onChange={vi.fn()} />);

        expect(screen.getByText('…')).toBeInTheDocument();
    });

    it('shows "✓" when address is valid but symbol is undefined', () => {
        useReadContractMock.mockReturnValue({ data: undefined, isLoading: false });
        render(<TokenAddressInput value={VALID_ADDR} onChange={vi.fn()} />);

        expect(screen.getByText('✓')).toBeInTheDocument();
    });

    it('does not show symbol indicator for an invalid address', () => {
        useReadContractMock.mockReturnValue({ data: undefined, isLoading: false });
        render(<TokenAddressInput value="0xbad" onChange={vi.fn()} />);

        expect(screen.queryByText('✓')).not.toBeInTheDocument();
        expect(screen.queryByText('…')).not.toBeInTheDocument();
    });

    it('applies red border styling for an invalid partial address', () => {
        useReadContractMock.mockReturnValue({ data: undefined, isLoading: false });
        render(<TokenAddressInput value="0xbad" onChange={vi.fn()} />);

        const input = screen.getByPlaceholderText('0x… token address');
        expect(input.className).toContain('border-red-300');
    });

    it('shows the remove button when onRemove is provided', () => {
        useReadContractMock.mockReturnValue({ data: undefined, isLoading: false });
        render(<TokenAddressInput value="" onChange={vi.fn()} onRemove={vi.fn()} />);

        expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    });

    it('does not show the remove button when onRemove is omitted', () => {
        useReadContractMock.mockReturnValue({ data: undefined, isLoading: false });
        render(<TokenAddressInput value="" onChange={vi.fn()} />);

        expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    });

    it('calls onRemove when the remove button is clicked', async () => {
        useReadContractMock.mockReturnValue({ data: undefined, isLoading: false });
        const onRemove = vi.fn();
        render(<TokenAddressInput value="" onChange={vi.fn()} onRemove={onRemove} />);

        await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

        expect(onRemove).toHaveBeenCalledOnce();
    });
});
