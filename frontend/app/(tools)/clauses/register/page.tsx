import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { RegisterClauseForm } from "./_components/RegisterClauseForm";
import { RegisteredClausesReclaim } from "./_components/RegisteredClausesReclaim";
import { Breadcrumb } from "@/components/shared/Breadcrumb";

export const metadata: Metadata = withOg({
    title: "Register a clause — Figaro Protocol",
    description:
        "Paste a clause spec, validate it against the off-chain Layer-A well-formedness check, then anchor it on the ClauseRegistry. Reclaim the registration stake of clauses you registered.",
});

/**
 * /clauses/register — the wallet-scoped clause authoring surface, the
 * clause-side mirror of /assemblies/designer (assembly authoring). Two halves:
 *
 *  1. Register a clause — paste a spec, validate through the generic Layer-A
 *     surface (`@figaro/sdk/clauses`, the same gate that runs at sign-time),
 *     pin to IPFS, and anchor on `ClauseRegistry.registerClause`.
 *  2. Your registered clauses — derived from `ClauseRegistered` events filtered
 *     to the connected wallet, each with a stake-reclaim affordance gated by the
 *     advisory commits==resolves gate.
 *
 * What lives here is the authoring PROCEDURE — how to write a spec, and the
 * four steps that take it from an editor to an anchored clause. The reference
 * half — what each part of the hash covers, the reserved-`article` trap, and
 * the Ricardian framing — lives on `/clauses#what-the-hash-covers` (maintainer
 * ruling 2026-08-12, the URL-depth rule in `docs/FRONTEND.md`): this page
 * points at it and must never fork a copy of it. Reading state needs no
 * wallet; the register + reclaim WRITES do (connect is a signing prerequisite,
 * gated inline, not a login).
 */
