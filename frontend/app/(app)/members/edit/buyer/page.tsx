import type { Metadata } from "next";
import { MemberEditBuyer } from "@/components/sellers/MemberEditBuyer";

export const metadata: Metadata = {
    title: "Edit buyer side — Figaro Protocol",
    description: "Subscribe the assemblies the wallet buys through and choose which record classes it offers for sale. Re-pins the profile JSON, then dispatches MembersRegistry.updateProfile.",
};

export default function EditBuyerPage() {
    return (
        <section className="container mx-auto px-6 pt-24 pb-24 max-w-2xl space-y-10">
            <div>
                <h1 className="text-heading-h1 text-ink-heading mb-4">
                    Edit your buyer side.
                </h1>
                <p className="text-body-lead text-ink-body">
                    Toggle which assemblies your wallet buys through and which of
                    the records those deals co-produce you offer for sale. Saving
                    re-pins the profile JSON and dispatches <code>updateProfile</code>.
                    Prices live in your catalogue.
                </p>
            </div>
            <MemberEditBuyer />
        </section>
    );
}
