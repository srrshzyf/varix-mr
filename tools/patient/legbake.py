import numpy as np, json
from PIL import Image, ImageFilter
J=json.load(open('legs.json')); BIN=open('legs.bin','rb').read()
def get(n,dt,c): o,l=J['off'][n]; return np.frombuffer(BIN[o:o+l],dtype=dt).reshape(-1,c).copy()
LP,LN,LU,LI=get('Lpos','<f4',3),get('Lnor','<f4',3),get('Luv','<f4',2),get('Lidx','<u2',3).astype(int)
RP,RN,RU,RI=get('Rpos','<f4',3),get('Rnor','<f4',3),get('Ruv','<f4',2),get('Ridx','<u2',3).astype(int)
VE=json.load(open('veins.json'))
# —— 细分左腿一次（中点） ——
def subdiv(P,U,I):
    P=list(P);U=list(U);mid={};out=[]
    def m(a,b):
        k=(min(a,b),max(a,b))
        if k not in mid: mid[k]=len(P); P.append((P[a]+P[b])/2); U.append((U[a]+U[b])/2)
        return mid[k]
    for a,b,c in I:
        ab,bc,ca=m(a,b),m(b,c),m(c,a); out+= [(a,ab,ca),(ab,b,bc),(ca,bc,c),(ab,bc,ca)]
    return np.array(P),np.array(U),np.array(out)
LP,LU,LI=subdiv(LP,LU,LI)
LP,LU,LI=subdiv(LP,LU,LI)
def normals(P,I):
    N=np.zeros_like(P); fn=np.cross(P[I[:,1]]-P[I[:,0]],P[I[:,2]]-P[I[:,0]])
    for k in range(3): np.add.at(N,I[:,k],fn)
    acc={}
    for i,p in enumerate(np.round(P,5)): acc.setdefault(tuple(p),[]).append(i)
    for l in acc.values():
        if len(l)>1: N[l]=N[l].sum(0)
    return N/(np.linalg.norm(N,axis=1,keepdims=True)+1e-12)
# —— 曲张静脉距离场 ——
segs=[];rad=[]
for t in VE['trib']:
    p=np.array(t['pts']); segs.append(np.c_[p[:-1],p[1:]]); rad+= [t['r']]*(len(p)-1)
S=np.concatenate(segs); RAD=np.array(rad)
def vein_field(X):
    best=np.full(len(X),9.0); br=np.zeros(len(X)); bt=np.zeros(len(X))
    A=S[:,:3];Bv=S[:,3:]
    for i0 in range(0,len(X),4000):
        x=X[i0:i0+4000][:,None,:]; ab=Bv-A; t=np.clip(((x-A)*ab).sum(-1)/((ab*ab).sum(-1)+1e-12),0,1)
        d=np.linalg.norm(x-(A+t[...,None]*ab),axis=-1); j=d.argmin(1)
        best[i0:i0+4000]=d[np.arange(len(j)),j]; br[i0:i0+4000]=RAD[j]
    return best,br
exec(open('noise.py').read())
def bulge(d,r,X=None):
    depth=0.004; dd=np.sqrt(np.maximum(d*d-depth*depth,0)); nod=0.65+0.7*fbm(X,45,2,77) if X is not None else 1
    w=r*2.0*nod
    return np.where(dd<w,(r*1.05*nod)*np.sqrt(np.clip(1-(dd/w)**2,0,1))**1.3,0)
N0=normals(LP,LI)
d,r=vein_field(LP); h=bulge(d,r,LP)
LP=LP+N0*h[:,None]
LN=normals(LP,LI)
# —— 烘焙左腿贴图（裁剪 UV） ——
W,H=1024,2048
box=J['uvbox']
base=Image.open('skin_base.png').convert('RGB'); bw,bh=base.size
basearr=np.asarray(base).astype(np.float32)/255
POS=np.zeros((H,W,3),np.float32); MASK=np.zeros((H,W),bool); FULLUV=np.zeros((H,W,2),np.float32)
uvp=LU*[W,H]; uvp[:,1]=H-uvp[:,1]
P0=LP-N0*h[:,None]
for a,b,c in LI:
    p=uvp[[a,b,c]]; x0,y0=np.floor(p.min(0)).astype(int)-1; x1,y1=np.ceil(p.max(0)).astype(int)+1
    x0=max(x0,0);y0=max(y0,0);x1=min(x1,W-1);y1=min(y1,H-1)
    xs,ys=np.meshgrid(np.arange(x0,x1+1)+0.5,np.arange(y0,y1+1)+0.5)
    A_,B_,C_=p; v0=B_-A_; v1=C_-A_; dt=v0[0]*v1[1]-v1[0]*v0[1]
    if abs(dt)<1e-12: continue
    wx=xs-A_[0]; wy=ys-A_[1]; l1=(wx*v1[1]-v1[0]*wy)/dt; l2=(v0[0]*wy-wx*v0[1])/dt; l0=1-l1-l2
    m=(l0>=-0.02)&(l1>=-0.02)&(l2>=-0.02)
    if not m.any(): continue
    sl=(slice(y0,y1+1),slice(x0,x1+1))
    PP=l0[...,None]*P0[a]+l1[...,None]*P0[b]+l2[...,None]*P0[c]
    POS[sl][m]=PP[m]; MASK[sl]|=m
