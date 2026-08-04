import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { LabelledListRow } from "@/components/shared/LabelledListRow";
import { Breadcrumb } from "@/components/shared/Breadcrumb";

export const metadata: Metadata = {
    title: "Sharp edges — Figaro Protocol",
    description:
        "The one canonical footguns page: six documented traps, organized by when each one bites — writing a clause spec, building a commit, or reading settled state — each with a one-paragraph summary and a link to its full, canonical explanation.",
};

export default function Pitfalls() {
    return (
        <>
            <div className="container mx-auto px-6 pt-8">
                <Breadcrumb
                    items={[
                        { label: "Builders", href: "/builders" },
                        { label: "Sharp edges" },
                    ]}
                />
            </div>
            <MarketingHero
                title="Sharp edges."
                lead={
                    <>
                        Six documented traps, in the order you can hit them: writing a clause spec, building a commit or a checkout, then reading settled state back. Each entry below is a one-paragraph summary &mdash; the full, canonical explanation lives where it was first written, and this page links to it rather than forking it.
                    </>
                }
            />

            <MarketingSection title="Spec-authoring — before you register.">
                <ul className="space-y-6">
                    <LabelledListRow label="Reserved article names" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">Two <code>block.design.article</code> values are reserved, and picking one by accident is silent.</strong> Your clause&apos;s <code>article</code> is free text &mdash; the group it shows up under in the designer &mdash; except for two words the SDK reads specially. <code>&quot;mandatory&quot;</code> auto-folds the clause into <em>every</em> template agreement; <code>&quot;attestations&quot;</code> makes it a process log whose content commits empty at signing and fills later, by attestation. Nothing warns you and nothing throws &mdash; an attestation clause grouped, reasonably, under &ldquo;attestations&rdquo; just silently commits empty. Registration is permanent and first-write-wins, so check your <code>article</code> value before you register, not after.
                        <div className="mt-2 text-sm">
                            <Link href="/builders/clauses" className="text-ink-heading font-medium hover:underline">Full explanation &mdash; Register a clause</Link>
                        </div>
                    </LabelledListRow>
                </ul>
            </MarketingSection>

            <MarketingSection title="Commit-time — building the struct you sign.">
                <ul className="space-y-6">
                    <LabelledListRow label="Sub-order approval" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">There is no incremental approval anywhere in the kernel.</strong> Every <code>commit</code> &mdash; root or sub-order &mdash; pulls the FULL per-order bond, not the increment over what the kernel already holds from earlier orders in the process: the seller approves <code>2&times;</code> the order&apos;s whole <code>cumulativeValue</code> each time, not <code>2&times;</code> the amount that order adds. Approve less than that and <code>commit</code> reverts inside the settlement token with <code>ERC20InsufficientAllowance</code>. Use <code>calculateSubOrderApproval</code>, never hand-roll the number.
                        <div className="mt-2 text-sm">
                            <a href="https://github.com/figaro-protocol/Figaro/blob/main/sdk/src/bonds.ts" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">Full explanation &mdash; <code>calculateSubOrderApproval</code> in <code>@figaro/sdk</code></a>
                        </div>
                    </LabelledListRow>
                    <LabelledListRow label="Provenance pre-merge" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">Compute <code>compositionHash</code> from the raw template, never from checkout-filled clauses.</strong> A checkout walk that composes a provenance clause writes the assembly&apos;s composition identity into it with <code>fillProvenanceSection</code> &mdash; but the hash it writes has to come from <code>templateCompositionHash(template)</code>, called on the template&apos;s own unfilled <code>agreements</code>, before any buyer fill, seller-catalogue fill, or pricing merge touches them. Compute it after merging those fills instead and you get a hash that never matches what <code>AssemblyRegistry</code> anchored &mdash; the value can&apos;t appear inside the composition it hashes.
                        <div className="mt-2 text-sm">
                            <a href="https://github.com/figaro-protocol/Figaro/blob/main/sdk/src/checkoutPlan.ts" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">Full explanation &mdash; <code>fillProvenanceSection</code> in <code>@figaro/sdk</code></a>
                            {" · "}
                            <Link href="/assemblies" className="text-ink-heading font-medium hover:underline">what the composition hash covers</Link>
                        </div>
                    </LabelledListRow>
                    <LabelledListRow label="Fee-on-transfer tokens" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">FigaroCore refuses the commit.</strong> If the ERC-20 you intend to pay with takes a percentage on transfer, the bond arithmetic breaks &mdash; it depends on the kernel receiving exactly what was committed &mdash; and the commit reverts. Pay in a non-rebasing, non-fee-on-transfer token.
                        <div className="mt-2 text-sm">
                            <Link href="/security#compatibility" className="text-ink-heading font-medium hover:underline">Full explanation &mdash; Security, &ldquo;What else you should know&rdquo;</Link>
                        </div>
                    </LabelledListRow>
                    <LabelledListRow label="One currency per process" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">A process cannot mix ERC-20s.</strong> The 2:1 bond ratio is a same-unit comparison; an oracle or DEX dependency to compare across tokens would reintroduce a trusted actor, so the kernel refuses it. Multi-token behavior is achieved through composition &mdash; parallel processes in different currencies &mdash; never within one process.
                        <div className="mt-2 text-sm">
                            <Link href="/security#compatibility" className="text-ink-heading font-medium hover:underline">Full explanation &mdash; Security, &ldquo;What else you should know&rdquo;</Link>
                        </div>
                    </LabelledListRow>
                </ul>
            </MarketingSection>

            <MarketingSection title="Read-time — after settlement.">
                <ul className="space-y-6">
                    <LabelledListRow label="orderStatus == 0" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">Zero means &ldquo;not on this path,&rdquo; never &ldquo;not settled.&rdquo;</strong> <code>FigaroCore</code> and <code>FigaroBatchVerifier</code> share no state and never call each other. A process settled through the batched, proof-based path never acquires kernel status: <code>core.orderStatus(orderHash)</code> reads <code>0</code> for it, permanently &mdash; the same value an order that was never committed at all would return. A composition or dashboard that gates only on <code>orderStatus</code> is not late to see batched trade; it cannot see it at all. Read <code>UsageCounter.scoreOf</code> and fold both paths&apos; events, never one alone.
                        <div className="mt-2 text-sm">
                            <Link href="/spec#settlement-paths" className="text-ink-heading font-medium hover:underline">Full explanation &mdash; Specifications, &ldquo;Two settlement paths&rdquo;</Link>
                        </div>
                    </LabelledListRow>
                </ul>
            </MarketingSection>

            <MarketingSection title="More for builders" bottomPad="wide">
                <ul className="space-y-3 text-base">
                    <li>
                        <Link href="/builders" className="text-ink-heading font-medium hover:underline">Builders</Link>
                        <span className="text-ink-body"> &mdash; the five builder roles and where to start.</span>
                    </li>
                    <li>
                        <Link href="/builders/composability" className="text-ink-heading font-medium hover:underline">Composability</Link>
                        <span className="text-ink-body"> &mdash; the coordinator pattern, the three composition tiers, and the kernel-vs-author boundary.</span>
                    </li>
                    <li>
                        <Link href="/spec" className="text-ink-heading font-medium hover:underline">Specifications</Link>
                        <span className="text-ink-body"> &mdash; the canonical on-chain surface, including the two-settlement-path read table these traps draw from.</span>
                    </li>
                    <li>
                        <Link href="/security" className="text-ink-heading font-medium hover:underline">Security</Link>
                        <span className="text-ink-body"> &mdash; every protocol guarantee stated beside its caveat.</span>
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}
