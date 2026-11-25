import * as THREE from './three.module.min.js';
import { systemPrompt, QUESTIONS, KEYWORDS, EXAM, TESTS, ORDERS, SEGS, US_Q, DX, TALK, STEPS, RUBRIC } from './data.js';

// ================= 状态 =================
const $ = (id) => document.getElementById(id);
const now = () => performance.now();
const S = {
  mod: 'home', level: 'L2', tts: false, chat: [], marks: new Set(), qStart: 0, askedEnd: false, chatScroll: 0, busy: false,
  hintShown: false, gaze: [0, 0], jargonQ: 0,
  exam: { consent: false, consentFirst: null, posture: null, postureWrong: false, exposed: false, found: new Set(), last: null, order: [] },
  tests: { trend: { k: 0, err: 0, ans: null }, perthes: { k: 0, err: 0, ans: null } },
  orders: new Set(), ordersDone: false,
  us: { seg: 'sfj', viewed: new Set(), comp: false, dop: false, ans: {}, labels: true },
  dx: { tab: 0, diag: null, C: null, E: null, A: null, P: null, ddx: new Set(), tx: null, contra: new Set(), post: new Set(), done: false },
  talk: { i: 0, ans: [] },
  surg: { cur: -1, done: [], orderErr: 0, wrongHere: 0, sub: {}, anatK: 0, anatOk: 0, anatErr: 0, seqK: 0, seqErr: 0, multi: new Set(), risk: { nerve: null, tip: null, tum: null }, fb: '' },
  report: { tab: 0, page: 0, ai: '', aiBusy: false },
  log: [], toast: null, t0: Date.now()
};
const log = (type, d = {}) => S.log.push({ t: Math.round((Date.now() - S.t0) / 1000), type, ...d });
function seeded(arr, seed) { const a = arr.map((v, i) => [v, i]); let s = seed; for (let i = a.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor(s / 233280 * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function notify(msg, kind = 'info') { S.toast = { msg, kind, t: now() }; const el = $('toast'); el.textContent = msg; el.className = 'toast show ' + kind; clearTimeout(notify.h); notify.h = setTimeout(() => { el.className = 'toast'; S.toast = null; render(); }, 5200); render(); }

// ================= AI =================
const AI = { mode: 'script', sample: null, tts: null, dict: null, cfg: null };
const inClaude = typeof window.claude?.use === 'function';
async function initAI() {
  try { AI.cfg = JSON.parse(localStorage.getItem('varix-api') || 'null'); } catch { AI.cfg = null; }
  if (AI.cfg?.url && AI.cfg?.key) AI.mode = 'api';
  if (inClaude) {
    const [s, t, d] = await Promise.all(['sample', 'tts', 'dictation'].map(n => window.claude.use(n).catch(() => null)));
    if (s) { AI.sample = s; AI.mode = 'claude'; }
    AI.tts = t; AI.dict = d;
  }
  updateOverlay(); render();
}
const modeName = () => ({ claude: 'Claude 大模型', api: '自定义接口', script: '预设脚本' })[AI.mode];

function buildMessages(extra) {
  const msgs = [];
  for (const m of S.chat) { if (m.sys) continue; msgs.push({ role: m.who === 'doc' ? 'user' : 'assistant', content: m.text }); }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (extra && msgs.length) msgs[msgs.length - 1].content += extra;
  return msgs;
}
async function llm(msgs, onText) {
  if (AI.mode === 'claude') {
    const first = { ...msgs[0], content: systemPrompt(S.level) + '\n\n——以下是实习医生对你说的话，请以李某的身份回答——\n' + msgs[0].content };
    const r = await AI.sample([first, ...msgs.slice(1)], { modelTier: 'quick', cache: false, onText: ({ text }) => onText(text) });
    return r.text;
  }
  const res = await fetch(AI.cfg.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AI.cfg.key }, body: JSON.stringify({ model: AI.cfg.model, temperature: 0.6, messages: [{ role: 'system', content: systemPrompt(S.level) }, ...msgs] }) });
  if (!res.ok) throw new Error('接口返回 ' + res.status);
  const j = await res.json();
  return j.choices?.[0]?.message?.content || '';
}
function detect(text) { const out = []; for (const [k, re] of KEYWORDS) if (re.test(text)) out.push(k); return out; }
function scriptAnswer(text, marks) {
  if (marks.includes('JARGON')) return '医生，你说的这个我听不懂，是什么意思？';
  const order = ['A12', 'A6d', 'A6f', 'A6s', 'A6b', 'A5', 'A7', 'A8', 'A10', 'A11b', 'A11a', 'A9c', 'A9b', 'A9a', 'NIGHT', 'A4', 'ICE', 'RIGHT', 'SOC', 'NEG', 'PROG', 'A3b', 'A3a', 'A2', 'CHIEF', 'A1'];
  const map = { A6d: 'dvt', A6f: 'dvt', A6s: 'dvt', A6b: 'dvt' };
  const picked = [];
  for (const k of order) if (marks.includes(k)) { const id = map[k] || QUESTIONS.find(q => q.m.includes(k))?.id; if (id && !picked.includes(id)) picked.push(id); if (picked.length >= 2) break; }
  if (!picked.length) return '医生，您说的我没太听明白，能换个说法吗？';
  return picked.map(id => cardAnswer(QUESTIONS.find(q => q.id === id))).join('');
}
const cardAnswer = (c) => (S.level === 'L3' && c.a3) ? c.a3 : c.a;
async function ask(text, card) {
  if (S.busy || !text.trim()) return;
  if (!S.qStart) { S.qStart = now(); log('interview_start'); }
  const marks = card ? card.m.slice() : detect(text);
  if (card?.id === 'dvt') marks.push('A6d', 'A6f', 'A6s', 'A6b');
  if (marks.includes('JARGON')) S.jargonQ++;
  const before = S.marks.size; marks.forEach(m => S.marks.add(m)); if (S.marks.size > before) S.lastNew = now();
  S.chat.push({ who: 'doc', text, card: card?.id }); S.chatScroll = 0; log('ask', { text, marks, card: card?.id });
  const pm = { who: 'pt', text: '……' }; S.chat.push(pm); S.busy = true; render();
  let answer;
  try {
    if (AI.mode === 'script') throw 0;
    const mins = (now() - S.qStart) / 60000;
    const extra = (!S.askedEnd && mins > 8) ? '\n（系统提示：问诊已超过 8 分钟）' : '';
    let last = 0;
    answer = await llm(buildMessagesNoPending(extra), (t) => { pm.text = t; if (now() - last > 160) { last = now(); setBubble(t); render(); } });
  } catch (e) {
    if (e && e.code === 'not_granted') { AI.mode = AI.cfg?.url ? 'api' : 'script'; notify('未授权调用 Claude，已改用' + modeName()); }
    else if (e && e !== 0) notify('大模型暂时不可用（' + (e.code || e.message || e) + '），本轮使用预设脚本回答', 'warn');
    answer = card ? cardAnswer(card) : scriptAnswer(text, marks);
  }
  answer = (answer || '').replace(/[（(][^）)]*[）)]/g, '').trim() || '……';
  pm.text = answer; S.busy = false; log('answer', { text: answer, mode: AI.mode });
  if (/开刀吗|烂掉/.test(answer)) S.askedEnd = true;
  setBubble(answer); speak(answer);
  if (!S.askedEnd && (marks.includes('A12') || (now() - S.qStart) > 8 * 60000)) {
    S.askedEnd = true;
    setTimeout(() => { const q = '医生，我这个要开刀吗？会不会烂掉？'; S.chat.push({ who: 'pt', text: q }); setBubble(q); speak(q); render(); }, 1200);
  }
  render();
}
// 发给模型的消息不包含正在生成的占位
function buildMessagesNoPending(extra) { const saved = S.chat.pop(); const m = buildMessages(extra); S.chat.push(saved); return m; }
function speak(t) { if (S.tts && AI.tts) AI.tts.speak(t, { voice: 'rounded' }).catch(() => {}); }

// ================= 评分 =================
function scores() {
  const M = S.marks, sc = {};
  sc.A1 = M.has('A1') ? 2 : 0;
  sc.A2 = (M.has('CHIEF') ? 1 : 0) + (M.has('A2') ? 2 : 0);
  sc.A3 = (M.has('A3a') ? 1.5 : 0) + (M.has('A3b') ? 1.5 : 0);
  sc.A4 = M.has('A4') ? 3 : 0;
  sc.A5 = M.has('A5') ? 3 : 0;
  sc.A6 = ['A6d', 'A6f', 'A6s', 'A6b'].filter(k => M.has(k)).length;
  sc.A7 = M.has('A7') ? 2 : 0;
  sc.A8 = M.has('A8') ? 2 : 0;
  sc.A9 = ['A9a', 'A9b', 'A9c'].filter(k => M.has(k)).length;
  sc.A10 = M.has('A10') ? 2 : 0;
  sc.A11 = (M.has('A11a') ? 1 : 0) + (M.has('A11b') ? 1 : 0);
  sc.A12 = M.has('A12') ? 1 : 0;
  const E = S.exam, f = E.found;
  sc.B1 = (E.posture === 'stand' && !E.postureWrong ? 1 : 0) + (E.exposed ? 1 : 0) + (f.has('inspectR') ? 1 : 0);
  sc.B2 = (f.has('inspectL') ? 1.5 : 0) + (f.has('skin') ? 1.5 : 0);
  sc.B3 = (f.has('dpa') ? 1.5 : 0) + (f.has('pta') ? 1.5 : 0);
  const tsc = (t) => t.k >= 4 ? Math.max(0, 2 - t.err) + (t.ans === 0 ? 1 : 0) : 0;
  sc.B4 = tsc(S.tests.trend); sc.B5 = tsc(S.tests.perthes);
  const O = S.orders;
  sc.C1 = O.has('duplex') ? 5 : 0; sc.C2 = O.has('abi') ? 2 : 0;
  sc.C3 = !S.ordersDone ? 0 : O.has('venogram') ? 0 : O.has('ctv') ? 1 : 2;
  sc.C4 = S.us.ans.c4 === 0 ? 3 : 0;
  sc.C5 = (S.us.ans.c5 === 0 ? 2 : 0) + (['cfv', 'fp', 'calf'].every(k => S.us.viewed.has(k)) && S.us.ans.c5 === 0 ? 1 : 0);
  const D = S.dx;
  sc.D1 = D.diag === 0 ? 4 : 0;
  sc.D2 = (D.C === 2 ? 2 : 0) + [D.E, D.A, D.P].filter(v => v === 0).length * (2 / 3);
  const good = [...D.ddx].filter(i => DX.ddx.good.includes(i)).length, bad = [...D.ddx].filter(i => DX.ddx.bad.includes(i)).length;
  sc.D3 = Math.max(0, (good >= 3 ? (D.ddx.has(0) ? 5 : 2) : (D.ddx.has(0) ? 2 : good * 0.5)) - bad);
  sc.D4 = 0;
  sc.E1 = D.tx == null ? 0 : DX.tx.pts[D.tx];
  const cg = [...D.contra].filter(i => DX.contra.good.includes(i)).length, cb = D.contra.size - cg;
  sc.E2 = Math.max(0, (cg >= 2 ? 3 : cg * 1.5) - cb);
  const pg = [...D.post].filter(i => DX.post.good.includes(i)).length, pb = D.post.size - pg;
  sc.E3 = Math.max(0, pg - pb);
  const G = S.surg;
  sc.F1 = G.done.length ? Math.max(0, 4 - G.orderErr) * (G.done.length / 11) : 0;
  sc.F2 = G.anatOk * 0.75;
  sc.F3 = ['nerve', 'tip', 'tum'].filter(k => G.risk[k] === true).length;
  const jar = S.talk.ans.filter(k => k === 'jargon').length;
  sc.G1 = S.talk.ans.length < TALK.length ? 0 : jar === 0 ? 2 : jar === 1 ? 1 : 0;
  sc.G2 = S.talk.ans.filter(k => k === 'good').length * 0.5;
  sc.G3 = E.consentFirst === true ? 1 : 0;
  for (const k in sc) sc[k] = Math.round(sc[k] * 10) / 10;
  return sc;
}
function totals() {
  const sc = scores(); let t = 0; const sec = {};
  for (const [L, , max, items] of RUBRIC) { let s = 0; for (const [id] of items) s += sc[id] || 0; sec[L] = [Math.round(s * 10) / 10, max]; t += s; }
  return { sc, sec, total: Math.round(t * 10) / 10 };
}

