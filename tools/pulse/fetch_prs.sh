#!/bin/bash
# Fetch open PR heads into refs/pr/N in batches of 40.
# Usage: fetch_prs.sh <repo> <data-dir> [list-file]   (list defaults to <data-dir>/open_prs.txt)
R=$1; D=$2; LIST=${3:-$D/open_prs.txt}; mkdir -p $D/new
URL=https://github.com/DuarteSantos8/openGym.git
mapfile -t prs < <(grep -E '^[0-9]+$' $LIST)
: > $D/new/fetch_failed.txt
dofetch() { git -C $R fetch -q $URL "$@" 2>&1; }
for ((i=0; i<${#prs[@]}; i+=40)); do
  specs=(); for n in "${prs[@]:i:40}"; do specs+=("+refs/pull/$n/head:refs/pr/$n"); done
  out=$(dofetch "${specs[@]}"); rc=$?
  if [ $rc -ne 0 ]; then
    echo "batch $i failed rc=$rc: $out" | head -3
    if echo "$out" | grep -q 429; then sleep 5; else sleep 10; fi
    out=$(dofetch "${specs[@]}"); rc=$?
    if [ $rc -ne 0 ]; then
      echo "batch $i retry failed; per-PR fallback: $out" | head -3
      for n in "${prs[@]:i:40}"; do
        git -C $R fetch -q $URL "+refs/pull/$n/head:refs/pr/$n" 2>/dev/null || echo $n >> $D/new/fetch_failed.txt
      done
    fi
  fi
  echo "batch $i done"
done
echo "failed: $(wc -l < $D/new/fetch_failed.txt)"
