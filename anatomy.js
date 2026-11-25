// 程序化下肢解剖模型（教学示意级，比例按成人下肢，单位：米；足底 y=0，左腿中心 x=+0.1）
// 层：skin 皮肤 / sup 浅静脉 / deep 深静脉 / art 动脉 / nerve 神经 / bone 骨骼 / fascia 隐筋膜
import * as THREE from './three.module.min.js';
import { fetchBin } from './human.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const g = (x, m, s) => Math.exp(-((x - m) ** 2) / (2 * s * s));
// 腿形数据来自 MakeHuman（CC0）真实人体网格：中心线 + 每个高度/方位的皮面半径（射线求交）
let L = null, LB = null;
export async function initLegData(base = './') {
  if (L) return L;
  const [j, b] = await Promise.all([fetch(base + 'legs.json').then(r => r.json()), fetchBin(base + 'legs.bin')]);
  L = j; LB = b; return L;
}
export const legK = () => L.k;
const yi = (y) => { const f = Math.min(L.ny - 1.001, Math.max(0, (y - L.y0) / L.dy)); const i = Math.floor(f); return [i, f - i]; };
export const cx = (y) => { const [i, t] = yi(y); return L.cx[i] * (1 - t) + L.cx[i + 1] * t; };
export const cz = (y) => { const [i, t] = yi(y); return L.cz[i] * (1 - t) + L.cz[i + 1] * t; };
// θ：0=前方，+=外侧，−=内侧，±π=后方
export function legR(y, th) {
  const [i, t] = yi(y); let a = ((th + Math.PI) / (2 * Math.PI)) * L.nt; a = ((a % L.nt) + L.nt) % L.nt;
  const j = Math.floor(a), u = a - j, j2 = (j + 1) % L.nt;
  const r0 = L.R[i][j] * (1 - u) + L.R[i][j2] * u, r1 = L.R[i + 1][j] * (1 - u) + L.R[i + 1][j2] * u;
  return r0 * (1 - t) + r1 * t;
}
export function dirOf(th, side) { return V(side * Math.sin(th), 0, Math.cos(th)); }
export function surf(y, th, side = 1, off = 0) { const r = legR(y, th) + off, d = dirOf(th, side); return V(side * cx(y) + d.x * r, y, cz(y) + d.z * r); }
export function inner(y, th, frac, side = 1) { const r = legR(y, th) * frac, d = dirOf(th, side); return V(side * cx(y) + d.x * r, y, cz(y) + d.z * r); }
export function normalAt(p, side = 1) { return V(p.x - side * cx(p.y), 0, p.z - cz(p.y)).normalize(); }
const lm = (n, side) => { const p = L.land[n]; return V(side * p[0], p[1], p[2]); };
const pt = (p, side) => V(side * p[0], p[1], p[2]);

