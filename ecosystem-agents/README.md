# Figaro ecosystem agents

**Public agent prompts that act for a user's wallet on the permissionless network — never
on this repo.**

An agent is an actor (like the AI reading this). It works in different **capacities**.
Figaro is an open-world innovation with a steep comprehension cost — adopting it means
rewiring closed-world priors. These prompts are the answer: each teaches an agent one
capacity so it acts correctly on a **user's** behalf, and the newcomer needn't internalize
the whole model first.

## The three capacities

- **`figaro-operator`** — *operate* a buyer/seller wallet: sign every transaction on the
  owner's behalf (accept an order, resolve a process, originate a chain, attest), using
  `@figaro/sdk/agent`, guided by the owner's policy (HITL by default; refuse-all until a
  rule is set).
- **`figaro-clause-author`** — author (or version) a clause: a spec → IPFS → a permissionless
  `ClauseRegistry` registration under the user's wallet. No on-chain code.
- **`figaro-assembly-designer`** — compose a new assembly, or **fork** an existing one: a
  `DesignDraft`/template → IPFS → a permissionless `AssemblyRegistry` registration under the
  user's wallet.

All three are **prompts** (frontmatter + body). They drive `@figaro/sdk` (the SDK), act for
a user's key, and never touch this repo. Authored artifacts belong to the user (RPGF rewards
them); forks are first-class.

## The seam — two worlds, do not blur them

Pre-defined agents are **operator-private by default**; "public" is the exception, only when
explicitly designed for it — these three are those exceptions.

| World | Home | For | Touches the repo? |
|---|---|---|---|
| **Operator-private** — build Figaro itself (kernel-reviewer, clause-lockstep, marketing, visual-design, site-ia, runtime-ui-author, the auditors, memory-hygiene, feedback-triage, paper-reviewer) | `.claude/agents/` | **the operator only** | yes (that's their job) |
| **Public ecosystem** — operate / author / fork (`figaro-operator`, `figaro-clause-author`, `figaro-assembly-designer`) | **`ecosystem-agents/`** | **any user**, acting for their own wallet | **never** |

A public ecosystem agent that writes a repo file has crossed the line: it re-imposes the
permission barrier (repo access + a merge) the open world exists to remove.

## No UI to satisfy

Registration is the whole act. A UI surfaces clauses and assemblies *from the registry
events*, so registering makes an artifact discoverable everywhere that reads the registry —
there is no frontend binding to meet. `block` attributes shape how a UI *presents* an
artifact, never its validity or discoverability. The core is invariant (unless forked); many
UIs compete — that is what permissionless and decentralized mean.

## Running the prompts outside Claude Code

These are prompt definitions. To run one in another runtime, parse the file and drop its body
into your agent loop as the system prompt — the same shape any Claude Code subagent uses. The
agent then drives `@figaro/sdk` for the wallet it holds.
