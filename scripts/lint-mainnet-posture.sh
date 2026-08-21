#!/usr/bin/env bash
#
# lint-mainnet-posture.sh — the site speaks from MAINNET POSTURE; deployment
# status is config, never copy (maintainer-ratified 2026-08-06).
#
# The positive rule: every marketing/builders page describes the protocol as
# the standing thing it is. Where a page must name an environment, it names it
# as a technical fact ("the local devnet", a deployments table) — never as a
# stage the project is passing through. Status/launch language ("pre-launch",
# "coming soon", a roadmap) regressed onto four pages after being ripped from
# home; this guard closes the loop, like lint-no-eyebrows.sh did for eyebrows.
#
# Scope: .tsx under ALL of frontend/app — (marketing), (builders), AND (app);
# a seventh instance was found on the (app) tier the same day the guard landed
# scoped narrower. EXCLUDES (marketing)/papers/ only — the academic corpus may
# legitimately analyze launches and roadmaps of other systems.
#
# HARDENED 2026-08-21 (maintainer, verbatim intent: "No page should have any
# mention of status. No page should state what is live today. No page should
# mention testnet/mainnet/devnet. EVERYTHING WE WRITE IS A REHEARSAL FOR
# MAINNET, a production environment."): the network names themselves are now
# banned — sepolia, devnet, mainnet, testnet — along with status idioms.
# Say "a local development run/record", "the public record", "a production
# venue", "the network". Explorer HREFs (sepolia.etherscan.io) are exempt —
# a URL is config, not copy. The ONE surviving exemption: audit-status
# honesty ("not yet audited by an external auditor") is a security
# disclosure, not launch framing, and stays.
#
# Wired into the root package.json lint-staged block under
# `frontend/**/*.{ts,tsx}`. lint-staged passes staged files as args.
# Run manually over the whole tree:
#   bash scripts/lint-mainnet-posture.sh $(git ls-files 'frontend/app/(marketing)/*.tsx' 'frontend/app/(builders)/*.tsx')
#
# Exit code: 0 on clean, 1 on any violation.

set -euo pipefail

BANNED='pre-?launch|before launch|at launch|after launch|post-?launch|launch date|launching|coming soon|road-?map|waitlist|goes live|go live|not yet live|testnet|sepolia|devnet|mainnet|opens with the network|release[- ]ready|release[- ]blocker|live today|expected this early'

violations=0

for file in "$@"; do
    [[ -f "$file" ]] || continue
    [[ "$file" == *.tsx ]] || continue
    case "$file" in
        *"app/(marketing)/papers/"*) continue ;;
        *"app/(marketing)/"* | *"app/(builders)/"* | *"app/(app)/"*) ;;
        *) continue ;;
    esac

    hits=$(grep -inE "\b($BANNED)\b" "$file" | grep -viE 'sepolia\.etherscan\.io' || true)
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
