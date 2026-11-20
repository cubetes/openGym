"""Second-stage analysis for the openGym Pulse dashboard.

Reads what analyze.py, the collectors (open_prs_git.json, review_signals.json, cohorts.json)
and the title classification (classification.json) produced, and writes the extra dashboard
datasets: open_prs, reviewers, themes, labels, stability, retention, plus rows added
to summary.json.

Usage: python3 -I extend.py <data-dir>   (data-dir holds items.jsonl, tags.txt, new/, out/)
"""
import collections
import datetime as dt
import json
import os
import statistics as st
import sys

D = sys.argv[1]
NEW = os.path.join(D, 'new')
OUT = os.path.join(D, 'out')
today = dt.date.fromisoformat(os.environ.get('SNAPSHOT', dt.date.today().isoformat()))
ME = os.environ.get('PULSE_ME', 'cubetes')
MAINTAINER = 'DuarteSantos8'


def P(s):
    return dt.datetime.fromisoformat(s.replace('Z', '+00:00')) if s else None


def load(name, default=None):
    p = os.path.join(NEW, name)
    return json.load(open(p)) if os.path.exists(p) else default


items = [json.loads(line) for line in open(os.path.join(D, 'items.jsonl'))]
by_n = {i['n']: i for i in items}
git = {r['n']: r for r in load('open_prs_git.json', [])}
rev = load('review_signals.json', {}) or {}
sets = {k: set(v) for k, v in (rev.get('sets') or {}).items()}
open_meta = {r['n']: r for r in rev.get('open_prs', [])}
cls = {r['n']: r for r in load('classification.json', [])}
coh = load('cohorts.json', {}) or {}
now = dt.datetime.combine(today, dt.time(12), tzinfo=dt.timezone.utc)
code = open(__file__, encoding='utf-8').read()


def save(name, rows, note=None):
    meta = [{'label': 'extend.py', 'value': code, 'type': 'code', 'lang': 'python'},
            {'label': 'Snapshot', 'value': today.isoformat()}]
    if note:
        meta.append({'label': 'Inputs', 'value': note})
    json.dump({'rows': rows, 'meta': meta}, open(os.path.join(OUT, name + '.json'), 'w'), ensure_ascii=False)


def setof(*names):
    for n in names:
        if n in sets:
            return sets[n]
    return set()


m_pr = setof('is:pr commenter:DuarteSantos8', 'pr_commenter_maintainer', 'maintainer_pr')
m_issue = setof('is:issue commenter:DuarteSantos8', 'issue_commenter_maintainer', 'maintainer_issue')
bot_pr = setof('is:pr commenter:coderabbitai[bot]', 'pr_commenter_coderabbit', 'coderabbit_pr')
approved = setof('is:pr review:approved', 'pr_review_approved')
changes = setof('is:pr review:changes_requested', 'pr_review_changes_requested')

# ---- open pull requests, one row each, with a status a maintainer could act on
open_rows = []
for i in items:
    if not i['pr'] or i['state'] != 'open':
        continue
    g = git.get(i['n'], {})
    om = open_meta.get(i['n'], {})
    upd = P(om.get('updated_at')) or P(i['created'])
    status = ('Draft' if (i.get('draft') or om.get('draft'))
              else 'Already shipped' if g.get('already_in_release') or g.get('already_in_main')
              else 'Needs a rebase' if g.get('conflicts_release')
              else 'In discussion' if i['n'] in m_pr
              else 'Waiting for a first look')
    open_rows.append(dict(
        n=i['n'], title=i['title'], author=i['user'], is_you=i['user'] == ME,
        age_days=(now - P(i['created'])).days, idle_days=max(0, (now - upd).days),
        comments=om.get('comments', i['comments']), status=status,
        maintainer_commented=i['n'] in m_pr, bot_reviewed=i['n'] in bot_pr,
        conflicts_release=bool(g.get('conflicts_release')), commits_ahead=g.get('commits_ahead_main'),
        lines_changed=(g.get('lines_added') or 0) + (g.get('lines_deleted') or 0),
        theme=cls.get(i['n'], {}).get('theme', 'Unclassified')))
open_rows.sort(key=lambda r: -r['age_days'])
save('open_prs', open_rows, 'items.jsonl, open_prs_git.json (git merge-tree against the newest release branch), review_signals.json')

# ---- review load: who comments on other people's work
reviewers = sorted(rev.get('commenters', []), key=lambda r: -(r.get('pr_comments_on_others', 0) + r.get('issue_comments_on_others', 0)))
reviewers = [r for r in reviewers if r.get('pr_comments_on_others', 0) + r.get('issue_comments_on_others', 0) > 0][:15]
for r in reviewers:
    r['is_maintainer'] = r['user'] == MAINTAINER
    r['is_you'] = r['user'] == ME
save('reviewers', reviewers, 'GitHub search: is:pr commenter:X -author:X and is:issue commenter:X -author:X')

