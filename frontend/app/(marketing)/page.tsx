import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";

export const metadata: Metadata = {
    title: "Figaro Protocol",
    description:
        "Cryptoeconomics for trade. Any two parties can transact directly, anywhere, without trusting each other and without an arbitrator, platform, bank, or court in between.",
};

export default function Home() {
    return (
        <>
            <MarketingHero
                title="Any two parties can transact directly, anywhere."
                lead={
                    <>
                        Without trusting each other. Without an arbitrator, platform, bank, or court in between.
                    </>
                }
            >
                <p className="text-base text-ink-body leading-relaxed mt-8 mb-5">
                    Both sides lock a deposit larger than the deal into a program that holds the deposits and follows one fixed rule for releasing them. Honor the deal and each side recovers its stake. Cheat and both forfeit. Because cheating costs more than it can win, cooperation is the dominant strategy by structural means.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Nobody runs the program. There is no company behind it and no account that can be closed. It is shared infrastructure, the way the internet is. Cryptoeconomics for trade.
                </p>
            </MarketingHero>

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-default pt-xl">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <Link href="/protocol" className="group block">
                        <h2 className="text-heading-h3 text-ink-heading group-hover:underline">Protocol</h2>
                        <p className="text-sm text-ink-muted mt-2 leading-relaxed">
                            The substrate &mdash; the kernel, the math, the specification.
                        </p>
                    </Link>
                    <Link href="/builders" className="group block">
                        <h2 className="text-heading-h3 text-ink-heading group-hover:underline">Builders</h2>
                        <p className="text-sm text-ink-muted mt-2 leading-relaxed">
                            Schemas, assemblies, tokens, agents &mdash; what you can build on the substrate.
                        </p>
                    </Link>
                    <Link href="/discover" className="group block">
                        <h2 className="text-heading-h3 text-ink-heading group-hover:underline">Users</h2>
                        <p className="text-sm text-ink-muted mt-2 leading-relaxed">
                            Discover operators and transact through bonded processes.
                        </p>
                    </Link>
                </div>
            </section>
        </>
    );
}
