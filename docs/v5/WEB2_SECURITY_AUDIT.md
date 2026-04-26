# Web2 Security Audit — Normal Pass

Status: 🟢 ZERO HIGH-SEVERITY FINDINGS — survey 2026-04-26
Scope: `frontend2/` Next.js 14 app, API routes, middleware, dependency manifest
Out of scope: UI ↔ MetaMask injection (separate threat model at `docs/v5/UI_METAMASK_INJECTION_THREAT_MODEL.md`)

---

## 1. Frame

The Web2 audit walks the standard checklist orthogonal to the MetaMask thread already covered: API routes (CSRF, auth, validation), SSR data leakage, dependency vulnerabilities (`npm audit`), cookies / session / persistent state, open redirects, external resource loads, SSRF, storage quota abuse, error message leakage, and security headers.

The headline: surface area is small. Four read-only GET routes + one rate-limited public POST + a single Next.js middleware. No authentication, no cookies, no session state. The protocol's "stateless coordination kernel" framing carries through to the Web2 layer — there's not much to attack because there's not much to mediate.

---

## 2. Surface-by-surface

### 2.1 API routes — CSRF + auth + input validation

Routes inventoried:
- `/api/semantic/agreements` (POST: publish; GET via `[agreementHash]` route below)
- `/api/semantic/agreements/[agreementHash]` (GET: fetch by hash)
- `/api/semantic/assemblies` (GET: list registered assemblies; slug filter)
- `/api/semantic/runtime` (GET: assembly runtime descriptor; multi-param)

**Input validation** — 🟢 OK. All route handlers use strict regex validation before consuming user input. `agreementHash` matches `^0x[a-fA-F0-9]{64}$`; `uri` matches `^(ipfs://|/ipfs/|https?://)`; slugs match a tight identifier regex. No Zod schema validation but the hand-rolled checks are tight enough; type assertions never coerce to a wider type than declared. (`api/semantic/agreements/route.ts:40-48`, `api/semantic/runtime/route.ts:48-81`).

**Rate limiting** — 🟢 OK for current deploy model. In-memory per-IP limiter (60 req/min) on the POST handler (`api/semantic/agreements/route.ts:10-24`). Defends single-instance dev/demo deployments; production behind a load balancer needs reverse-proxy or middleware rate limiting since the in-memory state isn't shared across instances.

