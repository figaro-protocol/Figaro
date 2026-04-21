import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";

export default function Onboarding() {
    return (
        <>
            <Header />
            <main className="min-h-screen home-muji flex flex-col items-center pt-16 pb-24 px-4">
                {/* Minimalist Hero */}
                <section className="muji-hero flex flex-col items-center mb-10">
                    <span className="flex justify-center mb-6">
                        <svg width="64" height="64" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <circle cx="36" cy="36" r="34" stroke="#b3b3a8" strokeWidth="2" fill="#f5f5f2" />
                            <circle cx="36" cy="36" r="18" stroke="#b3b3a8" strokeWidth="1.5" fill="none" />
                            <path d="M36 18 L36 36 L54 36" stroke="#222" strokeWidth="2" strokeLinecap="round" />
                            <circle cx="36" cy="18" r="2.5" fill="#222" />
                            <circle cx="54" cy="36" r="2.5" fill="#222" />
                            <circle cx="36" cy="36" r="2.5" fill="#222" />
                        </svg>
                    </span>
                    <h1 className="text-4xl sm:text-5xl font-bold mb-4 text-center">Welcome to Figaro</h1>
                    <p className="text-lg max-w-2xl text-center mb-4 text-gray-700">
                        Figaro is a protocol primitive for trade between strangers. Both parties lock stakes before work begins. Breaking the agreement always costs more than keeping it. This guide will help you understand the basics and get started.
                    </p>
                </section>

                {/* Step 1: What is a Bonded Commitment? */}
                <section className="muji-section w-full max-w-2xl mb-8">
                    <h2 className="text-2xl font-semibold mb-2">1. What is a Bonded Commitment?</h2>
                    <p className="text-base text-gray-700 mb-2">
                        A Bonded Commitment is a mathematically enforced agreement—cheating always costs more than cooperating. Both parties lock collateral on-chain, making cooperation the dominant strategy.
                    </p>
                </section>

                {/* Step 2: How does Figaro enable sovereign coordination? */}
                <section className="muji-section w-full max-w-2xl mb-8">
                    <h2 className="text-2xl font-semibold mb-2">2. Sovereign Coordination</h2>
                    <p className="text-base text-gray-700 mb-2">
                        Figaro enables direct, self-enforcing agreements between independent value-adders—no intermediaries, no admin, no platform tax. Every participant is sovereign.
                    </p>
                </section>

                {/* Step 3: Try the Protocol or Build an Institution */}
                <section className="muji-section w-full max-w-2xl mb-10">
                    <h2 className="text-2xl font-semibold mb-2">3. Try the Protocol or Build</h2>
                    <ul className="list-disc pl-6 mb-4 text-gray-700">
                        <li>Try the protocol directly: <a href="/figaro-eats" className="text-blue-700 underline hover:text-blue-900">Figaro Eats</a></li>
                        <li>Explore the <a href="/builders" className="text-blue-700 underline hover:text-blue-900">Builder Studio</a> to assemble your own institution</li>
                    </ul>
                </section>

                {/* Help and Docs Links */}
                <div className="muji-links flex flex-col sm:flex-row gap-4 items-center justify-center">
                    <a href="/help" className="px-5 py-2 bg-gray-100 text-gray-800 rounded-lg border border-gray-300 hover:bg-gray-200 transition-colors">Help & FAQ</a>
                    <a href="/builders" className="px-5 py-2 bg-gray-100 text-gray-800 rounded-lg border border-gray-300 hover:bg-gray-200 transition-colors">Builders</a>
                </div>
            </main>
            <Footer />
        </>
    );
}
