import type { Metadata } from "next";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { TradeStripFigure } from "@/components/figures/TradeStripFigure";

export const metadata: Metadata = {
    title: "Trade — Figaro Protocol",
    description:
        "One trade, start to finish, in six pictures: three strangers, the terms signed before the work, a bond locked by each, the work, everyone paid at once when the buyer closes, and the evidence each keeps. A delivered meal, one example among unbounded kinds of trade.",
};

// THE EXAMPLE PAGE IS A STRIP OF PICTURES: a
// layman follows it without reading, so words appear only as captions of at
// most three each, and the only text a reader must parse is two numbers. The
// meal is ONE example among unbounded kinds of trade, never the model; the
// same six pictures carry any trade where something is made, carried and
// confirmed. What each padlock adds up to is `StackedBondChainFigure`'s, on
// the kernel page; what stands behind a trade, layer by layer, is the FAQ's.
export default function LocalCommercePage() {
    return (
        <>
            <MarketingHero title="One trade, start to finish." lead="A meal, in six pictures." />

            <MarketingSection>
                <TradeStripFigure />
            </MarketingSection>

            <MarketingSection bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed mb-3">
                    The same six pictures carry a bookshop order, a tailor&apos;s alteration, a plumber&apos;s house call: what you can trade is{" "}
                    <Link href="/communities" className="text-ink-heading font-medium hover:underline">
                        every published assembly
                    </Link>
                    .
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    What stands behind a trade, layer by layer, with the gas, the tokens, and the tax, is on{" "}
                    <Link href="/faq#layers" className="text-ink-heading font-medium hover:underline">
                        the FAQ
                    </Link>
                    .
                </p>
            </MarketingSection>
        </>
    );
}
