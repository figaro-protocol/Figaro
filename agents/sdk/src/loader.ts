import * as fs from "node:fs";
import * as path from "node:path";
import { parseAgent, type AgentDefinition } from "./parseAgent.js";

export const FIGARO_AGENT_FILES = {
  "figaro-kernel-reviewer": ".claude/agents/figaro-kernel-reviewer.md",
  "figaro-schema-lockstep": ".claude/agents/figaro-schema-lockstep.md",
  "figaro-schema-author": ".claude/agents/figaro-schema-author.md",
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

// Load and parse a canonical Figaro agent from disk.
//
// `repoRoot` is the absolute path to the Figaro repo root. The .md
// file is resolved relative to it via FIGARO_AGENT_FILES. The .md file in
// .claude/agents/ remains the single source of truth — this loader is a
// reader, not a duplicator.
export function loadAgent(repoRoot: string, name: FigaroAgentName): AgentDefinition {
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

export function loadAllAgents(repoRoot: string): Record<FigaroAgentName, AgentDefinition> {
  const result = {} as Record<FigaroAgentName, AgentDefinition>;
  for (const name of Object.keys(FIGARO_AGENT_FILES) as FigaroAgentName[]) {
    result[name] = loadAgent(repoRoot, name);
  }
  return result;
}
