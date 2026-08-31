# V5 Documentation Map

The canonical home for live Figaro V5 documentation. ("V5" is the fifth
internal generation of the codebase — a lineage label, distinct from release
versioning, which starts at `v0.1.0`; see `CHANGELOG.md`.) Single-purpose
notes, shipped-plan documents, and per-archetype specs that aren't
load-bearing for the protocol have been moved to local-only archives
(see `git log` for prior versions). Historical material lives in
`archive-v5/` (legacy v4 docs), `archive-v3/` (V3 contracts/tests),
and `archive-v4/` (pre-promotion V4 snapshot) — all local-only and
untracked, so a fresh clone will not contain them; the live V5 code is
in `src/`.

## Ownership Map — one owner per concept

Every concept has exactly ONE owning statement; every other surface (agent prompts,
skills, memories, marketing prose, other docs) states it only as a summary plus
a pointer to its owner. When the owner changes, sweep the pointers — never fork the
content. (This is the instruction-system form of "derive, don't store.")

| Concept | Owner |
|---|---|
| The system: 2 kernel mechanisms + 5 nouns | maintainer-private build tooling — `THEORY.md` carries the public restatement |
| The `clause.block` seam (fields = protocol, block = presentation) | `CLAUSES.md` § "Clause-spec format" |
| The coordinator pattern (composing the kernel) | `CONTRACTS.md` § Coordinators |
| The public/confidential data rule | `PUBLIC_GRAPH_MODEL.md` § "What Is Not Public" |
| Open-world lens, composition model, semantic layer | `OPEN_WORLD.md` §1–§3 |
| Game-theoretic derivation, six properties | `THEORY.md` |
| Vision, post-firm economy, where value goes after the firm | `VISION.md` |
| Intentional vulnerability-lookalike patterns | `DESIGN_DECISIONS.md` |
| Teardown state: deferred vs permanent, what does NOT exist | `CONTRACTS.md` § What Does NOT Exist |
| Contract inventory | `CONTRACTS.md` |
| Clause table, validation architecture, adding-a-clause | `CLAUSES.md` |
| Route catalogue, lib map, designer surface | `FRONTEND.md` |
| Wire formats, agreement/template projection, the template→orders walk, checkout planning | `sdk/README.md` (+ the `sdk/dist` docblocks after `npm --prefix sdk run build`) |
| Test-harness inventory, layer boundaries | `TESTING.md` |
| Guard scripts — each guard's rule, rationale, and ruling | maintainer-private build tooling (not shipped in a public clone; TESTING.md inventories test harnesses, not guards) |
| Commands, env vars, services, deploy scripts | `LOCAL_DEV.md` |
| Design system — color/type/spacing tokens, component shapes, a11y anti-patterns | `DESIGN_TOKENS.md` |
| Canonical names per tier | `LEXICON.md` |
| The florin, allocations | `FLORIN_TOKEN.md` |
| Batch-scaling design (BUILT — witness prover/verifier/sequencer beside the direct path) | `SCALING_STRATEGY.md` |
| Open release tasks (testnet + mainnet) | `RELEASE_READINESS.md` |
| External-audit handover (freeze notice, validation gate, accepted risks) | `AUDITOR_HANDOVER.md` |
| Public-graph / RPGF incentive rationale (why the flow-map gets built under a uniform reward) | `PUBLIC_GRAPH_MODEL.md` |
| Comparative-substrates analysis (firm/platform/court/bond as institutional axes: fiscal legibility, monetary neutrality, transparency-verifiability-privacy conjunction, discriminating alignment) | `/papers/coordination-substrates` (`frontend/app/(marketing)/papers/coordination-substrates/page.tsx`) |
| RPGF mechanics (UsageCounter, RpgfMinter — uniform reward, live ETH stake) | `CONTRACTS.md` |
| Maintainer preferences, incidents, rulings | memory dir (`MEMORY.md` index) — maintainer-private, not shipped in this repo; the docs above carry every conclusion |
| Open work | GitHub Issues (public); the maintainer's working punch-list is private |

## Start Here

1. `VISION.md` — protocol vision (post-firm economy, bonded commitment, the florin)
2. `THEORY.md` — game-theoretic derivation of the six properties
3. `FLORIN_TOKEN.md` — token canonical reference

## Main Groups

- **Protocol and framing**: `VISION.md`, `THEORY.md`, `FLORIN_TOKEN.md`
- **Runtime and frontend**: `OPEN_WORLD.md` (the open-world paradigm + runtime composition model + semantic-derivation layer), `FRONTEND.md` (route + lib catalogue), `DESIGN_TOKENS.md` (MUJI theme spec), `AI_AGENT_COORDINATION.md`
- **Inventories**: `CONTRACTS.md`, `CLAUSES.md`, `FRONTEND.md`, `TESTING.md`, `LOCAL_DEV.md` — the five split-out inventory docs (contracts / clauses / frontend / tests / commands; `CLAUSES.md` also carries the anchoring doctrine)
- **Composition and disclosure**: `PUBLIC_GRAPH_MODEL.md` (the emissions clause + witness-stage disclosure channel is owned by `CLAUSES.md`; the aspirational GHG protocol spec was deleted 2026-07-10 — its two load-bearing rulings, reader-derived scope and offset-out-of-scope, live in `CLAUSES.md`)
- **Scaling**: `SCALING_STRATEGY.md` (carries the batch-sequencer architecture + sequencer trust model)
- **Status and readiness**: `RELEASE_READINESS.md` (the open release tasks, TODO only — closed work is deleted; git is the log)
- **Audit / verification**: `AUDITOR_HANDOVER.md` (freeze notice + stamp, post-audit policy, validation gate, accepted risks), `DESIGN_DECISIONS.md`, `VERIFICATION_MAP.md`
- **Research**: `BOL_RESEARCH.md` (the project's lineage is stated in the asymmetric-bonding paper's acknowledgement; naming in `FLORIN_TOKEN.md` § "Name")
