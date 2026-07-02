import { describe, expect, it, vi } from 'vitest';

import { handleOrderSurfaceFailure, runOrderSurfaceAction } from '@/lib/shared/orderSurfaceActions';

describe('orderSurfaceActions', () => {
    it('runs the action after clearing prior errors', async () => {
        const action = vi.fn(async () => undefined);
        const onClearError = vi.fn();
        const onSuccess = vi.fn();

        const result = await runOrderSurfaceAction({
            action,
            failureMessage: 'Failed',
            onClearError,
            onSuccess,
        });

        expect(result).toBe(true);
        expect(onClearError).toHaveBeenCalledTimes(1);
        expect(action).toHaveBeenCalledTimes(1);
        expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('reports a missing-action message without running the action', async () => {
        const action = vi.fn(async () => undefined);
        const onError = vi.fn();

        const result = await runOrderSurfaceAction({
            action,
            enabled: false,
            missingMessage: 'Nothing to approve',
            failureMessage: 'Failed',
            onError,
        });

        expect(result).toBe(false);
        expect(action).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith('Nothing to approve');
    });

    it('extracts and forwards action failures', async () => {
        const error = { shortMessage: 'short failure', message: 'long failure' };
        const onError = vi.fn();

        const result = await runOrderSurfaceAction({
            action: vi.fn(async () => {
                throw error;
            }),
            failureMessage: 'fallback failure',
            onError,
        });

        expect(result).toBe(false);
        expect(onError).toHaveBeenCalledWith('short failure', error);
    });

    it('runs pre-error side effects before forwarding commitment failures', () => {
        const onBeforeError = vi.fn();
        const onError = vi.fn();
        const error = new Error('boom');

        const message = handleOrderSurfaceFailure(error, {
            failureMessage: 'fallback failure',
            onBeforeError,
            onError,
        });

        expect(message).toBe('boom');
        expect(onBeforeError).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith('boom', error);
    });
});