import json, sys, statistics
from datetime import datetime, date, timedelta
from collections import defaultdict
D = sys.argv[1]
import os
W0 = date(2026, 7, 13)
TODAY = date.fromisoformat(os.environ.get('SNAPSHOT', date.today().isoformat()))
LAST_WEEK = (TODAY - W0).days // 7  # the current, partial week
items = [json.loads(l) for l in open(f'{D}/items.jsonl')]
items = [x for x in items if x['user'] != 'DuarteSantos8' and not x['user'].endswith('[bot]')]
for x in items:
    x['dt'] = datetime.strptime(x['created'], '%Y-%m-%dT%H:%M:%SZ')
    x['wk'] = (x['dt'].date() - W0).days // 7
by = defaultdict(list)
for x in items: by[x['user']].append(x)
for u in by: by[u].sort(key=lambda x: x['dt'])

# 1. retention
cohorts = defaultdict(list)
for u, its in by.items(): cohorts[its[0]['wk']].append(u)
retention = []
for cw in sorted(cohorts):
    users = cohorts[cw]; wks = {u: {x['wk'] for x in by[u]} for u in users}
    for off in range(1, 9):
        w = cw + off
        if w > LAST_WEEK: break
        act = sum(1 for u in users if w in wks[u])
        retention.append({'cohort_week': (W0 + timedelta(weeks=cw)).isoformat(), 'size': len(users),
                          'offset': off, 'active': act, 'pct': round(100 * act / len(users), 1),
                          'partial_week': w == LAST_WEEK})

# 2. journeys
n = len(by)
only_i = [u for u, its in by.items() if not any(x['pr'] for x in its)]
only_p = [u for u, its in by.items() if all(x['pr'] for x in its)]
both = [u for u, its in by.items() if any(x['pr'] for x in its) and not all(x['pr'] for x in its)]
first_issue = [u for u, its in by.items() if not its[0]['pr']]
conv_days = []
for u in first_issue:
    its = by[u]; p = next((x for x in its if x['pr']), None)
    if p: conv_days.append((p['dt'] - its[0]['dt']).total_seconds() / 86400)
multi = [u for u, its in by.items() if len(its) >= 2]
span = [(by[u][-1]['dt'] - by[u][0]['dt']).total_seconds() / 86400 for u in multi]
pct = lambda a, b: round(100 * a / b, 1) if b else None
med = lambda v: round(statistics.median(v), 1) if v else None
journeys = {
    'people': n, 'items': len(items),
    'only_issues': len(only_i), 'only_issues_pct': pct(len(only_i), n),
    'only_prs': len(only_p), 'only_prs_pct': pct(len(only_p), n),
    'both': len(both), 'both_pct': pct(len(both), n),
    'first_item_issue': len(first_issue),
    'first_issue_then_pr': len(conv_days), 'first_issue_then_pr_pct': pct(len(conv_days), len(first_issue)),
    'median_days_first_issue_to_first_pr': med(conv_days),
    'first_item_pr': n - len(first_issue),
    'people_2plus_items': len(multi), 'people_2plus_items_pct': pct(len(multi), n),
    'median_days_first_to_last_item_2plus': med(span),
    'single_item_people': n - len(multi),
}

# 3. concentration
def conc(sub):
    cnt = defaultdict(int)
    for x in sub: cnt[x['user']] += 1
    s = sorted(cnt.items(), key=lambda kv: -kv[1]); tot = len(sub)
    r = {'total': tot, 'people': len(cnt)}
    for k in (1, 5, 10):
        r[f'top{k}_count'] = sum(v for _, v in s[:k]); r[f'top{k}_pct'] = pct(r[f'top{k}_count'], tot)
    r['top10'] = [{'user': u, 'count': v} for u, v in s[:10]]
    return r
concentration = {'all': conc(items), 'prs': conc([x for x in items if x['pr']]),
                 'issues': conc([x for x in items if not x['pr']])}
out = {'meta': {'week0': W0.isoformat(), 'data_end': '2026-11-20', 'last_week_index': LAST_WEEK,
                'last_week_partial': True, 'excluded': 'DuarteSantos8 and *[bot]',
                'note': 'retention rows only for offsets whose week <= 18; partial_week marks week 18'},
       'retention': retention, 'journeys': journeys, 'concentration': concentration}
json.dump(out, open(f'{D}/new/cohorts.json', 'w'), indent=1)
