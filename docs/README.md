# Documentation Map

The canonical home for live Figaro documentation. The code is in `src/`;
release versioning starts at `v0.1.0` (see `CHANGELOG.md`). This map lists
the whitelisted docs and names one owner per concept; a file not on the list
is a deletion candidate.

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
| The data layer — the public/sealed seam, and the rule that decides it | `DATA_LAYER.md` |
| Open-world lens, composition model, semantic layer | `OPEN_WORLD.md` §1–§3 |
| The equilibrium theorem and its proof | the asymmetric-bonding paper (`frontend/app/(marketing)/papers/asymmetric-bonding/page.tsx`); its figures once in `sdk/src/equilibrium.json`, guarded |
| The equilibrium bound to the kernel's transfers, the six properties | `THEORY.md` |
| Vision, post-firm economy, where value goes after the firm | `VISION.md` |
| Intentional vulnerability-lookalike patterns | `DESIGN_DECISIONS.md` |
| What the protocol has no contract for (not listed = does not exist) | `CONTRACTS.md` § "What the protocol has no contract for" |
| Contract inventory | `CONTRACTS.md` |
| Clause table, validation architecture, adding-a-clause | `CLAUSES.md` |
| Route catalogue, lib map, designer surface | `FRONTEND.md` |
| Wire formats, agreement/template projection, the template→orders walk, checkout planning | `sdk/README.md` (+ the `sdk/dist` docblocks after `npm --prefix sdk run build`) |
| Test-harness inventory, layer boundaries | `TESTING.md` |
| Guard scripts — each guard's rule, rationale, and ruling | maintainer-private build tooling (not shipped in a public clone; TESTING.md inventories test harnesses, not guards) |
| Commands, env vars, services, deploy scripts | `LOCAL_DEV.md` |
| Design system — color/type/spacing tokens, component shapes, a11y anti-patterns | `DESIGN_TOKENS.md` |
| Canonical names per tier | `LEXICON.md` |
| The florin — the token, its supply, its allocation | `FLORIN_TOKEN.md` |
| Designer rewards — who earns the 600M, on what meter and schedule | `DESIGNER_REWARDS.md` |
| The DAO — what it is for, how it spends, who holds the treasury | `DAO.md` |
| Batch-scaling design (BUILT — witness prover/verifier/sequencer beside the direct path) | `SCALING_STRATEGY.md` |
| Open release tasks (testnet + mainnet) | `RELEASE_READINESS.md` |
| External-audit handover (freeze notice, validation gate, accepted risks) | `AUDITOR_HANDOVER.md` |
| Why the flow-map gets built under a uniform reward, and what the stake does and does not do | `DATA_LAYER.md` |
| Comparative-substrates analysis (firm/platform/court/bond as institutional axes: fiscal legibility, monetary neutrality, transparency-verifiability-privacy conjunction, discriminating alignment) | `/papers/coordination-substrates` (`frontend/app/(marketing)/papers/coordination-substrates/page.tsx`) |
| Designer-reward contract surfaces (UsageCounter, RpgfMinter) | `CONTRACTS.md` |
| Maintainer preferences, incidents, rulings | memory dir (`MEMORY.md` index) — maintainer-private, not shipped in this repo; the docs above carry every conclusion |
| Open work | GitHub Issues (public); the maintainer's working punch-list is private |

## Start Here

1. `VISION.md` — protocol vision (post-firm economy, bonded commitment, the florin)
2. `THEORY.md` — the equilibrium bound to the kernel's transfers, and the six properties; the theorem itself is the asymmetric-bonding paper's
3. `FLORIN_TOKEN.md` — token canonical reference (`DESIGNER_REWARDS.md` and `DAO.md` sit beside it: three concepts, three files)

## Main Groups

- **Protocol and framing**: `VISION.md`, `THEORY.md`, `FLORIN_TOKEN.md`, `DESIGNER_REWARDS.md`, `DAO.md`
- **Runtime and frontend**: `OPEN_WORLD.md` (the open-world paradigm + runtime composition model + semantic-derivation layer), `FRONTEND.md` (route + lib catalogue), `DESIGN_TOKENS.md` (MUJI theme spec), `AI_AGENT_COORDINATION.md`
- **Inventories**: `CONTRACTS.md`, `CLAUSES.md`, `FRONTEND.md`, `TESTING.md`, `LOCAL_DEV.md` — the five split-out inventory docs (contracts / clauses / frontend / tests / commands; `CLAUSES.md` also carries the anchoring doctrine)
- **Composition and disclosure**: `DATA_LAYER.md` (the emissions clause + witness-stage disclosure channel is owned by `CLAUSES.md`, which also carries the two load-bearing disclosure rulings: reader-derived scope, offsets out of scope)
- **Scaling**: `SCALING_STRATEGY.md` (carries the batch-sequencer architecture + sequencer trust model)
- **Status and readiness**: `RELEASE_READINESS.md` (the open release tasks, TODO only — closed work is deleted; git is the log)
- **Audit / verification**: `AUDITOR_HANDOVER.md` (freeze notice + stamp, post-audit policy, validation gate, accepted risks), `DESIGN_DECISIONS.md`, `VERIFICATION_MAP.md`
- **Research**: the paper corpus (the project's lineage is stated in the asymmetric-bonding paper's acknowledgement; naming in `FLORIN_TOKEN.md` § "Name")
