import type { Metadata } from "next";
import Link from "next/link";
import { REFERENCE_ASSEMBLIES } from "@/lib/shared/assembly";
import { DraftsList } from "@/components/core/designer/DraftsList";

export const metadata: Metadata = {
    title: "Designer — Figaro Protocol",
    description: "Compose a Figaro assembly. Start from scratch or fork an existing reference.",
};

export default function DesignerLanding() {
    return (
        <div className="min-h-screen bg-neutral-50">
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-4">
                    Designer
                </p>
                <h1 className="text-5xl font-bold text-black leading-tight tracking-tight mb-6">
                    Compose an assembly.
                </h1>
                <p className="text-xl text-neutral-700 leading-relaxed max-w-2xl mb-4">
                    An assembly is a composition of roles, coordination mechanisms, and display views that use the Figaro kernel to coordinate a multi-party process.
                </p>
                <p className="text-base text-neutral-600 leading-relaxed max-w-2xl">
                    Every assembly inherits the seven baseline graphs — capital flow (committed at buy time), geolocation, GHG, handoff, proximity, jurisdiction, and DAG topology — automatically. On top of the baseline, you add components (today: Dutch auction) that bundle their own schemas, backend, and UI.
                </p>
                <div className="mt-8">
                    <Link
                        href="/builders/designer/new"
                        className="inline-flex rounded border border-black bg-black text-white px-5 py-2.5 text-sm font-semibold hover:bg-neutral-800"
                    >
                        Start a blank assembly
                    </Link>
                </div>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-neutral-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-6">
                    Your drafts
                </h2>
                <p className="text-sm text-neutral-600 mb-6 max-w-2xl">
                    Designs you&apos;ve saved from the canvas. Drafts are kept in this browser&apos;s local storage; they don&apos;t leave your machine.
                </p>
                <DraftsList />
            </section>

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-neutral-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-6">
                    Reference assemblies
                </h2>
                <p className="text-sm text-neutral-600 mb-6 max-w-2xl">
                    Existing assemblies published to the registry. Fork one to use it as a starting point for your own; view one to read its composition without editing.
                </p>
                <ul className="space-y-4">
                    {REFERENCE_ASSEMBLIES.map((a) => (
                        <li
                            key={a.identity.slug}
                            className="rounded-lg border border-neutral-200 bg-white px-5 py-4 flex items-start gap-4"
                        >
                            <div className="flex-1 min-w-0">
                                <p className="text-base font-semibold text-black">
                                    {a.identity.name}
                                </p>
                                <p className="font-mono text-xs text-neutral-500 mt-0.5">
                                    /{a.identity.slug}
                                </p>
                                {a.identity.description && (
                                    <p className="text-sm text-neutral-600 leading-relaxed mt-2">
                                        {a.identity.description}
                                    </p>
                                )}
                                <p className="text-xs text-neutral-500 mt-2">
                                    {a.roles.length} roles · {a.mechanisms.length} mechanisms · {a.views.length} views
                                </p>
                            </div>
                            <div className="flex flex-col gap-2 shrink-0">
                                <Link
                                    href={`/builders/designer/edit/${a.identity.slug}`}
                                    className="text-xs px-3 py-1.5 rounded border border-black bg-white hover:bg-neutral-100 text-black text-center"
                                >
                                    Fork
                                </Link>
                                <Link
                                    href={`/builders/designer/view/${a.identity.slug}`}
                                    className="text-xs px-3 py-1.5 rounded border border-neutral-300 bg-white hover:border-neutral-500 text-neutral-700 text-center"
                                >
                                    View
                                </Link>
                            </div>
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}
