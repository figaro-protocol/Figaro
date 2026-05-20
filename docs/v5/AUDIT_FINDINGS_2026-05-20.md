# Audit Findings — Dispute-Resolution Integration (2026-05-20)

Tabula-rasa audit of the dispute-resolution subsystem. Scope: `frontend/lib/dispute/`,
`DisputeStatusPanel`, `useArbitrationCost`, the `/dispute`, `/audit/[processId]`, and
`/evidence-display` surfaces, `src/mocks/MockKleros*.sol`, `script/DeployMockKleros.s.sol`,
the `figaro-jurisdiction-v1` schema.

## Correction notice

The first pass of this audit was wrong in its **frame**. It (and the parallel
sub-agents) read the subsystem as *parallel tracks* — an "audit" surface and a
"dispute" surface, parallel evidence builders, a "kleros" track. That produced four
findings (F2, F4, F5, F6) that are artifacts of the wrong frame. They are **retracted**
below.

The design is **linear**, per `paper/figaro3e.tex` ("On-Chain Evidence, Off-Chain
Adjudication"):

> Layer 1 (asymmetric bonding) and Layer 2 (peer coordination) are the two
> enforcement *mechanisms*. Layer 3 is the immutable **evidentiary record** — the
> residual mechanism for the disputes the first two layers do not absorb. A process
> settles on-chain; its evidentiary record is produced through that settlement; if a
> dispute escalates past Layers 1–2, that **same record is exported to an off-chain
> forum**, which adjudicates.

It is an escalation ladder, not parallel tracks. Consequences for this audit:

- **The audit documents *are* the dispute-submission documents.** `buildAuditBundlePdfBlob`
  feeding both `DownloadAuditBundleButton` (audit page) and `DisputeStatusPanel`
  (forum submission) is the *correct* linear design — one Layer-3 record, used at the
  audit stage and again at the forum stage. Not duplication.
- **The forum classes are a recourse hierarchy, not a flat set.** Kleros and
  non-binding arbitration are lower-level systems; parties retain recourse *upward* to
  a higher-level forum (a state court). Binding arbitration and state courts are
  terminal. The `figaro-jurisdiction-v1` schema encodes this: an agreement sets *one
  or more* jurisdiction levels — `klerosCourt` (Layer 2) and/or `applicableLaw` /
  `forum` / `language` (Layer 3), at least one required — and the `AgreementDrawer`
  checkbox UI composes them: Kleros is checked by default (a decentralized-systems
  default), and a composer can uncheck it and/or add a state (New York, London,
  Shanghai) or arbitration as the level(s) of jurisdictional clarity. Code that is
  *specific to Kleros* is correctly Kleros-named — the Kleros forum adapter, not a leak.

---

## Findings

### F1 — Duplicate Kleros court catalogue (MEDIUM) — *verified*

Two hand-maintained lists of the same Kleros subcourts:

- `frontend/lib/dispute/klerosCourts.ts` — `KLEROS_COURTS` (canonical: 4 courts, full
  objects). Consumed by `/dispute` (`app/(app)/dispute/page.tsx:76,240,1073`).
- `frontend/app/(app)/builders/designer/_components/AgreementDrawer.tsx:1183` —
  `KLEROS_COURT_OPTIONS`, a separate inline `{value,label}[]`, same 4 court keys, not
  derived from `KLEROS_COURTS`. Used at `:1265`.

Genuine duplication — independent of frame. The designer's court picker and the
`/dispute` court picker can drift.

*Recommended:* derive `AgreementDrawer`'s options from `KLEROS_COURTS` (exported via
`lib/dispute/index.ts`).

### F3 — Evidence-display URI is built missing `coreAddress` (MEDIUM) — *verified*

The Layer-3 evidence record is what the off-chain forum reads. `buildEvidenceDisplayURI`
(`components/core/DisputeStatusPanel.tsx:76-80`) builds the juror-facing URL with only
`processId` + `chainID`. The consuming route uses a third parameter:

- `app/(app)/evidence-display/page.tsx:297` — reads `coreAddress`
- `:338` — validates it
- `:345` — `buildProcessTimeline(client, processId, coreAddressParam ?? undefined)`

With `coreAddress` absent, the timeline the forum sees is rebuilt against the
env-default `FigaroCore`, not necessarily the core the disputed process settled on.
Producer and consumer disagree on the document's parameter set — the document handed
to the forum is under-specified. Blast radius is bounded on a single-core deployment
(env default = the core); it bites on a non-default / multi-core setup.

*Recommended:* include `coreAddress` in `buildEvidenceDisplayURI`'s `URLSearchParams`.

### F8 — Dispute escalation has no home on the linear path (MEDIUM) — *verified*

In the escalation ladder, a dispute escalates *at the end of a process* — alongside
the Layer-3 evidence record. The audit page `/audit/[processId]` is where that record
lives: `ProcessFinancialsView.tsx:79` renders `<DownloadAuditBundleButton>` (the
evidence record for the three off-chain forum classes that take an out-of-band filing).
The Kleros escalation belongs on that same surface.

