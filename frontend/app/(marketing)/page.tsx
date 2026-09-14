import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { CtaLink } from "@/components/marketing/CtaLink";
import { ProcessStarFigure } from "@/components/figures/ProcessStarFigure";

export const metadata: Metadata = withOg({
    title: "Figaro Protocol",
    description:
        "Figaro is a decentralized, permissionless ERP: a value-added process that lasts one trade. Trade with anyone, anywhere, in any token. Be paid in full when the trade closes. Set your own agreements, and keep your own books.",
});

// HOME IS A ROUTER, NEVER A DOCUMENT: the opening sentence — WHAT Figaro is,
// in the layman's nearest category and its differentiator, with no word from
// the mechanism — the four benefits under it, each benefit again as the heading
// of its own short paragraph, the six doors — one per landing page, one door
// per destination — and the seven checks the code passes on every commit. Each door's line is in its reader's words; the landing page it
// opens carries the pillar. A comprehension gap found by any probe is closed
// on the landing page or its owner page, never by adding prose here. The
// tagline belongs to the use home, never here.
//
// THE OPENING SENTENCE, THE BENEFITS, AND THEIR PARAGRAPHS are the maintainer's,
// word for word. "Most ERC-20 tokens": a token that changes value in transit —
// fee-on-transfer, rebasing — is outside; the trader's token list never names
// the florin (it is named only where the reward is the subject).
// THE SEVEN CHECKS, each with the count the tree derives — the security-counts
// guard recomputes the four counted benches and fails the commit when a
// number here drifts; TLA+ names models, Lean 4 names the result proved, and
// static analysis names the tools the workflow pins.
// What the protocol composes with, each mark from the project's own brand
// assets, unaltered, linking to the project. Rendered inside the compose
// card; never a door itself.
const COMPOSES_WITH: { name: string; href: string; src: string }[] = [
    { name: "Ethereum", href: "https://ethereum.org", src: "/built-with/ethereum.svg" },
    { name: "IPFS", href: "https://ipfs.tech", src: "/built-with/ipfs.svg" },
    { name: "Uniswap", href: "https://uniswap.org", src: "/built-with/uniswap.svg" },
    { name: "XMTP", href: "https://xmtp.org", src: "/built-with/xmtp.svg" },
    { name: "Disperse", href: "https://disperse.app", src: "/built-with/disperse.png" },
    { name: "Kleros", href: "https://kleros.io", src: "/built-with/kleros.svg" },
    { name: "Succinct", href: "https://succinct.xyz", src: "/built-with/succinct.svg" },
];

// THE FIVE BENEFITS, each a door: its line is the bullet under the opening
// sentence and the heading of its card; its button opens the landing page.
const BENEFITS: { line: string; body: string; cta: string; href: string }[] = [
    {
        line: "Trade with anyone, anywhere, in any token.",
        body: "Anyone with a wallet can trade: a person, a shop, a plant, a piece of software, someone you know or someone you have never met. The token is yours to choose: your community's, a stablecoin, a memecoin, a resource token,\u2026 most ERC-20 tokens. A wallet is all it takes.",
        cta: "Use it",
        href: "/use",
    },
    {
        line: "Be paid in full when the trade closes.",
        body: "Before the trade, each side locks a bond in the same token large enough, so keeping the deal is worth more to each of them than breaking it. When the buyer closes, every seller in the process is paid the whole payment and every bond is refunded, all at once.",
        cta: "Check the core",
        href: "/core",
    },
    {
        line: "Set your own agreements, and keep your own books.",
        body: "An agreement is written in plain words and signed by both sides before the trade; what is delivered and attested during the process is signed too. Everything the trade leaves is its verifiable audit trail, yours in detail and public only in aggregate. A court or a forum, if it comes to that, rules on that same data afterward. Your data is yours to keep, or to sell, if you want.",
        cta: "Read the data",
        href: "/data",
    },
    {
        line: "Write agreements, and compose them with other contracts.",
        body: "Anyone can publish the agreements of a trade, a single term or a whole assembly of them, to a public registry, for any seller to adopt. An agreement composes with any other contract on the network: a forum, a payment splitter, a swap. Every trade that uses them rewards the author in Figaro's florin token.",
        cta: "Build on it",
        href: "/build",
    },
    {
        line: "Run an agent on the same terms as a person.",
        body: "Software trades, publishes, and resolves with the same wallet, the same bond, and the same registries as a person. Humans and agents are treated the same.",
        cta: "Run an agent",
        href: "/agents",
    },
];