// ================= 3D 场景 =================
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('stage').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const BG = new THREE.Color(0xe9edf1);
scene.background = BG;
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 50);
camera.position.set(0.05, 1.5, 0.55);
const view = { yaw: -0.08, pitch: -0.1, dist: 0 };
function applyView() { camera.rotation.set(view.pitch, view.yaw, 0, 'YXZ'); }
applyView();
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(1, 3, 2); scene.add(sun);

const room = new THREE.Group(); scene.add(room);
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshLambertMaterial({ color: 0xd6dbe0 }));
  floor.rotation.x = -Math.PI / 2; room.add(floor);
  const grid = new THREE.GridHelper(12, 24, 0xbfc6cd, 0xc9cfd5); grid.position.y = 0.002; room.add(grid);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 4), new THREE.MeshLambertMaterial({ color: 0xf4f6f8 }));
  wall.position.set(0, 2, -3.2); room.add(wall);
}

// ----- 患者模型 -----
const SKIN = 0xe7c3a5;
const mat = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const patient = new THREE.Group(); scene.add(patient);
const body = new THREE.Group(); patient.add(body);
function capsule(r, len, c, x, y, z, parent = body) { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 16), mat(c)); m.position.set(x, y, z); parent.add(m); return m; }
for (const sx of [1, -1]) {
  capsule(0.074, 0.32, SKIN, 0.1 * sx, 0.68, 0);
  capsule(0.054, 0.32, SKIN, 0.1 * sx, 0.29, 0);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.09, 0.22), mat(SKIN)); foot.position.set(0.1 * sx, 0.045, 0.04); body.add(foot);
  const arm = capsule(0.038, 0.46, SKIN, 0.235 * sx, 1.13, 0); arm.rotation.z = 0.08 * sx;
}
const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.2, 24), mat(0x5d6b7a)); shorts.position.y = 0.92; body.add(shorts);
const torso = capsule(0.155, 0.36, 0x8fb8c8, 0, 1.22, 0); torso.scale.set(1.05, 1, 0.7);
capsule(0.04, 0.05, SKIN, 0, 1.5, 0);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), mat(SKIN)); head.position.set(0, 1.62, 0); body.add(head);
const hair = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 12, 0, Math.PI * 2, 0, 1.7), mat(0x3b3430)); hair.position.set(0, 1.635, -0.01); hair.rotation.x = -0.35; body.add(hair);
const pants = new THREE.Group(); body.add(pants);
for (const sx of [1, -1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.082, 0.8, 20), mat(0x4a5562)); p.position.set(0.1 * sx, 0.47, 0); pants.add(p); }

// 左下肢大隐静脉（患者左侧 = +x），曲线从 SFJ 向远端
const legR = (y) => y > 0.52 ? 0.079 : y < 0.42 ? 0.059 : 0.059 + (y - 0.42) / 0.1 * 0.02;
function surf(y, a, cx = 0.1, extra = 0.004) { const r = legR(y) + extra; return new THREE.Vector3(cx - r * Math.sin(a), y, r * Math.cos(a)); }
const gsvPts = [];
for (let i = 0; i <= 40; i++) { const y = 0.86 - i * (0.86 - 0.18) / 40; const a = 0.95 + 0.25 * Math.sin(i * 0.9) + (y < 0.6 ? 0.1 : 0); gsvPts.push(surf(y, a)); }
const gsvCurve = new THREE.CatmullRomCurve3(gsvPts);
const VEIN = new THREE.Color(0x3a4f9e), VEIN_E = new THREE.Color(0xc9a896), ABL = new THREE.Color(0x8a8a8a);
const veinSegs = [];
const N_SEG = 12;
for (let s = 0; s < N_SEG; s++) {
  const u0 = s / N_SEG, u1 = (s + 1) / N_SEG; const pts = []; for (let k = 0; k <= 6; k++) pts.push(gsvCurve.getPointAt(u0 + (u1 - u0) * k / 6));
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.0075, 8), mat(VEIN.clone()));
  m.userData = { u0, u1, fill: 1, abl: 0 }; body.add(m); veinSegs.push(m);
}
const tribs = [];
for (const [y0, a0, len, dir] of [[0.42, 1.0, 0.16, 1], [0.36, 1.1, 0.14, -1], [0.28, 0.9, 0.12, 1], [0.6, 1.0, 0.1, -1]]) {
  const pts = []; for (let k = 0; k <= 10; k++) { const y = y0 - k * len / 10; pts.push(surf(y, a0 + dir * k * 0.06 + 0.15 * Math.sin(k * 1.7))); }
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0055, 8), mat(VEIN.clone())); m.userData = { fill: 1, abl: 0, trib: true }; body.add(m); tribs.push(m);
}
{ // 内踝上方色素沉着
  const p = surf(0.15, 1.15, 0.1, 0.0015); const m = new THREE.Mesh(new THREE.CircleGeometry(0.03, 24), mat(0x6e4a2f, { transparent: true, opacity: 0.85 }));
  m.scale.set(0.85, 1.1, 1); m.position.copy(p); m.lookAt(p.clone().add(new THREE.Vector3(-Math.sin(1.15), 0, Math.cos(1.15)))); body.add(m);
  for (let i = 0; i < 6; i++) { const q = surf(0.3 + i * 0.02, -1.6 + (i % 3) * 0.15, -0.1, 0.002); const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.03, 4), mat(0xc0483f)); sp.position.copy(q); sp.rotation.z = 0.6 * (i % 2 ? 1 : -1); body.add(sp); }
}
const tourniquet = new THREE.Mesh(new THREE.TorusGeometry(0.086, 0.012, 8, 24), mat(0x2f6fdf)); tourniquet.rotation.x = Math.PI / 2; tourniquet.position.set(0.1, 0.83, 0); tourniquet.visible = false; body.add(tourniquet);
// 手术用：深静脉、导管、肿胀晕圈、绷带、手术台
const deep = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.09, 0.95, 0.02), new THREE.Vector3(0.095, 0.86, 0.0), new THREE.Vector3(0.11, 0.6, -0.02), new THREE.Vector3(0.1, 0.46, -0.03)]), 20, 0.013, 8), mat(0x1d2d6b, { transparent: true, opacity: 0.55 }));
deep.visible = false; body.add(deep);
const sfjRing = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, 6, 16), mat(0xffb020)); sfjRing.position.copy(gsvCurve.getPointAt(0)); sfjRing.visible = false; body.add(sfjRing);
const catheter = new THREE.Mesh(new THREE.BufferGeometry(), mat(0xf5f5f5)); catheter.visible = false; body.add(catheter);
const halo = new THREE.Mesh(new THREE.BufferGeometry(), mat(0x6fd3ff, { transparent: true, opacity: 0.35 })); halo.visible = false; body.add(halo);
const U_KNEE = 0.55;
function tubeAlong(u0, u1, r) { const pts = []; for (let k = 0; k <= 16; k++) pts.push(gsvCurve.getPointAt(u0 + (u1 - u0) * k / 16)); return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, r, 8); }
function setCatheter(uTip) {
  catheter.geometry.dispose();
  if (uTip < 0) { const p0 = gsvCurve.getPointAt(0), pts = []; for (let k = 0; k <= 16; k++) pts.push(gsvCurve.getPointAt(U_KNEE * (1 - k / 16))); pts.push(p0.clone().add(new THREE.Vector3(-0.01, 0.04, -0.03))); catheter.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0035, 6); }
  else catheter.geometry = tubeAlong(uTip, U_KNEE, 0.0035);
  catheter.visible = true;
}
const bandages = [];
for (let i = 0; i < 12; i++) { const y = 0.1 + i * 0.065; const b = new THREE.Mesh(new THREE.CylinderGeometry(legR(y) + 0.01, legR(y) + 0.01, 0.055, 20, 1, true), mat(0xf0ede4, { side: THREE.DoubleSide })); b.position.set(0.1, y, 0); b.visible = false; body.add(b); bandages.push(b); }
const table = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 1.9), mat(0x7c8a96)); table.position.set(0.55, 0.72, -1.75); table.visible = false; scene.add(table);
const tableLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), mat(0x5e6b77)); tableLeg.position.set(0.55, 0.35, -1.75); tableLeg.visible = false; scene.add(tableLeg);

// 气泡（患者说话）
const bubbleCv = document.createElement('canvas'); bubbleCv.width = 900; bubbleCv.height = 300;
const bubbleTex = new THREE.CanvasTexture(bubbleCv); bubbleTex.colorSpace = THREE.SRGBColorSpace;
const bubble = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.24), new THREE.MeshBasicMaterial({ map: bubbleTex, transparent: true }));
bubble.position.set(0, 1.98, 0.05); bubble.visible = false; body.add(bubble);
function setBubble(t) {
  const c = bubbleCv.getContext('2d'); c.clearRect(0, 0, 900, 300);
  c.fillStyle = 'rgba(255,255,255,0.96)'; rr(c, 6, 6, 888, 260, 26); c.fill(); c.strokeStyle = '#b8c4cf'; c.lineWidth = 3; c.stroke();
  c.beginPath(); c.moveTo(420, 264); c.lineTo(450, 296); c.lineTo(480, 264); c.fill();
  c.fillStyle = '#14202b'; c.font = '38px ' + FONT; c.textBaseline = 'top'; wrap(c, t, 34, 28, 830, 50, 4);
  bubbleTex.needsUpdate = true; bubble.visible = !!t && S.mod !== 'surg';
}

// 查体热点
const hotspots = [];
const hsGeo = new THREE.SphereGeometry(0.018, 16, 10);
for (const e of EXAM) if (e.hs) {
  const m = new THREE.Mesh(hsGeo, new THREE.MeshBasicMaterial({ color: 0x1aa0b8, transparent: true, opacity: 0.85 }));
  m.position.set(...e.hs); m.userData = { hs: e.id, kind: 'exam', label: e.label }; m.visible = false; body.add(m); hotspots.push(m);
}
const SURG_SPOTS = [['groin', '腹股沟（SFJ 附近）', 0.03], ['thigh', '大腿中段', 0.3], ['knee', '膝下 / 膝水平', U_KNEE], ['ankle', '踝部', 0.97]];
for (const [id, label, u] of SURG_SPOTS) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 10), new THREE.MeshBasicMaterial({ color: 0x2f6fdf, transparent: true, opacity: 0.9 }));
  const p = gsvCurve.getPointAt(u); m.position.set(p.x - 0.004, p.y, p.z + 0.012); m.userData = { hs: id, kind: 'surg', label }; m.visible = false; body.add(m); hotspots.push(m);
}
// 悬停标签
const tipCv = document.createElement('canvas'); tipCv.width = 512; tipCv.height = 96;
const tipTex = new THREE.CanvasTexture(tipCv); tipTex.colorSpace = THREE.SRGBColorSpace;
const tipSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tipTex, depthTest: false })); tipSprite.scale.set(0.3, 0.056, 1); tipSprite.visible = false; tipSprite.renderOrder = 10; scene.add(tipSprite);
function showTip(obj) {
  if (!obj) { tipSprite.visible = false; return; }
  const c = tipCv.getContext('2d'); c.clearRect(0, 0, 512, 96); c.fillStyle = 'rgba(20,32,43,0.92)'; rr(c, 0, 8, 512, 80, 20); c.fill();
  c.fillStyle = '#fff'; c.font = '38px ' + FONT; c.textAlign = 'center'; c.fillText(obj.userData.label, 256, 62); c.textAlign = 'left'; tipTex.needsUpdate = true;
  obj.getWorldPosition(tipSprite.position); tipSprite.position.y += 0.07; tipSprite.visible = true;
}

