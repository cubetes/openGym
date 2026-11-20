#!/usr/bin/env python3
"""Collect review-load / maintainer-responsiveness signals via the GitHub search API only."""
import collections
import json
import os
import subprocess
import sys
import time

# Usage: review_signals.py <data-dir>
import datetime as _dt
DATA = sys.argv[1]
TODAY = os.environ.get('SNAPSHOT', _dt.date.today().isoformat())
OUT = os.path.join(DATA, 'new', 'review_signals.json')
CACHE = os.path.join(DATA, 'new', f'search_cache_{TODAY}.json')  # resumes a run that hit the rate limit
REPO = 'repo:DuarteSantos8/openGym'
MAINT = 'DuarteSantos8'

cache = {}
if os.path.exists(CACHE):
    cache = json.load(open(CACHE))
calls = 0


def search(q, page=1, per_page=100):
    global calls
    key = f'{q}|{page}|{per_page}'
    if key in cache:
        return cache[key]
    assert 'is:pr' in q or 'is:issue' in q
    for attempt in range(2):
        time.sleep(2.5)
        calls += 1
        p = subprocess.run(['gh', 'api', '-X', 'GET', 'search/issues',
                            '-f', f'q={REPO} {q}', '-f', f'per_page={per_page}', '-f', f'page={page}'],
                           capture_output=True, text=True)
        if p.returncode == 0:
            d = json.loads(p.stdout)
            res = {'total_count': d['total_count'], 'incomplete': d.get('incomplete_results'),
                   'items': [{'n': i['number'], 'updated_at': i['updated_at'], 'comments': i['comments'],
                              'draft': i.get('draft'), 'labels': [l['name'] for l in i['labels']],
                              'author_association': i['author_association'], 'user': i['user']['login'],
                              'is_pr': 'pull_request' in i} for i in d['items']]}
            cache[key] = res
            json.dump(cache, open(CACHE, 'w'))
            return res
        err = p.stderr + p.stdout
        print(f'error on {q!r} p{page}: {err[:200]}', file=sys.stderr)
        if attempt == 0:
            time.sleep(30)
    raise RuntimeError(f'search failed: {q}')


def fetch_all(q):
    first = search(q, 1)
    total = first['total_count']
    if total > 1000 and 'created:' not in q:
        # the search API stops at 1,000 results: split by month of creation
        out, m = [], _dt.date(2026, 7, 1)
        while m <= _dt.date.fromisoformat(TODAY):
            nxt = (m.replace(day=28) + _dt.timedelta(days=4)).replace(day=1)
            out += fetch_all(f'{q} created:{m.isoformat()}..{(nxt - _dt.timedelta(days=1)).isoformat()}')
            m = nxt
        return out
    items = list(first['items'])
    page = 2
    while len(items) < total and page <= 10:
        r = search(q, page)
        if not r['items']:
            break
        items += r['items']
        page += 1
    if len(items) != total:
        print(f'WARN {q!r}: got {len(items)} of {total}', file=sys.stderr)
    return items


def count(q):
    return search(q, 1, per_page=1)['total_count']


# A. open PRs
open_items = fetch_all('is:pr is:open')
open_prs = sorted([{k: i[k] for k in ('n', 'updated_at', 'comments', 'draft', 'labels', 'author_association')}
                   for i in open_items], key=lambda x: x['n'])

# B. sets
set_queries = {
    'pr_commenter_maintainer': f'is:pr commenter:{MAINT}',
    'pr_commenter_coderabbit': 'is:pr commenter:coderabbitai[bot]',
    'pr_open_commenter_maintainer': f'is:pr is:open commenter:{MAINT}',
    'issue_commenter_maintainer': f'is:issue commenter:{MAINT}',
    'issue_open_commenter_maintainer': f'is:issue is:open commenter:{MAINT}',
    'issue_open_no_assignee': 'is:issue no:assignee is:open',
    'pr_review_approved': 'is:pr review:approved',
    'pr_review_changes_requested': 'is:pr review:changes_requested',
}
sets = {name: sorted({i['n'] for i in fetch_all(q)}) for name, q in set_queries.items()}

# C. commenters
items = [json.loads(l) for l in open(os.path.join(DATA, 'items.jsonl'))]
c = collections.Counter(i['user'] for i in items)
people = [u for u, _ in c.most_common() if not u.endswith('[bot]') and u != MAINT][:25] + [MAINT]
commenters = []
for u in people:
    commenters.append({'user': u,
                       'authored_items': c[u],
                       'pr_comments_on_others': count(f'is:pr commenter:{u} -author:{u}'),
                       'issue_comments_on_others': count(f'is:issue commenter:{u} -author:{u}')})

json.dump({'open_prs': open_prs, 'sets': sets, 'commenters': commenters, 'fetched_at': TODAY,
           'queries': set_queries,
           'notes': 'GitHub search API only; commenter: qualifier matches issue/PR conversation comments '
                    '(and per GitHub semantics may include review comments); review:approved / '
                    'review:changes_requested reflect the PR review decision state.'},
          open(OUT, 'w'), indent=1)
print('calls', calls, 'open', len(open_prs), {k: len(v) for k, v in sets.items()})
