import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = withOg({
    title: "Security — Figaro Protocol",
    description:
        "Testing and code security: the verification stack — Foundry, Halmos, Certora, TLA+, Echidna, Lean 4 — the external-audit posture, and how to verify any trade yourself. Audit results are published here as they land.",
});

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
                <p className="text-base text-ink-body leading-relaxed">
                    Not yet audited by an external auditor. That is the honest answer. The Solidity surface is frozen for that audit (amendments scoped to the freeze), and results will be published on this page when they exist &mdash; findings, remediations, and the auditor&apos;s report, not a summary of them.
                </p>
            </MarketingSection>

            <MarketingSection title="Verifying what you are served" sectionId="delivery">
                <p className="text-base text-ink-body leading-relaxed">
                    The contracts being verified says nothing about the page in front of you &mdash; a frontend could still misrepresent what you sign. The definitive, non-technical answer to that is a verifiable build: a release pinned by its own content hash (a CID) with a published rebuild recipe anyone can diff against it, plus a second, independently built frontend attesting to the same typed data &mdash; so no single origin&apos;s word is required at all. Until then, the two checks under <Link href="/faq#signing" className="text-ink-heading font-medium hover:underline">signing, on the FAQ</Link> are the check, and the limitation stated there stands as written.
                </p>
            </MarketingSection>

            <MarketingSection title="The verification stack" sectionId="verification">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    What is in place today is a verification stack &mdash; seven independent benches: six on the protocol&apos;s contracts and one on the equilibrium algebra those contracts enforce &mdash; each from a different angle. Seven, and not one, because each catches a class of defect the others structurally cannot. What each class of check covers and what it structurally cannot reach, for the kernel and its two composition surfaces, and the bounds the kernel&rsquo;s model runs under, are the subject of <Link href="/papers/verified-settlement-kernel" className="text-ink-heading font-medium hover:underline">A Verified Resolution Kernel</Link>; the counts on this page are derived from the tree, and the paper names no tool and states no count:
                </p>
                <ul className="space-y-2 text-base text-ink-body mb-5 ml-6">
                    <li>&mdash; <strong className="text-ink-heading font-medium">Foundry</strong>: the unit + integration suite &mdash; 315 test functions. Class: <em>behavioral and regression</em> &mdash; what a contract does on concrete inputs, and what it stops doing after an edit. It proves nothing about the inputs nobody wrote a test for.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Halmos</strong>: 32 symbolic-execution properties, each proved over every input its bounded call trace admits. Class: <em>the untried input</em> &mdash; within those bounds a property holds for every input at once rather than a sample, so an arithmetic or boundary case no test author imagined cannot hide there.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Certora</strong>: 39 formal rules across six CVL specs &mdash; the kernel, its own token operations, attestation, batch token operations, the florin token, and the RPGF minter. Class: <em>state-transition</em> &mdash; rules quantified over reachable states and arbitrary calls, so a violation returns as a concrete counterexample trace, not a hunch.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">TLA+</strong>: model-checking of four protocol state machines &mdash; the kernel, the florin token, the two resolution paths, and the swap/commit coordinator. Class: <em>temporal and liveness</em> &mdash; ordering, interleaving and races across a whole protocol, and states that can be entered but never left. No per-function bench can see these.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Echidna</strong>: 15 property-based fuzzing targets on the kernel and the florin token. Class: <em>adversarial sequence</em> &mdash; randomized call sequences hunting for an ORDER of operations that breaks an invariant, which is how an attacker actually looks.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Lean 4</strong>: the bonded chain&apos;s equilibrium &mdash; the one derived in <Link href="/papers/asymmetric-bonding" className="text-ink-heading font-medium hover:underline">Asymmetric Bonding and Buyer Dominance</Link> &mdash; proved over the exact payoff table the TLA+ invariants pin to the shipped kernel &mdash; resolving beats withholding after performance, performing beats holding out at every retention a seller could manage, and no unilateral deviation profits at any position of a chain of arbitrary length, with the cumulative accumulator derived rather than assumed. Class: <em>the choosing</em> &mdash; what a rational party does given the numbers, which no model checker can express; dependency-free, so an auditor rebuilds it cold.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Static analysis</strong>: Slither&apos;s 100 detectors and Semgrep&apos;s smart-contract ruleset, over the frozen scope, on every push. Class: <em>the catalogued defect</em> &mdash; vulnerability patterns already known and named, matched in the source without running it, so a reentrant call, an unchecked return value, or a comparison on a block timestamp is flagged before any test runs. It cannot reach anything that needs the mechanism&apos;s meaning &mdash; whether the bond arithmetic is right, or who may resolve. The paper above treats this class in its ladder without naming a tool; every result it returns is triaged one by one in <a href="https://github.com/figaro-protocol/Figaro/blob/main/docs/AUDITOR_HANDOVER.md" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">docs/AUDITOR_HANDOVER.md</a>.</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed">
                    Verification is a precondition for external audit. It is not a substitute for one. The protocol&apos;s position is that an audit should examine a surface that has already been pushed against from this many directions. The current contract inventory and verification map are at <Link href="/spec" className="text-ink-heading font-medium hover:underline">spec</Link>; the full harness inventory &mdash; commands, layers, and what each bench owns &mdash; is <a href="https://github.com/figaro-protocol/Figaro/blob/main/docs/TESTING.md" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">docs/TESTING.md</a> in the repository, and the property-by-property map &mdash; each protocol property beside the Solidity that enforces it, the tests that regression-check it, and the formal layer that proves it &mdash; is <a href="https://github.com/figaro-protocol/Figaro/blob/main/docs/VERIFICATION_MAP.md" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">docs/VERIFICATION_MAP.md</a>. Found a vulnerability? Report it privately &mdash; <a href="https://github.com/figaro-protocol/Figaro/security/advisories/new" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">GitHub private vulnerability reporting</a>, or the alternate channel in <a href="https://github.com/figaro-protocol/Figaro/blob/main/SECURITY.md" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">SECURITY.md</a> &mdash; never a public issue.
                </p>
            </MarketingSection>

        </>
    );
}
