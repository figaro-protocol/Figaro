#!/usr/bin/env bash
#
# lint-sdk-dist-freshness.sh — fail on sdk/dist modules with no src counterpart.
#
# The frontend EXECUTES sdk/dist (file:../sdk + the exports map), but tsc never
# deletes the outputs of deleted sources: after a feature teardown, its compiled
# modules keep sitting in dist, where they can silently ship deleted APIs into a
# hosted build and poison any audit that reads dist as ground truth (the 2026-07
# state: 9 orphan modules incl. merkleAirdrop, agent/sequencer, the retired
# schemas/* tree). `npm --prefix sdk run build` clean-rebuilds (rm -rf dist);
# this guard certifies the invariant afterwards: every dist artifact traces to
# a live source file.
set -euo pipefail
cd "$(dirname "$0")/.."

# An absent dist isn't stale — it's unbuilt (fresh clone). Nothing to certify.
if [ ! -d sdk/dist ]; then
    echo "[sdk-dist] no dist/ — unbuilt tree; run: npm --prefix sdk run build"
    exit 0
fi

fail=0

# Every compiled module must have a live .ts source.
while IFS= read -r js; do
    rel="${js#sdk/dist/}"
    base="${rel%.js}"
    if [ ! -f "sdk/src/$base.ts" ] && [ ! -f "sdk/src/$base.tsx" ]; then
        echo "[sdk-dist] ORPHAN module: sdk/dist/$rel (no sdk/src/$base.ts)"
        fail=1
    fi
done < <(find sdk/dist -type f -name '*.js')

# Every carried asset (resolveJsonModule emits imported JSON) must too.
while IFS= read -r asset; do
    rel="${asset#sdk/dist/}"
    if [ ! -f "sdk/src/$rel" ]; then
        echo "[sdk-dist] ORPHAN asset: sdk/dist/$rel (no sdk/src/$rel)"
        fail=1
    fi
done < <(find sdk/dist -type f -name '*.json' ! -name 'tsconfig.tsbuildinfo')

if [ "$fail" -eq 0 ]; then
    echo "[sdk-dist] clean — every dist artifact traces to a live source"
else
    echo "[sdk-dist] stale dist — clean-rebuild: npm --prefix sdk run build"
fi
exit "$fail"
