import type { Metadata } from "next";
import Link from "next/link";
import { BondingDiagram } from "@/components/shared/BondingDiagram";

export const metadata: Metadata = {
    title: "figaro-eats — Figaro Protocol",
    description: "An assembly composing a three-role bonded food-delivery process from protocol primitives. The first shipped example of Figaro composition.",
};

export default function FigaroEatsPage() {
    return (
        <>
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    figaro-eats
                </p>
                <h1 className="text-5xl sm:text-6xl font-bold text-black leading-tight tracking-tight mb-6">
                    Three roles, one bonded process.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl mb-4">
                    An assembly composing a food-delivery process from protocol primitives. Three roles (buyer, restaurant, driver), one root bonded commitment, two sub-orders, atomic settlement.
                </p>
                <p className="text-base text-gray-600 leading-relaxed max-w-2xl">
                    Figaro-eats is the first shipped example of Figaro composition. The kernel enforces bonding and settlement; the assembly shapes what gets settled. Runtime: <Link href="/i/figaro-eats" data-testid="reference-archetype-runtime-link" className="underline">/i/figaro-eats</Link>.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Bonding
                </h2>
                <BondingDiagram />
                <p className="text-sm text-gray-600 mt-4">
                    In figaro-eats, the root order is the buyer ↔ restaurant meal commitment; a sub-order is the restaurant ↔ driver delivery commitment. The driver bonds against cumulative value (meal + delivery), not just the delivery leg. See <Link href="/mechanism" className="underline">mechanism</Link>.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Roles
                </h2>
                <dl className="space-y-4 text-sm">
                    <div>
                        <dt className="text-base font-semibold text-black">Buyer</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">Commits the root order against a restaurant. Bonds 2× the meal payment. Triggers <code>resolveProcess</code> once delivery is confirmed.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-black">Restaurant</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">Counter-signs the root commitment. Bonds 2× the meal value. Commits a sub-order against a driver for delivery, bonding 2× the meal value again (progressive collateralization).</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-black">Driver</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">Counter-signs the sub-order at an auction-determined delivery fee. Bonds 2× cumulative value (meal + delivery).</dd>
                    </div>
                </dl>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Mechanisms in use
                </h2>
                <ul className="space-y-4">
                    <li className="border-b border-gray-100 pb-3">
                        <div className="text-black font-medium"><code>FigaroCore</code></div>
                        <p className="text-sm text-gray-600 mt-0.5">Kernel. Holds bonds. <code>commit</code> establishes root + sub-orders; <code>resolveProcess</code> atomically settles the whole tree.</p>
                    </li>
                    <li className="border-b border-gray-100 pb-3">
                        <div className="text-black font-medium"><code>DutchAuction</code></div>
                        <p className="text-sm text-gray-600 mt-0.5">Descending-price mechanism for driver dispatch. The restaurant posts a delivery job; the auction starts at a max price and linearly decays to a floor. The first driver to accept wins at the current price; surplus refunds to the buyer.</p>
                    </li>
                    <li className="border-b border-gray-100 pb-3">
                        <div className="text-black font-medium"><code>AttestationCoordinator</code></div>
                        <p className="text-sm text-gray-600 mt-0.5">Runtime attestation surface for lifecycle, proximity, and GHG events. Every attestation carries a merkle inclusion proof against the signed agreement manifest.</p>
                    </li>
                    <li className="border-b border-gray-100 pb-3">
                        <div className="text-black font-medium"><code>OperatorRegistry</code></div>
                        <p className="text-sm text-gray-600 mt-0.5">Permissionless self-registration for merchants and couriers with a reclaimable ETH deposit. Event-sourced (role + metadataURI in <code>OperatorRegistered</code>); on-chain state is dedup-only. No admin, no KYC, no profile-edit / deactivate / reactivate — switch role or metadata via withdraw + re-register.</p>
                    </li>
                </ul>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Schemas declared
                </h2>
                <p className="text-sm text-gray-600 mb-4">
                    The signed agreement carries clauses under these <code>schemaId</code>s. Validators enforce content shape and, for Category-2 schemas, byte-equality between runtime content and committed <code>sectionData</code>.
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    <li className="flex justify-between border-b border-gray-100 pb-2"><code>figaro-topology-v1</code><span className="text-xs text-gray-500">manifest-only</span></li>
                    <li className="flex justify-between border-b border-gray-100 pb-2"><code>figaro-commerce-v1</code><span className="text-xs text-gray-500">committed</span></li>
                    <li className="flex justify-between border-b border-gray-100 pb-2"><code>figaro-handoff-v1</code><span className="text-xs text-gray-500">committed</span></li>
                    <li className="flex justify-between border-b border-gray-100 pb-2"><code>figaro-geo-v1</code><span className="text-xs text-gray-500">committed</span></li>
                    <li className="flex justify-between border-b border-gray-100 pb-2"><code>figaro-fulfilment-v1</code><span className="text-xs text-gray-500">committed</span></li>
                    <li className="flex justify-between border-b border-gray-100 pb-2"><code>figaro-ghg-protocol-v1</code><span className="text-xs text-gray-500">optional, committed</span></li>
                    <li className="flex justify-between border-b border-gray-100 pb-2"><code>figaro-ghg-iso-14064-v1</code><span className="text-xs text-gray-500">optional, committed</span></li>
                    <li className="flex justify-between border-b border-gray-100 pb-2"><code>figaro-ghg-pas-2050-v1</code><span className="text-xs text-gray-500">optional, committed</span></li>
                    <li className="flex justify-between border-b border-gray-100 pb-2"><code>figaro-ghg-en-16258-v1</code><span className="text-xs text-gray-500">optional, committed</span></li>
                    <li className="flex justify-between border-b border-gray-100 pb-2"><code>figaro-ghg-custom-v1</code><span className="text-xs text-gray-500">optional, committed</span></li>
                    <li className="flex justify-between border-b border-gray-100 pb-2"><code>figaro-ghg-measurement-v1</code><span className="text-xs text-gray-500">runtime</span></li>
                    <li className="flex justify-between border-b border-gray-100 pb-2"><code>figaro-delivery-lifecycle-v1</code><span className="text-xs text-gray-500">runtime</span></li>
                    <li className="flex justify-between border-b border-gray-100 pb-2"><code>figaro-proximity-policy-v1</code><span className="text-xs text-gray-500">committed</span></li>
                    <li className="flex justify-between border-b border-gray-100 pb-2"><code>figaro-proximity-proof-v1</code><span className="text-xs text-gray-500">runtime</span></li>
                    <li className="flex justify-between border-b border-gray-100 pb-2"><code>figaro-merchant-process-v1</code><span className="text-xs text-gray-500">runtime</span></li>
                    <li className="flex justify-between border-b border-gray-100 pb-2"><code>figaro-courier-process-v1</code><span className="text-xs text-gray-500">runtime</span></li>
                    <li className="flex justify-between border-b border-gray-100 pb-2"><code>figaro-jurisdiction-v1</code><span className="text-xs text-gray-500">optional, committed</span></li>
                </ul>
                <p className="text-sm text-gray-600 mt-4">
                    Schema architecture: <Link href="/schemas" className="underline">/schemas</Link>. Validators in force: <Link href="/spec" className="underline">/spec</Link>.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Privacy surface
                </h2>
                <p className="text-base text-gray-700 leading-relaxed">
                    The delivery address is sealed per-order with ECDH key exchange over XMTP and AES-256-GCM; only the driver can decrypt it. Keys are discarded at settlement — no standing intermediary retains the address. GHG emissions data (grams CO₂e for meal preparation and delivery) is optional and declared via <code>figaro-ghg-measurement-v1</code> at runtime.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Forking
                </h2>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Figaro-eats is a template for bonded marketplaces with three or more roles, time-sensitive handoffs, and physical delivery. The kernel makes no distinction between food delivery, ride-hail, parcel courier, equipment rental, or multi-tier procurement. Any community can fork the assembly, replace roles and schemas, and publish a new composition.
                </p>
                <ul className="space-y-2 text-sm">
                    <li>
                        <Link href="/i/figaro-eats" className="text-black hover:underline">
                            Runtime &rarr;
                        </Link>
                    </li>
                    <li>
                        <Link href="/builders" className="text-black hover:underline">
                            Composition surface &rarr;
                        </Link>
                    </li>
                    <li>
                        <a href="https://github.com/figaro-protocol/Figaro-Prototype2" target="_blank" rel="noopener noreferrer" className="text-black hover:underline">
                            Source &rarr;
                        </a>
                    </li>
                </ul>
            </section>
        </>
    );
}
