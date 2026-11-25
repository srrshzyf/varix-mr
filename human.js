// MakeHuman（CC0）基础网格生成的病人模型加载器：骨骼世界轴对齐，便于程序化驱动
import * as THREE from './three.module.min.js';
export async function loadHuman(base = './', mats = {}) {
  const [meta, bin] = await Promise.all([fetch(base + 'patient.json').then(r => r.json()), fetch(base + 'patient.bin').then(r => r.arrayBuffer())]);
  const A = (k, T) => { const [o, l] = meta.off[k]; return new T(bin.slice(o, o + l)); };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(A('pos', Float32Array), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(A('nor', Float32Array), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(A('uv', Float32Array), 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(A('si', Uint8Array), 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(A('sw', Uint8Array), 4, true));
  geo.setIndex(new THREE.BufferAttribute(A('idx', meta.idx32 ? Uint32Array : Uint16Array), 1));
  geo.morphAttributes.position = [];
  for (const k of meta.morphs) {
    const ids = A('m_' + k + '_i', Uint32Array), d = A('m_' + k + '_d', Float32Array), arr = new Float32Array(meta.n * 3);
    for (let i = 0; i < ids.length; i++) { arr[ids[i] * 3] = d[i * 3]; arr[ids[i] * 3 + 1] = d[i * 3 + 1]; arr[ids[i] * 3 + 2] = d[i * 3 + 2]; }
    const at = new THREE.BufferAttribute(arr, 3); at.name = k; geo.morphAttributes.position.push(at);
  }
  geo.morphTargetsRelative = true;
  for (const p of meta.parts) geo.addGroup(p.start, p.count, meta.parts.indexOf(p));
  const bones = meta.bones.map(b => { const o = new THREE.Bone(); o.name = b.n; return o; });
  meta.bones.forEach((b, i) => { const ph = b.p >= 0 ? meta.bones[b.p].h : [0, 0, 0]; bones[i].position.set(b.h[0] - ph[0], b.h[1] - ph[1], b.h[2] - ph[2]); if (b.p >= 0) bones[b.p].add(bones[i]); });
  const matList = meta.parts.map(p => mats[p.name] || new THREE.MeshStandardMaterial({ color: 0xcccccc }));
  const mesh = new THREE.SkinnedMesh(geo, matList);
  mesh.add(bones[0]); mesh.bind(new THREE.Skeleton(bones));
  mesh.morphTargetDictionary = Object.fromEntries(meta.morphs.map((k, i) => [k, i])); mesh.morphTargetInfluences = meta.morphs.map(() => 0);
  mesh.frustumCulled = false;
  const B = Object.fromEntries(bones.map(b => [b.name, b]));
  return { mesh, bones: B, meta, parts: Object.fromEntries(meta.parts.map((p, i) => [p.name, i])) };
}
