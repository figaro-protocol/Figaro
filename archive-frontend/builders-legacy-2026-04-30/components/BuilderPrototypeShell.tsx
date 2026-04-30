"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { RegisteredAssemblyWorkspace } from "@/components/core/RegisteredAssemblyWorkspace";
import { listRegisteredAssemblies } from "@/lib/shared/assemblyRegistry";
import { SubjectProvenanceQuality } from "@/lib/shared/runtimeIdentity";
import { useRuntimeIdentitySource } from "@/hooks/core/useRuntimeIdentitySource";

interface Props {
    slug: string;
    runtimeIdentityUrl?: string;
}

function formatProvenanceQuality(quality: SubjectProvenanceQuality | undefined) {
    switch (quality) {
        case "signed":
            return "signed provenance";
        case "referenced-only":
            return "referenced-only provenance";
        case "unbound":
            return "unbound provenance";
        default:
            return "unknown provenance";
    }
}

export function BuilderPrototypeShell({ slug, runtimeIdentityUrl }: Props) {
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

    function updateManifestQuery(nextIdentityUrl?: string) {
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
        updateManifestQuery(nextIdentityUrl);
    }

    function resetIdentityOverride() {
        resetIdentityOverrideFromSource();
        updateManifestQuery(undefined);
    }
    const runtimeContext = useMemo(
        () => resolveAssemblyContext(slug, "local-anvil"),
        [resolveAssemblyContext, slug]
    );
    const artifact = runtimeContext?.artifact;

    if (!artifact) {
        const artifacts = listRegisteredAssemblies();
        return (
            <div className="rounded-lg border border-neutral-200 bg-white p-6 text-black">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">Prototype Not Found</p>
                <h2 className="text-2xl font-bold mb-2">Unknown assembly slug</h2>
                <p className="text-sm text-neutral-600 mb-4">
                    No registered assembly matched <span className="font-mono">{slug}</span>.
                </p>
                <div className="flex flex-wrap gap-3">
                    {artifacts.map((knownArtifact) => (
                        <Link
                            key={knownArtifact.assembly.identity.slug}
                            href={`/builders/prototype/${knownArtifact.assembly.identity.slug}`}
                            className="rounded border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
                        >
                            {knownArtifact.assembly.identity.name}
                        </Link>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {runtimeContext.boundSubjects.length > 0 || activeRuntimeIdentityUrl || runtimeSourceError ? (
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-5 text-black">
                    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">Runtime Context</p>
                    <h2 className="text-lg font-semibold mb-2">Bound subjects for this assembly</h2>
                    <div className="mb-4 rounded border border-neutral-200 bg-white p-3 text-sm text-black">
                        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">Runtime Identity</p>
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
                    <div className="mb-4 rounded border border-neutral-200 bg-white p-3 text-sm text-black">
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
                            <p className="text-neutral-600">Using fetched runtime identity document for this prototype view.</p>
                        ) : null}
                        {runtimeSourceStatus === "error" && runtimeSourceError ? (
                            <p className="text-red-700">Remote runtime identity document failed to load; using bundled fixture fallback. {runtimeSourceError}</p>
                        ) : null}
                    </div>
                    {runtimeContext.validationIssues.length > 0 ? (
                        <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                            <p className="text-xs font-semibold uppercase tracking-widest mb-2">Runtime Validation Warnings</p>
                            <div className="space-y-1">
                                {runtimeContext.validationIssues.map((issue) => (
                                    <p key={`${issue.code}-${issue.subjectAddress ?? 'global'}-${issue.bindingId ?? 'none'}`}>
                                        {issue.code}: {issue.message}
                                    </p>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    <div className="space-y-3">
                        {runtimeContext.boundSubjects.map((subject) => (
                            <div key={`${subject.subjectAddress}-${subject.assemblySlug}`} className="rounded border border-neutral-200 bg-white p-3">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <p className="font-semibold">{subject.displayName}</p>
                                    <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">
                                        <span className="rounded border border-neutral-300 px-2 py-1">
                                            {formatProvenanceQuality(subject.provenance?.quality)}
                                        </span>
                                        <span className="rounded border border-neutral-300 px-2 py-1">
                                            {subject.provenance?.bindingRefs.length ?? 0} binding refs
                                        </span>
                                        <span className="rounded border border-neutral-300 px-2 py-1">
                                            {subject.provenance?.signatureRefs.length ?? 0} signature refs
                                        </span>
                                    </div>
                                </div>
                                <p className="text-sm text-neutral-600">
                                    {subject.archetypeId} · roles: {subject.roleKinds.join(", ")}
                                </p>
                                {subject.provenance ? (
                                    <p className="text-xs text-neutral-600">
                                        Provenance: {subject.provenance.metadataRefs.length} metadata refs · {subject.provenance.assetRefs.length} asset refs · networks {subject.provenance.referencedNetworks.join(", ") || 'none'}
                                    </p>
                                ) : null}
                                {subject.provenance?.issues.length ? (
                                    <p className="text-xs text-neutral-500">
                                        Consistency flags: {subject.provenance.issues.join(", ")}
                                    </p>
                                ) : null}
                                {subject.sellerCatalogueMetadata ? (
                                    <p className="text-xs text-neutral-600">
                                        Geohash {subject.sellerCatalogueMetadata.location.geohash} · {subject.sellerCatalogueMetadata.menu.length} catalogue items
                                    </p>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            <RegisteredAssemblyWorkspace artifact={artifact} runtimeContext={runtimeContext} />
        </div>
    );
}