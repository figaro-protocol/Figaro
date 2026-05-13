import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/semantic/runtime?slug=local-commerce
 *
 * Previously resolved an assembly's full runtime context (bound
 * subjects, role bindings, capabilities, mechanism visibility) from
 * the bundled reference-assembly + reference-operator manifest. That
 * surface was retired with the reference-data migration; this route
 * always returns 404 until the semantic-layer migration replaces it
 * with an on-chain AssemblyRegistry + OperatorRegistry composition.
 */
export async function GET(request: NextRequest) {
    const slug = request.nextUrl.searchParams.get("slug");

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

    return NextResponse.json(
        { error: "Assembly not found" },
        { status: 404 },
    );
}
