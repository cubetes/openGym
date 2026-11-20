import json,collections,datetime as dt,statistics as st,re,sys
D=sys.argv[1]; C=collections.Counter
P=lambda s: dt.datetime.fromisoformat(s.replace('Z','+00:00')) if s else None
items=[json.loads(l) for l in open(D+'/items.jsonl')]
iss=[i for i in items if not i['pr']]; prs=[i for i in items if i['pr']]
# commits
commits=[];cur=None
for line in open(D+'/commits_raw.txt',encoding='utf-8',errors='replace'):
    line=line.rstrip('\n')
    if line.startswith('@@'):
        h,an,ae,ad,cd,s=line[2:].split('\x1f',5)
        cur=dict(h=h,an=an,ae=ae,ad=dt.datetime.fromisoformat(ad),cd=dt.datetime.fromisoformat(cd),s=s,add=0,dele=0,files=0,dirs=C());commits.append(cur)
    elif line and cur is not None and '\t' in line:
        a,d_,f=line.split('\t',2)
        if a!='-': cur['add']+=int(a); cur['dele']+=int(d_)
        cur['files']+=1
        f=f.split(' => ')[-1].strip('{}')
        parts=f.split('/')
        top=parts[0]
        if top=='frontend':
            sub=parts[1] if len(parts)>1 else ''
            top={'android':'android','ios':'ios'}.get(sub,'frontend')
            if sub=='ios' and len(parts)>2 and 'Watch' in f: top='watch'
            if sub=='android' and ('wear' in f.lower()): top='watch'
            if sub=='src' and len(parts)>2 and parts[2]=='locales': top='locales'
        if top.startswith('watch') or top=='garmin': top='watch'
        cur['dirs'][top]=1
commits=[c for c in commits if 'cla-signatures' not in c['s'] and 'has signed the CLA' not in c['s']]
OWNER='Duarte Santos'
def isowner(c): return c['an'] in (OWNER,'DuarteSantos8','root')
d0=dt.date(2026,7,13) # Monday
import os
today=dt.date.fromisoformat(os.environ.get('SNAPSHOT',dt.date.today().isoformat()))
def wk(d): return (d-d0).days//7
NW=wk(today)+1
weeks=[(d0+dt.timedelta(7*i)).isoformat() for i in range(NW)]
def z(): return [0]*NW
S={k:z() for k in ['commits','commits_owner','commits_comm','added','iss_open','iss_closed','pr_open','pr_merged','pr_closed']}
for c in commits:
    w=wk(c['ad'].date()); 
    if 0<=w<NW:
        S['commits'][w]+=1; S['commits_owner' if isowner(c) else 'commits_comm'][w]+=1; S['added'][w]+=c['add']
for i in iss:
    S['iss_open'][wk(P(i['created']).date())]+=1
    if i['closed']: S['iss_closed'][wk(P(i['closed']).date())]+=1
for i in prs:
    S['pr_open'][wk(P(i['created']).date())]+=1
    if i['merged']: S['pr_merged'][wk(P(i['merged']).date())]+=1
    elif i['closed']: S['pr_closed'][wk(P(i['closed']).date())]+=1
# daily commit calendar
daily=C(c['ad'].date().isoformat() for c in commits)
first=min(c['ad'].date() for c in commits)
cal=[[ (first+dt.timedelta(k)).isoformat(), daily.get((first+dt.timedelta(k)).isoformat(),0)] for k in range((today-first).days+1)]
# heatmap owner local time weekday x hour
hm=[[0]*24 for _ in range(7)]
for c in commits:
    if isowner(c): hm[c['ad'].weekday()][c['ad'].hour]+=1
own=[c for c in commits if isowner(c)]
night=sum(1 for c in own if c['ad'].hour<6)/len(own)
wkend=sum(1 for c in own if c['ad'].weekday()>=5)/len(own)
# longest streak of days with commits
days=sorted(set(c['ad'].date() for c in commits)); best=run=1
for a,b in zip(days,days[1:]):
    run=run+1 if (b-a).days==1 else 1; best=max(best,run)
