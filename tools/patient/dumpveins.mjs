// 在 node 中加载 anatomy.js，导出左腿曲张属支/后弓静脉/大隐静脉曲线点（解剖坐标）
import fs from 'fs';
globalThis.fetch = async (u) => { const p = '/home/user/varix-mr/' + u.replace('./', ''); const b = fs.readFileSync(p); return { json: async () => JSON.parse(b), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; };
const THREE = await import('/home/user/varix-mr/three.module.min.js');
globalThis.document = { createElementNS: () => ({ style: {} }) };
const A = await import('/home/user/varix-mr/anatomy.js');
await A.initLegData('./');
THREE.TextureLoader.prototype.load = () => new THREE.Texture();
const leg = A.buildLeg({ side: 1, varicose: true });
const out = { trib: [], gsv: [] };
for (const m of leg.tribs) { if (m.userData.key === 'trib' || m.userData.key === 'pav') { const p = m.geometry.parameters.path; out.trib.push({ r: m.geometry.parameters.radius, pts: p.getSpacedPoints(160).map(v => [v.x, v.y, v.z]) }); } }
out.gsv = leg.gsvCurve.getSpacedPoints(300).map(v => [v.x, v.y, v.z]);
const R = A.buildLeg({ side: -1, varicose: false });
out.spider = R.tribs.filter(m => m.userData.key === 'trib').map(m => m.geometry.parameters.path.getSpacedPoints(30).map(v => [v.x, v.y, v.z]));
fs.writeFileSync('/home/user/build/veins.json', JSON.stringify(out));
console.log(out.trib.length, out.spider.length);
