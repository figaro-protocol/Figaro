import type { Metadata } from "next";
import { CatalogueBuilder } from "@/components/operators/CatalogueBuilder";

export const metadata: Metadata = {
    title: "Catalogue Builder — Figaro Protocol",
    description: "Build and publish your operator service catalogue to IPFS. Add items, set prices, and get a content URI to link from your operator profile.",
};

export default function CataloguePage() {
    return (
        <>

            <section className="container mx-auto px-6 pt-24 pb-16 max-w-2xl">
                <p className="text-eyebrow uppercase text-ink-muted mb-4">
                    Operator Registry
                </p>
                <h1 className="text-heading-h1 text-ink-heading mb-6">
                    Build your catalogue.
                </h1>
                <p className="text-body-lead text-ink-body max-w-xl mb-10">
                    Define your service items, publish them to IPFS, then link the URI in your operator profile.
                </p>

                {/* Two-step flow indicator. Catalogue first, then Register —
                    the catalogue's IPFS URI feeds back into the operator
                    profile form via ?catalogueURI=<uri> on registration.
                    Reversing this order silently dead-ends already-registered
                    operators (no on-chain `updateProfile` post-web2-strip). */}
                <div className="flex items-center gap-3 mb-16 max-w-xs">
                    <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-ink-heading text-paper text-xs flex items-center justify-center font-bold flex-shrink-0">
                            1
                        </span>
                        <span className="text-sm font-semibold text-ink-heading whitespace-nowrap">Catalogue</span>
                    </div>
                    <div className="flex-1 h-px bg-default" />
                    <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full border border-default text-ink-faint text-xs flex items-center justify-center font-bold flex-shrink-0">
                            2
                        </span>
                        <a href="/operators" className="text-sm text-ink-faint hover:text-ink-heading whitespace-nowrap transition-colors">
                            Register
                        </a>
                    </div>
                </div>

                <CatalogueBuilder />
            </section>

        </>
    );
}
