"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AssemblyWorkspace } from "@/components/core/AssemblyWorkspace";
import { listInstitutionArtifacts } from "@/lib/shared/institutionAssemblyRegistry";
import { resolveAssemblyRuntimeContext } from "@/lib/shared/runtimeResolution";
import { FIXTURE_RUNTIME_IDENTITY_SOURCE } from "@/lib/shared/runtimeIdentityRegistry";

interface Props {
    slug: string;
}

export function AssemblyPageShell({ slug }: Props) {
    const runtimeContext = useMemo(
        () => resolveAssemblyRuntimeContext(slug, "local-anvil", FIXTURE_RUNTIME_IDENTITY_SOURCE),
        [slug],
    );
    const artifact = runtimeContext?.artifact;

    if (!artifact) {
        const artifacts = listInstitutionArtifacts();
        return (
            <div className="space-y-6">
                <div className="rounded-lg border border-neutral-200 bg-white p-6 text-black">
                    <p className="mb-4 text-sm text-neutral-600">
                        No assembly matched {slug}.
                    </p>
                    <div className="flex flex-wrap gap-3">
                        {artifacts.map((a) => (
                            <Link
                                key={a.assembly.identity.slug}
                                href={`/assembly/${a.assembly.identity.slug}`}
                                className="rounded border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
                            >
                                {a.assembly.identity.name}
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <AssemblyWorkspace artifact={artifact} runtimeContext={runtimeContext} />
    );
}
