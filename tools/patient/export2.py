import numpy as np, pickle, json
from mh import D
st=pickle.load(open('stage1.pkl','rb')); Wm,B,SI,SW,F,T=st['Wm'],st['B'],st['SI'],st['SW'],st['F'],st['T']
MO=pickle.load(open('morphs.pkl','rb'))
bi={b['name']:i for i,b in enumerate(B)}; BH={b['name']:b['head'] for b in B}
NB=len(B)
def wsum(prefixes):
    m=np.array([any(B[j]['name'].startswith(p) for p in prefixes) for j in range(NB)])
    return (SW*m[SI]).sum(1)
legw=wsum(['upperleg','lowerleg','foot','toe'])
armlow=wsum(['lowerarm','wrist','finger','metacarpal'])
armw=wsum(['upperarm','lowerarm','wrist','finger','metacarpal','shoulder'])
footw=wsum(['foot','toe'])
quads=lambda g:[(vs,ts) for gg,vs,ts in F if gg==g]
def tri(l): return [(l[0],l[1],l[2])]+([(l[0],l[2],l[3])] if len(l)==4 else [])
parts=[]  # each: dict(name, P, UV, SI, SW, I, morphsrc(optional idx into Wm))
def from_faces(name,faces,offset=0.0,offfn=None):
    key={};vid=[];uv=[];I=[]
    for vs,ts in faces:
        for t in tri(list(zip(vs,ts))):
            for v,tt in t:
                k=(v,tt)
                if k not in key: key[k]=len(vid); vid.append(v); uv.append(T[tt])
                I.append(key[k])
    vid=np.array(vid); P=Wm[vid].copy(); I=np.array(I).reshape(-1,3)
    N=vnormals(P,I,vid)
    if offset or offfn is not None:
        o=offset if offfn is None else offfn(P)
        P=P+N*np.asarray(o).reshape(-1,1) if np.ndim(o) else P+N*o
    parts.append(dict(name=name,P=P,UV=np.array(uv),SI=SI[vid],SW=SW[vid],I=I,src=vid))
def vnormals(P,I,vid=None):
    N=np.zeros_like(P); fn=np.cross(P[I[:,1]]-P[I[:,0]],P[I[:,2]]-P[I[:,0]])
    for k in range(3): np.add.at(N,I[:,k],fn)
    if True:
        acc={}
        for i,p_ in enumerate(P): acc.setdefault(tuple(np.round(p_,4)),[]).append(i)
        for l in acc.values():
            if len(l)>1: N[l]=N[l].sum(0)
    return N/(np.linalg.norm(N,axis=1,keepdims=True)+1e-12)

def adjacency(I,n):
    nb=[set() for _ in range(n)]
    for a,b,c in I: nb[a]|={b,c}; nb[b]|={a,c}; nb[c]|={a,b}
    return nb
def boundary(I):
    from collections import Counter
    e=Counter()
    for a,b,c in I:
        for u,v in((a,b),(b,c),(c,a)): e[tuple(sorted((u,v)))]+=1
    bv=set()
    for (u,v),k in e.items():
        if k==1: bv|={u,v}
    return bv
def laplace(p,it,lam):
    nb=adjacency(p['I'],len(p['P'])); P=p['P']
    for _ in range(it):
        Q=P.copy()
        for i,s in enumerate(nb):
            if s: Q[i]=P[i]+lam*(P[list(s)].mean(0)-P[i])
        P=Q
    p['P']=P
def inflate(p,d):
    p['P']=p['P']+vnormals(p['P'],p['I'])*d
def smooth_boundary(p,kind):
    bv=sorted(boundary(p['I'])); P=p['P']
    nb=adjacency(p['I'],len(P)); bs=set(bv)
    sel=[i for i in bv if (P[i,1]>1.2 if kind=='neck' else (P[i,1]<0.3 if kind=='ankle' else P[i,1]<1.0))] if kind!='loop' else list(bv)
    for _ in range(40):
        Q=P.copy()
        for i in sel:
            l=[j for j in nb[i] if j in bs]
            if len(l)>=2: Q[i]=0.5*P[i]+0.5*P[l].mean(0)
        P=Q
    if kind=='ankle':
        for i in sel: P[i,1]=0.075
    if kind=='hem':
        for i in sel:
            if P[i,1]<0.3: P[i,1]=0.075
            else: P[i,1]=min(P[i,1],0.0)+0.80 if False else 0.80
    p['P']=P
