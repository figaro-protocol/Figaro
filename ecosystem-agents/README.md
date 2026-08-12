# Figaro ecosystem agents

**Public agent prompts that act for a user's wallet on the permissionless network — never
on this repo.**

An agent is an actor (like the AI reading this). It works in different **capacities**.
Figaro is an open-world innovation with a steep comprehension cost — adopting it means
rewiring closed-world priors. These prompts are the answer: each teaches an agent one
capacity so it acts correctly on a **user's** behalf, and the newcomer needn't internalize
the whole model first.

> **Honest scope:** these prompts are published for rehearsal and review — not for
> unattended custody of a funded key. An agent loop wired to a signer ingests
> attacker-authorable input at every step (an assembly's title, a member's profile
> document, a clause spec, an offer envelope a counterparty relayed), so a
> prompt-injection payload hidden in any of it reaches something that can sign:
> prompt-injection → wallet theft. The mitigation is a sandboxed signer runtime
> that bounds what a compromised loop can authorize. **It does not exist yet**, and
> building it is a NAMED release gate on this whole tier, separate from the
> frontend's (`docs/RELEASE_READINESS.md` § "Pre-Mainnet Deployment
> Verification"). Until it lands, run these against a devnet you own or a key
> holding only what you can afford to lose, and leave `figaro-operator`'s
> human-in-the-loop default on. Every safety rule below is BEHAVIORAL — the prompt
> asks the agent to refuse; nothing outside the prompt makes it.

## The three capacities

- **`figaro-operator`** — *operate* a buyer/seller wallet: sign every transaction on the
  owner's behalf (accept an order, resolve a process, originate a chain, attest), using
  `@figaro/sdk/agent`, guided by the owner's policy (HITL by default; refuse-all until a
  rule is set).
- **`figaro-clause-author`** — author (or version) a clause: a spec → IPFS → a permissionless
  `ClauseRegistry` registration under the user's wallet. No on-chain code.
- **`figaro-assembly-designer`** — compose a new assembly, or **fork** an existing one: an
  `AssemblyTemplate` → IPFS → a permissionless `AssemblyRegistry` registration under the
  user's wallet.

All three are **prompts** (frontmatter + body). They drive `@figaro/sdk` (the SDK), act for
a user's key, and never touch this repo. Authored clauses and assemblies belong to the user (RPGF rewards
them); forks are first-class.

## The seam — two worlds, do not blur them

Pre-defined agents are **operator-private by default**; "public" is the exception, only when
explicitly designed for it — these three are those exceptions.

| World | Home | For | Touches the repo? |
|---|---|---|---|
| **Operator-private** — build Figaro itself (kernel-reviewer, clause-lockstep, marketing-copy, visual-design, site-ia, runtime-ui, the auditors, memory-hygiene, feedback-triage, paper-reviewer) | `.claude/agents/` | **the operator only** | yes (that's their job) |
| **Public ecosystem** — operate / author / fork (`figaro-operator`, `figaro-clause-author`, `figaro-assembly-designer`) | **`ecosystem-agents/`** | **any user**, acting for their own wallet | **never** |

A public ecosystem agent that writes a repo file has crossed the line: it re-imposes the
permission barrier (repo access + a merge) the open world exists to remove.

## No UI to satisfy

Registration is the whole act. A UI surfaces clauses and assemblies *from the registry
events*, so registering makes a clause or assembly discoverable everywhere that reads the registry —
there is no frontend binding to meet. MOST `block` attributes shape how a UI *presents* an
entry and affect neither validity nor discoverability — **but never say that unqualified:
five hints inside `block` are hash-load-bearing and change what a designer's template and a
party's signed agreement actually CONTAIN** (a reserved `design.article`, `design.scope`,
`design.fills`, and the two `checkout` fill lists — `figaro-clause-author` § "The five
hash-load-bearing `block` hints" is the owner of that list, and it bans the unqualified
sentence for the same reason). The core is invariant (unless forked); many
UIs compete — that is what permissionless and decentralized mean.

## The run that proves a stranger's wiring

Before trusting any of these prompts against real funds, do the whole handshake yourself on
a devnet you own: `sdk/README.md` § "Your first commit" is the shortest path from nothing to
a bonded order on chain — bring up the chain and an IPFS node, put something on the network
to discover, originate through the SDK's two loops, read the process back out of band, and
resolve it. Every step is a command; nothing in it is hosted by anyone. It is the same
sequence `figaro-operator` runs, in a form you can watch, and its runnable script
(`sdk/scripts/verify-origination.devnet.mjs`) is the reference these prompts are written
against.

## Running the prompts outside Claude Code

These are prompt definitions. To run one in another runtime, parse the file and drop its body
into your agent loop as the system prompt — the same shape any Claude Code subagent uses. The
agent then drives `@figaro/sdk` for the wallet it holds.
