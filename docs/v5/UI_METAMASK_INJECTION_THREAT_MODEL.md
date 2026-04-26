# UI ↔ MetaMask Injection Threat Model

Status: 🟡 DRAFT — survey 2026-04-26
Scope: `frontend2/` (the only active frontend; legacy `frontend/` archived)
Threat surface: the pipeline between "user clicks Sign" and "wallet prompt appears", plus the IPFS-fetched content that flows into the UI and (via `agreementHash`) into the signed message.

---

## 1. Frame

The Figaro frontend signs EIP-712 typed-data via wagmi/RainbowKit + injected wallets (MetaMask et al.). Three top-level concerns sit between the user's click and the signed transaction:

1. **Browser-platform layer.** What can a malicious browser extension or compromised script do once it's loaded into the same DOM?
2. **Untrusted-data layer.** Schema specs, catalogue metadata, agreement JSON, attestation JSON come from IPFS (or the registry endpoint, which proxies). What happens when that data is parsed and rendered?
3. **Signing-pipeline layer.** What does the user actually see in the wallet prompt? What does the application verify before delegating to the wallet?

The protocol's core defense is **hash-based signing**: only the merkle root of the agreement (and a few other commitment fields) is signed. Agreement terms are never directly serialized into the typed-data message. This collapses an entire class of "prompt injection into typed-data" attacks. But it pushes the burden onto the UI: the user sees `0xdeadbeef…` in the wallet prompt and must trust that this hash matches the agreement they assembled in the UI.

---

## 2. Attack vector catalogue

### 2.1 Extension shadowing of `window.ethereum`

A malicious browser extension can shadow `window.ethereum` between the dApp and MetaMask, intercepting RPC calls, modifying transaction parameters, or returning forged signatures.

- **Primary defense — EIP-6963 multi-provider discovery**: Active. `ClientInit.tsx:289` dispatches `eip6963:requestProvider` event and listens for dynamic provider registration. wagmi v2 auto-registers providers via `eip6963:announceProvider`. This means we don't rely on whoever wrote `window.ethereum` first — we discover providers via a structured event each declares itself on.
- **Direct `window.ethereum` access — devnet shortcut path only**: `getInjectedEthereumProvider()` in `useCommitmentFlow.ts` casts `window as Window & { ethereum?: ... }` and calls `provider?.request()` directly. After the 2026-04-26 fix, the helper bails on production builds (`process.env.NODE_ENV === "production"` early-returns null) and the call is scoped lazily to the `if (isDevnet)` branch — devnet shortcut requires both a non-production build AND `?e2e=devnet` URL param.
- **DevShim writes**: `lib/shared/devShims.ts:128-147` writes `window.ethereum` only if `NEXT_PUBLIC_DEV_ADDRESS` is set (env var only present in dev), AND it checks `if (!devWindow.ethereum)` first — won't overwrite an existing provider. (Survey initially flagged a race condition; rechecked the code path — the guard is in place. Devnet-only either way.)

**Status: 🟢 OK as of 2026-04-26.** Production signing flows go through wagmi connectors (EIP-6963 discovery), never direct `window.ethereum` access. The dev/devnet path is gated by both env-var-at-build-time AND URL-param-at-runtime. Defense-in-depth runtime guard inside `getInjectedEthereumProvider()` blocks any future code path that tries to use it in prod.

### 2.2 CSP allows `'unsafe-inline'` scripts

If a malicious browser extension or other script gains DOM write access, it can inject `<script>` tags that execute under the page's origin. CSP normally bounds this; ours doesn't.

- **Current state**: `frontend2/next.config.mjs:8-9` ships `script-src 'self' 'unsafe-inline'` in production. Dev mode adds `'unsafe-eval'` for HMR.
- **HP-2 audit flag** (prior audit, acknowledged): `'unsafe-inline'` is currently a fallback for Next.js RSC/SSR inline JSON payloads. The standard hardening path is **per-response nonce-based CSP** — Next.js middleware injects a `nonce` into every response, every legitimate inline script carries `nonce="<value>"`, and CSP only allows scripts matching the nonce. Injected scripts without the nonce are blocked.

**Status: 🔴 EXPOSED.** This is the highest-leverage single fix. Solid CSP turns "extension with DOM write" from "free script execution" into "execution bounded to the existing JS surface".

### 2.3 Prototype pollution via untrusted JSON

A `JSON.parse` of attacker-controlled JSON containing `__proto__` or `constructor` keys can pollute `Object.prototype`, contaminating every object in the runtime.

