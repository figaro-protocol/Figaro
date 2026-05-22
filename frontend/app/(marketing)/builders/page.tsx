import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Builders — Figaro Protocol",
    description:
        "Figaro is a protocol you extend, not an app you can be locked out of. Adding a schema is permissionless, and 60% of the token supply rewards the authors of schemas that get used.",
    openGraph: {
        title: "Builders — Figaro Protocol",
        description:
            "Extend the protocol without asking. If people use what you built, it pays you back.",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Builders — Figaro Protocol",
        description:
            "Extend the protocol without asking. If people use what you built, it pays you back.",
    },
};

export default function BuildersPage() {
    return (
        <section className="container mx-auto px-6 pt-24 pb-16 max-w-2xl">
            <h1 className="text-heading-h1 text-ink-heading mb-3">
                Build on a protocol no one owns.
            </h1>
            <p className="text-body-lead text-ink-muted italic mb-8">
                Extend it without asking. If people use what you built, it pays you back.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Most platforms you build on belong to a company. It can change the rules, deprecate your work, or take a cut &mdash; and you have no say, because the platform is theirs.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Figaro is structurally different. Its core &mdash; the part that holds the money and settles the deal &mdash; is finished, frozen, and owned by no one. It cannot be changed, paused, or pointed at new rules; not by a company, not by the people who wrote it. There is nothing to be locked out of, because there is no one to do the locking.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                What you build on top is open to anyone. The protocol carries structured agreements &mdash; what a deal contains, what counts as delivered, what a disclosure must include. Each kind is a schema, and adding a new one is permissionless: you write it, you register it, it is live. No application, no approval, no gatekeeper. Larger compositions and new coordination mechanisms layer on the same way.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                And here is what no other protocol offers: it pays the people who extend it. Sixty percent of the entire token supply &mdash; 600 million FIG &mdash; is reserved for one group only: the authors of schemas that get used. Not a grant you pitch for &mdash; a formula that measures real adoption (how many separate settled deals your schema carried, across how many distinct counterparties) and routes funding to you accordingly. Build something the network comes to rely on, and the network pays you back.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-12">
                Be clear-eyed about the stage. Figaro is a working protocol, still in development &mdash; not yet on a public network, not yet independently audited. The reward tranches unlock at years two, five, and nine &mdash; built to reward durable contribution, not a quick flip. What you can do today is read the code, write a schema against the live validator stack, and watch the whole thing settle a deal end to end on a local network.
            </p>
            <h2 className="text-base font-semibold text-ink-heading mb-4">
                Where to start
            </h2>
            <ul className="space-y-3 text-base">
                <li>
                    <Link href="/builders/designer" className="text-ink-heading font-medium hover:underline">
                        The Designer
                    </Link>
                    <span className="text-ink-body"> &mdash; compose a bonded process on a canvas and edit its agreement clauses.</span>
                </li>
                <li>
                    <Link href="/schemas" className="text-ink-heading font-medium hover:underline">
                        Schemas
                    </Link>
                    <span className="text-ink-body"> &mdash; the validation architecture, the seventeen reference schemas, and the authoring checklist.</span>
                </li>
                <li>
                    <Link href="/integrate" className="text-ink-heading font-medium hover:underline">
                        The SDK
                    </Link>
                    <span className="text-ink-body"> &mdash; <code>@figaro/core</code>: ABIs, event parsers, content encoders, commitment builders.</span>
                </li>
                <li>
                    <Link href="/spec" className="text-ink-heading font-medium hover:underline">
                        The contract surface
                    </Link>
                    <span className="text-ink-body"> &mdash; every contract above the kernel, with its source link and verification status.</span>
                </li>
                <li>
                    <Link href="/builders/composability" className="text-ink-heading font-medium hover:underline">
                        Composability
                    </Link>
                    <span className="text-ink-body"> &mdash; the coordinator pattern, the three extension tiers, and the kernel-vs-author boundary.</span>
                </li>
            </ul>
        </section>
    );
}
