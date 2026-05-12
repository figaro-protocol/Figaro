# Audit findings — 2026-04-29

Multi-area audit performed 2026-04-29 by parallel area-scoped agents (contracts / frontend UI/UX / off-chain TS / verification harnesses / SDK+scripts+prover+docs / public-readiness / stragglers / backlog-item current-state) plus a frontend deep-dive (component architecture / IA + nav / bespoke UX surfaces / visual+a11y / data+state+perf).

Highest-impact agent claims were spot-checked against source; items marked ⚠ still need confirmation. Some agent severities were downgraded against project context — notably "Halmos/Echidna/Certora/TLA⁺ not in CI" is intentional per memory, not a HIGH.

Findings are checked off in PRs that fix them.

---

## CRITICAL — public-push blockers

- **No `SECURITY.md`.** Settlement-kernel + formal-proofs repo with no responsible-disclosure path. Action: add SECURITY.md with disclosure contact, scope (`src/*.sol` + formal specs), bounty/no-bounty statement, link to DESIGN_DECISIONS.md so intentional patterns aren't filed as bugs.

---

## HIGH — pre-public-push fixes

### Repo readiness

- `.gitignore:15,28-33` still references `frontend2/...` from the pre-rename era. Current build outputs at `frontend/.next/`, `frontend/playwright-report/`, etc. are NOT being ignored. Action: replace `frontend2/` with `frontend/` on those six lines.
- Missing `CODE_OF_CONDUCT.md`, `SUPPORT.md`, `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md`. Standard public-repo hygiene. Action: add all four with brief project-specific content.
- `frontend/package.json:2` name is `"figaro-dapp"` — contradicts the protocol-not-product framing. Action: rename to `"figaro-runtime"` (matching `@figaro/core` SDK style).
- CLAUDE.md + `.github/copilot-instructions.md` will ship publicly. Both currently read as professional documentation per audit. Action: treat both as live public docs — never use them as scratchpads after public push; keep working notes in memory or a gitignored CLAUDE.local.md.

### Frontend / off-chain

- `frontend/lib/core/agreementManifest.ts:328,425,437,460` use **dynamic `require("viem")` inside hot-path encoder functions** (`schemaIdOf`, `getSectionDataBytes`, `computeSectionLeaf`, `hashPair`). Bundler resolution differences could yield divergent module instances and (worst case) divergent crypto output — direct parity-risk smell. Action: convert to static `import { keccak256, toHex, concat } from "viem"` at module top, OR add an inline comment explaining why dynamic-require was deliberately chosen (SSR? circular import?).
- `frontend/app/(app)/console/page.tsx` (Transactional tier) renders `<Console>` with no page-level wallet check. Verified 2026-04-29: reads (ProcessList, EventTimeline, etc.) render unconnected, writes (`CreateOrderPanel:73`) gate at the leaf with `useAccount`. Acceptable read-then-write pattern; no fix needed.
- `frontend/components/core/ClaimPanel.tsx:65` gates with ad-hoc `if (!address) return <div>Connect your wallet…</div>` instead of the canonical `<WalletGate>` per `feedback_marketing_panel_first.md` / `WalletGate.tsx` NatSpec. Functional but inconsistent. Action: refactor onto `<WalletGate>`.

### Verification

- `src/echidna/EchidnaToken.sol` is a 15-line **stub with zero properties**, but CLAUDE.md + memory claim "Echidna covers FigToken". Pick one: implement 5–8 FigToken properties (cap enforcement, supply conservation, balance non-negative, renounce-latch, no-mint-after-renounce) OR strike the FigToken-Echidna claim from CLAUDE.md + memory.

---

## MED — quality + maintainability

### Smart contracts

