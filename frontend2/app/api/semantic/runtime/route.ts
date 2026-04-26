import { NextRequest, NextResponse } from "next/server";
import { getRegisteredAssemblyBySlug } from "@/lib/shared/assemblyRegistry";
import {
    resolveAssemblyRuntimeContext,
    resolveSemanticRuntimeSnapshot,
} from "@/lib/shared/runtimeResolution";

function serializeBigInts(obj: unknown): unknown {
    if (typeof obj === "bigint") return obj.toString();
    if (Array.isArray(obj)) return obj.map(serializeBigInts);
    if (obj !== null && typeof obj === "object") {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = serializeBigInts(value);
        }
        return result;
    }
    return obj;
}

function normalizeAddress(address: string) {
    return address.toLowerCase();
}

/**
 * GET /api/semantic/runtime?slug=figaro-eats
 * GET /api/semantic/runtime?slug=figaro-eats&networkTarget=local-anvil&bindingId=...
 * GET /api/semantic/runtime?slug=figaro-eats&subjectAddress=0x...&roleKind=restaurant
 *
 * Returns the same resolved runtime context used by the live assembly shell,
 * including bound subjects, provider-key bindings, selected role context, visible
 * mechanisms/modules, and assembly-scoped capabilities.
 */
export async function GET(request: NextRequest) {
    const slug = request.nextUrl.searchParams.get("slug");
    const networkTargetParam = request.nextUrl.searchParams.get("networkTarget");
    const bindingId = request.nextUrl.searchParams.get("bindingId");
    const subjectAddress = request.nextUrl.searchParams.get("subjectAddress");
    const roleKind = request.nextUrl.searchParams.get("roleKind");

    if (!slug) {
        return NextResponse.json(
            { error: "slug is required" },
            { status: 400 },
        );
    }

    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(slug)) {
        return NextResponse.json(
            { error: "Invalid slug format" },
            { status: 400 },
        );
    }

    if (networkTargetParam && !/^[a-zA-Z0-9:_-]{1,64}$/.test(networkTargetParam)) {
        return NextResponse.json(
            { error: "Invalid networkTarget format" },
            { status: 400 },
        );
    }

    if (bindingId && !/^[a-zA-Z0-9:_-]{1,128}$/.test(bindingId)) {
        return NextResponse.json(
            { error: "Invalid bindingId format" },
            { status: 400 },
        );
    }

    if (subjectAddress && !/^0x[a-fA-F0-9]{40}$/.test(subjectAddress)) {
        return NextResponse.json(
            { error: "Invalid subjectAddress format" },
            { status: 400 },
        );
    }

    if (roleKind && !/^[a-zA-Z0-9_-]{1,64}$/.test(roleKind)) {
        return NextResponse.json(
            { error: "Invalid roleKind format" },
            { status: 400 },
        );
    }

    const artifact = getRegisteredAssemblyBySlug(slug);
    if (!artifact) {
        return NextResponse.json(
            { error: "Assembly not found" },
            { status: 404 },
        );
    }

    const networkTarget = networkTargetParam ?? artifact.assembly.identity.networkTargets[0];
    const context = resolveAssemblyRuntimeContext(slug, networkTarget);
    if (!context) {
        return NextResponse.json(
            { error: "Assembly runtime not found" },
            { status: 404 },
        );
    }

    const selectedBoundSubject = bindingId
        ? context.boundSubjects.find((subject) => subject.bindingId === bindingId)
        : subjectAddress
            ? context.boundSubjects.find(
                (subject) => normalizeAddress(subject.subjectAddress) === normalizeAddress(subjectAddress)
            )
            : undefined;

    if (bindingId && !selectedBoundSubject) {
        return NextResponse.json(
            { error: "Runtime binding not found" },
            { status: 404 },
        );
    }

    if (subjectAddress && !selectedBoundSubject) {
        return NextResponse.json(
            { error: "Runtime subject not found" },
            { status: 404 },
        );
    }

    if (
        bindingId
        && subjectAddress
        && selectedBoundSubject
        && normalizeAddress(selectedBoundSubject.subjectAddress) !== normalizeAddress(subjectAddress)
    ) {
        return NextResponse.json(
            { error: "bindingId and subjectAddress do not resolve to the same runtime subject" },
            { status: 400 },
        );
    }

    const snapshot = resolveSemanticRuntimeSnapshot(context, {
        selectedBoundSubject,
        roleKind: roleKind ?? undefined,
    });

    if (roleKind && !snapshot.runtime.selectedRole) {
        return NextResponse.json(
            { error: "Role not available for the selected runtime context" },
            { status: 400 },
        );
    }

    return NextResponse.json(serializeBigInts(snapshot));
}