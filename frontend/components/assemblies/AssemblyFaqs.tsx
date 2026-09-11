"use client";

import { useEffect, useState } from "react";
import Link from "@/components/shared/Link";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { useAllPublishedAssemblies, fetchAssemblyTemplate } from "@/lib/protocol/useAssemblyRegistry";
import type { AssemblyFaqEntry } from "@figaro-protocol/sdk";

/**
 * The questions a party to a trade asks, answered by each published assembly's
 * designer in its own document (`AssemblyTemplate.faq`). Read from the
 * AssemblyRegistry → IPFS at runtime: the users' FAQ never lists assemblies;
 * it renders whatever the registry carries, today's and any published later.
 * An assembly with no `faq` is absent here; an empty registry renders nothing.
 */
type Group = { slug: string; name: string; faq: readonly AssemblyFaqEntry[] };

export function AssemblyFaqs() {
    const { data } = useAllPublishedAssemblies();
    const [groups, setGroups] = useState<Group[]>([]);

    useEffect(() => {
        if (!data) return;
        let live = true;
        Promise.all(
            data.map(async (row) => {
                const template = await fetchAssemblyTemplate(row.contentURI, row.compositionHash);
                if (!template?.faq?.length) return null;
                return { slug: row.slug, name: template.name ?? row.slug, faq: template.faq } satisfies Group;
            }),
        ).then((found) => {
            if (live) setGroups(found.filter((g): g is Group => g !== null));
        });
        return () => {
            live = false;
        };
    }, [data]);

    if (groups.length === 0) return null;

    return (
        <MarketingSection title="Questions about a trade." sectionId="assemblies">
            <p className="text-base text-ink-body leading-relaxed mb-6">
                Each published assembly answers its own questions, in its designer&apos;s words. They are read from the registry as this page opens.
            </p>
            {groups.map((g) => (
                <div key={g.slug} className="mb-8" data-testid="assembly-faq">
                    <h3 className="text-heading-h3 text-ink-heading mb-4">{g.name}</h3>
                    <dl className="space-y-4">
                        {g.faq.map((entry, i) => (
                            <div key={i}>
                                <dt className="text-base text-ink-heading font-medium">{entry.question}</dt>
                                <dd className="text-base text-ink-body leading-relaxed">{entry.answer}</dd>
                            </div>
                        ))}
                    </dl>
                    <p className="mt-3 text-sm">
                        <Link href={`/assemblies/designer/view?slug=${encodeURIComponent(g.slug)}`} className="text-ink-heading font-medium hover:underline">
                            The assembly
                        </Link>
                    </p>
                </div>
            ))}
        </MarketingSection>
    );
}
