"use client";

import { useMemo } from "react";
import { deriveAssemblySlug } from "@/lib/shared/assembly";
import { useSearchParams } from "next/navigation";
import Link from "@/components/shared/Link";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { CtaLink } from "@/components/marketing/CtaLink";
import { AssemblyShapeLine } from "@/components/assemblies/AssemblyShapeLine";
import { useAssemblyChoices, type AssemblyChoice } from "@/lib/protocol/assemblyChoices";
import { useRegisteredMembers } from "@/lib/member/useRegisteredMembers";
import { profileToListing } from "@/lib/member/memberListing";

/**
 * The users' showcase: every assembly a designer has published, read from the
 * AssemblyRegistry → IPFS as the page opens, and for each the members bound to
 * it, read from the MembersRegistry → their pinned profiles. Nothing here is a
 * list the site knows; an assembly published tomorrow appears tomorrow. With
 * `?slug=` the page is that one assembly: its designer's words, its own
 * questions, and who to order from.
 */
type Seller = { address: `0x${string}`; name: string };

/** Who is bound to each assembly, or null while that is not known: the
 *  members read is not present, or a live member's profile is still unread
 *  (an unread profile may bind it — "no seller" would be a guess). */
interface SellersByAssembly {
    bySlug: Map<string, Seller[]>;
    /** Every live member's profile is read: a zero count is the network's. */
    complete: boolean;
}

function useSellersByAssembly(): SellersByAssembly | null {
    const { read } = useRegisteredMembers();
    return useMemo(() => {
        if (read.status !== "present") return null;
        const bySlug = new Map<string, Seller[]>();
        let complete = true;
        for (const row of read.value) {
            if (row.stakeWithdrawn) continue;
            if (!row.profile) {
                complete = false;
                continue;
            }
            const listing = profileToListing(row.profile, row.address);
            for (const slug of new Set(listing.bindings.map((b) => deriveAssemblySlug(b.assemblyHash)))) {
                const sellers = bySlug.get(slug) ?? [];
                sellers.push({ address: row.address, name: listing.name });
                bySlug.set(slug, sellers);
            }
        }
        return { bySlug, complete };
    }, [read]);
}

/** The sellers line, only where the count is known: a positive count from
 *  any read profile, a zero only once every live profile is read. */
function sellersLine(sellers: SellersByAssembly | null, slug: string): string | null {
    const n = sellers?.bySlug.get(slug)?.length ?? 0;
    if (n === 1) return "One seller offers it.";
    if (n > 1) return `${n} sellers offer it.`;
    return sellers?.complete ? "No seller is bound to it yet." : null;
}

/** One card per published assembly: the designer's name and summary from its
 *  document, its shape, who offers it, and the one button — that assembly's own
 *  questions. An assembly whose designer wrote none says so in the muted color;
 *  nothing is ordered from an assembly, so no other button. */
function AssemblyCard({ choice, sellers }: { choice: AssemblyChoice; sellers: SellersByAssembly | null }) {
    const faqCount = choice.hydratedAssembly?.assembly.faq?.length ?? 0;
    const line = sellersLine(sellers, choice.slug);
    return (
        <li className="flex flex-col" data-testid="showcase-assembly">
            <h3 className="text-heading-h3 text-ink-heading mb-1">
                <Link href={`/communities?slug=${encodeURIComponent(choice.slug)}`} className="hover:underline">
                    {choice.name}
                </Link>
            </h3>
            {choice.summary && <p className="text-base text-ink-body leading-relaxed mb-2">{choice.summary}</p>}
            <AssemblyShapeLine choice={choice} className="text-xs" />
            <p className="text-sm text-ink-muted mt-2 grow">{line}</p>
            <div className="mt-4">
                {faqCount > 0 ? (
                    <CtaLink href={`/communities?slug=${encodeURIComponent(choice.slug)}#faq`}>FAQ</CtaLink>
                ) : choice.state !== "loaded" ? null : (
                    <span className="inline-flex min-w-[200px] justify-center items-center px-9 py-sm text-sm text-ink-muted rounded-tile border border-default" data-testid="showcase-no-faq">
                        No FAQ yet
                    </span>
                )}
            </div>
        </li>
    );
}

