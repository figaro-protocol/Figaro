# Project Backlog

Living list of follow-ups, deferred work, and known gaps. Prune entries when they're done. Add a one-line entry when you defer work mid-session so it doesn't get lost.

Format per entry:
- **`[id]` Short title** — context + why deferred + what would close it. Optionally a link to the relevant code.

---

## Open

### Designer / DAG editor

- **`[D-1]` Post-commit navigation in cart** — `CartModule` computes `targetAssemblySlug` (via `mapFulfilmentToAssemblySlug`) and surfaces it on the `data-target-assembly` attribute, but the commit flow doesn't yet `router.push("/i/${slug}")` after a successful broadcast. Currently `clearCart()` + close panel. Wiring the navigation is a 3-line edit. Defer until manual testing of the multi-binding flow shows whether `/i/direct-sale` renders sensibly for Bob's Pizza. Code: `frontend/components/modules/CartModule.tsx`.

- **`[D-2]` Root-order fulfilment editor** — `defaultRootFulfilment` on the assembly seeds the root order's fulfilment when a fork loads in the Designer, but a forked draft can't change the root from the canvas (no edge pill — root has no incoming edge). Forking `direct-sale` and switching root from `consume-onsite` to `pickup` requires editing the JSON. Surface a fulfilment picker on the root node card OR in the Designer toolbar. Code: `frontend/components/core/ProcessGraphCanvas.tsx`, `frontend/app/(app)/builders/designer/edit/[slug]/page.tsx`.

- **`[D-3]` E2E flake on cold dev-server start** — `tests/e2e/builders-designer.spec.ts` has 2 specs that time out on first run and pass on retry. Next.js dev-mode JIT compile is the cause. Either pre-warm the route in a `beforeAll`, switch to a production build for e2e, or accept the flake. Defer until CI exists. Code: `frontend/playwright.config.ts`, the spec itself.

### Operator + cart integration

- **`[O-1]` More demo operators with `direct-sale` bindings** — Only Bob's Pizza Palace has both `local-commerce` AND `direct-sale` bindings as of this session. GreenLedger and Maria Castelli are consume-onsite-only but bound to disclosure-review and freelance assemblies (their "consume-onsite" semantics live within those, not direct-sale). If we want a richer `direct-sale` demo, add a counter-service merchant (e.g., a coffee shop or market stall) bound exclusively to `direct-sale`. Code: `frontend/lib/shared/runtime-fixtures/local-runtime-identity.json`.

- **`[O-2]` Assembly slug routing post-commit** — The cart's `mapFulfilmentToAssemblySlug` is bilateral (`direct-sale` vs `local-commerce`). When more topology-distinct assemblies join (e.g., a `bonded-procurement-cart` with inspector sub-orders), this map needs extension. Defer until that second non-local-commerce assembly is actually a cart consumer. Code: `frontend/lib/marketplace/fulfilmentRouting.ts`.

### Pre-existing test failures

- **`[T-1]` 10 runtime tests failing at HEAD** — `runtimeDataSource.test.ts` (2), `runtimeFetchSource.test.ts` (1), `runtimeIdentityDocument.test.ts` (2), `runtimeIdentityRegistry.test.ts` (3), `runtimeResolution.test.ts` (2). These were broken before today's session (verified via `git stash`). Each looks like a fixture vs validation mismatch. Investigate one at a time. Code: `frontend/tests/lib/runtime*.test.ts`.

### Wallet provider scope

- **`[W-1]` Marketing routes still load wagmi/RainbowKit** — Per CLAUDE.md "Wallet-provider scope per route", marketing pages should not pull the wallet provider into their client bundle. Today, all routes get `<Providers>` via the (app) layout. Splitting into `(marketing)/layout.tsx` (no Providers) vs `(app)/layout.tsx` (with Providers) is the canonical fix. Already partially done — `(marketing)` layout exists and doesn't mount Providers. Verify the split is complete and that no marketing route accidentally pulls wagmi. Code: `frontend/app/(app)/layout.tsx`, `frontend/app/(marketing)/layout.tsx`.

### Kernel-discipline-protected (do not pursue)

- **`[K-1]` Multi-currency bonding within one process** — Breaks same-unit comparability of the 2:1 bond ratio. CLAUDE.md flags this as a kernel anti-pattern. Multi-token vendor UX is achievable through composition (N independent monotoken processes, or wallet-side swap before commit). Listed here only so it doesn't get re-proposed.

### Schema authoring

- **`[S-1]` `figaro-consent-v1` in AgreementDrawer?** — The drawer currently doesn't surface the consent schema. Per the user (this session): only used for beta testing, not a Designer-time concern. Listed here in case the framing changes — if assemblies want consent committed at agreement-signing time, add it to the drawer. Code: `frontend/components/core/designer/AgreementDrawer.tsx`.

---

## Recently closed (this session, 2026-04-30)

These were on the open list earlier this session and are done. Listed for one cycle so the diff is auditable; prune at next session start.

- ~~Block-composition canvas archived~~ — `d6400c1`.
- ~~`/builders/designer/{edit,view}/[slug]` mount the DAG editor seeded from forked references~~ — `d6400c1`.
- ~~Sub-order edge picker restricts to `deliver:*`~~ — `02d551e`.
- ~~Direct-sale 1-node reference assembly + `defaultRootFulfilment` field~~ — `0c2b3f7`.
- ~~Cart picker reads merchant-declared `fulfillmentModes`~~ — `4da483e`.
- ~~Header button rule (Discover marketing-only, Connect (app)-only)~~ — `d6400c1`.
- ~~Stale Designer copy on `/builders` (described archived block-canvas vocabulary)~~ — `02d551e`.
- ~~`/composability` ↔ `/builders` tier-paragraph dedup with anchor links~~ — `02d551e`.
- ~~E2E coverage for DAG editor `/new` `/edit` `/view` (golden paths)~~ — `02d551e`.
