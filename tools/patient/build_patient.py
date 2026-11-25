import numpy as np, json, struct, sys
from mh import *
V0,T,F=load_obj()
import os
W=V0.copy() if os.environ.get("RAW") else macro(V0)
B=skeleton(W)
bi={b['name']:i for i,b in enumerate(B)}
# 缩放到米，身高 1.58，足底 y=0
body_idx=sorted({v for g,vs,_ in F if g=='body' for v in vs})
ymin=W[body_idx,1].min(); ymax=W[body_idx,1].max()
S=1.58/(ymax-ymin)
def tr(p): p=np.array(p,float); q=(p-[0,ymin,0])*S; return q
Wm=tr(W)
for b in B: b['head']=tr(b['head']); b['tail']=tr(b['tail'])
# 权重
wj=json.load(open(D+'rigs/default_weights.mhw'))['weights']
NV=len(W); vw=[[] for _ in range(NV)]
for bn,lst in wj.items():
    for v,w in lst: vw[v].append((w,bi[bn]))
SI=np.zeros((NV,4),int); SW=np.zeros((NV,4))
for v in range(NV):
    l=sorted(vw[v],reverse=True)[:4]
    if not l: l=[(1.0,bi['spine05'])]
    s=sum(w for w,_ in l)
    for k,(w,b) in enumerate(l): SI[v,k]=b; SW[v,k]=w/s
np.save('Wm.npy',Wm)
json.dump({'S':S,'ymin':ymin},open('xf.json','w'))
import pickle; pickle.dump(dict(Wm=Wm,B=B,SI=SI,SW=SW,F=F,T=T),open('stage1.pkl','wb'))
print('scale',S,'verts',NV,'height',Wm[body_idx,1].max())
# —— 重设静止姿势：双腿内收约 5°，双足放平（自然站姿），作为新的绑定姿势 ——
def rot(axis,deg):
    a=np.radians(deg); c,s=np.cos(a),np.sin(a); x,y,z=axis
    return np.array([[c+x*x*(1-c),x*y*(1-c)-z*s,x*z*(1-c)+y*s],[y*x*(1-c)+z*s,c+y*y*(1-c),y*z*(1-c)-x*s],[z*x*(1-c)-y*s,z*y*(1-c)+x*s,c+z*z*(1-c)]])
def lbs(Rd):
    G={}; mats=np.zeros((len(B),4,4))
    for i,b in enumerate(B):
        L=np.eye(4); L[:3,:3]=Rd.get(b['name'],np.eye(3)); T_=np.eye(4)
        if b['parent']: T_[:3,3]=b['head']-B[bi[b['parent']]]['head']; g=G[b['parent']]@T_@L
        else: T_[:3,3]=b['head']; g=T_@L
        G[b['name']]=g; inv=np.eye(4); inv[:3,3]=-b['head']; mats[i]=g@inv
    P=np.c_[Wm,np.ones(len(Wm))]; out=np.zeros_like(Wm)
    for k in range(4): out+=SW[:,k:k+1]*np.einsum('nij,nj->ni',mats[SI[:,k]],P)[:,:3]
    return out,mats
ang=5.5
Rd={'upperleg01.L':rot((0,0,1),-ang),'upperleg01.R':rot((0,0,1),ang),'foot.L':rot((0,0,1),ang),'foot.R':rot((0,0,1),-ang)}
Wn,mats=lbs(Rd)
for i,b in enumerate(B):
    b['head']=(mats[i]@np.r_[b['head'],1])[:3]; b['tail']=(mats[i]@np.r_[b['tail'],1])[:3]
Wm=Wn; dy=Wm[body_idx,1].min(); Wm[:,1]-=dy
for b in B: b['head'][1]-=dy; b['tail'][1]-=dy
# 腹股沟前方（耻骨区）权重：降低大腿骨影响，避免坐下时裤裆/皮肤上翻
legb=[i for i,b in enumerate(B) if b['name'].startswith(('upperleg01','upperleg02'))]
sp5=bi['spine05']
x,y,z=Wm[:,0],Wm[:,1],Wm[:,2]
fy=np.clip((y-0.64)/0.08,0,1)*np.clip((0.86-y)/0.05,0,1); fx=np.clip((0.11-np.abs(x))/0.05,0,1); fz=np.clip((z+0.0)/0.04,0,1)
f=fy*fx*fz*0.6
# 臀部：主要随骨盆，坐下时不随大腿上翻
fb=np.clip((y-0.64)/0.06,0,1)*np.clip((0.92-y)/0.04,0,1)*np.clip((-z-0.0)/0.05,0,1)*np.clip((0.2-np.abs(x))/0.05,0,1)
f=np.maximum(f,fb*0.8)
for v in np.nonzero(f>0.01)[0]:
    lw=0
    for k in range(4):
        if SI[v,k] in legb: d=SW[v,k]*f[v]; SW[v,k]-=d; lw+=d
    if lw>0:
        ks=[k for k in range(4) if SI[v,k]==sp5]
        if ks: SW[v,ks[0]]+=lw
        else: k=int(np.argmin(SW[v])); SW[v,k]+=lw if SW[v,k]==0 else 0; SI[v,k]=sp5 if SW[v,k]==lw else SI[v,k]
    SW[v]/=SW[v].sum()
pickle.dump(dict(Wm=Wm,B=B,SI=SI,SW=SW,F=F,T=T),open('stage1.pkl','wb'))
print('re-rest; ankle',[b['head'].round(3) for b in B if b['name']=='foot.L'])
