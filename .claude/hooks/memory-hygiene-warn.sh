#!/usr/bin/env bash
# Warn when an agent edits a memory file that has grown past the discipline
# line count. Resists the project_backlog.md (1651-line) failure mode by
# surfacing growth as it happens, not after the fact.
#
# Thresholds:
#   MEMORY.md (index)         100 lines  — entries should be one-liners
#   feedback_*.md / project_*.md  200 lines  — beyond this is changelog masquerade
set -euo pipefail

payload=$(cat)
file_path=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')

# ── FORWARD POINTERS at write time — the content being written must not point
# at expiring locations (session scratchpads die with the session; the pointer
# fossilizes). Complements the SessionStart sweep in punchlist-hygiene.sh.
case "$file_path" in
  */memory/*.md)
    written=$(printf '%s' "$payload" | jq -r '.tool_input.content // .tool_input.new_string // empty')
    if printf '%s' "$written" | grep -qE '/private/tmp/claude|/tmp/claude-|[Ss]ession scratchpad'; then
        cat <<'EOF'
⚠ MEMORY FORWARD-POINTER: this write references a session scratchpad or other
expiring location. Scratchpads die with the session — inline the content into
the memory itself, or move it to a tracked repo file, and point there instead.
EOF
    fi
    ;;
esac

case "$file_path" in
  */memory/MEMORY.md)
    if [ -f "$file_path" ]; then
      lines=$(wc -l < "$file_path" 2>/dev/null | tr -d ' ' || echo 0)
      if [ "$lines" -gt 100 ]; then
        cat <<EOF
⚠ MEMORY INDEX SIZE: $file_path is $lines lines.
The index should hold one-line entries (~150 chars each). >100 lines suggests
multi-paragraph entries that defeat the index's purpose. Prune entries to the
standard form: "- [Title](file.md) — one-line hook."
EOF
      fi
    fi
    ;;
  */memory/*.md)
    if [ -f "$file_path" ]; then
      lines=$(wc -l < "$file_path" 2>/dev/null | tr -d ' ' || echo 0)
      if [ "$lines" -gt 200 ]; then
        cat <<EOF
⚠ MEMORY FILE SIZE: $file_path is $lines lines.
Memory files should stay scannable. >200 lines is usually a CHANGELOG hiding as
memory. Recommended fix:
  - Move Done-history to git log (commit messages are the durable record).
  - Extract audit / findings content to docs/<DATE>.md (tracked artifact).
  - Keep only OPEN items + the rule/why/how-to-apply structure.

Reference: project_backlog.md was reduced from 1651 → 38 lines on 2026-04-29
using exactly this pattern.
EOF
      fi
    fi
    ;;
esac