It is not there. `DisputeStatusPanel` is reachable only through the chain
`DisputeStatusPanel ← OrderNodeSemanticCard ← AssemblyProcessWorkspace ←
SemanticProcessWorkspacePanel ← /terminal` — `SemanticProcessWorkspacePanel` has
exactly one consumer, `terminal/page.tsx`. `/terminal` is legacy code (fate undecided).
The audit page's own doc comment (`audit/[processId]/page.tsx:17`) says the Kleros
entry is "surfaced from per-order cards via `<DisputeStatusPanel>` … not duplicated
here" — but those cards exist only on `/terminal`, so the claim is misleading.

Separately: `DisputeStatusPanel` is process-scoped (`processId` prop,
`figaro:dispute:<processId>` localStorage) yet mounted per-order inside
`OrderNodeSemanticCard` — an N-order process renders N identical panels.

*Recommended:* mount one process-scoped `DisputeStatusPanel` on `/audit/[processId]`,
beside `DownloadAuditBundleButton` — so the audit page is the single end-of-process
escalation surface for all four forum classes (download-and-file for the off-chain
three; the panel for Kleros). Drop the per-order mounting.

### F7 — Unverified claim in a code comment (LOW) — *reported, not independently re-verified*

`klerosCourts.ts:118-120` reportedly comments that Kleros "enforces" a minimum-juror
floor with submissions below it reverting "at the arbitrator level", while the constant
is `KLEROS_MIN_JURORS_FLOOR = 1` and is consumed only by a test. Verify the comment;
correct it to "UI sanity floor, not Kleros-enforced" if unbacked.

---

## Retracted from the first pass

These were artifacts of the parallel-tracks frame and do **not** hold.

### ~~F4~~ — "kleros baked into an on-chain schema validator" — RETRACTED

`figaro-jurisdiction-v1` is a deliberate **three-layer** jurisdiction schema (verified
against `src/schemaValidators/FigaroJurisdictionV1Validator.sol` and
`frontend/lib/shared/schemas/figaro-jurisdiction-v1.json`): Layer 1 kernel mechanisms
(not encoded), Layer 2 **Kleros** (`klerosCourt` is a Kleros *subcourt* enum,
`klerosMinJurors` a Kleros juror count), Layer 3 **generic** off-chain forums
(`applicableLaw` / `forum` / `language` — ISO codes, named venues). `klerosCourt`
encodes Kleros's actual requirements; the schema *already* carries the generic layer
beside it. This matches `figaro3e.tex` §"Composition with Dispute Systems" exactly
(Kleros = one on-chain forum with specific params; the other three named generically).
The schema is correct; its Kleros-specific naming is correct. Not a finding.

### ~~F5~~ — "no adapter seam; Kleros all the way down" — RETRACTED

The seam exists and is paper-grounded: forum-agnostic Layer-3 evidence (the audit-bundle
PDF, the process timeline, the financials) vs forum-specific handling. Kleros is one of
four forum classes; the Kleros integration (`klerosProxy.ts` calls the Kleros
ArbitrableProxy; `klerosCourts.ts` is Kleros subcourts; `klerosEnv.ts` is the Kleros
proxy address) is *legitimately* Kleros-specific — the Kleros forum adapter. Naming it
`kleros*` is correct, like the schema. The first pass mistook a correctly-scoped
adapter for leakage.

### ~~F6~~ — "two conflicting three-layer models" — RETRACTED

`figaro3e.tex`'s enforcement layers (bonding / coordination / evidence) and the
jurisdiction schema's layering (kernel mechanisms / Kleros / state-ADR) are the same
escalation ladder at two granularities — coherent, not conflicting.

### ~~F2~~ — "two parallel dispute flows" — RETRACTED

`DisputeStatusPanel` (commerce-process disputes) and `/dispute` (consent-agreement
disputes) are two *artifact types*, each following the same linear pattern: process →
Layer-3 evidence → forum. They share the low-level `klerosProxy.ts` calls (correct);
the separate evidence builders reflect different evidence *content* (commerce
audit-bundle vs consent receipt), not divergent implementations of one requirement.

---

## Summary

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| F1 | MEDIUM | Duplicate Kleros court catalogue (`KLEROS_COURTS` vs `KLEROS_COURT_OPTIONS`) | verified |
| F3 | MEDIUM | Evidence-display URI omits `coreAddress` the forum-facing page needs | verified |
| F8 | MEDIUM | Kleros dispute escalation mounted only on legacy `/terminal`, off the linear path; per-order panel duplication | verified |
| F7 | LOW | Unverified Kleros-revert claim in a `klerosCourts.ts` comment | reported only |
| ~~F2/F4/F5/F6~~ | — | Retracted — artifacts of a parallel-tracks frame; the design is a linear escalation ladder | retracted |

**Method.** First pass: five parallel read-only agents. Their sweeping verdicts did not
survive verification, and the operator identified the frame error (parallel vs linear).
Second pass: re-grounded against `paper/figaro3e.tex` and the `figaro-jurisdiction-v1`
schema; every surviving finding re-verified against source. Net real findings: three
(F1, F3, F8), all on the operator's original concern surface — a duplicated catalogue,
an under-specified forum-facing document, and a mis-homed escalation entry.
