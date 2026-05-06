import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Figaro Local Commerce — Figaro Protocol",
    description: "An assembly composing a three-role bonded local-commerce process from protocol primitives. Generic across food, retail, and services.",
};

export default function LocalCommercePage() {
    return (
        <>
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-eyebrow uppercase text-ink-muted mb-4">
                    local-commerce
                </p>
                <h1 className="text-heading-h1 text-ink-heading mb-6">
                    Three roles, one bonded process.
                </h1>
                <p className="text-body-lead text-ink-body max-w-2xl">
                    An assembly composing a local-commerce process from protocol primitives. Three roles (buyer, merchant, courier), one root bonded commitment, one sub-order, atomic settlement. Generic across food, retail, and service verticals; the reference instance uses food delivery as the concrete shape.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-default pt-12">
                <h2 className="text-eyebrow uppercase text-ink-muted mb-6">
                    Roles
                </h2>
                <dl className="space-y-4 text-sm">
                    <div>
                        <dt className="text-base font-semibold text-ink-heading">Buyer</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">Root buyer of the process. Commits the root order to a merchant for goods, bonding 2× the goods payment. Commits a delivery sub-order to a courier (chosen via <code>DutchAuction</code>), bonding 2× the delivery payment. Triggers <code>resolveProcess</code> once delivery is confirmed; the kernel atomically settles the whole process.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-ink-heading">Merchant</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">Counter-signs the buyer&apos;s root commitment as the seller of goods. Bonds 2× the goods value. The kernel enforces <code>buyer == rootBuyer</code> in every order, so the merchant doesn&apos;t itself commit sub-orders &mdash; the buyer&apos;s sub-order to the courier is a parallel commit in the same process. The merchant&apos;s bond is at risk across the whole process at atomic resolution; the merchant&apos;s operational obligation (packaging, declaring ready-for-pickup) carries direct economic interest in the courier completing the delivery. Maps to a restaurant in food, a retailer in retail, a service-provider in services.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-ink-heading">Courier</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">Counter-signs the buyer&apos;s delivery sub-order at an auction-determined fee. Bonds 2× cumulative process value (goods + delivery) &mdash; progressive collateralization in operation. Maps to a driver, cyclist, walker, drone, or any other delivery modality.</dd>
                    </div>
                </dl>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-default pt-12">
                <h2 className="text-eyebrow uppercase text-ink-muted mb-6">
                    Mechanisms in use
                </h2>
                <ul className="space-y-4">
                    <li className="border-b border-default pb-3">
                        <div className="text-ink-heading font-medium"><code>FigaroCore</code></div>
                        <p className="text-sm text-ink-muted mt-0.5">Kernel. Holds bonds. <code>commit</code> establishes root + sub-orders; <code>resolveProcess</code> atomically settles the whole tree.</p>
                    </li>
                    <li className="border-b border-default pb-3">
                        <div className="text-ink-heading font-medium"><code>DutchAuction</code></div>
                        <p className="text-sm text-ink-muted mt-0.5">Descending-price mechanism for courier dispatch. The merchant posts a delivery job; the auction starts at a max price and linearly decays to a floor. The first courier to accept wins at the current price; surplus refunds to the buyer.</p>
                    </li>
                    <li className="border-b border-default pb-3">
                        <div className="text-ink-heading font-medium"><code>AttestationCoordinator</code></div>
                        <p className="text-sm text-ink-muted mt-0.5">Runtime attestation surface for lifecycle, proximity, and GHG events. Every attestation carries a merkle inclusion proof against the signed agreement manifest.</p>
                    </li>
                    <li className="border-b border-default pb-3">
                        <div className="text-ink-heading font-medium"><code>OperatorRegistry</code></div>
                        <p className="text-sm text-ink-muted mt-0.5">Permissionless self-registration for merchants and couriers (across all local-commerce verticals) with a reclaimable ETH deposit. Event-sourced (role + metadataURI in <code>OperatorRegistered</code>); on-chain state is dedup-only. No admin, no KYC, no profile-edit / deactivate / reactivate — switch role or metadata via withdraw + re-register.</p>
                    </li>
                </ul>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-default pt-12">
                <h2 className="text-eyebrow uppercase text-ink-muted mb-6">
                    Privacy surface
                </h2>
                <p className="text-base text-ink-body leading-relaxed">
                    The delivery address is sealed per-order with ECDH key exchange over XMTP and AES-256-GCM; only the courier can decrypt it. Keys are discarded at settlement — no standing intermediary retains the address. GHG emissions data (grams CO₂e for goods preparation and delivery) is optional and declared via <code>figaro-ghg-measurement-v1</code> at runtime.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-default pt-12">
                <h2 className="text-eyebrow uppercase text-ink-muted mb-6">
                    Where to go from here
                </h2>
                <ul className="space-y-2 text-sm">
                    <li>
                        <Link href="/discover" data-testid="reference-archetype-runtime-link" className="text-ink-heading hover:underline">
                            Try it live &rarr;
                        </Link>
                    </li>
                    <li>
                        <Link href="/builders/designer/view/local-commerce" className="text-ink-heading hover:underline">
                            Inspect assembly &rarr;
                        </Link>
                    </li>
                    <li>
                        <Link href="/builders" className="text-ink-heading hover:underline">
                            Composition surface &rarr;
                        </Link>
                    </li>
                    <li>
                        <a href="https://github.com/figaro-protocol/Figaro-Prototype2" target="_blank" rel="noopener noreferrer" className="text-ink-heading hover:underline">
                            Source &rarr;
                        </a>
                    </li>
                </ul>
            </section>
        </>
    );
}
