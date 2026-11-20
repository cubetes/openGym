#!/bin/bash
cd "${1:-.}"; out=items.jsonl; : > $out
# one window up to 10 Oct 2026, then one per week until today (each stays well under the search cap of 1,000)
windows=("2025-01-01..2026-10-10")
d=2026-10-11; today=$(date -u +%F)
while [[ "$d" < "$today" || "$d" == "$today" ]]; do e=$(date -u -d "$d +6 days" +%F); windows+=("$d..$e"); d=$(date -u -d "$d +7 days" +%F); done
for kind in issue pull-request; do
for w in "${windows[@]}"; do
  page=1; tries=0
  while :; do
    r=$(gh api -X GET search/issues -f q="repo:DuarteSantos8/openGym is:$kind created:$w" -f per_page=100 -f page=$page -f sort=created -f order=asc 2>/dev/null)
    tc=$(echo "$r" | jq -r '.total_count' 2>/dev/null)
    if [ -z "$tc" ] || [ "$tc" = null ]; then tries=$((tries+1)); echo "ERR $kind $w p$page"; [ $tries -gt 6 ] && { echo "search kept failing for $kind $w page $page" >&2; exit 1; }; sleep $((tries*20)); continue; fi
    n=$(echo "$r" | jq '.items|length')
    echo "$r" | jq -c '.items[] | {n:.number,pr:(.pull_request!=null),title,user:.user.login,assoc:.author_association,state,created:.created_at,closed:.closed_at,merged:.pull_request.merged_at,comments,labels:[.labels[].name],reason:.state_reason,draft,reactions:.reactions.total_count}' >> $out
    echo "$kind $w p$page: $n / $tc"
    [ "$n" -lt 100 ] && break
    page=$((page+1)); sleep 2.5
  done
  sleep 2
done; done
wc -l $out
