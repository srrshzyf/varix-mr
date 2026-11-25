// 虚拟诊室（程序化低多边形场景）。坐标：学生站在原点、面向 −z。
import * as THREE from './three.module.min.js';
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
function box(w, h, d, mat, x, y, z, parent) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; }
function cyl(r1, r2, h, mat, x, y, z, parent, seg = 16) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat); m.position.set(x, y, z); parent.add(m); return m; }
function textCanvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return { c, t }; }
const FONT = '"PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif';

export const SPOTS = {
  door: [2.25, -3.55], doorIn: [2.25, -2.9], chair: [0.38, -1.8], exam: [0.72, -1.4], bedside: [0.92, -1.05], front: [0.55, -1.55]
};
export const BED = { x: 1.35, z: -1.75, h: 0.72 };

export function buildClinic() {
  const g = new THREE.Group();
  const X0 = -2.4, X1 = 2.9, Z0 = -3.6, Z1 = 1.4, HT = 2.8;
  // 地面、墙、天花板
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), std(0xd8dcd6, { roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.position.set((X0 + X1) / 2, 0, (Z0 + Z1) / 2); g.add(floor);
  const wallM = std(0xeef1ee), trimM = std(0x9fb7b0);
  const back = new THREE.Group(); g.add(back);
  // 后墙留门洞（x 1.8–2.7）
  box(1.8 - X0, HT, 0.08, wallM, (X0 + 1.8) / 2, HT / 2, Z0, back); box(X1 - 2.7, HT, 0.08, wallM, (2.7 + X1) / 2, HT / 2, Z0, back); box(0.9, HT - 2.1, 0.08, wallM, 2.25, 2.1 + (HT - 2.1) / 2, Z0, back);
  box(X1 - X0, 0.12, 0.02, trimM, (X0 + X1) / 2, 0.06, Z0 + 0.05, back);
  const left = box(0.08, HT, Z1 - Z0, wallM, X0, HT / 2, (Z0 + Z1) / 2, g), right = box(0.08, HT, Z1 - Z0, wallM, X1, HT / 2, (Z0 + Z1) / 2, g);
  box(X1 - X0, HT, 0.08, wallM, (X0 + X1) / 2, HT / 2, Z1, g);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), std(0xf7f7f5)); ceil.rotation.x = Math.PI / 2; ceil.position.set((X0 + X1) / 2, HT, (Z0 + Z1) / 2); g.add(ceil);
  for (const [x, z] of [[-0.6, -1.2], [1.2, -1.8], [-0.6, 0.4]]) box(1.1, 0.02, 0.55, new THREE.MeshBasicMaterial({ color: 0xffffff }), x, HT - 0.01, z, g);
  // 门（铰链在 x=2.7，可开合）
  box(0.06, 2.12, 0.12, trimM, 1.77, 1.06, Z0, g); box(0.06, 2.12, 0.12, trimM, 2.73, 1.06, Z0, g); box(1.02, 0.06, 0.12, trimM, 2.25, 2.13, Z0, g);
  const door = new THREE.Group(); door.position.set(2.7, 0, Z0); g.add(door);
  box(0.88, 2.06, 0.04, std(0xb9a27f), -0.45, 1.04, 0, door); cyl(0.012, 0.012, 0.12, std(0xcccccc, { metalness: 0.6 }), -0.82, 1.0, 0.05, door).rotation.x = Math.PI / 2;
  const sign = textCanvas(512, 128, (x, w, h) => { x.fillStyle = '#2e6f86'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = '600 56px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('血管外科 诊室 3', w / 2, h / 2); });
  const signM = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.15), new THREE.MeshBasicMaterial({ map: sign.t })); signM.position.set(1.2, 2.25, Z0 + 0.05); g.add(signM);
  // 窗（左墙）
  box(0.02, 1.1, 1.6, new THREE.MeshBasicMaterial({ color: 0xcfe6f2 }), X0 + 0.05, 1.55, -1.4, g);
  for (const dz of [-0.8, 0, 0.8]) box(0.04, 1.14, 0.04, trimM, X0 + 0.06, 1.55, -1.4 + dz, g);
  for (const dy of [-0.57, 0.57]) box(0.04, 0.04, 1.64, trimM, X0 + 0.06, 1.55 + dy, -1.4, g);
  // 诊桌、电脑、键盘
  const deskM = std(0xc9b48f, { roughness: 0.6 }), metal = std(0x9aa3ab, { metalness: 0.4, roughness: 0.4 });
  box(1.5, 0.04, 0.6, deskM, -0.5, 0.74, -0.7, g);
  for (const [x, z] of [[-1.21, -0.95], [0.21, -0.95], [-1.21, -0.45], [0.21, -0.45]]) box(0.04, 0.72, 0.04, metal, x, 0.36, z, g);
  box(1.46, 0.5, 0.02, deskM, -0.5, 0.45, -0.98, g);
  const emr = textCanvas(640, 400, (x, w, h) => { x.fillStyle = '#f4f8fb'; x.fillRect(0, 0, w, h); x.fillStyle = '#2a56c6'; x.fillRect(0, 0, w, 56); x.fillStyle = '#fff'; x.font = '600 30px ' + FONT; x.fillText('门诊电子病历', 20, 38); x.fillStyle = '#14202b'; x.font = '28px ' + FONT; ['患者：李某　女　54 岁', '科室：血管外科门诊', '主诉：左下肢静脉迂曲扩张', '10 余年，踝部发黑伴瘙痒 1 年', '过敏史：无'].forEach((t, i) => x.fillText(t, 24, 110 + i * 54)); });
  const mon = new THREE.Group(); mon.position.set(-1.05, 0.76, -0.78); mon.rotation.y = 0.75; g.add(mon);
  box(0.5, 0.32, 0.03, std(0x24292e), 0, 0.3, 0, mon); const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.28), new THREE.MeshBasicMaterial({ map: emr.t })); scr.position.set(0, 0.3, 0.017); mon.add(scr);
  box(0.04, 0.14, 0.04, std(0x24292e), 0, 0.08, -0.01, mon); box(0.2, 0.01, 0.14, std(0x24292e), 0, 0.005, 0, mon);
  box(0.42, 0.015, 0.14, std(0x30353a), -0.8, 0.765, -0.52, g).rotation.y = 0.5;
  // 患者座椅（座面中心在患者前方约 0.18 m）
  const chair = new THREE.Group(); const [cx, cz] = SPOTS.chair; chair.position.set(cx, 0, cz); chair.rotation.y = Math.atan2(-cx, -cz); g.add(chair);
  const chairM = std(0x3f8f9c, { roughness: 0.6 });
  box(0.46, 0.06, 0.44, chairM, 0, 0.39, 0.12, chair); box(0.46, 0.45, 0.05, chairM, 0, 0.68, -0.12, chair);
  for (const [x, z] of [[-0.2, -0.08], [0.2, -0.08], [-0.2, 0.32], [0.2, 0.32]]) box(0.03, 0.37, 0.03, metal, x, 0.18, z, chair);
  // 检查床
  const bed = new THREE.Group(); bed.position.set(BED.x, 0, BED.z); g.add(bed);
  box(0.62, 0.5, 1.6, std(0xe8ecef), 0, 0.3, -0.05, bed); box(0.66, 0.1, 1.95, std(0x5d8fa6, { roughness: 0.5 }), 0, 0.64, 0, bed);
  box(0.5, 0.002, 1.7, std(0xffffff, { roughness: 1 }), 0, 0.692, 0.05, bed);
  const pillow = box(0.42, 0.08, 0.3, std(0xf2f4f6), 0, 0.73, -0.8, bed); pillow.rotation.x = -0.15;
  box(0.06, 0.06, 0.55, metal, 0, 0.66, 0.97, bed).rotation.z = Math.PI / 2;
  // 床帘
  const rail = cyl(0.012, 0.012, 2.2, metal, BED.x + 0.55, 2.3, BED.z, g); rail.rotation.x = Math.PI / 2;
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.9, 24, 1), std(0xb9d8d3, { side: THREE.DoubleSide, roughness: 1 }));
  { const p = curtain.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 18) * 0.04); curtain.geometry.computeVertexNormals(); }
  curtain.rotation.y = Math.PI / 2; curtain.position.set(BED.x + 0.55, 1.32, BED.z - 0.45); g.add(curtain);
  // 超声仪（推车 + 屏幕）
  const us = new THREE.Group(); us.position.set(0.62, 0, -2.45); us.rotation.y = 0.35; g.add(us);
  const usM = std(0xf0f2f4, { roughness: 0.4 }), darkM = std(0x2b3036);
  box(0.5, 0.06, 0.55, darkM, 0, 0.1, 0, us); for (const [x, z] of [[-0.2, -0.22], [0.2, -0.22], [-0.2, 0.22], [0.2, 0.22]]) cyl(0.035, 0.035, 0.04, darkM, x, 0.035, z, us).rotation.z = Math.PI / 2;
  box(0.12, 0.7, 0.12, usM, 0, 0.48, -0.05, us); box(0.56, 0.12, 0.46, usM, 0, 0.88, 0.04, us);
  const kb = box(0.5, 0.02, 0.32, darkM, 0, 0.95, 0.06, us); kb.rotation.x = 0.18;
  for (let i = 0; i < 4; i++) cyl(0.012, 0.012, 0.02, std(0x55606b), -0.15 + i * 0.1, 0.97, 0.1, us);
  cyl(0.03, 0.03, 0.02, std(0x7f8a95), 0.12, 0.975, 0.0, us);
  const screenPivot = new THREE.Group(); screenPivot.position.set(0, 1.0, -0.12); us.add(screenPivot);
  box(0.04, 0.22, 0.04, darkM, 0, 0.1, 0, screenPivot);
  box(0.5, 0.36, 0.03, darkM, 0, 0.38, 0.02, screenPivot);
  const usCanvas = document.createElement('canvas'); usCanvas.width = 700; usCanvas.height = 520; const uc = usCanvas.getContext('2d'); uc.fillStyle = '#000'; uc.fillRect(0, 0, 700, 520); uc.fillStyle = '#5b6'; uc.font = '28px ' + FONT; uc.fillText('待机', 310, 260);
  const usTex = new THREE.CanvasTexture(usCanvas); usTex.colorSpace = THREE.SRGBColorSpace;
  const usScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.33), new THREE.MeshBasicMaterial({ map: usTex })); usScreen.position.set(0, 0.38, 0.037); screenPivot.add(usScreen);
  for (const dx of [-0.29, 0.29]) { const holder = box(0.06, 0.08, 0.06, darkM, dx, 0.9, 0.2, us); }
  // 洗手池与柜子（后墙左侧）、海报
  box(0.9, 0.85, 0.5, std(0xdfe6e9), -1.4, 0.425, Z0 + 0.3, g); box(0.5, 0.06, 0.36, std(0xfafafa, { roughness: 0.2 }), -1.4, 0.88, Z0 + 0.3, g);
  cyl(0.012, 0.012, 0.2, std(0xcccccc, { metalness: 0.7, roughness: 0.2 }), -1.4, 1.0, Z0 + 0.12, g);
  box(0.6, 0.7, 0.3, std(0xdfe6e9), -1.4, 1.75, Z0 + 0.18, g);
  const poster = textCanvas(400, 560, (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#2e6f86'; x.font = '600 36px ' + FONT; x.fillText('CEAP 临床分级', 30, 60); x.fillStyle = '#333'; x.font = '26px ' + FONT; ['C0 无可见体征', 'C1 毛细血管扩张', 'C2 静脉曲张', 'C3 水肿', 'C4a 色素沉着/湿疹', 'C4b 脂性硬皮病/白色萎缩', 'C5 愈合溃疡', 'C6 活动性溃疡'].forEach((t, i) => x.fillText(t, 30, 120 + i * 52)); });
  const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), new THREE.MeshBasicMaterial({ map: poster.t })); pm.position.set(-0.35, 1.6, Z0 + 0.05); g.add(pm);
  // 绿植
  cyl(0.14, 0.11, 0.3, std(0xd9d2c5), -2.0, 0.15, -3.1, g); const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), std(0x5f8f5a)); leaf.position.set(-2.0, 0.55, -3.1); leaf.scale.y = 1.3; g.add(leaf);
  return { group: g, door, usCanvas, usTex };
}
