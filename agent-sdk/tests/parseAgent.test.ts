import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import {
  parseAgent,
  loadAgent,
  loadAllAgents,
  resolveModelId,
  FIGARO_AGENT_FILES,
} from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// agent-sdk/tests/ → repo root is three levels up
const REPO_ROOT = path.resolve(__dirname, "../..");

describe("parseAgent (unit)", () => {
  it("parses frontmatter and body correctly", () => {
    const content = `---
name: test-agent
description: A test agent
tools: Read, Grep, Bash
model: sonnet
---

# System prompt body

This is the system prompt.`;
    const parsed = parseAgent(content);
    expect(parsed.name).toBe("test-agent");
    expect(parsed.description).toBe("A test agent");
    expect(parsed.tools).toEqual(["Read", "Grep", "Bash"]);
    expect(parsed.model).toBe("sonnet");
    expect(parsed.systemPrompt).toMatch(/^# System prompt body/);
  });

  it("throws if no frontmatter block", () => {
    expect(() => parseAgent("# No frontmatter\nJust body")).toThrow(/frontmatter/);
  });

  it("throws if name missing", () => {
    expect(() => parseAgent("---\ndescription: hi\n---\n\nbody")).toThrow(/name/);
  });

  it("throws if description missing", () => {
    expect(() => parseAgent("---\nname: x\n---\n\nbody")).toThrow(/description/);
  });

  it("treats omitted tools and model as undefined", () => {
    const parsed = parseAgent("---\nname: x\ndescription: y\n---\n\nbody");
    expect(parsed.tools).toBeUndefined();
    expect(parsed.model).toBeUndefined();
  });
});

describe("resolveModelId", () => {
  it("maps opus alias to a concrete Opus model id", () => {
    expect(resolveModelId("opus")).toMatch(/opus/);
  });
  it("passes through fully-qualified ids unchanged", () => {
    expect(resolveModelId("claude-opus-4-7")).toBe("claude-opus-4-7");
  });
  it("defaults to opus when no alias supplied", () => {
    expect(resolveModelId(undefined)).toMatch(/opus/);
  });
});

describe("loadAgent (canonical .md files)", () => {
  // Property tests that catch drift between the canonical files and what
  // consumers expect. If these break, the .md frontmatter or body has been
  // changed in a way that breaks the contract — investigate before merging.

  it("loads figaro-kernel-reviewer as a read-only opus agent", () => {
    const a = loadAgent(REPO_ROOT, "figaro-kernel-reviewer");
    expect(a.name).toBe("figaro-kernel-reviewer");
    expect(a.tools).toContain("Read");
    expect(a.tools).not.toContain("Edit");
    expect(a.tools).not.toContain("Write");
    expect(a.model).toBe("opus");
    expect(a.systemPrompt.length).toBeGreaterThan(500);
    expect(a.systemPrompt).toMatch(/six invariants?|kernel/i);
  });

  it("loads figaro-clause-lockstep as a read-only verifier", () => {
    const a = loadAgent(REPO_ROOT, "figaro-clause-lockstep");
    expect(a.name).toBe("figaro-clause-lockstep");
    expect(a.tools).not.toContain("Edit");
    expect(a.tools).not.toContain("Write");
    expect(a.systemPrompt).toMatch(/lockstep|surface/i);
  });

  it("loads figaro-clause-author with write capability and opus", () => {
    const a = loadAgent(REPO_ROOT, "figaro-clause-author");
    expect(a.name).toBe("figaro-clause-author");
    expect(a.tools).toContain("Edit");
    expect(a.tools).toContain("Write");
    expect(a.model).toBe("opus");
    expect(a.systemPrompt).toMatch(/CLAUSES\.md|validator-contract/);
  });

  it("loads figaro-runtime-ui-author as a writer agent for the runtime tier", () => {
    const a = loadAgent(REPO_ROOT, "figaro-runtime-ui-author");
    expect(a.name).toBe("figaro-runtime-ui-author");
    expect(a.tools).toContain("Edit");
    expect(a.tools).toContain("Write");
    expect(a.model).toBe("opus");
    expect(a.systemPrompt).toMatch(/lens|frontend|runtime/i);
  });

  it("loads figaro-assembly-author as a writer agent that defers clause work", () => {
    const a = loadAgent(REPO_ROOT, "figaro-assembly-author");
    expect(a.name).toBe("figaro-assembly-author");
    expect(a.tools).toContain("Edit");
    expect(a.tools).toContain("Write");
    expect(a.model).toBe("opus");
    expect(a.systemPrompt).toMatch(/DesignDraft|assembly|DAG/i);
    expect(a.systemPrompt).toMatch(/CLAUSES\.md/);
  });

  it("loads figaro-paper-reviewer as a read-only verifier", () => {
    const a = loadAgent(REPO_ROOT, "figaro-paper-reviewer");
    expect(a.name).toBe("figaro-paper-reviewer");
    expect(a.tools).toContain("Read");
    expect(a.tools).not.toContain("Edit");
    expect(a.tools).not.toContain("Write");
    expect(a.model).toBe("opus");
    expect(a.systemPrompt).toMatch(/paper|drift|theorem/i);
  });

  it("loads figaro-memory-hygiene as a terse table-output auditor", () => {
    const a = loadAgent(REPO_ROOT, "figaro-memory-hygiene");
    expect(a.name).toBe("figaro-memory-hygiene");
    expect(a.tools).not.toContain("Edit");
    expect(a.tools).not.toContain("Write");
    expect(a.systemPrompt).toMatch(/table|terse|narrative/i);
  });

  it("loads figaro-deploy-runner with read + bash for orchestration", () => {
    const a = loadAgent(REPO_ROOT, "figaro-deploy-runner");
    expect(a.name).toBe("figaro-deploy-runner");
    expect(a.tools).toContain("Bash");
    expect(a.tools).toContain("Read");
    expect(a.tools).not.toContain("Edit");
    expect(a.tools).not.toContain("Write");
    expect(a.systemPrompt).toMatch(/runbook|confirmation|destructive/i);
  });

  it("loads figaro-feedback-triage as a read-only classifier", () => {
    const a = loadAgent(REPO_ROOT, "figaro-feedback-triage");
    expect(a.name).toBe("figaro-feedback-triage");
    expect(a.tools).not.toContain("Edit");
    expect(a.tools).not.toContain("Write");
    expect(a.systemPrompt).toMatch(/composable-protection|framing|triage/i);
  });

  it("loads figaro-marketing-author with refusal discipline", () => {
    const a = loadAgent(REPO_ROOT, "figaro-marketing-author");
    expect(a.name).toBe("figaro-marketing-author");
    expect(a.tools).toContain("Edit");
    expect(a.tools).toContain("Write");
    expect(a.model).toBe("opus");
    expect(a.systemPrompt).toMatch(/DeFi|TradFi|coordination protocol/);
    expect(a.systemPrompt).toMatch(/200-year|extrapolation/i);
  });

  it("loads figaro-site-ia as a read-only IA recommender", () => {
    const a = loadAgent(REPO_ROOT, "figaro-site-ia");
    expect(a.name).toBe("figaro-site-ia");
    expect(a.tools).not.toContain("Edit");
    expect(a.tools).not.toContain("Write");
    expect(a.systemPrompt).toMatch(/reading path|curriculum|cross-link/i);
  });

  it("loads figaro-visual-design with design-system scope", () => {
    const a = loadAgent(REPO_ROOT, "figaro-visual-design");
    expect(a.name).toBe("figaro-visual-design");
    expect(a.tools).toContain("Edit");
    expect(a.tools).toContain("Write");
    expect(a.systemPrompt).toMatch(/design system|tailwind|semantic token/i);
    expect(a.systemPrompt).toMatch(/WCAG|ARIA|a11y|accessibility/i);
  });

  it("loadAllAgents returns exactly the twelve canonical agents", () => {
    const all = loadAllAgents(REPO_ROOT);
    expect(Object.keys(all).sort()).toEqual([
      "figaro-assembly-author",

      "figaro-clause-author",

      "figaro-clause-lockstep",
      "figaro-deploy-runner",
      "figaro-feedback-triage",
      "figaro-kernel-reviewer",
      "figaro-marketing-author",
      "figaro-memory-hygiene",
      "figaro-paper-reviewer",
      "figaro-runtime-ui-author",      "figaro-site-ia",
      "figaro-visual-design",
    ]);
  });

  it("FIGARO_AGENT_FILES map has stable keys", () => {
    expect(Object.keys(FIGARO_AGENT_FILES).sort()).toEqual([
      "figaro-assembly-author",

      "figaro-clause-author",

      "figaro-clause-lockstep",
      "figaro-deploy-runner",
      "figaro-feedback-triage",
      "figaro-kernel-reviewer",
      "figaro-marketing-author",
      "figaro-memory-hygiene",
      "figaro-paper-reviewer",
      "figaro-runtime-ui-author",      "figaro-site-ia",
      "figaro-visual-design",
    ]);
  });
});
