import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { RegistryCountLink } from "@/components/registries/RegistryCountLink";
import { DesignGraphCollapseFigure } from "@/components/figures/DesignGraphCollapseFigure";

export const metadata: Metadata = withOg({
    title: "Assemblies — Figaro Protocol",
    description:
        "Composition templates anchored on AssemblyRegistry — each assembly wires clauses into a multi-order process. The registry explorer reads on-chain AssemblyRegistered events directly.",
});

export default function Assemblies() {
    return (
        <>
            <MarketingHero
                title="The shape of a deal, drawn once, reused by anyone."
                lead={
                    <>
                        Every kind of deal has a shape: the parties it takes and the terms
                        binding them &mdash; a delivered meal, a freight leg across an ocean,
                        a data sale, a certified repair. Somebody draws a shape once, and
                        anyone who fits it can trade through it without drawing it again.
                        An assembly is that drawing &mdash; a composition template
                        that wires <Link href="/glossary#clause" className="underline">clauses</Link>{" "}
                        into a multi-order process. Each one registers on{" "}
                        <code>AssemblyRegistry</code> under its <strong>composition hash</strong>
                        {" "}&mdash; the hash IS the identity &mdash; with an IPFS pointer to its
                        document. The readable slug you see in a URL is <em>derived</em> from
                        that hash off-chain; the registry stores no slug and no name. Sellers
                        bind to assemblies in their profile; checkout reads those bindings to
                        surface the buyer-facing choice.
                    </>
                }
            >
                <p className="text-sm text-ink-muted leading-relaxed max-w-2xl mt-4">
                    This page explains assemblies. To compose an assembly, go to <Link href="/assemblies/designer" className="underline">/assemblies/designer</Link>.
                </p>
            </MarketingHero>

            <MarketingSection title="In plain words.">
                <p className="text-sm text-ink-body leading-relaxed">
                    An assembly is a ready-made shape for a deal &mdash; who is involved and how the payment splits between them &mdash; that anyone can reuse without designing it from scratch. What follows below gets technical &mdash; how an assembly is identified on-chain, exactly what its hash covers, how to publish one &mdash; but the registry count further down is not a curated list: it reads directly off the live network, so it shows exactly what is registered today, nothing more and nothing less.
                </p>
            </MarketingSection>

            <MarketingSection title="How one is composed.">
                <p className="text-sm text-ink-body leading-relaxed">
                    Every assembly carries three mandatory clauses automatically &mdash; commerce terms (the payment and settlement token, committed at buy time), order topology (which seller follows which), and assembly provenance, the record of which assembly a process instantiates that credits its designer. From there, an author composes the rest by spawning sub-orders from any node and attaching the clauses that define each edge: geolocation, modalities, schedule, hand-off, proximity, emissions, applicable law and forum, and more. Those clauses are read live from the <code>ClauseRegistry</code>, never a fixed menu &mdash; a clause registered tomorrow is available to compose immediately, no code change.
                </p>
                <DesignGraphCollapseFigure
                    idPrefix="assemblies-design-collapse"
                    className="my-8"
                    designHeading="One registered assembly"
                    designNodes={[
                        { label: "order-0 · shipper" },
                        { label: "order-1 · inspection", branch: true },
                        { label: "order-2 · freight forwarder" },
                        { label: "order-3 · ocean carrier" },
                        { label: "order-4 · customs agent" },
                        { label: "order-5 · drayage" },
                    ]}
                    branchNote="spawned from order-0, not the next link"
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
                        "G is the cumulative value at a link — the running total the kernel keeps,",
                        "and the only quantity it accumulates. Each seller bonds 2 × G at its own",
                        "commit, so G6 is the whole chain's value. The parent-child links ride in",
                        "the agreement as a topology clause: merkle-bound at commit, never a field",
                        "the kernel stores — which is why order-1 can hang off order-0 at design",
                        "time while order-2 carries the line onward.",
                    ]}
                    figureTitle="A composed assembly, and the commit sequence it becomes"
                    figureDesc={
                        "On the left, an assembly template as composed: six orders, one of " +
                        "them hanging off the first rather than continuing the line. On the " +
                        "right, what the kernel holds when that template is used: six " +
                        "commits, every one of them to the same root buyer, extending a " +
                        "single accumulator that only rises. Settlement state records no " +
                        "parent, no child and no branch — the ordering survives only " +
                        "because the parties committed it in their agreement."
                    }
                    caption={
                        <>
                            The branch exists at design time and nowhere else. The kernel
                            sees six commits extending one accumulator, each to the same
                            root buyer &mdash; which is why re-wiring the chain produces a
                            different assembly, not a different kernel.
                        </>
                    }
                />
            </MarketingSection>

            <MarketingSection title="The complete P&L of a purchase, at checkout.">
                <p className="text-sm text-ink-body leading-relaxed">
                    Every line in a multi-seller assembly is its own <Link href="/glossary#bonded-commitment" className="underline">bonded commitment</Link>, settling together or not at all &mdash; which is what turns the traditionally hidden breakdown of a purchase (who got paid what, decided privately inside a firm) into a P&amp;L visible before you commit. Two lines or six, the reading is the same: a maker and a carrier, a lead freelancer and their contributors, a container passing through six hands. Every registered assembly carries its own shape, readable in the registry explorer from the composition it was registered under. One of those shapes is followed order by order, with every stake named per party, on <Link href="/worked-example" className="underline">Worked example</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Document-anchored, not catalogue-listed.">
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    The registry keys every binding by <code>compositionHash</code>, and stores
                    exactly four things under it &mdash; call{" "}
                    <code>bindings(compositionHash)</code> yourself and you get back{" "}
                    <code>(address registeredBy, uint64 registeredAt, bool depositWithdrawn, string
                    contentURI)</code>. That is the whole on-chain record. <strong>There is no
                    slug on chain, and no name.</strong> The <code>contentURI</code> points at
                    the off-chain assembly template, which carries the topology &mdash; the
                    orders and their parent-child links &mdash; plus the per-order agreements
                    (which clauses attach, and the field values that compose into each
                    agreement hash). Anything a seller offers at checkout composes through
                    assemblies.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    The slug is <em>derived</em>, not stored: it is a pure function of the
                    composition hash, <code>deriveAssemblySlug(compositionHash)</code> from{" "}
                    <code>@figaro-protocol/sdk</code>, and every reader computes it from the registry
                    event&apos;s own hash. Identical compositions produce an identical slug;
                    distinct compositions, distinct slugs. Nothing is squattable, because no
                    caller-chosen name exists to squat.
                </p>
                <p className="text-sm text-ink-body leading-relaxed">
                    Registration is permissionless and permanent once written, on the terms
                    every registry here shares (<Link href="/faq#builders-registries" className="underline">what that
                    protects, and what the deposit does</Link>). What is specific to the{" "}
                    <strong>composition</strong> binding: identical compositions collapse to
                    one binding, and withdrawing the deposit de-surfaces the assembly without
                    clearing it. To change an assembly, register the changed composition: it
                    hashes differently, so it is a different assembly with a different derived
                    slug, and the original author&apos;s binding is untouched.
                </p>
            </MarketingSection>

            <MarketingSection title="What the composition hash covers.">
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    An assembly&apos;s identity is computed over a <em>subset</em> of the document
                    you pin, and knowing which subset is what lets you rename an assembly without
                    forking it &mdash; or accidentally fork it by touching one field. This is the
                    assembly half of the same question the clause registry answers on{" "}
                    <Link href="/clauses" className="underline">Clauses</Link>:
                </p>
                <div className="overflow-x-auto -mx-6 px-6">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-default text-left font-semibold text-ink-heading">
                                <th scope="col" className="py-2 pr-4">What you write</th>
                                <th scope="col" className="py-2 pr-4">In <code>compositionHash</code>?</th>
                                <th scope="col" className="py-2">Why</th>
                            </tr>
                        </thead>
                        <tbody className="[&>tr]:border-b [&>tr]:border-default align-top">
                            <tr>
                                <td className="py-2 pr-4"><code>agreements[]</code> &mdash; every composed clause and every designer-authored value in it</td>
                                <td className="py-2 pr-4 font-semibold">Yes</td>
                                <td className="py-2">This is the composition. A different clause set, or one different design fill, is a different assembly.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">the topology, carried as a clause (<code>parentOrderHashes</code>)</td>
                                <td className="py-2 pr-4 font-semibold">Yes</td>
                                <td className="py-2">Topology is a clause like any other, so it rides in with the agreements. Re-wire the chain, get a new assembly.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4"><code>assemblyClauses</code> &mdash; the assembly-scoped terms composed once for the whole design</td>
                                <td className="py-2 pr-4 font-semibold">Yes</td>
                                <td className="py-2">A differently-termed assembly is a different assembly. (Omitted from the hash entirely when none are composed, so pre-existing hashes are unchanged.)</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">clause <code>version</code> pins</td>
                                <td className="py-2 pr-4 font-semibold">Yes</td>
                                <td className="py-2">A clause&apos;s identity is (name, version); the template records which one it composed. Sparse &mdash; version 1 is never serialized.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">editorial prose &mdash; <code>name</code>, <code>summary</code>, <code>description</code></td>
                                <td className="py-2 pr-4 font-semibold">No</td>
                                <td className="py-2">Your own words, pinned in the document but excluded from identity &mdash; so renaming never forks the assembly or its slug. The flip side: prose is not identity, so it does not protect a composition from being anchored by someone else first.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">the exact bytes you pin</td>
                                <td className="py-2 pr-4 font-semibold">No</td>
                                <td className="py-2"><strong>The opposite of a clause.</strong> A clause&apos;s <code>contentHash</code> covers its whole pinned document, so its bytes must be canonical. An assembly&apos;s hash is recomputed over the composition subset, so pin readable JSON &mdash; just never hand-roll the hash over raw bytes.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="text-sm text-ink-body leading-relaxed mt-5">
                    Both halves are pure functions you can call without a chain &mdash;{" "}
                    <code>templateCompositionHash(template)</code> and{" "}
                    <code>deriveAssemblySlug(hash)</code>, from <code>@figaro-protocol/sdk</code>:
                </p>
                <pre className="text-xs font-mono text-ink-body bg-paper border border-default rounded-section p-4 overflow-x-auto mt-3"><code>{`import { templateCompositionHash,
         deriveAssemblySlug } from "@figaro-protocol/sdk";

const h = templateCompositionHash(template);   // the registry key
deriveAssemblySlug(h);                         // "asm-<first 8 bytes>"

// Prove prose is excluded: same hash, different words.
templateCompositionHash({ ...template, name: "Anything" }) === h;  // true`}</code></pre>
                <p className="text-sm text-ink-body leading-relaxed mt-5">
                    One order matters and is easy to get backwards: compute the hash from the <em>raw</em> template, before any buyer, catalogue or pricing fill touches it &mdash; compute it after merging those fills and you get a hash the registry never anchored. That trap, and the others that bite at commit, at resolve and at read time, are indexed on <Link href="/pitfalls" className="underline">Sharp edges</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Registered assemblies." bottomPad="wide">
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    Every registered assembly is searchable in the registry explorer &mdash; each
                    row one on-chain binding keyed by its composition hash, its template fetched
                    from IPFS, its author the wallet that anchored it. There is no static roster of
                    assemblies &mdash; the count is derived, never stored. The canonical templates of
                    the reference set are the <a href="https://github.com/figaro-protocol/Figaro/tree/main/assemblies" target="_blank" rel="noopener noreferrer" className="underline"><code>assemblies/</code> directory</a> in
                    the repository; on chain, discover every anchored assembly (reference or
                    third-party) the same way the registry explorer does &mdash; by reading the{" "}
                    <code>AssemblyRegistry</code>&apos;s <code>AssemblyRegistered</code> event stream.
                </p>
                <p className="text-sm text-ink-muted leading-relaxed mb-6">
                    For agents: the registry explorer derives from the live <code>AssemblyRegistry</code> and can be reconstructed programmatically with <code>reconstructDiscovery()</code> from <code>@figaro-protocol/sdk</code> &mdash; see the <a href="https://github.com/figaro-protocol/Figaro/blob/main/sdk/README.md" target="_blank" rel="noopener noreferrer" className="underline">SDK README</a> for the deployment record.
                </p>
                <RegistryCountLink family="assemblies" />
                <p className="text-sm text-ink-body leading-relaxed mt-6">
                    Drawing a shape once is work the whole network reuses, and the protocol pays for it after the fact: when settled deals run through an assembly, its designer of record draws a share of the florins reserved for authors. The formula, the schedule, and the two conditions it carries are on <Link href="/rpgf" className="underline">Rewards for authors</Link>.
                </p>
            </MarketingSection>

        </>
    );
}
