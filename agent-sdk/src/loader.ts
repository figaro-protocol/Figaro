import * as fs from "node:fs";
import * as path from "node:path";
import { parseAgent, type AgentDefinition } from "./parseAgent.js";

export const FIGARO_AGENT_FILES = {
  "figaro-kernel-reviewer": ".claude/agents/figaro-kernel-reviewer.md",
  "figaro-clause-lockstep": ".claude/agents/figaro-clause-lockstep.md",
  "figaro-clause-author": ".claude/agents/figaro-clause-author.md",
  "figaro-runtime-ui-author": ".claude/agents/figaro-runtime-ui-author.md",
  "figaro-assembly-author": ".claude/agents/figaro-assembly-author.md",
  "figaro-paper-reviewer": ".claude/agents/figaro-paper-reviewer.md",
  "figaro-memory-hygiene": ".claude/agents/figaro-memory-hygiene.md",
  "figaro-deploy-runner": ".claude/agents/figaro-deploy-runner.md",
  "figaro-feedback-triage": ".claude/agents/figaro-feedback-triage.md",
  "figaro-marketing-author": ".claude/agents/figaro-marketing-author.md",
  "figaro-site-ia": ".claude/agents/figaro-site-ia.md",
  "figaro-visual-design": ".claude/agents/figaro-visual-design.md",
} as const;

export type FigaroAgentName = keyof typeof FIGARO_AGENT_FILES;

// Maps the model alias used in subagent frontmatter (opus/sonnet/haiku) to a
// concrete Anthropic model ID. Update when models advance — and update the
// frontmatter `model:` lines in lockstep if the aliases change meaning.
const MODEL_IDS: Record<string, string> = {
  opus: "claude-opus-4-7",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

export function resolveModelId(modelAlias?: string): string {
  if (!modelAlias) return MODEL_IDS.opus;
  if (modelAlias in MODEL_IDS) return MODEL_IDS[modelAlias];
  return modelAlias; // already a fully-qualified ID
}

// Find the Figaro repo root by walking up from `startDir` until a
// `.claude/agents/` directory is found. The contributor agents are repo-coupled
// (they read src/, docs/v5/, the clause validators), so they only run against a
// checkout — this saves callers hand-passing `repoRoot`. Throws with a clear
// message when run outside a checkout.
export function findRepoRoot(startDir: string = process.cwd()): string {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, ".claude", "agents"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached the filesystem root
    dir = parent;
  }
  throw new Error(
    `findRepoRoot: no .claude/agents/ found walking up from ${startDir}. ` +
      `The Figaro contributor agents are repo-coupled — run from a Figaro checkout, ` +
      `or pass repoRoot explicitly.`,
  );
}

// Load and parse a canonical Figaro agent from disk.
//
// `repoRoot` is the absolute path to the Figaro repo root (default: discovered
// via `findRepoRoot()`). The .md file is resolved relative to it via
// FIGARO_AGENT_FILES. The .md file in .claude/agents/ remains the single source
// of truth — this loader is a reader, not a duplicator.
export function loadAgent(name: FigaroAgentName, repoRoot: string = findRepoRoot()): AgentDefinition {
  const filePath = path.join(repoRoot, FIGARO_AGENT_FILES[name]);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `agent file not found: ${filePath}. ` +
        `Expected to find a Claude Code subagent at this location — is repoRoot correct?`,
    );
  }
  const content = fs.readFileSync(filePath, "utf8");
  return parseAgent(content);
}

export function loadAllAgents(repoRoot: string = findRepoRoot()): Record<FigaroAgentName, AgentDefinition> {
  const result = {} as Record<FigaroAgentName, AgentDefinition>;
  for (const name of Object.keys(FIGARO_AGENT_FILES) as FigaroAgentName[]) {
    result[name] = loadAgent(name, repoRoot);
  }
  return result;
}
