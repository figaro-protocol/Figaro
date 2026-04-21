import React from 'react';

export default function AdminPage() {
    return (
        <main className="container mx-auto px-4 py-8">
            <section>
                <h1 className="text-3xl font-bold">Protocol Status</h1>
                <p className="mt-2 text-sm text-neutral-600">Kernel status, deployed addresses, and invariant surface.</p>
            </section>

            <section className="mt-8">
                <h2 className="text-2xl font-semibold">Contract Addresses</h2>
                <p className="mt-2 text-sm text-neutral-600">Canonical contract addresses for the local dev environment and mainnet deploys.</p>
            </section>

            <section className="mt-8">
                <h2 className="text-2xl font-semibold">Kernel Design</h2>
                <p className="mt-2 text-sm text-neutral-600">The kernel has no owner, no protocol fee, and no internal ledger.</p>
            </section>
        </main>
    );
}