// 姿态
const POSE = { stand: { p: [0.62, 0, -1.55], r: [0, -0.38, 0] }, supine: { p: [0.55, 0.78, -0.95], r: [-Math.PI / 2, 0, 0] } };
let pose = 'stand';
function setPose(name, ms = 900) {
  if (pose === name) return; pose = name; const a = { p: patient.position.clone(), r: patient.rotation.clone() }, b = POSE[name];
  tween(ms, (k) => { patient.position.set(...a.p.toArray().map((v, i) => v + (b.p[i] - v) * k)); patient.rotation.set(a.r.x + (b.r[0] - a.r.x) * k, a.r.y + (b.r[1] - a.r.y) * k, a.r.z + (b.r[2] - a.r.z) * k); });
  table.visible = tableLeg.visible = name === 'supine';
}
patient.position.set(...POSE.stand.p); patient.rotation.set(...POSE.stand.r);
const tweens = [];
function tween(ms, fn, done) { tweens.push({ t0: now(), ms, fn, done }); }
function setFill(seg, f) { seg.userData.fill = f; paintVein(seg); }
function paintVein(seg) { const d = seg.userData; const c = d.abl ? ABL : VEIN_E.clone().lerp(VEIN, d.fill); seg.material.color.copy(c); seg.scale.setScalar(1); }
function fillVeins(from, to, ms, topDown = true) {
  const all = [...veinSegs, ...tribs];
  tween(ms, (k) => { all.forEach((s, i) => { const pos = topDown ? (s.userData.trib ? 0.8 : s.userData.u0) : 0; const kk = Math.min(1, Math.max(0, (k * 1.4 - pos * 0.4) / 1)); setFill(s, from + (to - from) * kk); }); });
}

// ================= 面板 UI（画在 canvas 上，贴到 3D 平面） =================
const FONT = '"PingFang SC","Noto Sans SC","Noto Sans CJK SC","Microsoft YaHei","Source Han Sans SC",sans-serif';
const W = 1600, H = 1000;
const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.85), new THREE.MeshBasicMaterial({ map: tex }));
panel.position.set(-0.4, 1.36, -1.1); panel.rotation.y = 0.26; scene.add(panel);
const C = { ink: '#14202b', sub: '#566676', line: '#d5dde4', bg: '#ffffff', soft: '#f1f4f7', blue: '#2a56c6', blueSoft: '#e4ebfb', ok: '#1d7f5a', okSoft: '#ddf2e8', bad: '#c0392b', badSoft: '#fbe3e0', warn: '#b26a00', teal: '#13839a' };
let hits = [], hoverId = null;
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function wrap(c, s, x, y, maxW, lh, maxLines = 99) {
  const lines = []; for (const para of String(s).split('\n')) { let line = ''; for (const ch of para) { if (c.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; } else line += ch; } lines.push(line); }
  const out = lines.slice(0, maxLines); if (lines.length > maxLines) out[maxLines - 1] = out[maxLines - 1].slice(0, -1) + '…';
  out.forEach((l, i) => c.fillText(l, x, y + i * lh)); return out.length * lh;
}
function measureLines(s, size, maxW) { ctx.font = size + 'px ' + FONT; let n = 0; for (const para of String(s).split('\n')) { let line = ''; n++; for (const ch of para) { if (ctx.measureText(line + ch).width > maxW && line) { n++; line = ch; } else line += ch; } } return n; }
function text(s, x, y, o = {}) { ctx.font = (o.w || '') + ' ' + (o.size || 26) + 'px ' + FONT; ctx.fillStyle = o.color || C.ink; ctx.textBaseline = 'top'; return wrap(ctx, s, x, y, o.maxW || 1200, o.lh || (o.size || 26) * 1.42, o.lines); }
function btn(id, x, y, w, h, label, fn, o = {}) {
  const st = o.st || 'ghost', hov = hoverId === id && !o.dis;
  const pal = { ghost: [C.soft, C.ink, C.line], primary: [C.blue, '#fff', C.blue], sel: [C.blueSoft, C.blue, C.blue], ok: [C.okSoft, C.ok, C.ok], bad: [C.badSoft, C.bad, C.bad], dis: ['#f5f6f7', '#a3adb6', '#e4e8ec'] }[o.dis ? 'dis' : st];
  ctx.fillStyle = hov ? (st === 'primary' ? '#1f45a6' : '#e2e8ee') : pal[0]; rr(ctx, x, y, w, h, 12); ctx.fill();
  ctx.lineWidth = hov ? 3 : 2; ctx.strokeStyle = hov ? C.blue : pal[2]; ctx.stroke();
  const size = o.size || 24; ctx.font = (o.bold ? '600 ' : '') + size + 'px ' + FONT; ctx.fillStyle = pal[1]; ctx.textBaseline = 'middle';
  const lines = []; let line = ''; for (const ch of label) { if (ctx.measureText(line + ch).width > w - 28 && line) { lines.push(line); line = ch; } else line += ch; } lines.push(line);
  const lh = size * 1.3, shown = lines.slice(0, Math.max(1, Math.floor((h - 8) / lh))); const y0 = y + h / 2 - (shown.length - 1) * lh / 2;
  shown.forEach((l, i) => { ctx.textAlign = o.left ? 'left' : 'center'; ctx.fillText(l, o.left ? x + 16 : x + w / 2, y0 + i * lh); });
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  if (!o.dis) hits.push({ id, x, y, w, h, fn });
}
function hitArea(id, x, y, w, h, fn) { hits.push({ id, x, y, w, h, fn }); }
function card(x, y, w, h, fill = C.soft) { ctx.fillStyle = fill; rr(ctx, x, y, w, h, 14); ctx.fill(); }

const MODS = [['home', '首页'], ['interview', '1 问诊'], ['exam', '2 查体'], ['orders', '3 开具检查'], ['us', '4 超声判读'], ['dx', '5 诊断决策'], ['talk', '6 告知患者'], ['surg', '7 热消融手术'], ['report', '8 评分报告']];
const done = () => ({ interview: S.marks.size >= 8, exam: S.tests.trend.ans != null && S.tests.perthes.ans != null, orders: S.ordersDone, us: S.us.ans.c4 != null && S.us.ans.c5 != null, dx: S.dx.done, talk: S.talk.ans.length >= TALK.length, surg: S.surg.done.length >= 11 });
function go(m) {
  if (m === 'us' && !S.orders.has('duplex')) { notify('请先在“开具检查”中开出静脉超声，结果才会释放', 'warn'); return; }
  S.mod = m; log('module', { m });
  hotspots.forEach(h => h.visible = (m === 'exam' && h.userData.kind === 'exam' && S.exam.exposed && S.exam.posture === 'stand') || (m === 'surg' && h.userData.kind === 'surg' && S.surg.cur === 3));
  const surg = m === 'surg'; setPose(surg ? 'supine' : 'stand'); deep.visible = sfjRing.visible = surg;
  if (surg) pants.visible = false; else pants.visible = !S.exam.exposed;
  bubble.visible = !surg && S.chat.length > 0; tourniquet.visible = false;
  if (!surg) { [...veinSegs, ...tribs].forEach(s => { s.userData.abl = 0; setFill(s, 1); }); catheter.visible = halo.visible = false; bandages.forEach(b => b.visible = false); }
  else restoreSurg3D();
  updateOverlay(); render();
}

function render() {
  hits = []; ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = C.bg; rr(ctx, 0, 0, W, H, 28); ctx.fill();
  ctx.fillStyle = '#f5f7f9'; rr(ctx, 0, 0, 300, H, 28); ctx.fill(); ctx.fillRect(272, 0, 28, H);
  text('静脉曲张', 34, 30, { size: 34, w: '700' }); text('VR+AI 实习训练', 34, 74, { size: 22, color: C.sub });
  const dn = done();
  MODS.forEach(([id, lb], i) => btn('nav-' + id, 20, 122 + i * 76, 260, 64, lb + (dn[id] ? '  ✓' : ''), () => go(id), { st: S.mod === id ? 'primary' : 'ghost', left: true, size: 26, bold: S.mod === id }));
  const t = totals();
  text('当前得分', 34, 820, { size: 20, color: C.sub }); text(t.total + ' / 100', 34, 846, { size: 34, w: '700' });
  text('对话：' + modeName(), 34, 904, { size: 20, color: AI.mode === 'script' ? C.warn : C.ok });
  text(renderer.xr.isPresenting ? 'MR/VR 模式中' : '电脑预览模式', 34, 934, { size: 20, color: C.sub });
  ({ home: vHome, interview: vInterview, exam: vExam, orders: vOrders, us: vUS, dx: vDx, talk: vTalk, surg: vSurg, report: vReport })[S.mod]();
  if (S.toast) { const k = S.toast.kind; card(320, 924, 1260, 60, k === 'bad' ? C.badSoft : k === 'warn' ? '#fff1d6' : k === 'ok' ? C.okSoft : C.blueSoft); text(S.toast.msg, 340, 940, { size: 24, maxW: 1220, lines: 1, color: k === 'bad' ? C.bad : k === 'warn' ? C.warn : k === 'ok' ? C.ok : C.blue }); }
  tex.needsUpdate = true;
}
const title = (s, sub) => { text(s, 320, 26, { size: 38, w: '700' }); if (sub) text(sub, 320, 76, { size: 22, color: C.sub, maxW: 1260, lines: 1 }); };

function vHome() {
  title('下肢静脉曲张初诊 · MR 训练原型', '标准病例：李某，女，54 岁，超市收银员。左下肢静脉迂曲扩张 10 余年，踝部皮肤发黑伴瘙痒 1 年。');
  const steps = [['1 问诊', 'AI 标准化病人对话，上限 12 分钟'], ['2 查体', '站立位视诊触诊、Trendelenburg / Perthes 试验'], ['3 开具检查', '开对超声才释放结果'], ['4 超声判读', '分节段查看反流、压闭'], ['5 诊断决策', '诊断、CEAP、鉴别、治疗'], ['6 告知患者', '用通俗语言回应顾虑'], ['7 热消融手术', '射频消融 11 步流程认知'], ['8 评分报告', '100 分量表 + AI 反馈']];
  steps.forEach(([a, b], i) => { const x = 320 + (i % 4) * 318, y = 130 + Math.floor(i / 4) * 150; card(x, y, 302, 134); text(a, x + 20, y + 18, { size: 28, w: '700' }); text(b, x + 20, y + 62, { size: 21, color: C.sub, maxW: 262 }); hitArea('home-' + i, x, y, 302, 134, () => go(MODS[i + 1][0])); });
  card(320, 450, 1260, 300, '#f7f9fb');
  text('操作方法', 344, 468, { size: 26, w: '700' });
  text('头显：用手柄射线指向按钮，扣扳机确认；也可以捏合手指。患者身上的青色圆点是查体部位，手术时蓝色圆点是穿刺点。\n电脑：鼠标点击面板或患者；按住拖动转动视角。问诊时可在底部输入框打字或语音提问。\n大模型：在 claude.ai 中打开时由 Claude 扮演患者；独立部署时可在“设置”中填写兼容 OpenAI 格式的接口；都不可用时自动使用预设脚本对话。\n评分与数据：每一步自动按 100 分量表计分，第 8 步可查看明细、生成 AI 反馈、复制训练数据。', 344, 510, { size: 23, maxW: 1210, lh: 36 });
  btn('start', 320, 780, 360, 80, '开始训练：进入问诊', () => go('interview'), { st: 'primary', size: 28, bold: true });
  text('病例为教学虚构，不对应真实患者；标【待审核】的医学数值以病例文档为准，待带教老师确认。', 710, 806, { size: 20, color: C.sub, maxW: 860 });
}

