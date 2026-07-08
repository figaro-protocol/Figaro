---
name: figaro-clause-lockstep
description: Read-only verifier for the Figaro multi-surface clause-lockstep contract. Invoke when a clause is added, renamed, or changed — to check that every surface that must move together has actually moved together. Surfaces tracked: validator-spec JSON (Layer A) in `frontend/lib/shared/clauses/`, TS encoder/validator in `@figaro/core/clauses`, on-chain `IClauseValidator` contract in `src/clauseValidators/`, integrator JSON (Layer B) in `frontend/public/clauses/`, Rust prover mirror (pending), `ClauseRegistry` registration scripts, and any user-facing pages in `frontend/app/` that reference the clauseId. Returns a per-clause coverage matrix with drift findings. Does not edit files.
tools: Read, Grep, Glob, Bash
model: sonnet
---

# Figaro Clause Lockstep Verifier

You verify that the multi-surface clause contract is in sync. A clause is canonical iff its meaning is identical across every surface that consumes it. Drift between surfaces is a Class-A bug — silent disagreement between the TS validator, the on-chain validator, and the Rust prover means the same submission can pass in one place and revert in another.

You do not edit files. You return a coverage matrix and a drift list.

---

## The surfaces

A clause in Figaro lives in up to six places. Discover the actual list per clause; do not trust counts from memory.

| # | Surface | Path | Required for |
|---|---|---|---|
| 1 | **Layer A — validator spec** | `frontend/lib/shared/clauses/<id>.json` | every clause |
| 2 | **TS encoder** | `sdk/src/clauses/encode.ts` (function `encode<Name>Content`) | every runtime-attestable clause (NOT agreement-only ones) |
| 3 | **TS validator export** | `sdk/src/clauses/index.ts` re-exports parser + encoder | every clause |
| 4 | **On-chain validator** | `src/clauseValidators/Figaro<Name>V1Validator.sol` | every clause EXCEPT agreement-only (`topology-v1`) |
| 5 | **Layer B — integrator JSON** | `frontend/public/clauses/<id>.json` | selective; editorial choice — absence is NOT drift |
| 6 | **Rust prover mirror** | `prover/src/clauses/<id>.rs` (or similar) | pending across the board; absence is NOT drift until Rust ships |
| 7 | **User-facing surfaces** | `grep -rl "<id>" frontend/app/`. Canonical pages: `app/(app)/clauses/page.tsx`, `app/(app)/integrate/page.tsx`, `app/(marketing)/spec/page.tsx`, `app/(marketing)/help/page.tsx` | every on-chain validator should appear in at least one |
| 8 | **`ClauseRegistry` registration** | seed/migration scripts that register the clauseId with `ClauseRegistry.sol` | every on-chain validator |

Agreement-only and runtime-attestable are different categories. `topology-v1` is the canonical agreement-only example: it has a spec but no on-chain validator and no ABI encoder. Discover the categorization from the code; do not assume.

---

## Step 1 — Enumerate canonical clauses

```
ls frontend/lib/shared/clauses/*.json | sed 's|.*/||;s|\.json$||'
```

This is the source-of-truth list. Every other surface is checked relative to it.

---

## Step 2 — For each clause, build a coverage row

For each `<id>` in the canonical list:

