/**
 * The line a page shows where one wallet is both the buyer and the seller of
 * an order. The Core admits such an order and the SDK signs both sides of
 * it; this frontend does not place it (`docs/FRONTEND.md`, the checkout
 * route). A page shows the line before any wallet prompt, in place of an act
 * that would end in a refusal.
 */
export function OneWalletBothSidesNote({ testId }: { testId: string }) {
    return (
        <p className="text-xs text-ink-muted" data-testid={testId}>
            This frontend does not place an order whose buyer and seller are one wallet; the SDK and the Core do.
        </p>
    );
}