function vInterview() {
  const el = S.qStart ? Math.floor((now() - S.qStart) / 1000) : 0, mm = String(Math.floor(el / 60)).padStart(2, '0'), ss = String(el % 60).padStart(2, '0');
  title('问诊 · AI 标准化病人', `用时 ${mm}:${ss} / 12:00　难度 ${S.level}　${modeName()}${S.busy ? '　患者思考中…' : ''}`);
  if (el > 720) text('已超过 12 分钟上限', 1300, 34, { size: 22, color: C.bad });
  const bx = 320, by = 110, bw = 1260, bh = 380; card(bx, by, bw, bh, '#f4f6f9');
  ctx.save(); rr(ctx, bx, by, bw, bh, 14); ctx.clip();
  let y = by + bh - 16; const msgs = S.chat.slice(0, S.chat.length - S.chatScroll);
  if (!msgs.length) text('从下方问题卡选择提问，或在电脑底部输入框中自由提问。患者只回答你问到的内容。', bx + 30, by + 30, { size: 24, color: C.sub, maxW: 1100 });
  for (let i = msgs.length - 1; i >= 0 && y > by; i--) {
    const m = msgs[i], doc = m.who === 'doc', maxW = 900, n = measureLines(m.text, 25, maxW - 40), h = n * 36 + 26;
    const tw = Math.min(maxW, (() => { ctx.font = '25px ' + FONT; return Math.max(...String(m.text).split('\n').map(l => ctx.measureText(l).width)) + 44; })());
    const x = doc ? bx + bw - 24 - tw : bx + 24; y -= h;
    ctx.fillStyle = doc ? C.blue : '#fff'; rr(ctx, x, y, tw, h, 16); ctx.fill(); if (!doc) { ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke(); }
    text(m.text, x + 20, y + 13, { size: 25, color: doc ? '#fff' : C.ink, maxW: tw - 40, lh: 36 });
    y -= 12;
  }
  ctx.restore();
  let x = 320; const yb = 504;
  ['L1', 'L2', 'L3'].forEach(l => { btn('lv' + l, x, yb, 92, 52, l, () => { S.level = l; log('level', { l }); render(); }, { st: S.level === l ? 'sel' : 'ghost' }); x += 100; });
  if (AI.tts) { btn('tts', x, yb, 150, 52, S.tts ? '朗读：开' : '朗读：关', () => { S.tts = !S.tts; if (!S.tts) AI.tts.stop?.(); render(); }, { st: S.tts ? 'sel' : 'ghost' }); x += 158; }
  btn('up', x, yb, 110, 52, '上翻', () => { S.chatScroll = Math.min(S.chat.length - 1, S.chatScroll + 2); render(); }, { dis: S.chat.length < 3 }); x += 118;
  btn('down', x, yb, 110, 52, '下翻', () => { S.chatScroll = Math.max(0, S.chatScroll - 2); render(); }, { dis: !S.chatScroll }); x += 118;
  btn('hint', x, yb, 190, 52, S.level === 'L3' ? '无提示（L3）' : '查看遗漏', () => { S.hintShown = !S.hintShown; render(); }, { dis: S.level === 'L3' });
  btn('toexam', 1390, yb, 190, 52, '结束问诊 →', () => go('exam'), { st: 'primary' });
  const used = new Set(S.chat.filter(m => m.card).map(m => m.card));
  QUESTIONS.forEach((q, i) => {
    const cx = 320 + (i % 4) * 317, cy = 572 + Math.floor(i / 4) * 56;
    btn('q-' + q.id, cx, cy, 309, 50, q.s, () => ask(q.q, q), { size: 22, st: used.has(q.id) ? 'sel' : 'ghost', dis: S.busy });
  });
  if (S.hintShown && S.level !== 'L3') {
    const miss = RUBRIC[0][3].filter(([id]) => (scores()[id] || 0) < RUBRIC[0][3].find(r => r[0] === id)[2]).map(r => r[1].replace(/（.*?）/g, ''));
    card(320, 110, 1260, 120, '#fff7e0'); text('尚未覆盖：' + (miss.join('；') || '全部已覆盖'), 340, 126, { size: 22, color: C.warn, maxW: 1220, lines: 3, lh: 32 });
  }
}

function vExam() {
  const E = S.exam;
  title('查体', '先向患者说明并取得同意，选择体位、暴露双下肢，再点选部位（面板按钮或患者身上的青色圆点）。');
  btn('consent', 320, 110, 300, 60, E.consent ? '已说明并取得同意 ✓' : '向患者说明并取得同意', () => { E.consent = true; if (E.consentFirst == null) E.consentFirst = true; log('consent'); setBubble('好的医生，你检查吧。'); render(); }, { st: E.consent ? 'ok' : 'ghost' });
  btn('stand', 640, 110, 170, 60, '站立位', () => setPosture('stand'), { st: E.posture === 'stand' ? 'sel' : 'ghost' });
  btn('lie', 820, 110, 170, 60, '卧位', () => setPosture('lie'), { st: E.posture === 'lie' ? 'bad' : 'ghost' });
  btn('expose', 1010, 110, 420, 60, E.exposed ? '已暴露双下肢至腹股沟 ✓' : '暴露双下肢至腹股沟', () => { E.exposed = true; pants.visible = false; log('expose'); go('exam'); }, { st: E.exposed ? 'ok' : 'ghost' });
  const ready = E.exposed && E.posture === 'stand';
  EXAM.forEach((e, i) => { const x = 320 + (i % 4) * 317, y = 186 + Math.floor(i / 4) * 60; btn('ex-' + e.id, x, y, 309, 52, e.label, () => examine(e.id), { size: 22, st: E.found.has(e.id) ? 'sel' : 'ghost', dis: !ready && !['vitals', 'general'].includes(e.id) }); });
  card(320, 372, 1260, 120, '#f4f6f9');
  const last = EXAM.find(e => e.id === E.last);
  if (last) { text(last.label, 340, 386, { size: 22, w: '700', color: C.teal }); text(last.r, 340, 418, { size: 23, maxW: 1220, lines: 2, lh: 33 }); }
  else text(ready ? '点选查体部位查看结果。' : (E.posture === 'lie' ? '卧位时曲张静脉排空，难以观察，请改为站立位。' : '完成体位与暴露后可进行局部查体。'), 340, 410, { size: 23, color: C.sub });
  testBox('trend', 320, 508); testBox('perthes', 960, 508);
}
function setPosture(p) { const E = S.exam; if (!E.posture && p === 'lie') E.postureWrong = true; E.posture = p; log('posture', { p }); if (p === 'lie') notify('卧位时静脉曲张会排空，必须站立位视诊', 'bad'); go('exam'); }
function examine(id) {
  const E = S.exam; if (E.consentFirst == null && !['vitals', 'general'].includes(id)) E.consentFirst = false;
  E.found.add(id); E.last = id; log('exam', { id }); render();
}
function testBox(key, x, y) {
  const T = TESTS[key], st = S.tests[key], w = 620, ready = S.exam.exposed && S.exam.posture === 'stand';
  card(x, y, w, 400); text(T.name, x + 20, y + 14, { size: 24, w: '700', maxW: w - 40, lines: 1 });
  if (!ready) { text('完成站立位与暴露后开始。', x + 20, y + 60, { size: 22, color: C.sub }); return; }
  if (st.k < 4) {
    text(`按正确顺序选择第 ${st.k + 1} 步（错误 ${st.err} 次）`, x + 20, y + 54, { size: 21, color: C.sub });
    seeded(T.steps, key === 'trend' ? 7 : 11).forEach(([s, i], j) => btn(`t-${key}-${i}`, x + 20, y + 90 + j * 74, w - 40, 64, s, () => testStep(key, i), { size: 22, st: i < st.k ? 'ok' : 'ghost', dis: i < st.k, left: true }));
  } else {
    text('结果：' + T.result, x + 20, y + 54, { size: 22, color: C.teal, maxW: w - 40, lh: 30 });
    text('判读：', x + 20, y + 124, { size: 22, w: '700' });
    T.opts.forEach((o, i) => btn(`ta-${key}-${i}`, x + 20, y + 160 + i * 74, w - 40, 64, o, () => { if (st.ans != null) return; st.ans = i; log('test_ans', { key, i }); notify(i === T.ok ? '判读正确' : '判读错误：正确为“' + T.opts[T.ok] + '”', i === T.ok ? 'ok' : 'bad'); }, { size: 22, left: true, st: st.ans == null ? 'ghost' : i === T.ok ? 'ok' : i === st.ans ? 'bad' : 'ghost' }));
  }
}
function testStep(key, i) {
  const st = S.tests[key];
  if (i !== st.k) { st.err++; log('test_err', { key, i }); notify('顺序不对，请想想这一步之前需要先做什么', 'warn'); return; }
  st.k++; log('test_step', { key, k: st.k });
  if (key === 'trend') { if (st.k === 1) fillVeins(1, 0.05, 900); if (st.k === 2) tourniquet.visible = true; if (st.k === 4) { tourniquet.visible = false; fillVeins(0.05, 1, 2200); } }
  else { if (st.k === 1) fillVeins(0.3, 1, 600); if (st.k === 2) tourniquet.visible = true; if (st.k === 3) { bounce(); fillVeins(1, 0.35, 2400); } if (st.k === 4) setTimeout(() => { tourniquet.visible = false; fillVeins(0.35, 1, 800); }, 2500); }
  render();
}
function bounce() { const y0 = body.position.y; tween(2400, (k) => { body.position.y = y0 + Math.abs(Math.sin(k * Math.PI * 6)) * 0.04; }, () => body.position.y = y0); }

function vOrders() {
  title('开具检查', '勾选需要的检查后提交。必选检查开对后，超声结果才会释放。');
  ORDERS.forEach((o, i) => {
    const y = 110 + i * 92, on = S.orders.has(o.id);
    btn('o-' + o.id, 320, y, 760, 80, (on ? '☑ ' : '☐ ') + o.label, () => { if (S.ordersDone) return; on ? S.orders.delete(o.id) : S.orders.add(o.id); render(); }, { left: true, size: 23, st: on ? 'sel' : 'ghost' });
    if (S.ordersDone && on) { text(o.r, 1100, y + 8, { size: 22, maxW: 470, lines: 1, color: C.teal }); text(o.c, 1100, y + 42, { size: 20, maxW: 470, lines: 1, color: /不合理|不必要/.test(o.c) ? C.bad : C.sub }); }
  });
  if (!S.ordersDone) btn('osub', 320, 680, 300, 72, '提交检查单', () => { S.ordersDone = true; log('orders', { list: [...S.orders] }); notify(S.orders.has('duplex') ? '超声结果已释放' : '未开静脉超声，无法完成判读（关键项）', S.orders.has('duplex') ? 'ok' : 'bad'); }, { st: 'primary', size: 26, bold: true });
  else { btn('oredo', 320, 680, 260, 72, '修改检查单', () => { S.ordersDone = false; render(); }); if (S.orders.has('duplex')) btn('ous', 600, 680, 300, 72, '进入超声判读 →', () => go('us'), { st: 'primary', size: 26 }); }
}

