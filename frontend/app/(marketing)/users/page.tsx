import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Users — Figaro Protocol",
    description:
        "The participation surface — buyer, merchant, operator, auditor, agent — uses the same primitives. A wallet, a signature, a bonded commitment. No platform mediates.",
};

export default function Users() {
    return (
        <>
            <MarketingHero
                title="Trade directly with anyone."
                lead={
                    <>
                        The participation surface &mdash; whether you buy, sell, operate, audit, or build software that does any of those &mdash; uses the same primitives. A wallet. A signature. A bonded commitment. No platform mediates.
                    </>
                }
            />

            <MarketingSection title="The roles.">
                <p className="text-base text-ink-body leading-relaxed mb-6">
                    Roles are descriptive, not gatekept. Every wallet can hold every role, at any time, and any wallet &mdash; human or autonomous &mdash; can switch between them without permission.
                </p>
                <dl className="space-y-5 text-base">
                    <div>
                        <dt className="font-semibold text-ink-heading">Buyer</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">
                            Browse the operator registry, pick a counterparty, place a bonded order. Resolve it when fulfillment completes.
                        </dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-ink-heading">Merchant</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">
                            Receive bonded orders, accept or decline, fulfill, attest delivery.
                        </dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-ink-heading">Operator / seller</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">
                            Register an identity, declare a catalogue, set accepted tokens. Receive orders against your offerings.
                        </dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-ink-heading">Auditor</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">
                            Verify the on-chain evidence of any settled process. Pull the audit bundle, check the merkle proofs against the agreement hash.
                        </dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-ink-heading">Agent</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">
                            Any of the above, but software. The protocol does not distinguish; bonding and signatures do the same work for an autonomous agent that they do for a human.
                        </dd>
                    </div>
                </dl>
            </MarketingSection>

            <MarketingSection title="Where to start." bottomPad="wide">
                <ul className="space-y-3 text-base">
                    <li>
                        <Link href="/discover" className="text-ink-heading font-medium hover:underline">Discover</Link>
                        <span className="text-ink-body"> &mdash; browse the operators currently on the registry. The starting point for buyers.</span>
                    </li>
                    <li>
                        <Link href="/operators" className="text-ink-heading font-medium hover:underline">Operators</Link>
                        <span className="text-ink-body"> &mdash; register your own catalogue, declare your identity and accepted tokens.</span>
                    </li>
                    <li>
                        <Link href="/audit" className="text-ink-heading font-medium hover:underline">Audit</Link>
                        <span className="text-ink-body"> &mdash; verify the on-chain evidence of any process.</span>
                    </li>
                    <li>
                        <Link href="/builders/agents" className="text-ink-heading font-medium hover:underline">Agents</Link>
                        <span className="text-ink-body"> &mdash; how autonomous agents participate through the same primitives.</span>
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}