- Mixed error reporting breaks the custom-error convention used elsewhere: bare `revert("CumulativeValueOverflow")` at `src/FigaroCore.sol:281`; `require(_core != address(0), "ZeroAddress")` at `src/AttestationCoordinator.sol:107`; mixed `require`+custom-error at `src/DutchAuction.sol:84-86`. Action: convert each to a custom error.
- `src/OperatorRegistry.sol:143` low-level `.call{value: amount}("")` returns only `bool ok` with no revert reason. Action: use OZ `Address.sendValue(payable(msg.sender), amount)` for consistent revert behaviour.
- `src/CommitmentTypes.sol` Commitment struct lacks any human-readable `description` / annotation field — wallets show structured fields only. Closes a partial defense for the MetaMask-injection thread (open item §1 below). Action: evaluate adding a `string description` field, OR document the deliberate omission.

### Frontend / off-chain TS

- **8 silent-catch sites** swallow errors with no UI signal: `lib/core/orderApproval.ts:35,49`, per-role process hooks (`useMerchantProcess`/`useCourierProcess`) (×2), `lib/mechanisms/useGHGDisclosure.ts` (×2), `lib/mechanisms/useOperatorRegistry.ts` (×1), `lib/audit/auditBundlePdf.ts:182-186`. Action: replace with conditional dev-logging + emit to a notification surface where user-visible.
- `lib/audit/auditBundlePdf.ts:63-79` casts unvalidated RPC log args to typed event records (`as IndexedAttestationLog` / `as IndexedLog`) — silent record loss if event ABI ever drifts. Action: parse via viem `decodeEventLog` or assert required `args` keys.
- `lib/shared/schemaSpecSource.ts` preloads only 2 of 17 active schemas; the other 15 lazy-fetch from IPFS with no timeout. Action: preload all 17 OR add fetch timeout + retry.
- `lib/shared/runtimeFetchSource.ts:37-62` `safeJsonFromResponse()` returns `null` on every failure mode — caller can't distinguish 404 from network timeout from parse-error. Action: return tagged error object.
- Many pages missing route `metadata` exports (titles, OG tags) — affects `/financials/[processId]`, `/builders/assemblies`, several `/builders/*`. Action: add per-route `Metadata` with route-specific title + description.
- Most pages lack `loading.tsx` / `error.tsx` siblings. Action: add for transactional routes; marketing can use page-level Suspense.
- `next.config.mjs` CSP allows `style-src 'unsafe-inline'` for Tailwind utility generation — re-evaluate when Tailwind v4 (CSS-first) lands.
- **EIP-6963 wallet discovery NOT explicitly enabled** in `frontend/lib/shared/connectors.ts` RainbowKit config. Direct mitigation for the wallet-extension-shadowing vector. Action: enable EIP-6963 in wagmi config (one-line change typically).
- `frontend/react-app-env.d.ts` is a Create-React-App artifact in a Next.js project, included via `frontend/tsconfig.json:36`. Action: delete file + remove tsconfig entry.
- `frontend/texput.log` is a stray LaTeX intermediate in the Next.js tree. Action: delete + ensure `*.log` covered by frontend `.gitignore`.

### Verification + CI

- Halmos / Echidna / Certora / TLA⁺ all run manually (intentional per memory) but CONTRIBUTING.md doesn't say so. Public visitors won't know which tests gate merges vs. operator-discretion. Action: one paragraph per harness in CONTRIBUTING.md.
- `lint-token-ops.sh` runs only inside `./test-certora.sh` (manual). New transfer call sites in `src/` could merge before Certora rerun. Action: add the lint to a fast PR check (Foundry CI step) so drift is caught at PR time.

### Docs

- `docs/v5/VERIFICATION_MAP.md:138` references `frontend/lib/shared/institutionAssembly*.ts (6 files)` — verified 2026-04-29: those files do not exist. Should map to `frontend/lib/shared/assemblies/*.json` (5 files: disclosure-review, equipment-rental, freelance, procurement, local-commerce). Action: update path + count.
- `docs/v5/VERIFICATION_MAP.md:137,142` reference `/workbench` — canonical is `/terminal`. Action: rewrite to canonical name.
- `script/DeployMainnet.s.sol:177` carries `OperatorRegistry(0.001 ether, 365 days)` PLACEHOLDER values. Mainnet broadcast without override would deploy with placeholders. Action: read `OPERATOR_DEPOSIT_AMOUNT` + `OPERATOR_LOCK_PERIOD` from env; revert if unset.

