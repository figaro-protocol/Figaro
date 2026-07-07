# @figaro/agent-sdk

Programmatic access to the Figaro contributor agents (`figaro-kernel-reviewer`, `figaro-clause-lockstep`, `figaro-clause-author`) for non-Claude-Code runtimes.

The canonical agent definitions live in `.claude/agents/*.md` — Claude Code reads them directly. This package reads the same files at runtime, parses the frontmatter + body, and exposes structured `AgentDefinition` objects so any agent runtime (the Anthropic SDK, the Claude Agent SDK, OpenAI's tool calling, your own loop) can use the same security-first prompts.

**Single source of truth: the `.md` files.** This package is a reader, not a duplicator. Editing the `.md` file updates both the Claude Code subagent and the SDK consumer in one stroke — drift is impossible.

---

## Why

Figaro's contributor agents encode the project's security posture: the six kernel invariants, the protocol-extension doctrine, the validator-contract pattern, the four-surface lockstep. Claude Code subagents are one delivery surface. This package exists so the same prompts are usable from:

- **Anthropic SDK** — drop the system prompt into `client.messages.create({ system: ... })` and run a custom tool loop.
- **The Claude Agent SDK** — pass the agent definition into the SDK's agent runner.
- **OpenAI / other LLMs** — port the prompt verbatim; the rules are model-agnostic. (You lose Claude-specific tool integrations but the rules transfer.)
- **CI / automation** — run the kernel-reviewer on every PR via a serverless function.

---

## Use (from a Figaro checkout)

**This package is repo-internal, not published** (`private: true`). It reads the
`.claude/agents/*.md` files by path at runtime — and the contributor agents are
*repo-coupled*: their prompts cite `src/FigaroCore.sol`, `docs/v5/`, the validator
pattern, and their `Read`/`Grep`/`Bash` tools operate on the tree. So they only
function against a Figaro checkout; distributing the prompt text alone would hand a
consumer instructions pointing at files they don't have. Run it in-repo:

```ts
import { loadAgent, findRepoRoot } from "@figaro/agent-sdk";

// findRepoRoot() walks up from cwd to the .claude/agents/ dir — no path to pass.
const agent = loadAgent("figaro-kernel-reviewer");
// or pin the root explicitly: loadAgent("figaro-kernel-reviewer", "/path/to/figaro")
```

It's a workspace member (`workspaces: ["agent-sdk"]`), so other packages in this repo
import it directly. Single dependency: nothing — just Node built-ins (`fs`, `path`).

---

## API

### `AgentDefinition`

```ts
interface AgentDefinition {
  name: string;            // e.g., "figaro-kernel-reviewer"
  description: string;     // when-to-invoke text
  tools?: string[];        // e.g., ["Read", "Grep", "Glob", "Bash"]
  model?: string;          // alias: "opus" | "sonnet" | "haiku"
  systemPrompt: string;    // the full body of the .md file
}
```

### `parseAgent(content: string): AgentDefinition`

Pure parser. Takes the raw content of a `.md` file and returns the structured definition. Throws if frontmatter is missing or malformed.

### `loadAgent(name: FigaroAgentName, repoRoot?: string): AgentDefinition`

Reads `.claude/agents/<name>.md` from `repoRoot` and parses it. `name` is a typed enum over the canonical agents. `repoRoot` defaults to `findRepoRoot()`.

### `loadAllAgents(repoRoot?: string): Record<FigaroAgentName, AgentDefinition>`

Loads them all at once. `repoRoot` defaults to `findRepoRoot()`.

### `findRepoRoot(startDir?: string): string`

Walks up from `startDir` (default `process.cwd()`) to the directory containing `.claude/agents/`. Throws when run outside a Figaro checkout — the contributor agents are repo-coupled.

### `resolveModelId(alias?: string): string`

Maps `"opus" | "sonnet" | "haiku"` (the aliases used in `.md` frontmatter) to concrete Anthropic model IDs. Falls back to opus if no alias supplied. Pass-through for already-qualified IDs.

---

## Example: Anthropic SDK with prompt caching

The agent system prompts are several KB each. Prompt caching cuts cost and latency on subsequent calls dramatically:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { loadAgent, resolveModelId } from "@figaro/agent-sdk";

const client = new Anthropic();
const agent = loadAgent("figaro-kernel-reviewer"); // repoRoot auto-discovered

const response = await client.messages.create({
  model: resolveModelId(agent.model),
  max_tokens: 8192,
  system: [
    {
      type: "text",
      text: agent.systemPrompt,
      cache_control: { type: "ephemeral" }, // cache the long prompt; cuts ~95% of input tokens on subsequent calls within 5 min
    },
  ],
  messages: [
    {
      role: "user",
      content:
        "Review this diff for kernel discipline:\n\n" +
        "```diff\n+ function setOwner(address newOwner) external { owner = newOwner; }\n```",
    },
  ],
});

console.log(response.content);
```

The kernel-reviewer's system prompt is ~7KB. After the first call within a 5-minute window, subsequent calls reuse the cached prefix — ideal for CI integration where you review many PRs in a session.

---

## Example: tool loop (full agent execution)

The `.md` files declare which tools the agent expects — `tools: Read, Grep, Glob, Bash` for read-only agents, plus `Edit, Write` for the clause-author. To run the agent end-to-end (not just a single response), you need to provide tool implementations and run a multi-turn loop.

The Claude Agent SDK ([anthropic-ai/claude-agent-sdk-python](https://github.com/anthropics/claude-agent-sdk-python), and the TypeScript equivalent) is the recommended runner — it handles tool dispatching for you. Pass the `agent.systemPrompt` and `agent.tools` into its agent constructor.

If you build your own loop, the broad shape is:

```ts
async function runAgent(agent: AgentDefinition, prompt: string) {
  const client = new Anthropic();
  let messages = [{ role: "user", content: prompt }];

  while (true) {
    const response = await client.messages.create({
      model: resolveModelId(agent.model),
      max_tokens: 8192,
      system: agent.systemPrompt,
      tools: buildToolClauses(agent.tools), // your job
      messages,
    });

    if (response.stop_reason === "end_turn") return response;

    // tool_use → run the tool, append tool_result, loop
    const toolUses = response.content.filter((b) => b.type === "tool_use");
    const toolResults = await Promise.all(toolUses.map(runTool)); // your job
    messages = [
      ...messages,
      { role: "assistant", content: response.content },
      { role: "user", content: toolResults },
    ];
  }
}
```

The agent expects the *Claude Code* tool semantics (Read returns file contents with line numbers, Bash returns stdout/stderr, etc.). When you implement your own tools, mimic those return shapes for fidelity.

---

## Property tests catch drift

`tests/parseAgent.test.ts` runs against the real `.claude/agents/*.md` files. The tests assert:

- `figaro-kernel-reviewer` has `Read` but not `Edit`/`Write` (read-only enforcement).
- `figaro-clause-lockstep` has no `Edit`/`Write` (read-only verifier).
- `figaro-clause-author` has both `Edit` and `Write` (writer agent).
- All three carry their expected model alias.
- System prompts are non-empty and contain canonical phrases ("kernel", "lockstep", "CLAUSES.md").

If anyone edits the `.md` files in a way that breaks the contract — e.g., handing `Write` access to the kernel-reviewer — these tests fail. They are the lockstep verifier *for the agent definitions themselves*.

```bash
cd agent-sdk && npm test
```

---

## See also

- `sdk/factotum/examples/` — worked scenarios showing verbatim runnable prompts for the clause-author against real assembly designs.

## What this package is not

- **Not a Claude Code replacement.** Claude Code subagents auto-load and auto-discover; this package is for runtimes that don't.
- **Not an agent runner.** It exposes definitions, not execution. The runner is your responsibility (or use the Claude Agent SDK).
- **Not a model-version pin.** `resolveModelId` maps aliases to current model IDs at the time of release; bump the package when models advance.

---

## License

MIT (matches `@figaro/core`).
