"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "@/components/shared/Link";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { AssemblyShapeLine } from "@/components/assemblies/AssemblyShapeLine";
import { useAssemblyChoices, type AssemblyChoice } from "@/lib/protocol/assemblyChoices";
import { useRegisteredMembers } from "@/lib/member/useRegisteredMembers";
import { profileToListing } from "@/lib/member/memberListing";

/**
 * The users' showcase: every assembly a designer has published, read from the
 * AssemblyRegistry → IPFS as the page opens, and for each the sellers bound to
 * it, read from the MembersRegistry → their pinned profiles. Nothing here is a
 * list the site knows; an assembly published tomorrow appears tomorrow. With
 * `?slug=` the page is that one assembly: its designer's words, its own
 * questions, and who to order from.
 */
type Seller = { address: `0x${string}`; name: string };

function useSellersByAssembly(): Map<string, Seller[]> {
    const { data } = useRegisteredMembers();
    return useMemo(() => {
        const bySlug = new Map<string, Seller[]>();
        for (const row of data ?? []) {
            if (row.stakeWithdrawn || !row.profile) continue;
            const listing = profileToListing(row.profile, row.address);
            for (const slug of new Set(listing.bindings.map((b) => b.assemblySlug))) {
                const sellers = bySlug.get(slug) ?? [];
                sellers.push({ address: row.address, name: listing.name || row.address });
                bySlug.set(slug, sellers);
            }
        }
        return bySlug;
    }, [data]);
}

function AssemblyCard({ choice, sellers }: { choice: AssemblyChoice; sellers: Seller[] }) {
    return (
        <li className="border-b border-default py-5" data-testid="showcase-assembly">
            <h3 className="text-heading-h3 text-ink-heading mb-1">
                <Link href={`/assemblies-app?slug=${encodeURIComponent(choice.slug)}`} className="hover:underline">
                    {choice.name}
                </Link>
            </h3>
            {choice.summary && <p className="text-base text-ink-body leading-relaxed mb-2">{choice.summary}</p>}
            <AssemblyShapeLine choice={choice} className="text-xs" />
            <p className="text-sm text-ink-muted mt-2">
                {sellers.length === 0
                    ? "No seller is bound to it yet."
                    : sellers.length === 1
                      ? "One seller offers it."
                      : `${sellers.length} sellers offer it.`}
            </p>
        </li>
    );
}

function AssemblyDetail({ choice, sellers }: { choice: AssemblyChoice; sellers: Seller[] }) {
    const template = choice.assemblyTemplate;
    return (
        <>
            <MarketingSection title={`${choice.name}.`} sectionId="assembly">
                {choice.summary && <p className="text-base text-ink-body leading-relaxed mb-5">{choice.summary}</p>}
                {template?.description && <p className="text-base text-ink-body leading-relaxed mb-5">{template.description}</p>}
                <AssemblyShapeLine choice={choice} className="text-sm" />
                <p className="text-sm mt-4">
                    <Link href="/assemblies-app" className="text-ink-heading font-medium hover:underline">
                        Every assembly
                    </Link>
                    {" · "}
                    <Link href={`/assemblies/designer/view?slug=${encodeURIComponent(choice.slug)}`} className="text-ink-heading font-medium hover:underline">
                        The design, for builders
                    </Link>
                </p>
            </MarketingSection>

            <MarketingSection title="Who to order from." sectionId="sellers">
                {sellers.length === 0 ? (
                    <p className="text-base text-ink-body leading-relaxed">No seller is bound to this assembly yet.</p>
                ) : (
                    <ul className="[&>li]:border-b [&>li]:border-default text-base">
                        {sellers.map((s) => (
                            <li key={s.address} className="py-2.5">
                                <Link href={`/s/view?seller=${s.address.toLowerCase()}`} className="text-ink-heading font-medium hover:underline">
                                    {s.name}
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </MarketingSection>

            {template?.faq && template.faq.length > 0 && (
                <MarketingSection title="Questions about this trade." sectionId="faq">
                    <dl className="space-y-4">
                        {template.faq.map((entry, i) => (
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
    const { data, isLoading } = useAssemblyChoices();
    const sellersByAssembly = useSellersByAssembly();
    const choices = useMemo(() => (data ?? []).filter((c) => !c.stakeWithdrawn), [data]);

    if (slug) {
        const choice = choices.find((c) => c.slug === slug);
        if (!choice) {
            return (
                <MarketingSection title="Not published." sectionId="assembly">
                    <p className="text-base text-ink-body leading-relaxed">
                        {isLoading ? "Reading the registry…" : "No published assembly has this address."}{" "}
                        <Link href="/assemblies-app" className="text-ink-heading font-medium hover:underline">Every assembly</Link>
                    </p>
                </MarketingSection>
            );
        }
        return <AssemblyDetail choice={choice} sellers={sellersByAssembly.get(choice.slug) ?? []} />;
    }

    return (
        <MarketingSection title="Every published assembly." sectionId="assemblies">
            {choices.length === 0 ? (
                <p className="text-base text-ink-body leading-relaxed">
                    {isLoading ? "Reading the registry…" : "Nothing is published on this network yet."}
                </p>
            ) : (
                <ul>
                    {choices.map((c) => (
                        <AssemblyCard key={c.slug} choice={c} sellers={sellersByAssembly.get(c.slug) ?? []} />
                    ))}
                </ul>
            )}
        </MarketingSection>
    );
}
