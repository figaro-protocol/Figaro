import Link from "next/link";

export default function Home() {
    return (
        <section className="container mx-auto px-6 pt-24 pb-16 max-w-2xl">
            <h1 className="text-heading-h1 text-ink-heading mb-6">
                Bonded trade between strangers.
            </h1>
            <p className="text-body-lead text-ink-body mb-4">
                Figaro is a coordination protocol &mdash; the factotum of the
                network &mdash; that lets parties who have never met settle a
                deal with mathematical certainty that cooperation pays better
                than cheating. Each side bonds more than its share is worth;
                the protocol holds the bonds; the deal resolves itself.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-8">
                A shipper in Lagos, an ocean carrier, a port operator in
                Rotterdam, and a regional trucker &mdash; none of whom share a
                parent company &mdash; compose one container&apos;s transit as a
                single bonded process. If any party defects, every bond is at
                risk. If all of them deliver, every bond is returned and payment
                flows. No platform sits between them. No arbitrator decides for
                them.
            </p>
        </section>
    );
}