---

## LOW + NIT roll-up

`deploy-local.sh:2` + `lint-token-ops.sh` use `set -e` only (should be `set -euo pipefail`). `script/Deploy.s.sol` vs `DeployMainnet.s.sol` use inconsistent validator-wiring patterns (inline vs `_wireValidator` helper) — unify. `script/Deploy.s.sol:111` comment says "18 reference schemas" but registers 16 validators (topology = manifest-only, ERC-8004 = reserved). Tailwind arbitrary values (`w-[380px]`, `h-[70vh]`) used in 30+ components — snap to scale or extend tailwind config. No TanStack Query `staleTime` / `gcTime` defaults set. Stale `TODO(...)` markers in `SettlementProceedsPanel.tsx:23` and `TokenBalances.tsx:62`. No CHANGELOG.md (or README pointer to `docs/v5/RELEASE_READINESS.md`). Root `package.json` missing `repository` / `homepage` / `bugs` / `author` / `description`. README has no CI / verification badges. `archive-frontend/tests/components/NotificationBell.test.tsx.new` exists in the (gitignored) archive — sweep on next housekeeping. `echidna/corpus-v5/` directory still on disk (gitignored). Duplicate unsuppressed `console.log("[OrderControls] mount", ...)` at `frontend/components/core/OrderControls.tsx:48,59`. Unsuppressed `console.log("[mint] tx hash:", hash)` at `frontend/components/core/TokenBalances.tsx:105`. `formal/README.md` is sparse — could enumerate the 15 invariants. No central `test/Constants.sol` for canonical test addresses/amounts.

---

## Backlog-item current-state observations (2026-04-29)

These confirmed the existing open-backlog framings; no action proposed beyond refining the entries.

1. **SchemaRegistry on-chain vs off-chain.** Code is cleaner than the memory table claimed: `SchemaRegistry` storage is a single `mapping(bytes32 => bool) registered` (dedup only). Version + uriHash live only in events, not storage. So the off-chain question really only applies to AttestationCoordinator's `schemaValidator` mapping (truly load-bearing) — the SchemaRegistry side is already event-sourced.
2. **Multi-token composability.** Clean slate confirmed — no TokenGate/TokenReward/multi-token primitives. Sellers' catalogue declares `acceptedTokens` but the kernel sees one `currency` per order. No work has crept in.
3. **BoL transferability mechanism design (parked).** V3 reference patterns confirmed in `archive-v3/src/composability/` (ConditionalAcceptModule, SettlementCascade, SettlementRouter, TemplateRegistry). No CancellableSeller-shape primitive in `src/`. Parked status holds.
4. **Supply-chain reference assembly.** 5 reference assemblies present (`disclosure-review`, `equipment-rental`, `freelance`, `procurement`, `local-commerce`). Schema gaps (hazmat / declared-value / customs) deferred per `docs/v5/BOL_RESEARCH.md`.
5. **Cart/catalogue ↔ OperatorRegistry coupling.** `CartModule` reads seller from cart items; `useMerchantCatalogue` fetches via `getOperatorMetadataURI` (registry-keyed). Cart does NOT gate submission on registration — by design (kernel separation). If seller withdraws between catalog-fetch and submit, current cart proceeds anyway.
6. **ETH→FIG deposit spam guard.** Confirmed: `OperatorRegistry.register()` requires exact `msg.value == registrationDeposit` (line 116); `withdraw()` returns same ETH (line 143). No FIG-deposit primitive exists in `src/fig/`.
7. **Kleros env wiring.** *Closed in Phase 0b 2026-04-29*: `lib/dispute/klerosCourts.ts` catalog + selector, `NEXT_PUBLIC_KLEROS_*` env wiring, mock Kleros stack on Anvil, dispute UI at `/dispute`, `cloudflare/` infra layer.
8. **MetaMask-injection threat model — what's already in place.** Stronger baseline than the open item assumes:
   - **Strict CSP** at `frontend/middleware.ts:44-62` — per-request nonce + `'strict-dynamic'` in prod, no `unsafe-inline`/`unsafe-eval` for scripts (styles still allow `unsafe-inline` for Tailwind — see MED above).
   - **Prototype-pollution defense** in `frontend/lib/shared/safeJson.ts:1-92` — `__proto__` / `constructor` / `prototype` keys rejected during parse; used by all IPFS-fetch paths.
   - **EIP-712 typed data** in CommitmentTypes.sol but lacks per-field human-readable description (see MED above).
   - **EIP-6963** is NOT explicitly enabled (see MED above).
   - **On-chain HTML (SSTORE2)** not present — research-stage only per backlog.
   The threat-model deliverable should now enumerate WHAT'S IN PLACE before evaluating WHAT'S MISSING — refine the open item to reflect this baseline.

