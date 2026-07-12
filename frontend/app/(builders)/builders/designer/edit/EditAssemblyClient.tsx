"use client";

/**
 * EditAssemblyClient — loads a saved draft by slug into the
 * <DesignerCanvas>. If the slug doesn't match a draft in this
 * browser's localStorage, the canvas surfaces a "draft not found"
 * empty state.
 */

import { DesignerCanvas } from "../_components/DesignerCanvas";

export function EditAssemblyClient({ slug }: { slug: string }) {
    return <DesignerCanvas seed={{ kind: "draft", slug }} />;
}
