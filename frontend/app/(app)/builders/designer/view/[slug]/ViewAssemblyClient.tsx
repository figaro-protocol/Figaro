"use client";

/**
 * ViewAssemblyPage — read-only DAG view of a reference assembly. Same
 * `ProcessGraphCanvas` as `/new` and `/edit/[slug]`, seeded by
 * `assemblyToSyntheticOrders`, but no edit handlers are passed — the
 * canvas renders the canonical tree without drag-handles, edge-pill
 * swaps, or node deletion. "Fork to edit" routes to `/edit/[slug]`.
 */

import Link from "next/link";
import { useMemo } from "react";
import { notFound } from "next/navigation";
import { ProcessGraphCanvas } from "@/components/core/ProcessGraphCanvas";
import { REFERENCE_ASSEMBLIES } from "@/lib/shared/assembly";
import { assemblyToSyntheticOrders } from "@/lib/designer/assemblyToSyntheticOrders";

interface Props {
    params: { slug: string };
}

export function ViewAssemblyClient({ params }: Props) {
    const reference = useMemo(
        () => REFERENCE_ASSEMBLIES.find((a) => a.identity.slug === params.slug),
        [params.slug],
    );

    if (!reference) notFound();

    const { orders } = useMemo(
        () => assemblyToSyntheticOrders(reference),
        [reference],
    );

    return (
        <div className="min-h-screen bg-canvas" data-testid="assembly-view-page">
            <div
                data-testid="view-toolbar"
                className="px-8 py-4 border-b border-default bg-paper flex items-center gap-3 flex-wrap"
            >
                <Link
                    href="/builders/designer"
                    className="text-xs px-3 py-1.5 rounded border border-default bg-paper hover:border-default-strong"
                >
                    ← Assemblies
                </Link>
                <span className="text-sm font-semibold text-ink-heading">
                    {reference.identity.name}
                </span>
                <span className="font-mono text-xs text-ink-muted">
                    /{reference.identity.slug}
                </span>
                <span className="text-[10px] uppercase tracking-widest text-ink-muted rounded bg-subtle px-2 py-0.5">
                    read-only
                </span>
                <Link
                    href={`/builders/designer/edit/${reference.identity.slug}`}
                    className="ml-auto text-xs px-3 py-1.5 rounded border border-ink-heading bg-paper hover:bg-subtle font-semibold"
                >
                    Fork to edit
                </Link>
            </div>
            <div className="container mx-auto px-6 pt-8 pb-16 max-w-5xl">
                <div className="mb-6">
                    <p className="text-sm text-ink-body leading-relaxed max-w-2xl">
                        <strong>Canonical tree.</strong> Read-only view of <strong>{reference.identity.name}</strong> ({reference.roles.length} roles · {reference.mechanisms.filter((m) => m.enabled).length} active mechanisms). The shape derives from the assembly&apos;s declared roles and mechanisms — root commitment plus sub-orders implied by sellers and auction mechanisms. Click <em>Fork to edit</em> to open the same tree on the editable canvas.
                    </p>
                </div>
                <ProcessGraphCanvas
                    orders={orders}
                    title={`${reference.identity.name} (read-only)`}
                    designerMode
                />
            </div>
        </div>
    );
}
