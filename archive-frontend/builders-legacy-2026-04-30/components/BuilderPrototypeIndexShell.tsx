"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { listAssemblySelectorCards } from "@/lib/shared/assemblyRegistry";
import { useRuntimeIdentitySource } from "@/hooks/core/useRuntimeIdentitySource";

interface Props {
    runtimeIdentityUrl?: string;
}

export function BuilderPrototypeIndexShell({ runtimeIdentityUrl }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const {
        identityUrlInputValue,
        setIdentityUrlInputValue,
        activeRuntimeIdentityUrl,
        activeRuntimeSource,
        resolveAssemblyContext,
        runtimeSourceStatus,
        runtimeSourceError,
        applyIdentityOverride: applyIdentityOverrideToSource,
        resetIdentityOverride: resetIdentityOverrideFromSource,
    } = useRuntimeIdentitySource({ runtimeIdentityUrl });

    function updateIdentityQuery(nextIdentityUrl?: string) {
        const nextParams = new URLSearchParams(searchParams?.toString() ?? "");

        if (nextIdentityUrl) {
            nextParams.set("identity", nextIdentityUrl);
        } else {
            nextParams.delete("identity");
        }

        const nextQuery = nextParams.toString();
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    }

    function applyIdentityOverride() {
        const normalizedValue = identityUrlInputValue.trim();
        const nextIdentityUrl = normalizedValue.length > 0 ? normalizedValue : undefined;

        applyIdentityOverrideToSource();
        updateIdentityQuery(nextIdentityUrl);
    }

    function resetIdentityOverride() {
        resetIdentityOverrideFromSource();
        updateIdentityQuery(undefined);
    }

    const cards = useMemo(() => listAssemblySelectorCards(), []);

    function buildPrototypeHref(slug: string) {
        const nextParams = new URLSearchParams();

        if (activeRuntimeIdentityUrl) {
            nextParams.set("identity", activeRuntimeIdentityUrl);
        }

        const nextQuery = nextParams.toString();
        return nextQuery ? `/builders/prototype/${slug}?${nextQuery}` : `/builders/prototype/${slug}`;
    }

    return (
        <div className="max-w-5xl mx-auto space-y-10">
            <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">Prototype Selector</p>
                <h1 className="text-5xl font-bold text-black mb-4">Multi-Assembly Builder Prototype</h1>
                <p className="text-lg text-black max-w-3xl">
                    Choose a registered assembly and render the same builder substrate against a different assembly contract.
                </p>
                <div className="mt-5">
                    <Link
                        href="/builders/designer"
                        className="inline-flex rounded border border-black px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-100"
                    >
                        Open Designer
                    </Link>
                </div>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-5 text-black">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">Runtime Preview Source</p>
                <h2 className="text-lg font-semibold mb-2">Resolve prototype previews against a runtime identity document</h2>
                <div className="mb-4 rounded border border-neutral-200 bg-white p-3 text-sm text-black">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center">
                        <input
                            aria-label="Runtime identity URL"
                            value={identityUrlInputValue}
                            onChange={(event) => setIdentityUrlInputValue(event.target.value)}
                            placeholder="https://example.com/runtime-identity.json"
                            className="min-w-0 flex-1 rounded border border-neutral-300 px-3 py-2 text-sm text-black outline-none focus:border-black"
                        />
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={applyIdentityOverride}
                                className="rounded border border-black px-3 py-2 text-sm font-semibold text-black hover:bg-neutral-100"
                            >
                                Apply Identity
                            </button>
                            <button
                                type="button"
                                onClick={resetIdentityOverride}
                                className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold text-black hover:bg-neutral-100"
                            >
                                Reset
                            </button>
                        </div>
                    </div>
                </div>
                <div className="rounded border border-neutral-200 bg-white p-3 text-sm text-black">
                    <p>
                        Runtime source: <span className="font-mono">{runtimeSourceStatus}</span>
                    </p>
                    <p>
                        Runtime origin: <span className="font-mono">{activeRuntimeIdentityUrl ?? "bundled-fixture"}</span>
                    </p>
                    {runtimeSourceStatus === "loading" ? (
                        <p className="text-neutral-600">Loading remote runtime identity document and falling back to bundled fixture until it resolves.</p>
                    ) : null}
                    {runtimeSourceStatus === "remote" ? (
                        <p className="text-neutral-600">Using fetched runtime identity document for index previews and outgoing prototype links.</p>
                    ) : null}
                    {runtimeSourceStatus === "error" && runtimeSourceError ? (
                        <p className="text-red-700">Remote runtime identity document failed to load; using bundled fixture fallback. {runtimeSourceError}</p>
                    ) : null}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {cards.map((card) => {
                    const runtimeContext = resolveAssemblyContext(card.slug, "local-anvil");
                    const boundSubjects = runtimeContext?.boundSubjects ?? [];

                    return (
                        <div key={card.id} className="rounded-lg border border-neutral-200 bg-white p-6">
                            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">
                                {card.assemblyClass}
                            </p>
                            <h2 className="text-2xl font-bold text-black mb-2">{card.name}</h2>
                            <p className="text-sm text-neutral-600 mb-4">
                                {card.description ?? "No description provided."}
                            </p>
                            <div className="space-y-1 text-sm text-black mb-5">
                                <p>Slug: <span className="font-mono">{card.slug}</span></p>
                                <p>Composition level: <span className="font-mono">{card.compositionLevel}</span></p>
                                <p>Mechanisms: <span className="font-mono">{card.mechanismCount}</span></p>
                                <p>Roles: <span className="font-mono">{card.roleCount}</span></p>
                                <p>Networks: <span className="font-mono">{card.networkTargets.join(", ")}</span></p>
                                <p>Bound subjects: <span className="font-mono">{boundSubjects.length}</span></p>
                            </div>
                            {boundSubjects.length > 0 ? (
                                <div className="mb-5 rounded border border-neutral-200 bg-neutral-50 p-3 text-sm text-black">
                                    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">
                                        Runtime Preview
                                    </p>
                                    {boundSubjects.map((subject) => (
                                        <div key={`${subject.subjectAddress}-${subject.assemblySlug}`} className="space-y-1">
                                            <p className="font-semibold">{subject.displayName}</p>
                                            <p className="text-xs text-neutral-600">
                                                {subject.archetypeId} · roles: {subject.roleKinds.join(", ")}
                                            </p>
                                            {subject.sellerCatalogueMetadata ? (
                                                <p className="text-xs text-neutral-600">
                                                    Geohash {subject.sellerCatalogueMetadata.location.geohash} · {subject.sellerCatalogueMetadata.menu.length} catalogue items
                                                </p>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                            <Link
                                href={buildPrototypeHref(card.slug)}
                                className="inline-flex rounded border border-black px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-100"
                            >
                                Open Prototype
                            </Link>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}