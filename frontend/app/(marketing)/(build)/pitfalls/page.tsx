import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { Breadcrumb } from "@/components/shared/Breadcrumb";

export const metadata: Metadata = withOg({
    title: "Sharp edges — Figaro Protocol",
    description:
        "The canonical footguns page: eight documented traps, organized by when each one bites — writing a clause spec, building a commit, resolving and recording, or reading resolved state — each with its mechanic and where its canonical explanation lives.",
});

export default function Pitfalls() {
    return (
        <>
            <div className="container mx-auto px-6 pt-8">
                <Breadcrumb
                    items={[
                        { label: "Build", href: "/terms" },
                        { label: "Sharp edges" },
                    ]}
                />
            </div>
            <MarketingHero
                title="Sharp edges."
                lead={
                    <>
                        Eight documented traps, in the order you can hit them: writing a clause spec, building a commit or a checkout, resolving a process and recording what it earned, then reading resolved state back. Each is documented in full, with its mechanic and where its canonical explanation lives, in the builder documentation.
                    </>
                }
            />

            <MarketingSection title="The eight traps.">
                <p className="text-sm text-ink-body leading-relaxed">
                    The traps, in the order you can hit them, and the mechanic behind each &mdash; verified against the shipped contracts and SDK &mdash; are in the <a href="/docs/protocol/sharp-edges/" className="text-ink-heading font-medium hover:underline">builder documentation</a>.
                </p>
            </MarketingSection>
        </>
    );
}
