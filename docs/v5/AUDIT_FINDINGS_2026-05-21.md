# Audit findings — 2026-05-21 (carried forward)

Open repo-readiness items carried forward from the 2026-04-29 multi-area
audit (`AUDIT_FINDINGS_2026-04-29.md`, now retired). Each item below was
re-verified open against current source on 2026-05-21.

The 2026-04-29 pass also produced a MED/LOW frontend deep-dive tail — much
of it mooted by the V4→V5 route narrowing — that is NOT reproduced here;
`git log` reaches the original doc. The items below are public-push /
repo-hygiene work, not protocol findings. Each is checked off in the PR
that fixes it; the finding text is not edited afterward.

---

## CRITICAL

- [ ] **No `SECURITY.md`.** A settlement-kernel + formal-proofs repository with no responsible-disclosure path. Add `SECURITY.md` with a disclosure contact, scope (`src/*.sol` + the formal specs), an explicit bounty / no-bounty statement, and a link to `DESIGN_DECISIONS.md` so the intentional patterns are not filed as bugs.

## HIGH

- [ ] **Missing community-health files.** No `CODE_OF_CONDUCT.md`, `SUPPORT.md`, `.github/ISSUE_TEMPLATE/`, or `.github/PULL_REQUEST_TEMPLATE.md`. Standard public-repo hygiene — add all four with brief, project-specific content.
- [ ] **`.gitignore` carries stale `frontend2/` paths.** Pre-rename `frontend2/...` entries (seven occurrences) no longer match anything, so current build outputs at `frontend/.next/`, `frontend/playwright-report/`, etc. are not being ignored. Replace `frontend2/` with `frontend/`.
- [ ] **`frontend/package.json` name is `"figaro-dapp"`.** Contradicts the protocol-not-product framing. Rename to `"figaro-runtime"` (matching the `@figaro/core` SDK style).
- [ ] **Dynamic `require("viem")` in `frontend/lib/core/agreementManifest.ts`.** The hot-path encoder helpers (`schemaIdOf`, `getSectionDataBytes`, `computeSectionLeaf`, `hashPair`) resolve viem via dynamic `require` (four call sites). Bundler resolution differences could yield divergent module instances and, worst case, divergent crypto output — a direct parity risk. Convert to a static top-of-module `import`, or document why the dynamic require is deliberate.
- [ ] **`src/echidna/EchidnaToken.sol` is a 15-line stub with zero properties.** Either implement FigToken properties (supply-cap enforcement, supply conservation, non-negative balances, the renounce latch, no-mint-after-renounce) or remove the stub and confirm no doc or memory claims Echidna covers FigToken.
