import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { ClauseInventory } from "./_components/ClauseInventory";

// RULED 2026-08-06 (operator): this page holds FOUR things and nothing else —
// what a clause IS (a contract clause, verifiable; it may include
// attestations but is NOT an attestation), the writing requirements as
// BULLETS (never an exposé), the live inventory, and the add-your-own +
// RPGF invitation with EXACTLY ONE link to the register page.
// Public/private data belongs to /data — the disposition section died here.
// Operator fine-tooth review pending (next session).
export const metadata: Metadata = {
    title: "Clauses — Figaro Protocol",
    description:
        "A clause is what it is in a paper contract — one reusable term of a deal — made verifiable: its spec public and hash-anchored on-chain. The requirements for writing one, the live registry inventory, and the RPGF reward for clauses that get used.",
};

export default function Clauses() {
    return (
        <>
            <MarketingHero
                title="A contract clause, made verifiable."
                lead={
                    <>
                        A clause here is what a clause is in a paper contract: one reusable term a deal is built from &mdash; how a dispute escalates, how emissions get reported, how a delivery address is handled. Contrary to paper clauses, a Figaro clause is verifiable: its spec is a public document, identified by a hash over its own content and anchored on-chain, so what a deal&apos;s terms say can be checked, not asserted. A clause can include attestations &mdash; evidence recorded while the deal runs &mdash; but a clause is not an attestation.
                    </>
                }
            />

            <MarketingSection title="Writing a clause.">
                <ul className="space-y-3 text-sm text-ink-body leading-relaxed list-disc pl-5">
                    <li>One canonical JSON document: <code>clauseId</code>, <code>version</code>, <code>title</code>, <code>description</code>, and the <code>fields</code> the clause carries.</li>
                    <li>It passes the public well-formedness check &mdash; <code>parseClauseSpec</code> from <code>@figaro/sdk/clauses</code>, the same validator the registration form runs.</li>
                    <li>It registers on <code>ClauseRegistry</code> &mdash; permissionless, first-write-wins, permanent per <code>(name, version)</code> &mdash; staking a small reclaimable ETH deposit.</li>
                    <li>Nothing else, ever: a clause is data, not code. No per-clause contract exists, and a registered clause is immediately usable in agreements and settleable.</li>
                </ul>
            </MarketingSection>

            <MarketingSection title="Add your own.">
                <p className="text-sm text-ink-body leading-relaxed">
                    Anyone who meets those requirements can register a clause &mdash; no permission, no gatekeeper: <Link href="/clauses/register" className="underline">Register a clause</Link>. A registered clause that gets used earns from the protocol&apos;s retroactive public-goods funding &mdash; the reward follows real usage alone; see <Link href="/rpgf" className="underline">RPGF</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Registered clauses, by article." bottomPad="wide">
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    The reference set spans assembly topology, commerce primitives, emissions accounting, lifecycle and proximity, sovereign process logs, and legal anchoring. One &mdash; <code>figaro-topology</code> &mdash; is agreement-only: committed at agreement signing, with no on-chain validator.
                </p>
                <p className="text-sm text-ink-muted leading-relaxed mb-6">
                    For agents: this inventory derives from the live <code>ClauseRegistry</code> and can be reconstructed programmatically with <code>reconstructDiscovery()</code> from <code>@figaro/sdk</code> &mdash; see <Link href="/spec" className="underline">/spec</Link> for the deployment record.
                </p>
                <p className="text-sm text-ink-muted leading-relaxed mb-6">
                    There is no static roster of clauses &mdash; the count is derived, never stored. The canonical spec source for the reference set is the <a href="https://github.com/figaro-protocol/Figaro/tree/main/clauses" target="_blank" rel="noopener noreferrer" className="underline"><code>clauses/</code> directory</a> in the repository; on chain, discover every registered clause (reference or third-party) the same way this inventory does &mdash; by reading the <code>ClauseRegistry</code>&apos;s <code>ClauseRegistered</code> event stream.
                </p>
                <ClauseInventory />
            </MarketingSection>

        </>
    );
}
