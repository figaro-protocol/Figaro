import Link from "@/components/shared/Link";

/**
 * The checkout's line on what the party signs. The party signs a commitment
 * (the fields listed in `lib/checkout/signedCommitmentFields`), and that
 * commitment carries the `checkoutHash`, the fingerprint of the agreement
 * shown above it. It is not the hash alone.
 */
export function CheckoutSigningNote() {
    return (
        <p className="text-xs text-ink-muted" data-testid="checkout-security-link">
            You sign a commitment. It carries the <code className="font-mono">checkoutHash</code>, the fingerprint
            of the agreement above, and you can check that fingerprint yourself.{" "}
            <Link href="/core/faq#signing" className="underline text-ink-primary hover:text-ink-body">
                How &rarr;
            </Link>
        </p>
    );
}