### Additional finding from verification close-out

- [LOW] `prover/lib/src/kernel.rs:352` — `state.processes.get_mut(process_id).unwrap()` in finalize-process path. Precondition (`process exists during finalize`) is implicit. Action: replace with `.expect("invariant: process exists in finalize")` for observability.

---

## Frontend deep-dive (2026-04-29 follow-up)

Five additional area-scoped agents (component architecture / IA + nav / bespoke UX surfaces / visual+a11y / data+state+perf). Highest-impact claims spot-checked. Agent-level noise filtered (e.g., agent claimed `/legal` orphaned — false, well-linked from sitemap + 8 pages; agent claimed 36 of 37 `focus:outline-none` lack a ring — actually only 4 do; agent claimed `.DS_Store` tracked — none are). Findings below are post-filter.

### Top unifying findings

- ~~[HIGH] Agreement-clauses preview gap on `/sign` AND `/terminal`~~ — **WITHDRAWN 2026-04-29.** Agent claim was wrong. The gate exists: `AgreementPreviewModal.tsx` (Web2 audit Priority-4 fix) is mounted globally via `CommitmentSignPreviewProvider` in `app/providers.tsx:33`, and every sign path calls `requestSignConfirmation(commitment, agreement)` from `useCommitmentFlow.ts:260-261` before the wallet is invoked. Agent traced only the page-level JSX, missed the hook-level interceptor.
- [HIGH] **`QueryClient` initialized with zero options** (`frontend/app/Providers.tsx:22` — `const queryClient = new QueryClient();`). Defaults give refetch-on-window-focus + 0ms staleTime + 5min gcTime. Every tab switch re-fetches everything, including the indexer log scans. Action: set `defaultOptions: { queries: { staleTime: 5*60_000, gcTime: 10*60_000, refetchOnWindowFocus: false } }`.
- [HIGH] **FigaroProvider is one monolithic context** holding `syncVersion`, `queueItems`, `attestationEvents`, `selectedProcessId`. Any one state change re-renders every consumer. With the 4-second attestation poller running, the entire console tree re-renders ~15× per minute. Action: split into `ProcessContext`, `QueueContext`, `AttestationContext`; or memoize selectors via `useSyncExternalStore`.
- [HIGH] **Custom indexer can do unbounded full-history scans** (`frontend/lib/core/eventCache.ts:213-219`) — `getLogs({ fromBlock: startBlock, toBlock: "latest" })` with no per-fetch range cap. On any IndexedDB miss/corruption, first load fetches the entire chain history. Action: cap per-fetch block range (e.g., 10k blocks); persist cursor; resume on next load. Also: in-flight dedup map (eventCache.ts:41-43) doesn't `.finally()`-clean on rejection — failed fetches leave a permanently-pending entry.
- [HIGH] **IPFS fetches have no timeout** (`frontend/lib/shared/ipfsService.ts`). If gateway hangs, the browser waits ~30s+; user sees frozen button on audit-bundle PDF, evidence submit, agreement-prime. Action: race fetch against `setTimeout(reject, 5000)`; add fallback gateway list with retry-with-backoff.
- [HIGH] **ProcessGraphCanvas lens buttons lack ARIA tab semantics** (`frontend/components/core/ProcessGraphCanvas.tsx:635,645`). Buttons are styled as tabs (single-select, mutex highlight) but have no `role="tablist"` / `role="tab"` / `aria-selected`. Keyboard users can't arrow-key through them. Action: add ARIA tab roles to the lens-button group.
- [HIGH] **Information architecture has no canonical reading path.** Marketing exposes 14 pages, header surfaces only 5 (`/spec` `/builders` `/groups` `/fig` `/about`). The research spine (papers A–E + companion pages `/mechanism` `/economics` `/labor-law` `/compliance` `/displaced` `/sovereign-commerce`) is not surfaced as a curriculum anywhere; visitor must infer the order. Action: add a "Reading path" section on the homepage OR promote `/research` to the primary nav as the canonical entry.
- [HIGH] **Transactional surfaces are mutually unaware.** `/terminal` (initiator) doesn't link to `/sign` (counter-party); `/operators` describes the role but doesn't surface `<OperatorOnboarding>` as the registration flow; `/console` header is a single bold "Figaro Console" + "supervision" tag with no description of what it's for or who it's for; `/verify` and `/evidence-display` are reachable only via internal links. Action: cross-link the transactional surfaces; add a 1-2 line "what this is" header to `/console`; promote `/verify` somewhere discoverable.