gapdays=(today-first).days+1-len(days)
# tags
tags=[l.rstrip('\n').split('\t') for l in open(D+'/tags.txt')]
tags=[(t,dt.datetime.fromisoformat(d)) for t,d in tags]
tags.sort(key=lambda x:x[1])
rel=[]
for k,(t,d) in enumerate(tags):
    prev=tags[k-1][1] if k else None
    n=sum(1 for c in commits if (prev is None or c['ad']>prev) and c['ad']<=d)
    after=sum(1 for i in iss if d<=P(i['created'])<d+dt.timedelta(days=3))
    after_bug=sum(1 for i in iss if d<=P(i['created'])<d+dt.timedelta(days=3) and 'bug' in i['labels'])
    rel.append(dict(tag=t,date=d.date().isoformat(),commits=n,gap=(d-prev).days if prev else None,iss3d=after,bug3d=after_bug))
# baseline issues per 3 days in window since Oct 1
span=(today-dt.date(2026,10,1)).days
base=sum(1 for i in iss if P(i['created']).date()>=dt.date(2026,10,1))/span*3
# backlog over time (daily)
bl=[]
start=dt.date(2026,7,19)
evs=[]
for k in range((today-start).days+1):
    d=dt.datetime.combine(start+dt.timedelta(k),dt.time(23,59),tzinfo=dt.timezone.utc)
    oi=sum(1 for i in iss if P(i['created'])<=d and (not i['closed'] or P(i['closed'])>d))
    op=sum(1 for i in prs if P(i['created'])<=d and (not i['closed'] or P(i['closed'])>d))
    bl.append([(start+dt.timedelta(k)).isoformat(),oi,op])
# cross refs: issue/PR numbers mentioned in commit messages + changelog
bodies=open(D+'/bodies.txt',encoding='utf-8',errors='replace').read().split('\x1e')
log=[]
for c in commits: pass
refs=collections.defaultdict(list)
for c in commits:
    for n in set(re.findall(r'#(\d{2,4})\b',c['s'])): refs[int(n)].append(c['ad'])
body_nums=set(int(n) for n in re.findall(r'#(\d{2,4})\b',open(D+'/bodies.txt',encoding='utf-8',errors='replace').read()))
cl=open(D+'/CHANGELOG.md',encoding='utf-8').read()
cl_nums=set(int(n) for n in re.findall(r'#(\d{2,4})\b',cl))
mentioned=body_nums|cl_nums
closed_unmerged=[i for i in prs if i['state']=='closed' and not i['merged']]
landed=[i for i in closed_unmerged if i['n'] in mentioned]
# check closed-unmerged that are NOT mentioned: are they owner-closed early? count by author
funnel=dict(opened=len(prs),merged=sum(1 for i in prs if i['merged']),landed_other=len(landed),closed_quiet=len(closed_unmerged)-len(landed),open=sum(1 for i in prs if i['state']=='open'))
# issue -> first referencing commit latency
lat=[]
for i in iss:
    if i['n'] in refs:
        cr=P(i['created']); after=[t for t in refs[i['n']] if t>=cr]
        if after: lat.append((min(after)-cr).total_seconds()/3600)
lat.sort()
iss_ref_share=sum(1 for i in iss if i['n'] in mentioned)/len(iss)
# PR merge time
mt=sorted((P(i['merged'])-P(i['created'])).total_seconds()/3600 for i in prs if i['merged'])
def q(a,p): return a[min(len(a)-1,int(len(a)*p))]
# issue close time by label
def ct(lbl):
    a=sorted((P(i['closed'])-P(i['created'])).total_seconds()/3600 for i in iss if i['closed'] and i['reason']=='completed' and (lbl is None or lbl in i['labels']))
    return dict(n=len(a),median=st.median(a) if a else None,p25=q(a,.25) if a else None,p75=q(a,.75) if a else None)
