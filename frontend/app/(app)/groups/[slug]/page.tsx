import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GROUPS_REGISTRY, getGroup } from "@/lib/shared/groupsRegistry";

interface Props {
    params: { slug: string };
}

export async function generateStaticParams() {
    return GROUPS_REGISTRY.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const group = getGroup(params.slug);
    if (!group) return { title: "Group — Figaro Protocol" };
    return {
        title: `${group.name} — Figaro Protocol`,
        description: group.charter,
    };
}

export default function GroupPage({ params }: Props) {
    const group = getGroup(params.slug);
    if (!group) notFound();

    return (
        <>
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    <Link href="/groups" className="hover:underline">Groups</Link>
                    {" · "}
                    {group.discipline}
                </p>
                <h1 className="text-5xl font-bold text-black leading-tight tracking-tight mb-6">
                    {group.name}
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    {group.charter}
                </p>
                {group.venue && (
                    <p className="mt-6 text-base">
                        <a href={group.venue.href} target="_blank" rel="noopener noreferrer" className="text-black underline">
                            {group.venue.label} &rarr;
                        </a>
                    </p>
                )}
            </section>

            {group.currentWork && group.currentWork.length > 0 && (
                <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                        Current work
                    </h2>
                    <ul className="space-y-3 text-sm text-gray-700 leading-relaxed list-disc pl-6">
                        {group.currentWork.map((item, i) => (
                            <li key={i}>{item}</li>
                        ))}
                    </ul>
                </section>
            )}

            {group.readingPath && group.readingPath.length > 0 && (
                <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                        Reading path
                    </h2>
                    <ul className="space-y-4">
                        {group.readingPath.map((item, i) => {
                            const isExternal = item.href.startsWith("http");
                            const LinkComponent = isExternal ? "a" : Link;
                            const linkProps = isExternal
                                ? { href: item.href, target: "_blank", rel: "noopener noreferrer" }
                                : { href: item.href };
                            return (
                                <li key={i} className="border-b border-gray-100 pb-3">
                                    <LinkComponent
                                        {...linkProps as { href: string }}
                                        className="text-black font-medium hover:underline"
                                    >
                                        {item.label}
                                    </LinkComponent>
                                    {item.note && (
                                        <p className="text-sm text-gray-600 mt-0.5">{item.note}</p>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            {group.grants && group.grants.length > 0 && (
                <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                        Grants received
                    </h2>
                    <ul className="space-y-3 text-sm">
                        {group.grants.map((g, i) => (
                            <li key={i}>
                                <a href={g.href} target="_blank" rel="noopener noreferrer" className="text-black hover:underline">
                                    {g.label}
                                </a>
                                {g.amount && <span className="text-gray-600"> — {g.amount}</span>}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {group.contributors && group.contributors.length > 0 && (
                <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                        Contributors
                    </h2>
                    <ul className="space-y-2 text-sm font-mono text-gray-700">
                        {group.contributors.map((c, i) => (
                            <li key={i}>{c}</li>
                        ))}
                    </ul>
                </section>
            )}

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-gray-200 pt-12">
                <p className="text-sm text-gray-600 leading-relaxed">
                    This page is authored by the group&apos;s contributors. To amend it, open a pull request against <code>lib/shared/groupsRegistry.ts</code>. The disciplinary taxonomy is listed on <Link href="/groups" className="underline">/groups</Link>. Funding channels are detailed on <Link href="/grants" className="underline">/grants</Link>.
                </p>
            </section>
        </>
    );
}
