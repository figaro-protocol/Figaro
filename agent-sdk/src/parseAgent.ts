export interface AgentDefinition {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  systemPrompt: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
const KEY_LINE_RE = /^([a-zA-Z_-]+):\s*(.*)$/;

// Parse a Claude Code subagent .md file (frontmatter + body) into a structured
// AgentDefinition. Pure: takes raw file content, returns the parsed object.
//
// The frontmatter is a small subset of YAML — single-line `key: value` pairs.
// If we ever need multi-line values, arrays, or quoted strings, swap to
// gray-matter; this parser stays small to avoid the runtime dependency.
export function parseAgent(content: string): AgentDefinition {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error("agent file has no frontmatter (expected leading `---` block)");
  }
  const [, frontmatter, body] = match;

  const fields: Record<string, string> = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const m = line.match(KEY_LINE_RE);
    if (m) fields[m[1]] = m[2].trim();
  }

  if (!fields.name) throw new Error("agent frontmatter missing required field: name");
  if (!fields.description) throw new Error("agent frontmatter missing required field: description");

  return {
    name: fields.name,
    description: fields.description,
    tools: fields.tools
      ? fields.tools.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined,
    model: fields.model || undefined,
    systemPrompt: body.trim(),
  };
}
