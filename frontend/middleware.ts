import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Per-response Content-Security-Policy with a fresh nonce per request.
 *
 * Replaces the static `'unsafe-inline'`-based CSP that was set in
 * `next.config.mjs` (HP-2 audit flag, threat-model 🔴 Priority 1). Every
 * legitimate inline `<script>` Next.js emits during RSC streaming /
 * hydration carries `nonce="<value>"` matching the CSP nonce; injected
 * `<script>` tags from a malicious browser extension or any other DOM-write
 * vector lack the nonce and are blocked by the browser.
 *
 * Architecture:
 *   1. Middleware generates a random nonce per request.
 *   2. Nonce is stamped into a forwarded request header (`x-nonce`) so
 *      server components can read it via `headers().get('x-nonce')` if
 *      they need to apply it to their own `<Script>` tags.
 *   3. The response CSP allows `'self' 'nonce-{value}' 'strict-dynamic'`
 *      for `script-src`. `'strict-dynamic'` lets nonce-bearing trusted
 *      scripts load further scripts transitively, so wagmi / WalletConnect
 *      / Next.js bootstrap continues to work without per-asset nonces.
 *   4. Next.js auto-injects the nonce into its own internal scripts when
 *      it detects `x-nonce` in the request headers.
 *
 * `style-src` keeps `'unsafe-inline'` — Tailwind generates inline
 * `style="..."` attributes pervasively. Style injection is a much weaker
 * vector than script injection (CSS exfiltration via background-image is
 * the main risk; no arbitrary code execution). Tightening this would
 * require a separate refactor to nonce every Tailwind utility, out of
 * scope for the threat-model fixes.
 *
 * The `/evidence-display` route still gets its narrower `frame-ancestors`
 * override so arbitration-forum reviewers can iframe the page; everything
 * else inherits the global `frame-ancestors 'none'` from the base policy.
 */

// The forums allowed to iframe /evidence-display — a SPACE-SEPARATED list of
// origins in CSP source syntax, one entry per forum a deployment recognizes
// (e.g. "'self' https://resolve.kleros.io https://*.kleros.io"). The dispute
// layer is provider-agnostic (a forum is deployment CONFIG, never a code
// default), so the unconfigured default admits no third-party ancestor.
const EVIDENCE_FRAME_ANCESTORS =
    process.env.EVIDENCE_DISPLAY_FRAME_ANCESTORS ?? "'self'";

const isDev = process.env.NODE_ENV !== "production";

function buildCsp(nonce: string, frameAncestors: string): string {
    // Dev needs 'unsafe-eval' for React Refresh / HMR and 'unsafe-inline'
    // for the HMR loader's dynamically-injected <script> tags (which
    // don't carry the per-request nonce). The 'nonce-{value}' +
    // 'strict-dynamic' pair stays unchanged in prod, which doesn't need
    // either of those relaxations because RSC streaming injects nonced
    // <script> tags directly. 'wasm-unsafe-eval' permits ONLY
    // WebAssembly compilation (not JS eval): @react-pdf/renderer's
    // fontkit compiles its Harfbuzz WASM module for the /audit evidence-
    // bundle PDF; dev got this for free from 'unsafe-eval', prod blocked
    // it (surfaced by the prod-build e2e, 2026-06-12 — the receipt PDF
    // stuck at "(not pinned)").
    const scriptSrc = isDev
        ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' 'unsafe-inline'`
        : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'`;

    return [
        "default-src 'self'",
        scriptSrc,
        // style-src keeps 'unsafe-inline' for Tailwind. See header comment.
        "style-src 'self' 'unsafe-inline'",
        // `http://127.0.0.1:*` whitelists the local IPFS gateway (Kubo at
        // 8080 by default) so `<img src="http://127.0.0.1:8080/ipfs/<cid>" />`
        // loads. The same loopback pattern is already allowed in `connect-src`
        // for the local Anvil RPC; mirroring it here for images keeps the
        // policy consistent. Public gateways (testnet) use `https:`, already
        // allowed.
        "img-src 'self' data: blob: https: http://127.0.0.1:*",
        "font-src 'self' data: https://fonts.gstatic.com",
        // `data:` is required for @react-pdf/renderer's fontkit, which
        // loads its Harfbuzz WASM module as a `data:application/octet-stream`
        // URI on first use. The /audit evidence-bundle PDF depends on it;
        // without this the PDF build hangs with the WASM blocked by CSP.
        // Widening connect-src to `data:` does not let pages exfil
        // data cross-origin (browsers still block that), so the practical
        // attack surface is narrow.
        // XMTP (the coordination channel): the browser SDK talks gRPC-web to
        // api.{dev,production}.xmtp.network on PORT 5558 — a CSP host wildcard
        // without a port matches only the default port, so :5558 must be
        // listed explicitly (both https and wss for streams). ephemera.network
        // is the SDK's message-history sync service. Surfaced 2026-06-12: the
        // real XMTP path ran for the first time and connect-src refused it
        // ("Failed to fetch" at IdentityApi/GetIdentityUpdates).
        "connect-src 'self' data: ws: wss: http://127.0.0.1:* https://*.walletconnect.com https://*.walletconnect.org https://*.infura.io https://*.xmtp.network https://*.xmtp.network:5558 wss://*.xmtp.network wss://*.xmtp.network:5558 https://*.ephemera.network",
        // @react-pdf/renderer also creates a Web Worker from a `blob:` URL
        // for layout. Without an explicit worker-src the fallback to
        // script-src disallows blob:, blocking the worker.
        "worker-src 'self' blob:",
        "frame-src 'self' https://*.walletconnect.com",
        `frame-ancestors ${frameAncestors}`,
        "base-uri 'self'",
        "form-action 'self'",
    ].join("; ");
}

export function middleware(request: NextRequest) {
    // crypto.randomUUID is available in the Edge runtime.
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

    const frameAncestors = request.nextUrl.pathname.startsWith("/evidence-display")
        ? EVIDENCE_FRAME_ANCESTORS
        : "'none'";

    const csp = buildCsp(nonce, frameAncestors);

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);

    const response = NextResponse.next({
        request: { headers: requestHeaders },
    });
    response.headers.set("Content-Security-Policy", csp);

    if (request.nextUrl.pathname.startsWith("/evidence-display")) {
        // Allow only the configured forum ancestors to iframe this route.
        // The CSP above already encodes the same allowlist via frame-ancestors;
        // dropping X-Frame-Options ensures the legacy header doesn't override.
        response.headers.delete("X-Frame-Options");
    }

    return response;
}

export const config = {
    matcher: [
        // Apply to all routes except API endpoints (which return JSON, not
        // HTML, so CSP is moot) and static assets.
        {
            source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
            missing: [
                { type: "header", key: "next-router-prefetch" },
                { type: "header", key: "purpose", value: "prefetch" },
            ],
        },
    ],
};