**CSRF** — 🟡 GAP, low severity. POST handler has no explicit CSRF token, but the bypass vectors are bounded: requests must be JSON-typed (rules out form-encoded cross-origin POSTs), browsers enforce CORS preflight on cross-origin JSON POSTs, no cookies or session tokens are sent (so a cross-origin POST that lands wouldn't elevate any privilege). A defense-in-depth Origin-header check inside the POST handler would close the gap explicitly; it's not load-bearing today.

**Auth** — 🟢 OK by design. All routes are public — the registry is a public bulletin board, the assemblies endpoint enumerates published reference assemblies, the runtime endpoint resolves declarative composition. No wallet sigs, API keys, or session tokens involved.

**Open-redirect surface** — 🟢 OK. No handler accepts a URL param and uses `NextResponse.redirect(...)`. The only redirect is the static `/workbench → /terminal` 308 in `next.config.mjs:30-35`.

### 2.2 SSR data leakage

🟢 **No private keys / API secrets in server components.** `lib/core/agreementPublicationRegistry.server.ts` does file I/O against a local registry path — no secret material. Environment variables follow the `NEXT_PUBLIC_*` prefix convention; only public configs end up in client bundles.

🟢 **Error stacks are dev-only.** `app/error.tsx:54-64` gates `<details>`-wrapped stack rendering on `process.env.NODE_ENV === "development"`. Production builds don't surface stacks.

🟢 **CSP nonce handling is in-memory only.** `middleware.ts:65-92` generates the per-response nonce, forwards via `x-nonce` request header (server-internal), and stamps the response CSP. The nonce never enters URLs, querystrings, or persistent storage.

### 2.3 Dependency vulnerabilities (`npm audit`)

🟡 **18 high + 19 moderate findings; zero critical.** Distribution:
- ~14 of the 18 high-severity packages are devDependencies (the TypeScript / ESLint / Next build chain). Not bundled into production runtime; not a Web2 attack surface.
- The remaining few production-runtime mods are in the wallet integration ecosystem (`@wagmi/connectors`, `@metamask/sdk`, `@solana/web3.js`, transitively `uuid`, `@metamask/utils`, `@metamask/rpc-errors`). Closing them requires a wagmi major-version bump (v2 → v3) which is out of scope for a normal audit pass.
- Vulnerability classes are mostly ReDoS in glob/minimatch, JSON-parsing edge cases in ajv, and crypto-library version constraints. None have a direct exploit path through the semantic API surface (slug regex is hardened; JSON parsing routes through `safeJsonParse` with prototype-pollution defense).

**Verdict:** acceptable for a pre-audit baseline; track wagmi v3 upgrade as a separate item. Not a live exploit vector against the current attack surface.

### 2.4 Cookies / session / persistent state

🟢 **No cookies set.** No `Set-Cookie` headers, no `document.cookie` writes, no cookie-setting middleware.

🟢 **Wagmi connector persistence in localStorage.** Standard wagmi behavior — last-connected wallet ID + public addresses persisted under `wagmi.*` keys for reload recovery. No private keys, no session tokens, no PII.

🟢 **App-scoped localStorage usage.** All app writes use the `figaro:` key prefix (`figaro:commitment:*`, `figaro:assembly:*`, `figaro:handoff:*`, `figaro:agreement:*`). No unbounded writers found.

🟢 **No IndexedDB usage.** Handoff ECDH keys live in `sessionStorage` (cleared on tab close), not IDB. No persistent secret material on disk.

### 2.5 Open-redirect vectors

🟢 **All redirects are hardcoded.** `router.push()` / `<Link href={...}>` / `window.location.href = ...` targets across the codebase are all hardcoded paths or `next/link` imports. No user-controlled URL gets through to a redirect.

🟢 **Static redirects only.** `next.config.mjs:30-35` ships a single 308 from the renamed `/workbench` route. No dynamic redirects accept user input.

### 2.6 External resource loads (third-party trust)

🟢 **Fonts via Next.js Font API.** `Inter` from Google Fonts, loaded through Next's font pipeline (build-time pinning, hash-stable URLs). CSP allows `font-src 'self' data: https://fonts.gstatic.com`.

🟢 **No external `<script src>` tags.** All third-party JS is bundled via npm (wagmi, viem, RainbowKit, XMTP browser SDK). No SRI needed because the assets are vendored at build time.

🟢 **CSP `connect-src` allowlist is conservative.** WalletConnect (`*.walletconnect.com`, `*.walletconnect.org`), Infura RPC (`*.infura.io`), local Anvil (`http://127.0.0.1:*`, dev only). IPFS gateway URLs resolve client-side and pass through `https:` allow.

### 2.7 Server-side request forgery (SSRF)

🟢 **No user-controlled URL fetches in server code.** `agreementPublicationRegistry.server.ts` only writes to a local file; the URI is stored as a string, never fetched server-side. API route handlers return data from in-memory registries; no server-side `fetch()` of user-supplied URLs.

🟢 **Client-side IPFS fetches are safe.** `resolveContentURI()` whitelists schemes (`ipfs://`, `http://`, `https://`); `safeJsonFromResponse()` strips prototype-pollution keys; CID format is regex-validated before use.

### 2.8 Storage / quota abuse

🟢 **Browser localStorage is bounded.** Typical session usage <500 KB against a 5–10 MB quota. No realistic quota-fill attack.

🟡 **GAP — file-based agreement registry has no size limits.** `lib/core/agreementPublicationRegistry.server.ts:53-56` appends to `.figaro/agreement-publications.json` on every successful POST. Rate-limited (60 req/min per IP) but uncapped in total size. Local-dev only — the registry isn't meant for production deployments — but worth recording. Hardening for any production exposure: cap file size, rotate periodically, or move to a real database.

### 2.9 Error message leakage

🟢 **Generic API errors.** All routes return short string-only error messages (`"Invalid agreement hash"`, `"Assembly not found"`, `"Too many requests"`). No stack traces, no internal paths, no env data. Validation errors don't echo user input back (avoids confusion-with-input attacks).

🟢 **Error boundary stacks are dev-only.** `app/error.tsx:54-64` again — production users never see stacks.

### 2.10 Security headers — beyond CSP

Currently set in `next.config.mjs:38-65`:
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` ✓
- `X-Frame-Options: DENY` ✓
- `X-Content-Type-Options: nosniff` ✓
- `Referrer-Policy: strict-origin-when-cross-origin` ✓
- `Permissions-Policy: camera=(), microphone=(), geolocation=(self)` ✓
- `Content-Security-Policy` (per-request via `middleware.ts`) ✓

🟡 **Missing Cross-Origin-* headers** (OWASP Secure Headers recommendations):
- `Cross-Origin-Opener-Policy: same-origin-allow-popups` — would isolate the window object from any popup-opened cross-origin context. Useful if the app is deployed alongside other apps on the same origin.
- `Cross-Origin-Embedder-Policy: require-corp` — required for SharedArrayBuffer / Wasm threading. Not currently load-bearing.
- `Cross-Origin-Resource-Policy: same-origin` — prevents other sites from hotlinking app resources (images, scripts). Not critical given there are no sensitive resources to hotlink.

These three are defense-in-depth; none of them are required for current functionality. Worth adding for a hardened production deploy.

---

## 3. Summary verdict

| # | Surface | Status | Severity |
|---|---|---|---|
| 1 | API routes — input validation, rate limiting, auth | 🟢 OK | — |
| 1b | API routes — explicit CSRF token | 🟡 GAP | Low (mitigated by JSON-only + CORS preflight) |
| 2 | SSR data leakage | 🟢 OK | — |
| 3 | `npm audit` — high/critical runtime exposures | 🟡 GAP | Medium (mostly devDeps + wallet-lib transitives; no direct API exploit) |
| 4 | Cookies / session / persistent state | 🟢 OK | — |
| 5 | Open-redirect vectors | 🟢 OK | — |
| 6 | External resource loads (SRI / CSP allowlist) | 🟢 OK | — |
| 7 | Server-side request forgery (SSRF) | 🟢 OK | — |
| 8 | Storage quota abuse — browser side | 🟢 OK | — |
| 8b | Storage quota abuse — file-based dev registry | 🟡 GAP | Medium (local-dev only; production needs file-size cap + rotation) |
| 9 | Error message leakage | 🟢 OK | — |
| 10 | Security headers — baseline OWASP set | 🟢 OK | — |
| 10b | Security headers — Cross-Origin-* (COOP/COEP/CORP) | 🟡 GAP | Low (defense-in-depth only) |

**Zero high-severity Web2 findings.** Three 🟡 gaps, ranked by exploit-readiness:

---

## 4. Remediation recommendations (ranked)

**Priority 1 — file-based agreement-registry size cap.** Add a max-size precheck inside the POST handler before appending to `.figaro/agreement-publications.json`. Cap at a reasonable bound (e.g., 10 MB, ~10k entries). Reject with 503 when exceeded; log for cleanup. Also cap individual agreement payload size. Local-dev only today, but trivially exploitable at scale by a slow drip past the rate limiter — close it before production. ~30 min.

**Priority 2 — Cross-Origin headers (COOP/COEP/CORP).** Add to `next.config.mjs` static headers block. Recommended values: `COOP: same-origin-allow-popups` (lets the wallet popup work), `CORP: same-origin` (prevents hotlinking), skip COEP (forces CORS on every embedded resource — too restrictive without a specific need like SharedArrayBuffer). ~15 min.

**Priority 3 — explicit Origin-header check on POST.** Add `request.headers.get("origin")` validation against a configured deployment-origin allowlist inside `/api/semantic/agreements` POST handler. Defense-in-depth on top of the existing CORS + JSON-only mitigation. ~15 min.

**Priority 4 — wagmi v2 → v3 upgrade.** Closes the runtime moderate-severity dep vulns. Substantial effort (breaking changes across hooks, connectors, WalletConnect v2 → v3 migration). Track as its own item — not part of this audit pass.

---

## 5. Open follow-ups

- The `npm audit --json` output should be re-run post-wagmi-v3-upgrade to confirm the moderate findings drop.
- If the production deploy ever moves to a multi-instance / load-balanced topology, swap the in-memory rate limiter for a reverse-proxy or shared-store implementation.
- The agreement-publication registry's storage path is environment-configurable (`FIGARO_PUBLIC_AGREEMENT_REGISTRY_FILE`). When/if a real production registry is needed, that should move from a local JSON file to a database with proper ACID semantics, indexing, and operational tooling.

---

## 6. Provenance

- Survey conducted 2026-04-26 by an Explore subagent against `frontend2/` at SHA `c967ace`.
- Findings traced via grep across API route handlers, middleware config, `next.config.mjs`, dependency manifest (`npm audit --json`), and storage / fetch / redirect call sites.
- No code changes made during the survey.
