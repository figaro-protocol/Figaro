"use server";

import { publishAssemblyToWorkspace } from "@/lib/shared/assemblyPublication";
import type { PublishAssemblyResult } from "@/lib/shared/assemblyPublication";

export async function publishAssemblyAction(data: unknown): Promise<PublishAssemblyResult> {
    if (typeof data !== "string") {
        return { ok: false, issues: [{ severity: "error", path: "", message: "Invalid document format" }] };
    }
    return publishAssemblyToWorkspace(data);
}