fmean=lambda vs,a: np.mean(a[vs])
body=quads('body')
legf=[f for f in body if fmean(f[0],legw)>=0.5]
upf=[f for f in body if fmean(f[0],legw)<0.5]
from_faces('body',upf); from_faces('legs',legf)
# 眼球（低模代理，独立 UV）
ref=[int(l) for l in open(D+'eyes/low-poly/low-poly.mhclo').read().split('verts 0')[1].split()]
ev=[];evt=[];ef=[]
for l in open(D+'eyes/low-poly/low-poly.obj'):
    p=l.split()
    if not p: continue
    if p[0]=='vt': evt.append([float(p[1]),float(p[2])])
    elif p[0]=='f': ef.append([tuple(int(x)-1 for x in q.split('/')[:2]) for q in p[1:]])
key={};vid=[];uv=[];I=[]
for f in ef:
    for t in tri(f):
        for v,tt in t:
            k=(v,tt)
            if k not in key: key[k]=len(vid); vid.append(ref[v]); uv.append(evt[tt])
            I.append(key[k])
vid=np.array(vid); I=np.array(I).reshape(-1,3)
parts.append(dict(name='eyes',P=Wm[vid].copy(),UV=np.array(uv),SI=SI[vid],SW=SW[vid],I=I,src=vid))
from_faces('teeth',quads('helper-upper-teeth')+quads('helper-lower-teeth'))
from_faces('tongue',quads('helper-tongue'))
# 服装：基于紧身衣辅助网格
tights=quads('helper-tights')
waist=0.93
def neck_ok(vs):
    p=Wm[vs]; return np.all(p[:,1]<1.33-0.035*np.clip((p[:,2]-0.0)/0.1,0,1)*np.exp(-(p[:,0]/0.06)**2))
top=[f for f in tights if Wm[f[0],1].min()>waist-0.13 and fmean(f[0],armlow)<0.35 and neck_ok(f[0]) and (Wm[f[0],1].min()>0.86 or fmean(f[0],legw)<0.6)]
from_faces('top',top,offfn=lambda P:0.0085+0.004*np.clip((0.95-P[:,1])/0.1,0,1))
smooth_boundary(parts[-1],'neck'); smooth_boundary(parts[-1],'hem')
def legdist(p):
    best=9
    for sd in 'LR':
        a=BH['upperleg02.'+sd]; b=BH['foot.'+sd]; ab=b-a; t=np.clip(np.dot(p-a,ab)/np.dot(ab,ab),0,1); best=min(best,np.linalg.norm(p-(a+t*ab)))
    return best
def fin(vs):
    c=Wm[vs].mean(0)
    if c[1]>0.68: return False
    return legdist(c)>0.085-0.04*np.clip((0.6-c[1])/0.5,0,1)
trous=[f for f in body if Wm[f[0],1].max()<waist+0.01 and fmean(f[0],armw)<0.2 and fmean(f[0],footw)<0.4]
def loose(P): return 0.005+0.013*np.clip((0.75-P[:,1])/0.5,0,1)
def sit_stretch(faces):
    def rx(a): c,s_=np.cos(a),np.sin(a); return np.array([[1,0,0],[0,c,-s_],[0,s_,c]])
    R={'upperleg01.L':rx(-1.4),'upperleg01.R':rx(-1.4),'lowerleg01.L':rx(1.4),'lowerleg01.R':rx(1.4)}
    G={}; mats=np.zeros((NB,4,4))
    for i,bb in enumerate(B):
        L_=np.eye(4); L_[:3,:3]=R.get(bb['name'],np.eye(3)); T_=np.eye(4)
        if bb['parent']: T_[:3,3]=bb['head']-BH[bb['parent']]; g=G[bb['parent']]@T_@L_
        else: T_[:3,3]=bb['head']; g=T_@L_
        G[bb['name']]=g; inv=np.eye(4); inv[:3,3]=-bb['head']; mats[i]=g@inv
    Ph=np.c_[Wm,np.ones(len(Wm))]; Q=np.zeros_like(Wm)
    for k in range(4): Q+=SW[:,k:k+1]*np.einsum('nij,nj->ni',mats[SI[:,k]],Ph)[:,:3]
    out=[]
    for vs,ts in faces:
        a=np.array(vs); e0=np.linalg.norm(Wm[a]-Wm[np.roll(a,1)],axis=1).sum(); e1=np.linalg.norm(Q[a]-Q[np.roll(a,1)],axis=1).sum()
        out.append(e1/(e0+1e-9))
    return np.array(out)
