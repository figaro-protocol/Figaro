import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { LabelledListRow } from "@/components/shared/LabelledListRow";
import { Breadcrumb } from "@/components/shared/Breadcrumb";

export const metadata: Metadata = withOg({
    title: "Sharp edges — Figaro Protocol",
    description:
        "The one canonical footguns page: eight documented traps, organized by when each one bites — writing a clause spec, building a commit, resolving and recording, or reading settled state — each with a one-paragraph summary and a link to its full, canonical explanation.",
});

export default function Pitfalls() {
    return (
        <>
            <div className="container mx-auto px-6 pt-8">
                <Breadcrumb
                    items={[
                        { label: "Builders", href: "/clauses" },
                        { label: "Sharp edges" },
                    ]}
                />
            </div>
            <MarketingHero
                title="Sharp edges."
                lead={
                    <>
                        Eight documented traps, in the order you can hit them: writing a clause spec, building a commit or a checkout, resolving a process and recording what it earned, then reading settled state back. Each entry below is a one-paragraph summary &mdash; the full, canonical explanation lives where it was first written, and this page links to it rather than forking it.
                    </>
                }
            />

            <MarketingSection title="Spec-authoring — before you register.">
                <ul className="space-y-6">
                    <LabelledListRow label="Reserved article names" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">Two <code>block.design.article</code> values are reserved, and picking one by accident is silent.</strong> <code>&quot;mandatory&quot;</code> auto-folds a clause into every template agreement; <code>&quot;attestations&quot;</code> commits its content empty at signing &mdash; nothing warns you, and registration is permanent and first-write-wins, so check your <code>article</code> value before you register, not after.
                        <div className="mt-2 text-sm">
                            <Link href="/clauses#what-the-hash-covers" className="text-ink-heading font-medium hover:underline">Full explanation &mdash; Clauses, &ldquo;What the hash covers&rdquo;</Link>
                        </div>
                    </LabelledListRow>
                </ul>
            </MarketingSection>

            <MarketingSection title="Commit-time — building the struct you sign.">
                <ul className="space-y-6">
                    <LabelledListRow label="Sub-order approval" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">There is no incremental approval anywhere in the kernel.</strong> Every <code>commit</code> &mdash; root or sub-order &mdash; pulls the FULL per-order bond, not the increment over what the kernel already holds; approve only the increment and <code>commit</code> reverts inside the settlement token with <code>ERC20InsufficientAllowance</code>. Use <code>calculateSubOrderApproval</code>, never hand-roll the number.
                        <div className="mt-2 text-sm">
                            <a href="https://github.com/figaro-protocol/Figaro/blob/main/sdk/src/bonds.ts" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">Full explanation &mdash; <code>calculateSubOrderApproval</code> in <code>@figaro-protocol/sdk</code></a>
                        </div>
                    </LabelledListRow>
                    <LabelledListRow label="Provenance pre-merge" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">Compute <code>compositionHash</code> from the raw template, never from checkout-filled clauses.</strong> Call <code>templateCompositionHash(template)</code> before any buyer, catalogue, or pricing fill touches it &mdash; compute it after merging those fills instead and you get a hash that never matches what <code>AssemblyRegistry</code> anchored.
                        <div className="mt-2 text-sm">
                            <a href="https://github.com/figaro-protocol/Figaro/blob/main/sdk/src/checkoutPlan.ts" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">Full explanation &mdash; <code>fillProvenanceSection</code> in <code>@figaro-protocol/sdk</code></a>
                            {" · "}
                            <Link href="/assemblies" className="text-ink-heading font-medium hover:underline">what the composition hash covers</Link>
                        </div>
                    </LabelledListRow>
                    <LabelledListRow label="Fee-on-transfer tokens" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">FigaroCore refuses the commit.</strong> A fee-on-transfer ERC-20 breaks the bond arithmetic, which depends on the kernel receiving exactly what was committed &mdash; pay in a non-rebasing, non-fee-on-transfer token.
                        <div className="mt-2 text-sm">
                            <Link href="/faq#compatibility" className="text-ink-heading font-medium hover:underline">Full explanation &mdash; FAQ, &ldquo;What else you should know&rdquo;</Link>
                        </div>
                    </LabelledListRow>
                    <LabelledListRow label="One currency per process" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">A process cannot mix ERC-20s.</strong> The 2:1 bond ratio is a same-unit comparison, so the kernel refuses any oracle or DEX dependency that would compare across tokens &mdash; mix currencies by composing parallel processes, never within one.
                        <div className="mt-2 text-sm">
                            <Link href="/faq#compatibility" className="text-ink-heading font-medium hover:underline">Full explanation &mdash; FAQ, &ldquo;What else you should know&rdquo;</Link>
                        </div>
                    </LabelledListRow>
                </ul>
            </MarketingSection>

            <MarketingSection title="Settlement-time — resolving, and recording what it earned.">
                <ul className="space-y-6">
                    <LabelledListRow label="Two processIds, one name" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">The id <code>resolveProcess</code> takes as its argument is not the id its structs carry.</strong> The argument is the kernel&apos;s <em>derived</em> process id; every struct inside <code>commitments</code> must be the one the parties <em>signed</em> &mdash; and a root order signed <code>processId = 0</code>. Feed back the derived id that <code>OrderCommitted</code> carries &mdash; the natural move, since that is what event reconstruction hands you &mdash; and the kernel recomputes an order hash matching no committed order, reverting <code>OrderNotCommitted</code>. <code>restoreSignedProcessId</code> is the bridge; <code>executeAction</code> applies it to every element for you, and the lower-level <code>resolveProcess</code> wrapper and hand-rolled <code>cast</code> do not.
                        <div className="mt-2 text-sm">
                            <a href="https://github.com/figaro-protocol/Figaro/blob/main/sdk/README.md#your-first-commit" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">Full explanation &mdash; SDK README, &ldquo;Your first commit&rdquo; step 5</a>
                        </div>
                    </LabelledListRow>
                    <LabelledListRow label="AccrualClosed()" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">A closed accrual period does not throw &mdash; it returns a report with nothing recorded.</strong> <code>recordClauseUsage</code> and <code>recordAssemblyUsage</code> each open by calling <code>UsageCounter.currentPeriod()</code>, which reverts <code>AccrualClosed()</code> once the last accrual period has ended, and <code>recordProcessUsage</code> tolerates per-leg reverts by design &mdash; so every leg lands in <code>failures</code> with <code>recorded</code> at <code>0</code> and nothing is thrown. The same boundary is sharp long before that day: a record counts in the period open <em>when you call</em>, not the one the process resolved in. Record in the same breath as the resolve, and read the report.
                        <div className="mt-2 text-sm">
                            <a href="https://github.com/figaro-protocol/Figaro/blob/main/sdk/README.md#your-first-commit" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">Full explanation &mdash; SDK README, &ldquo;Your first commit&rdquo; step 5</a>
                        </div>
                    </LabelledListRow>
                </ul>
            </MarketingSection>

            <MarketingSection title="Read-time — after settlement.">
                <ul className="space-y-6">
                    <LabelledListRow label="orderStatus == 0" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">Zero means &ldquo;not on this path,&rdquo; never &ldquo;not settled.&rdquo;</strong> A batch-settled process reads <code>orderStatus == 0</code> forever &mdash; gate on it alone and batched trade is invisible to you, permanently. Fold both paths&apos; events, never one alone.
                        <div className="mt-2 text-sm">
                            <Link href="/spec#settlement-paths" className="text-ink-heading font-medium hover:underline">Full explanation &mdash; Specifications, &ldquo;Two settlement paths&rdquo;</Link>
                        </div>
                    </LabelledListRow>
                </ul>
            </MarketingSection>

        </>
    );
}
