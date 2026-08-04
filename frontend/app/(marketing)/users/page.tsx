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
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    First you need a wallet: an app that holds digital tokens and signs for you &mdash; like a banking app, except no bank runs it and you alone hold the key. Figaro runs on Ethereum, so a wallet ready to trade here holds two things, both in Ethereum&apos;s own currencies: a stablecoin the seller accepts &mdash; a dollar-pegged stablecoin, the kind your wallet already lists, one token roughly equal to one dollar, so thirty tokens today (about $30) is worth about the same as thirty tokens next week &mdash; for the deal itself, and a small amount of ETH, Ethereum&apos;s own currency, to pay the network&apos;s own running charge on every step (the gas fee, covered under &ldquo;What it costs&rdquo; below). Most wallet apps sell you both directly in the app, card or bank transfer in; if yours does not, any exchange that lists them will, and you send the tokens on to your wallet address from there. Either way, this step happens with real money, once, before Figaro is involved at all &mdash; Figaro never touches your bank or your card, it only ever sees the wallet that signs, already holding tokens you bought with it.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Do one thing before your first order, not after: back up your key and turn on your wallet&apos;s recovery path while nothing is at stake yet. Skipping this can cost your stake permanently &mdash; a lost key locks your bonds with no way for Figaro or anyone else to restore them, so see <Link href="/security" className="text-ink-heading font-medium hover:underline">security</Link> for how.
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
                            Browse the sellers on the registry and order from one &mdash; a kitchen two streets away, a tailor, whoever is offering what you want. When you place the order you lock twice what you are paying: the payment itself, plus a stake of your own. Until you confirm the order arrived, nobody can reach any of it &mdash; not the seller, and not you. When you confirm, your stake comes home and the seller is paid. You hold the buyer role; the seller is whoever you transact with. With no platform handing out stars, you weigh a seller by the record instead: every wallet&apos;s settlement history is public and permanent &mdash; imagine a kitchen that has closed four hundred deals: that whole history carries on chain for anyone to read, never a score Figaro keeps or can nudge. That public record is only half the picture &mdash; see <Link href="/data" className="text-ink-heading font-medium hover:underline">your records, your terms</Link> for the private half, and how you can sell access to it on your own terms.
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
                    No platform stands between you and the seller taking a percentage &mdash; the seller keeps the whole price, because there is no company in the middle to pay and Figaro charges no fee. The only payment that leaves your hands for good is the network&apos;s own charge for running the transactions &mdash; the gas fee, small and per-step, that any activity on Ethereum pays &mdash; and it goes to the network, not to Figaro, which has no one to collect one. Your stake is the third piece, and it is not a cost at all: it is locked from the moment you order until you confirm, and then it comes home in full. Value that is spent is gone and value that is invested is at work; a stake is neither &mdash; it waits, and comes home.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    That doubling is the whole mechanism, not a fee in disguise &mdash; the full derivation of why 2&times; and not some smaller margin is worked through on <Link href="/protocol" className="text-ink-heading font-medium hover:underline">Protocol</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The same 2&times; rule holds at any size. Buying an instrument worth 2,000 tokens &mdash; about $2,000, since these deals typically settle in dollar-pegged stablecoins &mdash; works exactly like buying dinner: you lock 4,000 tokens (the 2,000 you are paying, plus 2,000 of your own), the seller locks 4,000 against the value they are adding, and neither side can touch any of it until you confirm. If the seller vanishes, your 4,000 stay locked and you eat that loss &mdash; but the seller forfeits 4,000 for good, double what they walked away from. If it ever needs a court, the same rule from above applies: the judgment collects from the loser&apos;s other holdings, and the on-chain record is already there to make the case.
                </p>
            </MarketingSection>

            <MarketingSection title="Before you commit.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Two questions sit under both paths: who holds the tokens while a deal is open, and what happens if the other party defects? The short answers are <em>no one</em> and <em>the defector loses more than the honest party, every time</em> &mdash; bonded against the kernel directly, no custodian, no escrow account. If it ever does need a court, the judgment collects the ordinary way &mdash; from the loser&apos;s other holdings, not this locked stake. Every deal&apos;s full record is publicly checkable at <Link href="/audit" className="text-ink-heading font-medium hover:underline">audit</Link>, so there is nothing to reconstruct. The longer answers, with every honest caveat, are at <Link href="/security" className="text-ink-heading font-medium hover:underline">security</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    A third question: what does changing your mind cost? Nothing, up to a point. Signing an order and locking a stake are two different steps &mdash; your signature says what you would agree to, but no tokens move until your signature and the other side&apos;s are both submitted together, in the single transaction that locks both stakes at once. Until the seller has also signed and that transaction lands, you can walk away for free, because no stake was ever locked to begin with. From the moment that transaction confirms, you are committed and the rules above apply. That boundary is also the edge of what this mechanism can promise: it assumes you understood what you signed and were acting freely, not under duress. What it assumes about the people using it, and what it does not protect against, is stated in full at <Link href="/consequences" className="text-ink-heading font-medium hover:underline">consequences</Link>.
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
