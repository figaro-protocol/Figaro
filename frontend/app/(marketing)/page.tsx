import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { ReadButton } from "@/components/shared/ReadButton";
import { BuildButton } from "@/components/shared/BuildButton";
import { DiscoverButton } from "@/components/shared/DiscoverButton";

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
                    Both sides &mdash; each holding a wallet &mdash; lock a token deposit larger than the deal into a program that holds the deposits and follows one fixed rule for releasing them. Honor the deal and each side recovers its stake. Cheat and both forfeit. Because cheating costs more than it can win, cooperation is the dominant strategy by structural means.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Nobody runs the program. There is no company behind it and no account that can be closed. It is shared infrastructure, the way the internet is. Cryptoeconomics for trade.
                </p>
                <p className="text-sm text-ink-muted italic mt-6">
                    <Link href="/why" className="hover:underline">
                        Why this exists &rarr;
                    </Link>
                </p>
            </MarketingHero>

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-default pt-xl">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="text-center flex flex-col">
                        <h2 className="text-heading-h3 text-ink-heading">Protocol</h2>
                        <p className="text-sm text-ink-muted mt-2 mb-5 leading-relaxed">
                            The substrate &mdash; the kernel, the math, the specification.
                        </p>
                        <div className="mt-auto">
                            <ReadButton className="inline-flex min-w-[160px] justify-center" />
                        </div>
                    </div>
                    <div className="text-center flex flex-col">
                        <h2 className="text-heading-h3 text-ink-heading">Builders</h2>
                        <p className="text-sm text-ink-muted mt-2 mb-5 leading-relaxed">
                            Schemas, assemblies, tokens, agents &mdash; what you can build on the substrate.
                        </p>
                        <div className="mt-auto">
                            <BuildButton className="inline-flex min-w-[160px] justify-center" />
                        </div>
                    </div>
                    <div className="text-center flex flex-col">
                        <h2 className="text-heading-h3 text-ink-heading">Users</h2>
                        <p className="text-sm text-ink-muted mt-2 mb-5 leading-relaxed">
                            Buyers, merchants, sellers, auditors, agents &mdash; how to participate.
                        </p>
                        <div className="mt-auto">
                            <DiscoverButton className="inline-flex min-w-[160px] justify-center" />
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}
