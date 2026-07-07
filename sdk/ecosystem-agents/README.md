# Figaro ecosystem agents

**Public, wallet-acting agents that help a user participate in — and contribute to — the
permissionless network. Never to this repo.**

Figaro is an open-world innovation with a steep comprehension cost: adopting it means
rewiring closed-world priors. These agents are the answer — they already know the
open-world rules and act correctly on a **user's** behalf, so a newcomer doesn't have to
internalize the whole model first. The agent is the onboarding, encoded.

## The agents

- **`figaro-clause-author`** (prompt) — author (or version) a clause: a Layer-A spec →
  IPFS → a permissionless `ClauseRegistry` registration under the **user's** wallet. No
  on-chain code — no validator contract, no repo file.
- **`figaro-assembly-author`** (prompt) — compose a new assembly, or **fork** an existing
  one: a `DesignDraft`/template → IPFS → a permissionless `AssemblyRegistry` registration
  under the **user's** wallet. Defers new-clause needs to `figaro-clause-author`.
- **`transactor/`** (`@figaro/transactor`, runnable) — the reference agent a user forks to
  *transact*: buy, sell, originate, resolve, attest. Wires `@figaro/core/agent` to a
  wallet + a pluggable policy (HITL by default; autonomous ships refuse-all).

All act for a **user's key** via `@figaro/core` and the registries. Authored artifacts
belong to the user (RPGF rewards them); forks are first-class.

## The seam — two worlds, do not blur them

Pre-defined agents are **operator-private by default**; "public" is the exception, only
when explicitly designed for it — the three above are those exceptions.

| World | Home | For | Touch the repo? |
|---|---|---|---|
| **Operator-private** — build Figaro itself (kernel-reviewer, clause-lockstep, marketing, visual-design, site-ia, runtime-ui-author, the auditors, memory-hygiene, deploy-runner, feedback-triage, paper-reviewer) | `.claude/agents/` | **the operator only** | yes (that's their job) |
| **Public ecosystem** — participate + contribute (clause-author, assembly-author, transactor) | **`sdk/ecosystem-agents/`** | **any user**, acting for their own wallet | **never** |

An ecosystem agent that writes a repo file has crossed the line: it re-imposes the
permission barrier (repo access + a merge) the open world exists to remove.

## No UI to satisfy

Registration is the whole act. A UI surfaces clauses and assemblies *from the registry
events*, so registering makes an artifact discoverable everywhere that reads the registry —
there is no frontend binding to meet. `block` attributes shape how a UI *presents* an
artifact, never its validity or discoverability. The core is invariant (unless forked);
many UIs compete — that is what permissionless and decentralized mean.

## Using the prompts outside Claude Code

`clause-author` and `assembly-author` are prompt definitions (frontmatter + body). To run
one in another runtime, parse the file and drop its body into your agent loop as the system
prompt — the same shape any Claude Code subagent uses. The `transactor` is ordinary
TypeScript; fork it.
