# 导出下肢皮肤网格（左右分开，左腿独立贴图 UV）与 legR 查找表（解剖坐标=MH 米制×k）
import numpy as np, pickle, json
st=pickle.load(open('stage1.pkl','rb')); Wm,B,SI,SW,F,T=st['Wm'],st['B'],st['SI'],st['SW'],st['F'],st['T']
BH={b['name']:b['head'] for b in B}; NB=len(B)
def wsum(pre):
    m=np.array([any(B[j]['name'].startswith(p) for p in pre) for j in range(NB)]); return (SW*m[SI]).sum(1)
legw=wsum(['upperleg','lowerleg','foot','toe'])
body=[(vs,ts) for g,vs,ts in F if g=='body']
k=0.5/BH['lowerleg01.L'][1]
tri=lambda l:[(l[0],l[1],l[2])]+([(l[0],l[2],l[3])] if len(l)==4 else [])
# 全身三角形（用于射线）
TR=np.array([[Wm[a],Wm[b],Wm[c]] for vs,_ in body for a,b,c in tri(vs)])*k
legf=[f for f in body if np.mean(legw[f[0]])>=0.5]
# UV 裁剪框（两腿共享 UV）
uvs=np.array([T[t] for vs,ts in legf for t in ts]); u0,v0=uvs.min(0)-0.004; u1,v1=uvs.max(0)+0.004
out={'k':k,'uvbox':[float(u0),float(v0),float(u1),float(v1)]}
buf=bytearray(); off={}
def put(n,a,dt):
    b=np.ascontiguousarray(a,dtype=dt).tobytes()
    while len(buf)%4: buf.append(0)
    off[n]=[len(buf),len(b)]; buf.extend(b)
for side,name in ((1,'L'),(-1,'R')):
    fs=[f for f in legf if np.sign(Wm[f[0]].mean(0)[0])==side]
    key={};vid=[];uv=[];I=[]
    for vs,ts in fs:
        for t in tri(list(zip(vs,ts))):
            for v,tt in t:
                kk=(v,tt)
                if kk not in key: key[kk]=len(vid); vid.append(v); uv.append(T[tt])
                I.append(key[kk])
    P=Wm[vid]*k; I=np.array(I).reshape(-1,3); UV=np.array(uv)
    if side==1: UV=(UV-[u0,v0])/[u1-u0,v1-v0]   # 左腿使用独立裁剪贴图
    N=np.zeros_like(P); fn=np.cross(P[I[:,1]]-P[I[:,0]],P[I[:,2]]-P[I[:,0]])
    for j in range(3): np.add.at(N,I[:,j],fn)
    acc={}
    for i,v in enumerate(vid): acc.setdefault(v,[]).append(i)
    for l in acc.values():
        if len(l)>1: N[l]=N[l].sum(0)
    N/=np.linalg.norm(N,axis=1,keepdims=True)
    put(name+'pos',P,'<f4'); put(name+'nor',N,'<f4'); put(name+'uv',UV,'<f4'); put(name+'idx',I.ravel(),'<u2')
    out[name+'n']=len(P)
    if side==1: LP=P
# 中心线：按高度切片
ys=np.arange(0.0,1.001,0.01); cx=[];cz=[]
crotch=None
for y in ys:
    sl=LP[np.abs(LP[:,1]-y)<0.012]
    if y<0.13: sl=sl[sl[:,2]<(BH['foot.L'][2]*k+0.03)]
    if len(sl)<8: cx.append(np.nan); cz.append(np.nan); continue
    cx.append((sl[:,0].min()+sl[:,0].max())/2); cz.append((sl[:,2].min()+sl[:,2].max())/2)
cx=np.array(cx); cz=np.array(cz)
hip=BH['upperleg01.L']*k
# 大腿上段：向髋关节方向线性外推（避免会阴处切片失真）
y_top=0.80; i_top=int(round(y_top/0.01))
for i in range(len(ys)):
    if ys[i]>y_top or np.isnan(cx[i]):
        if ys[i]>y_top:
            t=(ys[i]-y_top)/(hip[1]-y_top); cx[i]=cx[i_top]+(hip[0]-cx[i_top])*t*0.6; cz[i]=cz[i_top]+(hip[2]-cz[i_top])*t*0.3