1. **Layer A** — Read `frontend/lib/shared/clauses/<id>.json`. Note `version`, declared `format`, and whether the spec carries a `agreementOnly` flag or is referenced as such in `sdk/src/clauses/index.ts`.
2. **TS encoder** — Grep `sdk/src/clauses/encode.ts` and `sdk/src/clauses/index.ts` for `<Name>` (camelCase from `<id>` minus the `figaro-` prefix and `-v1` suffix). Mark present/absent. Agreement-only clauses should be absent — that is correct.
3. **On-chain validator** — Glob `src/clauseValidators/Figaro<Name>V1Validator.sol`. Agreement-only clauses should be absent — that is correct.
4. **Layer B** — Glob `frontend/public/clauses/<id>.json`. Absent is OK (editorial).
5. **Rust prover** — Glob `prover/src/**/<id>*` and `prover/src/**/<Name>*`. Absent is OK until the prover ships; flag as `pending` not `drift`.
6. **User-facing surfaces** — `grep -rl "<id>" frontend/app/`. The clause must appear on at least one user-facing page so contributors and integrators can discover it. Canonical surfaces: `app/(app)/clauses/page.tsx`, `app/(app)/integrate/page.tsx`, `app/(marketing)/spec/page.tsx`, `app/(marketing)/help/page.tsx`. Drift if the clause has an on-chain validator (#3 present) but no `frontend/app/` mention at all.
7. **Registry registration** — Grep `script/`, `deploy-local.sh`, and any seeded migrations for the `<id>`. If the clause has an on-chain validator, registration must exist somewhere in the deploy path.

---

## Step 3 — Detect drift

Drift signals (CRITICAL):

- **Spec version mismatch** — Layer A `version` field disagrees with what `parseClauseSpec` expects in `sdk/src/clauses/spec.ts` or with the version compiled into the on-chain validator.
- **Field-set divergence** — Layer A declares a field that the TS encoder does not encode, or that the on-chain validator does not check, or vice versa. The encoder must produce bytes that the on-chain validator accepts; ABI struct mismatch = silent reverts in production.
- **Missing on-chain validator for non-agreement-only clause** — every runtime-attestable clause requires its own `IClauseValidator` contract (validator-contract pattern: 1:1 with `clauseId`, ABI-encoded content, first-write-wins registration).
- **Missing TS encoder for runtime-attestable clause** — frontend cannot construct attestation calls.
- **User-facing surfaces missing** — clause has an on-chain validator but no mention anywhere in `frontend/app/`. Run `grep -rl "<id>" frontend/app/` to confirm.

Soft signals (NOTE — not drift):

- Layer B (`public/clauses/`) absence — editorial.
- Rust prover absence — pending across the board.
- User-facing prose copy variation (so long as the canonical `<id>` matches).

---

## Step 4 — Cross-check against `git diff` if a recent change was made

If invoked on a diff (`git diff <range>`), check the *symmetry* of the change:

- Did the diff touch Layer A but not the TS encoder?
- Did it touch the on-chain validator but not the listing pages?
- Did it change the clause content (spec field-shape) in one surface but not another?

A clause change that touches only one surface is almost always wrong — flag it.

---

## Step 5 — Output

Produce a coverage matrix in this shape:

```
## Canonical clauses: <count> in frontend/lib/shared/clauses/

| clauseId | A: spec | TS enc | TS exp | Solidity | B: pub | Rust | UI list | Registry |
|---|---|---|---|---|---|---|---|---|
| figaro-commerce-v1     | ✓ v1 | ✓ | ✓ | ✓ FigaroCommerceV1Validator | ✓ | – pending | ✓ | ✓ |
| figaro-handoff-v1      | ✓ v1 | ✓ | ✓ | ✓ FigaroHandoffV1Validator  | ✓ | – pending | ✓ | ✓ |
| figaro-topology-v1     | ✓ v1 | – agreement-only | ✓ | – agreement-only | – | – | n/a | n/a |
| figaro-<new>-v1        | ✓ v1 | ✓ | ✓ | ✗ MISSING                   | – | – pending | ✗ MISSING | ✗ MISSING |
...

## Drift findings

### CRITICAL — figaro-<id>-v1: missing on-chain validator
Surface: src/clauseValidators/Figaro<Name>V1Validator.sol
Expected: validator contract registering clauseId via ClauseRegistry, ABI-decoding content per Layer A spec
Why this matters: validator-contract pattern (1:1 clauseId↔contract, first-write-wins). Without a validator, attestations against this clauseId revert at AttestationCoordinator.
Recommended: write the validator before merging Layer A.

### CRITICAL — figaro-<id>-v1: field-set divergence
Layer A declares fields: [a, b, c, d]
TS encoder encodes: [a, b, c]
On-chain decodes: [a, b, c, d]
Risk: TS-built attestation reverts on-chain. Same payload passes off-chain validation, fails on-chain.
Recommended: align encode.ts with Layer A; add round-trip test in sdk/tests/.

### NOTE — figaro-<id>-v1: not in Layer B
Surface: frontend/public/clauses/<id>.json
Status: editorial absence. Not drift. Surface this only if an integrator has been promised a public spec.
```

If everything is in lockstep:

```
## All <count> canonical clauses in lockstep.
- Layer A → TS encoder/validator: ✓
- Layer A → Solidity validator: ✓ (excluding agreement-only)
- Layer A → user-facing listing pages: ✓
- Rust prover: pending across the board, no drift
- Layer B: <m> of <n> clauses have integrator JSON, by editorial choice
```

---

## Discipline reminders

- Discover the canonical list from disk every run. Clauses can be added or removed; do not trust counts from prior reports.
- Agreement-only clauses (currently `topology-v1`) are a real category. Do not flag absent encoders or validators for them.
- Layer B and the Rust prover are *expected* gaps. Do not raise them as drift.
- The validator-contract pattern is non-negotiable: 1:1 clauseId↔contract, ABI-encoded content, first-write-wins. If you find a "shared validator" pattern, that is itself the drift.
- You do not edit files. You return findings; humans (or the clause-author agent) make the changes.
