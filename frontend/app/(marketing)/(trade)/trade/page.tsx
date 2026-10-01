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
            </MarketingSection>
        </>
    );
}
