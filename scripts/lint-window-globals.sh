#!/usr/bin/env bash
#
# lint-window-globals.sh — WINDOW GLOBALS ARE DECLARED IN window.d.ts ONLY.
#
# reference_window_globals: every `Window` augmentation lives in one place,
# `frontend/types/window.d.ts`, whose header enumerates the legit setters. A
# `declare global { interface Window … }` scattered into a feature module is the
# drift that lets the same global be typed two ways and lose its single source.
#
# Trigger:  `declare global` or `interface Window` in a frontend `.ts`/`.tsx`.
# Discriminator:  the ONLY file allowed to augment Window is `types/window.d.ts`.
#           One pre-existing exception is allowlisted below (see ALLOW) pending a
#           decision to relocate it; everything else is a violation.
#
# Args mode (lint-staged passes changed files). Exit: 0 clean, 1 on violation.

set -uo pipefail

# Pre-existing exception — the mock coordination channel co-locates its own
# `__FIGARO_COORDINATION_MOCK__` Window global. Allowlisted so the guard ships
# clean; relocating it to window.d.ts is a punch-list item, not this guard's job.
ALLOW='lib/handoff/mockChannel.ts'

violations=0
for file in "$@"; do
    [[ -f "$file" ]] || continue
    case "$file" in *.ts|*.tsx) ;; *) continue ;; esac
    case "$file" in
        *"types/window.d.ts") continue ;;
        *"$ALLOW") continue ;;
    esac
    hits=$(grep -nE 'declare global|interface Window\b' "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[window-globals] $file augments Window outside types/window.d.ts:"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
done

if [[ "$violations" -gt 0 ]]; then
    echo ""
    echo "Declare every Window global in frontend/types/window.d.ts (one source). Move the"
    echo "augmentation there and guard runtime access with the appropriate gate."
    echo "(reference_window_globals)"
    exit 1
fi
exit 0
