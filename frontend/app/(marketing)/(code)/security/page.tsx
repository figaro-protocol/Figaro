import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = withOg({
    title: "Security — Figaro Protocol",
    description:
        "Testing and code security: the verification stack — Foundry, Halmos, Certora, TLA+, Echidna, Lean 4 — the external-audit posture, and how to verify any trade yourself. Audit results are published here as they land.",
});

// Security in the crypto sense only: testing, code security, audit results.
// The questions people ask — custody, non-delivery, disputes, lost keys,
// privacy — live ONCE, on /faq; this page never absorbs them. One-screen door:
// the seven-bench detail lives once in the builder documentation at
// /docs/verification/security — point to it, never fork it.
export default function Security() {
    return (
        <>
            <MarketingHero
                title="Security."
                lead={
                    <>
                        Security here means what it means in crypto: testing and code security. This page holds the verification stack, the external-audit posture, and audit results as they land. The questions people ask about custody, non-delivery, disputes, or lost keys are answered once, on the <Link href="/faq" className="hover:underline">FAQ</Link>.
                    </>
                }
            />

            <MarketingSection title="External audit" sectionId="audit">
                <p className="text-base text-ink-body leading-relaxed">
                    Audit in progress. The Solidity surface is frozen for it (amendments scoped to the freeze), and the results will be published on this page when they exist &mdash; findings, remediations, and the auditor&apos;s report, not a summary of them.
                </p>
            </MarketingSection>

            <MarketingSection title="Verifying what you are served" sectionId="delivery">
                <p className="text-base text-ink-body leading-relaxed">
                    The contracts being verified says nothing about the page in front of you &mdash; a frontend could still misrepresent what you sign. What stands between you and that today is the two checks under signing, on the <Link href="/core/faq#signing" className="text-ink-heading font-medium hover:underline">FAQ</Link>: recompute the fingerprint on your own machine before you sign, and check the signatures against the chain afterward. Both run outside this site&apos;s reach, and the limitation stated there stands as written.</p>
            </MarketingSection>

            <MarketingSection title="The verification stack" sectionId="verification">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    What is in place today is a verification stack &mdash; seven independent benches: six on the protocol&apos;s contracts and one on the equilibrium algebra those contracts enforce &mdash; each from a different angle. Seven, and not one, because each catches a class of defect the others structurally cannot. What each class of check covers, what it structurally cannot reach, and every count derived from the tree are set out bench by bench in the <a href="/docs/verification/security/" className="text-ink-heading font-medium hover:underline">builder documentation</a> and in the paper <Link href="/papers/verified-resolution-kernel" className="text-ink-heading font-medium hover:underline">A Verified Resolution Kernel</Link>. Verification is a precondition for external audit. It is not a substitute for one.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Found a vulnerability? Report it privately &mdash; <a href="https://github.com/figaro-protocol/Figaro/security/advisories/new" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">GitHub private vulnerability reporting</a>, or the alternate channel in <a href="https://github.com/figaro-protocol/Figaro/blob/main/SECURITY.md" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">SECURITY.md</a> &mdash; never a public issue.
                </p>
            </MarketingSection>

        </>
    );
}
