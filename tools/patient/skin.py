import numpy as np, pickle, json, os
from PIL import Image, ImageFilter
Z=np.load('uvmaps.npz'); P=Z['POS']; Nn=Z['NOR']; M=Z['MASK']; R=P.shape[0]
st=pickle.load(open('stage1.pkl','rb')); B={b['name']:b['head'] for b in st['B']}
rng=np.random.default_rng(7)
def vnoise(p,freq,seed=0):
    g=np.random.default_rng(seed).random((64,64,64)).astype(np.float32)
    q=p*freq; i=np.floor(q).astype(int); f=q-i; f=f*f*(3-2*f)
    out=0
    for dx in(0,1):
        for dy in(0,1):
            for dz in(0,1):
                w=(f[...,0] if dx else 1-f[...,0])*(f[...,1] if dy else 1-f[...,1])*(f[...,2] if dz else 1-f[...,2])
                out=out+w*g[(i[...,0]+dx)%64,(i[...,1]+dy)%64,(i[...,2]+dz)%64]
    return out
def fbm(p,f,o=4,seed=0):
    s=0;a=1;t=0
    for k in range(o): s+=a*vnoise(p,f*2**k,seed+k); t+=a; a*=0.5
    return s/t
pm=P[M]; nm=Nn[M]
x,y,z=pm[:,0],pm[:,1],pm[:,2]
def sg(v,e0,e1): t=np.clip((v-e0)/(e1-e0),0,1); return t*t*(3-2*t)
def blob(c,r,sc=(1,1,1)):
    d=(pm-np.array(c))/np.array(sc); return np.exp(-(d**2).sum(1)/(2*r*r))
base=np.array([214,174,148],np.float32)/255  # 中年东亚女性肤色
col=np.tile(base,(len(pm),1))
n1=fbm(pm,6,4,1); n2=fbm(pm,40,3,11); n3=fbm(pm,160,2,21)
col*= (0.94+0.1*n1)[:,None]
col*= (0.97+0.05*n2)[:,None]
col*= (0.985+0.03*n3)[:,None]
# 暴露部位略深、躯干略浅
tan=np.clip(sg(y,1.30,1.36)+sg(-(y-0.55),0,0.1)*0+0,0,1)
red=np.array([0.80,0.45,0.42])
def tint(c,w,amt):
    global col; col=col*(1-amt*w[:,None])+np.array(c)*amt*w[:,None]
ey=B['eye.L'][1]; ez=B['eye.L'][2]
# 面颊、鼻尖、下颌潮红
for sx in(1,-1): tint(red, blob((sx*0.045,ey-0.035,ez+0.0),0.016),0.12)
tint(red, blob((0,ey-0.03,ez+0.045),0.012),0.18)
# 唇
mc=np.array([0,1.4155,0.162]); d=pm-mc
lipw=np.exp(-((d[:,0]/0.021)**4+(d[:,1]/0.0085)**2))*sg(z,0.145,0.152)
tint([0.66,0.40,0.38],lipw,0.55)
# 眉毛：沿眼上方弧线
eb=np.zeros(len(pm))
for sx in(1,-1):
    u=(x*sx-0.008)/0.05  # 0..1 自内向外
    arc=ey+0.019+0.006*np.sin(np.clip(u,0,1)*np.pi*0.9)-0.004*u
    thick=0.0042*(1-0.5*np.clip(u,0,1))
    w=np.exp(-((y-arc)/thick)**4)*sg(u,-0.05,0.08)*(1-sg(u,0.92,1.08))*sg(z,ez-0.005,ez+0.005)*(x*sx>0)
    eb=np.maximum(eb,w)
hair=fbm(pm*[1,6,1],300,2,31)
eb*=0.55+0.6*hair
tint([0.22,0.17,0.15],np.clip(eb,0,1),0.85)
# 上眼睑睫毛线与眼周轻度暗沉
for sx in(1,-1):
    e=np.array(B['eye.L' if sx>0 else 'eye.R'])
    dd=pm-e; r=np.sqrt(dd[:,0]**2+dd[:,1]**2)
    tint([0.45,0.33,0.30],np.exp(-((dd[:,1]+0.012)/0.006)**2)*np.exp(-(dd[:,0]/0.016)**2)*(z>e[2]),0.25)
# 老年斑/色斑（面部、手背少量）
sp=(fbm(pm,140,2,41)>0.78)*(sg(y,1.38,1.42)+sg(-y,-0.85,-0.80)*0)
tint([0.58,0.43,0.33],sp.astype(float),0.14)
# 关节处偏红（膝、肘、指节）
for nm_ in ['shin.L','shin.R','lowerarm01.L','lowerarm01.R']:
    if nm_ in B: tint(red, blob(B[nm_],0.03),0.12)
col=np.clip(col,0,1)
img=np.zeros((R,R,3),np.float32); img[M]=col
# 边缘膨胀防接缝
im=Image.fromarray((img*255).astype(np.uint8)); mk=Image.fromarray((M*255).astype(np.uint8))
for k in range(6):
    blur=im.filter(ImageFilter.MaxFilter(3)); im=Image.composite(im,blur,mk); mk=mk.filter(ImageFilter.MaxFilter(3))
extra=os.environ.get('LEGFX')
im.save('skin_base.png')
# 凹凸：毛孔 + 额纹/鱼尾纹
h=np.zeros((R,R),np.float32)
hh=0.5+0.35*(fbm(pm,500,2,51)-0.5)+0.15*(n2-0.5)
fore=sg(y,1.50,1.52)*(1-sg(y,1.545,1.56))*sg(z,0.12,0.14)
hh-=0.25*fore*np.clip(np.sin(y*900)*0.5+0.5,0,1)**3
h[M]=hh
Image.fromarray((np.clip(h,0,1)*255).astype(np.uint8)).save('skin_bump.png')
print('ok')
