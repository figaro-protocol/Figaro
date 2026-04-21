"use client";

import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";
import Link from "next/link";
import { Term } from "@/components/shared/Term";

export default function FigaroEatsPage() {
    return (
        <main className="min-h-screen bg-white text-black">
            <Header />

            {/* Hero — what is this? */}
            <section className="container mx-auto px-4 py-16 text-center">
                <h2 className="text-4xl sm:text-5xl font-bold text-black mb-4">Order food from any cook.</h2>
                <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-4">
                    The cook keeps 100% of the agreed payment. The driver keeps 100% of the fee.
                    Gas fees apply.
                    You get your deposit back when you confirm delivery.
                </p>
                <p className="text-sm text-gray-500 max-w-2xl mx-auto mb-8">
                    The deposit replaces the platform. Both sides put down 2&times; the order value.
                    No rational actor profits from cheating &mdash; losing $40 to steal $20 is a bad trade.
                    When you confirm, everyone gets paid and gets their deposit back in one transaction.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                    <Link
                        href="/assembly/figaro-eats"
                        data-testid="reference-archetype-runtime-link"
                        className="inline-flex items-center rounded border border-black px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-100"
                    >
                        Try Figaro Eats
                    </Link>
                    <Link
                        href="/why-figaro"
                        className="inline-flex items-center rounded border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
                    >
                        How Does the Deposit Work?
                    </Link>
                </div>
            </section>

            {/* How a real order works */}
            <section className="container mx-auto px-4 py-16">
                <h3 className="text-4xl font-bold text-black text-center mb-12">How an order works</h3>
                <div className="max-w-4xl mx-auto space-y-6">
                    <div className="bg-white border border-gray-300 rounded-lg p-6">
                        <h4 className="text-xl font-bold text-black mb-3">1. You order and deposit</h4>
                        <p className="text-black text-sm">
                            Browse cooks, choose your food, confirm the order. You deposit 2× the total
                            (meal + delivery). The cook deposits 2× the meal price. These sit in the
                            contract until the order completes.
                        </p>
                    </div>
                    <div className="bg-white border border-gray-300 rounded-lg p-6">
                        <h4 className="text-xl font-bold text-black mb-3">2. A driver claims the delivery</h4>
                        <p className="text-black text-sm">
                            The delivery job is posted as a <Term definition="An auction that starts at a high price and drops over time. The first person to accept gets the job at the current price.">Dutch auction</Term> &mdash; the price starts high and drops
                            over time. The first driver to accept gets the job at the current price. Any
                            surplus goes back to you. The driver deposits against the delivery value.
                        </p>
                    </div>
                    <div className="bg-white border border-gray-300 rounded-lg p-6">
                        <h4 className="text-xl font-bold text-black mb-3">3. The cook prepares, the driver delivers</h4>
                        <p className="text-black text-sm">
                            Each step — preparation started, ready for pickup, picked up, en route, delivered —
                            is recorded on-chain. These are timestamped attestations, not just status updates.
                            If anything goes wrong later, the evidence already exists.
                        </p>
                    </div>
                    <div className="bg-white border border-gray-300 rounded-lg p-6">
                        <h4 className="text-xl font-bold text-black mb-3">4. You confirm receipt — everyone settles</h4>
                        <p className="text-black text-sm">
                            You confirm the delivery. One transaction settles the whole thing: the cook
                            gets the meal payment, the driver gets the delivery fee, everyone gets their
                            deposits back. The kernel returns the locked bonds and distributes payment directly.
                            The temporary institution dissolves at settlement; no standing intermediary is required to keep it alive.
                        </p>
                    </div>
                </div>
            </section>

            {/* Why deposits work */}
            <section className="container mx-auto px-4 py-16">
                <h3 className="text-4xl font-bold text-black text-center mb-4">Why deposits work</h3>
                <p className="text-center text-sm text-gray-600 mb-12 max-w-2xl mx-auto">
                    The deposit is not a fee you lose. It is money you get back when the deal goes through.
                    It exists so that cheating is always a worse deal than cooperating.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
                    <div className="bg-white border border-gray-300 rounded-lg p-6">
                        <h4 className="text-lg font-bold text-black mb-2">For customers</h4>
                        <p className="text-sm text-black">
                            Your deposit means the cook and driver know you&apos;re serious.
                            You get it back when you confirm delivery. If they don&apos;t deliver,
                            they lose theirs.
                        </p>
                    </div>
                    <div className="bg-white border border-gray-300 rounded-lg p-6">
                        <h4 className="text-lg font-bold text-black mb-2">For cooks</h4>
                        <p className="text-sm text-black">
                            Your deposit means the customer knows food is coming.
                            You get it back plus payment when the order resolves.
                            Settlement returns your bond and pays you directly.
                        </p>
                    </div>
                    <div className="bg-white border border-gray-300 rounded-lg p-6">
                        <h4 className="text-lg font-bold text-black mb-2">For drivers</h4>
                        <p className="text-sm text-black">
                            Claim jobs at the price that works for you. Price discovery is open,
                            legible, and tied to the job itself. Your deposit comes back plus the delivery fee
                            when you complete the job.
                        </p>
                    </div>
                </div>
            </section>

            {/* Bridge — why food delivery, and why this generalizes */}
            <section className="container mx-auto px-4 py-16">
                <div className="max-w-4xl mx-auto bg-white border border-gray-300 rounded-lg p-8">
                    <h3 className="text-2xl font-bold text-black mb-4">Why start with food delivery?</h3>
                    <p className="text-black mb-4">
                        Food delivery is the hardest coordination test: perishable goods,
                        three strangers (customer, cook, driver), time-sensitive logistics,
                        and physical handoffs. If deposits can secure this, they can secure anything.
                    </p>
                    <p className="text-black mb-4">
                        Every person in this process keeps 100% of what they earn (gas fees apply).
                        There is no percentage fee, no commission, no platform to gatekeep who can participate.
                        A cook with a kitchen, a driver with a car, and a hungry customer &mdash;
                        the deposit replaces the coordination layer that delivery apps charge 30% for.
                    </p>
                    <p className="text-black text-sm">
                        The same pattern applies to ride-hail, equipment rental, procurement,
                        repair dispatch, cross-border trade &mdash; any scenario where strangers
                        need to coordinate.{" "}
                        <Link href="/why-figaro" className="underline hover:text-gray-600">
                            Read how the mechanism generalizes &rarr;
                        </Link>
                    </p>
                </div>
            </section>

            {/* Coordination Modules — for builders */}
            <section className="container mx-auto px-4 py-16">
                <h3 className="text-4xl font-bold text-black text-center mb-4">What makes this possible</h3>
                <p className="text-center text-sm text-gray-600 mb-12 max-w-2xl mx-auto">
                    Six open-source building blocks. No proprietary API. Any developer can fork this
                    and launch their own version for their own community.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
                    <div className="bg-white border border-gray-300 rounded-lg p-6">
                        <h4 className="text-lg font-bold text-black mb-2">Dutch Auction</h4>
                        <p className="text-sm text-black mb-2">
                            Price decays linearly from max to floor over a configurable duration.
                            The floor is set as a percentage of max price (floorBps). First driver to claim wins at the current price &mdash; surplus refunded to buyer.
                        </p>
                        <p className="text-xs text-gray-500">DutchAuction</p>
                    </div>
                    <a href="/operators" className="block bg-white border border-gray-300 rounded-lg p-6 hover:border-black transition-colors group">
                        <h4 className="text-lg font-bold text-black mb-2">Operator Registry</h4>
                        <p className="text-sm text-black mb-2">
                            On-chain registration with ETH deposit for Sybil resistance. Register as Merchant, Driver, or Both.
                            Update metadata, deactivate/reactivate, or withdraw deposit after lock period. No admin, no KYC.
                        </p>
                        <p className="text-xs text-gray-500 mb-3">OperatorRegistry</p>
                        <span className="text-xs font-semibold text-black group-hover:text-gray-600 transition-colors">Register as an operator &rarr;</span>
                    </a>
                    <div className="bg-white border border-gray-300 rounded-lg p-6">
                        <h4 className="text-lg font-bold text-black mb-2">Attestation Coordinator</h4>
                        <p className="text-sm text-black mb-2">
                            Three attestation modes: seller attests, buyer attests, or a resolver contract attests on behalf of a role.
                            Zero storage &mdash; every attestation is an immutable, schema-typed, block-timestamped event.
                        </p>
                        <p className="text-xs text-gray-500">AttestationCoordinator</p>
                    </div>
                    <div className="bg-white border border-gray-300 rounded-lg p-6">
                        <h4 className="text-lg font-bold text-black mb-2">GHG Disclosure</h4>
                        <p className="text-sm text-black mb-2">
                            Two-stage per-order emissions reporting. Stage 1: commitment attestation (seller declares scope).
                            Stage 2: inventory attestation (actual measured grams CO2e). The cook reports meal emissions; the driver reports delivery emissions.
                        </p>
                        <p className="text-xs text-gray-500">AttestationCoordinator + SchemaRegistry</p>
                    </div>
                    <div className="bg-white border border-gray-300 rounded-lg p-6">
                        <h4 className="text-lg font-bold text-black mb-2">Proximity Proofs</h4>
                        <p className="text-sm text-black mb-2">
                            Four modes: device proximity (BLE/NFC), QR challenge, photo+GPS, geohash match.
                            Each produces dispute-grade evidence. The institution assembly configures which are active.
                        </p>
                        <p className="text-xs text-gray-500">ProximityTypes + DeliveryAttestationPanel</p>
                    </div>
                    <div className="bg-white border border-gray-300 rounded-lg p-6">
                        <h4 className="text-lg font-bold text-black mb-2">Handoff Encryption</h4>
                        <p className="text-sm text-black mb-2">
                            Per-order ECDH key exchange seals your delivery address with AES-256-GCM.
                            Only the driver can decrypt it. Keys are discarded at settlement &mdash; no one retains your address.
                        </p>
                        <p className="text-xs text-gray-500">HandoffKeyExchangeModule + XMTP</p>
                    </div>
                </div>
            </section>

            {/* Open Source */}
            <section className="container mx-auto px-4 py-16">
                <div className="max-w-4xl mx-auto bg-white border border-gray-300 rounded-lg p-8 text-center">
                    <h3 className="text-3xl font-bold text-black mb-4">The first archetype, not the last one</h3>
                    <p className="text-lg text-black mb-6">Fork Eats. Keep the kernel. Publish a different institution assembly.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left mb-8">
                        <p className="text-black">✓ Fork the archetype UI</p>
                        <p className="text-black">✓ Reuse the same kernel</p>
                        <p className="text-black">✓ Publish a different assembly</p>
                        <p className="text-black">✓ Launch without asking permission</p>
                    </div>
                    <div className="flex gap-4 justify-center flex-wrap">
                        <a href="https://github.com/figaro-protocol/Figaro-Prototype2" target="_blank" rel="noopener noreferrer" className="px-6 py-3 bg-white text-black font-semibold rounded-lg border border-gray-300">
                            View GitHub Repo
                        </a>
                        <Link href="/builders" className="px-6 py-3 bg-white text-black font-semibold rounded-lg border border-gray-300">
                            Build Your Own Archetype
                        </Link>
                    </div>
                </div>
            </section>

            {/* Next steps */}
            <section className="container mx-auto px-4 py-20">
                <h3 className="text-4xl font-bold text-black text-center mb-12">Next steps</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-4xl mx-auto">
                    <div className="bg-white border border-gray-300 rounded-lg p-6 text-center">
                        <h4 className="text-xl font-bold text-black mb-3">Build</h4>
                        <p className="text-black text-sm mb-4">
                            Fork the archetype. Publish your own institution assembly.
                        </p>
                        <Link href="/builders" className="inline-block px-4 py-2 bg-black text-white font-semibold rounded hover:bg-gray-800 transition-colors">
                            Fork Archetype
                        </Link>
                    </div>
                    <div className="bg-white border border-gray-300 rounded-lg p-6 text-center">
                        <h4 className="text-xl font-bold text-black mb-3">Understand</h4>
                        <p className="text-black text-sm mb-4">
                            The mechanism, the properties, the game theory.
                        </p>
                        <Link href="/why-figaro#mechanism" className="inline-block px-4 py-2 bg-white text-black font-semibold rounded border border-gray-300">
                            How It Works
                        </Link>
                    </div>
                    <div className="bg-white border border-gray-300 rounded-lg p-6 text-center">
                        <h4 className="text-xl font-bold text-black mb-3">FIG Token</h4>
                        <p className="text-black text-sm mb-4">
                            Supply, emission, balance, claim.
                        </p>
                        <Link href="/fig" className="inline-block px-4 py-2 bg-white text-black font-semibold rounded border border-gray-300">
                            FIG Dashboard
                        </Link>
                    </div>
                </div>
            </section>

            <Footer />
        </main>
    );
}
