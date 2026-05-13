"use client";

/**
 * EditAssemblyClient — thin wrapper that picks the right <DesignerCanvas>
 * seed for /builders/designer/edit/[slug]:
 *   - reference slug → fork seed (transitional; removed when
 *                       REFERENCE_ASSEMBLIES is deleted in Phase 6)
 *   - any other slug → draft seed (client confirms localStorage hit)
 */

import { DesignerCanvas, type DesignerSeed } from "../../_components/DesignerCanvas";
import type { Assembly } from "@/lib/shared/assembly";

interface Props {
    slug: string;
    reference: Assembly | null;
}

export function EditAssemblyClient({ slug, reference }: Props) {
    const seed: DesignerSeed = reference
        ? { kind: "fork", reference }
        : { kind: "draft", slug };
    return <DesignerCanvas seed={seed} />;
}
