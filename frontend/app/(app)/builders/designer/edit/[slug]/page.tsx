"use client";

import { useMemo } from "react";
import { notFound } from "next/navigation";
import { DesignerCanvasHost } from "@/components/core/designer/DesignerCanvasHost";
import { REFERENCE_ASSEMBLIES } from "@/lib/shared/assembly";

interface Props {
    params: { slug: string };
}

export default function EditAssemblyPage({ params }: Props) {
    const reference = useMemo(
        () => REFERENCE_ASSEMBLIES.find((a) => a.identity.slug === params.slug),
        [params.slug],
    );

    if (!reference) notFound();

    // Forks share the same slug until the user renames; the inspector
    // identity editor is live so they can rebrand before publishing.
    const initial = useMemo(
        () => structuredClone(reference),
        [reference],
    );

    return <DesignerCanvasHost initialAssembly={initial} identityEditable={true} />;
}
