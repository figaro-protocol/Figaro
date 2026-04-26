"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { DesignerCanvas } from "@/components/core/designer/DesignerCanvas";
import { REFERENCE_ASSEMBLIES } from "@/lib/shared/assembly";

interface Props {
    params: { slug: string };
}

export default function ViewAssemblyPage({ params }: Props) {
    const assembly = REFERENCE_ASSEMBLIES.find((a) => a.identity.slug === params.slug);
    if (!assembly) notFound();

    return (
        <div className="min-h-screen bg-neutral-50" data-testid="assembly-view-page">
            <div
                data-testid="view-toolbar"
                className="px-8 py-4 border-b border-neutral-200 bg-white flex items-center gap-3 flex-wrap"
            >
                <Link
                    href="/builders/designer"
                    className="text-xs px-3 py-1.5 rounded border border-neutral-300 bg-white hover:border-neutral-400"
                >
                    ← Assemblies
                </Link>
                <span className="text-sm font-semibold text-black">
                    {assembly.identity.name}
                </span>
                <span className="font-mono text-xs text-neutral-500">
                    /{assembly.identity.slug}
                </span>
                <span className="text-xs text-neutral-500 ml-2 rounded bg-neutral-100 px-2 py-0.5">
                    read-only
                </span>
                <Link
                    href={`/builders/designer/edit/${assembly.identity.slug}`}
                    className="ml-auto text-xs px-3 py-1.5 rounded border border-black bg-white hover:bg-neutral-100"
                >
                    Fork to edit
                </Link>
            </div>
            <DesignerCanvas assembly={assembly} />
        </div>
    );
}