- **Trusted internal sources** (localStorage we wrote, sessionStorage for in-flight commitments): low risk; we control the write path. Currently use type assertions only — fine.
- **IPFS-fetched schema specs**: ✅ defended via `parseSchemaSpec()` in the SDK, which validates structure against a meta-schema before consuming. The function rejects unknown fields and shape-checks every key.
- **IPFS-fetched attestations** (AttestationViewer at `evidence-display/page.tsx:121-150`): ❌ **no validation**. Raw `.json()` is parsed and consumed directly via `attestation.mode`, `attestation.photoCID`, etc. An attacker who controls the IPFS CID (e.g. a malicious operator pinning their own attestation JSON) can inject `{"__proto__": {"foo": "bar"}}` and pollute `Object.prototype.foo`. Subsequent property reads anywhere in the app see `foo`.
- **IPFS-fetched agreement** (`agreementStore.ts:118`, `:77`): type-cast only, no schema validation. Same risk shape if registry endpoint is MITM'd or compromised.

**Status: 🟡 EXPLOITABLE-WITH-PRECONDITIONS.** Requires attacker control over an IPFS CID that the app fetches OR a compromise of the registry endpoint. App never assigns parsed objects to global scope or class prototypes, so the blast radius is bounded — but still real.

### 2.4 Agreement-hash opacity in the wallet prompt

The user signs a Commitment struct in the wallet prompt. Among its fields is `agreementHash` — a 32-byte merkle root. The wallet displays the hash; the user has no way to verify in the prompt that this hash corresponds to the agreement they built in the UI.

- **By design**: this is the protocol's structural choice. Signing terms-themselves would (a) bloat typed-data messages enormously, (b) create a prompt-injection surface for malicious operators to slip terms into the signed message, (c) break agreement-update workflows.
- **Existing mitigations**:
  - **Bilateral signatures** — both buyer and seller must sign the same hash. Buyer-only fraud requires the seller to be complicit.
  - **On-chain evidence** — `agreementHash` lands on-chain in `OrderCommitted` events. Off-chain readers can verify "did the buyer sign hash X?" → "what JSON pins to hash X?" → "is that the agreement terms shown?".
- **Gap**: no application-layer pre-sign preview modal. The buyer clicks a "Sign" button and goes straight to the wallet prompt, with no chance to review the hash-vs-terms mapping. Adding `<AgreementPreviewModal>` between click and prompt would close this — show the human-readable terms with the hash next to them; user confirms; then the wallet prompt opens.

**Status: 🟡 MITIGATED-BY-DESIGN.** The structural choice is sound. The UX gap is real but bounded by bilateral signing and on-chain evidence.

### 2.5 Clickjacking

Attacker embeds the Figaro app in an iframe on their own page, overlays UI to mislead the user into clicking Sign while a forged transaction is built underneath.

- **Defense**: CSP `frame-ancestors 'none'` (next.config.mjs:19) + `X-Frame-Options: DENY` header (line 66). Double-layer.
- **Exception**: `/evidence-display` route allows iframing from `'self' + kleros.io` (middleware.ts:22, line 39). Narrowly scoped — Kleros jurors view evidence in an iframed sub-page that doesn't sign anything.

**Status: 🟢 OK.** Frame-level defense is solid; the Kleros exception is correctly bounded.

### 2.6 `eval` / `Function` constructor reachability

If user-controlled JSON reaches `eval()` or `new Function(...)`, attacker can execute arbitrary code under the page origin.

- **Survey result**: no `eval()` or `Function()` constructor calls found in production code. `'unsafe-eval'` is enabled only in dev mode for React HMR.

**Status: 🟢 OK.** No surface in production.

### 2.7 IPFS-fetched content rendering as HTML / URLs

If IPFS-fetched JSON contains fields rendered into HTML attributes (`src`, `href`) or via `dangerouslySetInnerHTML`, attacker-controlled CIDs can inject scripts or arbitrary URLs.

- **Text rendering**: React escapes text nodes by default. All attestation fields rendered as `{value}` (escaped), no `dangerouslySetInnerHTML` found.
- **URL rendering**: `resolveContentURI()` in `lib/shared/merchantBranding.ts:52-66` whitelists `ipfs://`, `http://`, `https://`, and bare CIDs; rejects `javascript:`, `data:`, `blob:` and other dangerous schemes. Used for `<img src>` on merchant branding (logos, hero images) and attestation photos.
- **Assumption**: the configured IPFS gateway is trusted and serves over HTTPS. If the gateway is compromised, all IPFS-resolved images carry whatever the gateway returns.

**Status: 🟢 OK** for in-app rendering. The gateway-trust assumption is load-bearing and worth documenting.

### 2.8 `postMessage` / cross-frame communication

If the app handles `postMessage` from any iframe, the message contents are an injection surface.

- **Survey result**: no `postMessage` handlers found.

**Status: 🟢 OK.** No surface.

---

## 3. Summary verdict