# people
people=collections.defaultdict(lambda: dict(first=None,prs=0,merged=0,issues=0))
for i in items:
    u=i['user']
    if u in ('DuarteSantos8',) or u.endswith('[bot]'): continue
    p=people[u]; t=P(i['created'])
    p['first']=t if p['first'] is None or t<p['first'] else p['first']
    if i['pr']: p['prs']+=1; p['merged']+= 1 if i['merged'] else 0
    else: p['issues']+=1
newppl=z()
for u,p in people.items(): newppl[wk(p['first'].date())]+=1
cum=[];s=0
for v in newppl: s+=v; cum.append(s)
active=z()
for w in range(NW):
    us=set(i['user'] for i in items if wk(P(i['created']).date())==w and i['user']!='DuarteSantos8' and not i['user'].endswith('[bot]'))
    active[w]=len(us)
top=sorted(people.items(),key=lambda kv:-(kv[1]['prs']*1+kv[1]['issues']*0.5))[:12]
top=[dict(user=u,prs=p['prs'],merged=p['merged'],issues=p['issues'],first=p['first'].date().isoformat()) for u,p in top]
# one-timers
onetime=sum(1 for p in people.values() if p['prs']+p['issues']==1)
# authors of commits
ac=C(c['an'] for c in commits)
owner_share=sum(v for k,v in ac.items() if k in (OWNER,'DuarteSantos8','root'))/len(commits)
# areas weekly (lines added) top dirs
areas=['frontend','api','watch','android','ios','locales','website','docs','mcp','catalogue']
A={a:z() for a in areas+['other']}
for c in commits:
    w=wk(c['ad'].date())
    if not 0<=w<NW: continue
    for d_,v in c['dirs'].items():
        A[d_ if d_ in areas else 'other'][w]+=v
# commit size
sizes=sorted(c['add']+c['dele'] for c in own)
# you
me_names=('Adrián Fernández',)
mine=[c for c in commits if c['an'] in me_names]
myprs=[i for i in prs if i['user']=='cubetes']; myiss=[i for i in iss if i['user']=='cubetes']
my_landed=[i for i in myprs if not i['merged'] and i['state']=='closed' and i['n'] in mentioned]
me=dict(commits=len(mine),added=sum(c['add'] for c in mine),prs=len(myprs),merged=sum(1 for i in myprs if i['merged']),landed=len(my_landed),open=sum(1 for i in myprs if i['state']=='open'),issues=len(myiss),issues_closed=sum(1 for i in myiss if i['state']=='closed'),credits=len(re.findall(r'@cubetes\b',cl)),
        rank_prs=1+sum(1 for u,p in people.items() if p['prs']>len(myprs)),first=min(i['created'] for i in myprs+myiss)[:10],
        pr_weekly=[sum(1 for i in myprs if wk(P(i['created']).date())==w) for w in range(NW)],
        commit_rank=1+sum(1 for k,v in ac.items() if v>len(mine) and k not in me_names),
        merge_med=st.median([(P(i['merged'])-P(i['created'])).total_seconds()/3600 for i in myprs if i['merged']]) if any(i['merged'] for i in myprs) else None)
# cla
cla=[]
for l in open(D+'/cla.txt'):
    d,s=l.rstrip('\n').split('\t',1); cla.append(d[:10])
cla_w=z()
for d in cla: cla_w[wk(dt.date.fromisoformat(d))]+=1
# number velocity: highest issue/pr number per week
numw=z()
for i in items:
    w=wk(P(i['created']).date()); numw[w]=max(numw[w],i['n'])
