#!/bin/bash
# openGym Pulse: rebuild every dashboard dataset from scratch.
# Usage: tools/pulse/run.sh <data-dir>   (run from a clone of the openGym fork; needs gh, git, python3, jq)
# Writes <data-dir>/out/*.json. The title classification (classification.json) is not made here:
# copy the previous one into <data-dir>/new/ first and classify any new numbers (see README.md).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); REPO=$(git -C "$HERE" rev-parse --show-toplevel); D=$(mkdir -p "$1" && cd "$1" && pwd)
export SNAPSHOT=${SNAPSHOT:-$(date -u +%F)}
mkdir -p "$D/new" "$D/out"
echo "== git history and tags";     "$HERE/export_git.sh" "$REPO" "$D"
echo "== issues and pull requests"; "$HERE/fetch_items.sh" "$D"
jq -r 'select(.pr and .state=="open") | .n' "$D/items.jsonl" > "$D/open_prs.txt"
jq -r 'select(.pr) | .n' "$D/items.jsonl" > "$D/all_prs.txt"
echo "== pull request heads";       "$HERE/fetch_prs.sh" "$REPO" "$D" "$D/all_prs.txt"
echo "== merge checks";             python3 -I "$HERE/pr_git_state.py" "$REPO" "$D"
echo "== review signals";           python3 -I "$HERE/review_signals.py" "$D"
echo "== cohorts";                  python3 -I "$HERE/cohorts.py" "$D"
echo "== base datasets";            python3 -I "$HERE/analyze.py" "$D" > /dev/null
echo "== extra datasets";           python3 -I "$HERE/extend.py" "$D"
echo "== contributors";             python3 -I "$HERE/contributors.py" "$REPO" "$D"
