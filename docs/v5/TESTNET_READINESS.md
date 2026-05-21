# Testnet Readiness — Punch List

Single-file inventory across backlog, papers, frontend, tests, and doc/memory hygiene.
Source-of-truth: this file. Compiled 2026-05-06 from five parallel read-only audits.
When an item closes, **delete the line** — do not append done-markers.

> Scope note: testnet means Sepolia. Mainnet items are tracked but not gating.

---

## 1. Backlog (carryover from `~/.claude/projects/-Users-adaliana/memory/project_backlog.md`)

Testnet-relevant items only. The full backlog stays canonical.

### 1A. Active on-device work (must close before testnet flip)

- [ ] **P0-1: handoff certification coverage gaps** — `merchant view binds zero handoff modules` per `local-commerce.reference.json`; merchant is on one side of every handoff. Pickup and consume-onsite handoff shapes need design distinct from delivery-shaped modules.
- [ ] **P0-3: multi-tx checkout** (decided 2026-05-01) — extend `prepareOrderCommitment` to multi-commitment; extend OperatorRegistry metadata schema with per-assembly variable array; cart UX for N-sign; sequential/batched signing path; designer publish-time validation refusing >~2,145 leaf orders.
- [ ] **P0-4: hybrid IPFS-pin + XMTP CID transport** (decided 2026-05-01) — pin payload to IPFS at buyer-side share time; envelope carries CID; seller subscriber dereferences CID-only.

### 1B. PAUSED testnet/Cloudflare items (must un-pause before flip)

- [ ] **Audit `script/Deploy.s.sol`** — currently Anvil-shaped; revise env-var contract; verify atomic schema-validator binding composes on Sepolia.
- [ ] **Audit `script/DeployMainnet.s.sol`** — env-var completeness, no mocks, atomic schema-validator binding.
- [ ] **Cloudflare runbook** — `cloudflare/README.md` step 5 has Anvil framing; scrub for Sepolia.
- [ ] **CF infra provisioning** — KV namespaces (`CODES`, `SESSIONS`, `CONTRACT_ALLOWLIST`); rpc-proxy Worker pointing at Sepolia; contract-address allowlist populated post-deploy. Both `wrangler.toml` files contain `REPLACE_WITH_*_NAMESPACE_ID` placeholders.
- [ ] **WS subscription forwarding** — `eth_subscribe` allowlisted; Worker→Sepolia path needs WS-specific handling. `cloudflare/workers/rpc-proxy/README.md:112`.
- [ ] **Kleros court IDs** — verify against klerosboard.com pre-mainnet (Liquid → KlerosCore V2; Gnosis IDs differ). Sepolia first.

### 1C. Code-deferred items (surfaced 2026-05-01)

- [ ] **`activeBondSum` reconstruction** — `frontend/components/core/TokenBalances.tsx:62`. Decide live-with vs off-chain index.
- [ ] **Multi-binding disambiguation** — `frontend/lib/shared/operatorListing.ts:154-155`.
- [ ] **Designer publish-to-registry** — `app/(app)/builders/designer/edit/[slug]/page.tsx:321`. Local-storage drafts only; on-chain registration is a follow-up.
- [ ] **Subtree cumulative-value recompute on agreement edit** — `frontend/lib/designer/syntheticProcess.ts:354-356`. Stage-6 work.

---

## 2. Papers

19 .tex files in `paper/`. Publication-track, **not testnet-gating** — but corpus consistency is needed before any arXiv batch.

- [ ] **READY (7) — could ship today.** `figaro-mechanism`, `figaro-verification`, `figaro-agent-coordination`, `figaro-airways`, `figaro-tradelens`, `figaro-accounting`, `figaro-protocol-extension`.
- [ ] **OPEN-REMEDIATION (9).** Apply the eight-rule audit pattern from CLAUDE.md "Paper Authorship Discipline":
  - [ ] `figaro3b.tex`
  - [ ] `figaro3b1.tex`
  - [ ] `figaro3b2.tex`
  - [ ] `figaro3b3.tex`
  - [ ] `figaro3d.tex`
  - [ ] `figaro3e.tex`
  - [ ] `figaro3f.tex`
  - [ ] `figaro3f1.tex`
  - [ ] `figaro3f2.tex`
- [ ] **UNREVIEWED (3).** Never had a remediation pass:
  - [ ] `figaro3h.tex`
  - [ ] `figaro3i.tex`
  - [ ] `figaro3m.tex`

Cross-corpus drift to resolve before mixed submission: process-chain terminology in 8 papers; companion-paper references in 12; contact-footer in 12.