for w in range(1,NW): numw[w]=max(numw[w],numw[w-1])
# open PR ages
now=dt.datetime.combine(today,dt.time(12),tzinfo=dt.timezone.utc)
openpr_age=sorted((now-P(i['created'])).days for i in prs if i['state']=='open')
openiss=[i for i in iss if i['state']=='open']
openiss_lbl=C(l for i in openiss for l in i['labels'])
out=dict(weeks=weeks,S=S,cal=cal,hm=hm,night=night,wkend=wkend,streak=best,gapdays=gapdays,activedays=len(days),first=first.isoformat(),
 releases=rel,base3d=base,backlog=bl,funnel=funnel,lat=dict(n=len(lat),median=st.median(lat),p25=q(lat,.25),p75=q(lat,.75),under24=sum(1 for x in lat if x<24)/len(lat)),
 iss_ref_share=iss_ref_share,merge=dict(median=st.median(mt),p25=q(mt,.25),p75=q(mt,.75),under24=sum(1 for x in mt if x<24)/len(mt)),
 close=dict(all=ct(None),bug=ct('bug'),enh=ct('enhancement')),
 people=dict(total=len(people),onetime=onetime,neww=newppl,cum=cum,active=active,top=top),
 authors=ac.most_common(15),owner_share=owner_share,areas=A,size=dict(median=st.median(sizes),p90=q(sizes,.9)),
 totals=dict(commits=len(commits),issues=len(iss),prs=len(prs),open_issues=len(openiss),open_prs=funnel['open'],labels=C(l for i in items for l in i['labels']).most_common(8),
   added=sum(c['add'] for c in commits),deleted=sum(c['dele'] for c in commits),iss_completed=sum(1 for i in iss if i['reason']=='completed')),
 me=me,cla=dict(total=len(cla),weekly=cla_w),numw=numw,openpr_age=dict(median=st.median(openpr_age),over14=sum(1 for a in openpr_age if a>14),n=len(openpr_age)),
 openiss_lbl=openiss_lbl.most_common(5))
json.dump(out,open(D+'/data.json','w'),default=str)
for k in ['night','wkend','streak','gapdays','activedays','releases','base3d','funnel','lat','iss_ref_share','merge','close','owner_share','size','totals','me','openpr_age','openiss_lbl','cla']:
    print(k, json.dumps(out[k],default=str)[:600])
print('people',out['people']['total'],out['people']['onetime'],out['people']['top'][:6])
print('authors',out['authors'][:8])
print('weekly commits',S['commits']); print('iss_open',S['iss_open']); print('pr_open',S['pr_open']); print('pr_merged',S['pr_merged'])

# ---- export dashboard datasets: JSON {rows, meta} ----
import os
OUT=D+'/out'; os.makedirs(OUT,exist_ok=True)
code=open(__file__,encoding='utf-8').read()
INPUTS=('GitHub search API (repo:DuarteSantos8/openGym, is:issue and is:pull-request, fetched '+today.isoformat()+'); '
        'git history of all upstream branches (non-merge commits, CLA bot commits excluded); release tags; '
        'the cla-signatures branch; CHANGELOG.md on the newest release branch')
def save(name,rows,extra=None):
    meta=[{'label':'analyze.py','value':code,'type':'code','lang':'python'},{'label':'Inputs','value':INPUTS},{'label':'Snapshot','value':today.isoformat()}]
    json.dump({'rows':rows,'meta':meta+(extra or [])},open(f'{OUT}/{name}.json','w'),ensure_ascii=False)
yourw=me['pr_weekly']
save('weekly',[dict(week=weeks[w],commits=S['commits'][w],commits_maintainer=S['commits_owner'][w],commits_others=S['commits_comm'][w],
   issues_opened=S['iss_open'][w],issues_closed=S['iss_closed'][w],prs_opened=S['pr_open'][w],prs_merged=S['pr_merged'][w],
   prs_closed_unmerged=S['pr_closed'][w],new_people=newppl[w],active_people=active[w],cla_signed=cla_w[w],top_number=numw[w],your_prs=yourw[w]) for w in range(NW)])
blm={d:(a,b) for d,a,b in bl}
save('daily',[dict(date=d,commits=n,open_issues=blm.get(d,(None,None))[0],open_prs=blm.get(d,(None,None))[1]) for d,n in cal])
WD=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
save('hours',[dict(weekday=WD[i],day=i,hour=h,commits=hm[i][h]) for i in range(7) for h in range(24)],
     [{'label':'Time zone','value':"Each commit's own author time (the maintainer's local clock, CET/CEST)"}])
