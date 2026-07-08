import type { Metadata } from "next";
import { SellerEditAssemblies } from "@/components/sellers/SellerEditAssemblies";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Edit assemblies — Figaro Protocol",
    description: "Pick which assemblies the wallet participates in. Re-pins the profile JSON with the updated assemblyBindings array, then dispatches SellerRegistry.updateProfile.",
};

export default function EditAssembliesPage() {
    return (
        <section className="container mx-auto px-6 pt-24 pb-24 max-w-2xl space-y-10">
            <div>
                <h1 className="text-heading-h1 text-ink-heading mb-4">
                    Edit assemblies.
                </h1>
                <p className="text-body-lead text-ink-body">
                    Toggle which assemblies your wallet participates in. Saving re-pins the profile JSON with the updated bindings and dispatches <code>updateProfile</code>. A seller with no bindings is still on-chain registered — the assemblies just don&apos;t surface to assembly-scoped discovery.
                </p>
            </div>
            <SellerEditAssemblies />
        </section>
    );
}
