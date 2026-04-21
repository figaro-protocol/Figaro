import { NextRequest, NextResponse } from "next/server";
import {
    isValidAgreementHash,
    isValidAgreementUri,
    upsertAgreementPublication,
} from "@/lib/core/agreementPublicationRegistry.server";

export const dynamic = "force-dynamic";

// Simple per-IP rate limiter (60 requests/minute per IP)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return false;
    }
    entry.count += 1;
    return entry.count > RATE_LIMIT_MAX;
}

export async function POST(request: NextRequest) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (isRateLimited(ip)) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    let body: unknown;

    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const candidate = body as Partial<{ agreementHash: string; uri: string; cid?: string }>;

    if (!candidate.agreementHash || !isValidAgreementHash(candidate.agreementHash)) {
        return NextResponse.json({ error: "Invalid agreement hash" }, { status: 400 });
    }

    if (!candidate.uri || !isValidAgreementUri(candidate.uri)) {
        return NextResponse.json({ error: "Invalid agreement URI" }, { status: 400 });
    }

    const record = await upsertAgreementPublication({
        agreementHash: candidate.agreementHash,
        uri: candidate.uri,
        cid: candidate.cid,
    });

    return NextResponse.json(record, { status: 201 });
}