function AssemblyDetail({ choice, sellers }: { choice: AssemblyChoice; sellers: SellersByAssembly | null }) {
    const assembly = choice.hydratedAssembly?.assembly ?? null;
    const bound = sellers?.bySlug.get(choice.slug) ?? [];
    return (
        <>
            <MarketingSection title={`${choice.name}.`} sectionId="assembly">
                {choice.summary && <p className="text-base text-ink-body leading-relaxed mb-5">{choice.summary}</p>}
                {assembly?.description && <p className="text-base text-ink-body leading-relaxed mb-5">{assembly.description}</p>}
                <AssemblyShapeLine choice={choice} className="text-sm" />
                <p className="text-sm mt-4">
                    <Link href="/communities" className="text-ink-heading font-medium hover:underline">
                        Every assembly
                    </Link>
                    {" · "}
                    <Link href={`/assemblies/designer/view?slug=${encodeURIComponent(choice.slug)}`} className="text-ink-heading font-medium hover:underline">
                        The design, for builders
                    </Link>
                </p>
            </MarketingSection>

            <MarketingSection title="Who to order from." sectionId="sellers">
                {bound.length === 0 ? (
                    sellers?.complete ? (
                        <p className="text-base text-ink-body leading-relaxed">No seller is bound to this assembly yet.</p>
                    ) : null
                ) : (
                    <ul className="[&>li]:border-b [&>li]:border-default text-base">
                        {bound.map((s) => (
                            <li key={s.address} className="py-2.5">
                                <Link href={`/s/view?seller=${s.address.toLowerCase()}`} className="text-ink-heading font-medium hover:underline">
                                    {s.name || <code className="font-mono text-sm">{s.address}</code>}
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </MarketingSection>

            {assembly?.faq && assembly.faq.length > 0 && (
                <MarketingSection title="Questions about this trade." sectionId="faq">
                    <dl className="space-y-4">
                        {assembly.faq.map((entry, i) => (
                            <div key={i}>
                                <dt className="text-base text-ink-heading font-medium">{entry.question}</dt>
                                <dd className="text-base text-ink-body leading-relaxed">{entry.answer}</dd>
                            </div>
                        ))}
                    </dl>
                </MarketingSection>
            )}
        </>
    );
}

export function AssembliesShowcase() {
    const params = useSearchParams();
    const slug = params?.get("slug") ?? null;
    const { read } = useAssemblyChoices();
    const sellersByAssembly = useSellersByAssembly();
    const choices = useMemo(
        () => (read.status === "present" ? read.value.filter((c) => !c.stakeWithdrawn) : []),
        [read],
    );
    // A failed registry read renders nothing: never "nothing is published".
    if (read.status === "absent") return null;
    const isLoading = read.status === "pending";

    if (slug) {
        const choice = choices.find((c) => c.slug === slug);
        if (!choice) {
            return (
                <MarketingSection title={isLoading ? "Reading the registry…" : "Not published."} sectionId="assembly">
                    <p className="text-base text-ink-body leading-relaxed">
                        {isLoading ? null : "No published assembly has this address."}{" "}
                        <Link href="/communities" className="text-ink-heading font-medium hover:underline">Every assembly</Link>
                    </p>
                </MarketingSection>
            );
        }
        return <AssemblyDetail choice={choice} sellers={sellersByAssembly} />;
    }

    return (
        <MarketingSection title="Every published assembly." sectionId="assemblies">
            {choices.length === 0 ? (
                <p className="text-base text-ink-body leading-relaxed">
                    {isLoading ? "Reading the registry…" : "Nothing is published on this network yet."}
                </p>
            ) : (
                <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-10">
                    {choices.map((c) => (
                        <AssemblyCard key={c.slug} choice={c} sellers={sellersByAssembly} />
                    ))}
                </ul>
            )}
        </MarketingSection>
    );
}
