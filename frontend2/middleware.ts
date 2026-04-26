import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const EVIDENCE_FRAME_ANCESTORS =
    process.env.EVIDENCE_DISPLAY_FRAME_ANCESTORS ??
    "'self' https://resolve.kleros.io https://*.kleros.io https://*.kleros.eth.limo";

const isDev = process.env.NODE_ENV !== 'production';

const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline'";

const EVIDENCE_DISPLAY_CSP = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' ws: wss: http://127.0.0.1:* https://*.walletconnect.com https://*.walletconnect.org https://*.infura.io",
    "frame-src 'self' https://*.walletconnect.com",
    `frame-ancestors ${EVIDENCE_FRAME_ANCESTORS}`,
].join('; ');

/**
 * Middleware: route-specific header overrides.
 *
 * The evidence-display page is designed to be iframed by Kleros court.
 * The global X-Frame-Options: DENY from next.config.mjs must be relaxed
 * for that route so jurors can view the process timeline, while the route
 * keeps the same base CSP as the rest of the app with a narrower
 * frame-ancestors allowlist.
 */
export function middleware(request: NextRequest) {
    const response = NextResponse.next();

    if (request.nextUrl.pathname.startsWith("/evidence-display")) {
        // Allow only the configured Kleros-style ancestors to iframe this route.
        response.headers.delete("X-Frame-Options");
        response.headers.set("Content-Security-Policy", EVIDENCE_DISPLAY_CSP);
    }

    return response;
}

export const config = {
    matcher: ["/evidence-display"],
};
