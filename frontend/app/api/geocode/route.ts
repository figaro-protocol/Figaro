import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side proxy for OpenStreetMap Nominatim geocoding. The
 * onboarding "From address" button calls this route, the route
 * fetches Nominatim with a project-identifying User-Agent (per
 * Nominatim's usage policy) and returns the JSON unchanged.
 *
 * Why a proxy: browser extensions (uBlock Origin, Privacy Badger,
 * Brave Shields) routinely block `nominatim.openstreetmap.org` as a
 * tracker. Routing through our own origin sidesteps the blocks and
 * keeps the dependency invisible to the client.
 *
 * Nominatim rate limit is 1 request/second. For a single
 * user-initiated click that's well within budget; if onboarding
 * traffic ever spikes the route can be fronted with a token-bucket
 * rate limiter.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export async function GET(req: NextRequest) {
    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q) {
        return NextResponse.json({ error: "missing-q" }, { status: 400 });
    }

    const url = `${NOMINATIM_URL}?q=${encodeURIComponent(q)}&format=json&limit=1`;

    try {
        const res = await fetch(url, {
            headers: {
                "Accept": "application/json",
                "User-Agent": "Figaro-Onboarding/1.0 (+https://figaro.network)",
            },
            cache: "no-store",
        });

        if (!res.ok) {
            return NextResponse.json(
                { error: "upstream-error", status: res.status },
                { status: res.status === 429 ? 429 : 502 },
            );
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json(
            {
                error: "fetch-failed",
                detail: err instanceof Error ? err.message : String(err),
            },
            { status: 502 },
        );
    }
}
