import type { Metadata } from "next";
import Link from "next/link";
import { RegisterClauseForm } from "./_components/RegisterClauseForm";
import { RegisteredClausesReclaim } from "./_components/RegisteredClausesReclaim";

export const metadata: Metadata = {
    title: "Register a clause — Figaro Protocol",
    description:
        "Paste a clause spec, validate it against the off-chain Layer-A well-formedness check, then anchor it on the ClauseRegistry. Reclaim the registration stake of clauses you registered.",
};

/**
 * /builders/clauses — the wallet-scoped clause authoring surface, the
 * clause-side mirror of /builders/designer (assembly authoring). Two halves:
 *
 *  1. Register a clause — paste a spec, validate through the generic Layer-A
 *     surface (`@figaro/sdk/clauses`, the same gate that runs at sign-time),
 *     pin to IPFS, and anchor on `ClauseRegistry.registerClause`.
 *  2. Your registered clauses — derived from `ClauseRegistered` events filtered
 *     to the connected wallet, each with a stake-reclaim affordance gated by the
 *     advisory commits==resolves gate.
 *
 * The marketing `/clauses` page carries the spec-writing instructions this page
 * pairs with. Reading state needs no wallet; the register + reclaim WRITES do
 * (connect is a signing prerequisite, gated inline, not a login).
 */
export default function ClauseAuthoring() {
    return (
        <div className="min-h-screen bg-canvas">
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <h1 className="text-heading-h1 text-ink-heading mb-6">
                    Register a clause.
                </h1>
                <p className="text-body-lead text-ink-body max-w-2xl mb-4">
                    A clause is a content shape — the structured evidence an attestation carries. Paste its spec below; it is validated against the same off-chain Layer-A check that gates signing, pinned to IPFS, and anchored on the <code>ClauseRegistry</code>. Registration is permissionless, first-write-wins, and immutable per <code>(name, version)</code>.
                </p>
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    New to the spec format? The{" "}
                    <Link href="/clauses" className="underline">clauses page</Link>{" "}
                    carries the writing instructions, the JSON Schema, and the reference set.
                </p>
                <div className="mt-8">
                    <RegisterClauseForm />
                </div>
            </section>

            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    Your registered clauses
                </h2>
                <p className="text-sm text-ink-muted mb-6 max-w-2xl">
                    Clauses this wallet registered, reconstructed from{" "}
                    <code>ClauseRegistered</code> events. Reclaiming a stake moves the deposit and de-surfaces the clause for new compositions — the binding stays anchored and committed deals keep resolving it.
                </p>
                <RegisteredClausesReclaim />
            </section>
        </div>
    );
}
