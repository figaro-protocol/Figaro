import { ReactNode } from "react";

/**
 * Shared layout for `/sellers` and all its sub-routes (the wizard
 * steps at /sellers/identity, /catalogue, /assemblies, /agents,
 * /review, and the edit surfaces at /sellers/edit/*). Provides the
 * container + max-width that the prior /sellers/onboard layout
 * carried before the directory restructure.
 */
export default function SellersLayout({ children }: { children: ReactNode }) {
    return (
        <section className="container mx-auto px-6 pt-16 pb-24 max-w-2xl">
            {children}
        </section>
    );
}
