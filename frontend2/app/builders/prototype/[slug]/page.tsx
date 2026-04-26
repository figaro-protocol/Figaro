import { BuilderPrototypeShell } from "@/components/core/BuilderPrototypeShell";

interface Props {
    params: { slug: string };
    searchParams?: { identity?: string };
}

export default function BuilderPrototypeSlugPage({ params, searchParams }: Props) {
    return (
        <section className="container mx-auto px-4 py-12">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-neutral-500">
                Assembly Prototype
            </p>
            <p className="mb-6 text-xs font-mono text-neutral-400">/{params.slug}</p>
            <BuilderPrototypeShell
                slug={params.slug}
                runtimeIdentityUrl={searchParams?.identity}
            />
        </section>
    );
}