const CHECKS: { name: string; count: string }[] = [
    { name: "Foundry", count: "319 test functions" },
    { name: "Halmos", count: "32 symbolic-execution properties" },
    { name: "Certora", count: "39 formal rules across six CVL specs" },
    { name: "TLA+", count: "four protocol state machines, model-checked" },
    { name: "Echidna", count: "15 property-based fuzzing targets" },
    { name: "Lean 4", count: "the bonded chain\u2019s equilibrium, proved" },
    { name: "Static analysis", count: "100 Slither detectors and Semgrep\u2019s smart-contract rules" },
];

export default function Home() {
    return (
        <>
            <MarketingHero title="Figaro is a decentralized, permissionless ERP: a value-added process that lasts one trade.">
                <div className="flex flex-wrap gap-4 mb-8">
                    <CtaLink href="/use">Use it</CtaLink>
                    <CtaLink href="/build">Build on it</CtaLink>
                </div>
                <ul className="text-body-lead text-ink-muted max-w-2xl list-disc pl-6 space-y-2">
                    {BENEFITS.map((b) => (
                        <li key={b.href}>{b.line}</li>
                    ))}
                </ul>
            </MarketingHero>

            <section className="container mx-auto px-6 pb-20 max-w-3xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-10 border-t border-default pt-10">
                    {BENEFITS.map((b) => (
                        <div key={b.href} className="flex flex-col">
                            <h2 className="text-heading-h3 text-ink-heading mb-2">{b.line}</h2>
                            {b.href === "/use" && <ProcessStarFigure className="max-w-xs mb-4" />}
                            <p className="text-base text-ink-body leading-relaxed grow">{b.body}</p>
                            {b.href === "/build" && (
                                <div className="mt-4" data-testid="built-with">
                                    <p className="text-sm text-ink-muted mb-3">Composes with</p>
                                    <ul className="flex flex-wrap items-center gap-x-6 gap-y-3">
                                        {COMPOSES_WITH.map((c) => (
                                            <li key={c.name}>
                                                <a href={c.href} target="_blank" rel="noopener noreferrer" title={c.name} className="flex items-center gap-2 text-sm text-ink-body hover:text-ink-heading">
                                                    {/* eslint-disable-next-line @next/next/no-img-element -- a static export; the marks are local files */}
                                                    <img src={c.src} alt={c.name} width={20} height={20} className="h-5 w-5 object-contain" />
                                                    <span>{c.name}</span>
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            <div className="mt-4">
                                <CtaLink href={b.href}>{b.cta}</CtaLink>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-12 border-t border-default pt-8">
                    <p className="text-sm text-ink-muted leading-relaxed max-w-2xl mb-4">
                        The code is not yet audited by an outside firm. It is checked seven independent ways on every commit:
                    </p>
                    <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-3 text-sm">
                        {CHECKS.map((c) => (
                            <div key={c.name}>
                                <dt className="text-ink-heading font-medium">{c.name}</dt>
                                <dd className="text-ink-muted">{c.count}</dd>
                            </div>
                        ))}
                    </dl>
                    <p className="text-sm text-ink-muted leading-relaxed mt-4">
                        What each check covers:{" "}
                        <Link href="/security" className="text-ink-heading font-medium hover:underline">
                            Security
                        </Link>
                        .
                    </p>
                </div>
            </section>
        </>
    );
}
