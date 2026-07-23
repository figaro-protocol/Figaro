#!/usr/bin/env bash
#
# lint-no-dangerous-html.sh — XSS FLOOR: no new untrusted-HTML sink.
#
# The CSP ships with 'unsafe-inline' (a static export can't do per-request
# nonces; script-hash hardening is the future step — public/_headers). So the
# CSP is NOT an XSS/exfil backstop: a single `dangerouslySetInnerHTML` fed
# runtime, network-authored content would both EXECUTE (unsafe-inline) and
# EXFILTRATE (scheme-wide connect-src, justified by the /settings user-endpoint
# model). The app's XSS safety therefore rests entirely on React auto-escaping.
# This guard keeps it that way: the ONLY sink allowed is the build-time KaTeX
# renderer, whose input is repo-authored TeX literals (audit 2026-07-23, F5).
#
# FAIL — any `dangerouslySetInnerHTML` outside the allowlisted build-time sink.
# A genuinely-new build-time sink (never fed network content) extends ALLOW
# below WITH a one-line justification — the review checkpoint is the point.
#
# Scope: whole TRACKED tree under frontend/app, frontend/components, frontend/lib.
# Exit: 0 clean, 1 on any violation.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Allowlist: build-time-trusted sinks only. Each entry = a file path whose
# dangerouslySetInnerHTML is fed REPO-AUTHORED (never network) content.
ALLOW='frontend/components/papers/Math.tsx'

files=$(git ls-files frontend/app frontend/components frontend/lib 2>/dev/null |
    grep -vE '^archive-|/archive-|node_modules|\.next|test-results')

violations=0
for f in $files; do
    [[ -f "$f" ]] || continue
    grep -qE 'dangerouslySetInnerHTML' "$f" || continue
    if grep -qxF "$f" <<< "$ALLOW"; then continue; fi
    echo "[no-dangerous-html] $f — untrusted-HTML sink:"
    grep -nE 'dangerouslySetInnerHTML' "$f" | sed 's/^/    /'
    violations=$((violations + 1))
done

if [[ "$violations" -gt 0 ]]; then
    echo ""
    echo "The CSP ships 'unsafe-inline' and cannot catch an injected-HTML sink —"
    echo "it would both execute AND exfiltrate. Render untrusted network content as"
    echo "React-escaped text, never innerHTML (audit 2026-07-23, F5). A build-time"
    echo "sink fed only repo-authored content extends the ALLOW list in this guard,"
    echo "with a justification — that review is the point."
    exit 1
fi
exit 0