st_=sit_stretch(trous); print('stretched',(st_>1.8).sum()); trous=[f for f,r in zip(trous,st_) if r<=1.8]
from_faces('trousers',trous,offfn=loose)
smooth_boundary(parts[-1],'ankle')
def brief_ok(vs):
    c=Wm[vs].mean(0); return fmean(vs,armw)<0.2 and 0.64<c[1]<0.905
from_faces('briefs',[f for f in body if brief_ok(f[0])],0.0025)
shoe=[f for f in body if fmean(f[0],footw)>0.6 and Wm[f[0],1].max()<0.11]
shoeP=[];shoeI=[];shoeUV=[];shoeSI=[];shoeSW=[]
for side,fb in ((1,'foot.L'),(-1,'foot.R')):
    fv=np.array(sorted({v for vs,_ in shoe for v in vs if np.sign(Wm[v,0])==side}))
    FP=Wm[fv]; z0,z1=FP[:,2].min()-0.008,FP[:,2].max()+0.014; NZ,NA=36,28; base=len(shoeP)
    for j in range(NZ+1):
        t=j/NZ; z=z0+(z1-z0)*t
        sl=FP[np.abs(FP[:,2]-z)<0.012]
        if len(sl)<3: sl=FP[np.argsort(np.abs(FP[:,2]-z))[:6]]
        xa,xb=sl[:,0].min()-0.008,sl[:,0].max()+0.008; h=min(sl[:,1].max()+0.008, 0.10)
        cap=np.sqrt(max(0.05,min(1,t/0.12,(1-t)/0.12)))
        xc=(xa+xb)/2; w=(xb-xa)/2*cap
        for i in range(NA+1):
            a=2*np.pi*i/NA; ca,sa=np.cos(a),np.sin(a)
            yy=max(0.0,h*cap*0.5*(1+np.sign(sa)*abs(sa)**0.8)) if sa>0 else 0.012*(1+sa)
            shoeP.append([xc+w*np.sign(ca)*abs(ca)**0.7,yy,z]); shoeUV.append([i/NA,t])
            si=[bi[fb],0,0,0]; shoeSI.append(si); shoeSW.append([1,0,0,0])
    for j in range(NZ):
        for i in range(NA):
            a=base+j*(NA+1)+i; b=a+NA+1
            shoeI+= [a,a+1,b,a+1,b+1,b]
parts.append(dict(name='shoes',P=np.array(shoeP),UV=np.array(shoeUV),SI=np.array(shoeSI),SW=np.array(shoeSW,float),I=np.array(shoeI).reshape(-1,3),src=None))
# 头发：参数化短发（齐耳短发），绑定头骨
hv=np.nonzero(wsum(['head','jaw','special','levator','oculi','oris','orbicularis','temporalis','risorius','eye'])>0.9)[0]
hv=[v for v in hv if v in set(i for vs,_ in body for i in vs)]
HP=Wm[hv]; c=np.array([0,HP[:,1].min()*0.3+HP[:,1].max()*0.7,HP[:,2].mean()-0.005])
d=HP-c; r=np.linalg.norm(d,axis=1); az=np.arctan2(d[:,0],d[:,2]); el=np.arcsin(d[:,1]/r)
NA,NE=72,40
def radius(a,e):
    w=np.exp(-((np.angle(np.exp(1j*(az-a))))**2/0.02+(el-e)**2/0.02)); w*=r**8
    return (w*r).sum()/w.sum()
