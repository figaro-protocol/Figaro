import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Users — Figaro Protocol",
    description:
        "Two paths into the protocol: buy something, or offer something. The kernel knows exactly two roles — buyer and seller — and the participation surface mirrors that.",
};

export default function Users() {
    return (
        <>
            <MarketingHero
                title="Trade directly with anyone."
                lead={
                    <>
                        Order dinner from a kitchen you have never dealt with, or be the kitchen taking the order. Those are the only two positions there are &mdash; whoever pays, and whoever gets paid. The kernel knows no third role, and there is no account in between to be approved for or closed.
                    </>
                }
            />

            <MarketingSection title="First, a wallet.">
                <p className="text-base text-ink-body leading-relaxed">
                    Before any of this, you need a wallet &mdash; an app that holds digital money and signs for you, the way a banking app holds a balance, except no bank runs it and you alone hold the key. You move ordinary money into it once, and inside the wallet your dollars become digital dollars &mdash; stablecoins, tokens that hold a fixed value against a currency you already know. From then on, a deal moves those. This step happens entirely in your wallet, before Figaro is involved at all: Figaro never touches your bank or your card &mdash; it only ever sees the wallet that signs.
                </p>
            </MarketingSection>

            <MarketingSection title="Two paths.">
                <p className="text-base text-ink-body leading-relaxed mb-8">
                    The network is early &mdash; pre-launch &mdash; and the registry fills as sellers join. What follows is how each side works once you are on it.
                </p>
                <div className="space-y-10">
                    <div>
                        <h3 className="text-heading-h3 text-ink-heading">Discover</h3>
                        <p className="text-base text-ink-body leading-relaxed mt-2 mb-4">
                            Browse the sellers on the registry and order from one &mdash; a kitchen two streets away, a tailor, whoever is offering what you want. When you place the order you lock twice what you are paying: the payment itself, plus a stake of your own. Until you confirm the order arrived, nobody can reach any of it &mdash; not the seller, and not you. When you confirm, your stake comes home and the seller is paid. You hold the buyer role; the seller is whoever you transact with.
                        </p>
                        <Link href="/discover" className="text-ink-heading font-medium hover:underline">
                            Open the registry &rarr;
                        </Link>
                    </div>
                    <div>
                        <h3 className="text-heading-h3 text-ink-heading">Join as a seller</h3>
                        <p className="text-base text-ink-body leading-relaxed mt-2 mb-4">
                            Register an identity, declare a catalogue, set accepted tokens. As a seller you run a wallet that represents your real-world asset or service &mdash; a kitchen, a vehicle, your labour. Buyers find you through the registry; the wallet takes the seller role on every deal that comes through. Accepting an order means locking a stake of your own: twice the value the deal carries by the time it reaches you &mdash; your own work plus everything added upstream of it, so a courier at the end of a chain stakes against the whole meal, not just the ride. It comes back, with your payment, when the buyer confirms.
                        </p>
                        <Link href="/sellers" className="text-ink-heading font-medium hover:underline">
                            Seller onboarding &rarr;
                        </Link>
                    </div>
                </div>
            </MarketingSection>

            <MarketingSection title="What it costs.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    No platform stands between you and the seller taking a percentage &mdash; the seller keeps the whole price, because there is no company in the middle to pay and Figaro charges no fee. The only money that leaves your hands for good is the network&apos;s own charge for running the transactions &mdash; the gas fee, small and per-step, that any activity on Ethereum pays &mdash; and it goes to the network, not to Figaro, which has no one to collect one. Your stake is the third piece, and it is not a cost at all: it is locked from the moment you order until you confirm, and then it comes home in full.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The stake is the mechanism, so it is worth being plain about what it ties up. To buy a thirty-dollar dinner you need sixty dollars free: the thirty you are paying, and thirty more staked behind it. That money is not spent &mdash; it is locked for the life of the deal, which for dinner is the length of one evening, and it returns in full the moment you confirm. Every honest deal gives the stake back; only walking away forfeits it. The doubled stake is precisely what buys you a deal with no platform in the middle and no cut taken out. Sellers and couriers live the same reality from their side: a courier who stakes against the whole meal has that capital tied up until the buyer confirms, which is a real working-capital cost of taking the work. The stake is twice the value on every side, always &mdash; it is the price of needing no one&apos;s permission and no one&apos;s trust.
                </p>
            </MarketingSection>

            <MarketingSection title="Before you commit.">
                <p className="text-base text-ink-body leading-relaxed">
                    Two questions sit under both paths: who holds the money while a deal is open, and what happens if the other party defects? The short answers are <em>no one</em> and <em>the defector loses more than the honest party, every time</em> &mdash; bonded against the kernel directly, no custodian, no escrow account. The longer answers, with every honest caveat, are at <Link href="/security" className="text-ink-heading font-medium hover:underline">security</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Or run an agent." bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    Either path can be driven by software instead of a person. A buyer wallet or a seller wallet can be a script, an LLM, or a long-running service &mdash; the kernel does not distinguish. Same signatures, same bonds, same resolution.
                </p>
                <Link href="/agents" className="text-ink-heading font-medium hover:underline">
                    Agents &rarr;
                </Link>
            </MarketingSection>
        </>
    );
}