// ----- 超声图像（程序生成） -----
const speck = document.createElement('canvas'); speck.width = 700; speck.height = 360;
{ const c = speck.getContext('2d'), img = c.createImageData(700, 360); let s = 12345; for (let i = 0; i < 700 * 360; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; const y = Math.floor(i / 700); const base = 38 + 40 * Math.exp(-((y - 60) ** 2) / 4000) + (y > 250 ? 25 : 0); const v = base + ((s >> 8) % 60) - 25; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.max(0, Math.min(255, v)); img.data[i * 4 + 3] = 255; } c.putImageData(img, 0, 0); }
function vesselsFor(seg) {
  const d = (seg.d || 5) / 7;
  switch (seg.kind) {
    case 'sfj': case 'cfv': return [{ id: 'cfv', n: '股总静脉', x: 0.5, y: 0.6, rx: 0.13, ry: 0.11, v: 1 }, { id: 'cfa', n: '股总动脉', x: 0.74, y: 0.55, rx: 0.075, ry: 0.075, a: 1 }, { id: 'gsv', n: '大隐静脉', x: 0.3, y: 0.36, rx: 0.07, ry: 0.05, v: 1, sup: 1 }];
    case 'gsv': return [{ id: 'gsv', n: seg.id === 'ssv' ? '小隐静脉' : '大隐静脉', x: 0.5, y: 0.36, rx: 0.07 * d + 0.02, ry: 0.05 * d + 0.012, v: 1, sup: 1, eye: 1 }, { id: 'fv', n: '深静脉', x: 0.48, y: 0.82, rx: 0.06, ry: 0.045, v: 1 }, { id: 'fa', n: '动脉', x: 0.62, y: 0.8, rx: 0.04, ry: 0.04, a: 1 }];
    case 'trib': return [0.25, 0.45, 0.65].map((x, i) => ({ id: 't' + i, n: i === 1 ? '曲张属支' : '', x, y: 0.25 + i * 0.03, rx: 0.06, ry: 0.035, v: 1, sup: 1 }));
    case 'perf': return [{ id: 'pv', n: '穿通静脉', x: 0.5, y: 0.52, rx: 0.025, ry: 0.16, v: 1 }, { id: 'gsv', n: '浅静脉', x: 0.5, y: 0.28, rx: 0.06, ry: 0.04, v: 1, sup: 1 }];
    case 'deep': return [{ id: 'fv', n: '股/腘静脉', x: 0.45, y: 0.6, rx: 0.1, ry: 0.08, v: 1 }, { id: 'fa', n: '动脉', x: 0.65, y: 0.56, rx: 0.06, ry: 0.06, a: 1 }];
    case 'calf': return [{ id: 'p1', n: '胫后静脉', x: 0.38, y: 0.6, rx: 0.05, ry: 0.035, v: 1 }, { id: 'p2', n: '', x: 0.58, y: 0.6, rx: 0.05, ry: 0.035, v: 1 }, { id: 'pa', n: '胫后动脉', x: 0.48, y: 0.6, rx: 0.03, ry: 0.03, a: 1 }, { id: 'mv', n: '肌间静脉', x: 0.5, y: 0.3, rx: 0.07, ry: 0.04, v: 1 }];
  }
  return [];
}
function drawUS(x, y, w, h, seg, o = {}) {
  ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h);
  const ih = h - (o.spec ? 130 : 0);
  ctx.drawImage(speck, 0, 0, 700, 360, x, y, w, ih);
  const vs = vesselsFor(seg);
  if (vs.some(v => v.eye) || o.fascia) { ctx.strokeStyle = 'rgba(235,235,235,0.9)'; ctx.lineWidth = 5; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + 0.15 * w, y + 0.36 * ih); ctx.quadraticCurveTo(x + 0.5 * w, y + (0.36 + s * 0.2) * ih, x + 0.85 * w, y + 0.36 * ih); ctx.stroke(); } }
  ctx.fillStyle = 'rgba(230,230,230,0.8)'; ctx.fillRect(x, y + 6, w, 4);
  if (seg.kind === 'sfj') { ctx.fillStyle = '#050505'; ctx.beginPath(); ctx.moveTo(x + 0.33 * w, y + 0.4 * ih); ctx.lineTo(x + 0.42 * w, y + 0.5 * ih); ctx.lineTo(x + 0.38 * w, y + 0.56 * ih); ctx.lineTo(x + 0.27 * w, y + 0.42 * ih); ctx.fill(); }
  for (const v of vs) {
    const cx = x + v.x * w, cy = y + v.y * ih, rx = v.rx * w, ry = v.ry * ih * (o.comp && v.v ? 0.12 : 1);
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    if (o.dop && !o.comp) { const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, Math.max(rx, ry)); const refl = v.v && seg.rx > 0.5 && (v.sup || seg.kind === 'trib'); const col = v.a ? ['#ffd2c4', '#d1261b'] : refl ? ['#cfe0ff', '#1546c9'] : v.v ? ['#ffd8b0', '#c2302a'] : ['#222', '#111']; g.addColorStop(0, col[0]); g.addColorStop(1, col[1]); ctx.fillStyle = g; }
    else ctx.fillStyle = '#060606';
    ctx.fill(); ctx.strokeStyle = 'rgba(200,200,200,0.75)'; ctx.lineWidth = 3; ctx.stroke();
    const showLabel = o.labels || (o.found && o.found.has(v.id));
    if (showLabel && v.n) { ctx.font = '20px ' + FONT; ctx.fillStyle = '#ffe9a8'; ctx.fillText(v.n, cx - rx, cy - ry - 26); }
    if (o.onHit) hitArea('us-' + v.id, cx - rx, cy - Math.max(ry, 14), rx * 2, Math.max(ry, 14) * 2, () => o.onHit(v.id));
  }
  if (o.onHit && seg.kind === 'sfj') hitArea('us-sfj', x + 0.33 * w, y + 0.42 * ih, 0.08 * w, 0.12 * ih, () => o.onHit('sfj'));
  if (o.onHit && o.fascia) hitArea('us-fascia', x + 0.15 * w, y + 0.12 * ih, 0.7 * w, 0.1 * ih, () => o.onHit('fascia'));
  ctx.font = '18px ' + FONT; ctx.fillStyle = '#9fe0a8'; ctx.fillText('L  ' + seg.label + (o.comp ? '  压迫' : '') + (o.dop ? '  彩色多普勒' : ''), x + 12, y + 16);
  if (o.spec) {
    const sy = y + ih, sh = 130; ctx.fillStyle = '#0b0b0b'; ctx.fillRect(x, sy, w, sh); const base = sy + 58;
    ctx.strokeStyle = '#4a4a4a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x + w, base); ctx.stroke();
    for (let s = 0; s <= 4; s++) { ctx.fillStyle = '#777'; ctx.fillText(s + 's', x + 20 + s * (w - 40) / 4, sy + sh - 22); }
    if (o.dop) {
      const px = (t) => x + 20 + t * (w - 40) / 4; ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 2; ctx.beginPath();
      for (let t = 0; t <= 4; t += 0.01) { let v = 0; if (seg.phasic && t < 0.5) v = 10 + 8 * Math.sin(t * 20); else if (t < 0.5) v = 4; else if (t < 0.8) v = 38 * Math.sin((t - 0.5) / 0.3 * Math.PI); else if (t < 0.8 + seg.rx) v = -26 * Math.sin(Math.min(1, (t - 0.8) / 0.25) * Math.PI / 2) * (1 - Math.max(0, (t - 0.8 - seg.rx + 0.2) / 0.2)); else if (seg.phasic) v = 8 + 6 * Math.sin(t * 6); const yy = base - v; t === 0 ? ctx.moveTo(px(t), yy) : ctx.lineTo(px(t), yy); }
      ctx.stroke();
      if (seg.rx > 0) { ctx.fillStyle = 'rgba(80,140,255,0.25)'; ctx.fillRect(px(0.8), base, px(0.8 + seg.rx) - px(0.8), 34); ctx.fillStyle = '#9fc0ff'; ctx.font = '20px ' + FONT; ctx.fillText('反流 ' + (seg.rxt || seg.rx + ' s'), px(0.8 + seg.rx) + 8, base + 8); }
      ctx.fillStyle = '#ccc'; ctx.fillText(seg.phasic ? 'Valsalva · 呼吸期波形' : '远端挤压 / Valsalva', x + 20, sy + 8);
    } else { ctx.fillStyle = '#777'; ctx.fillText('频谱：点击“Valsalva / 挤压”', x + 20, sy + 8); }
  }
}
function vUS() {
  const U = S.us, seg = SEGS.find(s => s.id === U.seg);
  title('超声判读 · 双下肢静脉彩色多普勒', '左侧选择节段，可压迫探头看是否压闭，可做 Valsalva / 远端挤压看反流。');
  drawUS(320, 110, 700, 520, seg, { spec: true, comp: U.comp, dop: U.dop, labels: U.labels });
  btn('comp', 320, 646, 220, 58, U.comp ? '松开探头' : '探头加压', () => { U.comp = !U.comp; U.dop = false; render(); }, { st: U.comp ? 'sel' : 'ghost' });
  btn('dop', 552, 646, 260, 58, 'Valsalva / 挤压', () => { U.dop = true; U.comp = false; render(); }, { st: U.dop ? 'sel' : 'ghost' });
  btn('lab', 824, 646, 196, 58, U.labels ? '隐藏标注' : '显示标注', () => { U.labels = !U.labels; render(); });
  card(320, 718, 700, 190, '#f4f6f9');
  if (U.viewed.has(seg.id) && (U.dop || U.comp)) text(seg.t, 340, 732, { size: 22, maxW: 660, lh: 32, lines: 5 });
  else text('加压或做 Valsalva / 挤压后显示该节段的报告描述。', 340, 732, { size: 22, color: C.sub, maxW: 660 });
  if (U.dop || U.comp) U.viewed.add(seg.id);
  SEGS.forEach((s, i) => btn('seg-' + s.id, 1040 + (i % 2) * 274, 110 + Math.floor(i / 2) * 60, 266, 52, s.label + (U.viewed.has(s.id) ? ' ✓' : ''), () => { U.seg = s.id; U.comp = U.dop = false; log('us_seg', { id: s.id }); render(); }, { size: 21, st: U.seg === s.id ? 'primary' : U.viewed.has(s.id) ? 'sel' : 'ghost' }));
  let y = 420;
  US_Q.forEach(q => {
    text(q.q, 1040, y, { size: 22, w: '700', maxW: 540 }); y += 36;
    q.opts.forEach((o, i) => { const a = U.ans[q.id]; btn(`uq-${q.id}-${i}`, 1040, y, 540, 62, o, () => { if (a != null) return; U.ans[q.id] = i; log('us_ans', { q: q.id, i }); notify(i === q.ok ? '判读正确' : '判读有误', i === q.ok ? 'ok' : 'bad'); }, { size: 20, left: true, st: a == null ? 'ghost' : i === q.ok ? 'ok' : i === a ? 'bad' : 'ghost' }); y += 68; });
    y += 14;
  });
}

