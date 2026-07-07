# Figaro ecosystem agents

**Public, wallet-acting agents that help a user contribute to the permissionless
network — never to this repo.**

Figaro is an open-world innovation with a steep comprehension cost: adopting it means
rewiring closed-world priors. These agents are the answer — they already know the
open-world rules and produce a correct, **user-owned** contribution on the user's behalf,
so a newcomer doesn't have to internalize the whole model first. The agent is the
onboarding, encoded.

## The two agents

- **`figaro-clause-author`** — author (or version) a clause: a Layer-A spec → IPFS → a
  permissionless `ClauseRegistry` registration under the **user's** wallet. Merkle-only —
  no per-clause validator contract, no repo file.
- **`figaro-assembly-author`** — compose a new assembly, or **fork** an existing one: a
  `DesignDraft`/template → IPFS → a permissionless `AssemblyRegistry` registration under
  the **user's** wallet. Defers new-clause needs to `figaro-clause-author`.

Both act for a user's key via `@figaro/core` and the registries. The artifact belongs to
the user (RPGF rewards it as theirs). Forks are first-class.

## The seam — do not blur it

| Agents | Home | For | Touch the repo? |
|---|---|---|---|
| kernel-reviewer, clause-lockstep, marketing, visual-design, site-ia, runtime-ui-author, the auditors, memory-hygiene, deploy-runner, feedback-triage, paper-reviewer | `.claude/agents/` | **the operator only** — building Figaro itself | yes (that's their job) |
| `figaro-clause-author`, `figaro-assembly-author` | **`sdk/ecosystem-agents/`** | **any user** — contributing to the network | **never** |
| `@figaro/core/agent` + `sdk/factotum/` | `sdk/` | any user — transacting (buyer/seller) | never |

**Pre-defined agents are operator-private by default; "public" is the exception, only
when explicitly designed for it** — these two, and the participant agents, are those
exceptions. An ecosystem agent that writes a repo file has crossed the line: it re-imposes
the permission barrier (repo access + a merge) the open world exists to remove.

## Not bound to this frontend

The registries are permissionless: the user registers however they like. If an artifact
doesn't meet a given UI's surfacing rules (this frontend groups clauses by `block.article`,
etc.), it simply isn't shown *there* — it is still valid on-chain and surfaces in any other
UI that reads the registry. The core is invariant (unless forked); many UIs compete.

## Using them outside Claude Code

These are prompt definitions. Load them into your own runtime the same way `agent-sdk/`
loads the operator's `.claude/agents/` — parse the frontmatter + body, drop the
`systemPrompt` into your agent loop. (`agent-sdk` itself packages only the operator's
repo-building agents; these live here, on the participant side.)
