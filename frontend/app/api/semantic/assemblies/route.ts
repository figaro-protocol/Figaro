import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/semantic/assemblies
 * GET /api/semantic/assemblies?slug=local-commerce
 *
 * Returns structured JSON for agent consumption. Previously surfaced
 * the bundled reference assemblies — those have been removed in the
 * reference-data migration. The semantic-layer migration to read from
 * the on-chain `AssemblyRegistry` is a separate project; until that
 * lands this route returns an empty list (or 404 for slug lookups).
 */
export async function GET(request: NextRequest) {
    const slug = request.nextUrl.searchParams.get("slug");

    if (slug) {
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(slug)) {
            return NextResponse.json(
                { error: "Invalid slug format" },
                { status: 400 }
            );
        }
        return NextResponse.json(
            { error: "Assembly not found" },
            { status: 404 }
        );
    }

    return NextResponse.json({
        count: 0,
        assemblies: [],
    });
}
