import numpy as np, json, re, os
D='/tmp/mhrepo/makehuman/data/'
def load_obj():
    V=[];T=[];F=[];grp=None
    for l in open(D+'3dobjs/base.obj'):
        if l.startswith('v '): V.append([float(x) for x in l.split()[1:4]])
        elif l.startswith('vt '): T.append([float(x) for x in l.split()[1:3]])
        elif l.startswith('g '): grp=l.split()[1]
        elif l.startswith('f '):
            vs=[p.split('/') for p in l.split()[1:]]
            F.append((grp,[int(a[0])-1 for a in vs],[int(a[1])-1 for a in vs]))
    return np.array(V),np.array(T),F
def target(name):
    idx=[];d=[]
    for l in open(D+'targets/'+name):
        if l[0]=='#' or not l.strip(): continue
        p=l.split(); idx.append(int(p[0])); d.append([float(x) for x in p[1:4]])
    return np.array(idx,int),np.array(d)
def macro(V, age_years=54, weight=0.62, muscle=0.5, height=0.35, prop=0.5, race={'asian':1.0}):
    a = 0.5+(age_years-25)/(90-25)*0.5 if age_years>=25 else 0.1875+(age_years-11)/14*0.3125
    ag={'young':1-(a-0.5)/0.5,'old':(a-0.5)/0.5}
    mw={'averagemuscle':1.0} if muscle==0.5 else ({'averagemuscle':1-(muscle-0.5)*2,'maxmuscle':(muscle-0.5)*2} if muscle>0.5 else {'averagemuscle':muscle*2,'minmuscle':1-muscle*2})
    ww={'averageweight':1-(weight-0.5)*2,'maxweight':(weight-0.5)*2} if weight>=0.5 else {'averageweight':weight*2,'minweight':1-weight*2}
    out=V.copy()
    def add(n,w):
        if w<=1e-6: return
        i,d=target(n)
        if len(i): out[i]+=w*d
    for A,wa in ag.items():
        for M,wm in mw.items():
            for W,wv in ww.items():
                add(f'macrodetails/universal-female-{A}-{M}-{W}.target',wa*wm*wv)
                if height!=0.5:
                    hk='maxheight' if height>0.5 else 'minheight'; add(f'macrodetails/height/female-{A}-{M}-{W}-{hk}.target',wa*wm*wv*abs(height-0.5)*2)
        for r,wr in race.items(): add(f'macrodetails/{r}-female-{A}.target',wa*wr)
    return out
def skeleton(W):
    s=json.load(open(D+'rigs/default.mhskel'))
    J={k:W[v].mean(0) for k,v in s['joints'].items()}
    bones=[]
    for n,b in s['bones'].items(): bones.append(dict(name=n,parent=b['parent'],head=J[b['head']],tail=J[b['tail']]))
    # 拓扑排序
    order=[];done=set()
    while len(order)<len(bones):
        for b in bones:
            if b['name'] in done: continue
            if b['parent'] is None or b['parent'] in done: order.append(b);done.add(b['name'])
    return order
def parse_bvh(fn):
    txt=open(fn).read(); head,mot=txt.split('MOTION')
    joints=[];stack=[];cur=None
    toks=head.split('\n')
    for l in toks:
        p=l.split()
        if not p: continue
        if p[0] in('ROOT','JOINT'): cur=dict(name=p[1],parent=stack[-1]['name'] if stack else None); joints.append(cur)
        elif p[0]=='End': cur=dict(name=None,parent=None,end=True)
        elif p[0]=='{': stack.append(cur)
        elif p[0]=='}': stack.pop()
        elif p[0]=='OFFSET': cur['offset']=[float(x) for x in p[1:4]]
        elif p[0]=='CHANNELS': cur['ch']=p[2:]
    ml=[l for l in mot.strip().split('\n')[2:] if l.strip()]
    frames=np.array([[float(x) for x in l.split()] for l in ml])
    return joints,frames
