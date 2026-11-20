#!/bin/bash
# Usage: export_git.sh <repo> <data-dir>
# Fetches upstream DuarteSantos8/openGym branches and tags into <repo> and writes the git inputs analyze.py reads.
set -euo pipefail
REPO=$1; D=$2; mkdir -p "$D"
UP=https://github.com/DuarteSantos8/openGym.git
for i in 1 2 3; do git -C "$REPO" fetch -q "$UP" '+refs/heads/*:refs/remotes/upstream/*' --tags --force && break || sleep $((i*10)); done
git -C "$REPO" log --remotes=upstream --tags --no-merges --date=iso-strict \
  --pretty=tformat:'@@%H%x1f%an%x1f%ae%x1f%aI%x1f%cI%x1f%s' --numstat > "$D/commits_raw.txt"
git -C "$REPO" log --remotes=upstream --tags --format='%B%x1e' > "$D/bodies.txt"
git -C "$REPO" for-each-ref --sort=creatordate --format='%(refname:short)	%(creatordate:iso-strict)' refs/tags > "$D/tags.txt"
git -C "$REPO" log upstream/cla-signatures --date=iso-strict --pretty='%aI	%s' | grep 'signed the CLA' > "$D/cla.txt" || true
REL=$(git -C "$REPO" for-each-ref --sort=-committerdate --format='%(refname:short)' 'refs/remotes/upstream/release-*' | head -1)
git -C "$REPO" show "${REL:-upstream/main}:CHANGELOG.md" > "$D/CHANGELOG.md"
echo "git inputs written to $D (changelog from ${REL:-upstream/main})"
