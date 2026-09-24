import type { Metadata } from "next";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { SHIPMENT_CAST, TradeStripFigure } from "@/components/figures/TradeStripFigure";

export const metadata: Metadata = {
    title: "A shipment — Figaro Protocol",
    description:
        "One shipment, start to finish, in the same six pictures as the meal: a warehouse, a haulier, and the buyer; the terms signed before the work, a bond locked by each, the haul, everyone paid at once when the buyer confirms, and the evidence each keeps.",
};

// THE SAME SIX PICTURES WITH ANOTHER CAST: the strip is the meal's, and the
// buyer who never orders a meal one at a time reads it with a warehouse and a
// haulier in the kitchen's and the courier's places. Two numbers, three
// pictograms, captions of three words; nothing else on the page.
export default function ShipmentPage() {
    return (
        <>
            <MarketingHero title="One shipment, start to finish." lead="A container, in six pictures." />

            <MarketingSection>
                <TradeStripFigure idPrefix="shipment-strip" cast={SHIPMENT_CAST} kitchenPayment="1200" courierPayment="300" />
            </MarketingSection>

            <MarketingSection bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed mb-3">
                    The same six pictures carry a meal, a repair, a season of work: what you can trade is{" "}
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