# ---- themes
THEMES = collections.OrderedDict()
for i in items:
    c = cls.get(i['n'])
    if not c:
        continue
    t = THEMES.setdefault(c['theme'], dict(theme=c['theme'], issues=0, prs=0, bugs=0, features=0, open_issues=0, close_days=[]))
    if i['pr']:
        t['prs'] += 1
    else:
        t['issues'] += 1
        t['bugs'] += c['kind'] == 'bug'
        t['features'] += c['kind'] in ('feature', 'improvement')
        t['open_issues'] += i['state'] == 'open'
        if i['closed'] and i.get('reason') == 'completed':
            t['close_days'].append((P(i['closed']) - P(i['created'])).total_seconds() / 86400)
theme_rows = []
for t in THEMES.values():
    cd = t.pop('close_days')
    t['median_close_days'] = round(st.median(cd), 1) if cd else None
    t['total'] = t['issues'] + t['prs']
    theme_rows.append(t)
theme_rows.sort(key=lambda r: -r['total'])
save('themes', theme_rows, 'classification.json: one theme and kind per title, assigned by Claude from the title and labels')

save('labels', [dict(n=n, type='pr' if by_n[n]['pr'] else 'issue', theme=c['theme'], kind=c['kind'], title=by_n[n]['title'])
                for n, c in sorted(cls.items()) if n in by_n],
     'Claude read each title and its labels and picked one theme and kind; this is a reading, not data from GitHub')

# ---- release stability: bug reports between one release and the next, per 100 commits shipped
tags = [line.rstrip('\n').split('\t') for line in open(os.path.join(D, 'tags.txt'))]
tags = sorted(((t, dt.datetime.fromisoformat(d)) for t, d in tags), key=lambda x: x[1])
releases = {r['tag']: r for r in json.load(open(os.path.join(OUT, 'releases.json')))['rows']}
stab = []
for k, (t, d) in enumerate(tags):
    nxt = tags[k + 1][1] if k + 1 < len(tags) else now
    days = (nxt - d).total_seconds() / 86400
    if days < 2 or d.date() < dt.date(2026, 9, 7):  # tags hours apart and the pre-GitHub period would skew the rate
        continue
    bugs = sum(1 for i in items if not i['pr'] and d <= P(i['created']) < nxt and cls.get(i['n'], {}).get('kind') == 'bug')
    commits = releases.get(t, {}).get('commits', 0)
    stab.append(dict(tag=t, date=d.date().isoformat(), days=round(days, 1), commits=commits, bug_reports=bugs,
                     bugs_per_day=round(bugs / days, 2), bugs_per_100_commits=round(100 * bugs / commits, 1) if commits else None,
                     current=k + 1 == len(tags)))
save('stability', stab, 'releases.json, classification.json (kind = bug); windows run from one tag to the next')

# ---- retention
save('retention', coh.get('retention', []), 'items.jsonl; a person is active in a week when they open an issue or pull request')

# ---- extra headline rows, appended to summary.json
summ = json.load(open(os.path.join(OUT, 'summary.json')))
have = {r['metric'] for r in summ['rows']}
prs = [i for i in items if i['pr']]
iss = [i for i in items if not i['pr']]
status_c = collections.Counter(r['status'] for r in open_rows)
j = coh.get('journeys', {}) or {}
conc = coh.get('concentration', {}) or {}


def num(x):
    return round(x, 1) if isinstance(x, float) else x


extra = [
    ('maintainer_pr_comment_pct', round(100 * len(m_pr & {i['n'] for i in prs}) / len(prs))),
    ('maintainer_issue_comment_pct', round(100 * len(m_issue & {i['n'] for i in iss}) / len(iss))),
    ('bot_pr_comment_pct', round(100 * len(bot_pr & {i['n'] for i in prs}) / len(prs))),
    ('formal_reviews', len(approved | changes)),
    ('open_waiting', status_c['Waiting for a first look']), ('open_rebase', status_c['Needs a rebase']),
    ('open_shipped', status_c['Already shipped']), ('open_discussion', status_c['In discussion']), ('open_draft', status_c['Draft']),
    ('open_median_idle_days', round(st.median([r['idle_days'] for r in open_rows])) if open_rows else 0),
    ('you_open_rebase', sum(1 for r in open_rows if r['is_you'] and r['status'] == 'Needs a rebase')),
    ('you_open_waiting', sum(1 for r in open_rows if r['is_you'] and r['status'] == 'Waiting for a first look')),
    ('classified', len(cls)),
]
for k, v in j.items():
    if isinstance(v, (int, float)):
        extra.append(('journey_' + k, num(v)))
for k, v in conc.items():
    if isinstance(v, (int, float)):
        extra.append(('concentration_' + k, num(v)))
    elif isinstance(v, dict):
        for kk, vv in v.items():
            if isinstance(vv, (int, float)):
                extra.append(('concentration_' + k + '_' + kk, num(vv)))
summ['rows'] = [r for r in summ['rows'] if r['metric'] not in {k for k, _ in extra}] + [dict(metric=k, value=v) for k, v in extra]
summ['meta'].append({'label': 'extend.py', 'value': code, 'type': 'code', 'lang': 'python'})
json.dump(summ, open(os.path.join(OUT, 'summary.json'), 'w'), ensure_ascii=False)
print('extended:', sorted(os.listdir(OUT)))
print(json.dumps(dict(extra), indent=0)[:1500])