### Component architecture

- [MED] **9 god-objects ≥400 lines** with natural split lines: BuilderAuthoringStudio (961 — extract utilities + AssemblyRegistryTable + AssemblyDraftEditor), ProcessGraphCanvas (735 — extract NodeRenderer + EdgeRenderer), DeliveryAttestationPanel (721 — split by mode: device / QR / photo+GPS / geohash), CatalogueEditorModule (707 — split merchant form / driver form / publish modal), OperatorOnboarding (643), OrderControls (614), CreateOrderPanel (573 — duplicates OrderControls patterns; share via `useOrderCreationFlow`), AgreementDrawer (490 — split per baseline-graph clause), CartModule (469).
- [MED] **`<WalletGate>` adoption is partial.** Memory already noted `ClaimPanel.tsx:65` as ad-hoc; deep-dive flagged `CatalogueEditorModule` and `CreateOrderPanel` as additional ad-hoc-gate sites. Action: refactor all three onto `<WalletGate>`.
- [MED] **Cross-feature coupling**: `modules/CartModule.tsx` imports `core/CommitmentSharePanel`; `modules/IncomingOrdersModule.tsx` reaches into `core/CommitmentSharePanel` for `deserializePayload`. Action: lift shared utilities to `components/shared/` or `lib/core/commitmentPayload.ts`.
- [MED] **Naming convention drift**: `modules/DeliveryAttestationPanel.tsx` breaks the `*Module` suffix used by every other file in `modules/`. Action: rename to `DeliveryAttestationModule`.
- [MED] **Missing shared module-state primitives**: `<ModuleEmptyStateCard>` exists in `shared/`, but loading + error variants are reimplemented inline across modules. Action: add `<ModuleLoadingStateCard>` + `<ModuleErrorStateCard>`.

### Information architecture + navigation

