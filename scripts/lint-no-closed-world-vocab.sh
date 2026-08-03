#!/usr/bin/env bash
#
# lint-no-closed-world-vocab.sh — pre-commit guard against re-introducing
# closed-world vocabulary in code.
#
# The recurring base-model failure on this project is closing an open set to
# make it enumerable: a stored role/archetype/category field where meaning is
# DERIVED from clauses + event state. Each banned identifier below was added,
# corrected, and excised at least once (roleKind: 37 commits, archetypeId: 13,
# fulfilment: 119). Memories advise, guards enforce — this guard makes the
# excision permanent.
#
# FAIL — verified at zero in live code; any reappearance is the old model
# coming back:
#   roleKind, archetypeId, clauseCategories, documentKind
#   fulfilment / fulfillment (any casing) — promoted WARN→FAIL 2026-06-11
#   when the figaro-fulfilment-v2 retirement landed (split into the
#   single-select modalities + coordination clauses) and the word swept to
#   zero. The replacement vocabulary is modality / coordination / method.
#
# FAIL (doctrine class, code AND markdown) — bonding-multiplier drift. The 2×
# bonding multiplier is mechanism-design DOCTRINE (operator ruling 2026-07-14).
# The recurring prior is traditional-finance capital-efficiency reasoning:
# ">1× suffices", "1+ε restores strict loss", reputation-weighted/adjusted
# bonds. Excised from THEORY.md + the retrospective-audit memory 2026-07-14;
# any reappearance is that prior worming back in.
#
# Scope: legacy vocabulary classes check code files only (.ts/.tsx/.sol/.rs);
# docs narrate the history of those words and are exempt. The doctrine class
# additionally checks .md files — a doctrine violation is never "history".
# CLAUDE.md and the /papers pages (frontend/app/(marketing)/papers/ —
# historical prose rendered as .tsx) are exempt from all classes: they
# narrate the bans themselves.
#
# Wired into the root package.json lint-staged block under
# `**/*.{ts,tsx,sol,rs,md}`. Run manually over the whole repo:
#   git ls-files '*.ts' '*.tsx' '*.sol' '*.rs' '*.md' | xargs bash scripts/lint-no-closed-world-vocab.sh
#
# Exit code: 0 on clean (warnings allowed), 1 on any FAIL violation.

set -euo pipefail

FAIL_TERMS='roleKind|archetypeId|clauseCategories|documentKind'
FAIL_WORD='[Ff]ulfil+ment'
# 2× is doctrine: no ">1x"/">1×", no "1+ε"/"1+epsilon" bonding bound, no
# reputation-weighted/adjusted bonds, no lower/reduced/variable/tunable multiplier.
FAIL_DOCTRINE='>[[:space:]]*1(\.[0-9]+)?[x×]|1[[:space:]]*\+[[:space:]]*(ε|epsilon)|[Rr]eputation[- ]?weighted|reputationMultiplier|adjustedBond|(lower|reduced|variable|tunable)[[:space:]]+(bond[[:space:]]+)?multiplier'
# Bonds are DETERRENTS, not assets (operator ruling 2026-07-24): never financeable
# ("bond-financing"), never a credit instrument ("bond-default" — bonds forfeit, they
# cannot default), never measured by capital efficiency, never "bonds are capital".
FAIL_DETERRENT='[Bb]ond[- ]financ|[Bb]ond[- ]default|[Cc]apital[- ][Ee]fficien|bonds are capital'
# "money" is BANNED (operator ruling 2026-08-03): nothing in this system IS money —
# the florin is a TOKEN and a SCHELLING POINT; what moves is tokens/value/payments.
# The word drags readers into the old economic paradigm, and it is just plain wrong
# for an ERC-20-based protocol. Replacements are context-specific (value / token /
# payment / deposit / stake / payout) — never mechanical. The ONLY sanctioned uses
# are sentences about money-the-concept (fiat, historical currency naming, the old
# platform world), enumerated below; papers are file-exempt (Howey/MiCA quotes,
# citation titles, Bitcoin-as-money analysis — swept + sanctioned 2026-08-03).
FAIL_MONEY='\bmoney\b'
ALLOWED_MONEY='hold the money, decide|real money is a common|Historical money names|ordinary money|hold its money|your identity, your money'

violations=0

for file in "$@"; do
    [[ -f "$file" ]] || continue
    is_md=0
    case "$file" in
        *.ts | *.tsx | *.sol | *.rs) ;;
        *.md) is_md=1 ;;
        *) continue ;;
    esac
    # Papers narrate the project's history (incl. retired vocabulary) — exempt.
    # CLAUDE.md narrates the bans themselves — exempt.
    case "$file" in
        *"(marketing)/papers/"* | *CLAUDE.md) continue ;;
    esac

    hits=$(grep -nE "$FAIL_DOCTRINE" "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[closed-world] $file — bonding-multiplier drift: 2× is mechanism-design DOCTRINE (ruled 2026-07-14), never '>1×'/'1+ε'/reputation-weighted/variable"
        echo "$hits" | head -3 | sed 's/^/    /'
        violations=$((violations + 1))
    fi

    hits=$(grep -nE "$FAIL_DETERRENT" "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[closed-world] $file — bonds-as-assets drift: bonds are DETERRENTS, not assets (ruled 2026-07-24) — never bond-financing / bond-default / capital-efficiency / 'bonds are capital'"
        echo "$hits" | head -3 | sed 's/^/    /'
        violations=$((violations + 1))
    fi

    hits=$(grep -niE "$FAIL_MONEY" "$file" | grep -viE "$ALLOWED_MONEY" || true)
    if [[ -n "$hits" ]]; then
        echo "[closed-world] $file — 'money' is BANNED (ruled 2026-08-03): the florin is a TOKEN, never money; say value / token / payment / deposit / stake per context. A genuinely money-the-concept sentence needs a conscious ALLOWED_MONEY entry."
        echo "$hits" | head -3 | sed 's/^/    /'
        violations=$((violations + 1))
    fi

    # The legacy vocabulary classes are code-only; docs narrate their history.
    (( is_md )) && continue

    hits=$(grep -nE "\b($FAIL_TERMS)\b" "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[closed-world] $file — banned closed-world identifier (meaning is derived from clauses + events, never stored)"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi

    hits=$(grep -nE "$FAIL_WORD" "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[closed-world] $file — 'fulfilment' is RETIRED vocabulary (the v2 clause split into modalities + coordination; say modality / coordination / method)"
        echo "$hits" | head -3 | sed 's/^/    /'
        violations=$((violations + 1))
    fi
done

if (( violations > 0 )); then
    echo ""
    echo "[closed-world] $violations violation(s). There is no stored role/archetype/"
    echo "               category/modality field in Figaro: what a party or node does"
    echo "               is a clause/state lookup. Derive it; don't store it."
    exit 1
fi

exit 0
