import { ReactNode } from "react";

/**
 * Shared layout for `/members` and all its sub-routes (the wizard
 * steps at /members/identity, /catalogue, /assemblies, /agents,
 * /review, and the edit surfaces at /members/edit/*). Provides the
 * container + max-width the onboarding surface carried before the
 * directory restructure.
 */
export default function MembersLayout({ children }: { children: ReactNode }) {
    return (
        <section className="container mx-auto px-6 pt-16 pb-24 max-w-2xl">
            {children}
        </section>
    );
}
