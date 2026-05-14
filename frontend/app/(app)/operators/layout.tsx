import { ReactNode } from "react";

/**
 * Shared layout for `/operators` and all its sub-routes (the wizard
 * steps at /operators/identity, /catalogue, /assemblies, /agents,
 * /review, and the edit surfaces at /operators/edit/*). Provides the
 * container + max-width that the prior /operators/onboard layout
 * carried before the directory restructure.
 */
export default function OperatorsLayout({ children }: { children: ReactNode }) {
    return (
        <section className="container mx-auto px-6 pt-16 pb-24 max-w-2xl">
            {children}
        </section>
    );
}
