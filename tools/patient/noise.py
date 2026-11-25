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
