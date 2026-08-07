import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Security — Figaro Protocol",
    description:
        "Testing and code security: the verification stack targeting the kernel — Foundry, Halmos, Certora, TLA+, Echidna, Mythril — the external-audit posture, and how to verify any deal yourself. Audit results are published here as they land.",
};

// Security in the crypto sense only: testing, code security, audit results.
// The questions people ask — custody, non-delivery, disputes, lost keys,
// privacy — live ONCE, on /faq; this page never absorbs them.
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
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Not yet audited by an external auditor. That is the honest answer, and the protocol does not call itself release-ready until that audit lands. The Solidity surface was frozen for external audit on 20 April 2026 (with subsequent amendments scoped to the freeze); external audit decision and scheduling is one of two named release blockers.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Audit results will be published on this page when they exist &mdash; findings, remediations, and the auditor&apos;s report, not a summary of them.
                </p>
            </MarketingSection>

            <MarketingSection title="The verification stack" sectionId="verification">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    What is in place today is a verification stack &mdash; six independent tools targeting the same kernel from different angles:
                </p>
                <ul className="space-y-2 text-base text-ink-body mb-5 ml-6">
                    <li>&mdash; <strong className="text-ink-heading font-medium">Foundry</strong>: unit + integration suite, 0 failed.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Halmos</strong>: symbolic execution proves 7 properties of the kernel exhaustively.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Certora</strong>: formal verification of CVL specs covering bond conservation, atomic resolution, and authorization.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">TLA+</strong>: model-checking of the kernel and florin-token state machines.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Echidna</strong>: property-based fuzzing of the kernel and the florin token.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Mythril</strong>: symbolic execution for common vulnerability classes.</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed">
                    Verification is not a substitute for external audit. It is a precondition. The protocol&apos;s position is that an audit should examine a surface that has already been pushed against from this many directions &mdash; not a surface arriving to it raw. The current contract inventory and verification map are at <Link href="/spec" className="text-ink-heading font-medium hover:underline">spec</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Verify it yourself" sectionId="verify">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong>You do not have to take any of this on faith.</strong> <Link href="/audit" className="text-ink-heading font-medium hover:underline">Verify any deal yourself at /audit</Link> &mdash; paste a process ID and get back the on-chain record and a per-order signature check, no wallet or account needed.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The same legibility extends to every live deal. A process&apos;s full record &mdash; its timeline, financials, clause evidence, and the hashes that bind them to the signed agreements &mdash; is readable by anyone who holds the process ID, connected wallet or none. What that record can and cannot tell you about the <em>moment you signed</em> is a separate question, answered on the <Link href="/faq#signing" className="text-ink-heading font-medium hover:underline">FAQ</Link>.
                </p>
            </MarketingSection>
        </>
    );
}
