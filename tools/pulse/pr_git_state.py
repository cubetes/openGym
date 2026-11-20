import subprocess, json, re, sys
from concurrent.futures import ThreadPoolExecutor
# Usage: pr_git_state.py <repo> <data-dir>  (compares each open PR head with upstream main and the newest release branch)
R=sys.argv[1]; D=sys.argv[2]
MAIN='refs/remotes/upstream/main'
_rels=subprocess.run(['git','-C',R,'for-each-ref','--sort=-committerdate','--format=%(refname)','refs/remotes/upstream/release-*'],capture_output=True,text=True).stdout.split()
REL=_rels[0] if _rels else MAIN
def g(*a):
    p=subprocess.run(['git','-C',R]+list(a),capture_output=True,text=True)
    return p.returncode,p.stdout,p.stderr
def cdate(ref):
    rc,o,_=g('log','-1','--format=%cI',ref); return o.strip() if rc==0 else None
def shortstat(a,b):
    rc,o,_=g('diff','--shortstat',a,b)
    f=re.search(r'(\d+) files? changed',o); ad=re.search(r'(\d+) insertion',o); de=re.search(r'(\d+) deletion',o)
    return (int(f.group(1)) if f else 0, int(ad.group(1)) if ad else 0, int(de.group(1)) if de else 0)
def against(target,head):
    r={}
    rc,mb,_=g('merge-base',target,head); mb=mb.strip()
    r['base']=mb or None
    r['base_date']=cdate(mb) if mb else None
    rc,o,_=g('rev-list','--count',f'{target}..{head}'); r['ahead']=int(o.strip()) if rc==0 else None
    rc,o,_=g('rev-list','--count',f'{head}..{target}'); r['behind']=int(o.strip()) if rc==0 else None
    if mb: r['files'],r['add'],r['del']=shortstat(mb,head)
    rc,o,e=g('merge-tree','--write-tree','--name-only',target,head)
    if rc==0: r['conflicts']=False; r['conflict_files']=0
    elif rc==1:
        lines=o.split('\n')[1:]; names=[]
        for l in lines:
            if l=='' : break
            names.append(l)
        r['conflicts']=True; r['conflict_files']=len(set(names)); r['conflict_names']=sorted(set(names))
    else: r['conflicts']=None; r['conflict_files']=None; r['merge_tree_error']=e.strip()[:200]
    rc,o,_=g('cherry',target,head)
    r['already_in']= (rc==0 and not any(l.startswith('+') for l in o.splitlines()))
    return r
def areas(mb,head):
    if not mb: return []
    rc,o,_=g('diff','--name-only',mb,head); s=set()
    for p in o.splitlines():
        parts=p.split('/')
        if parts[0]=='frontend' and len(parts)>2: s.add('frontend/'+parts[1])
        else: s.add(parts[0] if len(parts)>1 else p)
    return sorted(s)
failed=set(open(f'{D}/new/fetch_failed.txt').read().split())
prs=[int(x) for x in open(f'{D}/open_prs.txt').read().split() if x.isdigit()]
def one(n):
    head=f'refs/pr/{n}'
    rc,_,_=g('rev-parse','--verify','-q',head)
    if str(n) in failed or rc!=0:
        return {'n':n,'fetched':False}
    m=against(MAIN,head); rl=against(REL,head)
    return {'n':n,'fetched':True,'head_commit_date':cdate(head),
      'commits_ahead_main':m['ahead'],'commits_behind_main':m['behind'],
      'conflicts_main':m['conflicts'],'conflict_files_main':m['conflict_files'],
      'conflicts_release':rl['conflicts'],'conflict_files_release':rl['conflict_files'],
      'already_in_main':m['already_in'],'already_in_release':rl['already_in'],
      'files_changed':m.get('files'),'lines_added':m.get('add'),'lines_deleted':m.get('del'),
      'areas':areas(m['base'],head),'base_date_main':m['base_date'],
      'commits_ahead_release':rl['ahead'],'base_date_release':rl['base_date'],
      'files_changed_release':rl.get('files'),
      'conflict_names_main':m.get('conflict_names',[]),'conflict_names_release':rl.get('conflict_names',[]),
      **({'merge_tree_error':m.get('merge_tree_error') or rl.get('merge_tree_error')} if (m.get('merge_tree_error') or rl.get('merge_tree_error')) else {})}
with ThreadPoolExecutor(8) as ex: out=list(ex.map(one,prs))
json.dump(out,open(f'{D}/new/open_prs_git.json','w'),indent=1)
print(len(out))
