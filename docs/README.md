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

## Content architecture — the four public surfaces

Four surfaces publish to the world, and one folder never does. The test that
decides where any page or section goes:

| If the content is… | It lives on… |
|---|---|
| Who it is for, what they do, why it works — one screen, pictures | the **marketing site** (the six doors + home + the tellings) |
| A surface that reads or writes live chain state (needs a wallet or the live registry) | an **app page** (`app/(app)/`) |
| A *how* with an identifier — a hash, a field, a contract, an error, a command, a spec | **docs-site** (published at `/docs`) |
| A standalone scholarly argument | a **paper**, under Working Groups |
| Internal build and discipline reference for the maintainer and agents | **`docs/`** — never published |

**`docs/` is not public documentation.** It is the build reference: this folder,
read by the maintainer and by agents working on Figaro, part of the build
process. It is never rendered to the public. docs-site does NOT mirror it (the
mirror that copied `docs/*.md` into the published site is retired); the two never
touch.

**docs-site is the public technical manual**, written for an outsider who builds
on the protocol. Its lesson from the genesis clean-room experiment
(`work/2026-09-10-genesis-cleanroom/`): a cold reader with ordinary priors slides
into a different, coherent, defensible design unless the whole model is held at
once — so docs-site STATES the whole (the two mechanisms, the five nouns, the
forest) before any per-object detail, and never assumes the reader induces it.

**Where the technical detail behind the doors goes:** the four hashes and the
clause-spec format, how an assembly is composed and the composition hash,
document-anchoring, on-chain and off-chain composition, sharp edges, the invariant
list, the contract catalogue with its inheritance/install/deployments/errors, and
the verification stack with its counts all move to docs-site. Each marketing door
keeps one screen — what a clause is, what an assembly is, how the code is secured
— and links to docs-site for the rest. `/security` stays a one-screen marketing
page at its predictable URL (status, brief, disclosure channel, "Audit in
progress"), detail on docs-site. `/registries` and the other live-chain readers
are app pages. sdk/README stays the SDK manual, rendered into docs-site.

## Layer ownership — the instruction system

Each layer owns one thing; every other layer states it as a summary plus a pointer.

| Layer | Owns |
|---|---|
| `CLAUDE.md` | discipline — how agents work, the frame, agent permissions; not inventories |
| `docs/` | the internal build reference and one owner per concept (this map) |
| docs-site | the public technical manual |
| `.claude/agents/*.md` | one public surface each (marketing-copy, builders-docs, papers-editor, runtime-ui) |
| `scripts/lint-*.sh` | the mechanical rules that enforce the above |
| memory dir (private) | rulings, preferences, lessons |

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