idx=np.arange(len(ys)); good=~np.isnan(cx); cx=np.interp(idx,idx[good],cx[good]); cz=np.interp(idx,idx[good],cz[good])
# 平滑
ker=np.array([1,2,3,2,1])/9.0
cxs=np.convolve(np.pad(cx,2,mode='edge'),ker,'valid'); czs=np.convolve(np.pad(cz,2,mode='edge'),ker,'valid')
# 射线求半径
NT=72; th=-np.pi+2*np.pi*np.arange(NT)/NT; R=np.zeros((len(ys),NT))
def ray(o,d,tris):
    e1=tris[:,1]-tris[:,0]; e2=tris[:,2]-tris[:,0]; p=np.cross(d,e2); det=(e1*p).sum(1)
    ok=np.abs(det)>1e-12; inv=np.where(ok,1/np.where(ok,det,1),0); s=o-tris[:,0]; u=(s*p).sum(1)*inv
    q=np.cross(s,e1); v=(q*d).sum(1)*inv; t=(e2*q).sum(1)*inv
    m=ok&(u>=0)&(v>=0)&(u+v<=1)&(t>1e-5)
    return t[m].min() if m.any() else np.nan
for i,y in enumerate(ys):
    yy=max(y,0.02)
    tris=TR[(TR[:,:,1].min(1)<=yy+0.001)&(TR[:,:,1].max(1)>=yy-0.001)]
    o=np.array([cxs[i],yy,czs[i]])
    for j,a in enumerate(th):
        d=np.array([np.sin(a),0,np.cos(a)])
        R[i,j]=ray(o,d,tris) if len(tris) else np.nan
# 腹股沟以上：内侧射线可能穿到对侧，按 y=0.76 行限幅
r0=int(round(0.76/0.01))
for i in range(r0+1,len(ys)): R[i]=np.minimum(np.nan_to_num(R[i],nan=9),R[r0]*(1.0+0.6*(ys[i]-0.76)))
# 填补缺失（足部以下等）
for j in range(NT):
    c=R[:,j]; g=~np.isnan(c)
    R[:,j]=np.interp(idx,idx[g],c[g]) if g.any() else 0.05
out.update(off=off,y0=0.0,dy=0.01,ny=len(ys),nt=NT,cx=[round(float(v),5) for v in cxs],cz=[round(float(v),5) for v in czs],R=[[round(float(v),5) for v in r] for r in R],
  land={n:[round(float(x),4) for x in BH[n]*k] for n in ['upperleg01.L','lowerleg01.L','lowerleg02.L','foot.L','toe1-1.L','toe5-1.L']})
json.dump(out,open('legs.json','w')); open('legs.bin','wb').write(buf)
print('k',k,'n',out['Ln'],out['Rn'],len(buf)/1e6,'MB'); print('cx',cxs[::10].round(3)); print('R front/med',R[::10,36].round(3),R[::10,18].round(3)); print(out['land'])
# 足背/大隐静脉起点等地标（左腿，解剖坐标）
def topv(zq, xr):
    m=(np.abs(LP[:,2]-zq)<0.012)&(LP[:,0]>xr[0])&(LP[:,0]<xr[1])&(LP[:,1]<0.1); c=LP[m]; return c[c[:,1].argmax()]
ft=BH['foot.L']*k; t1=BH['toe1-1.L']*k; t5=BH['toe5-1.L']*k
dors=[topv(z,( (t1[0]+ft[0])/2-0.015, (t5[0]+ft[0])/2+0.0)).round(4).tolist() for z in (0.05,0.09,0.13)]
m=(LP[:,1]>0.035)&(LP[:,1]<0.06)&(np.abs(LP[:,2]-0.07)<0.012); c=LP[m]; gsv0=c[c[:,0].argmin()].round(4).tolist()
out['dors']=dors; out['gsv0']=gsv0
json.dump(out,open('legs.json','w'))
print('dors',dors,'gsv0',gsv0)
