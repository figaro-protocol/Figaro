#!/usr/bin/env bash
#
# lint-mainnet-posture.sh — the site speaks from MAINNET POSTURE; deployment
# status is config, never copy (operator-ratified 2026-08-06).
#
# The positive rule: every marketing/builders page describes the protocol as
# the standing thing it is. Where a page must name an environment, it names it
# as a technical fact ("the local devnet", a deployments table) — never as a
# stage the project is passing through. Status/launch language ("pre-launch",
# "coming soon", a roadmap) regressed onto four pages after being ripped from
# home; this guard closes the loop, like lint-no-eyebrows.sh did for eyebrows.
#
# Scope: .tsx under frontend/app/(marketing) and frontend/app/(builders),
# EXCLUDING (marketing)/papers/ — the academic corpus may legitimately analyze
# launches and roadmaps of other systems.
#
# "devnet" is NOT banned (it names the local developer network — a technical
# referent, not a stage). Audit-status honesty ("pending external audit") is
# NOT banned — it is a security disclosure, not launch framing.
#
# Wired into the root package.json lint-staged block under
# `frontend/**/*.{ts,tsx}`. lint-staged passes staged files as args.
# Run manually over the whole tree:
#   bash scripts/lint-mainnet-posture.sh $(git ls-files 'frontend/app/(marketing)/*.tsx' 'frontend/app/(builders)/*.tsx')
#
# Exit code: 0 on clean, 1 on any violation.

set -euo pipefail

BANNED='pre-?launch|before launch|at launch|after launch|post-?launch|launch date|launching|coming soon|road-?map|waitlist|goes live|go live|not yet live|testnet'

violations=0

for file in "$@"; do
    [[ -f "$file" ]] || continue
    [[ "$file" == *.tsx ]] || continue
    case "$file" in
        *"app/(marketing)/papers/"*) continue ;;
        *"app/(marketing)/"* | *"app/(builders)/"*) ;;
        *) continue ;;
    esac

    hits=$(grep -inE "\b($BANNED)\b" "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[mainnet-posture] $file carries deployment-status language:"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
done

if (( violations > 0 )); then
    echo ""
    echo "[mainnet-posture] $violations file(s). The site speaks from mainnet posture:"
    echo "                  deployment status is config, never copy. Delete the status"
    echo "                  clause; name environments as technical facts if needed."
    exit 1
fi

exit 0
