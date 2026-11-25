// 程序化手术器械（真实尺寸，单位：米）。线性器械的尖端在局部原点，指向 +x；超声探头的声窗在原点，朝 −y。
import * as THREE from './three.module.min.js';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0, ...o });
const steel = std(0xc9ced4, { metalness: 0.55, roughness: 0.28 });
const cylX = (r1, r2, len, mat, seg = 16) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, seg), mat); m.rotation.z = -Math.PI / 2; return m; }; // r1 在 −x 端
const at = (m, x, y = 0, z = 0) => { m.position.set(x, y, z); return m; };
const tube = (pts, r, mat, seg = 64) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 8), mat);

function probe() {
  const g = new THREE.Group(), shell = std(0xe9ecef, { roughness: 0.35 }), dark = std(0x2b2f33, { roughness: 0.6 });
  const shape = new THREE.Shape(); const w = 0.026, h = 0.007; shape.moveTo(-w, -h); shape.lineTo(w, -h); shape.quadraticCurveTo(w + 0.004, 0, w, h); shape.lineTo(-w, h); shape.quadraticCurveTo(-w - 0.004, 0, -w, -h);
  const head = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 }), shell); head.rotation.x = -Math.PI / 2; head.position.y = 0.003; g.add(head);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.003, 0.011), dark); lens.position.y = 0.0015; g.add(lens);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.02, 0.05, 20), shell); neck.scale.z = 0.55; neck.position.y = 0.058; g.add(neck);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.011, 0.07, 20), shell); grip.scale.z = 0.62; grip.position.y = 0.118; g.add(grip);
  const relief = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.008, 0.025, 12), dark); relief.position.y = 0.165; g.add(relief);
  g.add(tube([V(0, 0.175, 0), V(0, 0.23, 0.01), V(0.03, 0.29, 0.06), V(0.08, 0.3, 0.12)], 0.003, dark, 40));
  const mark = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 8, 6), std(0x2fbf71)); mark.position.set(-0.029, 0.02, 0); g.add(mark);
  return g;
}
function needle(hubColor = 0x3aa655, len = 0.07, r = 0.0006) {
  const g = new THREE.Group();
  g.add(at(cylX(0.0001, r, 0.004, steel, 8), 0.002));
  g.add(at(cylX(r, r, len, steel, 8), 0.004 + len / 2));
  const hub = std(hubColor, { transparent: true, opacity: 0.85, roughness: 0.3 });
  g.add(at(cylX(0.0022, 0.0038, 0.016, hub), 0.004 + len + 0.008));
  g.add(at(cylX(0.0048, 0.0048, 0.002, hub), 0.004 + len + 0.017));
  return g;
}
function guidewire() {
  const g = new THREE.Group(), wire = std(0x8fb5a8, { metalness: 0.3, roughness: 0.3 }), pts = [];
  for (let k = 0; k <= 160; k++) { const a = k / 160 * Math.PI * 4.2; pts.push(V(Math.cos(a) * 0.06 - 0.06, 0.0015 * k / 160, Math.sin(a) * 0.06)); }
  const last = pts[pts.length - 1]; pts.push(last.clone().add(V(0.02, 0, 0.01)), last.clone().add(V(0.035, 0, 0.005)), last.clone().add(V(0.038, 0, -0.004)), last.clone().add(V(0.032, 0, -0.008)));
  g.add(tube(pts, 0.0007, wire, 400));
  const holder = at(new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.003, 8, 48), std(0x2e6fd8, { transparent: true, opacity: 0.55 })), -0.06, 0, 0); holder.rotation.x = Math.PI / 2; g.add(holder);
  return g;
}
function sheath() {
  const g = new THREE.Group(), white = std(0xf4f6f8, { roughness: 0.3 }), blue = std(0x2f78c8, { roughness: 0.35 }), gray = std(0x7d868f);
  g.add(at(cylX(0.0004, 0.0012, 0.012, white, 12), 0.006));            // 扩张器锥形头
  g.add(at(cylX(0.0016, 0.0016, 0.11, std(0xdde9f6, { transparent: true, opacity: 0.8 }), 14), 0.012 + 0.055));
  g.add(at(cylX(0.0016, 0.0055, 0.012, blue), 0.128));
  g.add(at(cylX(0.0055, 0.0055, 0.02, blue), 0.144));
  g.add(at(cylX(0.006, 0.006, 0.006, gray), 0.157));
  g.add(tube([V(0.142, 0.005, 0), V(0.15, 0.02, 0.01), V(0.17, 0.05, 0.03), V(0.2, 0.06, 0.04)], 0.0012, std(0xe7eef5, { transparent: true, opacity: 0.85 }), 24));
  const sc = new THREE.Group(); sc.position.set(0.205, 0.06, 0.04); sc.add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.008), std(0x2f78c8))); const handle = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.016, 0.004), std(0xe8eef4)); handle.position.y = 0.01; sc.add(handle); g.add(sc);
  return g;
}
function rfCatheter() {
  const g = new THREE.Group(), body = std(0xf1f3f5, { roughness: 0.35 }), coil = std(0xc8803c, { metalness: 0.6, roughness: 0.3 });
  g.add(at(cylX(0.0011, 0.0013, 0.004, body, 12), 0.002));
  g.add(at(cylX(0.00135, 0.00135, 0.07, coil, 14), 0.004 + 0.035));
  for (let i = 0; i < 14; i++) g.add(at(cylX(0.00145, 0.00145, 0.0012, std(0x9a5a20, { metalness: 0.5 }), 10), 0.008 + i * 0.0048));
  const pts = [V(0.074, 0, 0), V(0.25, 0, 0)]; for (let k = 0; k <= 120; k++) { const a = k / 120 * Math.PI * 3.2; pts.push(V(0.25 + Math.sin(a) * 0.08, 0.002 * k / 120, -0.08 + Math.cos(a) * 0.08)); }
  g.add(tube(pts, 0.0013, body, 300));
  for (let i = 1; i <= 3; i++) g.add(at(cylX(0.0015, 0.0015, 0.0015, std(0x222222), 10), 0.074 + i * 0.045));
  const end = pts[pts.length - 1]; const handle = cylX(0.005, 0.007, 0.06, std(0x3b4b5c)); handle.position.copy(end).add(V(0.03, 0, 0)); g.add(handle);
  g.add(tube([end.clone().add(V(0.06, 0, 0)), end.clone().add(V(0.1, 0.01, 0.03)), end.clone().add(V(0.14, 0.0, 0.08))], 0.0025, std(0x3b4b5c), 20));
  return g;
}
function syringe() {
  const g = new THREE.Group();
  const nd = needle(0xe36aa0, 0.09, 0.00045); g.add(nd);
  const x0 = 0.115;
  g.add(at(cylX(0.0015, 0.0025, 0.008, std(0xf2f2f2, { transparent: true, opacity: 0.8 })), x0 + 0.004));
  const barrel = at(cylX(0.0105, 0.0105, 0.09, std(0xeef4f8, { transparent: true, opacity: 0.35, roughness: 0.1, depthWrite: false }), 24), x0 + 0.008 + 0.045); barrel.renderOrder = 3; g.add(barrel);
  g.add(at(cylX(0.0098, 0.0098, 0.06, std(0x9bd3f0, { transparent: true, opacity: 0.55, depthWrite: false }), 20), x0 + 0.008 + 0.03));
  g.add(at(cylX(0.0099, 0.0099, 0.006, std(0x333333), 20), x0 + 0.008 + 0.063));
  const rod = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.002), std(0xf5f5f5)); rod.position.x = x0 + 0.1; g.add(rod);
  const rod2 = rod.clone(); rod2.rotation.x = Math.PI / 2; g.add(rod2);
  g.add(at(cylX(0.012, 0.012, 0.003, std(0xf5f5f5), 20), x0 + 0.131));
  const fl = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.034, 0.012), std(0xeef4f8, { transparent: true, opacity: 0.6 })); fl.position.x = x0 + 0.1; g.add(fl);
  for (let i = 1; i <= 8; i++) g.add(at(cylX(0.0106, 0.0106, 0.0004, std(0x2a2a2a), 24), x0 + 0.008 + i * 0.01));
  return g;
}
function pen() { const g = new THREE.Group(); g.add(at(cylX(0.0006, 0.0035, 0.012, std(0x6b2fa0)), 0.006)); g.add(at(cylX(0.0045, 0.0045, 0.11, std(0xffffff)), 0.067)); g.add(at(cylX(0.0052, 0.0052, 0.03, std(0x6b2fa0)), 0.11)); return g; }
function bandage() {
  const g = new THREE.Group(), m = std(0xe9dcc0, { roughness: 0.9 });
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.1, 28), m); roll.rotation.x = Math.PI / 2; g.add(roll);
  const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.1), std(0xe9dcc0, { side: THREE.DoubleSide, roughness: 0.9 })); tail.rotation.x = -Math.PI / 2; tail.position.set(0.04, -0.028, 0); g.add(tail);
  return g;
}
function hemostat() {
  const g = new THREE.Group();
  for (const s of [1, -1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.003, 0.004), steel); arm.position.set(0.065, 0, s * 0.004); arm.rotation.y = s * 0.06; g.add(arm); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0018, 8, 20), steel); ring.rotation.x = Math.PI / 2; ring.position.set(0.138, 0, s * 0.014); g.add(ring); }
  return g;
}
function stripper() { const g = new THREE.Group(); g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.005, 12, 10), steel), 0.005)); g.add(at(cylX(0.0015, 0.0015, 0.3, steel, 8), 0.155)); g.add(at(cylX(0.004, 0.004, 0.04, std(0x444444)), 0.32)); return g; }

