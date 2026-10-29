import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { TradeStripFigure } from "@/components/figures/TradeStripFigure";

export const metadata: Metadata = withOg({
    title: "Trade — Figaro Protocol",
    description:
        "One trade, start to finish, in six pictures: three strangers, the terms signed before the work, a bond locked by each, the work, everyone paid at once when the buyer confirms, and the evidence each keeps. Any trade, of any kind.",
});

// THE TRADE DOOR IS A STRIP OF PICTURES: a layman follows it without reading,
// so words appear only as captions of at most three each, and the only text a
// reader must parse is two numbers. The strip is generic by rule: two sellers
// and a buyer, drawn as wallets and a person, never as a kind of trade — no
// trade is the model, and the same six pictures carry every published
// assembly. What each padlock adds up to is `StackedBondChainFigure`'s, on the
// mechanism page; what stands behind a trade, layer by layer, is the FAQ's.
export default function TradePage() {
    return (
        <>
            <MarketingHero title="One trade, start to finish." lead="Any trade, in six pictures." />

            <MarketingSection>
                <TradeStripFigure />
            </MarketingSection>

            <MarketingSection title="When several sellers can do the job.">
                <p className="text-base text-ink-body leading-relaxed mb-3">
                    Say a shipment needs a truck to the port, and the assembly leaves that leg open. The buyer can ask every trucker that has bound the assembly and posts a price for the leg, all at once. Each trucker receives a draft of the order at its own posted price, with no signature on it, so whoever carries the draft can commit nothing with it.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-3">
                    A trucker that can take the leg counter-signs its draft, which holds it to that one order, at that price, until the draft&apos;s deadline. When the window the buyer set closes, the cheapest counter-signature is picked, and the buyer may pick any other reply instead. The buyer signs one, and that trucker&apos;s bond is locked at commit like any seller&apos;s; if its wallet cannot fund the bond, the commit fails and the buyer can sign the next reply. Every draft the buyer never signs expires at its deadline and binds nobody.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-3">
                    Where no posted price fits the job, the buyer asks for quotes instead: each trucker names its price under a ceiling the buyer sets, a quote can change the price and nothing else, and the cheapest verified quote is picked the same way.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Why asking several sellers at once binds the buyer to one order only is in{" "}
                    <Link href="/papers/markets-without-a-venue" className="text-ink-heading font-medium hover:underline">
                        Markets Without a Venue
                    </Link>
                    .
                </p>
            </MarketingSection>

            <MarketingSection bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed mb-3">
                    The same six pictures carry a repair at the door, a freight leg across an ocean, a season of work, a survey flight: what you can trade is{" "}
                    <Link href="/communities" className="text-ink-heading font-medium hover:underline">
                        every published assembly
                    </Link>
                    .
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    What stands behind a trade, layer by layer, with the gas, the tokens, and the tax, is on{" "}
                    <Link href="/core/faq#layers" className="text-ink-heading font-medium hover:underline">
                        the FAQ
                    </Link>
                    .
                </p>
                <p className="text-base text-ink-body leading-relaxed mt-3">
                    To order, start at{" "}
                    <Link href="/discover" className="text-ink-heading font-medium hover:underline">
                        Discover
                    </Link>
                    ; to sell, at{" "}
                    <Link href="/members" className="text-ink-heading font-medium hover:underline">
                        Join
                    </Link>
                    .
                </p>
            </MarketingSection>
        </>
    );
}
