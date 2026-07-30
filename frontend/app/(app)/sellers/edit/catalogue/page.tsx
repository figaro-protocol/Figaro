import type { Metadata } from "next";
import { SellerEditCatalogue } from "@/components/sellers/SellerEditCatalogue";

export const metadata: Metadata = {
    title: "Edit catalogue — Figaro Protocol",
    description: "Update the pinned catalogue document. Re-pins items to IPFS, then re-pins the seller profile pointing at the new catalogue CID, then dispatches MembersRegistry.updateProfile.",
};

export default function EditCataloguePage() {
    return (
        <section className="container mx-auto px-6 pt-24 pb-24 max-w-2xl space-y-10">
            <div>
                <h1 className="text-heading-h1 text-ink-heading mb-4">
                    Edit catalogue.
                </h1>
                <p className="text-body-lead text-ink-body">
                    Add, remove, or update items. Saving pins a new catalogue document, then a new profile document pointing at it, then dispatches <code>updateProfile</code>. Two pins, one transaction. Deposit and lock period are unaffected.
                </p>
            </div>
            <SellerEditCatalogue />
        </section>
    );
}
