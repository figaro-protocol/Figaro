import { ReactNode } from "react";
import { PublishTargetNotice } from "@/components/shared/PublishTargetNotice";

/**
 * Shared layout for `/members` and all its sub-routes (the wizard
 * steps at /members/identity, /catalog, /assemblies, /agents,
 * /review, and the edit surfaces at /members/edit/*). Provides the
 * container + max-width the onboarding surface carried before the
 * directory restructure. Every step publishes or erases through this
 * browser's IPFS node or pinning service, so the layout carries the one line
 * that says when none is set.
 */
export default function MembersLayout({ children }: { children: ReactNode }) {
    return (
        <section className="container mx-auto px-6 pt-16 pb-24 max-w-2xl">
            <PublishTargetNotice className="mb-6" />
            {children}
        </section>
    );
}
