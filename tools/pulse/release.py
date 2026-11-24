"""The next release, measured against the last tag.

Finds the newest upstream release-* branch and the newest tag, then writes:
  out/next_release.json  one row per day since the tag: commits on the branch, test builds cut that day
  rows added to out/summary.json: the branch's version, commits, authors, test builds and the
  pull requests merged since the tag (yours too)

Usage: python3 -I release.py <repo> <data-dir>   (run after analyze.py, extend.py and contributors.py)
"""
import collections
import datetime as dt
import json
import os
import re
import subprocess
import sys

REPO, D = sys.argv[1], sys.argv[2]
OUT = os.path.join(D, 'out')
today = dt.date.fromisoformat(os.environ.get('SNAPSHOT', dt.date.today().isoformat()))
ME = os.environ.get('PULSE_ME', 'cubetes')
ME_NAMES = {'Adrián Fernández', ME}
code = open(__file__, encoding='utf-8').read()


def git(*a):
    return subprocess.run(['git', '-C', REPO] + list(a), capture_output=True, text=True).stdout.strip()


rels = git('for-each-ref', '--sort=-committerdate', '--format=%(refname:short)', 'refs/remotes/upstream/release-*').split()
branch = rels[0] if rels else 'upstream/main'
tag = git('for-each-ref', '--sort=-creatordate', '--count=1', '--format=%(refname:short)', 'refs/tags')
tag_date = dt.datetime.fromisoformat(git('for-each-ref', '--format=%(creatordate:iso-strict)', f'refs/tags/{tag}'))
try:
    version = json.loads(git('show', f'{branch}:frontend/package.json'))['version']
except (ValueError, KeyError):
    version = branch.split('release-')[-1]
released = version == tag.lstrip('v')

log = git('log', '--no-merges', '--format=%cI%x1f%an%x1f%s', f'{tag}..{branch}').splitlines()
rows = [dict(zip(('at', 'author', 'subject'), line.split('\x1f', 2))) for line in log if line]
builds = [r for r in rows if re.search(r'test build', r['subject'], re.I)]
per_day = collections.Counter(r['at'][:10] for r in rows)
build_day = collections.Counter(r['at'][:10] for r in builds)
days = []
d = tag_date.date()
while d <= today:
    days.append(dict(date=d.isoformat(), commits=per_day.get(d.isoformat(), 0), test_builds=build_day.get(d.isoformat(), 0)))
    d += dt.timedelta(days=1)
json.dump({'rows': days, 'meta': [{'label': 'release.py', 'value': code, 'type': 'code', 'lang': 'python'},
                                  {'label': 'Branch', 'value': f'{branch} against {tag}'},
                                  {'label': 'Snapshot', 'value': today.isoformat()},
                                  {'label': 'Counting', 'value': 'Non-merge commits by the day they were committed to the branch; a test build is a commit whose subject says "test build".'}]},
          open(os.path.join(OUT, 'next_release.json'), 'w'), ensure_ascii=False)

items = [json.loads(line) for line in open(os.path.join(D, 'items.jsonl'))]
merged = [i for i in items if i['pr'] and i['merged'] and dt.datetime.fromisoformat(i['merged'].replace('Z', '+00:00')) >= tag_date]
latest = max(builds, key=lambda r: r['at']) if builds else None
extra = [
    ('next_version', version), ('next_branch', branch.replace('upstream/', '')), ('next_released', released),
    ('next_last_tag', tag), ('next_tag_date', tag_date.date().isoformat()),
    ('next_commits', len(rows)), ('next_authors', len({r['author'] for r in rows})),
    ('next_your_commits', sum(1 for r in rows if r['author'] in ME_NAMES)),
    ('next_test_builds', len(builds)),
    ('next_last_build', re.sub(r'\s*\(.*', '', latest['subject'])[:60] if latest else '—'),
    ('next_last_build_date', latest['at'][:10] if latest else '—'),
    ('next_prs_merged', len(merged)), ('next_your_prs_merged', sum(1 for i in merged if i['user'] == ME)),
    ('next_last_commit', max(r['at'] for r in rows)[:10] if rows else '—'),
]
summ = json.load(open(os.path.join(OUT, 'summary.json')))
have = {k for k, _ in extra}
summ['rows'] = [r for r in summ['rows'] if r['metric'] not in have] + [dict(metric=k, value=v) for k, v in extra]
summ['meta'].append({'label': 'release.py', 'value': code, 'type': 'code', 'lang': 'python'})
json.dump(summ, open(os.path.join(OUT, 'summary.json'), 'w'), ensure_ascii=False)
print(dict(extra))
