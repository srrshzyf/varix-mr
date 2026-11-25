import numpy as np
from PIL import Image, ImageFilter
rng=np.random.default_rng(3)
W,H=512,512
# 头发：沿 v 方向的发丝，黑发夹少量白发
x=np.arange(W)
img=np.zeros((H,W,3))
base=np.array([0.075,0.065,0.06])
strand=np.zeros(W)
for k in range(900):
    c=rng.random()*W; w=rng.random()*1.2+0.4; a=rng.random()
    strand+=a*np.exp(-((x-c)/w)**2)
strand/=strand.max()
grey=np.zeros(W)
for k in range(70): c=rng.random()*W; grey+=np.exp(-((x-c)/0.7)**2)
grey=np.clip(grey,0,1)
v=np.linspace(0,1,H)[:,None]
lum=0.75+0.5*strand[None,:]
img=base*lum[...,None]*np.ones((H,1,1))
img=img*(1-0.55*grey[None,:,None])+np.array([0.55,0.54,0.52])*0.55*grey[None,:,None]
img*= (0.85+0.15*v)[...,None]
Image.fromarray((np.clip(img,0,1)*255).astype(np.uint8)).save('hair.png')
# 布料纹理（编织感灰度，用作 bump/明暗）
n=rng.random((256,256)); weave=(np.sin(np.arange(256)[:,None]*1.6)*0.5+0.5)*0.5+(np.sin(np.arange(256)[None,:]*1.6)*0.5+0.5)*0.5
f=np.clip(0.6+0.25*(weave-0.5)+0.15*(n-0.5),0,1)
Image.fromarray((f*255).astype(np.uint8)).save('fabric.png')
