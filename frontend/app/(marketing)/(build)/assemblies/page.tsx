import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { CtaLink } from "@/components/marketing/CtaLink";
import { RegistryCountLink } from "@/components/registries/RegistryCountLink";
import { DesignGraphCollapseFigure } from "@/components/figures/DesignGraphCollapseFigure";

export const metadata: Metadata = withOg({
    title: "Assemblies — Figaro Protocol",
    description:
        "Composition assemblies anchored on AssemblyRegistry — each assembly composes registered agreements, each a reusable composition of clauses, into a multi-order process. The registry explorer reads on-chain AssemblyRegistered events directly.",
});

export default function Assemblies() {
    return (
        <>
            <MarketingHero
                title="The shape of a trade, drawn once, reused by anyone."
                lead={
                    <>
                        Every kind of trade has a shape: the parties it takes and the terms
                        binding them &mdash; a season of work, a freight leg across an ocean,
                        a data sale, a certified repair. Somebody draws a shape once, and
                        anyone who fits it can trade through it without drawing it again.
                        An assembly is that drawing &mdash; a composition assembly
                        that wires registered agreements, each a reusable composition of
                        clauses,{" "}
                        into a multi-order process. Each one registers on{" "}
                        <code>AssemblyRegistry</code> under its <strong>assembly hash</strong>
                        {" "}&mdash; the hash IS the identity &mdash; with an IPFS pointer to its
                        document. The readable slug you see in a URL is <em>derived</em> from
                        that hash off-chain; the registry stores no slug and no name. Sellers
                        bind to assemblies in their profile; checkout reads those bindings to
                        surface the buyer-facing choice.
                    </>
                }
            >
                <p className="text-sm text-ink-muted leading-relaxed max-w-2xl mt-4">
                    This page explains assemblies. The composing happens in the designer.
                </p>
                <CtaLink href="/assemblies/designer" className="mt-4" data-testid="cta-open-designer">
                    Open the designer
                </CtaLink>
            </MarketingHero>

            <MarketingSection title="In plain words.">
                <p className="text-sm text-ink-body leading-relaxed">
                    An assembly is a ready-made shape for a trade &mdash; who is involved and how the payment splits between them &mdash; that anyone can reuse without designing it from scratch. What follows below gets technical &mdash; how an assembly is identified on-chain, exactly what its hash covers, how to publish one.
                </p>
            </MarketingSection>

            <MarketingSection title="How one is composed.">
                <p className="text-sm text-ink-body leading-relaxed">
                    An assembly is composed from registered agreements: each order in it holds one, a reusable composition of clauses registered once on <code>AgreementRegistry</code> and bound as is by any assembly that needs it. A designer spawns sub-orders from any node and fills each with a registered agreement &mdash; or composes the clauses that define that edge into a new agreement, registered when the assembly is published: geolocation, modalities, schedule, handoff, proximity, emissions, applicable law and forum, and more. Every agreement carries two mandatory clauses: commerce terms, the payment and the denomination committed at buy time; and order topology, which seller follows which. Clauses and agreements are read live from their registries, never a fixed menu &mdash; one registered tomorrow is available to compose immediately, no code change. The checkout writes which registered agreement and which assembly an order instantiates into its agreement &mdash; one reserved leaf of the agreement&apos;s merkle tree that the chain can prove by inclusion &mdash; so both designers are credited without any clause carrying it.
                </p>
                <DesignGraphCollapseFigure
                    idPrefix="assemblies-design-collapse"
                    className="my-8"
                    designHeading="One registered assembly"
                    designNodes={[
                        { label: "agreement-0 · shipper" },
                        { label: "agreement-1 · inspection", branch: true },
                        { label: "agreement-2 · freight forwarder" },
                        { label: "agreement-3 · ocean carrier" },
                        { label: "agreement-4 · customs agent" },
                        { label: "agreement-5 · drayage" },
                    ]}
                    branchNote="spawned from agreement-0, not the next link"
                    rootBuyerLabel="Importer of record"
                    commitOrder={[
                        "importer → shipper · G1",
                        "importer → inspection · G2",
                        "importer → forwarder · G3",
                        "importer → ocean carrier · G4",
                        "importer → customs agent · G5",
                        "importer → drayage · G6",
                    ]}
                    topologyNote={[
                        "G is the cumulative value at a link — the running total the Core keeps,",
                        "and the only quantity it accumulates. Each seller bonds 2 × G at its own",
                        "commit, so G6 is the whole chain's value. The parent-child links ride in",
                        "the agreement as a topology clause: merkle-bound at commit, never a field",
                        "the Core stores — which is why agreement-1 can hang off agreement-0 at design",
                        "time while agreement-2 carries the line onward.",
                    ]}
                    figureTitle="A composed assembly, and the commit sequence it becomes"
                    figureDesc={
                        "On the left, an assembly as composed: six orders, one of " +
                        "them hanging off the first rather than continuing the line. On the " +
                        "right, what the Core holds when that assembly is used: six " +
                        "commits, every one of them to the same root buyer, extending a " +
                        "single accumulator that only rises. Resolution state records no " +
                        "parent, no child and no branch — the ordering survives only " +
                        "because the parties committed it in their agreement."
                    }
                    caption={
                        <>
                            The branch exists at design time and nowhere else. The Core
                            sees six commits extending one accumulator, each to the same
                            root buyer &mdash; which is why re-wiring the chain produces a
                            different assembly, not a different Core.
                        </>
                    }
                />
            </MarketingSection>

            <MarketingSection title="The complete P&L of a purchase, at checkout.">
                <p className="text-sm text-ink-body leading-relaxed">
                    Every line in a multi-seller assembly is its own <Link href="/kernel" className="underline">bonded commitment</Link>, resolving together or not at all &mdash; which is what turns the traditionally hidden breakdown of a purchase (who got paid what, decided privately inside a firm) into a P&amp;L visible before you commit. Two lines or six, the reading is the same: a maker and a carrier, a lead freelancer and their contributors, a container passing through six hands. Every registered assembly carries its own shape, readable in the registry explorer from the composition it was registered under.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mt-4">
                    <strong>One of those shapes, followed order by order:</strong> a buyer and two agents run a single process on it, every bond named per party, one resolution closing all of them together &mdash; <Link href="/agents/worked-example" className="underline">Worked example</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Document-anchored, not catalog-listed.">
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    The registry keys every binding by <code>assemblyHash</code>, and stores
                    exactly four things under it &mdash; call{" "}
                    <code>bindings(assemblyHash)</code> yourself and you get back{" "}
                    <code>(address registeredBy, uint64 registeredAt, bool depositWithdrawn, string
                    contentURI)</code>. That is the whole on-chain record. <strong>There is no
                    slug on chain, and no name.</strong> The <code>contentURI</code> points at
                    the off-chain assembly, which carries the topology &mdash; the
                    orders and their parent-child links &mdash; plus the key of the registered
                    agreement each order holds (each one names which clauses attach and the
                    designer&apos;s fills). Anything a seller offers at checkout composes through
                    assemblies.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    The slug is <em>derived</em>, not stored: it is a pure function of the
                    assembly hash, <code>deriveAssemblySlug(assemblyHash)</code> from{" "}
                    <code>@figaro-protocol/sdk</code>, and every reader computes it from the registry
                    event&apos;s own hash. Identical compositions produce an identical slug;
                    distinct compositions, distinct slugs. Nothing is squattable, because no
                    caller-chosen name exists to squat.
                </p>
                <p className="text-sm text-ink-body leading-relaxed">
                    Registration is permissionless and permanent once written, on the terms
                    every registry here shares (<Link href="/terms/faq#builders-registries" className="underline">what that
                    protects, and what the stake does</Link>). What is specific to the{" "}
                    <strong>composition</strong> binding: identical compositions collapse to
                    one binding, and withdrawing the stake de-surfaces the assembly without
                    clearing it. To change an assembly, register the changed composition: it
                    hashes differently, so it is a different assembly with a different derived
                    slug, and the original designer of record&apos;s binding is untouched.
                </p>
            </MarketingSection>

            <MarketingSection title="What the assembly hash covers.">
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    An assembly&apos;s identity is a merkle root computed over a <em>subset</em> of
                    the document you pin &mdash; one leaf per order, keyed by the registered
                    agreement it holds, and one for the assembly-scoped terms &mdash; and knowing which subset is what lets you rename an assembly without
                    forking it &mdash; or accidentally fork it by touching one field. This is the
                    assembly half of the same question the clause registry answers on{" "}
                    <Link href="/clauses" className="underline">Clauses</Link>:
                </p>
                <div className="overflow-x-auto -mx-6 px-6">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-default text-left font-semibold text-ink-heading">
                                <th scope="col" className="py-2 pr-4">What you write</th>
                                <th scope="col" className="py-2 pr-4">In <code>assemblyHash</code>?</th>
                                <th scope="col" className="py-2">Why</th>
                            </tr>
                        </thead>
                        <tbody className="[&>tr]:border-b [&>tr]:border-default align-top">
                            <tr>
                                <td className="py-2 pr-4"><code>agreements[].agreementHash</code> &mdash; the registered agreement each order holds</td>
                                <td className="py-2 pr-4 font-semibold">Yes</td>
                                <td className="py-2">One leaf per order, in order, so one registered agreement may hold two orders. A different registered agreement in any order is a different assembly.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">the clause keys and design fills inside each registered agreement</td>
                                <td className="py-2 pr-4 font-semibold">Yes, through its key</td>
                                <td className="py-2">An agreement&apos;s key is the hash of the clause keys it composes and the designer&apos;s fills. A different clause set, one different design fill, or another clause that shares a name is a different agreement, so a different assembly.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">the topology, carried as a clause in each order (<code>follows</code>)</td>
                                <td className="py-2 pr-4 font-semibold">Yes</td>
                                <td className="py-2">The registered agreement leaves it empty; each order fills it in its own leaf. Re-wire the chain, get a new assembly from the same agreements.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4"><code>assemblyClauses</code> &mdash; the assembly-scoped terms composed once for the whole design</td>
                                <td className="py-2 pr-4 font-semibold">Yes</td>
                                <td className="py-2">One more leaf, present only when any are composed. A differently-termed assembly is a different assembly.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">editorial prose &mdash; <code>name</code>, <code>summary</code>, <code>description</code></td>
                                <td className="py-2 pr-4 font-semibold">No</td>
                                <td className="py-2">Your own words, pinned in the document but excluded from identity &mdash; so renaming never forks the assembly or its slug. The flip side: prose is not identity, so it does not protect a composition from being anchored by someone else first.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">the exact bytes you pin</td>
                                <td className="py-2 pr-4 font-semibold">No</td>
                                <td className="py-2"><strong>The opposite of a clause.</strong> A clause&apos;s key is the hash of its whole pinned document, so its bytes must be canonical. An assembly&apos;s hash is recomputed over the composition subset, so pin readable JSON &mdash; just never hand-roll the hash over raw bytes.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="text-sm text-ink-body leading-relaxed mt-5">
                    Both halves are pure functions you can call without a chain &mdash;{" "}
                    <code>assemblyHashOf(assembly)</code> and{" "}
                    <code>deriveAssemblySlug(hash)</code>, from <code>@figaro-protocol/sdk</code>:
                </p>
                <pre className="text-xs font-mono text-ink-body bg-paper border border-default rounded-section p-4 overflow-x-auto mt-3"><code>{`import { assemblyHashOf,
         deriveAssemblySlug } from "@figaro-protocol/sdk";

const h = assemblyHashOf(assembly);   // the registry key: the merkle root
deriveAssemblySlug(h);                         // "asm-<first 8 bytes>"

// Prove prose is excluded: same hash, different words.
assemblyHashOf({ ...assembly, name: "Anything" }) === h;  // true`}</code></pre>
                <p className="text-sm text-ink-body leading-relaxed mt-5">
                    One order matters and is easy to get backwards: compute the hash from the <em>raw</em> assembly, before any buyer, catalog or pricing fill touches it &mdash; compute it after merging those fills and you get a hash the registry never anchored. That trap, and the others that bite at commit, at resolve and at read time, are indexed on <Link href="/pitfalls" className="underline">Sharp edges</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Registered assemblies." bottomPad="wide">
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    Every registered assembly is searchable in the registry explorer &mdash; each
                    row one on-chain binding keyed by its assembly hash, its assembly fetched
                    from IPFS, its designer of record the wallet that anchored it.
                </p>
                <RegistryCountLink family="assemblies" />
                <p className="text-sm text-ink-body leading-relaxed mt-6">
                    Drawing a shape once is work the whole network reuses, and the protocol rewards it after the fact: when resolved trades run through an assembly, its designer of record draws a share of the florins reserved for designers. The formula, the schedule, and the two conditions it carries are on <Link href="/rpgf" className="underline">Designer Rewards</Link>.
                </p>
            </MarketingSection>

        </>
    );
}
