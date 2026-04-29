/**
 * Figaro beta gate Worker.
 *
 * The front door. Three states for any incoming request:
 *
 *   1. Valid session cookie: pass through to the Pages-hosted app.
 *   2. Has `?code=XYZ` query param: validate, redeem, mint session,
 *      set cookie, redirect to "/".
 *   3. Neither: show a minimal "enter your access code" HTML form.
 *
 * Codes are one-shot. Once a code is redeemed, the KV record's
 * `redeemedAt` timestamp is set and further redemption attempts of
 * the same code return "already redeemed."
 *
 * Session cookies expire after SESSION_TTL_SECONDS (default 30 days).
 * Revocation is operator-driven: delete the session record from
 * the SESSIONS KV namespace and the next request fails.
 */

interface Env {
    CODES: KVNamespace;
    SESSIONS: KVNamespace;
    PAGES_ORIGIN: string;
    SESSION_TTL_SECONDS: string;
}

interface CodeRecord {
    issuedAt: string;
    note?: string;
    redeemedAt?: string;
}

interface SessionRecord {
    code: string;
    redeemedAt: string;
}

const SESSION_COOKIE = "figaro-session";

export default {
    async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        // ── 1. Existing session? Pass through. ────────────────────────
        const sessionId = readSessionCookie(request);
        if (sessionId) {
            const session = await env.SESSIONS.get<SessionRecord>(sessionId, "json");
            if (session) {
                return forwardToPages(request, env);
            }
            // Stale cookie. Fall through to redemption / form.
        }

        // ── 2. Code in URL? Try redemption. ──────────────────────────
        const code = url.searchParams.get("code");
        if (code) {
            return await redeemCode(request, env, code);
        }

        // ── 3. POST from the access-code form. ───────────────────────
        if (request.method === "POST" && request.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) {
            const form = await request.formData();
            const submittedCode = String(form.get("code") || "");
            if (submittedCode) {
                return await redeemCode(request, env, submittedCode);
            }
        }

        // ── 4. Default: serve the access-code form. ──────────────────
        return new Response(accessCodeForm(), {
            headers: { "content-type": "text/html; charset=utf-8" },
        });
    },
};

async function redeemCode(request: Request, env: Env, code: string): Promise<Response> {
    const record = await env.CODES.get<CodeRecord>(code, "json");
    if (!record) {
        return new Response(accessCodeForm("Invalid access code."), {
            status: 401,
            headers: { "content-type": "text/html; charset=utf-8" },
        });
    }
    if (record.redeemedAt) {
        return new Response(accessCodeForm("This code has already been redeemed."), {
            status: 401,
            headers: { "content-type": "text/html; charset=utf-8" },
        });
    }

    // Mark code redeemed.
    const now = new Date().toISOString();
    await env.CODES.put(code, JSON.stringify({ ...record, redeemedAt: now }));

    // Mint session.
    const sessionId = crypto.randomUUID();
    const ttlSeconds = Number(env.SESSION_TTL_SECONDS) || 2_592_000;
    const session: SessionRecord = { code, redeemedAt: now };
    await env.SESSIONS.put(sessionId, JSON.stringify(session), {
        expirationTtl: ttlSeconds,
    });

    // Redirect to root with the session cookie set, stripping the
    // `?code=` param from the URL.
    const url = new URL(request.url);
    url.searchParams.delete("code");
    const redirectTarget = url.pathname + url.search + url.hash || "/";

    return new Response(null, {
        status: 302,
        headers: {
            "set-cookie": serializeSessionCookie(sessionId, ttlSeconds),
            location: redirectTarget,
        },
    });
}

function forwardToPages(request: Request, env: Env): Promise<Response> {
    const incoming = new URL(request.url);
    const target = new URL(env.PAGES_ORIGIN);
    target.pathname = incoming.pathname;
    target.search = incoming.search;
    target.hash = incoming.hash;

    // Forward the original request to Pages, preserving headers and body.
    // The session cookie travels with the request (same origin from
    // the browser's perspective).
    return fetch(new Request(target.toString(), request));
}

function readSessionCookie(request: Request): string | null {
    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(";")) {
        const [name, value] = part.trim().split("=");
        if (name === SESSION_COOKIE && value) return value;
    }
    return null;
}

function serializeSessionCookie(sessionId: string, ttlSeconds: number): string {
    return [
        `${SESSION_COOKIE}=${sessionId}`,
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
        `Max-Age=${ttlSeconds}`,
    ].join("; ");
}

/**
 * Minimal HTML form. Intentionally Spartan — the gate is a ceremony,
 * not a marketing surface. No CSS frameworks, no analytics, no
 * fonts loaded from CDN. The Project Operator can replace this
 * with branded HTML if desired without changing any logic.
 */
function accessCodeForm(error?: string): string {
    const errorBlock = error
        ? `<p style="color:#b00020;margin:1em 0">${escapeHtml(error)}</p>`
        : "";
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex,nofollow">
  <title>Figaro Beta — Access</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; max-width: 30em; margin: 4em auto; padding: 0 1em; color: #111; }
    h1 { font-size: 1.2em; }
    input, button { font: inherit; padding: 0.5em; box-sizing: border-box; }
    input[name="code"] { width: 100%; font-family: ui-monospace, monospace; }
    button { margin-top: 0.5em; }
    .meta { color: #555; font-size: 0.85em; }
  </style>
</head>
<body>
  <h1>Figaro Beta</h1>
  <p class="meta">This is a closed beta. Enter the access code provided in your invitation.</p>
  ${errorBlock}
  <form method="POST" action="/" autocomplete="off">
    <label>
      Access code<br>
      <input type="text" name="code" required autofocus>
    </label>
    <br>
    <button type="submit">Continue</button>
  </form>
</body>
</html>`;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