pm=POS[MASK]
# 底色：从全身贴图按 UV 取样
ys_,xs_=np.nonzero(MASK)
u=box[0]+(xs_+0.5)/W*(box[2]-box[0]); v=box[1]+(1-(ys_+0.5)/H)*(box[3]-box[1])
col=basearr[np.clip(((1-v)*bh).astype(int),0,bh-1),np.clip((u*bw).astype(int),0,bw-1)]
exec(open('noise.py').read())
y=pm[:,1]
cxv=np.interp(y,np.arange(J['ny'])*J['dy'],J['cx']); czv=np.interp(y,np.arange(J['ny'])*J['dy'],J['cz'])
th=np.arctan2(pm[:,0]-cxv,pm[:,2]-czv)   # 左腿：+ 为外侧
def tint(c,w,a):
    global col; col=col*(1-a*w[:,None])+np.array(c)*a*w[:,None]
d,r=vein_field(pm); hb=bulge(d,r,pm); depth=0.004; dd=np.sqrt(np.maximum(d*d-depth*depth,0))
vein=np.exp(-(dd/(r*1.5))**2)*(0.7+0.6*fbm(pm,45,2,77))
tint([0.36,0.46,0.58],np.clip(vein,0,1),0.28)
tint([0.33,0.40,0.58],np.exp(-(dd/(r*0.6))**2),0.14)
# 色素沉着（内踝上方，C4a）：斑驳褐色
n1=fbm(pm,60,3,5); n2=fbm(pm,200,2,9)
pig=np.exp(-((y-0.15)/0.05)**4)*np.exp(-((th+1.45)/0.75)**4)
pig*=np.clip(0.85+1.1*(n1-0.5)+0.4*(n2-0.5),0,1)
tint([0.40,0.25,0.16],np.clip(pig,0,1),0.72)
tint([0.35,0.22,0.22],np.clip(pig*(n2>0.55),0,1),0.25)
# 足踝部静脉扩张冠（corona phlebectatica）：内踝下方细小蓝紫静脉
cor=np.exp(-((y-0.065)/0.02)**2)*np.exp(-((th+1.6)/0.6)**2)
lines=np.abs(np.sin(pm[:,2]*900+fbm(pm,80,2,13)*12))<0.12
tint([0.38,0.30,0.55],cor*lines,0.6)
# 轻度干燥脱屑
scale=(fbm(pm,400,2,17)>0.72)*pig
tint([0.80,0.72,0.64],scale.astype(float),0.35)
img=np.zeros((H,W,3),np.float32); img[MASK]=np.clip(col,0,1)
im=Image.fromarray((img*255).astype(np.uint8)); mk=Image.fromarray((MASK*255).astype(np.uint8))
for k in range(8):
    bl=im.filter(ImageFilter.MaxFilter(3)); im=Image.composite(im,bl,mk); mk=mk.filter(ImageFilter.MaxFilter(3))
im.save('skin_legL.png', optimize=True)
hh=np.zeros((H,W),np.float32); hh[MASK]=0.5+0.15*(fbm(pm,500,2,51)-0.5)+0.35*np.clip(hb/0.004,0,1)-0.08*scale
bim=Image.fromarray((np.clip(hh,0,1)*255).astype(np.uint8)); mk=Image.fromarray((MASK*255).astype(np.uint8))
for k in range(8):
    bl=bim.filter(ImageFilter.MaxFilter(3)); bim=Image.composite(bim,bl,mk); mk=mk.filter(ImageFilter.MaxFilter(3))
bim.save('skin_legL_bump.png')
# —— 写回 legs.bin ——
buf=bytearray(); off={}
def put(n,a,dt):
    b=np.ascontiguousarray(a,dtype=dt).tobytes()
    while len(buf)%4: buf.append(0)
    off[n]=[len(buf),len(b)]; buf.extend(b)
put('Lpos',LP,'<f4');put('Lnor',LN,'<f4');put('Luv',LU,'<f4');put('Lidx',LI.ravel(),'<u4' if len(LP)>65535 else '<u2')
put('Rpos',RP,'<f4');put('Rnor',RN,'<f4');put('Ruv',RU,'<f4');put('Ridx',RI.ravel(),'<u2')
J['off']=off; J['L32']=len(LP)>65535; J['Ln']=len(LP)
json.dump(J,open('legs_out.json','w')); open('legs_out.bin','wb').write(buf)
print('L verts',len(LP),'tris',len(LI),'bin MB',len(buf)/1e6,'max bulge mm',h.max()*1000)
