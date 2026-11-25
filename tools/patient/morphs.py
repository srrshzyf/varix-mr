import numpy as np, pickle
from mh import *
st=pickle.load(open('stage1.pkl','rb')); Wm,B,SI,SW=st['Wm'],st['B'],st['SI'],st['SW']
bi={b['name']:i for i,b in enumerate(B)}
J,fr=parse_bvh(D+'poseunits/face-poseunits.bvh')
names=json.load(open(D+'poseunits/face-poseunits.json'))['framemapping']
def rx(a): c,s=np.cos(a),np.sin(a); return np.array([[1,0,0],[0,c,-s],[0,s,c]])
def ry(a): c,s=np.cos(a),np.sin(a); return np.array([[c,0,s],[0,1,0],[-s,0,c]])
def rz(a): c,s=np.cos(a),np.sin(a); return np.array([[c,-s,0],[s,c,0],[0,0,1]])
C=np.array([[1,0,0],[0,0,1],[0,-1,0]])  # bvh->mh
def local_rots(frame):
    R={}; col=0
    for j in J:
        if j.get('end') or j['name'] is None: continue
        ch=j['ch']; vals=frame[col:col+len(ch)]; col+=len(ch)
        M=np.eye(3)
        for c,v in zip(ch,vals):
            a=np.radians(v)
            if c=='Xrotation': M=M@rx(a)
            elif c=='Yrotation': M=M@ry(a)
            elif c=='Zrotation': M=M@rz(a)
        R[j['name']]=C@M@C.T
    return R
def pose(R):
    G={}  # global 4x4
    mats=np.zeros((len(B),4,4))
    for i,b in enumerate(B):
        L=np.eye(4); L[:3,:3]=R.get(b['name'],np.eye(3))
        T_=np.eye(4)
        if b['parent']: T_[:3,3]=b['head']-B[bi[b['parent']]]['head']; g=G[b['parent']]@T_@L
        else: T_[:3,3]=b['head']; g=T_@L
        G[b['name']]=g
        inv=np.eye(4); inv[:3,3]=-b['head']; mats[i]=g@inv
    P=np.c_[Wm,np.ones(len(Wm))]
    out=np.zeros_like(Wm)
    for k in range(4):
        M=mats[SI[:,k]]  # n,4,4
        out+=SW[:,k:k+1]*np.einsum('nij,nj->ni',M,P)[:,:3]
    return out
rest=pose({})
print('rest err',np.abs(rest-Wm).max())
want={'blink':['LeftUpperLidClosed','RightUpperLidClosed'],'jaw':['JawDrop'],'smile':['MouthLeftPullUp','MouthRightPullUp'],'kiss':['LipsKiss'],'worry':['LeftInnerBrowUp','RightInnerBrowUp'],'wide':['UpperLipStretched'],'browDown':['LeftBrowDown','RightBrowDown']}
out={}
for k,lst in want.items():
    # 合并：把各 poseunit 的旋转叠加（局部旋转相乘）
    R={}
    for n in lst:
        r=local_rots(fr[names.index(n)])
        for bn,m in r.items(): R[bn]=R.get(bn,np.eye(3))@m
    d=pose(R)-Wm
    mag=np.linalg.norm(d,axis=1); print(k,'max mm',mag.max()*1000,'n',(mag>1e-5).sum())
    out[k]=d
pickle.dump(out,open('morphs.pkl','wb'))