function optRow(id, x, y, w, opts, sel, fn, o = {}) { const gw = (w - (opts.length - 1) * 10) / opts.length; opts.forEach((t, i) => btn(`${id}-${i}`, x + i * (gw + 10), y, gw, o.h || 56, t, () => fn(i), { size: o.size || 22, st: o.mark ? o.mark(i) : (sel instanceof Set ? sel.has(i) : sel === i) ? 'sel' : 'ghost' })); }
function vDx() {
  const D = S.dx, lock = D.done;
  title('诊断决策', lock ? '已提交，绿色为参考答案。' : '依次完成三页后提交。');
  ['诊断与 CEAP', '鉴别诊断', '治疗决策'].forEach((t, i) => btn('dxt' + i, 320 + i * 250, 106, 240, 54, t, () => { D.tab = i; render(); }, { st: D.tab === i ? 'primary' : 'ghost' }));
  const pick = (k) => (i) => { if (lock) return; D[k] = i; log('dx', { k, i }); render(); };
  const tog = (k) => (i) => { if (lock) return; D[k].has(i) ? D[k].delete(i) : D[k].add(i); render(); };
  const mk = (k, set) => lock ? (i) => { const ok = set ? DX[k].good.includes(i) : (k === 'tx' ? i === 0 : i === DX[k].ok); const chosen = set ? D[k].has(i) : D[k] === i; return ok ? 'ok' : chosen ? 'bad' : 'ghost'; } : null;
  if (D.tab === 0) {
    text(DX.diag.q, 320, 180, { size: 24, w: '700' });
    DX.diag.opts.forEach((o, i) => btn('dg' + i, 320 + (i % 2) * 635, 220 + Math.floor(i / 2) * 66, 625, 58, o, () => pick('diag')(i), { size: 22, st: mk('diag') ? mk('diag')(i) : D.diag === i ? 'sel' : 'ghost' }));
    let y = 430; for (const k of ['C', 'E', 'A', 'P']) { text(DX[k].q, 320, y + 14, { size: 22, w: '700' }); optRow('ce' + k, 560, y, 1020, DX[k].opts, D[k], pick(k), { mark: mk(k) }); y += 72; }
    btn('dxn1', 1330, 840, 250, 64, '下一页 →', () => { D.tab = 1; render(); }, { st: 'primary' });
  } else if (D.tab === 1) {
    text(DX.ddx.q + '　已选 ' + D.ddx.size, 320, 180, { size: 24, w: '700' });
    DX.ddx.opts.forEach((o, i) => { const y = 220 + Math.floor(i / 2) * 84; btn('dd' + i, 320 + (i % 2) * 635, y, 625, 74, o, () => tog('ddx')(i), { size: 22, st: mk('ddx', 1) ? mk('ddx', 1)(i) : D.ddx.has(i) ? 'sel' : 'ghost' }); });
    if (lock) text('排除依据：' + DX.ddx.why.map((w, i) => DX.ddx.opts[i].replace(/（.*?）/, '') + '——' + w).join('；'), 320, 570, { size: 20, color: C.sub, maxW: 1260, lh: 30, lines: 9 });
    btn('dxn2', 1330, 840, 250, 64, '下一页 →', () => { D.tab = 2; render(); }, { st: 'primary' });
  } else {
    text(DX.tx.q, 320, 172, { size: 23, w: '700' });
    DX.tx.opts.forEach((o, i) => btn('tx' + i, 320 + (i % 2) * 635, 206 + Math.floor(i / 2) * 62, 625, 54, o, () => pick('tx')(i), { size: 20, st: mk('tx') ? mk('tx')(i) : D.tx === i ? 'sel' : 'ghost' }));
    text(DX.contra.q, 320, 400, { size: 23, w: '700' });
    DX.contra.opts.forEach((o, i) => btn('ct' + i, 320 + (i % 3) * 423, 434 + Math.floor(i / 3) * 60, 413, 52, o, () => tog('contra')(i), { size: 20, st: mk('contra', 1) ? mk('contra', 1)(i) : D.contra.has(i) ? 'sel' : 'ghost' }));
    text(DX.post.q, 320, 630, { size: 23, w: '700' });
    DX.post.opts.forEach((o, i) => btn('po' + i, 320 + (i % 3) * 423, 664 + Math.floor(i / 3) * 60, 413, 52, o, () => tog('post')(i), { size: 20, st: mk('post', 1) ? mk('post', 1)(i) : D.post.has(i) ? 'sel' : 'ghost' }));
    if (!lock) btn('dxsub', 1300, 840, 280, 64, '提交决策', () => { const miss = ['diag', 'C', 'E', 'A', 'P', 'tx'].filter(k => D[k] == null); if (miss.length) { notify('还有未选择的项目：' + miss.map(k => (DX[k].q || k).replace(/（.*?）/, '')).join('、'), 'warn'); return; } D.done = true; log('dx_submit', { D: JSON.stringify({ ...D, ddx: [...D.ddx], contra: [...D.contra], post: [...D.post] }) }); notify('已提交，可切换三页查看参考答案', 'ok'); }, { st: 'primary', size: 26, bold: true });
    else btn('dxgo', 1300, 840, 280, 64, '告知患者 →', () => go('talk'), { st: 'primary' });
  }
}

function vTalk() {
  const T = S.talk;
  title('告知患者', '回到诊室，患者追问四个问题。请选择最合适的回答：既准确，又让患者听得懂。');
  if (T.i >= TALK.length) {
    card(320, 120, 1260, 300, '#f4f6f9'); const g = T.ans.filter(k => k === 'good').length, j = T.ans.filter(k => k === 'jargon').length;
    text(`完成：通俗准确 ${g} / 4，术语堆砌 ${j} 次。`, 350, 150, { size: 28, w: '700' });
    text('示范通俗说法：“腿上血管里的小门关不严了，血往回流。”术语要换成患者能懂的话；不要为了安慰而作出“保证不复发”之类不准确的承诺。', 350, 210, { size: 24, maxW: 1200, lh: 36 });
    btn('tsurg', 320, 460, 320, 70, '进入热消融手术 →', () => go('surg'), { st: 'primary', size: 26 });
    btn('tredo', 660, 460, 220, 70, '重新作答', () => { T.i = 0; T.ans = []; render(); });
    return;
  }
  const q = TALK[T.i];
  card(320, 120, 1260, 110, '#fff'); ctx.strokeStyle = C.line; ctx.lineWidth = 2; rr(ctx, 320, 120, 1260, 110, 14); ctx.stroke();
  text(`患者（${T.i + 1}/4）：`, 344, 140, { size: 22, color: C.sub }); text(q.q, 344, 174, { size: 30, w: '700' });
  q.opts.forEach((o, i) => btn('ta' + i, 320, 260 + i * 150, 1260, 136, o.t, () => {
    T.ans.push(o.k); log('talk', { i: T.i, k: o.k });
    const r = o.k === 'good' ? ['患者放松下来：“这样我就放心多了。”', 'ok'] : o.k === 'jargon' ? ['患者皱眉：“医生，你说的我听不太懂……”', 'warn'] : ['患者更担心了：“真的吗？我还是有点怕……”', 'bad'];
    setBubble(r[0].split('：')[1].replace(/[“”]/g, '')); notify(r[0], r[1]); T.i++; if (T.i < TALK.length) { setBubble(TALK[T.i].q); speak(TALK[T.i].q); } render();
  }, { size: 24, left: true }));
  if (T.i === 0 && !T.spoken) { T.spoken = 1; setBubble(q.q); }
}

