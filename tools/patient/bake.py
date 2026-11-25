# 将身体网格的 3D 位置/法线栅格化到 UV 空间，供程序化皮肤贴图烘焙
import numpy as np, pickle
st=pickle.load(open('stage1.pkl','rb')); Wm,F,T=st['Wm'],st['F'],st['T']
R=2048
# 顶点法线
from collections import defaultdict
tris=[];
for g,vs,ts in F:
    if g!='body': continue
    for a,b,c in ([(0,1,2),(0,2,3)] if len(vs)==4 else [(0,1,2)]): tris.append((vs[a],vs[b],vs[c],ts[a],ts[b],ts[c]))
tris=np.array(tris)
N=np.zeros_like(Wm); fn=np.cross(Wm[tris[:,1]]-Wm[tris[:,0]],Wm[tris[:,2]]-Wm[tris[:,0]])
for k in range(3): np.add.at(N,tris[:,k],fn)
N/=np.linalg.norm(N,axis=1,keepdims=True)+1e-12
POS=np.zeros((R,R,3),np.float32); NOR=np.zeros((R,R,3),np.float32); MASK=np.zeros((R,R),bool)
uv=T*[R,R]; uv[:,1]=R-uv[:,1]
for t in tris:
    p=uv[t[3:]]; x0,y0=np.floor(p.min(0)).astype(int)-1; x1,y1=np.ceil(p.max(0)).astype(int)+1
    x0=max(x0,0);y0=max(y0,0);x1=min(x1,R-1);y1=min(y1,R-1)
    xs,ys=np.meshgrid(np.arange(x0,x1+1)+0.5,np.arange(y0,y1+1)+0.5)
    a,b,c=p; v0=b-a; v1=c-a; d=v0[0]*v1[1]-v1[0]*v0[1]
    if abs(d)<1e-12: continue
    wx=xs-a[0]; wy=ys-a[1]; l1=(wx*v1[1]-v1[0]*wy)/d; l2=(v0[0]*wy-wx*v0[1])/d; l0=1-l1-l2
    m=(l0>=-0.02)&(l1>=-0.02)&(l2>=-0.02)
    if not m.any(): continue
    P=l0[...,None]*Wm[t[0]]+l1[...,None]*Wm[t[1]]+l2[...,None]*Wm[t[2]]
    Nn=l0[...,None]*N[t[0]]+l1[...,None]*N[t[1]]+l2[...,None]*N[t[2]]
    sl=(slice(y0,y1+1),slice(x0,x1+1))
    POS[sl][m]=P[m]; NOR[sl][m]=Nn[m]; MASK[sl]|=m
np.savez_compressed('uvmaps.npz',POS=POS,NOR=NOR,MASK=MASK)
print(MASK.mean())