// 皮肤：真实人体下肢网格（含足），左腿用独立贴图（烘焙曲张静脉、色素沉着）
function skinGeometry(side) {
  const k = side > 0 ? 'L' : 'R', A = (n, T) => { const [o, l] = L.off[k + n]; return new T(LB.slice(o, o + l)); };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(A('pos', Float32Array), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(A('nor', Float32Array), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(A('uv', Float32Array), 2));
  geo.setIndex(new THREE.BufferAttribute(A('idx', Uint16Array), 1));
  return geo;
}
const TEX = {};
function tex(url, srgb = true) { if (TEX[url]) return TEX[url]; const t = new THREE.TextureLoader().load(url); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return (TEX[url] = t); }

// 迂曲静脉：在两点之间沿皮面生成蛇形路径
let SEED = 1; const rnd = () => ((SEED = (SEED * 16807) % 2147483647) / 2147483647);
function tortuous(y0, t0, y1, t1, side, amp, waves, off, n = 60) {
  const p1 = rnd() * 6.28, p2 = rnd() * 6.28, p3 = rnd() * 6.28, k2 = 1.5 + rnd() * 0.6, pts = [];
  for (let k = 0; k <= n; k++) {
    const f = k / n, env = Math.sin(f * Math.PI) ** 0.6;
    const y = y0 + (y1 - y0) * f + 0.006 * Math.sin(f * waves * 3.1 * Math.PI + p3) * env;
    const th = t0 + (t1 - t0) * f + amp * env * (0.62 * Math.sin(f * waves * Math.PI * 2 + p1) + 0.38 * Math.sin(f * waves * k2 * Math.PI * 2 + p2));
    pts.push(surf(y, th, side, off));
  }
  return pts;
}
const curve = (pts) => new THREE.CatmullRomCurve3(pts, false, 'centripetal');
const tube = (c, r, mat, seg = 64, rs = 10) => new THREE.Mesh(new THREE.TubeGeometry(c, seg, r, rs), mat);

export const INFO = {
  skin: ['皮肤', '左下肢皮肤。内踝上方可见褐色色素沉着、脱屑（C4a）。'],
  gsv: ['大隐静脉（GSV）', '起于足背静脉弓内侧，经内踝前方沿小腿内侧上行，绕股骨内髁后方，沿大腿内侧至腹股沟下约 3–4 cm 汇入股总静脉（隐股交界）。本例 SFJ 反流 2.8 s，大腿段全程反流。'],
  sfj: ['隐股交界（SFJ）', '大隐静脉汇入股总静脉处，有终末瓣与亚终末瓣；附近有腹壁浅、旋髂浅、阴部外静脉汇入。热消融导管头端置于 SFJ 远端约 2 cm。'],
  aasv: ['前副隐静脉（AASV）', '大腿前外侧走行，平行于大隐静脉。本例未见反流。'],
  trib: ['曲张属支', '大腿中下段与小腿内侧的迂曲扩张静脉团，与主干相连，需同期点式剥脱或泡沫硬化。'],
  pav: ['后弓静脉', '小腿后内侧的大隐静脉属支，与 Cockett 穿通静脉相连。'],
  ssv: ['小隐静脉（SSV）', '起于外踝后方，沿小腿后正中上行，在腘窝汇入腘静脉（隐腘交界）。本例内径 3.2 mm，无反流。'],
  perf: ['穿通静脉', '连接浅、深静脉，正常血流由浅入深。示意：大腿 Dodd、膝下 Boyd、小腿内侧 Cockett 组。本例均 < 3.5 mm，无病理性反流。'],
  cfv: ['股总静脉（CFV）', '位于股总动脉内侧。本例可压闭、无血栓，Valsalva 反流 0.6 s（未达 1.0 s 病理阈值），呈呼吸期波形。'],
  fv: ['股静脉', '经内收肌管下行，穿收肌腱裂孔延续为腘静脉。本例通畅。'],
  pop: ['腘静脉', '位于腘窝，接受小隐静脉汇入。本例通畅、无反流。'],
  tib: ['胫后静脉 / 胫前静脉', '小腿深静脉，成对伴行同名动脉。本例可压闭、无血栓。'],
  gast: ['腓肠肌肌间静脉', '小腿肌肉内静脉丛，是 DVT 好发部位之一。'],
  cfa: ['股动脉', '股总动脉位于股总静脉外侧，下行为股浅动脉，经内收肌管延续为腘动脉。'],
  popa: ['腘动脉 / 胫后、足背动脉', '腘动脉分为胫前、胫后动脉；胫前动脉延续为足背动脉。查体须触诊足背、胫后动脉搏动。'],
  saph_n: ['隐神经', '股神经的感觉支，膝下与大隐静脉紧密伴行至内踝。小腿下段穿刺或热消融易损伤隐神经（麻木、感觉异常）。'],
  sural_n: ['腓肠神经', '与小隐静脉伴行，处理小隐静脉时需注意保护。'],
  fascia: ['隐筋膜（隐静脉鞘）', '大隐静脉主干走行于浅筋膜与深筋膜之间的隐筋膜鞘内，超声横切呈“埃及眼”征。肿胀液注入此鞘内。'],
  femur: ['股骨', '骨性标志：股骨内髁后方是大隐静脉绕行处。'],
  patella: ['髌骨', '膝前骨性标志。'],
  tibia: ['胫骨', '内踝为胫骨下端；大隐静脉经内踝前方上行。'],
  fibula: ['腓骨', '外踝为腓骨下端；小隐静脉起于外踝后方。']
};
const COL = { sup: 0x3a56b8, supN: 0x5b6fb0, deep: 0x1b2a78, art: 0xc6302b, nerve: 0xf0c419, bone: 0xeee6d2, perf: 0x7a4fc0, fascia: 0x9fd8e8 };

export function buildLeg({ side = 1, varicose = false, skinColor = 0xe7c3a5 } = {}) {
  const grp = new THREE.Group(), layers = { skin: [], sup: [], deep: [], art: [], nerve: [], bone: [], fascia: [], perf: [] }, pick = [];
  const mats = {};
  const M = (key, color, o = {}) => (mats[key] ||= new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...o }));
  const add = (mesh, layer, key) => { mesh.userData.layer = layer; mesh.userData.key = key; grp.add(mesh); layers[layer].push(mesh); if (key) pick.push(mesh); return mesh; };
  // 皮肤与足
  const skinMat = M('skin', 0xffffff, side > 0 && varicose ? { map: tex('skin_legL.jpg'), bumpMap: tex('skin_legL_bump.jpg', false), bumpScale: 1.2, roughness: 0.6 } : { map: tex('skin_base.jpg'), bumpMap: tex('skin_bump.jpg', false), bumpScale: 0.6, roughness: 0.62 });
  add(new THREE.Mesh(skinGeometry(side), skinMat), 'skin', 'skin');
  for (const m of layers.skin) m.renderOrder = 2;
  // 骨骼
  const bone = M('bone', COL.bone, { roughness: 0.7 });
  const bx = (y, th = 0, f = 0) => inner(y, th, f, side);
  const hip = lm('upperleg01.L', side), fh = V(hip.x - side * 0.03, hip.y + 0.02, hip.z - 0.02);
  const femurC = curve([V(hip.x - side * 0.005, hip.y - 0.005, hip.z - 0.015), bx(0.8, 0.4, 0.15), bx(0.66, 0.3, 0.1), bx(0.53, 0, 0.05)]);
  add(tube(femurC, 0.0135, bone, 24, 10), 'bone', 'femur');
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), bone); head.position.copy(fh); add(head, 'bone', 'femur');
  const neck = tube(curve([fh, V(hip.x - side * 0.012, hip.y + 0.005, hip.z - 0.017), V(hip.x, hip.y - 0.01, hip.z - 0.015)]), 0.011, bone, 8, 8); add(neck, 'bone', 'femur');
  for (const dx of [-1, 1]) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), bone); c.scale.set(1, 0.9, 1.25); const p = bx(0.51, 0, 0); c.position.set(p.x + side * dx * 0.019, 0.51, p.z - 0.006); add(c, 'bone', 'femur'); }
  const pat = new THREE.Mesh(new THREE.SphereGeometry(0.017, 16, 10), bone); pat.scale.set(1, 1.15, 0.45); pat.position.copy(inner(0.51, 0, 0.72, side)); add(pat, 'bone', 'patella');
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.035, 20), bone); plat.position.copy(bx(0.468, 0, 0.05)); add(plat, 'bone', 'tibia');
  add(tube(curve([bx(0.46, 0.2, 0.18), bx(0.3, 0.2, 0.35), bx(0.12, -0.5, 0.3)]), 0.011, bone, 20, 10), 'bone', 'tibia');
  const mm = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 10), bone); mm.scale.set(0.8, 1.3, 1); mm.position.copy(inner(0.095, -1.57, 0.55, side)); add(mm, 'bone', 'tibia');
  add(tube(curve([bx(0.455, 2.0, 0.55), bx(0.3, 1.9, 0.6), bx(0.1, 1.6, 0.72), inner(0.08, 1.57, 0.78, side)]), 0.005, bone, 20, 8), 'bone', 'fibula');
  // 深静脉与动脉
  const deepM = M('deep', COL.deep), artM = M('art', COL.art);
  const sfjDeep = inner(0.865, -0.38, 0.55, side);
  const cfvC = curve([inner(0.975, -0.32, 0.5, side), inner(0.92, -0.35, 0.53, side), sfjDeep]);
  add(tube(cfvC, 0.0068, M('cfv', COL.deep), 16, 10), 'deep', 'cfv');
  const fvPts = [sfjDeep, inner(0.78, -0.6, 0.5, side), inner(0.66, -1.1, 0.42, side), inner(0.58, -1.9, 0.42, side), inner(0.53, -2.6, 0.42, side)];
  add(tube(curve(fvPts), 0.0058, M('fv', COL.deep), 40, 10), 'deep', 'fv');
  add(tube(curve([inner(0.84, -0.25, 0.5, side), inner(0.74, -0.2, 0.32, side), inner(0.62, 0.2, 0.25, side)]), 0.0035, M('fv', COL.deep), 20, 8), 'deep', 'fv');
  const popPts = [inner(0.53, -2.6, 0.42, side), inner(0.5, 3.05, 0.42, side), inner(0.445, 3.0, 0.4, side)];
  add(tube(curve(popPts), 0.0052, M('pop', COL.deep), 20, 10), 'deep', 'pop');
  const tibM = M('tib', COL.deep);
  for (const d of [-0.13, 0.13]) add(tube(curve([inner(0.445, 3.0, 0.4, side), inner(0.38, -2.75 + d, 0.42, side), inner(0.25, -2.35 + d, 0.48, side), inner(0.14, -2.15 + d, 0.52, side), inner(0.1, -2.05 + d, 0.45, side)]), 0.0026, tibM, 40, 8), 'deep', 'tib');
  add(tube(curve([inner(0.44, 2.9, 0.4, side), inner(0.42, 1.4, 0.35, side), inner(0.3, 0.6, 0.55, side), inner(0.12, 0.25, 0.62, side)]), 0.0022, tibM, 30, 8), 'deep', 'tib');
  const gastM = M('gast', 0x2c3d8f);
  for (const [y, th] of [[0.36, 2.6], [0.33, -2.7], [0.3, 2.9]]) add(tube(curve([inner(y + 0.06, th, 0.5, side), inner(y, th + 0.15, 0.72, side), inner(y - 0.05, th, 0.6, side)]), 0.0028, gastM, 16, 8), 'deep', 'gast');
  const cfaM = M('cfa', COL.art), popaM = M('popa', COL.art);
  add(tube(curve([inner(0.975, -0.1, 0.48, side), inner(0.865, -0.17, 0.5, side), inner(0.78, -0.45, 0.48, side), inner(0.66, -0.98, 0.38, side), inner(0.58, -1.8, 0.36, side), inner(0.53, -2.55, 0.34, side)]), 0.0042, cfaM, 50, 10), 'art', 'cfa');
  add(tube(curve([inner(0.53, -2.55, 0.34, side), inner(0.5, 3.1, 0.32, side), inner(0.445, 3.05, 0.32, side), inner(0.38, -2.75, 0.4, side), inner(0.25, -2.35, 0.47, side), inner(0.14, -2.15, 0.5, side), inner(0.1, -2.15, 0.42, side)]), 0.0024, popaM, 50, 8), 'art', 'popa');
  const ata = [inner(0.44, 2.9, 0.33, side), inner(0.42, 1.4, 0.3, side), inner(0.3, 0.55, 0.52, side), inner(0.1, 0.15, 0.6, side), inner(0.07, 0.2, 0.5, side), pt(L.dors[1], side).add(V(0, -0.016, 0))];
  add(tube(curve(ata), 0.0022, popaM, 50, 8), 'art', 'popa');
  // 浅静脉
  SEED = 7; const supR = varicose ? 0.0046 : 0.0026, depth = varicose ? -0.009 : -0.009;
  const gsvPts = [sfjDeep, inner(0.862, -0.46, 0.84, side), surf(0.845, -0.52, side, depth)];
  for (const [y, th] of [[0.8, -0.62], [0.74, -0.78], [0.68, -0.95], [0.62, -1.15], [0.56, -1.45], [0.51, -1.78], [0.47, -1.85], [0.42, -1.75], [0.36, -1.6], [0.3, -1.5], [0.23, -1.4], [0.17, -1.3], [0.12, -1.1], [0.09, -0.8]]) gsvPts.push(surf(y, th, side, depth));
  gsvPts.push(pt(L.gsv0, side).add(V(side * 0.009, 0.006, -0.004)));
  const gsvCurve = curve(gsvPts);
  const sfjMesh = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 16, 12), M('sfj', 0x5a3db8)); sfjMesh.position.copy(gsvCurve.getPointAt(0.004)); add(sfjMesh, 'sup', 'sfj');
  const gsvMat = M('gsv', varicose ? COL.sup : COL.supN);
  const gsvSegs = []; const NSEG = 16;
  for (let s = 0; s < NSEG; s++) {
    const u0 = s / NSEG, u1 = (s + 1) / NSEG, pts = []; for (let k = 0; k <= 8; k++) pts.push(gsvCurve.getPointAt(u0 + (u1 - u0) * k / 8));
    const m = add(tube(curve(pts), supR, gsvMat.clone(), 16, 10), 'sup', 'gsv'); m.userData.u0 = u0; m.userData.u1 = u1; m.userData.fill = 1; gsvSegs.push(m);
  }
  const tribMat = M('trib', 0x4a62ad), tribs = [];
  const addTrib = (pts, r, key = 'trib', mat = tribMat) => { const m = add(tube(curve(pts), r, mat.clone(), Math.max(32, pts.length * 3), 8), 'sup', key); m.userData.trib = true; m.userData.fill = 1; tribs.push(m); return m; };
  // SFJ 附近属支与前副隐静脉
  addTrib([surf(0.85, -0.5, side, -0.004), surf(0.9, -0.42, side, -0.004), surf(0.96, -0.4, side, -0.004)], 0.0018, 'sfj', M('sfjt', COL.supN));
  addTrib([surf(0.852, -0.5, side, -0.004), surf(0.88, -0.25, side, -0.004), surf(0.94, 0.1, side, -0.004)], 0.0016, 'sfj', M('sfjt', COL.supN));
  addTrib([surf(0.85, -0.55, side, -0.004), surf(0.87, -0.85, side, -0.004), surf(0.9, -1.15, side, -0.004)], 0.0016, 'sfj', M('sfjt', COL.supN));
  addTrib([surf(0.84, -0.48, side, -0.004), surf(0.8, -0.25, side, -0.004), surf(0.72, -0.05, side, -0.004), surf(0.64, 0.02, side, -0.004)], 0.0022, 'aasv', M('aasv', COL.supN));
  if (varicose) {
    addTrib(tortuous(0.665, -0.98, 0.54, -1.25, side, 0.22, 3.5, -0.004), 0.0037);
    addTrib(tortuous(0.6, -1.25, 0.5, -1.05, side, 0.18, 2.5, -0.004), 0.0032);
    addTrib(tortuous(0.43, -1.76, 0.24, -1.05, side, 0.28, 4.5, -0.004, 90), 0.0042);
    addTrib(tortuous(0.38, -1.62, 0.22, -1.95, side, 0.22, 3.5, -0.004, 70), 0.0037);
    addTrib(tortuous(0.32, -1.5, 0.18, -1.2, side, 0.16, 3, -0.004), 0.0032);
    addTrib([surf(0.44, -1.8, side, -0.004), ...tortuous(0.4, -2.0, 0.12, -2.0, side, 0.12, 2.5, -0.0035, 40).slice(1)], 0.003, 'pav', M('pav', COL.sup));
  } else {
    for (let i = 0; i < 7; i++) { const y = 0.28 + i * 0.022, th = 1.1 + (i % 3) * 0.12; addTrib([surf(y, th, side, -0.0012), surf(y + 0.012, th + 0.1 * (i % 2 ? 1 : -1), side, -0.0012), surf(y + 0.022, th + 0.05, side, -0.0012)], 0.0008, 'trib', M('spider', 0xc0483f)); }
  }
  // 小隐静脉
  const ssvPts = [surf(0.07, 2.15, side, -0.004), surf(0.12, 2.5, side, -0.004), surf(0.2, 2.85, side, -0.004), surf(0.28, 3.08, side, -0.004), surf(0.36, 3.14, side, -0.004), surf(0.42, -3.12, side, -0.006), inner(0.455, 3.05, 0.6, side), inner(0.47, 3.02, 0.42, side)];
  add(tube(curve(ssvPts), 0.0026, M('ssv', COL.supN), 50, 8), 'sup', 'ssv');
  // 穿通静脉
  const perfM = M('perf', COL.perf);
  for (const [y, th, tt, f] of [[0.14, -2.05, -2.15, 0.58], [0.2, -2.05, -2.25, 0.52], [0.27, -2.0, -2.35, 0.47]]) add(tube(curve([surf(y, th, side, 0), inner(y - 0.005, (th + tt) / 2, 0.8, side), inner(y - 0.01, tt, f, side)]), 0.0017, perfM, 12, 6), 'perf', 'perf');
  add(tube(curve([surf(0.43, -1.78, side, -0.003), inner(0.43, -2.3, 0.7, side), inner(0.42, -2.7, 0.42, side)]), 0.0017, perfM, 12, 6), 'perf', 'perf');
  add(tube(curve([surf(0.63, -1.12, side, -0.003), inner(0.62, -1.15, 0.75, side), inner(0.615, -1.3, 0.43, side)]), 0.0017, perfM, 12, 6), 'perf', 'perf');
  // 神经
  const nM = M('saph_n', COL.nerve);
  const snPts = [inner(0.64, -1.25, 0.55, side), inner(0.56, -1.7, 0.8, side), surf(0.5, -1.95, side, -0.008)];
  for (const [y, th] of [[0.44, -1.9], [0.36, -1.72], [0.28, -1.6], [0.2, -1.5], [0.13, -1.38], [0.09, -1.0]]) snPts.push(surf(y, th, side, -0.0075));
  add(tube(curve(snPts), 0.0014, nM, 60, 6), 'nerve', 'saph_n');
  add(tube(curve([inner(0.4, 3.1, 0.75, side), surf(0.3, 3.0, side, -0.008), surf(0.18, 2.7, side, -0.008), surf(0.09, 2.2, side, -0.008)]), 0.0012, M('sural_n', COL.nerve), 40, 6), 'nerve', 'sural_n');
  // 隐筋膜鞘（大隐静脉主干大腿段）
  const fPts = []; for (let k = 0; k <= 20; k++) fPts.push(gsvCurve.getPointAt(0.05 + 0.42 * k / 20));
  const fascia = add(tube(curve(fPts), 0.0068, M('fascia', COL.fascia, { transparent: true, opacity: 0.22, depthWrite: false }), 40, 12), 'fascia', 'fascia'); fascia.renderOrder = 3;
  // 色素沉着、曲张静脉隆起与毛细血管扩张已烘焙进左腿皮肤贴图与网格
  const uAtY = (y) => { let best = 0, bd = 9; for (let i = 0; i <= 400; i++) { const u = i / 400, d = Math.abs(gsvCurve.getPointAt(u).y - y); if (d < bd && u > 0.02) { bd = d; best = u; } } return best; };
  return { group: grp, layers, pick, gsvCurve, gsvSegs, tribs, uAtY, sfjDeep, mats, length: gsvCurve.getLength() };
}

// 图层显隐与皮肤透明度
export function setLayer(leg, layer, on) { for (const m of leg.layers[layer]) m.visible = on; }
export function setSkin(leg, mode) {
  for (const m of leg.layers.skin) {
    m.visible = mode !== 'hide';
    if (m.userData.patch) continue;
    m.material.transparent = mode === 'xray'; m.material.opacity = mode === 'xray' ? 0.28 : 1; m.material.depthWrite = mode !== 'xray'; m.material.needsUpdate = true;
  }
}
