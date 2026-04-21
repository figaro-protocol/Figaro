"use server";

import {
    publishInstitutionAssemblyToWorkspace,
    unregisterInstitutionAssemblyFromWorkspace,
} from "@/lib/shared/assemblyPublication";
import type { PublishAssemblyResult, UnpublishAssemblyResult } from "@/lib/shared/assemblyPublication";

export async function publishInstitutionAssemblyAction(data: unknown): Promise<PublishAssemblyResult> {
    if (typeof data !== "string") {
        return { ok: false, issues: [{ severity: "error", path: "", message: "Invalid document format" }] };
    }
    return publishInstitutionAssemblyToWorkspace(data);
}

export async function unregisterInstitutionAssemblyAction(slug: string, deleteFile: boolean): Promise<UnpublishAssemblyResult> {
    return unregisterInstitutionAssemblyFromWorkspace(slug, { deleteFile });
}
