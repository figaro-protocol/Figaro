import { describe, expect, it, vi } from 'vitest';

import { handleOrderSurfaceFailure } from '@/lib/shared/orderSurfaceActions';

describe('orderSurfaceActions', () => {
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