save('releases',[dict(tag=r['tag'],date=r['date'],commits=r['commits'],days_since_previous=r['gap'],issues_next_3d=r['iss3d'],bugs_next_3d=r['bug3d']) for r in rel])
allp=sorted(people.items(),key=lambda kv:-(kv[1]['prs']+kv[1]['issues']*0.5))[:15]
save('people',[dict(user=u,prs=p['prs'],merged=p['merged'],issues=p['issues'],first_seen=p['first'].date().isoformat(),is_you=(u=='cubetes')) for u,p in allp])
AL={'frontend':'App (web)','api':'Server','watch':'Watches','android':'Android','ios':'iOS','locales':'Translations','website':'Website','docs':'Docs','mcp':'MCP','catalogue':'Exercise catalogue','other':'Other'}
save('areas',[dict(week=weeks[w],area=AL[a],commits=A[a][w]) for a in A for w in range(NW)],
     [{'label':'Counting','value':'A commit counts once for every area it touches'}])
lastc=max(c['ad'] for c in commits)
decided=funnel['opened']-funnel['open']
M=[('commits_total',len(commits)),('issues_total',len(iss)),('prs_total',len(prs)),('people_total',len(people)),('people_onetime',onetime),
 ('open_issues',len(openiss)),('open_prs',funnel['open']),('prs_merged',funnel['merged']),('prs_landed_rewrite',funnel['landed_other']),('prs_closed_quiet',funnel['closed_quiet']),
 ('prs_decided',decided),('merged_pct',round(100*funnel['merged']/decided)),('landed_pct',round(100*(funnel['merged']+funnel['landed_other'])/decided)),
 ('maintainer_share_pct',round(100*owner_share)),('night_pct',round(100*night)),('weekend_pct',round(100*wkend)),('streak_days',best),('active_days',len(days)),
 ('pr_merge_median_h',round(st.median(mt))),('pr_merge_p25_h',round(q(mt,.25))),('pr_merge_p75_h',round(q(mt,.75))),
 ('issue_fix_median_h',round(st.median(lat))),('issue_fix_p25_h',round(q(lat,.25))),('issue_fix_p75_h',round(q(lat,.75))),('issue_fix_under24_pct',round(100*sum(1 for x in lat if x<24)/len(lat))),('issue_fix_n',len(lat)),
 ('bug_close_median_h',round(out['close']['bug']['median'])),('bug_close_p25_h',round(out['close']['bug']['p25'])),('bug_close_p75_h',round(out['close']['bug']['p75'])),
 ('enh_close_median_h',round(out['close']['enh']['median'])),('enh_close_p25_h',round(out['close']['enh']['p25'])),('enh_close_p75_h',round(out['close']['enh']['p75'])),
 ('issues_referenced_pct',round(100*iss_ref_share)),('openpr_over14d',out['openpr_age']['over14']),('openpr_median_age_d',out['openpr_age']['median']),
 ('baseline_issues_3d',round(base)),('releases_count',len(rel)),('cla_total',len(cla)),('last_commit',lastc.date().isoformat()),
 ('days_since_last_commit',(today-lastc.date()).days),('snapshot',today.isoformat()),('top_number',numw[-1]),
 ('you_prs',me['prs']),('you_merged',me['merged']),('you_landed',me['landed']),('you_open',me['open']),('you_issues',me['issues']),('you_commits',me['commits']),
 ('you_credits',me['credits']),('you_merge_median_h',round(me['merge_med'])),('you_commit_rank',me['commit_rank']),('you_pr_rank',me['rank_prs']),
 ('you_open_share_pct',round(100*me['open']/funnel['open'])),('you_first',me['first']),('you_commit_share_others_pct',round(100*me['commits']/sum(1 for c in commits if not isowner(c))))]
save('summary',[dict(metric=k,value=v) for k,v in M])
print('exported',os.listdir(OUT)); print(M)
