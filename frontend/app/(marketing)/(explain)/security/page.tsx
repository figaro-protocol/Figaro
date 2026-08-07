import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Security — Figaro Protocol",
    description:
        "Testing and code security: the verification stack — Foundry, Halmos, Certora, TLA+, Echidna — the external-audit posture, and how to verify any deal yourself. Audit results are published here as they land.",
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
                    What is in place today is a verification stack &mdash; five independent benches targeting the protocol&apos;s contracts from different angles:
                </p>
                <ul className="space-y-2 text-base text-ink-body mb-5 ml-6">
                    <li>&mdash; <strong className="text-ink-heading font-medium">Foundry</strong>: the unit + integration suite &mdash; 299 test and invariant functions.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Halmos</strong>: 32 symbolic-execution properties, proved exhaustively.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Certora</strong>: 37 formal rules across five CVL specs &mdash; the kernel, attestation, batch token operations, the florin token, and the RPGF minter.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">TLA+</strong>: model-checking of four protocol state machines &mdash; the kernel, the florin token, the two settlement paths, and the swap/commit coordinator.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Echidna</strong>: 15 property-based fuzzing targets on the kernel and the florin token.</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed">
                    Verification is not a substitute for external audit. It is a precondition. The protocol&apos;s position is that an audit should examine a surface that has already been pushed against from this many directions &mdash; not a surface arriving to it raw. The current contract inventory and verification map are at <Link href="/spec" className="text-ink-heading font-medium hover:underline">spec</Link>; the full harness inventory &mdash; commands, layers, and what each bench owns &mdash; is <a href="https://github.com/figaro-protocol/Figaro/blob/main/docs/TESTING.md" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">docs/TESTING.md</a> in the repository.
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
