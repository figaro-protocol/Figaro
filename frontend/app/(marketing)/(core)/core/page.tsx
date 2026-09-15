import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { CtaLink } from "@/components/marketing/CtaLink";

export const metadata: Metadata = withOg({
    title: "Core — Figaro Protocol",
    description:
        "Four smart contracts, decentralized and permissionless: FigaroCore, CommitmentTypes, AttestationCoordinator, and FigaroBatchVerifier. Mechanism design enforces the agreement between strangers: cooperation is each party's best move. The contracts are proven and checked on every commit.",
});

// THE CORE LANDING — three subjects and nothing else: the four contracts,
// mechanism design, and security. Its shape is the home page's: the tagline,
// the one button, the three subjects as bullets, then the same three as cards,
// each its paragraph and the one button that opens its page. No process
// walk-through, no gas, no bond arithmetic, no roles: those are how, and they
// live on the pages the cards open. A comprehension gap found by any tester is
// closed on the page a card points to, never by adding prose here. The
// outside-audit caveat is a footnote at the foot of the page, never a headline.
const SUBJECTS: { line: string; body: string; cta: string; href: string }[] = [
    {
        line: "Four smart contracts, decentralized and permissionless: FigaroCore, CommitmentTypes, AttestationCoordinator, and FigaroBatchVerifier.",
        body: "FigaroCore holds every bond and resolves a process. CommitmentTypes defines the commitment each party signs. AttestationCoordinator binds what a party attests to the agreement it signed. FigaroBatchVerifier accepts a validity proof of many processes in one transaction. The first two are the kernel, and the kernel is frozen.",
        cta: "The spec",
        href: "/spec",
    },
    {
        line: "Mechanism design enforces the agreement between strangers: cooperation is each party's best move.",
        body: "Each party bonds before the trade, and the bonds are sized so that keeping the agreement is worth more to each party than breaking it. Only the buyer resolves, and resolution pays every seller and refunds every bond at once. Cooperation is the equilibrium of that game, and the equilibrium is proved.",
        cta: "The six invariants",
        href: "/invariants",
    },
    {
        line: "The contracts are proven and checked on every commit.",
        body: "The equilibrium is machine-checked in Lean 4. The contracts are checked on every commit by Foundry, Halmos, Certora, TLA+, Echidna, and static analysis. The kernel is frozen.",
        cta: "Security",
        href: "/security",
    },
];

export default function CoreDoor() {
    return (
        <>
            <MarketingHero title="Figaro Core: four smart contracts, secured by mechanism design">
                <div className="flex flex-wrap gap-4 mb-8">
                    <CtaLink href="/spec">Read the spec</CtaLink>
                </div>
                <ul className="text-body-lead text-ink-muted max-w-2xl list-disc pl-6 space-y-2">
                    {SUBJECTS.map((s) => (
                        <li key={s.href}>{s.line}</li>
                    ))}
                </ul>
            </MarketingHero>

            <section className="container mx-auto px-6 pb-20 max-w-3xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-10 border-t border-default pt-10">
                    {SUBJECTS.map((s) => (
                        <div key={s.href} className="flex flex-col">
                            <h2 className="text-heading-h3 text-ink-heading mb-2">{s.line}</h2>
                            <p className="text-base text-ink-body leading-relaxed grow">{s.body}</p>
                            <div className="mt-4">
                                <CtaLink href={s.href}>{s.cta}</CtaLink>
                            </div>
                        </div>
                    ))}
                </div>
                <p className="mt-12 border-t border-default pt-8 text-sm text-ink-muted leading-relaxed max-w-2xl">
                    Not yet audited by an outside firm.
                </p>
            </section>
        </>
    );
}
