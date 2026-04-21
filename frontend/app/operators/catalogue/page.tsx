import type { Metadata } from "next";
import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";
import { CatalogueBuilder } from "@/components/operators/CatalogueBuilder";

export const metadata: Metadata = {
    title: "Catalogue Builder — Figaro Protocol",
    description: "Build and publish your operator service catalogue to IPFS. Add items, set prices, and get a content URI to link from your operator profile.",
};

export default function CataloguePage() {
    return (
        <main className="min-h-screen bg-white">
            <Header />

            <section className="container mx-auto px-6 pt-24 pb-16 max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Operator Registry
                </p>
                <h1 className="text-5xl font-bold text-black leading-tight tracking-tight mb-6">
                    Build your catalogue.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-xl mb-10">
                    Define your service items, publish them to IPFS, then link the URI in your operator profile.
                </p>

                {/* Two-step flow indicator */}
                <div className="flex items-center gap-3 mb-16 max-w-xs">
                    <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full border border-gray-300 text-gray-400 text-xs flex items-center justify-center font-bold flex-shrink-0">
                            1
                        </span>
                        <a href="/operators" className="text-sm text-gray-400 hover:text-black whitespace-nowrap transition-colors">
                            Register
                        </a>
                    </div>
                    <div className="flex-1 h-px bg-gray-200" />
                    <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-black text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                            2
                        </span>
                        <span className="text-sm font-semibold text-black whitespace-nowrap">Add catalogue</span>
                    </div>
                </div>

                <CatalogueBuilder />
            </section>

            <Footer />
        </main>
    );
}