export const TOOL_DEFS = [
  ['probe', '超声线阵探头', probe], ['pen', '标记笔', pen], ['needle', '穿刺针（21G）', () => needle()], ['wire', '导丝（J 形头）', guidewire],
  ['sheath', '血管鞘（7F，带侧管）', sheath], ['catheter', '射频消融导管（7 cm 加热段）', rfCatheter], ['syringe', '肿胀麻醉注射器（20 ml）', syringe],
  ['bandage', '弹力绷带', bandage], ['hemostat', '止血钳', hemostat], ['stripper', '剥脱器', stripper]
];
// 器械盘（Mayo 台）：各器械在盘中的摆放位置
export function buildTray() {
  const grp = new THREE.Group(), tools = {};
  const trayM = std(0xb9c1c9, { metalness: 0.5, roughness: 0.35 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.008, 0.36), trayM); grp.add(base);
  for (const [w, d, x, z] of [[0.5, 0.006, 0, 0.18], [0.5, 0.006, 0, -0.18], [0.006, 0.36, 0.25, 0], [0.006, 0.36, -0.25, 0]]) { const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, d), trayM); r.position.set(x, 0.012, z); grp.add(r); }
  const drape = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.002, 0.34), std(0x3f8f9c, { roughness: 0.95 })); drape.position.y = 0.005; grp.add(drape);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 12), trayM); pole.position.set(0.2, -0.45, 0.12); grp.add(pole);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.4), trayM); foot.position.set(0.2, -0.9, 0.12); grp.add(foot);
  const place = { probe: [-0.17, 0.012, -0.08, [0, 0, -Math.PI / 2]], pen: [-0.2, 0.012, 0.12, [0, -0.3, 0]], needle: [-0.08, 0.008, 0.14, [0, 0.2, 0]], wire: [0.15, 0.008, -0.07, [0, 0, 0]],
    sheath: [-0.04, 0.012, 0.06, [0, 0.1, 0]], catheter: [-0.02, 0.008, -0.12, [0, 0.4, 0]], syringe: [0.02, 0.02, 0.13, [0, 0.15, 0]], bandage: [0.18, 0.034, 0.12, [0, 0, 0]],
    hemostat: [-0.2, 0.008, -0.02, [0, 1.2, 0]], stripper: [-0.22, 0.008, 0.16, [0, -0.08, 0]] };
  for (const [id, label, fn] of TOOL_DEFS) {
    const t = fn(); const [x, y, z, r] = place[id]; t.position.set(x, y, z); t.rotation.set(...r);
    t.userData = { tool: id, label, home: { p: t.position.clone(), q: t.quaternion.clone() } };
    t.traverse(o => { if (o.isMesh) o.userData.toolRoot = t; });
    grp.add(t); tools[id] = t;
  }
  return { group: grp, tools };
}