- [MED] **`/publications` ≈ `/research`** — both list the same 9 papers with overlapping framings (publications: GitHub-PDF + companion link; research: `/papers/` PDF + audience). Pick one as canonical or differentiate purpose explicitly.
- [MED] **`/about` ≈ `/help` overlap** — both narrate "what is Figaro"; no clear purpose boundary. Action: differentiate (`/about` = identity + tiers + naming; `/help` = FAQ; or merge).
- [MED] **`/fig` ≈ `/fig/claim`** — `/fig` shows token metrics + claim affordance via `useFigBalance` etc.; `/fig/claim` is just `<ClaimPanel/>`. Either consolidate or document the split (e.g., `/fig` = info, `/fig/claim` = embedded standalone for sharing). Action: pick one and redirect/link.
- [MED] **No breadcrumbs on depth-≥2 routes** — `/builders/designer/new`, `/builders/designer/edit/[slug]`, `/financials/[processId]`. Browser back works but there's no in-page wayfinding.
- [LOW] **Sidenav absent on nested layouts** — `builders/`, `local-commerce/`, `terminal/` layouts render children directly, no shared sub-nav. Acceptable given the small page counts; flag for re-evaluation if depth grows.
- [LOW] Mobile nav doesn't expose footer links; on mobile, footer is far down so secondary destinations (`/schemas`, `/groups/[name]`) are hard to discover.

### Bespoke UX surfaces (first-principles)

- [MED] **AgreementDrawer GHG dropdown doesn't surface that each standard maps to a different `schemaId`**. User picking "ISO-14064" doesn't know they're committing `figaro-ghg-iso-14064-v1`; the choice is presented as a "format" not a "term selection". Action: add inline label "GHG Standard (selects one of 5 sister schemas)" or a one-line explainer.
- [MED] **DisputeStatusPanel evidence section has no visual urgency cue when dispute is Pending without evidence submitted.** Section renders in neutral box; user who raised a dispute may not realize they need to submit the bundle. Action: amber background + 1-line prompt when `dispute.pending && !evidenceSubmitted`.
- [LOW] **Irreversibility messaging.** `AgreementPreviewModal` (the pre-sign gate) is the right place to verify whether "Once you sign, bonds are locked for the duration of this process" is shown. If not, add a 1-line warning there — but only if it isn't already; agent didn't read the modal body.
- [LOW] **ProcessGraphCanvas lens system is presented as visual-toggle, not as schema-projection.** Lenses ARE the schema-section selector, but the UI reads as "tabs". Reframing to multi-select ("show Value AND Geo simultaneously") would match the underlying model better. Out-of-scope to relitigate now; flag for next canvas iteration.
- [LOW] **CommitmentSharePanel agreement URI** displays `ipfs://Qm…` plain, no hint that the URI is load-bearing for the counter-party (must be pinned/reachable). Action: 1-line tooltip.
- [LOW] **/financials per-currency segments are not visually delimited.** Multi-currency processes scroll as concatenated balance-sheets; reader must infer the boundary. Action: horizontal rule or background tint between currencies.
- [LOW] **/verify Mode C ("Search") doesn't say up-front that it searches locally-loaded data only.** User pasting a hash for a process they haven't visited gets confusing "no match" with a recovery hint at the bottom. Action: prefatory hint above the search field.

### Visual design + a11y