export default function ClauseAuthoring() {
    return (
        <div className="min-h-screen bg-canvas">
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <Breadcrumb
                    items={[
                        { label: "Clauses", href: "/clauses" },
                        { label: "Register a clause" },
                    ]}
                />
                <h1 className="text-heading-h1 text-ink-heading mb-6">
                    Register a clause.
                </h1>
                <p className="text-body-lead text-ink-body max-w-2xl mb-4">
                    Paste a clause spec below; it is validated against the same off-chain Layer-A check that gates signing, pinned to IPFS, and anchored on the <code>ClauseRegistry</code>. Registration is permissionless, first-write-wins, and immutable per <code>(name, version)</code>.
                </p>
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    New to clauses? The{" "}
                    <Link href="/clauses" className="underline">clauses page</Link>{" "}
                    carries the plain-language introduction, the live registry inventory, and the full explanation of{" "}
                    <Link href="/clauses#what-the-hash-covers" className="underline">what the hash covers</Link>{" "}
                    &mdash; which part of a spec reaches which hash, and what a reserved <code>article</code> value silently changes. Read that before you register: registration is permanent.
                </p>
                <div className="mt-8">
                    <RegisterClauseForm />
                </div>
            </section>

            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    Write the spec.
                </h2>
                <p className="text-sm text-ink-body leading-relaxed mb-5">
                    A clause is a free-form <strong>content shape</strong>: <code>fields</code> declares any named attributes &mdash; string, enum, array, object &mdash; and <em>that</em> is what gets validated off-chain and merkle-bound on-chain when attested. Five required keys &mdash; <code>clauseId</code>, <code>version</code>, <code>title</code>, a one-line <code>description</code>, and <code>fields</code> &mdash; already make a whole, valid clause:
                </p>
                <pre className="text-xs font-mono text-ink-body bg-paper border border-default rounded-section p-4 overflow-x-auto mb-5"><code>{`{
  "clauseId": "figaro-probe",
  "version": 1,
  "title": "Probe",
  "description": "A minimal clause.",
  "fields": [ { "name": "note", "type": "string", "required": true } ]
}`}</code></pre>
                <p className="text-sm text-ink-body leading-relaxed mb-5">
                    <strong><code>block</code> is mostly how the clause shows up in the UI &mdash; but five of its hints are hash-load-bearing, so it is not inert.</strong> Omit <code>block</code> entirely and the clause still validates and attests; it just won&apos;t surface in the designer or runtime. Include it and two things follow: the registered <code>contentHash</code> covers the whole canonical document, <code>block</code> included, so changing a single character of it changes your clause&apos;s anchor. And five specific hints change what a designer&apos;s <em>template</em> and a party&apos;s <em>signed agreement</em> actually contain. Which five, and what each moves, is the table on <Link href="/clauses#what-the-hash-covers" className="underline">Clauses</Link>. <code>block</code> is organized into three phase sections, each named for its reader: <code>design</code> (the <code>article</code> it <strong>groups</strong> under, its <code>scope</code>, what it <code>nestsUnder</code> as a sub-clause, and <code>fills</code> &mdash; the fields the designer authors into the template), <code>checkout</code> (which fields fold from the seller&apos;s catalogue or profile), and <code>runtime</code> (interaction standards, runtime inputs, hand-off stages). Grouping is <code>article</code>&apos;s job; <code>nestsUnder</code> is only for a genuine sub-detail (never a whole clause under a plain number).
                </p>
                <p className="text-sm text-ink-body leading-relaxed mt-5">
                    <code>block.design.article</code> is your clause&apos;s <strong>group</strong> &mdash; coordination, logistics, emissions &mdash; the section it groups under in the designer, and the only classification it needs. It is a <em>reader</em> concern: nothing on chain stores it, and the reward mechanism never reads it. The 600M reward is <strong>uniform</strong> &mdash; every clause and assembly scores on its real usage alone, with no tag, category, or weight &mdash; so there is no reward tag to declare and the registry stores no incentive input; eligibility is a live ETH stake, not a class. Validate the whole spec with <code>parseClauseSpec</code> from <code>@figaro/sdk/clauses</code> before you register; it rejects a malformed spec with the exact path that failed.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mt-5">
                    <strong>Best practice: anchor your clause to a norm or standard.</strong> A clause is strongest when its content references an external, named, versioned standard the parties already recognize &mdash; a body of law (<code>figaro-applicable-law</code>), an arbitration forum&apos;s rules (<code>figaro-arbitration-kleros</code>), an accounting standard (<code>figaro-emissions</code> names ISO&nbsp;14064, the GHG&nbsp;Protocol, &hellip; in its <code>standard</code> field). Anchoring to a standard gives the clause stable, shared meaning across parties and over time &mdash; the standard is the source of truth and your clause points to it &mdash; and it bridges how people already reason, through established norms, to how the protocol reasons. Name the standard and carry its version, and the clause stays durable as the world changes around it.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mt-5">
                    Written a spec? The form above validates it against this same off-chain check and anchors it on the <code>ClauseRegistry</code>: permissionless, first-write-wins, permanent per <code>(name, version)</code>. Registering posts a reclaimable ETH deposit &mdash; staked intent, no time lock, reclaimed in full &mdash; not a fee. The amount is set per deployment; read the live value with <code>ClauseRegistry.registrationDeposit()</code> before you submit &mdash; do not assume a number. Illustrative only, read the live value: the reference local devnet deploy script sets it to <code>0.001 ETH</code>.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    The checklist.
                </h2>
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    No permission, no pull request, no repository access. Four steps take a spec from your editor to an anchored, attestable clause &mdash; the form above runs all four from the browser if you would rather not touch code.
                </p>
                <ol className="space-y-3 text-sm text-ink-body leading-relaxed list-decimal pl-5">
                    <li><strong>Write the spec.</strong> The shape above is the whole of it &mdash; <code>clauseId</code>, <code>version</code>, <code>title</code>, <code>description</code>, and your <code>fields</code>. Add <code>block</code> only if you want the clause to surface in the designer and runtime &mdash; and if you do, read <Link href="/clauses#what-the-hash-covers" className="underline">what the hash covers</Link> first: five of its hints change what parties sign, and registration is permanent.</li>
                    <li><strong>Validate it off-chain.</strong> Run it through the one validator &mdash; <code>parseClauseSpec</code> / <code>validateContent</code> from <code>@figaro/sdk/clauses</code>, or paste it into the form above, which runs the same check live in the browser. This is the off-chain gate; get it green here before you anchor &mdash; the same spec drives the in-proof content check on the batched settlement path.</li>
                    <li><strong>Pin the canonical serialization to IPFS.</strong> Pin the exact bytes <code>canonicalize(spec)</code> returns from <code>@figaro/sdk</code> &mdash; sorted keys at every depth, no whitespace, <code>block</code> included &mdash; and keep them pinned. Anchor <code>contentHash = canonicalContentHash(spec)</code>. Pinning that same serialization is what makes the hash reproducible: every consumer re-canonicalizes the parsed JSON and recomputes the hash to verify it, so if you pin pretty-printed bytes instead, the hash readers recompute never matches the one you anchored &mdash; permanently, under first-write-wins. Nothing bundles a copy.</li>
                    <li><strong>Anchor it on <code>ClauseRegistry</code>.</strong> Call <code>registerClause(clauseId, version, contentHash, contentURI)</code> &mdash; permissionless, first-write-wins, permanent per <code>(name, version)</code>. Registering posts a reclaimable ETH deposit &mdash; staked intent, no time lock, reclaimed in full &mdash; not a fee. There is <strong>no per-clause validator to write or deploy</strong> &mdash; the generic proof engine validates any registered clause against the spec you anchored: registration alone makes the clause attestable and settleable, and the inventory at <Link href="/clauses" className="underline">/clauses</Link> picks it up live from on-chain <code>ClauseRegistered</code> events.</li>
                </ol>
                <p className="mt-6 text-sm text-ink-muted leading-relaxed">
                    The one lockstep that matters: the registered <code>contentHash</code> must match the pinned document, and the document must stay pinned. If they drift, the clause won&apos;t surface.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    Your registered clauses
                </h2>
                <p className="text-sm text-ink-muted mb-6 max-w-2xl">
                    Clauses this wallet registered, reconstructed from{" "}
                    <code>ClauseRegistered</code> events. Reclaiming a stake moves the deposit and de-surfaces the clause for new compositions — the binding stays anchored and committed deals keep resolving it.
                </p>
                <RegisteredClausesReclaim />
            </section>
        </div>
    );
}