| Vector | Status | Severity if exploited | Exploit precondition |
|---|---|---|---|
| Extension shadowing `window.ethereum` | 🟢 OK as of 2026-04-26 | High (signature forgery / parameter substitution) | Malicious extension installed; only reachable in dev/devnet (gated by NODE_ENV + URL param) |
| CSP `'unsafe-inline'` scripts | 🔴 EXPOSED | High (injected script under page origin) | Extension or other DOM-write injection |
| Prototype pollution via IPFS attestation JSON | 🟢 OK as of 2026-04-26 | Medium (corrupt local component state) | Required attacker control over IPFS CID; mitigated via `safeJsonFromResponse` reviver-based key stripping |
| Prototype pollution via registry-fetched agreement JSON | 🟢 OK as of 2026-04-26 | Medium (same) | Registry compromise / MITM; mitigated via same helper |
| Agreement-hash opacity in wallet prompt | 🟡 MITIGATED-BY-DESIGN | Low (off-chain evidence catches forgery) | Operator collusion |
| Clickjacking | 🟢 OK | — | — |
| `eval` / `Function` reachability | 🟢 OK | — | — |
| IPFS content rendered as HTML/URL | 🟢 OK | — | — (IPFS gateway is trusted) |
| `postMessage` injection | 🟢 OK | — | — |
| DevShim race on `window.ethereum` | 🟢 DEV-ONLY | — | — |

---

## 4. Remediation recommendations (ranked)

**Priority 1 — CSP nonce-based hardening.** Replace `'unsafe-inline'` with per-response nonces in Next.js middleware. Highest leverage single change: turns "extension with DOM write" from "free script execution" into "execution bounded to the JS surface that already shipped with the response". Est: 2-4 hours including tests.

**Priority 2 — ✅ Landed 2026-04-26.** On closer reading the exposure was smaller than the survey framed: production signing flows already go through wagmi (EIP-6963), and the only direct `window.ethereum` access is in the devnet-shortcut path. Fix added a runtime production-build guard inside `getInjectedEthereumProvider()` (returns null in prod even if some future call site reaches it) and scoped the call lazily to the `if (isDevnet)` branch. Sealing `window.ethereum` via `Object.defineProperty` was considered but rejected — wallet ecosystem behavior is too varied (some legit extensions update the provider object after EIP-6963 announce), and the production sign path no longer touches `window.ethereum` directly so sealing buys nothing additional.

**Priority 3 — ✅ Landed 2026-04-26.** Scope expanded from the two sites the survey listed (evidence-display + agreementStore) to the full set of network-fetched JSON parse sites — same defense, same shape, no point leaving 10 instances unhardened. New helper at `frontend2/lib/shared/safeJson.ts` exposes `safeJsonParse` and `safeJsonFromResponse`, both stripping `__proto__` / `constructor` / `prototype` keys via a `JSON.parse` reviver (14 unit tests). Applied at: `evidence-display/page.tsx`, `agreementStore.ts` (3 sites), `useOperatorRegistry.ts`, `catalogueFetcher.ts`, `discoveryService.ts` (2 sites), `merchantBranding.ts`, `driverOfferingFetcher.ts`, `useDidWeb.ts`, `xmtpChannel.ts`. One site (`runtimeResolution.ts:251`) deferred — the `RuntimeAssetDocumentResponseLike` fetcher abstraction exposes only `.json()`, not `.text()`; expanding the interface would constrain test stubs, and the parsed document goes through `parseRuntimeAssetDocument` validator immediately so the prototype-pollution surface is bounded.

**Priority 4 — Pre-sign agreement preview modal.** Insert `<AgreementPreviewModal>` between "user clicks Sign" and the wallet prompt. Show: agreement terms (line items, sections, addresses, amounts) with the computed `agreementHash` displayed alongside. User clicks Confirm; only then does the wallet prompt open. Closes the agreement-hash opacity gap. Est: 4-6 hours including tests.

**Priority 5 — Document IPFS gateway trust assumption.** Add a section to CLAUDE.md / a security doc explaining that all IPFS-rendered content (images, attestation evidence, agreement terms) is gateway-trusted, what compromise of the gateway would expose, and how to harden by running a self-hosted gateway with content-hash verification.

---

## 5. Open questions

- Should we adopt EIP-712 `description` field convention (every signable struct carries a human-readable string the wallet displays)? Standard support across wallets is uneven; MetaMask supports `domain.name` but not arbitrary description fields. Worth tracking the EIP space.
- Transaction-simulation preview (via `eth_call` dry-run) before sign — useful for resolution / withdrawal flows where the user can verify "will this actually transfer X tokens to me?". Adds RPC roundtrip latency; worth considering for high-value flows only.
- The ERC-6963 spec is still settling; check that wagmi's implementation matches the latest revision and that we handle the announce/request lifecycle correctly across the full page lifetime, not just on initial mount.

---

## 6. Provenance

- Survey conducted 2026-04-26 by an Explore subagent against `frontend2/` at SHA `5ca5670`.
- Underlying findings traced via grep across CSP config, `useAccount` / `useSignTypedData` call sites, `JSON.parse` paths, IPFS-content-rendering paths.
- No code changes made during the survey.