- [MED] **No semantic color tokens.** `tailwind.config.ts` only extends `borderRadius`. Components use 9+ hue families (blue, green, red, amber, emerald, teal, indigo, purple, rose) ad-hoc for status/feature signaling. Action: extend `theme.colors` with semantic tokens (success / warning / error / info / neutral) mapped to concrete shades.
- [MED] **Console is dark-mode (`bg-zinc-950 text-zinc-100`); rest of app is light.** No `darkMode` config in Tailwind; no theme toggle; no `prefers-color-scheme` respect. Action: either unify to light theme OR add `darkMode: 'class'` config + system-pref detection + audit Console contrast.
- [MED] **Modals reimplement focus trap manually 3×** (`SubOrderModal`, `OrderConfirmationModal`, `AgreementPreviewModal`). Risk of focus bugs. Action: extract into `<ModalDialog>` shared primitive (or adopt Radix UI Dialog).
- [MED] **`globals.css:113` sets base `font-size: 17px`** inside a media query — Tailwind's `text-base` no longer maps to 16px on those breakpoints. Either intentional (document) or unintentional drift (revert).
- [MED] **`borderRadius` scale in `tailwind.config.ts` deviates subtly from Tailwind defaults** (DEFAULT 4px vs Tailwind's 6px). Likely unintentional. Action: align to defaults or document why.
- [MED] **Manual form inputs bypass `<FormField>`** — `ManifestForm`, `CatalogueBuilder`, operators components implement their own focus styling without `aria-invalid` / `aria-describedby`. Action: standardize on `<FormField>` wrapper.
- [LOW] **4 of 37 `focus:outline-none` sites lack a ring follow-up.** Action: audit those 4 and add `focus:ring-*`.
- [LOW] **`<input>` height is `h-10` (40px), below WCAG 2.5.5 target of 44px.** Action: bump to `h-11` for primary form inputs.
- [LOW] **`<img>` in OrderControls wraps `<form>` with redundant `<div role="form" aria-label="…">`** — the form element itself is semantic. Action: drop the wrapper.

### Data fetching, state, perf, network resilience

- [MED] **`registerAllModules()` runs eagerly at Providers module-load** (`Providers.tsx:21`). Every (app) route pays the full registry cost on first render even if only one module is used. Idempotent (`registered` guard at line 43) so subsequent mounts are free. Action: keep; or lazy-load module bundles per route group.
- [MED] **Static `import "@rainbow-me/rainbowkit/styles.css"` and static `RainbowKitProvider` import in Providers.tsx** — every (app) route loads the full RainbowKit CSS + module even if the user never opens the connect modal. Action: dynamic-import the modal trigger; CSS load is harder to defer but worth measuring.
- [MED] **`useTokenApproval` + `useBondPreview` fire 3 `useReadContract` calls each form render** (allowance, nonces, token name) instead of one `useReadContracts` batch. Action: consolidate.
- [MED] **No retry-with-backoff on IPFS pin failures**; single-gateway setup means one outage = one user-visible "IPFS pin failed". Action: fallback gateway list with 3-attempt backoff.
- [MED] **No error reporting integration** (no Sentry / LogRocket / custom sink). Production failures invisible. Action: add a minimal log-sink so error IDs + messages can be retrieved post-incident; gate behind env flag if user-tracking is a concern.
- [MED] **Wallet account-switch mid-flow is not handled** — `address` updates in CommerceProvider but in-flight `useWriteContract` calls are not aborted; queue items don't re-validate. Action: emit a clear-queue event when address/chainId changes.
- [LOW] **`.next/static/chunks` weight ≈108MB** per agent estimate (uncached). React-PDF chunk ~10MB (lazy-loaded ✓), RainbowKit + MetaMask SDK ~1.9MB each (eager). Action: measure with `next build --analyze`; consider deferring RainbowKit modal CSS.
- [LOW] **`useWatchContractEvent` × 2 on FigaroCore in `useProcessOrders.ts:103-118`** (OrderCommitted + OrderResolved) without chain-equality cleanup guard. Action: combine watcher or gate cleanup on chain switch.
- [LOW] **No `useSearchParams`-driven URL state for filters/tabs.** Tab selection in `/terminal` and `/verify` lives in component state, not URL — not deep-linkable. Acceptable for MVP; flag if shareable URLs become a need.
- [NIT] **`lib/console/provider.tsx:179` bare `catch {}`** — comment justifies it ("status fetch failed — availability already set"). Acceptable. Line 214 same pattern, no comment — verify intent.

### IA verdict (per the IA agent's framing)

- **Marketing publication coherent?** Partially. Foundations solid (zero CTAs, no funnels, academic framing). Wayfinding absent — 14 pages with no curriculum.
- **Transactional surface discoverable?** No. The transactional routes form three isolated subgraphs (terminal/sign isolated, operators registration hidden, console undocumented, verify/evidence-display orphaned from header).
- **Visitor knows where they are?** Partially. Marketing pages have clear headers; depth-≥2 transactional routes have no breadcrumb.
- **Visitor knows what to do next?** No. Few pages link onward. `/builders` doesn't link to `/builders/designer`; `/local-commerce` doesn't link to `/i/local-commerce`; `/terminal` doesn't link to `/sign`.
