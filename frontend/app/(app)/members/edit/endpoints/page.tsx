import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { OnboardingEndpointsForm } from "@/components/members/OnboardingEndpointsForm";

export const metadata: Metadata = withOg({
    title: "Edit endpoints — Figaro Protocol",
    description: "The member's own infrastructure: IPFS node, gateway, chain RPC, verifier relay. Device configuration — stored in this browser, never pinned, never published.",
});

export default function EditEndpointsPage() {
    return (
        <section className="container mx-auto px-6 pt-24 pb-24 max-w-2xl space-y-10">
            <div>
                <h1 className="text-heading-h1 text-ink-heading mb-4">
                    Edit endpoints.
                </h1>
                <p className="text-body-lead text-ink-body">
                    Every member runs and pays for their own infrastructure. These
                    values configure this browser &mdash; they are never pinned and
                    never published; empty fields use this deployment&apos;s defaults.
                </p>
            </div>
            <OnboardingEndpointsForm />
        </section>
    );
}
