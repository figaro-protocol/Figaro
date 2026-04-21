import { NextRequest, NextResponse } from "next/server";
import {
    REFERENCE_ASSEMBLIES,
} from "@/lib/shared/institutionAssembly";
import {
    getInstitutionArtifactBySlug,
    listInstitutionArtifacts,
} from "@/lib/shared/institutionAssemblyRegistry";

/**
 * GET /api/semantic/assemblies
 * GET /api/semantic/assemblies?slug=figaro-eats
 *
 * Returns structured JSON for agent consumption:
 * - Without slug: manifest of all registered assemblies
 * - With slug: full artifact including derived model, risk boundaries, and validation
 *
 * All bigint values are serialized as strings (e.g. "1000000000000000000").
 */

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

export async function GET(request: NextRequest) {
    const slug = request.nextUrl.searchParams.get("slug");

    if (slug) {
        // RA-4: Validate slug format and don't echo raw input in errors
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(slug)) {
            return NextResponse.json(
                { error: "Invalid slug format" },
                { status: 400 }
            );
        }

        const artifact = getInstitutionArtifactBySlug(slug);
        if (!artifact) {
            return NextResponse.json(
                { error: "Assembly not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(serializeBigInts({
            assembly: artifact.assembly,
            validation: artifact.validation,
            model: artifact.model,
            riskBoundaries: artifact.riskBoundaries,
        }));
    }

    const artifacts = listInstitutionArtifacts();

    return NextResponse.json({
        count: artifacts.length,
        assemblies: artifacts.map((artifact) => ({
            slug: artifact.assembly.identity.slug,
            name: artifact.assembly.identity.name,
            description: artifact.assembly.identity.description,
            version: artifact.assembly.identity.version,
            valid: artifact.validation.ok,
            mechanisms: artifact.assembly.mechanisms.map((m) => ({
                id: m.mechanismId,
                kind: m.kind,
                riskClass: m.riskClass,
                enabled: m.enabled,
            })),
            roles: artifact.assembly.roles.map((r) => ({
                kind: r.roleKind,
                name: r.displayName,
            })),
            contracts: artifact.assembly.contracts.map((c) => ({
                key: c.key,
                required: c.required,
            })),
        })),
    });
}
