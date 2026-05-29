import type { Metadata } from "next";
import { SellerEditAgents } from "@/components/sellers/SellerEditAgents";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Edit agent endpoints — Figaro Protocol",
    description: "Set or clear ERC-8004-compatible service endpoints (mcp / a2a / rest / did:web / ENS). Re-pins the profile JSON with the updated services field, then dispatches SellerRegistry.updateProfile.",
};

export default function EditAgentsPage() {
    return (
        <section className="container mx-auto px-6 pt-24 pb-24 max-w-2xl space-y-10">
            <div>
                <h1 className="text-heading-h1 text-ink-heading mb-4">
                    Edit agent endpoints.
                </h1>
                <p className="text-body-lead text-ink-body">
                    Optional ERC-8004-compatible endpoints for cross-protocol discoverability. Figaro doesn&apos;t depend on ERC-8004 — these are pure interop. Saving re-pins the profile and dispatches <code>updateProfile</code>; clearing every field strips the <code>services</code> object from the profile entirely.
                </p>
            </div>
            <SellerEditAgents />
        </section>
    );
}