ey=BH['eye.L'][1]
hair_P=[];hair_uv=[]
for j in range(NE+1):
    v=j/NE
    for i in range(NA+1):
        a=-np.pi+2*np.pi*i/NA
        front=np.exp(-(a/0.95)**2)  # 1=正前方
        el0=np.radians(8)  # 开始下垂的仰角
        e=np.radians(88)-(np.radians(88)-el0)*min(1,v/0.62)
        rr=radius(a,max(e,el0))+0.010+0.008*np.sin(max(e,0))**2+0.004*np.sin(a*3+0.5)*np.sin(max(e,0))
        p=c+rr*np.array([np.cos(e)*np.sin(a),np.sin(e),np.cos(e)*np.cos(a)])
        if v>0.62:
            t=(v-0.62)/0.38
            hem=1.43+0.03*front-0.01*np.cos(a)**2*(np.cos(a)<0)+0.006*np.sin(a*9)
            p=p.copy(); p[1]=p[1]+(hem-p[1])*t
            fl=1+0.08*t; p[0]=c[0]+(p[0]-c[0])*fl; p[2]=c[2]+(p[2]-c[2])*fl
        # 前额：额前发际线，向上收
        hl=ey+0.058+0.012*np.cos(a*1.5)+0.012*np.clip(a,0,0.6)-0.006*np.clip(-a,0,0.6)
        if front>0.25 and p[1]<hl:
            p[1]=hl-0.004*(1-front)
        hair_P.append(p); hair_uv.append([i/NA,1-v])
hair_P=np.array(hair_P); I=[]
for j in range(NE):
    for i in range(NA):
        a=j*(NA+1)+i; b=a+NA+1; I+= [a,b,a+1,a+1,b,b+1]
I=np.array(I).reshape(-1,3)
hs=np.zeros((len(hair_P),4),int); hs[:,0]=bi['head']; hw=np.zeros((len(hair_P),4)); hw[:,0]=1
parts.append(dict(name='hair',P=hair_P,UV=np.array(hair_uv),SI=hs,SW=hw,I=I,src=None))
# —— 打包 ——
P=[];N=[];UV=[];SIo=[];SWo=[];IDX=[];meta_parts=[];src=[];base=0;tri0=0
for p in parts:
    nn=vnormals(p['P'],p['I'],p['src'] if p['src'] is not None and p['name'] in('body','legs') else None)
    start=tri0*3; tri0+=len(p['I'])
    P.append(p['P']);N.append(nn);UV.append(p['UV']);SIo.append(p['SI']);SWo.append(p['SW']);IDX.append(p['I']+base)
    src.append(p['src'] if (p['src'] is not None and p['name'] in('body','legs','eyes','teeth','tongue')) else -np.ones(len(p['P']),int))
    meta_parts.append(dict(name=p['name'],start=start,count=len(p['I'])*3)); base+=len(p['P'])
P=np.concatenate(P);N=np.concatenate(N);UV=np.concatenate(UV);SIo=np.concatenate(SIo);SWo=np.concatenate(SWo);IDX=np.concatenate(IDX).ravel();src=np.concatenate(src)
n=len(P); buf=bytearray(); off={}
def put(name,arr,dt):
    a=np.ascontiguousarray(arr,dtype=dt).tobytes()
    while len(buf)%4: buf.append(0)
    off[name]=[len(buf),len(a)]; buf.extend(a)
put('pos',P,'<f4'); put('nor',N,'<f4'); put('uv',UV,'<f4'); put('si',SIo,'u1')
Q=np.floor(SWo*255).astype(int); Q[np.arange(n),SWo.argmax(1)]+=255-Q.sum(1); put('sw',Q,'u1')
put('idx',IDX,'<u4' if n>65535 else '<u2')
mnames=[]
for k,d in MO.items():
    dd=np.where(src[:,None]>=0,d[np.maximum(src,0)],0)
    ids=np.nonzero(np.linalg.norm(dd,axis=1)>1e-5)[0]
    put('m_'+k+'_i',ids,'<u4'); put('m_'+k+'_d',dd[ids],'<f4'); mnames.append(k)
bones=[dict(n=b['name'],p=(bi[b['parent']] if b['parent'] else -1),h=[round(float(x),5) for x in b['head']]) for b in B]
json.dump(dict(n=n,idx32=n>65535,off=off,parts=meta_parts,bones=bones,morphs=mnames),open('patient.json','w'))
open('patient.bin','wb').write(buf)
print(n,len(IDX)//3,len(buf)/1e6,'MB',[ (p['name'],p['count']//3) for p in meta_parts])
