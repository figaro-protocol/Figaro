import { NextRequest, NextResponse } from "next/server";
import {
    AgreementRecordTooLargeError,
    AgreementRegistryFullError,
    isValidAgreementHash,
    isValidAgreementUri,
    upsertAgreementPublication,
} from "@/lib/core/agreementPublicationRegistry.server";
import { safeJsonParse } from "@/lib/shared/safeJson";

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

/**
 * Reject POSTs whose `Origin` header isn't on the configured allowlist.
 * Defense-in-depth on top of CORS preflight + JSON-only Content-Type.
 *
 * Configure via env: comma-separated list of allowed origins, e.g.
 *   FIGARO_ALLOWED_ORIGINS=https://app.figaro.example,https://staging.figaro.example
 *
 * **Defaults (Web2 adversarial-audit 🔴 Priority 1, 2026-04-26):**
 * - Production builds (NODE_ENV === "production"): unset allowlist
 *   rejects all POSTs. Production deployments MUST configure
 *   FIGARO_ALLOWED_ORIGINS or this endpoint is unreachable.
 * - Dev/test builds: unset allowlist permits all (so local dev doesn't
 *   need to set the env var to use the API).
 *
 * `Origin: null` (file://, data:, sandboxed iframes) is always rejected
 * when an allowlist is configured.
 */
function isOriginAllowed(origin: string | null): boolean {
    const allowlistRaw = process.env.FIGARO_ALLOWED_ORIGINS?.trim();
    if (!allowlistRaw) {
        // Production: fail-closed. A missing env var is a deployment bug,
        // not a usage bug; better to break the API than silently accept
        // every origin.
        if (process.env.NODE_ENV === "production") return false;
        // Dev/test: permissive passthrough.
        return true;
    }
    if (!origin || origin === "null") return false;
    const allowed = allowlistRaw.split(",").map((s) => s.trim()).filter(Boolean);
    return allowed.includes(origin);
}

export async function POST(request: NextRequest) {
    if (!isOriginAllowed(request.headers.get("origin"))) {
        return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (isRateLimited(ip)) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    let body: unknown;
    try {
        const text = await request.text();
        body = safeJsonParse(text);
        if (body === null) {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }
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

    try {
        const record = await upsertAgreementPublication({
            agreementHash: candidate.agreementHash,
            uri: candidate.uri,
            cid: candidate.cid,
        });
        return NextResponse.json(record, { status: 201 });
    } catch (error) {
        if (error instanceof AgreementRecordTooLargeError) {
            return NextResponse.json({ error: "Agreement URI too large" }, { status: 413 });
        }
        if (error instanceof AgreementRegistryFullError) {
            return NextResponse.json({ error: "Registry full" }, { status: 503 });
        }
        throw error;
    }
}