// ----- 手术 -----
const stepOrder = seeded(STEPS.map(s => s.name), 23);
function surgPick(i) {
  const G = S.surg; if (G.cur >= 0 && !G.sub.complete) { notify('请先完成当前步骤：' + STEPS[G.cur].name, 'warn'); return; }
  const next = G.done.length;
  if (i !== next) {
    G.orderErr++; G.wrongHere++; log('surg_order_err', { pick: i, expect: next });
    if (G.wrongHere >= 2) { G.fb = '后果：' + STEPS[i].warn + '　已自动进入正确步骤：' + STEPS[next].name; notify('顺序再次错误，播放后果并进入正确步骤', 'bad'); startStep(next); }
    else { G.fb = '顺序警示：' + STEPS[i].name + ' 不是下一步。想一想此前还缺什么。'; notify('顺序不对（警示一次）', 'warn'); }
    render(); return;
  }
  startStep(i);
}
function startStep(i) { const G = S.surg; G.cur = i; G.wrongHere = 0; G.sub = {}; G.multi = new Set(); G.seqK = 0; G.anatK = 0; G.fb = G.fb && G.fb.startsWith('后果') ? G.fb : ''; log('surg_step', { i }); hotspots.forEach(h => h.visible = h.userData.kind === 'surg' && i === 3); render(); }
function completeStep(fb) { const G = S.surg; G.sub.complete = true; G.done.push(G.cur); G.fb = '✓ ' + fb; after3D(G.cur); hotspots.forEach(h => { if (h.userData.kind === 'surg') h.visible = false; }); render(); }
function after3D(i) {
  if (i === 2) { /* 体位已为仰卧 */ }
  if (i === 4) setCatheter(U_KNEE - 0.08);
  if (i === 5) { const u = 0.035; let k0 = U_KNEE - 0.08; tween(1200, (k) => setCatheter(k0 + (u - k0) * k)); }
  if (i === 6) { halo.geometry.dispose(); halo.geometry = tubeAlong(0.02, U_KNEE + 0.02, 0.016); halo.visible = true; }
  if (i === 7) { const r0 = patient.rotation.x; tween(600, (k) => patient.rotation.z = -0.12 * k); const segs = veinSegs.filter(s => s.userData.u1 > 0.03 && s.userData.u0 < U_KNEE); tween(3200, (k) => { segs.forEach((s, j) => { if (k > j / segs.length) { s.userData.abl = 1; paintVein(s); } }); setCatheter(0.035 + (U_KNEE - 0.035) * k); }, () => { catheter.visible = false; halo.visible = false; tween(600, (k) => patient.rotation.z = -0.12 * (1 - k)); }); }
  if (i === 8) tribs.forEach(t => { t.userData.abl = 1; paintVein(t); });
  if (i === 9) bandages.forEach((b, j) => setTimeout(() => b.visible = true, j * 140));
}
function restoreSurg3D() {
  const d = S.surg.done; [...veinSegs, ...tribs].forEach(s => { s.userData.abl = 0; setFill(s, 1); }); catheter.visible = halo.visible = false; bandages.forEach(b => b.visible = false);
  if (d.includes(4) && !d.includes(7)) setCatheter(d.includes(5) ? 0.035 : U_KNEE - 0.08);
  if (d.includes(6) && !d.includes(7)) { halo.geometry.dispose(); halo.geometry = tubeAlong(0.02, U_KNEE + 0.02, 0.016); halo.visible = true; }
  if (d.includes(7)) veinSegs.forEach(s => { if (s.userData.u1 > 0.03 && s.userData.u0 < U_KNEE) { s.userData.abl = 1; paintVein(s); } });
  if (d.includes(8)) tribs.forEach(t => { t.userData.abl = 1; paintVein(t); });
  if (d.includes(9)) bandages.forEach(b => b.visible = true);
}
function surgAnswer(i) {
  const G = S.surg, st = STEPS[G.cur];
  if (G.sub.complete) return;
  if (st.task === 'choice' || (st.task === 'anat' && G.anatK >= 4)) {
    const first = G.sub.tries == null; G.sub.tries = (G.sub.tries || 0) + 1;
    if (G.cur === 5 && first) G.risk.tip = i === 0;
    if (i === st.ok) completeStep(st.fb); else { G.fb = '✗ ' + (G.cur === 5 ? '头端太靠近或进入股静脉 → 内热诱导血栓（EHIT）/ DVT 风险。' : '不正确，请再选择。'); if (G.cur === 5 && i >= 0) setCatheter(st.tip[i]); render(); }
  }
}
const ANAT = [['gsv', '大隐静脉'], ['cfv', '股总静脉'], ['sfj', '隐股交界（SFJ）'], ['fascia', '隐筋膜']];
function vSurg() {
  const G = S.surg;
  title('腔内热消融术（射频 RFA）流程认知', '左侧按顺序选择下一步（顺序错误先警示一次，再错播放后果），右侧完成该步操作。');
  stepOrder.forEach(([n, i], j) => { const d = G.done.includes(i); btn('sp' + i, 320, 106 + j * 70, 430, 62, (d ? (i + 1) + '. ' : '') + n + (d ? ' ✓' : ''), () => surgPick(i), { size: 22, left: true, st: d ? 'ok' : G.cur === i ? 'primary' : 'ghost', dis: d }); });
  text('顺序错误 ' + G.orderErr + ' 处', 320, 884, { size: 20, color: G.orderErr ? C.bad : C.sub });
  const X = 780, Wd = 800;
  if (G.fb) { card(X, 830, Wd, 80, G.fb.startsWith('✓') ? C.okSoft : G.fb.startsWith('后果') ? C.badSoft : '#fff1d6'); text(G.fb, X + 18, 842, { size: 21, maxW: Wd - 36, lines: 2, lh: 30, color: G.fb.startsWith('✓') ? C.ok : G.fb.startsWith('后果') ? C.bad : C.warn }); }
  if (G.cur < 0) { text('从左侧选择第一步开始。患者已仰卧在手术台上（左下肢），可转身查看 3D 模型。', X, 120, { size: 24, color: C.sub, maxW: Wd }); return; }
  if (G.done.length >= 11) { card(X, 110, Wd, 220, C.okSoft); text('11 步全部完成', X + 24, 130, { size: 32, w: '700', color: C.ok }); text('术后当天下床行走；72 小时至 1 周内超声复查 EHIT / DVT 与闭合情况；1、3、12 个月随访。', X + 24, 186, { size: 23, maxW: Wd - 48, lh: 34 }); btn('torep', X + 24, 250, 300, 60, '查看评分报告 →', () => go('report'), { st: 'primary' }); return; }
  const st = STEPS[G.cur];
  text(`第 ${G.cur + 1} 步　${st.name}`, X, 110, { size: 30, w: '700', maxW: Wd });
  let y = 160;
  if (st.task === 'anat' && G.anatK < 4) {
    const [id, nm] = ANAT[G.anatK];
    text(`超声标记：请在图中点击「${nm}」（${G.anatK + 1}/4）`, X, y, { size: 23, color: C.teal }); y += 40;
    const seg = G.anatK < 3 ? SEGS[0] : SEGS[1];
    drawUS(X, y, 640, 380, seg, { found: G.sub.found || (G.sub.found = new Set()), fascia: G.anatK === 3, onHit: (h) => { if (h === id) { if (!G.sub.miss) G.anatOk++; G.sub.miss = false; G.sub.found.add(h); G.anatK++; log('anat', { id, ok: true }); notify('正确：' + nm, 'ok'); } else { G.sub.miss = true; G.anatErr++; log('anat', { id, ok: false, h }); notify('不是' + nm + '，再找找', 'warn'); } } });
    hitArea('us-miss', X, y, 640, 380, () => { G.sub.miss = true; G.anatErr++; notify('不是' + nm + '，再找找', 'warn'); });
    hits.push(hits.splice(hits.findIndex(h => h.id === 'us-miss'), 1)[0]); hits.unshift(hits.pop());
    return;
  }
  if (st.task === 'spot') { text(st.q + '。也可点下方按钮：', X, y, { size: 23, maxW: Wd }); y += 80; SURG_SPOTS.forEach(([id, lb], i) => btn('ss' + id, X, y + i * 76, 520, 66, lb, () => surgSpot(id), { size: 24, left: true })); return; }
  if (st.task === 'seq') {
    text(`从器械盘中按顺序拾取器械（已完成 ${G.seqK}/4，错误 ${G.seqErr} 次）`, X, y, { size: 23, maxW: Wd }); y += 50;
    seeded([...st.items, ...st.distract], 5).forEach(([n], j) => btn('sq' + j, X + (j % 3) * 266, y + Math.floor(j / 3) * 110, 252, 96, n, () => {
      if (n === st.items[G.seqK]) { G.seqK++; notify('已拾取：' + n, 'ok'); if (G.seqK >= 4) completeStep(st.fb); else render(); }
      else { G.seqErr++; log('seq_err', { n }); notify(st.items.includes(n) ? '顺序错误：' + n + ' 不是下一件器械' : n + ' 不属于本术式', 'warn'); }
    }, { size: 26, st: st.items.indexOf(n) > -1 && st.items.indexOf(n) < G.seqK ? 'ok' : 'ghost', dis: st.items.indexOf(n) > -1 && st.items.indexOf(n) < G.seqK }));
    return;
  }
  text(st.q, X, y, { size: 24, maxW: Wd, lh: 34 }); y += 34 * measureLines(st.q, 24, Wd) + 16;
  if (st.task === 'multi') {
    st.opts.forEach((o, i) => btn('mu' + i, X, y + i * 74, Wd, 64, (G.multi.has(i) ? '☑ ' : '☐ ') + o, () => { G.multi.has(i) ? G.multi.delete(i) : G.multi.add(i); render(); }, { size: 23, left: true, st: G.multi.has(i) ? 'sel' : 'ghost' }));
    btn('musub', X, y + st.opts.length * 74 + 8, 260, 62, '确认', () => {
      const ok = st.ok.length === G.multi.size && st.ok.every(i => G.multi.has(i)); const first = G.sub.tries == null; G.sub.tries = (G.sub.tries || 0) + 1;
      if (G.cur === 6 && first) G.risk.tum = ok;
      if (ok) completeStep(st.fb); else { G.fb = '✗ 不完全正确，请再想想。' + (G.cur === 6 ? st.warn : ''); render(); }
    }, { st: 'primary' });
    return;
  }
  st.opts.forEach((o, i) => btn('ch' + i, X, y + i * 80, Wd, 70, o, () => surgAnswer(i), { size: 23, left: true }));
}
function surgSpot(id) {
  const G = S.surg; if (G.cur !== 3 || G.sub.complete) return; const first = G.sub.tries == null; G.sub.tries = (G.sub.tries || 0) + 1;
  if (first) G.risk.nerve = id === 'knee';
  log('puncture', { id });
  if (id === 'knee') completeStep(STEPS[3].fb);
  else { G.fb = '✗ ' + ({ ankle: '踝部穿刺：隐神经与大隐静脉在小腿下段紧密伴行，隐神经损伤风险升高。', thigh: '大腿中段穿刺会遗漏膝下段反流。', groin: '腹股沟处离 SFJ 太近，无法完成主干消融。' })[id]; notify('穿刺点不合适', 'bad'); render(); }
}

// ----- 报告 -----
function vReport() {
  const R = S.report, t = totals();
  title('评分报告', `自动评分 ${t.total} / 100（D4 鉴别依据 2 分由教师评分；标 AI+教师 的条目需教师复核）`);
  ['总览', '明细', 'AI 反馈'].forEach((n, i) => btn('rt' + i, 320 + i * 200, 106, 190, 54, n, () => { R.tab = i; render(); }, { st: R.tab === i ? 'primary' : 'ghost' }));
  btn('copy', 1060, 106, 250, 54, '复制训练数据', copyData); btn('reset', 1330, 106, 250, 54, '重新开始', () => { if (R.confirm) location.reload(); else { R.confirm = 1; notify('再点一次“重新开始”确认清空本次记录', 'warn'); } });
  if (R.tab === 0) {
    text(String(t.total), 320, 180, { size: 96, w: '700', color: C.blue }); text('/ 100', 320 + ctx.measureText(String(t.total)).width + 16, 236, { size: 30, color: C.sub });
    RUBRIC.forEach(([L, name, max], i) => { const y = 310 + i * 58, [g] = t.sec[L]; text(`${L}  ${name}`, 320, y + 8, { size: 23 }); ctx.fillStyle = C.soft; rr(ctx, 600, y + 6, 360, 26, 13); ctx.fill(); ctx.fillStyle = g / max >= 0.8 ? C.ok : g / max >= 0.5 ? C.blue : C.bad; rr(ctx, 600, y + 6, Math.max(26, 360 * g / max), 26, 13); ctx.fill(); text(`${g} / ${max}`, 980, y + 6, { size: 23, w: '700' }); });
    const sc = t.sc, stars = RUBRIC.flatMap(r => r[3]).filter(r => r[3] && !r[4] && !(sc[r[0]] > 0));
    const pct = (ids) => Math.round(ids.reduce((a, id) => a + (sc[id] || 0), 0) / ids.reduce((a, id) => a + RUBRIC.flatMap(r => r[3]).find(r => r[0] === id)[2], 0) * 100);
    const risk = ['A5', 'A6', 'A7', 'A8', 'B3'].filter(id => sc[id] > 0).length;
    const ind = [['问诊完整性', pct(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12']) + '%'], ['初步临床推理', pct(['C4', 'C5', 'D1', 'D2', 'D3', 'E1']) + '%'], ['危险信号识别率', Math.round(risk / 5 * 100) + '%'], ['合理检查选择率', pct(['C1', 'C2', 'C3']) + '%'], ['手术流程理解度', pct(['F1', 'F2', 'F3', 'E2', 'E3']) + '%'], ['问诊视线朝向患者', S.gaze[1] ? Math.round(S.gaze[0] / S.gaze[1] * 100) + '%' : '—']];
    card(1080, 180, 500, 400, '#f4f6f9'); text('申报书评价指标', 1100, 196, { size: 24, w: '700' });
    ind.forEach(([a, b], i) => { text(a, 1100, 246 + i * 52, { size: 22 }); text(b, 1460, 246 + i * 52, { size: 24, w: '700', color: C.blue }); });
    card(1080, 600, 500, 300, stars.length ? C.badSoft : C.okSoft);
    text(stars.length ? `★ 关键项未得分（${stars.length}）` : '★ 关键项均已得分', 1100, 616, { size: 24, w: '700', color: stars.length ? C.bad : C.ok });
    text(stars.map(r => r[0] + ' ' + r[1]).join('\n'), 1100, 660, { size: 21, color: C.bad, maxW: 460, lh: 30, lines: 7 });
  } else if (R.tab === 1) {
    const sc = t.sc; const pages = [RUBRIC.slice(0, 1), RUBRIC.slice(1, 3), RUBRIC.slice(3, 5), RUBRIC.slice(5)]; R.page = Math.min(R.page, 3);
    let y = 180; for (const [L, name, , items] of pages[R.page]) { text(`${L}. ${name}`, 320, y, { size: 24, w: '700' }); y += 40; for (const [id, lb, mx, star, teacher] of items) { const g = sc[id] || 0, red = star && !g; text(`${id}${star ? ' ★' : ''}  ${lb}`, 340, y, { size: 21, maxW: 1000, lines: 1, color: red ? C.bad : C.ink }); text(teacher ? '待教师' : `${g} / ${mx}`, 1420, y, { size: 21, w: '700', color: red ? C.bad : g >= mx ? C.ok : C.ink }); y += 34; } y += 16; }
    btn('pp', 320, 850, 180, 56, '上一页', () => { R.page = Math.max(0, R.page - 1); render(); }, { dis: R.page === 0 }); btn('pn', 520, 850, 180, 56, '下一页', () => { R.page++; render(); }, { dis: R.page >= 3 }); text(`${R.page + 1} / 4`, 730, 864, { size: 22, color: C.sub });
  } else {
    if (AI.mode === 'script') { text('当前没有可用的大模型（在 claude.ai 中打开或在设置中填写接口后可用），以下为规则生成的反馈：', 320, 180, { size: 22, color: C.warn, maxW: 1260 }); text(ruleFeedback(t), 320, 230, { size: 23, maxW: 1260, lh: 34, lines: 18 }); return; }
    btn('aigen', 320, 180, 320, 60, R.aiBusy ? '生成中…' : (R.ai ? '重新生成' : '生成 AI 反馈报告'), genFeedback, { st: 'primary', dis: R.aiBusy });
    text(R.ai || ruleFeedback(t), 320, 260, { size: 22, maxW: 1260, lh: 32, lines: 19, color: R.ai ? C.ink : C.sub });
  }
}
function ruleFeedback(t) {
  const sc = t.sc, items = RUBRIC.flatMap(r => r[3]).filter(r => !r[4]).map(r => ({ id: r[0], lb: r[1], mx: r[2], star: r[3], g: sc[r[0]] || 0 }));
  const lost = items.filter(i => i.g < i.mx).sort((a, b) => (b.star || 0) - (a.star || 0) || (b.mx - b.g) - (a.mx - a.g)).slice(0, 8);
  return '主要失分点：\n' + lost.map(i => `· ${i.id}${i.star ? '★' : ''} ${i.lb}（${i.g}/${i.mx}）`).join('\n') + (S.jargonQ ? `\n· 问诊中使用术语 ${S.jargonQ} 次，患者未能理解。` : '') + '\n\n带教讨论建议：先排除深静脉病变和动脉缺血，再处理浅静脉；回顾 CEAP C4a 与 C3、C4b 的区别；热消融导管头端为什么不能放在 SFJ 上。';
}
async function genFeedback() {
  const R = S.report, t = totals(); R.aiBusy = true; render();
  const transcript = S.chat.filter(m => !m.sys).map(m => (m.who === 'doc' ? '学生：' : '患者：') + m.text).join('\n');
  const prompt = `你是血管外科带教老师。下面是一名本科实习生在“下肢静脉曲张初诊（标准答案：左下肢原发性大隐静脉曲张，CEAP C4a,Ep,As,Pr；首选大隐静脉腔内热消融+属支处理）”VR+AI 训练中的数据。请用中文写一份 300 字以内的个人反馈：先一句话总评，再列 3 条做得好的、3 条最需改进的（★ 为关键项，优先点评），最后给 1 条下次训练建议。不要使用 Markdown 标题符号。\n\n各项得分：${JSON.stringify(t.sc)}\n总分：${t.total}/100\n问诊记录：\n${transcript || '（无）'}\n操作日志（节选）：${JSON.stringify(S.log.slice(-60))}`;
  try {
    if (AI.mode === 'claude') { const r = await AI.sample(prompt, { modelTier: 'default', onText: ({ text }) => { R.ai = text; render(); } }); R.ai = r.text; }
    else { const res = await fetch(AI.cfg.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AI.cfg.key }, body: JSON.stringify({ model: AI.cfg.model, messages: [{ role: 'user', content: prompt }] }) }); const j = await res.json(); R.ai = j.choices?.[0]?.message?.content || ''; }
  } catch (e) { notify('AI 反馈生成失败：' + (e.code || e.message || e), 'bad'); }
  R.aiBusy = false; render();
}
function copyData() {
  const t = totals(); const data = { case: '下肢静脉曲张初诊-李某', time: new Date().toISOString(), aiMode: AI.mode, level: S.level, total: t.total, scores: t.sc, sections: t.sec, transcript: S.chat, log: S.log, gazeOnPatient: S.gaze[1] ? S.gaze[0] / S.gaze[1] : null };
  const s = JSON.stringify(data, null, 1);
  (navigator.clipboard?.writeText(s) || Promise.reject()).then(() => notify('训练数据已复制到剪贴板（JSON）', 'ok')).catch(() => { $('dataOut').value = s; $('dataDlg').showModal(); });
}

// ================= 交互 =================
const ray = new THREE.Raycaster();
function pickables() { return [panel, ...hotspots.filter(h => h.visible)]; }
function handleHit(h, click) {
  if (!h) { if (hoverId) { hoverId = null; render(); } showTip(null); return; }
  if (h.object === panel) {
    showTip(null);
    const px = h.uv.x * W, py = (1 - h.uv.y) * H; let found = null;
    for (let i = hits.length - 1; i >= 0; i--) { const b = hits[i]; if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) { found = b; break; } }
    const id = found?.id || null; if (id !== hoverId) { hoverId = id; render(); }
    if (click && found) { found.fn(); render(); }
  } else {
    if (hoverId) { hoverId = null; render(); }
    showTip(h.object);
    if (click) { const d = h.object.userData; if (d.kind === 'exam') examine(d.hs); else surgSpot(d.hs); }
  }
}
const mouse = new THREE.Vector2(); let drag = null;
renderer.domElement.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch, moved: false }; });
addEventListener('pointermove', (e) => {
  if (renderer.xr.isPresenting) return;
  if (drag && (e.buttons & 1)) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true; if (drag.moved) { view.yaw = drag.yaw + dx * 0.004; view.pitch = Math.max(-1.2, Math.min(1, drag.pitch + dy * 0.004)); applyView(); } return; }
  if (e.target !== renderer.domElement) return;
  mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); ray.setFromCamera(mouse, camera); handleHit(ray.intersectObjects(pickables(), false)[0], false);
});
renderer.domElement.addEventListener('pointerup', (e) => { if (drag && !drag.moved) { mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); ray.setFromCamera(mouse, camera); handleHit(ray.intersectObjects(pickables(), false)[0], true); } drag = null; });
renderer.domElement.addEventListener('wheel', (e) => { camera.fov = Math.max(35, Math.min(80, camera.fov + e.deltaY * 0.03)); camera.updateProjectionMatrix(); }, { passive: true });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; if (e.key === 'ArrowLeft') { view.yaw += 0.08; applyView(); } if (e.key === 'ArrowRight') { view.yaw -= 0.08; applyView(); } });