---

## 3. Frontend

35 routes audited (14 marketing + 21 app). All Layer A schema specs present (17/17 — 16 runtime-attestable + figaro-topology-v1). No orphaned components. Designer at `/builders/designer/new` confirmed canonical and functional.

- [ ] **STUB: `/builders/designer/view/[slug]`** — wired but read-only-view completeness unverified. Verify before testnet, or document as deferred.
- [ ] **Doc-code drift: `FRONTEND.md` omits `/audit`** (generic, no processId — exists in code).
- [ ] **P3-14 marketing re-audit** (from backlog) — `/protocol`, `/composability`, `/cryptoeconomics`, `/groups`, `/local-commerce`, `/integrate`, `/schemas` never audited against new IA. `/cryptoeconomics` has dead empty-state framing now that all 8 disciplines are convened.
- [ ] **P3-15 one-pager** — protocol-level vs ecosystem-level tokenomics tiers explicit.
- [ ] **P3-16 Marketing Move 2** — institution frame promoted to homepage (currently only on `/protocol:56`).
- [ ] **P3-17 Marketing Move 4** — worked-assembly narrative on homepage (currently only on `/local-commerce`).
- [ ] **P3-18 Marketing Move 5** — disarm "no intermediaries" — rework against `/protocol` + homepage (`/sovereign-commerce` no longer exists).
- [ ] **P3-19 content-loss audit** — verify these were re-homed not deleted: Arendt "capacity to have commerce"; wallet-as-res-and-persona; Coasean threshold-shift; "platform isn't a fact of nature."

---

## 4. Tests

**Testnet blockers: none identified.** Foundry, TLA+, and core e2e flows are complete.

### 4A. Complete

- [x] **Foundry** — kernel, extensions, FIG, and the 16 schema validators, all tested.
- [x] **TLA+** — 24 invariants across 3 models (`MC.tla` + `FigToken.tla` + `MC_RpgfMinter.tla`); `./test-tla.sh` runs exhaustively.
- [x] **Playwright devnet** — connect → designer → commit → resolve path covered (`lifecycle.devnet.spec.ts`, `eats-lifecycle.devnet.spec.ts`, `permit.devnet.spec.ts`, `commitment-share.devnet.spec.ts`, `console.devnet.spec.ts`, `ghg-workflow.devnet.spec.ts`, `ui-feedback.devnet.spec.ts`).

### 4B. Coverage gaps (non-blocking)

- [ ] Vitest unit tests for `frontend/lib/core/orderApproval.ts`, `orderCommitmentPreparation.ts`, `indexer.ts`, `orderSurfaceActions.ts`, `procesOrderPreparation.ts`. (Indirect coverage via e2e + Foundry.)
- [ ] Vitest unit tests for handoff ECDH / ephemeralKeys (covered by integration e2e only).
- [ ] Devnet pairing for `builders-designer.spec.ts` (mock-only today).
- [ ] Devnet dispute/resolution scenarios — `dispute-page.spec.ts` + `dispute-surfaces.spec.ts` are mock-only.
- [ ] Multi-seller batch-resolution e2e — Foundry + Certora cover the logic; no UI path.
- [ ] Settlement via BatchVerifier — no e2e (Foundry covers).
- [ ] Permit edge cases beyond happy path.
- [ ] Rust prover guest-program tests — `prover/program` and `prover/script` have no `[dev-dependencies]`; conformance delegated to Layer A + Layer C.

---

## 5. Doc & Memory Rationalization

### 5B. Memory hygiene

- [ ] **User-level `MEMORY.md:65`** — orphan index entry for `project_marketing_backlog.md` (file does not exist). Remove the line.
- [ ] **User-level `MEMORY.md:26`** — self-contradicting label "frontend/ is archived; only frontend is active". Change to "archive-frontend/ is read-only; frontend/ is the active codebase."
- [ ] **`project_backlog.md`** — at hard 100-line limit; trim or rotate at next session.

---

## Path to Testnet — gating order

The five reports surface no kernel/contract blockers. Order of operations:

1. Close §1A (Playwright cleanup + P0 UI gaps).
2. Close §1B (deploy-script audits + CF runbook + KV provisioning + WS forwarding + Kleros IDs).
3. Sepolia smoke-test from a fresh wallet — connect → designer → commit → resolve, end-to-end.
4. Flip the deployment-context line in `project_backlog.md:9` ("everything stays on the device") to active testnet.

Papers (§2), Vitest gaps (§4B), and doc rationalization (§5) do not gate the testnet flip but are tracked here so they don't drift.
