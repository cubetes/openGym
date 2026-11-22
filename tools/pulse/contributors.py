"""Commits by contributor, and what each contributor worked on.

Joins git authors to GitHub logins (through the head commits of every pull request), then writes:
  out/contributors.json   one row per person: commits, lines, active days, pull requests, issues,
                          main area and main theme
  out/contrib_weekly.json person, week, commits (the people the page lets you pick)
  out/contrib_work.json   person, dimension (area or theme), name, commits
  out/contrib_recent.json person's latest commits and pull requests, with their theme
  out/commit_labels.json  theme and kind of every commit (input kept for the next refresh)

Usage: python3 -I contributors.py <repo> <data-dir>
Needs refs/pr/<n> for the pull requests (fetch_prs.sh with all_prs.txt) and
<data-dir>/new/commit_classification.json ([{id, theme, kind}], id = first 10 characters of the sha).
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
MAINTAINER = 'DuarteSantos8'
MAINTAINER_NAMES = {'Duarte Santos', 'root', 'DuarteSantos8'}
PICK = 30  # people offered in the page's picker
W0 = dt.date(2026, 7, 13)
code = open(__file__, encoding='utf-8').read()


def P(s):
    return dt.datetime.fromisoformat(s.replace('Z', '+00:00')) if s else None


def git(*a):
    return subprocess.run(['git', '-C', REPO] + list(a), capture_output=True, text=True).stdout


# ---- commits (same parsing and exclusions as analyze.py)
commits, cur = [], None
for line in open(os.path.join(D, 'commits_raw.txt'), encoding='utf-8', errors='replace'):
    line = line.rstrip('\n')
    if line.startswith('@@'):
        h, an, ae, ad, cd, s = line[2:].split('\x1f', 5)
        cur = dict(h=h, an=an, ae=ae.lower(), ad=dt.datetime.fromisoformat(ad), s=s, add=0, dele=0, areas=set())
        commits.append(cur)
    elif line and cur is not None and '\t' in line:
        a, d_, f = line.split('\t', 2)
        if a != '-':
            cur['add'] += int(a)
            cur['dele'] += int(d_)
        f = f.split(' => ')[-1].strip('{}')
        parts = f.split('/')
        top = parts[0]
        if top == 'frontend':
            sub = parts[1] if len(parts) > 1 else ''
            top = {'android': 'android', 'ios': 'ios'}.get(sub, 'frontend')
            if sub == 'ios' and 'Watch' in f:
                top = 'watch'
            if sub == 'android' and 'wear' in f.lower():
                top = 'watch'
            if sub == 'src' and len(parts) > 2 and parts[2] == 'locales':
                top = 'locales'
        if top.startswith('watch') or top == 'garmin':
            top = 'watch'
        cur['areas'].add(top)
commits = [c for c in commits if 'has signed the CLA' not in c['s']]
seen = set()
commits = [c for c in commits if not (c['h'] in seen or seen.add(c['h']))]
AREA = {'frontend': 'App (web)', 'api': 'Server', 'watch': 'Watches', 'android': 'Android', 'ios': 'iOS',
        'locales': 'Translations', 'website': 'Website', 'docs': 'Docs', 'mcp': 'MCP', 'catalogue': 'Exercise catalogue'}

items = [json.loads(line) for line in open(os.path.join(D, 'items.jsonl'))]
prs = [i for i in items if i['pr']]
logins = {i['user'] for i in items}
lower_login = {u.lower(): u for u in logins}

# ---- who is who: git author (email first, then name) -> GitHub login
votes = collections.defaultdict(collections.Counter)
for pr in prs:
    if pr['user'] in (MAINTAINER,) or pr['user'].endswith('[bot]'):
        continue
    out = git('log', '-n', '5', '--no-merges', '--format=%an%x1f%ae', f'refs/pr/{pr["n"]}')
    for row in out.splitlines():
        an, ae = row.split('\x1f')
        if an in MAINTAINER_NAMES:
            continue
        votes['e:' + ae.lower()][pr['user']] += 1
        votes['n:' + an][pr['user']] += 1


def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


norm_login = {norm(u): u for u in logins}


def person_of(c):
    if c['an'] in MAINTAINER_NAMES:
        return MAINTAINER
    m = re.match(r'(?:\d+\+)?([^@]+)@users\.noreply\.github\.com', c['ae'])
    if m and m.group(1).lower() in lower_login:
        return lower_login[m.group(1).lower()]
    for key in ('e:' + c['ae'], 'n:' + c['an']):
        if votes.get(key):
            return votes[key].most_common(1)[0][0]
    if norm(c['an']) in norm_login:
        return norm_login[norm(c['an'])]
    return c['an']  # no GitHub login found: keep the git name


for c in commits:
    c['who'] = person_of(c)

# ---- classification
ccls = {}
p = os.path.join(D, 'new', 'commit_classification.json')
if os.path.exists(p):
    ccls = {r['id']: r for r in json.load(open(p))}
icls = {}
p = os.path.join(D, 'new', 'classification.json')
if os.path.exists(p):
    icls = {r['n']: r for r in json.load(open(p))}
for c in commits:
    r = ccls.get(c['h'][:10], {})
    c['theme'], c['kind'] = r.get('theme', 'Unclassified'), r.get('kind', '')

# ---- pull requests credited elsewhere (same rule as analyze.py)
mentioned = set(int(n) for n in re.findall(r'#(\d{2,4})\b', open(os.path.join(D, 'bodies.txt'), encoding='utf-8', errors='replace').read()))
mentioned |= set(int(n) for n in re.findall(r'#(\d{2,4})\b', open(os.path.join(D, 'CHANGELOG.md'), encoding='utf-8').read()))

# ---- per person
people = collections.defaultdict(lambda: dict(commits=0, add=0, dele=0, days=set(), first=None, last=None,
                                              areas=collections.Counter(), themes=collections.Counter(), kinds=collections.Counter(),
                                              prs=0, merged=0, credited=0, open=0, issues=0, pr_themes=collections.Counter()))
for c in commits:
    q = people[c['who']]
    q['commits'] += 1
    q['add'] += c['add']
    q['dele'] += c['dele']
    d = c['ad'].date()
    q['days'].add(d)
    q['first'] = d if q['first'] is None or d < q['first'] else q['first']
    q['last'] = d if q['last'] is None or d > q['last'] else q['last']
    for a in c['areas']:
        q['areas'][AREA.get(a, 'Other')] += 1
    q['themes'][c['theme']] += 1
    q['kinds'][c['kind']] += 1
for i in items:
    if i['user'].endswith('[bot]'):
        continue
    q = people[i['user']]
    if i['pr']:
        q['prs'] += 1
        q['merged'] += bool(i['merged'])
        q['credited'] += (not i['merged'] and i['state'] == 'closed' and i['n'] in mentioned)
        q['open'] += i['state'] == 'open'
        q['pr_themes'][icls.get(i['n'], {}).get('theme', 'Unclassified')] += 1
    else:
        q['issues'] += 1

rows = []
for who, q in people.items():
    if q['commits'] == 0 and q['prs'] == 0:
        continue
    top_theme = (q['themes'] or q['pr_themes']).most_common(1)
    rows.append(dict(
        person=who, has_login=who in logins, is_you=who == ME, is_maintainer=who == MAINTAINER,
        commits=q['commits'], lines_added=q['add'], lines_deleted=q['dele'], active_days=len(q['days']),
        first_commit=q['first'].isoformat() if q['first'] else None, last_commit=q['last'].isoformat() if q['last'] else None,
        prs_opened=q['prs'], prs_merged=q['merged'], prs_credited=q['credited'], prs_open=q['open'], issues_opened=q['issues'],
        fixes=q['kinds']['fix'], features=q['kinds']['feature'] + q['kinds']['improvement'],
        top_area=q['areas'].most_common(1)[0][0] if q['areas'] else None,
        top_theme=top_theme[0][0] if top_theme else None))
rows.sort(key=lambda r: (-r['commits'], -r['prs_opened']))
for k, r in enumerate(rows):
    r['rank'] = k + 1


def save(name, data, note):
    meta = [{'label': 'contributors.py', 'value': code, 'type': 'code', 'lang': 'python'},
            {'label': 'Snapshot', 'value': today.isoformat()}, {'label': 'Inputs', 'value': note}]
    json.dump({'rows': data, 'meta': meta}, open(os.path.join(OUT, name + '.json'), 'w'), ensure_ascii=False)


IDN = ('Git authors are matched to GitHub logins through the head commits of every pull request and '
       'GitHub noreply addresses; anyone without a match keeps their git name. Emails are used for the match only.')
save('contributors', rows, 'git history of all upstream branches, items.jsonl, commit_classification.json. ' + IDN)

picked = [r['person'] for r in sorted(rows, key=lambda r: -(r['commits'] + 2 * r['prs_opened']))[:PICK]]
if ME in people and ME not in picked:
    picked.append(ME)
nweeks = (today - W0).days // 7 + 1
weeks = [(W0 + dt.timedelta(7 * i)).isoformat() for i in range(nweeks)]
wk = collections.Counter((c['who'], (c['ad'].date() - W0).days // 7) for c in commits)
prw = collections.Counter((i['user'], (P(i['created']).date() - W0).days // 7) for i in prs)
save('contrib_weekly', [dict(person=p_, week=weeks[w], commits=wk[(p_, w)], prs_opened=prw[(p_, w)])
                        for p_ in picked for w in range(nweeks)], 'commits and pull requests opened, per person and week')

work = []
for p_ in picked:
    q = people[p_]
    for name, v in q['areas'].most_common():
        work.append(dict(person=p_, dimension='area', name=name, commits=v))
    for name, v in q['themes'].most_common():
        work.append(dict(person=p_, dimension='theme', name=name, commits=v))
    for name, v in q['pr_themes'].most_common():
        work.append(dict(person=p_, dimension='pr_theme', name=name, commits=v))
save('contrib_work', work, 'area = part of the code a commit touched (a commit counts once per area); '
     'theme = Claude\'s reading of the commit message; pr_theme = Claude\'s reading of the pull request title')

recent = []
for p_ in picked:
    ev = [dict(person=p_, date=c['ad'].date().isoformat(), type='commit', ref=c['h'][:9], title=c['s'][:140], theme=c['theme'])
          for c in commits if c['who'] == p_]
    ev += [dict(person=p_, date=i['created'][:10], type='pull request', ref='#' + str(i['n']), title=i['title'][:140],
                theme=icls.get(i['n'], {}).get('theme', 'Unclassified')) for i in prs if i['user'] == p_]
    ev.sort(key=lambda e: e['date'], reverse=True)
    recent += ev[:10]
save('contrib_recent', recent, 'the ten newest commits and pull requests of each person in the picker')

save('commit_labels', [dict(id=c['h'][:10], theme=c['theme'], kind=c['kind']) for c in commits if c['theme'] != 'Unclassified'],
     'Claude read each commit message and picked one theme and kind; this is a reading, not data from git')

# a few rows for the summary
summ = json.load(open(os.path.join(OUT, 'summary.json')))
non_m = [r for r in rows if not r['is_maintainer']]
extra = [('contributors_with_commits', sum(1 for r in rows if r['commits'])),
         ('contributors_without_login', sum(1 for r in rows if r['commits'] and not r['has_login'])),
         ('commits_classified', sum(1 for c in commits if c['theme'] != 'Unclassified')),
         ('commits_unclassified', sum(1 for c in commits if c['theme'] == 'Unclassified')),
         ('maintainer_fix_pct', round(100 * people[MAINTAINER]['kinds']['fix'] / max(1, people[MAINTAINER]['commits']))),
         ('community_commits', sum(r['commits'] for r in non_m))]
have = {k for k, _ in extra}
summ['rows'] = [r for r in summ['rows'] if r['metric'] not in have] + [dict(metric=k, value=v) for k, v in extra]
summ['meta'].append({'label': 'contributors.py', 'value': code, 'type': 'code', 'lang': 'python'})
json.dump(summ, open(os.path.join(OUT, 'summary.json'), 'w'), ensure_ascii=False)
print('people', len(rows), 'picked', len(picked), 'without login', extra[1][1], 'unclassified commits', extra[3][1])