// XR 手柄 / 手势
const ctrls = [];
for (let i = 0; i < 2; i++) {
  const c = renderer.xr.getController(i);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0x4f8cff }));
  line.scale.z = 3; c.add(line);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: 0x4f8cff })); scene.add(dot); dot.visible = false;
  c.userData = { line, dot };
  c.addEventListener('select', () => xrRay(c, true));
  c.addEventListener('connected', (e) => { c.userData.src = e.data; line.visible = e.data.targetRayMode !== 'gaze'; });
  c.addEventListener('disconnected', () => { line.visible = false; dot.visible = false; });
  scene.add(c); ctrls.push(c);
}
const tmpM = new THREE.Matrix4();
function xrRay(c, click) {
  tmpM.identity().extractRotation(c.matrixWorld); ray.ray.origin.setFromMatrixPosition(c.matrixWorld); ray.ray.direction.set(0, 0, -1).applyMatrix4(tmpM);
  const h = ray.intersectObjects(pickables(), false)[0];
  c.userData.line.scale.z = h ? h.distance : 3; c.userData.dot.visible = !!h; if (h) c.userData.dot.position.copy(h.point);
  return h;
}
let activeCtrl = 0;
async function enterXR(mode) {
  if (!navigator.xr) { notify('此浏览器不支持 WebXR，请在 PICO 头显浏览器中打开', 'warn'); return; }
  let ok = false; try { ok = await navigator.xr.isSessionSupported(mode); } catch {}
  if (!ok) { notify((mode === 'immersive-ar' ? 'MR 透视' : 'VR') + ' 不可用：' + (inClaude ? '在 claude.ai 页面内浏览器可能禁止沉浸模式，请用独立版链接' : '设备或浏览器不支持'), 'warn'); return; }
  try {
    const session = await navigator.xr.requestSession(mode, { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking', 'bounded-floor'] });
    renderer.xr.setReferenceSpaceType('local-floor'); await renderer.xr.setSession(session);
    const ar = mode === 'immersive-ar'; scene.background = ar ? null : BG; room.visible = !ar; renderer.setClearColor(0x000000, ar ? 0 : 1);
    log('xr_start', { mode }); session.addEventListener('end', () => { scene.background = BG; room.visible = true; log('xr_end'); updateOverlay(); render(); });
    updateOverlay(); render();
  } catch (e) { notify('无法进入沉浸模式：' + (e.message || e) + (inClaude ? '。请改用独立版链接打开' : ''), 'bad'); }
}

// 渲染循环
const camDir = new THREE.Vector3(), toPt = new THREE.Vector3();
let lastTick = 0;
renderer.setAnimationLoop((t) => {
  for (let i = tweens.length - 1; i >= 0; i--) { const tw = tweens[i], k = Math.min(1, (now() - tw.t0) / tw.ms); tw.fn(k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2); if (k >= 1) { tweens.splice(i, 1); tw.done?.(); } }
  if (renderer.xr.isPresenting) {
    let best = null; ctrls.forEach((c, i) => { const h = xrRay(c, false); if (h && (!best || i === activeCtrl)) best = h; });
    handleHit(best, false);
  }
  if (S.mod === 'interview' && S.qStart) {
    const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera; cam.getWorldDirection(camDir); head.getWorldPosition(toPt); const cp = new THREE.Vector3(); cam.getWorldPosition(cp); toPt.sub(cp).normalize();
    S.gaze[1]++; if (camDir.dot(toPt) > Math.cos(0.45)) S.gaze[0]++;
    if (t - lastTick > 1000) { lastTick = t; render(); }
  }
  if (bubble.visible) { const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera; const cp = new THREE.Vector3(); cam.getWorldPosition(cp); bubble.lookAt(cp); }
  renderer.render(scene, camera);
});

// ================= 网页层（电脑端） =================
function updateOverlay() {
  const xr = renderer.xr.isPresenting;
  $('chatbar').hidden = S.mod !== 'interview' || xr;
  $('mic').hidden = !AI.dict; $('modeChip').textContent = '对话：' + modeName();
  $('modeChip').className = 'chip ' + (AI.mode === 'script' ? 'warn' : 'ok');
  $('apiBox').hidden = AI.mode === 'claude';
}
$('send').onclick = () => { const v = $('q').value.trim(); if (!v) return; $('q').value = ''; ask(v); };
$('q').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) $('send').click(); });
let listening = false;
$('mic').onclick = () => {
  const d = AI.dict; if (!d) return;
  if (listening) { d.stop().catch(() => {}); return; }
  d.start().catch((e) => { if (e?.code === 'not_granted') $('mic').hidden = true; notify('语音输入不可用：' + (e?.code || e), 'warn'); });
};
initAI().then(() => {
  const d = AI.dict; if (!d) return;
  d.onPartial(({ text }) => { $('q').placeholder = text; });
  d.onFinal(({ text }) => { $('q').value = ($('q').value + text).trim(); });
  d.onState(({ state }) => { listening = state === 'listening'; $('mic').textContent = listening ? '停止' : '语音'; $('mic').classList.toggle('on', listening); });
});
$('btnAR').onclick = () => enterXR('immersive-ar');
$('btnVR').onclick = () => enterXR('immersive-vr');
$('btnSet').onclick = () => { const c = AI.cfg || {}; $('apiUrl').value = c.url || ''; $('apiModel').value = c.model || ''; $('apiKey').value = c.key || ''; $('setDlg').showModal(); };
$('saveSet').onclick = (e) => {
  e.preventDefault(); const url = $('apiUrl').value.trim(), model = $('apiModel').value.trim(), key = $('apiKey').value.trim();
  if (url && !/^https:\/\//.test(url)) { $('setMsg').textContent = '接口地址需以 https:// 开头'; return; }
  AI.cfg = url && key ? { url, model, key } : null;
  try { AI.cfg ? localStorage.setItem('varix-api', JSON.stringify(AI.cfg)) : localStorage.removeItem('varix-api'); } catch {}
  if (AI.mode !== 'claude') AI.mode = AI.cfg ? 'api' : 'script';
  $('setDlg').close(); updateOverlay(); render(); notify('已保存：' + modeName(), 'ok');
};
$('closeSet').onclick = (e) => { e.preventDefault(); $('setDlg').close(); };
$('closeData').onclick = (e) => { e.preventDefault(); $('dataDlg').close(); };
if (navigator.xr) navigator.xr.isSessionSupported('immersive-ar').then(ok => { if (ok) $('btnAR').classList.add('primary'); }).catch(() => {});
document.fonts?.ready?.then(() => render());
render(); updateOverlay();
window.__S = S; window.__go = go; window.__ask = ask; window.__totals = totals;
window.__click = (id) => { const h = hits.find(b => b.id === id); if (!h) return false; h.fn(); render(); return true; };
window.__ids = () => hits.map(h => h.id);
