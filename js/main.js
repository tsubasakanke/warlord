// WARLORD 伝令の戦場 — 本体
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ARMORS, ARMOR_IDS, WEAPONS, WEAPON_IDS, buildBody, buildLightHelm, buildWeapon, buildShield, buildHorse, buildArrow, armorMaterial, TEAM_CLOTH, TEAM_CLOTH2, CLOTH_TIME, envDressing } from './models.js';
import { Rig, computePose, poseHorse, newOut, newPose, WEAPON_SWING, SWINGS, advanceWalk, advanceHorse, SIDED, SINGLE } from './rig.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const angDiff = (a, b) => ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
const lerpAngle = (a, b, t) => a + angDiff(a, b) * clamp(t, 0, 1);
let seed = 12345; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// ===== 兵種 =====
const TYPES = {
  inf: { name: '歩兵', label: '歩', hp: 40, dmg: 8, range: 1.9, cd: 1.0, speed: 4.3, n: 24, sp: 1.4, rad: 0.38, wpn: 'arming', shield: 'set', d: '剣と盾。攻めも守りもそこそこ' },
  shield: { name: '盾兵', label: '盾', hp: 55, dmg: 5, range: 1.8, cd: 1.15, speed: 3.6, n: 24, sp: 1.3, rad: 0.4, armor: true, wpn: 'arming', shield: 'set', d: '厚い鎧と盾。正面からの攻撃に強い' },
  pavise: { name: '大楯兵', label: '楯', hp: 62, dmg: 4, range: 1.8, cd: 1.25, speed: 3.0, n: 20, sp: 1.3, rad: 0.44, armor: true, big: true, wpn: 'arming', shield: 'pavise', d: '身の丈の大楯。正面の矢をほぼ通さず、突撃も受け止める。遅い' },
  spear: { name: '槍兵', label: '槍', hp: 40, dmg: 7, range: 2.9, cd: 1.1, speed: 3.9, n: 24, sp: 1.3, vsCav: 2.6, rad: 0.38, wpn: 'spear', d: '長槍。騎兵にとても強い' },
  archer: { name: '弓兵', label: '弓', hp: 28, dmg: 3, range: 1.7, cd: 1.0, speed: 4.3, n: 20, sp: 1.7, shoot: 70, shootCd: 2.8, arrowDmg: 8, rad: 0.38, wpn: 'bow', light: true, d: '遠くから矢を射る。近づかれると弱い' },
  cav: { name: '騎兵', label: '騎', hp: 70, dmg: 9, range: 2.6, cd: 1.0, speed: 14, n: 12, sp: 2.8, mounted: true, charge: 2.6, rad: 0.85, wpn: 'lance', shield: 'set', d: 'ランスで突撃。速くて強いが数が少ない' },
  guard: { name: '親衛隊', label: '衛', hp: 70, dmg: 11, range: 2.2, cd: 0.9, speed: 5.2, n: 12, sp: 1.5, rad: 0.4, wpn: 'poleaxe', d: 'ポールアックスの精鋭。少数だが強い' },
  hero: { name: '将', label: '将', hp: 500, dmg: 30, range: 3.0, cd: 0.55, speed: 5.5, n: 0, rad: 0.45 },
};
const COMP_TYPES = ['inf', 'shield', 'pavise', 'spear', 'archer', 'cav', 'guard'];
// 編成：1〜0番の部隊それぞれの兵種と、将についてくる護衛かどうか
const DEFAULT_COMP = [{ t: 'inf' }, { t: 'shield' }, { t: 'pavise' }, { t: 'spear' }, { t: 'spear' }, { t: 'archer' }, { t: 'archer' }, { t: 'cav' }, { t: 'cav' }, { t: 'guard', esc: 1 }];
const CPU_COMPS = [DEFAULT_COMP,
  [{ t: 'cav' }, { t: 'cav' }, { t: 'cav' }, { t: 'inf' }, { t: 'spear' }, { t: 'spear' }, { t: 'archer' }, { t: 'shield' }, { t: 'inf' }, { t: 'guard', esc: 1 }],
  [{ t: 'pavise' }, { t: 'pavise' }, { t: 'shield' }, { t: 'spear' }, { t: 'archer' }, { t: 'archer' }, { t: 'archer' }, { t: 'inf' }, { t: 'cav' }, { t: 'guard', esc: 1 }],
  [{ t: 'inf' }, { t: 'inf' }, { t: 'inf' }, { t: 'shield' }, { t: 'spear' }, { t: 'spear' }, { t: 'archer' }, { t: 'cav' }, { t: 'cav' }, { t: 'guard', esc: 1 }]];
const MODES = ['hold', 'move', 'charge', 'follow', 'rout', 'flee'];
// 陣形（Q を押しながら 1〜7）。spd=移動速度の倍率
const FORMS = { line: { name: '横隊', spd: 1, d: '3列ほどの横長。基本の形' }, single: { name: '一列', spd: 0.95, d: '全員が横一列。正面がいちばん広い' },
  column: { name: '縦隊', spd: 1.15, d: '細長く深い。移動が速いが横から弱い' }, block: { name: '方陣', spd: 0.85, d: '正方形の密集。騎兵の突撃に強い' },
  wedge: { name: '楔形', spd: 1, d: '三角形。騎兵の突撃が強くなる' }, loose: { name: '散開', spd: 1.05, d: '間隔を広く。矢に強い' },
  shieldwall: { name: '盾壁', spd: 0.6, d: '盾を並べた密集。正面と矢にとても強いが遅い' } };
const FORM_IDS = Object.keys(FORMS);
function formSlots(form, type, n, sp) {
  const out = []; let cols, s = sp;
  if (form === 'wedge') { let i = 0; for (let r = 0; i < n; r++) { const cnt = Math.min(2 * r + 1, n - i); for (let j = 0; j < cnt; j++, i++) out.push([(j - (cnt - 1) / 2) * s * 1.05, -r * s * 1.05]); } return out; }
  if (form === 'single') { cols = n; s = sp * 1.1; } else if (form === 'column') cols = type === 'cav' ? 2 : 4; else if (form === 'block') { cols = Math.ceil(Math.sqrt(n)); s = sp * 0.88; }
  else if (form === 'loose') { cols = Math.max(2, Math.ceil(n / 3)); s = sp * 2.2; } else if (form === 'shieldwall') { cols = Math.ceil(n / 2); s = sp * 0.78; }
  else cols = type === 'cav' ? Math.ceil(n / 2) : Math.max(2, Math.ceil(Math.sqrt(n * 2.5)));
  for (let i = 0; i < n; i++) { const row = Math.floor(i / cols), col = i % cols, rowN = Math.min(cols, n - row * cols); out.push([(col - (rowN - 1) / 2) * s, -row * s]); }
  return out;
}
function formDims(form, type, n, sp) { let x0 = 1e9, x1 = -1e9, z0 = 0; for (const [x, z] of formSlots(form, type, n, sp)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); } return { w: x1 - x0 + sp, d: -z0 + sp }; }
const MODE_JP = { hold: '待機', move: '移動中', charge: '突撃', follow: '護衛', rout: '敗走', flee: '潰走' };
const MSG_SPEED = 14, WALL = 265, REINF_T = 60, DEPLOY_T = 90;
const TEAM_NAME = ['青', '赤', '緑', '金', '紫'], TEAM_CSS = ['#5a8cff', '#ff5a44', '#4cc35a', '#f0c030', '#b46ae6'];
const TEAM_BG = ['rgba(25,45,110,.85)', 'rgba(125,25,22,.85)', 'rgba(25,90,35,.85)', 'rgba(130,95,12,.88)', 'rgba(80,30,110,.85)'];

// ===== 戦場 =====
const MAPS = {
  hill: { name: '丘取り', d: '中央の丘。押さえた軍は丘の上で傷が癒える', max: 5, zone: { x: 0, z: 0, r: 22 } },
  field: { name: '平原', d: 'なだらかな草原。正面からのぶつかり合い', max: 5 },
  river: { name: '渡河', d: '川を挟んだ戦い。深みでは足が鈍る。浅瀬と石橋を奪え', max: 5 },
  forest: { name: '森林', d: '深い森と空き地。森の中は見通しが利かず、伏兵ができる', max: 5 },
  mesa: { name: '荒野の台地', d: '切り立った台地が並ぶ乾いた荒野。高所を取れば有利', max: 5, zone: { x: 0, z: 0, r: 24 } },
  snow: { name: '雪原', d: '凍った湖を囲む冬の戦場。氷の上は遮るものがない', max: 5 },
  mountain: { name: '山岳（峠）', d: '細い谷あいの峠道。2軍のみ', max: 2 },
};
let MAP = 'hill', SIZE = 2, NT = 2, TEAM_A = [0, Math.PI];
// 陣営：SIDE[t] が同じ軍どうしは味方（乱戦では全部ちがう）。協力戦では人間側と敵側の2陣営
let SIDE = [0, 1, 2, 3, 4], COOP = false, ODDS = 1, TEAM_OFF = [], ZW = [];
const ally = (a, b) => SIDE[a] === SIDE[b];
const valleyX = z => 40 * Math.sin(z * 0.011);
const riverZ = x => 22 * Math.sin(x * 0.011 + 0.6) + 9 * Math.sin(x * 0.029);
const FORDS = [-150, 150], BRIDGE_X = -10, WATER_Y = -0.7;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const MESAS = [[0, 0, 30, 13], ...[0, 1, 2, 3, 4, 5].map(k => { const a = Math.PI / 6 + k * Math.PI / 3; return [Math.sin(a) * 118, Math.cos(a) * 118, 17, 10]; })];
function H(x, z) {
  let h = Math.sin(x * 0.013) * Math.cos(z * 0.011) * 3 + Math.sin(x * 0.031 + 1.3) * Math.sin(z * 0.027 + 0.7) * 1.2 + Math.sin(x * 0.07 + z * 0.05) * 0.4;
  if (MAP === 'hill') {
    h += 26 * Math.exp(-(x * x + z * z) / (2 * 50 * 50));
    h += 9 * Math.exp(-((x - 130) ** 2 + (z + 30) ** 2) / (2 * 30 * 30));
    h += 7 * Math.exp(-((x + 140) ** 2 + (z - 50) ** 2) / (2 * 28 * 28));
  } else if (MAP === 'mountain') {
    const cx = valleyX(z), d = Math.abs(x - cx), m = Math.max(0, d - 30);
    h += Math.min(75, m * 0.55) + Math.sin(x * 0.05) * Math.cos(z * 0.04) * Math.min(1, m / 30) * 9;
    h += 12 * Math.exp(-((x - cx) ** 2 + z * z) / (2 * 26 * 26));
  } else if (MAP === 'river') {
    h = 0.5 + Math.abs(h) * 0.6; const d = Math.abs(z - riverZ(x)); let bed = -2.5;
    for (const f of FORDS) bed = Math.max(bed, -2.5 + 1.35 * smooth(14, 6, Math.abs(x - f)));
    h += (bed - h) * smooth(16, 6, d);
    if (Math.abs(x - BRIDGE_X) < 3.6 && d < 19) h = Math.max(h, 0.75);
  } else if (MAP === 'forest') { h += 3 * Math.sin(x * 0.02) * Math.cos(z * 0.023);
  } else if (MAP === 'mesa') {
    h *= 0.6; for (const [mx, mz, r, mh] of MESAS) { const d = Math.hypot(x - mx, z - mz); h += mh * smooth(r + 7, r - 1, d) + (d < r ? Math.sin(x * 0.2 + mz) * Math.cos(z * 0.2) * 0.3 : 0); }
  } else if (MAP === 'snow') {
    const dl = Math.hypot(x, z); h += 7 * Math.exp(-((dl - 130) ** 2) / (2 * 35 * 35)) * (0.6 + 0.4 * Math.sin(Math.atan2(x, z) * 3));
    h += (-1.6 - h) * smooth(60, 44, dl);
  } else h += 4 * Math.exp(-((x - 90) ** 2 + (z - 20) ** 2) / (2 * 40 * 40));
  const e = Math.max(Math.abs(x), Math.abs(z)); if (e > WALL) h += (e - WALL) * 1.2;
  return h;
}
// 水の深さで足が鈍る（渡河）
const slowAt = (x, z) => { if (MAP !== 'river') return 1; const dep = WATER_Y - H(x, z); return dep > 0.9 ? 0.38 : dep > 0.1 ? 0.7 : 1; };
// 森の中か（森林マップ）。開戦地点の周りは切り開いてある
function forestAt(x, z) {
  if (MAP !== 'forest') return false;
  const f = Math.sin(x * 0.021 + 1.1) * Math.cos(z * 0.018 - 0.4) + 0.6 * Math.sin((x - z) * 0.013 + 2) + 0.35 * Math.sin(x * 0.05) * Math.sin(z * 0.047);
  if (f < 0.1) return false;
  for (let t = 0; t < NT; t++) { const F = teamFrame(t), cx = F.bx + F.b[0] * 30, cz = F.bz + F.b[1] * 30; if (Math.hypot(x - cx, z - cz) < 95) return false; }
  return true;
}
// ===== 陣地（軍ごとの開始位置。b=後ろ向き, l=横向き） =====
function teamFrame(t) {
  if (MAP === 'mountain') { const sgn = t === 0 ? 1 : -1, z = sgn * 160; return { bx: valleyX(z), bz: z, b: [0, sgn], l: [sgn, 0], face: t === 0 ? Math.PI : 0, a: t === 0 ? 0 : Math.PI }; }
  const a = TEAM_A[t], R = NT <= 2 || COOP ? 185 : 172, off = TEAM_OFF[t] || 0;
  return { bx: Math.sin(a) * R + Math.cos(a) * off, bz: Math.cos(a) * R - Math.sin(a) * off, b: [Math.sin(a), Math.cos(a)], l: [Math.cos(a), -Math.sin(a)], face: a + Math.PI, a };
}
function fw(t, lx, d) { const F = teamFrame(t); let x = F.bx + F.l[0] * lx + F.b[0] * d; const z = F.bz + F.l[1] * lx + F.b[1] * d; if (MAP === 'mountain') x += valleyX(z) - valleyX(F.bz); return [clamp(x, -WALL + 6, WALL - 6), clamp(z, -WALL + 6, WALL - 6)]; }
function toFrame(t, x, z) { const F = teamFrame(t); let dx = x - F.bx; const dz = z - F.bz; if (MAP === 'mountain') dx -= valleyX(z) - valleyX(F.bz); return [dx * F.l[0] + dz * F.l[1], dx * F.b[0] + dz * F.b[1]]; }
function zoneDims(t) { return MAP === 'mountain' ? { w: 26, d0: -6, d1: 85 } : { w: (t !== undefined && ZW[t]) || [0, 0, 125, 105, 88, 72][NT], d0: -8, d1: 72 }; }
function clampDeploy(t, x, z) { const Z = zoneDims(t), [lx, d] = toFrame(t, x, z); return fw(t, clamp(lx, -Z.w, Z.w), clamp(d, Z.d0, Z.d1)); }

// ===== 装備・編成（武具画面と編成画面で選ぶ） =====
const LO_KEY = 'warlord-lo';
const LO_DEF = { self: 'gothic', wpn: 'glaive', army: 'milanese', foe: 'auto', comp: DEFAULT_COMP };
let LO = { ...LO_DEF };
try { Object.assign(LO, JSON.parse(localStorage.getItem(LO_KEY) || '{}')); } catch (e) {}
const validComp = c => Array.isArray(c) && c.length === 10 && c.some(q => q && TYPES[q.t]);
if (!validComp(LO.comp)) LO.comp = DEFAULT_COMP.map(q => ({ ...q }));
const saveLO = () => { try { localStorage.setItem(LO_KEY, JSON.stringify(LO)); } catch (e) {} };
const teamArmor = [], heroArmor = [], heroWpn = [];

// ===== 状態 =====
const ents = [], squads = [], arrows = [], msgs = [], heroes = [], guards = [], horses = [];
let ME = 0, player = null, scene, camera, renderer, composer, zone = null;
let running = false, ended = false, mapOpen = false, gameT = 0, aiTimer = 3, frameNo = 0;
let phase = 'deploy', deployT = DEPLOY_T, spectate = false;
const aiTeams = new Set(), human = new Set(), elim = [], place = [], ready = new Set();
const selected = new Set();
let yaw = 0, pitch = -0.08, thirdPerson = false; const keys = {};

// ===== 空間グリッド =====
const CS = 6, grid = new Map();
const gk = (i, j) => i * 4096 + j;
function buildGrid() { grid.clear(); for (const e of ents) { if (!e.alive) continue; const k = gk(Math.floor(e.x / CS) + 100, Math.floor(e.z / CS) + 100); let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(e); } }
function forNear(x, z, r, fn) {
  const i0 = Math.floor((x - r) / CS) + 100, i1 = Math.floor((x + r) / CS) + 100, j0 = Math.floor((z - r) / CS) + 100, j1 = Math.floor((z + r) / CS) + 100;
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = grid.get(gk(i, j)); if (a) for (let n = 0; n < a.length; n++) fn(a[n]); }
}
function nearestEnemy(e, r) { let best = null, bd = r * r; forNear(e.x, e.z, r, o => { if (ally(o.team, e.team) || o.rout) return; const dx = o.x - e.x, dz = o.z - e.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = o; } }); return best; }
const radOf = e => e.mounted ? 0.9 : e.T.rad;

// ===== 兵士 =====
function makeEnt(team, type, x, z, squad) {
  const T = TYPES[type], arm = ARMORS[teamArmor[team]];
  const e = { id: ents.length, team, type, T, x, z, y: H(x, z), hp: T.hp, alive: true, face: 0, squad, cd: Math.random(), scd: Math.random() * 2, think: Math.random() * 0.3,
    anim: 0, animDur: 0.5, spd: 0, target: null, phase: Math.random() * 6, sx: x, sz: z, seen: false, kills: 0, lastHurt: -99, deadT: 0,
    def: arm.def, spdMul: arm.spd, wpn: T.wpn, swing: WEAPON_SWING[T.wpn] || 'diag', shieldKind: T.shield === 'set' ? arm.shield : T.shield || null, mounted: !!T.mounted, scale: 1,
    stat: { dmg: T.dmg, range: T.range, cd: T.cd } };
  if (e.mounted) e.h = { id: ents.length, x, y: e.y, z, face: e.face, spd: 0, cyc: Math.random(), alive: true, deadT: 0 };
  ents.push(e); return e;
}
function setHero(e, t) {
  const W = WEAPONS[heroWpn[t]], arm = ARMORS[heroArmor[t]];
  Object.assign(e, { W, wpn: heroWpn[t], swing: WEAPON_SWING[heroWpn[t]], shieldKind: W.shield ? arm.shield : null, def: arm.def, spdMul: arm.spd, scale: 1.05, hitAt: 0,
    stat: { dmg: W.dmg, range: W.range, cd: W.cd } });
}
class Squad {
  constructor(team, type, x, z, face, num, n) {
    Object.assign(this, { idx: squads.length, team, type, T: TYPES[type], num, ax: x, az: z, tx: x, tz: z, face, mode: 'hold', form: 'line', tface: null, members: [], alive: [], pending: 0, cx: x, cz: z, moving: false, engaged: 0, full: n, home: { lx: 0, d: 0 }, escort: false, reinfT: 0, mor: 100, fleeT: 0, hidT: -99, ambT: -99 });
    squads.push(this);
    for (let i = 0; i < n; i++) this.members.push(makeEnt(team, type, x, z, this));
    this.alive = this.members.slice(); this.snap();
  }
  derive() { const al = this.alive = this.members.filter(m => m.alive); if (!al.length) return al; let cx = 0, cz = 0; for (const m of al) { cx += m.x; cz += m.z; } this.cx = cx / al.length; this.cz = cz / al.length; return al; }
  // 布陣中：兵をその場の隊形の位置へ並べる
  snap() { this.derive(); this.layout(); for (const m of this.alive) { m.x = m.sx; m.z = m.sz; m.y = H(m.x, m.z); m.face = this.face; m.spd = 0; if (m.h) { m.h.x = m.x; m.h.z = m.z; m.h.y = m.y; m.h.face = m.face; } } this.cx = this.ax; this.cz = this.az; }
  followPoint() { // 護衛：将の後ろに並ぶ（護衛が複数なら左右に分かれる）
    const h = heroes[this.team], fl = squads.filter(s => s.team === this.team && s.mode === 'follow' && s.alive.length), k = Math.max(0, fl.indexOf(this)), n = fl.length;
    const off = k - (n - 1) / 2, lat = off * 15, back = 9 + Math.abs(off) * 3, f = h.face, fx = Math.sin(f), fz = Math.cos(f), rx = -Math.cos(f), rz = Math.sin(f);
    return [h.x - fx * back + rx * lat, h.z - fz * back + rz * lat];
  }
  update(dt) {
    const al = this.derive();
    // 援軍：兵が4分の1を切ると、しばらくして本陣から補充が来る（将が生きている限り）
    if (!elim[this.team] && this.mode !== 'rout' && al.length < this.full * 0.25) { if (!this.reinfT) this.reinfT = gameT + REINF_T; else if (gameT >= this.reinfT) { reinforce(this); return; } } else this.reinfT = 0;
    if (!al.length || this.mode === 'rout') return;
    // 士気：落ち着いていれば回復、将のそばだと早く回復。0になると崩れて逃げる
    if (this.mode === 'flee') {
      const [hx, hz] = fw(this.team, this.home.lx * 0.6, zoneDims(this.team).d1 - 8); this.tx = hx; this.tz = hz; this.tface = null;
      let near = false; forNear(this.cx, this.cz, 18, o => { if (!near && o.alive && !o.rout && !ally(o.team, this.team) && Math.abs(o.x - this.cx) + Math.abs(o.z - this.cz) < 22) near = true; });
      this.mor = Math.min(100, this.mor + (near ? 0.6 : 5) * dt);
      if (gameT - this.fleeT > 8 && this.mor >= 40 && !near) { this.mode = this.escort && !guards[this.team] ? 'follow' : 'hold'; this.tx = this.ax; this.tz = this.az; teamLog(this.team, `第${this.num}隊(${this.T.name})が踏みとどまり、隊列を立て直した`, '#9f9'); }
    } else {
      const h = heroes[this.team], nearH = h && h.alive && Math.hypot(h.x - this.cx, h.z - this.cz) < 30;
      if (this.engaged < 0.05) this.mor = Math.min(100, this.mor + (nearH ? 4.5 : 1.5) * dt); else if (nearH) this.mor = Math.min(100, this.mor + 1.2 * dt);
      if (this.mor <= 0) breakSquad(this);
    }
    if (this.mode === 'follow') { const h = heroes[this.team]; if (h.alive && !h.squad) { const [nx, nz] = this.followPoint(); if (Math.hypot(nx - this.tx, nz - this.tz) > 3) { this.tx = nx; this.tz = nz; } this.tface = h.face; } }
    const dx = this.tx - this.ax, dz = this.tz - this.az, d = Math.hypot(dx, dz);
    this.moving = d > 1.5;
    let eng = 0; for (const m of al) if (m.target && !m.T.shoot && Math.abs(m.target.x - m.x) + Math.abs(m.target.z - m.z) < 7) eng++;
    this.engaged = eng / al.length;
    if (d > 0.5) {
      const lag = Math.hypot(this.cx - this.ax, this.cz - this.az);
      let sp = this.T.speed * 0.8 * (al[0].spdMul || 1) * (FORMS[this.form] || FORMS.line).spd * slowAt(this.ax, this.az);
      if (this.mode === 'follow') sp *= 1.35;
      const ah = H(this.ax + dx / d * 2, this.az + dz / d * 2), y0 = H(this.ax, this.az); sp *= clamp(1 - (ah - y0) / 2 * 1.1, 0.35, 1.2);
      if (this.mode === 'flee') sp *= 1.3;
      else { if (this.mode !== 'charge' && lag > 10) sp *= 0.25;
        if (this.engaged > 0.35 && this.mode !== 'charge') sp = 0; }
      const st = Math.min(d, sp * dt); this.ax += dx / d * st; this.az += dz / d * st;
      if (d > 3) this.face = lerpAngle(this.face, Math.atan2(dx, dz), dt * 2.5);
    } else if (this.mode === 'move' || this.mode === 'charge') this.mode = 'hold';
    if (!this.moving && this.tface !== null) this.face = lerpAngle(this.face, this.tface, dt * 1.6);
    this.layout();
  }
  layout() {
    const al = this.alive, n = al.length; if (!n) return;
    const sl = formSlots(this.form, this.type, n, this.T.sp), c = Math.cos(this.face), s = Math.sin(this.face);
    for (let i = 0; i < n; i++) { const [lx, lz] = sl[i]; al[i].sx = this.ax + c * lx + s * lz; al[i].sz = this.az - s * lx + c * lz; }
  }
}
// 士気を削る（将が率いる隊は崩れにくい）
function shake(s, v) { if (!s || s.mode === 'rout' || s.mode === 'flee') return; const h = s.members[0]; s.mor -= v * (h && h.type === 'hero' && h.alive ? 0.4 : 1); }
function breakSquad(s) {
  s.mode = 'flee'; s.fleeT = gameT; s.mor = 0; s.tface = null;
  teamLog(s.team, `第${s.num}隊(${s.T.name})が崩れて逃げ出した！`, '#f86');
  for (let t = 0; t < NT; t++) if (!ally(t, s.team) && human.has(t) && s.alive.some(m => m.seen || t !== ME)) teamLog(t, `${TEAM_NAME[s.team]}軍の${s.T.name}が崩れた！ 追い打ちの好機`, '#fd8');
  for (const o of squads) if (o !== s && o.team === s.team && o.alive.length && Math.hypot(o.cx - s.cx, o.cz - s.cz) < 35) shake(o, 12); // 隣が崩れると動揺が広がる
}
// 1秒ごと：敵のどの陣営からも見えていない部隊を記録（そこから襲うと奇襲になる）
let morT = 0;
function moraleTick(dt) {
  morT -= dt; if (morT > 0) return; morT = 1;
  const sides = [...new Set(SIDE.slice(0, NT).filter((x, t) => !elim[t]))], sp = new Map(sides.map(x => [x, spotters(SIDE.indexOf(x))]));
  for (const s of squads) { if (!s.alive.length) continue; const pt = { x: s.cx, z: s.cz, y: H(s.cx, s.cz) }; let seen = false;
    for (const [x, list] of sp) if (x !== SIDE[s.team] && canSee(list, pt)) { seen = true; break; }
    if (!seen && !s.moving && forestAt(s.cx, s.cz)) s.hidT = gameT; } // 森でじっと潜んでいる間だけ（そこから飛び出すと奇襲）
}
function reinforce(s) {
  s.reinfT = 0; const [bx, bz] = fw(s.team, s.home.lx * 0.5, zoneDims(s.team).d1 - 10), F = teamFrame(s.team); let n = 0;
  if (!s.alive.length) { s.ax = s.tx = bx; s.az = s.tz = bz; s.face = F.face; s.mode = 'hold'; s.tface = null; }
  for (const m of s.members) { if (m.alive || m.gone || m.type === 'hero') continue;
    Object.assign(m, { alive: true, hp: m.T.hp, x: bx + (Math.random() - 0.5) * 12, z: bz + (Math.random() - 0.5) * 12, deadT: 0, settled: false, target: null, anim: 0, face: F.face, mounted: !!m.T.mounted, hitAge: 9 });
    m.y = H(m.x, m.z); if (m.h) Object.assign(m.h, { alive: true, deadT: 0, x: m.x, z: m.z, y: m.y }); n++; }
  s.mor = Math.max(s.mor, 70); s.derive(); if (n) teamLog(s.team, `第${s.num}隊(${s.T.name})に援軍 ${n}人が本陣に到着`, '#9cf');
}
// 自動の初期配置（編成の順に、大楯・盾を中央、弓を後ろ、騎兵を両翼、護衛を将のそばへ）
function autoLayout(list, Z) {
  const pos = new Array(list.length), W = Z.w, gap = 5, dim = q => formDims(q.form || 'line', q.type, q.n, TYPES[q.type].sp);
  const front = [], arch = [], cav = [], esc = []; const pri = { pavise: 0, shield: 1, spear: 2, inf: 3, guard: 4 };
  list.forEach((q, i) => { if (q.esc) esc.push(i); else if (q.type === 'archer') arch.push(i); else if (q.type === 'cav') cav.push(i); else front.push(i); });
  front.sort((a, b) => pri[list[a].type] - pri[list[b].type] || a - b);
  const rows = []; let cur = [], curW = 0;
  for (const i of front) { const w = dim(list[i]).w; if (cur.length && curW + gap + w > W * 2 - 24) { rows.push(cur); cur = []; curW = 0; } curW += (cur.length ? gap : 0) + w; cur.push(i); }
  if (cur.length) rows.push(cur);
  let d = 0, maxW = 0;
  for (const r of rows) { const ord = []; r.forEach((i, k) => k % 2 ? ord.push(i) : ord.unshift(i));
    const tw = ord.reduce((t, i) => t + dim(list[i]).w + gap, -gap); maxW = Math.max(maxW, tw); let x = -tw / 2, dep = 0;
    for (const i of ord) { const D = dim(list[i]); pos[i] = [x + D.w / 2, d]; x += D.w + gap; dep = Math.max(dep, D.d); } d += dep + 6; }
  if (arch.length) { const tw = arch.reduce((t, i) => t + dim(list[i]).w + gap * 2, -gap * 2); let x = -Math.min(tw, W * 2) / 2, dep = 0;
    for (const i of arch) { const D = dim(list[i]); pos[i] = [x + D.w / 2, d + 4]; x += D.w + gap * 2; dep = Math.max(dep, D.d); } d += dep + 10; }
  cav.forEach((i, k) => { const D = dim(list[i]), side = k % 2 ? 1 : -1, lvl = Math.floor(k / 2);
    pos[i] = W < 60 ? [side * W * 0.4, d + lvl * (D.d + 6)] : [side * (maxW / 2 + 10 + D.w / 2), 6 + lvl * (D.d + 8)]; });
  esc.forEach((i, k) => { const D = dim(list[i]); pos[i] = [(k - (esc.length - 1) / 2) * (D.w + 6), Z.d1 - 20]; });
  return pos.map((p, i) => { const D = dim(list[i]); return [clamp(p[0], -W + Math.min(W, D.w / 2), W - Math.min(W, D.w / 2)), clamp(p[1], Z.d0, Z.d1)]; });
}
function spawnArmy(t, lo, ai) {
  const comp = validComp(lo.comp) ? lo.comp : DEFAULT_COMP, Z = zoneDims(t), F = teamFrame(t), mul = armyMul(t);
  const list = []; comp.forEach((c, i) => { if (c && TYPES[c.t] && c.t !== 'hero') list.push({ type: c.t, esc: !!c.esc, num: (i + 1) % 10, n: Math.max(4, Math.round(TYPES[c.t].n * mul)), form: c.t === 'cav' ? 'wedge' : 'line' }); });
  const pos = autoLayout(list, Z), [hx, hz] = fw(t, 0, Z.d1 - 6);
  const hero = makeEnt(t, 'hero', hx, hz, null); hero.face = F.face; setHero(hero, t); heroes[t] = hero;
  list.forEach((q, k) => { const [x, z] = fw(t, pos[k][0], pos[k][1]); const s = new Squad(t, q.type, x, z, F.face, q.num, q.n); s.home = { lx: pos[k][0], d: pos[k][1] }; s.form = q.form; if (q.esc) { s.escort = true; s.mode = 'follow'; } s.snap(); });
  if (ai) { // CPUの将は護衛部隊の先頭に立つ
    let g = squads.find(s => s.team === t && s.escort);
    if (!g) { const [x, z] = fw(t, 0, Z.d1 - 14); g = new Squad(t, 'guard', x, z, F.face, '衛', Math.round(12 * Math.max(1, mul * 0.75))); }
    hero.squad = g; g.members.unshift(hero); g.mode = 'hold'; g.escort = true; guards[t] = g; g.snap();
  } else horses[t] = { id: t, x: hx + 1.5, z: hz, y: H(hx + 1.5, hz), face: F.face, spd: 0, cyc: 0, alive: true, team: t };
}
// 1軍の人数の倍率。協力戦は陣営ごとに分け合い、敵側は「敵の兵力」倍
function armyMul(t) {
  if (!COOP) return SIZE * (NT <= 2 ? 1 : 2.3 / NT);
  const A = SIDE.slice(0, NT).filter(x => x === SIDE[0]).length, mine = SIZE * (A <= 1 ? 1 : 1.3); // 味方陣営の合計
  return ally(t, 0) ? mine / A : mine * ODDS / (NT - A); // 敵陣営の合計＝味方の合計×倍率
}
// 人が操作していた軍をCPUに任せる（回線が切れたとき）
function cpuTakeover(t) {
  if (aiTeams.has(t)) return; aiTeams.add(t); human.delete(t); const h = heroes[t];
  if (h.alive && !h.squad) { let g = squads.filter(s => s.team === t && s.alive.length).sort((a, b) => Math.hypot(a.cx - h.x, a.cz - h.z) - Math.hypot(b.cx - h.x, b.cz - h.z))[0];
    if (g) { h.squad = g; g.members.unshift(h); guards[t] = g; g.mode = 'hold'; h.mounted = false; } }
}

// ===== ログ =====
const logs = [];
function log(t, c = '#eee') { logs.push({ t, c }); if (logs.length > 7) logs.shift(); $('log').innerHTML = logs.map(l => `<div style="color:${l.c}">${l.t}</div>`).join(''); }
function teamLog(t, text, c) { if (t === ME || t === -1) log(text, c); if (NET.mode === 'host' && (t === -1 || human.has(t))) pushEv(['log', text, c, t]); }

// ===== 効果音（WebAudio で合成） =====
const SFX = {
  ctx: null, master: null, amb: null, last: {},
  init() { if (this.ctx) return; try { const C = window.AudioContext || window.webkitAudioContext; this.ctx = new C(); this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
    const n = this.noiseBuf(2); const src = this.ctx.createBufferSource(); src.buffer = n; src.loop = true; const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; this.amb = this.ctx.createGain(); this.amb.gain.value = 0; src.connect(lp).connect(this.amb).connect(this.master); src.start(); } catch (e) { this.ctx = null; } },
  noiseBuf(sec) { const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; },
  vol(x, z) { if (!camera) return 1; const d = Math.hypot(x - camera.position.x, z - camera.position.z); return clamp(1 - d / 70, 0, 1) ** 2; },
  can(k, gap) { const t = performance.now(); if ((this.last[k] || 0) + gap > t) return false; this.last[k] = t; return true; },
  clash(x, z, big) { if (!this.ctx) return; const v = this.vol(x, z); if (v < 0.02 || !this.can('clash', 40)) return; const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.nb || (this.nb = this.noiseBuf(0.3)); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600 + Math.random() * 1500; bp.Q.value = 3;
    const g = c.createGain(); g.gain.setValueAtTime(0.5 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12); src.connect(bp).connect(g).connect(this.master); src.start(t); src.stop(t + 0.15);
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = (big ? 900 : 1500) + Math.random() * 900; const g2 = c.createGain(); g2.gain.setValueAtTime(0.18 * v, t); g2.gain.exponentialRampToValueAtTime(0.001, t + (big ? 0.5 : 0.28)); o.connect(g2).connect(this.master); o.start(t); o.stop(t + 0.55); },
  whoosh(heavy) { if (!this.ctx) return; const c = this.ctx, t = c.currentTime; const src = c.createBufferSource(); src.buffer = this.nb || (this.nb = this.noiseBuf(0.3)); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(heavy ? 250 : 400, t); bp.frequency.exponentialRampToValueAtTime(heavy ? 900 : 1600, t + 0.2); const g = c.createGain(); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    src.connect(bp).connect(g).connect(this.master); src.start(t); src.stop(t + 0.3); },
  thud(x, z, v0 = 1) { if (!this.ctx) return; const v = this.vol(x, z) * v0; if (v < 0.03 || !this.can('thud', 30)) return; const c = this.ctx, t = c.currentTime; const o = c.createOscillator(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = c.createGain(); g.gain.setValueAtTime(0.5 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15); o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.16); },
  horn() { if (!this.ctx) return; const c = this.ctx, t = c.currentTime; for (const [f, d0, d1] of [[196, 0, 0.9], [262, 0.9, 1.9]]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; const g = c.createGain();
    g.gain.setValueAtTime(0, t + d0); g.gain.linearRampToValueAtTime(0.18, t + d0 + 0.1); g.gain.setValueAtTime(0.18, t + d1 - 0.15); g.gain.linearRampToValueAtTime(0, t + d1); o.connect(lp).connect(g).connect(this.master); o.start(t + d0); o.stop(t + d1 + 0.05); } },
  ambient(level) { if (this.amb) this.amb.gain.setTargetAtTime(clamp(level, 0, 0.35), this.ctx.currentTime, 0.5); },
};

// ===== 戦闘 =====
function dealDamage(a, b, base, ranged, pierce) {
  if (!b.alive) return; let d = base;
  const amb = !!(a.squad && b.squad && gameT - a.squad.hidT < 10 && a.squad.mode !== 'flee'); // 見えていなかった隊からの奇襲
  if (amb && !ranged) d *= 1.3;
  if (!ranged) {
    if ((b.type === 'cav' || b.mounted) && a.T.vsCav) d *= a.T.vsCav;
    if (a.T.charge && a.spd > 6) { const bf = b.squad && b.squad.form; d *= (bf === 'block' || bf === 'shieldwall') ? 1.3 : a.T.charge * (a.squad && a.squad.form === 'wedge' ? 1.25 : 1); }
    if (b.squad && b.squad.form === 'column') d *= 1.15;
    if (a.y - b.y > 1.2) d *= 1.25;
  }
  const fx = Math.sin(b.face), fz = Math.cos(b.face), dx = a.x - b.x, dz = a.z - b.z, Ln = Math.hypot(dx, dz) || 1, front = (fx * dx + fz * dz) / Ln > 0.35;
  const bform = b.squad && b.type !== 'hero' ? b.squad.form : null;
  if (ranged && bform === 'loose') d *= 0.5;
  let parried = false;
  if (front) {
    if (b.T.armor && !pierce) d *= ranged ? 0.15 : 0.45;
    if (b.T.big) { d *= ranged ? 0.4 : 0.75; if (a.T && a.T.charge) d *= 0.5; }
    if (bform === 'shieldwall') d *= ranged ? 0.3 : 0.6;
    if (!ranged && b.shieldKind && b.type !== 'hero' && Math.random() < (bform === 'shieldwall' ? 0.5 : b.T.big ? 0.45 : 0.3) * (a.type === 'hero' ? 0.5 : 1)) { d *= pierce ? 0.6 : 0.25; parried = true; b.blockAge = 0; }
    if (b.type === 'hero' && b.blocking) d *= b.W ? (ranged ? Math.min(0.3, b.W.block) : b.W.block) : 0.3;
  }
  const df = b.def || 1; d *= pierce ? 1 - (1 - df) * 0.35 : df;
  b.hp -= d;
  const BS = b.squad; if (BS && b.type !== 'hero' && phase === 'battle') { // 士気：横や後ろから、突撃、将の斬り込み、奇襲、損害で下がる
    let m = ranged ? 0.12 : 0; if (!front && !ranged) m += d * 0.06; if (!ranged && a.T && a.T.charge && a.spd > 6) m += 1.2; if (a.type === 'hero' && !ranged) m += 0.6;
    if (b.hp <= 0) m += 100 / BS.full * (front ? 1 : 1.6);
    if (amb && gameT > BS.ambT) { BS.ambT = gameT + 25; m += 35; teamLog(b.team, `伏兵だ！ 第${BS.num}隊(${BS.T.name})が奇襲を受けた`, '#f86'); teamLog(a.team, `奇襲成功！ 敵の${BS.T.name}が浮き足立った`, '#fd8'); }
    if (m) shake(BS, m); }
  if (!parried && d > 2) { b.hitAge = 0; b.hitSide = (fx * dz - fz * dx) > 0 ? 1 : -1; }
  if (b.type === 'hero') { b.lastHurt = gameT; if (b === player) { hurtFx(d); CAM.shake = Math.min(0.6, CAM.shake + d / 60); } }
  if (a === player && !ranged) { CAM.hitstop = Math.max(CAM.hitstop, d > 30 ? 0.085 : 0.05); CAM.kick = Math.min(1, CAM.kick + 0.5); }
  if (Math.hypot(b.x - camera.position.x, b.z - camera.position.z) < 60) { FX.spark(b.x - dx / Ln * 0.3, b.y + (b.mounted ? 2.1 : 1.25), b.z - dz / Ln * 0.3, ranged ? 3 : parried ? 12 : 7); if (!ranged) SFX.clash(b.x, b.z, d > 25 || parried); else SFX.thud(b.x, b.z, 0.5); }
  if (b.hp <= 0) { b.hp = 0; b.alive = false; b.target = null; b.deadT = 0; if (b.h) { b.h.alive = false; b.h.deadT = 0; b.mounted = false; } if (a.type === 'hero') a.kills++;
    if (b.type === 'hero') { b.killer = a.team ?? -1; if (b.mounted) { b.mounted = false; } } }
}
function hurtFx(d) { $('dmg').style.boxShadow = `inset 0 0 160px rgba(160,0,0,${clamp(d / 25, 0.25, 0.85)})`; }
function fireArrow(e, t) {
  const sy = e.y + 1.5, tx = t.x + (Math.random() - 0.5) * 3.5, tz = t.z + (Math.random() - 0.5) * 3.5, ty = H(tx, tz) + 1;
  const dx = tx - e.x, dz = tz - e.z, dist = Math.hypot(dx, dz), tt = Math.max(0.3, dist / 32);
  const a = { x: e.x, y: sy, z: e.z, vx: dx / tt, vz: dz / tt, vy: (ty - sy) / tt + 0.5 * 9.8 * tt, team: e.team, dmg: e.T.arrowDmg * (forestAt(t.x, t.z) ? 0.5 : 1), stuck: 0 };
  arrows.push(a); if (NET.mode === 'host') NET.newArrows.push(a);
}
function updateArrows(dt, visualOnly) {
  for (let i = arrows.length - 1; i >= 0; i--) { const a = arrows[i];
    if (a.stuck > 0) { a.stuck -= dt; if (a.stuck <= 0) arrows.splice(i, 1); continue; }
    a.vy -= 9.8 * dt; a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
    if (!visualOnly) {
      let hit = null;
      forNear(a.x, a.z, 1, o => { if (hit || ally(o.team, a.team)) return; if (Math.abs(o.x - a.x) < 0.6 && Math.abs(o.z - a.z) < 0.6 && a.y > o.y && a.y < o.y + (o.mounted ? 2.9 : 2.0)) hit = o; });
      if (hit) { dealDamage({ x: a.x - a.vx, z: a.z - a.vz, y: a.y, T: {}, team: a.team }, hit, a.dmg, true); arrows.splice(i, 1); continue; }
    }
    if (a.y < H(a.x, a.z)) { a.stuck = 8; if (arrows.length > 700) arrows.splice(i, 1); }
  }
}
function moveEnt(e, gx, gz, maxS, dt, faceMove) {
  let dx = gx - e.x, dz = gz - e.z; const d = Math.hypot(dx, dz); let desired = 0;
  if (d > 0.25) { dx /= d; dz /= d; desired = Math.min(maxS, d * 2.5); const ah = H(e.x + dx * 1.5, e.z + dz * 1.5); desired *= clamp(1 - (ah - e.y) / 1.5 * 1.1, 0.35, 1.25) * slowAt(e.x, e.z); } else { dx = 0; dz = 0; }
  const acc = e.mounted ? 6 : 12;
  e.spd = Math.max(0, e.spd + clamp(desired - e.spd, -acc * 1.5 * dt, acc * dt));
  let vx = dx * e.spd, vz = dz * e.spd; const r0 = radOf(e);
  forNear(e.x, e.z, 1.9, o => { if (o === e) return; const sx = e.x - o.x, sz = e.z - o.z, sd = sx * sx + sz * sz, R = r0 + radOf(o);
    if (sd < R * R && sd > 1e-6) { const s = Math.sqrt(sd), p = (R - s) / R * 5; vx += sx / s * p; vz += sz / s * p; } });
  e.x = clamp(e.x + vx * dt, -WALL - 15, WALL + 15); e.z = clamp(e.z + vz * dt, -WALL - 15, WALL + 15); e.y = H(e.x, e.z);
  advanceWalk(e, dt);
  if (faceMove) { if (desired > 0.5) e.face = lerpAngle(e.face, Math.atan2(dx, dz), dt * 6); else if (e.squad) e.face = lerpAngle(e.face, e.squad.face, dt * 3); }
  if (e.h) { const h = e.h; h.x = e.x; h.z = e.z; h.y = e.y; h.face = e.face; h.spd = e.spd; advanceHorse(h, dt); }
}
function soldierAI(e, dt) {
  const S = e.squad, T = e.T, st = e.stat;
  if (e.rout) { // 敗走：本陣の向こうへ逃げ、しばらくすると戦場から消える
    e.routT -= dt; e.ready = false; e.blocking = false; e.target = null;
    if (e.routT <= 0) { e.alive = false; e.gone = true; if (e.h) e.h.alive = false; return; }
    const F = teamFrame(e.team); moveEnt(e, e.x + F.b[0] * 30 + Math.sin(e.id) * 8, e.z + F.b[1] * 30 + Math.cos(e.id) * 8, T.speed * 1.2, dt, true); return; }
  e.cd -= dt; e.scd -= dt; e.think -= dt;
  if (S.mode === 'flee') { e.target = null; e.blocking = false; e.ready = false; moveEnt(e, e.sx, e.sz, T.speed * (e.spdMul || 1) * 1.1, dt, true); return; }
  if (e.target && !e.target.alive) e.target = null;
  if (e.think <= 0) {
    e.think = 0.25 + Math.random() * 0.2;
    let r = S.mode === 'charge' ? 30 : S.mode === 'move' ? 3.5 : 12;
    if (T.shoot && !S.moving) r = T.shoot;
    e.target = nearestEnemy(e, r);
  }
  let gx = e.sx, gz = e.sz, faceMove = true; const t = e.target;
  e.blocking = (S.form === 'shieldwall' || T.big) && !!e.shieldKind && !(e.anim > 0);
  e.ready = !!t && !T.shoot && Math.abs(t.x - e.x) + Math.abs(t.z - e.z) < 9;
  if (t) {
    const dx = t.x - e.x, dz = t.z - e.z, d = Math.hypot(dx, dz);
    if (!T.shoot && Math.hypot(e.x - e.sx, e.z - e.sz) > (S.mode === 'charge' ? 70 : 28)) { e.target = null; e.think = 1.2; }
    else if (T.shoot && d > 6) {
      faceMove = false; e.face = lerpAngle(e.face, Math.atan2(dx, dz), dt * 8);
      if (e.scd <= 0) { e.scd = T.shootCd * (0.8 + Math.random() * 0.4); fireArrow(e, t); e.anim = e.animDur = 1.0; }
    } else {
      faceMove = false; e.face = lerpAngle(e.face, Math.atan2(dx, dz), dt * 10);
      const reach = st.range + (t.mounted ? 0.5 : 0);
      if (d > reach * 0.85) { gx = t.x; gz = t.z; } else { gx = e.x; gz = e.z; }
      if (d <= reach && e.cd <= 0) { e.cd = st.cd * (0.8 + Math.random() * 0.4); e.anim = e.animDur = Math.min(0.75, (SWINGS[e.swing] || SWINGS.diag).dur); dealDamage(e, t, st.dmg * 0.6 * (0.7 + Math.random() * 0.6), false, e.W && e.W.pierce); }
    }
  }
  moveEnt(e, gx, gz, T.speed * (e.spdMul || 1), dt, faceMove);
}

// ===== 伝令 =====
function sendOrder(team, s, order) {
  const src = heroes[team]; if (!src.alive || !s.alive.length) return;
  msgs.push({ team, squad: s, order, x: src.x, z: src.z, y: src.y, face: 0, chk: 0, cyc: Math.random() }); s.pending++;
  const eta = Math.hypot(s.cx - src.x, s.cz - src.z) / MSG_SPEED;
  teamLog(team, `第${s.num}隊(${s.T.name})へ伝令 → ${order.form ? FORMS[order.form].name + 'に組め' : MODE_JP[order.mode]}　到着まで約${Math.ceil(eta)}秒`, '#cde');
}
function applyOrder(s, o) {
  if (o.form && FORMS[o.form]) s.form = o.form;
  s.tface = typeof o.face === 'number' ? o.face : null;
  if (o.mode === 'hold') { s.tx = s.ax; s.tz = s.az; s.mode = 'hold'; }
  else if (o.mode === 'follow') s.mode = 'follow';
  else { s.tx = o.x; s.tz = o.z; s.mode = o.mode; }
}
function updateMsgs(dt) {
  for (let i = msgs.length - 1; i >= 0; i--) { const m = msgs[i], s = m.squad;
    if (!s.alive.length) { msgs.splice(i, 1); s.pending--; continue; }
    const dx = s.cx - m.x, dz = s.cz - m.z, d = Math.hypot(dx, dz);
    if (d < 3.5 && s.mode === 'flee') { s.pending--; msgs.splice(i, 1); teamLog(m.team, `第${s.num}隊は混乱していて命令を聞けない`, '#f86'); continue; }
    if (d < 3.5) { applyOrder(s, m.order); s.pending--; msgs.splice(i, 1); teamLog(m.team, `第${s.num}隊 命令受領：${m.order.form ? FORMS[m.order.form].name : MODE_JP[m.order.mode]}`, '#9f9'); continue; }
    const sl = clamp(1 - (H(m.x + dx / d * 2, m.z + dz / d * 2) - H(m.x, m.z)) / 2 * 0.8, 0.5, 1.2);
    const st = Math.min(d, MSG_SPEED * sl * dt); m.face = Math.atan2(dx, dz); m.x += dx / d * st; m.z += dz / d * st; m.y = H(m.x, m.z); m.cyc += 14 / 6.2 * dt;
    m.chk -= dt; if (m.chk <= 0) { m.chk = 0.2; let hit = false; forNear(m.x, m.z, 2.5, o => { if (!ally(o.team, m.team) && o.alive && !o.rout && Math.hypot(o.x - m.x, o.z - m.z) < 2.5) hit = true; });
      if (hit) { s.pending--; msgs.splice(i, 1); teamLog(m.team, `第${s.num}隊への伝令が討たれた！`, '#f86'); } }
  }
}

// ===== 索敵 =====
function spotters(team) {
  const sp = []; for (const s of squads) if (ally(s.team, team) && s.alive.length && s.mode !== 'rout') sp.push([s.cx, s.cz, H(s.cx, s.cz), 60]);
  for (let t = 0; t < NT; t++) { const h = heroes[t]; if (ally(t, team) && h && h.alive) sp.push([h.x, h.z, h.y + (h.mounted ? 1 : 0), 90]); }
  if (zone && zone.holder >= 0 && ally(zone.holder, team)) sp.push([zone.x, zone.z, H(zone.x, zone.z) + 6, 120]); // 丘を押さえると遠くまで見渡せる
  return sp;
}
function canSee(sp, e) { const ey = e.y ?? H(e.x, e.z), fk = forestAt(e.x, e.z) ? 0.45 : 1; for (const [x, z, y, r] of sp) { const R = (r + clamp((y - ey) * 3, 0, 60)) * fk, dx = e.x - x, dz = e.z - z; if (dx * dx + dz * dz < R * R) return true; } return false; }

// ===== CPU指揮官 =====
function aiThink(team) {
  if (elim[team] || !heroes[team].alive) return;
  const sp = spotters(team), groups = [], F = teamFrame(team);
  for (const s of squads) if (!ally(s.team, team) && s.alive.length && s.mode !== 'rout') { const v = s.alive.filter(m => canSee(sp, m)); if (v.length) { let x = 0, z = 0; for (const m of v) { x += m.x; z += m.z; } groups.push({ x: x / v.length, z: z / v.length, type: s.type, n: v.length }); } }
  for (let t = 0; t < NT; t++) { const foe = heroes[t]; if (!ally(t, team) && foe.alive && canSee(sp, foe)) groups.push({ x: foe.x, z: foe.z, type: 'hero', n: 1 }); }
  const mine = squads.filter(s => s.team === team && s.alive.length && s !== guards[team] && s.mode !== 'rout' && s.mode !== 'flee');
  let mx = F.bx, mz = F.bz; if (mine.length) { mx = 0; mz = 0; for (const s of mine) { mx += s.cx; mz += s.cz; } mx /= mine.length; mz /= mine.length; }
  // 目標：区域があればそこ、なければ見えている敵、見えなければ一番近い生きている敵の本陣へ少しずつ進む
  let obj;
  if (zone) obj = { x: zone.x + F.b[0] * 8, z: zone.z + F.b[1] * 8 };
  else if (MAP === 'mountain') { const sg = SIDE[team] === SIDE[0] ? 1 : -1; obj = { x: valleyX(6 * sg), z: 6 * sg }; }
  else if (groups.length) { let best = null, bd = 1e9; for (const g of groups) { const d = Math.hypot(g.x - mx, g.z - mz); if (d < bd) { bd = d; best = g; } } obj = { x: best.x + F.b[0] * 20, z: best.z + F.b[1] * 20 }; }
  else { let best = null, bd = 1e9; for (let t = 0; t < NT; t++) { if (ally(t, team) || elim[t]) continue; const G = teamFrame(t), d = Math.hypot(G.bx - F.bx, G.bz - F.bz); if (d < bd) { bd = d; best = G; } }
    if (!best) best = { bx: 0, bz: 0 }; const dx = best.bx - F.bx, dz = best.bz - F.bz, L = Math.hypot(dx, dz) || 1, p = clamp(gameT * 1.4 - 20, 0, L * 0.5); obj = { x: F.bx + dx / L * p, z: F.bz + dz / L * p }; }
  let fx = obj.x - F.bx, fz = obj.z - F.bz; { const L = Math.hypot(fx, fz); if (L < 20) { fx = -F.b[0]; fz = -F.b[1]; } else { fx /= L; fz /= L; } }
  const lx = -fz, lz = fx, bx = -fx, bz = -fz; // 横と後ろ（目標に向いたときの）
  const at = (l, d) => ({ x: clamp(obj.x + lx * l + bx * d, -WALL, WALL), z: clamp(obj.z + lz * l + bz * d, -WALL, WALL) });
  for (const s of mine) {
    if (s.pending) continue;
    let near = null, nd = 1e9; for (const g of groups) { const d = Math.hypot(g.x - s.cx, g.z - s.cz); if (d < nd) { nd = d; near = g; } }
    let o; const hp = at(s.home.lx, s.home.d);
    if (s.type === 'cav') {
      let tg = null, td = 1e9; for (const g of groups) { if (!(g.type === 'archer' || g.type === 'hero' || g.n < 8)) continue; const d = Math.hypot(g.x - s.cx, g.z - s.cz); if (d < td) { td = d; tg = g; } }
      if (tg && td < 160) o = { x: tg.x, z: tg.z, mode: 'charge' };
      else if (near && nd < 25) o = { x: near.x, z: near.z, mode: 'charge' };
      else o = { ...at(s.home.lx * 1.3, s.home.d + 15), mode: 'move' };
    } else if (s.type === 'archer') { if (near && nd < 65) o = { x: s.ax, z: s.az, mode: 'hold' }; else o = { ...hp, mode: 'move' }; }
    else { if (near && nd < 40) o = { x: near.x, z: near.z, mode: 'charge' }; else o = { ...hp, mode: 'move' }; }
    if (o.mode === 'hold' && s.mode === 'hold') continue;
    if (o.mode !== s.mode || Math.hypot(o.x - s.tx, o.z - s.tz) > 12) sendOrder(team, s, o);
  }
  const h = heroes[team], g = guards[team];
  if (h.squad && g && mine.length) { const back = h.hp < h.T.hp * 0.4 ? 70 : 40; g.tx = clamp(mx + bx * back, -WALL, WALL); g.tz = clamp(mz + bz * back, -WALL, WALL); g.mode = 'move'; }
}

// ===== 勝敗：将が討たれた軍は総崩れ。最後に将が残った軍の勝ち =====
function objectives(dt) {
  if (zone) { const c = new Array(NT).fill(0); for (const e of ents) if (e.alive && !e.rout && Math.hypot(e.x - zone.x, e.z - zone.z) < zone.r) c[e.team]++; zone.c = c;
    let hold = -1, k = 0; for (let t = 0; t < NT; t++) if (c[t] && SIDE[t] !== hold) { hold = SIDE[t]; k++; } zone.holder = k === 1 ? hold : -1;
    if (zone.holder >= 0) for (const e of ents) if (e.alive && ally(e.team, zone.holder) && e.hp < e.T.hp && Math.hypot(e.x - zone.x, e.z - zone.z) < zone.r) e.hp = Math.min(e.T.hp, e.hp + (e.type === 'hero' ? 6 : 1.5) * dt); }
  for (let t = 0; t < NT; t++) if (!elim[t] && !heroes[t].alive) eliminate(t);
  const left = new Set(); for (let t = 0; t < NT; t++) if (!elim[t]) left.add(SIDE[t]);
  if (left.size <= 1) finish(left.size ? [...left][0] : -1, 'gen');
}
function eliminate(t) {
  if (elim[t]) return; elim[t] = true; const left = elim.filter(x => !x).length; place[t] = left + 1;
  for (const s of squads) if (s.team !== t && ally(s.team, t) && s.alive.length && Math.hypot(s.cx - heroes[t].x, s.cz - heroes[t].z) < 80) s.mor -= 25; // 味方の将が討たれると近くの兵は動揺
  for (const s of squads) if (!ally(s.team, t) && s.alive.length) s.mor = Math.min(100, s.mor + 20);
  for (const s of squads) if (s.team === t) { s.mode = 'rout'; s.pending = 0; s.reinfT = 0; for (const m of s.members) if (m.alive) { m.rout = true; m.routT = 5 + Math.random() * 7; } }
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].team === t) msgs.splice(i, 1);
  const by = heroes[t].killer, who = by >= 0 && !ally(by, t) ? `${TEAM_NAME[by]}軍が` : '';
  if (NET.mode === 'host') pushEv(['elim', t, place[t], by ?? -1]);
  onEliminated(t, place[t], by);
  log(`${who}${TEAM_NAME[t]}軍の将を討ち取った！ ${TEAM_NAME[t]}軍は総崩れ`, TEAM_CSS[t]);
}
// 自分の軍が負けたときの画面（観戦を続けられる）
function onEliminated(t, pl, by) {
  elim[t] = true; place[t] = pl;
  if (t === ME && !ended) { document.exitPointerLock?.();
    $('endt').textContent = '討ち死に'; $('endt').style.color = '#e55';
    $('ends').innerHTML = `${by >= 0 && !ally(by, t) ? TEAM_NAME[by] + '軍に' : ''}討たれた… ${COOP ? (SIDE.slice(0, NT).filter((x, u) => x === SIDE[ME] && !elim[u]).length ? '味方の将はまだ戦っている' : '') : NT > 2 ? `${NT}軍中 ${pl}位` : ''}<br>戦闘時間 ${fmtT(gameT)} ／ あなたの撃破数 ${player.kills}`;
    $('spec').style.display = 'inline-block'; $('end').style.display = 'flex'; }
}
const fmtT = t => `${Math.floor(t / 60)}分${Math.floor(t % 60)}秒`;
function finish(win, kind) { if (ended) return; if (NET.mode === 'host') pushEv(['end', win, kind]); end(win, kind); }
function end(winTeam, kind) {
  if (ended) return; ended = true; running = !!spectate; document.exitPointerLock?.();
  const win = winTeam >= 0 && ally(winTeam, ME);
  $('endt').textContent = kind === 'drop' ? '中断' : win ? '勝利' : '敗北'; $('endt').style.color = kind === 'drop' ? '#ccc' : win ? '#e8c77a' : '#e55';
  const why = kind === 'drop' ? 'ホストとの接続が切れた' : win ? (COOP ? (ODDS > 1 ? `${ODDS}倍の敵に勝った！ 敵将をすべて討ち取った` : '敵将をすべて討ち取った！') : NT > 2 ? `最後まで生き残った！ ${NT}軍の頂点` : '敵将を討ち取った！') : COOP ? '味方の将がすべて討たれた…' : winTeam >= 0 ? `${TEAM_NAME[winTeam]}軍の勝利${elim[ME] && NT > 2 ? `（あなたは ${place[ME]}位）` : ''}` : '引き分け';
  $('ends').innerHTML = `${why}<br>戦闘時間 ${fmtT(gameT)} ／ あなたの撃破数 ${player.kills}`; $('spec').style.display = 'none'; $('end').style.display = 'flex';
}

// ===== 将の攻撃 =====
function startAttack(h) {
  const sw = SWINGS[h.swing] || SWINGS.diag, W = h.W;
  h.animDur = Math.max(sw.dur, W.cd * 0.95); h.anim = h.animDur; h.cd = W.cd; h.hitAt = h.animDur * sw.hit;
  if (h === player) { VM.swing = 0; SFX.whoosh(W.cd > 0.8); }
}
function heroTargets(h) {
  const W = h.W, range = W.range + (h.mounted ? 0.7 : 0), fx = Math.sin(h.face), fz = Math.cos(h.face), hits = [];
  forNear(h.x, h.z, range + 0.5, o => { if (ally(o.team, h.team) || !o.alive) return; const dx = o.x - h.x, dz = o.z - h.z, d = Math.hypot(dx, dz);
    if (d > range + radOf(o) * 0.5 || (dx * fx + dz * fz) / (d || 1) < W.cone || Math.abs(o.y - h.y) > (h.mounted ? 3.4 : 2.5)) return; hits.push([d, o]); });
  hits.sort((a, b) => a[0] - b[0]); return hits.slice(0, W.maxHits);
}
function heroAttack(h, given) {
  const W = h.W, hs = h.mounted && horses[h.team] ? Math.abs(horses[h.team].spd) : 0;
  const hits = given || heroTargets(h);
  let mul = (1 + hs / 14); if (W.lance) mul = h.mounted ? 1 + hs / 3.2 : 0.8;
  for (const [d, o] of hits) { dealDamage(h, o, W.dmg * mul * (0.85 + Math.random() * 0.3), false, W.pierce);
    if (o.type !== 'hero') { const k = (1.3 + hs * 0.08) / (d || 1); o.x += (o.x - h.x) * k * 0.6; o.z += (o.z - h.z) * k * 0.6; } }
  if (h === player && hits.length) { const el = $('hitm'); el.style.opacity = 1; setTimeout(() => el.style.opacity = 0, 120); }
  return hits.length;
}
function playerAttack() {
  const p = player; if (p.cd > 0 || !p.alive || ended || p.anim > 0.05) return;
  startAttack(p);
  if (NET.mode === 'guest') pushEv(['a']);
}
// ゲスト：自分の画面で当たった相手をホストに伝える（遅れによる空振りを防ぐ）
function guestHit(p) {
  const hits = heroTargets(p); if (hits.length) { pushEv(['h', ...hits.map(([d, o]) => o.id)]); const el = $('hitm'); el.style.opacity = 1; setTimeout(() => el.style.opacity = 0, 120);
    CAM.hitstop = 0.05; CAM.kick = Math.min(1, CAM.kick + 0.5); for (const [d, o] of hits) { FX.spark(o.x, o.y + 1.25, o.z, 7); SFX.clash(o.x, o.z, false); o.hitAge = 0; } }
}
function tryMount() {
  const p = player, h = horses[ME]; if (!p.alive || !h) return;
  if (p.mounted) { p.mounted = false; const lx = Math.cos(h.face), lz = -Math.sin(h.face); p.x = h.x + lx * 1.3; p.z = h.z + lz * 1.3; p.y = H(p.x, p.z); h.spd = 0; log('下馬した', '#ccb'); }
  else if (Math.hypot(p.x - h.x, p.z - h.z) < 3.5) { p.mounted = true; h.spd = 0; log('騎乗した（W/S 速度, A/D 向き, Shift 全速力）', '#ccb'); }
  else log('馬が遠い（Tab の地図で ♞ の位置を確認）', '#fa8');
}

// ===== プレイヤー =====
function updatePlayer(dt) {
  const p = player; if (!p.alive) { specCam(dt); return; }
  p.cd -= dt; const adt = CAM.hitstop > 0 ? dt * 0.15 : dt; p.anim = Math.max(0, p.anim - adt);
  if (p.hitAt > 0) { p.hitAt -= adt; if (p.hitAt <= 0) { if (NET.mode === 'guest') guestHit(p); else heroAttack(p); } }
  p.headP = clamp(pitch * 0.55, -0.5, 0.4);
  const ctl = !mapOpen && !ended && !dragging, h = horses[ME];
  if (p.mounted && h) {
    let target = 0; if (ctl && keys.KeyW) target = (keys.ShiftLeft || keys.ShiftRight) ? 15 : 8; if (ctl && keys.KeyS) target = -2.5;
    h.spd += clamp(target - h.spd, -9 * dt, (target > h.spd ? 4.5 : 9) * dt);
    let tr = 0; if (ctl && keys.KeyA) tr += 1; if (ctl && keys.KeyD) tr -= 1;
    h.face += tr * dt * (1.8 - Math.min(1, Math.abs(h.spd) / 15) * 0.6);
    if (ctl && keys.KeyW && !tr) h.face = lerpAngle(h.face, yaw + Math.PI, dt * 0.9 * clamp(Math.abs(angDiff(h.face, yaw + Math.PI)) < 1.6 ? 1 : 0, 0, 1));
    const fx = Math.sin(h.face), fz = Math.cos(h.face); let sp = h.spd;
    if (Math.abs(sp) > 0.1) { const ah = H(h.x + fx * 2 * Math.sign(sp), h.z + fz * 2 * Math.sign(sp)); sp *= clamp(1 - (ah - h.y) / 2 * 0.7, 0.45, 1.15) * slowAt(h.x, h.z); }
    let vx = fx * sp, vz = fz * sp;
    forNear(h.x, h.z, 2, o => { if (o === p) return; const sx = h.x - o.x, sz = h.z - o.z, sd = sx * sx + sz * sz, R = 0.95 + radOf(o); if (sd < R * R && sd > 1e-6) { const s = Math.sqrt(sd), k = (R - s) / R * (ally(o.team, p.team) ? 1 : 2.5); vx += sx / s * k; vz += sz / s * k;
      if (!ally(o.team, p.team) && Math.abs(h.spd) > 7 && (o.trampleT || 0) < gameT && o.type !== 'hero') { o.trampleT = gameT + 0.8; dealDamage(p, o, 8 + Math.abs(h.spd) * 1.2, false); o.x -= sx / s * 1.4; o.z -= sz / s * 1.4; SFX.thud(o.x, o.z); } } });
    h.x = clamp(h.x + vx * dt, -WALL, WALL); h.z = clamp(h.z + vz * dt, -WALL, WALL); if (phase === 'deploy') [h.x, h.z] = clampDeploy(ME, h.x, h.z); h.y = H(h.x, h.z);
    advanceHorse(h, dt);
    if (Math.abs(h.spd) > 8 && frameNo % 3 === 0) FX.dust(h.x - fx * 0.8, h.y + 0.2, h.z - fz * 0.8);
    { const beat = Math.floor(h.cyc * (h.gait === 3 ? 4 : 2)); if (beat !== h._beat) { h._beat = beat; if (Math.abs(h.spd) > 1) SFX.thud(h.x, h.z, h.gait === 3 ? 0.5 : 0.3); } }
    p.x = h.x; p.z = h.z; p.y = h.y; p.spd = Math.abs(h.spd); p.face = yaw + Math.PI; p.look = clamp(angDiff(h.face, yaw + Math.PI), -1.3, 1.3);
  } else {
    p.look = 0;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let mx = 0, mz = 0;
    if (ctl) { if (keys.KeyW) { mx += fx; mz += fz; } if (keys.KeyS) { mx -= fx; mz -= fz; } if (keys.KeyD) { mx += rx; mz += rz; } if (keys.KeyA) { mx -= rx; mz -= rz; } }
    const l = Math.hypot(mx, mz);
    let sp = (keys.ShiftLeft || keys.ShiftRight ? 7.6 : 4.8) * (p.blocking ? 0.5 : 1) * (p.spdMul || 1);
    if (l > 0) { mx /= l; mz /= l; const ah = H(p.x + mx * 1.5, p.z + mz * 1.5), g = H(p.x, p.z); sp *= clamp(1 - (ah - g) / 1.5 * 0.6, 0.55, 1.2) * slowAt(p.x, p.z); }
    let vx = mx * sp, vz = mz * sp;
    forNear(p.x, p.z, 1.8, o => { if (o === p) return; const sx = p.x - o.x, sz = p.z - o.z, sd = sx * sx + sz * sz, R = p.T.rad + radOf(o); if (sd < R * R && sd > 1e-6) { const s = Math.sqrt(sd), k = (R - s) / R * 4; vx += sx / s * k; vz += sz / s * k; } });
    p.x = clamp(p.x + vx * dt, -WALL, WALL); p.z = clamp(p.z + vz * dt, -WALL, WALL); if (phase === 'deploy') [p.x, p.z] = clampDeploy(ME, p.x, p.z); p.spd = l > 0 ? sp : 0; advanceWalk(p, dt);
    p.vy = (p.vy || 0) - 22 * dt; p.y += p.vy * dt; const gr = H(p.x, p.z); if (p.y <= gr) { p.y = gr; p.vy = 0; p.onGround = true; }
    if (ctl && keys.Space && p.onGround) { p.vy = 7; p.onGround = false; } p.air = !p.onGround;
    p.face = yaw + Math.PI;
    if (h) { h.spd *= Math.max(0, 1 - dt * 2); advanceHorse(h, dt); }
  }
}
function aimPoint() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); const o = camera.position;
  for (let t = 2; t < 500; t += 1.5) { const x = o.x + dir.x * t, y = o.y + dir.y * t, z = o.z + dir.z * t; if (y < H(x, z)) return { x, z }; }
  return { x: o.x + dir.x * 300, z: o.z + dir.z * 300 };
}
// 観戦：討ち死にしたあとは WASD で空から戦場を見て回れる
const SPEC = { x: 0, y: 0, z: 0, on: false };
function specCam(dt) {
  if (!spectate) return; if (!SPEC.on) { SPEC.on = true; SPEC.x = player.x; SPEC.z = player.z; SPEC.y = player.y + 25; pitch = -0.5; }
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw), sp = (keys.ShiftLeft ? 80 : 35) * dt;
  if (keys.KeyW) { SPEC.x += fx * sp; SPEC.z += fz * sp; } if (keys.KeyS) { SPEC.x -= fx * sp; SPEC.z -= fz * sp; } if (keys.KeyD) { SPEC.x += rx * sp; SPEC.z += rz * sp; } if (keys.KeyA) { SPEC.x -= rx * sp; SPEC.z -= rz * sp; }
  if (keys.Space) SPEC.y += sp; if (keys.ControlLeft || keys.KeyC) SPEC.y -= sp;
  SPEC.x = clamp(SPEC.x, -WALL, WALL); SPEC.z = clamp(SPEC.z, -WALL, WALL); SPEC.y = clamp(SPEC.y, H(SPEC.x, SPEC.z) + 3, 160);
}
// 布陣中の命令はその場で反映（伝令なし）。陣地の外には置けない
function deployApply(s, o, quiet) {
  if (o.mode === 'follow') { s.mode = s.mode === 'follow' ? 'hold' : 'follow'; s.escort = s.mode === 'follow'; if (s.escort) { const [x, z] = s.followPoint(); [s.ax, s.az] = clampDeploy(s.team, x, z); s.face = heroes[s.team].face; } }
  else { if (o.x !== undefined) { [s.ax, s.az] = clampDeploy(s.team, o.x, o.z); if (s.mode === 'follow') { s.mode = 'hold'; s.escort = false; } } if (o.form && FORMS[o.form]) s.form = o.form; if (typeof o.face === 'number') s.face = o.face; }
  s.tx = s.ax; s.tz = s.az; s.tface = null; if (s.mode !== 'follow') s.mode = 'hold'; s.snap(); hudT = 0;
  if (NET.mode === 'guest' && !quiet) pushEv(['d', s.idx, +s.ax.toFixed(1), +s.az.toFixed(1), +s.face.toFixed(3), FORM_IDS.indexOf(s.form), s.mode === 'follow' ? 1 : 0]);
}
function issueOrder(s, o) {
  if (phase === 'deploy') return deployApply(s, o);
  if (NET.mode === 'guest') { pushEv(['o', s.idx, o.mode, +(o.x || 0).toFixed(1), +(o.z || 0).toFixed(1), o.form || '', typeof o.face === 'number' ? +o.face.toFixed(3) : null]); log(`第${s.num}隊へ伝令を準備中…`, '#99a'); }
  else sendOrder(ME, s, o);
}
function orderSelected(mode, pt) {
  if (!player.alive || ended) return;
  const sel = [...selected].map(n => squads.find(s => s.team === ME && s.num === n)).filter(s => s && s.alive.length);
  if (!sel.length) { log('部隊が選択されていない（数字キーで選択）', '#fa8'); return; }
  if (mode === 'hold') { for (const s of sel) issueOrder(s, { mode: 'hold' }); return; }
  if (mode === 'rally') { for (const s of sel) { if (s.escort) { if (s.mode !== 'follow') issueOrder(s, { mode: 'follow' }); } else issueOrder(s, { mode: 'move', x: player.x + (Math.random() - 0.5) * 20, z: player.z + (Math.random() - 0.5) * 20 }); } return; }
  if (mode === 'escort') { // 護衛にする／外す
    for (const s of sel) { if (phase === 'deploy') deployApply(s, { mode: 'follow' }); else if (s.mode === 'follow') { s.escort = false; issueOrder(s, { mode: 'hold' }); } else { s.escort = true; issueOrder(s, { mode: 'follow' }); } }
    log(`${sel.map(s => s.num).join('・')}番隊：${sel[0].escort ? '将の護衛につく' : '護衛を外れる'}`, '#e8c77a'); return; }
  let gx = 0, gz = 0; for (const s of sel) { gx += s.ax; gz += s.az; } gx /= sel.length; gz /= sel.length;
  for (const s of sel) issueOrder(s, { mode, x: clamp(pt.x + (s.ax - gx), -WALL, WALL), z: clamp(pt.z + (s.az - gz), -WALL, WALL) });
}

// 陣形の命令：1部隊ならその場で組み直す。複数なら軍全体を並べ直す（横一列・縦一列・方陣・楔形）
function selectedSquads() { return [...selected].map(n => squads.find(s => s.team === ME && s.num === n)).filter(s => s && s.alive.length); }
function orderFormation(form) {
  if (!player.alive || ended) return;
  const sel = selectedSquads(); if (!sel.length) { log('部隊が選択されていない（数字キーで選択してから Q＋数字）', '#fa8'); return; }
  let F; if (mapOpen) { let sx = 0, sz = 0; for (const s of sel) { sx += Math.sin(s.face); sz += Math.cos(s.face); } F = Math.atan2(sx, sz); } else F = yaw + Math.PI;
  const fx = Math.sin(F), fz = Math.cos(F), rx = -Math.cos(F), rz = Math.sin(F); // rx,rz = キャラの右
  if (sel.length === 1) { issueOrder(sel[0], { mode: 'hold', form, face: F }); return; }
  let cx = 0, cz = 0; for (const s of sel) { cx += s.cx; cz += s.cz; } cx /= sel.length; cz /= sel.length;
  const dims = new Map(sel.map(s => [s, formDims(form, s.type, s.alive.length, s.T.sp)])), gap = 4, place = [];
  if (form === 'column') { // 前から順に一本の列へ
    sel.sort((a, b) => ((b.cx - cx) * fx + (b.cz - cz) * fz) - ((a.cx - cx) * fx + (a.cz - cz) * fz));
    const tot = sel.reduce((t, s) => t + dims.get(s).d + gap, -gap); let off = tot / 2;
    for (const s of sel) { const d = dims.get(s).d; place.push([s, 0, off]); off -= d + gap; }
  } else if (form === 'wedge') { // 先頭から V 字に
    sel.sort((a, b) => ((b.cx - cx) * fx + (b.cz - cz) * fz) - ((a.cx - cx) * fx + (a.cz - cz) * fz));
    sel.forEach((s, i) => { const k = Math.ceil(i / 2), sd = i % 2 ? 1 : -1, w = dims.get(s).w; place.push([s, i ? sd * k * (w * 0.75 + gap) : 0, -k * (dims.get(s).d + gap)]); });
  } else if (form === 'block') { // 2列の碁盤目
    sel.sort((a, b) => ((a.cx - cx) * rx + (a.cz - cz) * rz) - ((b.cx - cx) * rx + (b.cz - cz) * rz));
    const cols = Math.ceil(sel.length / 2), w = Math.max(...sel.map(s => dims.get(s).w)) + gap, d = Math.max(...sel.map(s => dims.get(s).d)) + gap;
    sel.forEach((s, i) => place.push([s, ((i % cols) - (cols - 1) / 2) * w, -Math.floor(i / cols) * d + d / 2]));
  } else { // 横一列に並べる
    sel.sort((a, b) => ((a.cx - cx) * rx + (a.cz - cz) * rz) - ((b.cx - cx) * rx + (b.cz - cz) * rz));
    const tot = sel.reduce((t, s) => t + dims.get(s).w + gap, -gap); let off = -tot / 2;
    for (const s of sel) { const w = dims.get(s).w; place.push([s, off + w / 2, 0]); off += w + gap; }
  }
  for (const [s, lx, lz] of place) issueOrder(s, { mode: 'move', x: clamp(cx + rx * lx + fx * lz, -WALL, WALL), z: clamp(cz + rz * lx + fz * lz, -WALL, WALL), form, face: F });
  log(`${sel.length}部隊に陣形「${FORMS[form].name}」を伝令`, '#e8c77a');
}
function showFormMenu(v) { const m = $('formMenu'); if (m) m.style.display = v ? 'flex' : 'none'; }

// ===== HUD =====
let hudT = 0;
function updateHUD(dt) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.2;
  $('hpfill').style.width = (player.hp / player.T.hp * 100) + '%';
  $('dmg').style.boxShadow = 'inset 0 0 160px rgba(160,0,0,0)';
  const mine = squads.filter(s => s.team === ME && typeof s.num === 'number').sort((a, b) => ((a.num + 9) % 10) - ((b.num + 9) % 10));
  $('squads').innerHTML = mine.map(s => {
    const n = s.alive.length; const etas = msgs.filter(m => m.squad === s).map(m => Math.hypot(s.cx - m.x, s.cz - m.z) / MSG_SPEED);
    const st = n ? (s.mode === 'flee' ? '<span style="color:#f86">潰走中</span>' : s.engaged > 0.2 ? '<span style="color:#f88">交戦中</span>' : MODE_JP[s.mode]) : '全滅';
    const mo = n ? `<i class="mor" title="士気"><i style="width:${Math.round(s.mor)}%;background:${s.mor > 60 ? '#7c6' : s.mor > 30 ? '#db4' : '#e54'}"></i></i>` : '';
    const rf = s.reinfT ? ` <span style="color:#9cf">援軍${Math.max(0, Math.ceil(s.reinfT - gameT))}秒</span>` : '';
    return `<div class="sq ${selected.has(s.num) ? 'sel' : ''} ${n ? '' : 'dead'}"><b>${s.num}</b> ${s.T.name} <span class="cnt">${n}/${s.full}</span> ${mo}<span class="fm2">${FORMS[s.form].name}</span> ${st}${etas.length ? ` ✉${Math.ceil(Math.min(...etas))}秒` : ''}${rf}</div>`;
  }).join('');
  const armies = [...Array(NT).keys()].map(t => `<span style="color:${TEAM_CSS[t]};${elim[t] ? 'opacity:.4;text-decoration:line-through' : ''}">${TEAM_NAME[t]}${t === ME ? '(あなた)' : COOP && ally(t, ME) ? '(味方)' : ''}</span>`).join(' ');
  let o;
  if (phase === 'deploy') o = `<b style="color:#e8c77a">布陣</b>　開戦まで ${Math.ceil(deployT)}秒　<span style="font-size:12px">Tab の地図で部隊をドラッグして配置 ／ ${NET.mode === 'solo' ? 'Enter で開戦' : 'Enter で準備完了'}</span>`;
  else if (zone) { const hd = zone.holder ?? -1; o = `敵将を討て ／ ${MAPS[MAP].zone ? (MAP === 'mesa' ? '中央台地' : '丘') : ''}：${hd >= 0 ? `<span style="color:${TEAM_CSS[hd]}">${COOP ? (ally(hd, ME) ? '味方' : '敵') : TEAM_NAME[hd] + '軍'}が確保</span>` : '争奪中'}`; }
  else o = COOP ? `協力戦　敵将をすべて討ち取れ${ODDS > 1 ? `（敵は${ODDS}倍）` : ''}` : NT > 2 ? '乱戦　最後まで将が生き残った軍の勝ち' : '敵将を討ち取れ（敵軍の後方にいる）';
  const al = ents.filter(e => ally(e.team, ME) && e.alive).length, seen = ents.filter(e => !ally(e.team, ME) && e.alive && e.seen).length;
  $('obj').innerHTML = `${o}<br>${armies}　｜　味方 ${al}　見えている敵 ${seen}${spectate ? '　<span style="color:#9cf">観戦中（WASD・Space/C で移動）</span>' : ''}`;
  const h = horses[ME], near = h && !player.mounted && Math.hypot(player.x - h.x, player.z - h.z) < 3.5;
  $('hint').innerHTML = `<b>F</b> 照準へ移動 <b>C</b> 突撃 <b>H</b> 待機 <b>R</b> 集結 <b>G</b> 護衛 <b>T</b> 構え<br><b>Tab</b> 地図 <b>1-0</b> 部隊 <b>@</b> 全部隊 <b>V</b> 視点 <b>E</b> ${player.mounted ? '下馬' : '乗馬'}<br><b>Q</b>＋数字 陣形（横隊・一列・縦隊・方陣・楔形・散開・盾壁）`;
  $('wpninfo').innerHTML = `${WEAPONS[player.wpn].name}　${ARMORS[heroArmor[ME]].name}${player.mounted ? `　<span style="color:#e8c77a">騎乗中 ${Math.round(Math.abs(h.spd) * 3.6)}km/h</span>` : near ? '　<span style="color:#e8c77a">E で乗馬</span>' : ''}`;
  $('lockmsg').style.display = (document.pointerLockElement || mapOpen || TEST || ended || $('end').style.display === 'flex') ? 'none' : 'block';
  $('netinfo').textContent = NET.mode === 'solo' ? '' : `オンライン（${NET.mode === 'host' ? 'ホスト' : 'ゲスト'}・${NET.via}）部屋 ${NET.room}　${NET.ping ? `遅延 約${NET.ping}ms` : ''}`;
  const rb = $('readyBtn'); if (rb) { rb.style.display = phase === 'deploy' ? 'inline-block' : 'none'; rb.textContent = NET.mode === 'solo' ? `開戦（残り${Math.ceil(deployT)}秒）` : ready.has(ME) ? `準備完了（他の将を待っています ${Math.ceil(deployT)}秒）` : `準備完了（残り${Math.ceil(deployT)}秒）`; }
  let fight = 0; for (const s of squads) if (s.engaged > 0.1 && Math.hypot(s.cx - player.x, s.cz - player.z) < 90) fight += s.engaged * s.alive.length; SFX.ambient(fight / 160);
}

// =====================================================================
// 描画
// =====================================================================
let MAT, crowds = [[], []], heroRigs = [null, null], msgCrowds = [null, null], IMarrow, flagIM = [], poleIM, bannerList = [], aimRing, mapImg, mapC, fogC, sun, skyObj, grassIM, grassCenter = null, windU = { value: 0 };
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const TREES = [], O = newOut(), P = newPose(), MW = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

// 兵士をまとめて描くクラス（体のパーツごとに1つの InstancedMesh）
class Crowd {
  constructor(team, armorId, cap, kinds) {
    const b = buildBody(team, armorId, false), mk = (geo, n) => { const im = new THREE.InstancedMesh(geo, MAT, n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; for (let i = 0; i < n; i++) im.setMatrixAt(i, ZERO); scene.add(im); this.all.push(im); return im; };
    this.all = []; this.cap = cap; this.parts = {};
    for (const k of SIDED) if (b[k]) this.parts[k] = mk(b[k], cap * 2);
    for (const k of SINGLE) if (b[k]) this.parts[k] = mk(b[k], cap);
    this.lhead = kinds.light ? mk(buildLightHelm(team, false), cap) : null;
    this.wpn = {}; for (const k of kinds.wpn) this.wpn[k] = mk(buildWeapon(k, team, false), cap);
    this.shd = {}; for (const k of kinds.shd) this.shd[k] = mk(buildShield(team, k, false), cap);
    if (kinds.horse) { const hp = buildHorse(team, kinds.horse, false, armorId); this.hb = mk(hp.body, cap); this.hn = mk(hp.neck, cap); this.hl = mk(hp.leg, cap * 4); this.hd = mk(hp.legL, cap * 4); }
  }
  write(i, e, O, horse) {
    const P = this.parts;
    for (const k of SIDED) { const im = P[k]; if (im) { im.setMatrixAt(i * 2, O.p[k][0]); im.setMatrixAt(i * 2 + 1, O.p[k][1]); } }
    for (const k of SINGLE) { const im = P[k]; if (!im) continue; if (k === 'head' && e.light && this.lhead) { this.lhead.setMatrixAt(i, O.p.head[0]); im.setMatrixAt(i, ZERO); } else im.setMatrixAt(i, O.p[k][0]); }
    if (this.wpn[e.wpn]) this.wpn[e.wpn].setMatrixAt(i, O.wpn);
    if (e.shieldKind && this.shd[e.shieldKind]) this.shd[e.shieldKind].setMatrixAt(i, O.shd);
    if (horse && this.hb) { this.hb.setMatrixAt(i, O.hb); this.hn.setMatrixAt(i, O.hn); for (let k = 0; k < 4; k++) { this.hl.setMatrixAt(i * 4 + k, O.hl[k]); this.hd.setMatrixAt(i * 4 + k, O.hl[k + 4]); } }
  }
  hide(i, e) {
    const P = this.parts;
    for (const k of SIDED) { const im = P[k]; if (im) { im.setMatrixAt(i * 2, ZERO); im.setMatrixAt(i * 2 + 1, ZERO); } }
    for (const k of SINGLE) if (P[k]) P[k].setMatrixAt(i, ZERO); if (this.lhead) this.lhead.setMatrixAt(i, ZERO);
    if (this.wpn[e.wpn]) this.wpn[e.wpn].setMatrixAt(i, ZERO); if (e.shieldKind && this.shd[e.shieldKind]) this.shd[e.shieldKind].setMatrixAt(i, ZERO);
    if (this.hb) { this.hb.setMatrixAt(i, ZERO); this.hn.setMatrixAt(i, ZERO); for (let k = 0; k < 4; k++) { this.hl.setMatrixAt(i * 4 + k, ZERO); this.hd.setMatrixAt(i * 4 + k, ZERO); } }
  }
  flush() { for (const im of this.all) im.instanceMatrix.needsUpdate = true; }
}

// 粒子（土煙・火花）
const FX = {
  make(n, additive) {
    const g = new THREE.BufferGeometry(); const pos = new Float32Array(n * 3), sz = new Float32Array(n), al = new Float32Array(n), col = new Float32Array(n * 3);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1)); g.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1)); g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scale: { value: innerHeight / 2 } },
      vertexShader: 'attribute float aSize; attribute float aAlpha; attribute vec3 aColor; varying float vA; varying vec3 vC; uniform float scale; void main(){ vA=aAlpha; vC=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*scale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying float vA; varying vec3 vC; void main(){ vec2 c=gl_PointCoord-0.5; float d=dot(c,c)*4.0; if(d>1.0) discard; gl_FragColor=vec4(vC, vA*(1.0-d)*(1.0-d)); }' });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
    return { g, pts, n, list: [], pos, sz, al, col };
  },
  init() { this.d = this.make(500, false); this.s = this.make(400, true); },
  dust(x, y, z) { const L = this.d.list; if (L.length >= this.d.n) L.shift(); L.push({ x, y, z, vx: (Math.random() - 0.5) * 1.2, vy: 0.6 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 1.2, life: 0, max: 1.6 + Math.random(), size: 1.2, c: [0.55, 0.48, 0.36], a: 0.35 }); },
  spark(x, y, z, n) { const L = this.s.list; for (let i = 0; i < n; i++) { if (L.length >= this.s.n) L.shift(); L.push({ x, y, z, vx: (Math.random() - 0.5) * 5, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 5, life: 0, max: 0.2 + Math.random() * 0.25, size: 0.09, c: [1, 0.75, 0.35], a: 1, grav: 9 }); } },
  update(dt) {
    for (const P of [this.d, this.s]) { const L = P.list; let j = 0;
      for (let i = 0; i < L.length; i++) { const p = L[i]; p.life += dt; if (p.life > p.max) continue; p.vy -= (p.grav || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; L[j++] = p;
        const k = 1 - p.life / p.max, idx = j - 1; P.pos[idx * 3] = p.x; P.pos[idx * 3 + 1] = p.y; P.pos[idx * 3 + 2] = p.z; P.sz[idx] = p.size * (p.grav ? 1 : 1 + p.life * 1.5); P.al[idx] = p.a * k; P.col[idx * 3] = p.c[0]; P.col[idx * 3 + 1] = p.c[1]; P.col[idx * 3 + 2] = p.c[2]; }
      L.length = j; for (let i = j; i < P.n; i++) P.al[i] = 0; P.g.setDrawRange(0, Math.max(1, j));
      for (const k of ['position', 'aSize', 'aAlpha', 'aColor']) P.g.attributes[k].needsUpdate = true; }
  },
};

// 地形の色むら用のなめらかなノイズテクスチャ（細かい点々は使わない）
function smoothNoiseTex(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d'), img = ctx.createImageData(size, size);
  const g = (n) => { const a = []; for (let i = 0; i < n * n; i++) a.push(Math.random()); return a; };
  const layers = [[8, 0.5], [16, 0.3], [32, 0.2]].map(([n, w]) => ({ n, w, v: g(n) }));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { let v = 0;
    for (const L of layers) { const fx = x / size * L.n, fy = y / size * L.n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, s = t => t * t * (3 - 2 * t);
      const at = (i, j) => L.v[((j % L.n + L.n) % L.n) * L.n + ((i % L.n + L.n) % L.n)];
      v += L.w * ((at(x0, y0) * (1 - s(tx)) + at(x0 + 1, y0) * s(tx)) * (1 - s(ty)) + (at(x0, y0 + 1) * (1 - s(tx)) + at(x0 + 1, y0 + 1) * s(tx)) * s(ty)); }
    const k = (y * size + x) * 4, b = 200 + v * 55; img.data[k] = b; img.data[k + 1] = b; img.data[k + 2] = b; img.data[k + 3] = 255; }
  ctx.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function windMaterial(base, amp) {
  base.onBeforeCompile = sh => { sh.uniforms.uTime = windU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      #else
      vec2 ip = vec2(0.0);
      #endif
      float hw = max(0.0, position.y) * ${amp.toFixed(3)};
      transformed.x += sin(uTime*1.7 + ip.x*0.35 + ip.y*0.21) * hw;
      transformed.z += cos(uTime*1.3 + ip.x*0.27 - ip.y*0.31) * hw * 0.6;`); };
  return base;
}
function flagMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 });
  m.onBeforeCompile = sh => { sh.uniforms.uTime = windU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      float ph = instanceMatrix[3][0]*0.13 + instanceMatrix[3][2]*0.07;
      transformed.z += sin(position.x*4.0 - uTime*5.0 + ph) * 0.13 * position.x;
      transformed.y += sin(position.x*3.0 - uTime*4.0 + ph) * 0.03 * position.x;`); };
  return m;
}

function initRender() {
  renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, preserveDrawingBuffer: TEST });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.62;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene(); const fogC0 = new THREE.Color({ snow: 0xc9d2dc, mesa: 0xc8a888, forest: 0x9fb0b8 }[MAP] || 0xa9bcd0); scene.fog = new THREE.Fog(fogC0, MAP === 'forest' ? 80 : MAP === 'snow' ? 90 : 120, MAP === 'snow' ? 520 : 640);
  camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.06, 2000); scene.add(camera);
  // ポストプロセス（光のにじみ・周辺減光・軽い粒状感）
  if (!TEST) {
    const rt = new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.6, 0.92));
    composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv; float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); } void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; float v = smoothstep(0.85, 0.25, length(d) * 1.15); c.rgb *= mix(0.7, 1.0, v); c.rgb += (h(vUv * 1000.0 + uTime) - 0.5) * 0.018; gl_FragColor = c; }'
    }));
    composer.addPass(new OutputPass());
    window._grain = composer.passes[2];
  }
  MAT = armorMaterial();
  // 空と太陽
  skyObj = new Sky(); skyObj.scale.setScalar(1500); const su = skyObj.material.uniforms;
  su.turbidity.value = MAP === 'mesa' ? 7 : MAP === 'snow' ? 9 : 3.5; su.rayleigh.value = MAP === 'snow' ? 1.2 : 2.2; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.85;
  sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(58), THREE.MathUtils.degToRad(150)); su.sunPosition.value.copy(sun); scene.add(skyObj);
  const envScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(50); Object.keys(su).forEach(k => sky2.material.uniforms[k].value = su[k].value); envScene.add(sky2);
  envDressing(envScene);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(envScene, 0.02).texture;
  scene.add(new THREE.HemisphereLight(0xd6e4ff, 0x4a4630, 0.55));
  const dl = new THREE.DirectionalLight(0xfff0d8, 2.4); dl.position.copy(sun).multiplyScalar(150); dl.castShadow = true; dl.shadow.mapSize.set(4096, 4096);
  Object.assign(dl.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 10, far: 400 }); dl.shadow.bias = -0.0004; dl.shadow.normalBias = 0.03; scene.add(dl, dl.target); window._dl = dl;
  // 地形（マップごとの色）
  const tg = new THREE.PlaneGeometry(640, 640, 256, 256); tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) pos.setY(i, H(pos.getX(i), pos.getZ(i)));
  tg.computeVertexNormals(); const nor = tg.attributes.normal;
  const cRock = MAP === 'mesa' ? new THREE.Color(0.3, 0.13, 0.065) : new THREE.Color(0.42, 0.4, 0.37), cDry = new THREE.Color(0.52, 0.5, 0.3), cSnow = new THREE.Color(0.88, 0.89, 0.92), cMud = new THREE.Color(0.3, 0.27, 0.2), cRoad = new THREE.Color(0.45, 0.38, 0.27), cForest = new THREE.Color(0.17, 0.27, 0.11);
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i), ny = nor.getY(i);
    const n = Math.sin(x * 0.021) * Math.cos(z * 0.017) * 0.5 + Math.sin(x * 0.005 + z * 0.007) * 0.5;
    if (MAP === 'mesa') { _c.setRGB(0.42 + n * 0.04, 0.24 + n * 0.03, 0.11); _c.lerp(new THREE.Color(0.3, 0.25, 0.1), clamp(Math.sin(x * 0.03) * Math.cos(z * 0.025) * 0.5 + 0.2, 0, 0.6));
      const band = Math.sin(y * 1.6) * 0.5 + 0.5; if (ny < 0.8) _c.copy(cRock).lerp(new THREE.Color(0.5, 0.22, 0.1), band * 0.6); else if (y > 6) _c.lerp(new THREE.Color(0.36, 0.2, 0.09), 0.5); }
    else if (MAP === 'snow') { _c.copy(cSnow).multiplyScalar(0.95 + n * 0.04); if (ny < 0.9) _c.lerp(new THREE.Color(0.5, 0.52, 0.55), clamp((0.9 - ny) * 5, 0, 0.8)); if (Math.hypot(x, z) < 52) _c.lerp(new THREE.Color(0.62, 0.72, 0.8), smooth(52, 44, Math.hypot(x, z))); }
    else {
      _c.setRGB(0.27 + n * 0.03, 0.4 + n * 0.05, 0.16); _c.lerp(cDry, clamp(Math.sin(x * 0.011 + 2) * Math.cos(z * 0.013) * 0.6, 0, 0.45));
      const road = MAP === 'river' ? 99 : Math.abs(x - (MAP === 'mountain' ? valleyX(z) : Math.sin(z * 0.012) * 18)); if (road < 5) _c.lerp(cRoad, (1 - road / 5) * 0.75);
      if (MAP === 'forest' && forestAt(x, z)) _c.lerp(cForest, 0.7);
      if (MAP === 'river') { const d = Math.abs(z - riverZ(x)); if (d < 20) _c.lerp(cMud, smooth(20, 11, d) * 0.85); }
      if (ny < 0.84) _c.lerp(cRock, clamp((0.84 - ny) * 4, 0, 1)); if (y > 55) _c.lerp(cSnow, clamp((y - 55) / 15, 0, 1)); }
    col.push(_c.r, _c.g, _c.b); }
  tg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: smoothNoiseTex() })); terrain.receiveShadow = true; scene.add(terrain);
  // 川の水面と石橋 ／ 凍った湖
  if (MAP === 'river') {
    const wg = new THREE.PlaneGeometry(640, 34, 160, 4); wg.rotateX(-Math.PI / 2); const wp = wg.attributes.position; for (let i = 0; i < wp.count; i++) wp.setZ(i, wp.getZ(i) + riverZ(wp.getX(i)));
    const water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: 0x3d5a62, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.82, envMapIntensity: 1.2 })); water.position.y = WATER_Y; water.receiveShadow = true; scene.add(water);
    const stone = new THREE.MeshStandardMaterial({ color: 0x7d7468, roughness: 0.92, map: smoothNoiseTex(64) }), bz = riverZ(BRIDGE_X), bridge = new THREE.Group();
    bridge.add(new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.5, 36), stone)); for (const sx of [-3.5, 3.5]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 36), stone); r.position.set(sx, 0.6, 0); bridge.add(r); }
    for (const zz of [-8, 0, 8]) { const pier = new THREE.Mesh(new THREE.BoxGeometry(6.6, 3.2, 2), stone); pier.position.set(0, -1.8, zz); bridge.add(pier); }
    bridge.position.set(BRIDGE_X, 0.55, bz); bridge.traverse(o => { o.castShadow = o.receiveShadow = true; }); scene.add(bridge);
  }
  if (MAP === 'snow') { const ice = new THREE.Mesh(new THREE.CircleGeometry(50, 64), new THREE.MeshStandardMaterial({ color: 0xc4dbe6, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.88, envMapIntensity: 1.3 })); ice.rotation.x = -Math.PI / 2; ice.position.y = -1.15; ice.receiveShadow = true; scene.add(ice); }
  // 草（カメラの近くだけ、風で揺れる）
  const blades = []; for (let i = 0; i < 9; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * 0.45, h = 0.14 + Math.random() * 0.2, w = 0.025;
    const g = new THREE.BufferGeometry(); const bx = Math.cos(a) * r, bz = Math.sin(a) * r, d = Math.random() * Math.PI, ca = Math.cos(d) * w, sa = Math.sin(d) * w, lean = (Math.random() - 0.5) * 0.15;
    g.setAttribute('position', new THREE.Float32BufferAttribute([bx - ca, 0, bz - sa, bx + ca, 0, bz + sa, bx + lean, h, bz + lean * 0.5], 3));
    const tc = MAP === 'mesa' ? [0.42, 0.33, 0.12] : MAP === 'snow' ? [0.6, 0.6, 0.5] : Math.random() < 0.3 ? [0.5, 0.52, 0.26] : [0.33, 0.45, 0.18], bc = MAP === 'mesa' ? [0.2, 0.14, 0.05] : MAP === 'snow' ? [0.4, 0.38, 0.3] : [0.14, 0.22, 0.07];
    g.setAttribute('color', new THREE.Float32BufferAttribute([...bc, ...bc, ...tc], 3)); g.computeVertexNormals(); blades.push(g); }
  const gg = new THREE.BufferGeometry(); { const ps = [], cs = []; for (const b of blades) { ps.push(...b.attributes.position.array); cs.push(...b.attributes.color.array); } gg.setAttribute('position', new THREE.Float32BufferAttribute(ps, 3)); gg.setAttribute('color', new THREE.Float32BufferAttribute(cs, 3)); gg.computeVertexNormals(); }
  grassIM = new THREE.InstancedMesh(gg, windMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }), 0.12), 9000); grassIM.frustumCulled = false; grassIM.receiveShadow = true; scene.add(grassIM);
  // 木と岩（シード固定なので全員で同じ配置）。陣地の中には生やさない
  seed = 12345; const trees = []; const nT = { mountain: 1100, hill: 450, forest: 2200, mesa: 70, snow: 650, river: 420 }[MAP] || 300;
  const inCamp = (x, z, m) => { for (let t = 0; t < NT; t++) { const [lx, d] = toFrame(t, x, z), Z = zoneDims(t); if (Math.abs(lx) < Z.w + m && d > Z.d0 - m - 40 && d < Z.d1 + m) return true; } return false; };
  for (let i = 0; i < nT * 4 && trees.length < nT; i++) { const x = (rnd() - 0.5) * 560, z = (rnd() - 0.5) * 560;
    if (inCamp(x, z, MAP === 'mountain' ? 4 : 10)) continue;
    if (zone && Math.hypot(x - zone.x, z - zone.z) < zone.r + 6) continue;
    if (MAP === 'forest') { if (!forestAt(x, z) && rnd() < 0.93) continue; }
    else if (MAP === 'river') { if (Math.abs(z - riverZ(x)) < 22) continue; if (rnd() < 0.5 && Math.abs(x) < 200) continue; }
    else if (MAP === 'mesa') { if (H(x, z) > 5) continue; }
    else if (MAP === 'snow') { if (Math.hypot(x, z) < 62) continue; }
    else if (MAP !== 'mountain' && rnd() < 0.5 && Math.abs(x) < 200) continue;
    trees.push([x, z, 0.8 + rnd() * 0.7, rnd() < ({ mountain: 0.75, forest: 0.6, snow: 0.95, mesa: 0 }[MAP] ?? 0.4)]); }
  TREES.length = 0; for (const [x, z, sc] of trees) TREES.push([x, z, H(x, z), sc]);
  const conif = trees.filter(t => t[3]), decid = trees.filter(t => !t[3]);
  const conG = (() => { const gs = []; for (let k = 0; k < 4; k++) { const g = new THREE.ConeGeometry(2.6 - k * 0.55, 3.2, 8); g.translate(0, 3.2 + k * 1.7, 0); gs.push(g); } return gs; })();
  const mkIM = (geo, mat, list) => { if (!list.length) return null; const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach(([x, z, s], i) => { MW.compose(_p.set(x, H(x, z) - 0.2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), x * 7.1), _s.setScalar(s)); im.setMatrixAt(i, MW); }); im.castShadow = true; im.receiveShadow = true; scene.add(im); return im; };
  const leafC = new THREE.MeshStandardMaterial({ color: MAP === 'snow' ? 0x2c3d32 : 0x24432a, roughness: 0.9, flatShading: true }), leafD = new THREE.MeshStandardMaterial({ color: MAP === 'mesa' ? 0x6a6a34 : 0x3f6a2c, roughness: 0.9, flatShading: true }), bark = new THREE.MeshStandardMaterial({ color: 0x4d3523, roughness: 1 });
  for (const g of conG) mkIM(g, leafC, conif);
  if (MAP === 'snow') { const snowM = new THREE.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.8, flatShading: true }); for (let k = 0; k < 4; k++) { const g = new THREE.ConeGeometry((2.6 - k * 0.55) * 0.82, 1.3, 8); g.translate(0, 4.4 + k * 1.7, 0); mkIM(g, snowM, conif); } }
  mkIM(new THREE.CylinderGeometry(0.22, 0.35, 3.5, 6).translate(0, 1.6, 0), bark, trees);
  for (const [ox, oy, oz, r] of [[0, 4.2, 0, 2.2], [1.3, 3.6, 0.5, 1.6], [-1.2, 3.8, -0.4, 1.7], [0.2, 5.3, -0.3, 1.5]]) mkIM(new THREE.IcosahedronGeometry(r, 1).translate(ox, oy, oz), leafD, MAP === 'mesa' ? decid.map(t => [t[0], t[1], t[2] * 0.6]) : decid);
  if (MAP !== 'field') { const rocks = []; const nR = MAP === 'mesa' ? 420 : 160; for (let i = 0; i < nR * 2 && rocks.length < nR; i++) { const x = (rnd() - 0.5) * 540, z = (rnd() - 0.5) * 540; const ny = H(x + 1, z) - H(x - 1, z); if (inCamp(x, z, 0)) continue; if (MAP === 'mountain' ? Math.abs(x - valleyX(z)) < 32 : MAP === 'mesa' ? false : Math.abs(ny) < 0.6) continue; rocks.push([x, z, 0.6 + rnd() * 1.6]); }
    mkIM(new THREE.DodecahedronGeometry(1.2, 0).scale(1.3, 0.7, 1), new THREE.MeshStandardMaterial({ color: MAP === 'mesa' ? 0x8a5a40 : MAP === 'snow' ? 0x8a8c90 : 0x77736c, roughness: 0.9, flatShading: true }), rocks); }
  // 目標地点
  if (zone) { const zy = H(zone.x, zone.z);
    const stakes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 5).translate(0, 1.1, 0), new THREE.MeshStandardMaterial({ color: 0x6b4a2a }), 32);
    for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2, x = zone.x + Math.cos(a) * zone.r, z = zone.z + Math.sin(a) * zone.r; MW.makeTranslation(x, H(x, z) - 0.2, z); stakes.setMatrixAt(i, MW); }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 11, 8).translate(0, 5.5, 0), new THREE.MeshStandardMaterial({ color: 0x4a3a2a })); pole.position.set(zone.x, zy, zone.z); pole.castShadow = true;
    const fg = new THREE.PlaneGeometry(4, 2.6, 12, 4).translate(2, 0, 0); fg.setAttribute('color', new THREE.Float32BufferAttribute(new Array(fg.attributes.position.count * 3).fill(1), 3));
    zone.flagMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, side: THREE.DoubleSide, roughness: 0.85 }); zone.flag = new THREE.Mesh(fg, zone.flagMat); zone.flag.position.set(zone.x, zy + 9.4, zone.z);
    scene.add(stakes, pole, zone.flag); }
  // 兵士（軍ごと）
  for (let t = 0; t < NT; t++) {
    const n = ents.filter(e => e.team === t && e.type !== 'hero').length;
    crowds[t] = new Crowd(t, teamArmor[t], n, { light: true, wpn: ['arming', 'spear', 'bow', 'lance', 'poleaxe'], shd: [ARMORS[teamArmor[t]].shield, 'pavise'], horse: 'caparison' });
    let i = 0; for (const e of ents) if (e.team === t && e.type !== 'hero') e.ci = i++;
    msgCrowds[t] = new Crowd(t, 'brigandine', 60, { light: false, wpn: [], shd: [], horse: 'messenger' });
  }
  // 将（細かいモデル）と自分の馬
  for (let t = 0; t < NT; t++) {
    const h = heroes[t], parts = buildBody(t, heroArmor[t], true); parts.weapon = buildWeapon(h.wpn, t, true);
    if (h.shieldKind) parts.shield = buildShield(t, h.shieldKind, true);
    if (horses[t]) parts.horse = buildHorse(t, 'barded', true, heroArmor[t]);
    heroRigs[t] = new Rig(scene, MAT, parts);
  }
  IMarrow = new THREE.InstancedMesh(buildArrow(), MAT, 800); IMarrow.frustumCulled = false; for (let i = 0; i < 800; i++) IMarrow.setMatrixAt(i, ZERO); scene.add(IMarrow);
  // 部隊旗（旗手が掲げる）
  const fgeo = new THREE.PlaneGeometry(1.3, 0.85, 26, 17).translate(0.65, 0, 0); const fpos = fgeo.attributes.position;
  poleIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.03, 4.4, 5).translate(0, 2.2, 0), new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.8 }), squads.length); poleIM.frustumCulled = false; poleIM.castShadow = true; scene.add(poleIM);
  for (let t = 0; t < NT; t++) { const fc = []; const c1 = new THREE.Color(TEAM_CLOTH[t]), c2 = new THREE.Color(TEAM_CLOTH2[t]);
    for (let i = 0; i < fpos.count; i++) { const x = fpos.getX(i), y = fpos.getY(i), u = x - 0.65;
      const em = [Math.abs(y - Math.abs(u) * 0.9 + 0.12) < 0.07, Math.abs(x - 0.5) < 0.06 || Math.abs(y) < 0.06, Math.abs(y - u * 0.65) < 0.07 || Math.abs(y + u * 0.65) < 0.07, Math.abs(y - 0.12) < 0.09 || Math.abs(y + 0.2) < 0.04, Math.abs(u) < 0.09 || Math.abs(y + 0.15) < 0.05][t];
      const c = em ? c2 : c1; fc.push(c.r, c.g, c.b); }
    const g = fgeo.clone(); g.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
    const im = new THREE.InstancedMesh(g, flagMaterial(), squads.length); im.frustumCulled = false; im.castShadow = true; for (let i = 0; i < squads.length; i++) im.setMatrixAt(i, ZERO); scene.add(im); flagIM[t] = im; }
  for (const s of squads) { const cv = document.createElement('canvas'); cv.width = 160; cv.height = 48;
    const tex = new THREE.CanvasTexture(cv); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false, transparent: true }));
    sp.scale.set(0.085, 0.0255, 1); sp.renderOrder = 10; scene.add(sp); bannerList.push({ s, sp, cv, tex, key: '' }); }
  aimRing = new THREE.Mesh(new THREE.RingGeometry(2.5, 3.2, 32), new THREE.MeshBasicMaterial({ color: 0xffe060, depthTest: false, transparent: true, opacity: 0.8 })); aimRing.rotation.x = -Math.PI / 2; aimRing.renderOrder = 11; scene.add(aimRing);
  FX.init(); initViewmodel();
  // 地図
  mapC = $('map'); fogC = document.createElement('canvas');
  mapImg = document.createElement('canvas'); mapImg.width = mapImg.height = 300; const mctx = mapImg.getContext('2d'), id = mctx.createImageData(300, 300);
  for (let j = 0; j < 300; j++) for (let i = 0; i < 300; i++) { const x = i * 2 - 300, z = j * 2 - 300, h = H(x, z), hx = H(x + 2, z), hz = H(x, z + 2);
    const shade = clamp(1 + (h - hx) * 0.25 + (h - hz) * 0.25, 0.5, 1.4); const ct = Math.floor(h / 5) !== Math.floor(hx / 5) || Math.floor(h / 5) !== Math.floor(hz / 5);
    let r = 112 + h * 1.1, g = 122 + h * 0.85, b = 82 + h * 0.75;
    if (MAP === 'mesa') { r = 170 + h * 2; g = 128 + h * 1.4; b = 88 + h; } else if (MAP === 'snow') { r = 205 + h; g = 210 + h; b = 218 + h; if (h < -1) { r = 150; g = 185; b = 205; } }
    else if (MAP === 'forest' && forestAt(x, z)) { r *= 0.62; g *= 0.8; b *= 0.6; }
    if (MAP === 'river' && h < WATER_Y) { const dp = clamp((WATER_Y - h) / 1.8, 0, 1); r = 90 - dp * 40; g = 130 - dp * 40; b = 150 - dp * 20; }
    if (MAP === 'river' && Math.abs(x - BRIDGE_X) < 3.6 && Math.abs(z - riverZ(x)) < 19) { r = 150; g = 140; b = 125; }
    if (ct) { r *= 0.72; g *= 0.72; b *= 0.72; } const k = (j * 300 + i) * 4;
    id.data[k] = clamp(r * shade, 0, 255); id.data[k + 1] = clamp(g * shade, 0, 255); id.data[k + 2] = clamp(b * shade, 0, 255); id.data[k + 3] = 255; }
  mctx.putImageData(id, 0, 0);
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); if (composer) composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); FX.d.pts.material.uniforms.scale.value = FX.s.pts.material.uniforms.scale.value = innerHeight / 2; });
}

// 一人称の手と武器 ／ カメラ（ヒットストップ・揺れ・三人称の追従）
const CAM = { shake: 0, kick: 0, hitstop: 0, dist: 3.6, pos: null, bob: 0 };
const VM = { g: null, holder: null, shield: null, mdx: 0, mdy: 0, sx: 0, sy: 0, sb: 0, land: 0 };
function initViewmodel() {
  const t = ME, parts = buildBody(t, heroArmor[t], true), W = WEAPONS[player.wpn];
  VM.g = new THREE.Group(); camera.add(VM.g); VM.holder = new THREE.Group(); VM.g.add(VM.holder);
  const inner = new THREE.Group(); inner.rotation.y = Math.PI; VM.holder.add(inner);
  inner.add(new THREE.Mesh(buildWeapon(player.wpn, t, true), MAT));
  const gaunt = (z, a) => {
    if (parts.hand) { const h = new THREE.Mesh(parts.hand, MAT); h.position.set(0, 0, z); inner.add(h); const fa = new THREE.Mesh(parts.farm, MAT); const ang = -2.09; fa.rotation.x = ang; const off = new THREE.Vector3(0, -0.28, 0).applyEuler(new THREE.Euler(ang, 0, 0)); fa.position.set(0, -0.075 - off.y, z - off.z); inner.add(fa); return; }
    const m = new THREE.Mesh(parts.farm, MAT); m.rotation.x = a; const off = new THREE.Vector3(0, -0.3, 0).applyEuler(new THREE.Euler(a, 0, 0)); m.position.set(-off.x, -off.y, z - off.z); inner.add(m); };
  gaunt(0, -1.95); if (W.twoHand) gaunt(-0.32, -2.15);
  if (player.shieldKind) { VM.shield = new THREE.Group(); const sm = new THREE.Mesh(buildShield(t, player.shieldKind, true), MAT); sm.rotation.y = Math.PI; VM.shield.add(sm); const lg = new THREE.Mesh(parts.farm, MAT); lg.rotation.set(-1.4, 0, 0); lg.position.set(0, -0.05, 0.25); VM.shield.add(lg); camera.add(VM.shield); }
  VM.g.traverse(o => { o.frustumCulled = false; });
  addEventListener('mousemove', e => { if (document.pointerLockElement) { VM.mdx += e.movementX; VM.mdy += e.movementY; } });
  addEventListener('wheel', e => { if (thirdPerson) CAM.dist = clamp(CAM.dist + Math.sign(e.deltaY) * 0.5, 2.2, 9); }, { passive: true });
}
// 武器ごとのキーフレーム [位置xyz, 回転xyz]（カメラ座標）。構え→タメ→振り抜き→余韻
const VMP = {
  diag: { idle: [[0.3, -0.36, -0.5], [1.15, 0.25, -0.45]], wind: [[0.45, -0.04, -0.36], [1.85, -0.6, -1.2]], hit: [[-0.22, -0.44, -0.62], [-0.35, 0.9, 0.5]], follow: [[-0.42, -0.55, -0.5], [-0.6, 1.25, 0.75]] },
  sweep: { idle: [[0.33, -0.42, -0.32], [0.55, 0.45, -0.2]], wind: [[0.58, -0.24, -0.16], [0.2, -1.25, -1.35]], hit: [[-0.3, -0.36, -0.45], [0.1, 1.15, -1.35]], follow: [[-0.55, -0.42, -0.32], [0.05, 1.6, -1.25]] },
  over: { idle: [[0.32, -0.4, -0.45], [1.05, 0.15, -0.2]], wind: [[0.25, 0.14, -0.22], [2.3, 0.1, -0.1]], hit: [[0.06, -0.48, -0.72], [-0.45, 0, 0]], follow: [[0.0, -0.62, -0.62], [-0.75, -0.05, 0.05]] },
  couch: { idle: [[0.28, -0.4, -0.25], [0.04, 0.1, 0]], wind: [[0.3, -0.36, -0.08], [0.1, 0.12, 0]], hit: [[0.22, -0.37, -0.95], [0, 0.04, 0]], follow: [[0.22, -0.38, -0.85], [0.02, 0.05, 0]] },
};
function vmBlend(A, B, t) { const e = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); return [[0, 1, 2].map(j => A[0][j] + (B[0][j] - A[0][j]) * e), [0, 1, 2].map(j => A[1][j] + (B[1][j] - A[1][j]) * e)]; }
function vmSnap(A, B, t) { const e = t <= 0 ? 0 : t >= 1 ? 1 : 1 - (1 - t) ** 3; return [[0, 1, 2].map(j => A[0][j] + (B[0][j] - A[0][j]) * e), [0, 1, 2].map(j => A[1][j] + (B[1][j] - A[1][j]) * e)]; }
function updateViewmodel(dt) {
  const fp = !thirdPerson && player.alive && !ended; VM.g.visible = fp; if (VM.shield) VM.shield.visible = fp;
  CAM.hitstop = Math.max(0, CAM.hitstop - dt); CAM.kick = Math.max(0, CAM.kick - dt * 5); CAM.shake = Math.max(0, CAM.shake - dt * 2.2);
  if (!fp) return;
  const pz = VMP[player.swing === 'thrust' ? 'couch' : player.swing] || VMP.diag; let pose = pz.idle;
  if (player.anim > 0) { const k = 1 - player.anim / player.animDur, hit = (SWINGS[player.swing] || SWINGS.diag).hit, w0 = hit * 0.8, h1 = hit + 0.08, f1 = hit + 0.3;
    if (k < w0) pose = vmBlend(pz.idle, pz.wind, k / w0);
    else if (k < h1) pose = vmSnap(pz.wind, pz.hit, (k - w0) / (h1 - w0));
    else if (k < f1) pose = vmBlend(pz.hit, pz.follow, (k - h1) / (f1 - h1));
    else pose = vmBlend(pz.follow, pz.idle, (k - f1) / (1 - f1)); }
  else if (player.blocking && !player.shieldKind) pose = [[0.05, -0.2, -0.45], [0.25, 1.35, -1.4]];
  // 揺れ：呼吸・歩き（8の字）・走り（下げて傾ける）・騎乗（馬の歩様に合わせる）・視点移動の遅れ
  const h = horses[ME], amt = clamp(player.spd / 5, 0, 1), sprint = !player.mounted && player.spd > 7 ? 1 : 0;
  let bx = 0, by = Math.sin(windU.value * 1.6) * 0.004, rz = 0;
  if (player.mounted && h) { const u = (h.cyc || 0) % 1, g = h.gait || 0; by += g === 3 ? Math.sin(u * Math.PI * 2 - 0.6) * 0.03 : g ? Math.abs(Math.sin(u * Math.PI * 4)) * (g === 2 ? 0.025 : 0.01) : 0; }
  else { bx = Math.sin(player.phase) * 0.018 * amt; by += -Math.abs(Math.cos(player.phase)) * 0.022 * amt; }
  VM.sx += (-VM.mdx * 0.0009 - VM.sx) * Math.min(1, dt * 10); VM.sy += (VM.mdy * 0.0009 - VM.sy) * Math.min(1, dt * 10); VM.mdx *= 0.5; VM.mdy *= 0.5;
  VM.sp = (VM.sp || 0) + (sprint - (VM.sp || 0)) * Math.min(1, dt * 6); VM.land = Math.max(0, VM.land - dt * 4); if (player.air) VM.land = 0.6;
  VM.holder.position.set(pose[0][0] + bx + VM.sx + VM.sp * 0.08, pose[0][1] + by + VM.sy - VM.sp * 0.08 - VM.land * 0.03, pose[0][2]);
  VM.holder.rotation.set(pose[1][0] - VM.sp * 0.35 - CAM.kick * 0.06, pose[1][1] + VM.sx * 2, pose[1][2] + rz + VM.sp * 0.3, 'YXZ');
  if (VM.shield) { const b = player.blocking ? 1 : 0; VM.sb += (b - VM.sb) * Math.min(1, dt * 12);
    VM.shield.position.set(-0.42 + VM.sb * 0.27 + bx + VM.sx, -0.48 + VM.sb * 0.26 + by + VM.sy, -0.62 + VM.sb * 0.12); VM.shield.rotation.set(0, 0.55 - VM.sb * 0.5, 0); }
}
function updateCamera(dt) {
  const p = player, h = horses[ME];
  if (!p.alive && spectate && SPEC.on) { camera.position.set(SPEC.x, SPEC.y, SPEC.z); camera.rotation.set(pitch, yaw, 0, 'YXZ'); return; }
  const headY = p.mounted && h ? h.y + 2.42 + (h._bob || 0) * 0.85 : p.y + 1.66 + (p.alive ? -Math.abs(Math.cos(p.phase)) * 0.03 * clamp(p.spd / 5, 0, 1) : -1.2);
  const sh = CAM.shake * CAM.shake, sx = (Math.random() - 0.5) * sh * 0.05, sy = (Math.random() - 0.5) * sh * 0.05;
  if (!thirdPerson) {
    const fx = p.mounted ? -Math.sin(h.face) * 0.28 : -Math.sin(yaw) * 0.12, fz = p.mounted ? -Math.cos(h.face) * 0.28 : -Math.cos(yaw) * 0.12;
    camera.position.set(p.x + fx, headY + (p.mounted ? 0.12 : 0), p.z + fz); CAM.pos = null;
  } else {
    const dist = CAM.dist * (p.mounted ? 1.4 : 1), dx = Math.sin(yaw) * Math.cos(pitch), dy = -Math.sin(pitch), dz = Math.cos(yaw) * Math.cos(pitch);
    const rx = Math.cos(yaw) * 0.55, rz = -Math.sin(yaw) * 0.55, ty = headY + 0.3;
    let d = dist; for (let k = 0.5; k <= dist; k += 0.5) { const x = p.x + dx * k + rx, z = p.z + dz * k + rz, y = ty + dy * k; // 地面や木に埋まらない
      let hit = y < H(x, z) + 0.35; if (!hit) for (const t of TREES) { if (Math.abs(t[0] - x) < 3 && Math.abs(t[1] - z) < 3 && Math.hypot(t[0] - x, t[1] - z) < 2.6 * t[3] && y > t[2] + 1.8 && y < t[2] + 8 * t[3]) { hit = true; break; } }
      if (hit) { d = Math.max(0.8, k - 0.5); break; } }
    const want = new THREE.Vector3(p.x + dx * d + rx, ty + dy * d, p.z + dz * d + rz);
    if (!CAM.pos) CAM.pos = want.clone(); else CAM.pos.lerp(want, Math.min(1, (dt || 0.016) * 12));
    camera.position.copy(CAM.pos);
  }
  camera.rotation.set(pitch + sy - CAM.kick * 0.012, yaw + sx, (Math.random() - 0.5) * sh * 0.02, 'YXZ');
}

function render(dt) {
  frameNo++; windU.value += dt; CLOTH_TIME.value = windU.value;
  updateViewmodel(dt); updateCamera(dt); FX.update(dt);
  const spMe = spotters(ME), cp = camera.position, cdir = new THREE.Vector3(); camera.getWorldDirection(cdir);
  const all = spectate || elim[ME]; for (const e of ents) if (e.team !== ME) e.seen = e.alive && (all || ally(e.team, ME) || canSee(spMe, e));
  // 兵士
  for (const e of ents) {
    if (e.type === 'hero') continue; const C = crowds[e.team], i = e.ci, dead = !e.alive;
    if (dead) e.deadT += dt; e.hitAge = (e.hitAge ?? 9) + dt; e.blockAge = (e.blockAge ?? 9) + dt;
    const vis = !e.gone && (e.team === ME || e.seen || (dead && Math.hypot(e.x - cp.x, e.z - cp.z) < 80));
    if (!vis) { if (e.shown !== false) { C.hide(i, e); e.shown = false; } continue; }
    const dx = e.x - cp.x, dz = e.z - cp.z, d2 = dx * dx + dz * dz;
    if (dead && e.deadT > 1.2 && e.shown === true && e.settled) continue;
    if (e.shown === true && d2 > 160 * 160 && (frameNo + e.id) % 3) continue;
    if (e.shown === true && d2 > 70 * 70 && !dead && (frameNo + e.id) % 2) continue;
    if (e.shown === true && d2 > 30 * 30 && (dx * cdir.x + dz * cdir.z) < -0.3 * Math.sqrt(d2) && (frameNo + e.id) % 4) continue;
    if (e.h) { e.h.x = e.x; e.h.z = e.z; e.h.y = e.y; e.h.face = e.face; if (dead) { e.h.alive = false; e.h.deadT = e.deadT; } }
    const riding = e.mounted && e.alive;
    computePose(e, P, O, e.h && riding ? e.h : null, windU.value);
    if (e.h && !riding) poseHorse(e.h, O);
    C.write(i, e, O, e.h); e.shown = true; if (dead && e.deadT > 1.2) e.settled = true;
  }
  for (let t = 0; t < NT; t++) crowds[t].flush();
  // 将
  for (let t = 0; t < NT; t++) {
    const e = heroes[t], R = heroRigs[t], hz = horses[t];
    const vis = t === ME || e.seen || (!e.alive && Math.hypot(e.x - cp.x, e.z - cp.z) < 80) || (hz && t !== ME && (all || canSee(spMe, hz)));
    if (!vis) { R.setVisible(false); continue; }
    if (!e.alive) e.deadT += dt; e.hitAge = (e.hitAge ?? 9) + dt; e.blockAge = (e.blockAge ?? 9) + dt;
    if (hz) hz.t = (hz.t || 0) + dt;
    R.update(e, hz, { hideBody: t === ME && !thirdPerson && e.alive, t: windU.value });
  }
  // 矢
  let ai = 0; for (const a of arrows) { if (ai >= 800) break; _p.set(a.x, a.y, a.z); MW.lookAt(_s.set(a.x + a.vx, a.y + a.vy, a.z + a.vz), _p, camera.up); MW.setPosition(_p); IMarrow.setMatrixAt(ai++, MW); }
  for (let i = ai; i < 800; i++) IMarrow.setMatrixAt(i, ZERO); IMarrow.instanceMatrix.needsUpdate = true;
  // 伝令（騎馬）
  const mi = new Array(NT).fill(0);
  for (const m of msgs) { const t = m.team; if (mi[t] >= 60) continue; if (!ally(t, ME) && !all && !canSee(spMe, m)) continue;
    const fe = { id: mi[t], x: m.x, y: m.y ?? H(m.x, m.z), z: m.z, face: m.face || 0, spd: 13, phase: 0, anim: 0, alive: true, mounted: true, swing: 'couch', wpn: 'none', light: false };
    const fh = { x: fe.x, y: fe.y, z: fe.z, face: fe.face, spd: 13, cyc: m.cyc || 0, gait: 3, alive: true };
    computePose(fe, P, O, fh, windU.value); msgCrowds[t].write(mi[t]++, fe, O, fh); }
  for (let t = 0; t < NT; t++) { for (let i = mi[t]; i < (msgCrowds[t].lastN || 0); i++) msgCrowds[t].hide(i, { wpn: 'none' }); msgCrowds[t].lastN = mi[t]; msgCrowds[t].flush(); }
  // 旗と番号札
  for (const bn of bannerList) { const s = bn.s, n = s.alive.length, im = flagIM[s.team];
    const bearer = s.alive.find(m => m.type !== 'hero');
    const show = n && bearer && (s.team === ME || bearer.seen); bn.sp.visible = !!show && (s.team === ME || true);
    if (!show) { im.setMatrixAt(s.idx, ZERO); poleIM.setMatrixAt(s.idx, ZERO); continue; }
    const by = bearer.y + (bearer.mounted ? 1.0 : 0), side = 0.3; const bx = bearer.x + Math.cos(bearer.face) * -side, bz = bearer.z - Math.sin(bearer.face) * -side;
    MW.makeTranslation(bx, by, bz); poleIM.setMatrixAt(s.idx, MW);
    const wind = 0.6; MW.makeRotationY(wind); MW.setPosition(bx, by + 3.8, bz); im.setMatrixAt(s.idx, MW);
    bn.sp.position.set(bx, by + 5.1, bz);
    const mine = s.team === ME, sel = mine && selected.has(s.num), key = `${n}|${sel}|${s.pending}`;
    if (key !== bn.key) { bn.key = key; const ctx = bn.cv.getContext('2d'); ctx.clearRect(0, 0, 160, 48);
      ctx.fillStyle = sel ? 'rgba(230,180,40,.92)' : TEAM_BG[s.team]; ctx.beginPath(); ctx.roundRect(2, 2, 156, 44, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 25px sans-serif'; ctx.textBaseline = 'middle';
      ctx.fillText(mine ? `${s.num} ${s.T.label} ${n}${s.pending ? ' ✉' : ''}` : `${s.T.label} ${n}`, 12, 25); bn.tex.needsUpdate = true; } }
  for (let t = 0; t < NT; t++) flagIM[t].instanceMatrix.needsUpdate = true; poleIM.instanceMatrix.needsUpdate = true;
  // 草をカメラの周りに敷き直す
  if (!grassCenter || Math.hypot(cp.x - grassCenter.x, cp.z - grassCenter.z) > 10) {
    grassCenter = { x: cp.x, z: cp.z }; let k = 0; const R = 48, q = new THREE.Quaternion();
    for (let i = 0; i < 9000; i++) { const a = (i * 2.399963) % (Math.PI * 2), r = Math.sqrt((i + 0.5) / 9000) * R;
      const x = Math.round(cp.x / 2) * 2 + Math.cos(a) * r, z = Math.round(cp.z / 2) * 2 + Math.sin(a) * r, y = H(x, z), ny = Math.abs(H(x + 1, z) - H(x - 1, z)) + Math.abs(H(x, z + 1) - H(x, z - 1));
      if (ny > 1.1 || y > 50 || (zone && Math.hypot(x - zone.x, z - zone.z) < 3) || (MAP === 'river' && Math.abs(z - riverZ(x)) < 15) || (MAP === 'snow' && (Math.hypot(x, z) < 50 || i % 5))) continue;
      q.setFromAxisAngle(_s.set(0, 1, 0), x * 3.7 + z * 1.3); MW.compose(_p.set(x, y - 0.03, z), q, _s.setScalar(0.8 + ((x * 13.1 + z * 7.7) % 1 + 1) % 1 * 0.6)); grassIM.setMatrixAt(k++, MW); }
    grassIM.count = k; grassIM.instanceMatrix.needsUpdate = true; }
  // 影はプレイヤーの周りだけ
  const dl = window._dl; if (player.alive) dl.target.position.set(player.x, player.y, player.z); else dl.target.position.set(cp.x, H(cp.x, cp.z), cp.z); dl.position.copy(sun).multiplyScalar(150).add(dl.target.position);
  aimRing.visible = selected.size > 0 && !mapOpen && player.alive && !thirdPerson;
  if (aimRing.visible) { const a = aimPoint(); aimRing.position.set(a.x, H(a.x, a.z) + 0.4, a.z); }
  if (zone) { zone.flagMat.color.set(zone.holder >= 0 ? TEAM_CLOTH[zone.holder] : 0xdddddd); zone.flag.rotation.y = Math.sin(gameT * 0.3) * 0.4 + 0.6; }
  if (composer) { window._grain.uniforms.uTime.value = performance.now() * 0.001 % 100; composer.render(); } else renderer.render(scene, camera);
}

// ===== 戦場地図（自分の本陣が下に来るよう回して表示） =====
let mapS = 600, dragging = null;
const MA = () => teamFrame(ME).a;
function toMap(x, z) { const a = MA(), c = Math.cos(a), s = Math.sin(a); return [(x * c - z * s + 300) * mapS / 600, (x * s + z * c + 300) * mapS / 600]; }
function fromMap(u, v) { const a = MA(), c = Math.cos(a), s = Math.sin(a), X = u / mapS * 600 - 300, Z = v / mapS * 600 - 300; return [X * c + Z * s, -X * s + Z * c]; }
function openMap(o) { mapOpen = o; $('mapwrap').style.display = o ? 'flex' : 'none'; if (o) { document.exitPointerLock?.(); mapS = Math.floor(Math.min(innerWidth, innerHeight) * 0.9); mapC.width = mapC.height = fogC.width = fogC.height = mapS; } else dragging = null; }
function drawMap() {
  const ctx = mapC.getContext('2d'), S = mapS, all = spectate || elim[ME];
  ctx.save(); ctx.translate(S / 2, S / 2); ctx.rotate(MA()); ctx.drawImage(mapImg, -S / 2, -S / 2, S, S); ctx.restore();
  const f = fogC.getContext('2d'); f.globalCompositeOperation = 'source-over'; f.clearRect(0, 0, S, S); f.fillStyle = all ? 'rgba(10,12,25,0)' : 'rgba(10,12,25,.55)'; f.fillRect(0, 0, S, S);
  f.globalCompositeOperation = 'destination-out'; const spMe = spotters(ME);
  for (const [x, z, y, r] of spMe) { const [u, v] = toMap(x, z); f.beginPath(); f.arc(u, v, (r + 15) * S / 600, 0, 7); f.fill(); }
  ctx.drawImage(fogC, 0, 0);
  const poly = (pts, stroke, fill, dash) => { ctx.beginPath(); pts.forEach(([x, z], i) => { const [u, v] = toMap(x, z); i ? ctx.lineTo(u, v) : ctx.moveTo(u, v); }); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.setLineDash(dash || []); ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); } };
  // 各軍の陣地（布陣中は自分の陣地を明るく）
  for (let t = 0; t < NT; t++) { const Z = zoneDims(t), pts = [[-Z.w, Z.d0], [Z.w, Z.d0], [Z.w, Z.d1], [-Z.w, Z.d1]].map(([l, d]) => fw(t, l, d));
    if (t === ME && phase === 'deploy') poly(pts, '#ffe080', 'rgba(255,224,128,.12)', [6, 4]); else poly(pts, elim[t] ? 'rgba(120,120,120,.4)' : TEAM_CSS[t] + '88', null, [3, 5]);
    const [u, v] = toMap(...fw(t, 0, Z.d1 * 0.5)); ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = elim[t] ? '#888' : TEAM_CSS[t]; ctx.fillText(`${TEAM_NAME[t]}軍${t === ME ? '（自陣）' : COOP && ally(t, ME) ? '（味方）' : ''}`, u, v); }
  if (zone) { const [u, v] = toMap(zone.x, zone.z); ctx.strokeStyle = zone.holder >= 0 ? TEAM_CSS[zone.holder] : '#ffe080'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(u, v, zone.r * S / 600, 0, 7); ctx.stroke(); }
  for (const e of ents) { if (!e.alive || e.gone) continue; if (e.team !== ME && !e.seen) continue; const [u, v] = toMap(e.x, e.z); ctx.fillStyle = e.type === 'hero' ? (e.team === ME ? '#fff' : ally(e.team, ME) ? '#9ef' : '#ffd040') : TEAM_CSS[e.team]; ctx.fillRect(u - 1.2, v - 1.2, 2.4, 2.4); }
  ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const s of squads) { if (!s.alive.length) continue;
    if (s.team === ME) { const sel = selected.has(s.num), [cu, cv] = toMap(s.cx, s.cz);
      if (s.mode !== 'hold' && s.mode !== 'follow' && phase !== 'deploy') { const [tu, tv] = toMap(s.tx, s.tz); ctx.setLineDash([4, 4]); ctx.strokeStyle = s.mode === 'charge' ? '#f66' : '#cde'; ctx.beginPath(); ctx.moveTo(cu, cv); ctx.lineTo(tu, tv); ctx.stroke(); ctx.setLineDash([]); }
      const [fu, fv] = toMap(s.cx + Math.sin(s.face) * 12, s.cz + Math.cos(s.face) * 12); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cu, cv); ctx.lineTo(fu, fv); ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = sel ? '#f0c030' : s.mode === 'flee' ? 'rgba(200,60,40,.9)' : TEAM_BG[ME]; ctx.fillRect(cu - 17, cv - 20, 34, 15); ctx.fillStyle = '#fff'; ctx.fillText(`${s.num}${s.T.label}${s.mode === 'follow' ? '護' : ''}`, cu, cv - 12);
    } else { const v = s.alive.filter(m => m.seen); if (!v.length) continue; let x = 0, z = 0; for (const m of v) { x += m.x; z += m.z; } const [u, w] = toMap(x / v.length, z / v.length);
      ctx.fillStyle = TEAM_BG[s.team]; ctx.fillRect(u - 10, w - 20, 20, 15); ctx.fillStyle = '#fff'; ctx.fillText(s.T.label, u, w - 12); } }
  for (const m of msgs) { if (!ally(m.team, ME) && !all && !canSee(spMe, m)) continue; const [u, v] = toMap(m.x, m.z);
    if (m.team === ME) { const [su, sv] = toMap(m.squad.cx, m.squad.cz); ctx.strokeStyle = 'rgba(255,230,80,.5)'; ctx.beginPath(); ctx.moveTo(u, v); ctx.lineTo(su, sv); ctx.stroke(); }
    ctx.fillStyle = m.team === ME ? '#ffe050' : '#ff9030'; ctx.beginPath(); ctx.arc(u, v, 3.5, 0, 7); ctx.fill(); }
  const hz = horses[ME]; if (hz && !player.mounted) { const [u, v] = toMap(hz.x, hz.z); ctx.fillStyle = '#ffe9a0'; ctx.font = 'bold 16px serif'; ctx.fillText('♞', u, v); }
  const [px, pz] = toMap(player.x, player.z), f2 = player.face, A = MA(), dir = (ang, r) => { const x = Math.sin(ang) * r, z = Math.cos(ang) * r; return [x * Math.cos(A) - z * Math.sin(A), x * Math.sin(A) + z * Math.cos(A)]; };
  ctx.fillStyle = '#fff'; ctx.beginPath(); let d = dir(f2, 9); ctx.moveTo(px + d[0], pz + d[1]); d = dir(f2 + 2.5, 6); ctx.lineTo(px + d[0], pz + d[1]); d = dir(f2 - 2.5, 6); ctx.lineTo(px + d[0], pz + d[1]); ctx.fill();
  ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif';
  ctx.fillText(phase === 'deploy' ? '布陣：部隊をドラッグで移動 ／ 右クリックでその方向を向く ／ 上のボタンで陣形・護衛 ／ 黄色の枠の中に置ける' : '自分の色:味方　他の色:視界内の敵　黄:伝令　白▲:あなた　♞:あなたの馬　暗い所は見えない', 8, 12);
}
function mapPt(ev) { const r = mapC.getBoundingClientRect(); return fromMap((ev.clientX - r.left) * mapS / r.width, (ev.clientY - r.top) * mapS / r.height); }
function pickSquad(x, z) { let best = null, bd = 18; for (const s of squads) { if (s.team !== ME || !s.alive.length) continue; const d = Math.hypot(s.cx - x, s.cz - z); if (d < bd) { bd = d; best = s; } } return best; }
function mapEvent(ev) {
  const [x, z] = mapPt(ev);
  if (ev.button === 0) { const best = pickSquad(x, z);
    if (!ev.shiftKey && !(best && selected.has(best.num) && phase === 'deploy')) selected.clear();
    if (best) { if (selected.has(best.num) && ev.shiftKey) selected.delete(best.num); else selected.add(best.num); if (phase === 'deploy') dragging = { s: best, x, z }; } }
  else if (ev.button === 2) { if (phase === 'deploy') { for (const s of selectedSquads()) deployApply(s, { face: Math.atan2(x - s.ax, z - s.az) }); } else orderSelected(ev.shiftKey ? 'charge' : 'move', { x, z }); }
  hudT = 0;
}
function mapMove(ev) { // 布陣中：選んだ部隊をまとめてドラッグ
  if (!dragging || phase !== 'deploy') return; const [x, z] = mapPt(ev), dx = x - dragging.x, dz = z - dragging.z; if (Math.hypot(dx, dz) < 0.5) return;
  dragging.x = x; dragging.z = z; for (const s of selectedSquads()) deployApply(s, { x: s.ax + dx, z: s.az + dz }, true);
}

// ===== 入力 =====
function selectKey(n, add) { if (!add) selected.clear(); if (selected.has(n) && add) selected.delete(n); else selected.add(n); hudT = 0; }
function initInput() {
  addEventListener('keydown', e => {
    if (!running) return; keys[e.code] = true;
    if (e.code === 'Tab') { e.preventDefault(); openMap(!mapOpen); return; }
    if (e.code === 'KeyQ') { showFormMenu(true); return; }
    const dm = e.code.match(/^Digit(\d)$/); if (dm) { if (keys.KeyQ) { const f = FORM_IDS[+dm[1] - 1]; if (f) orderFormation(f); } else selectKey(+dm[1], e.shiftKey); return; }
    if (e.code === 'Backquote' || e.code === 'BracketLeft' || e.key === '@') { selected.clear(); for (const s of squads) if (s.team === ME && s.alive.length && s.mode !== 'follow') selected.add(s.num); hudT = 0; return; }
    if ((e.code === 'Enter' || e.code === 'NumpadEnter') && phase === 'deploy') { pressReady(); return; }
    if (e.code === 'KeyG') orderSelected('escort');
    if (e.code === 'KeyT' && player.alive && !mapOpen) player.blocking = true; // T を押している間は盾（武器）で構える
    if (e.code === 'KeyF' && !mapOpen) orderSelected('move', aimPoint());
    if (e.code === 'KeyC' && !mapOpen && player.alive) orderSelected('charge', aimPoint());
    if (e.code === 'KeyH') orderSelected('hold');
    if (e.code === 'KeyR') orderSelected('rally');
    if (e.code === 'KeyE' && !e.repeat) tryMount();
    if (e.code === 'KeyV' && !e.repeat) { thirdPerson = !thirdPerson; hudT = 0; }
  });
  addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyT' && player) player.blocking = false; if (e.code === 'KeyQ') showFormMenu(false); });
  $('formMenu').innerHTML = FORM_IDS.map((f, i) => `<div class="fm" data-f="${f}"><b>${i + 1}</b>${FORMS[f].name}<small>${FORMS[f].d}</small></div>`).join('');
  $('formBar').innerHTML = '陣形：' + FORM_IDS.map((f, i) => `<button data-f="${f}">${i + 1} ${FORMS[f].name}</button>`).join('') + '<button data-esc="1" title="G キー">護衛にする/外す</button><button id="readyBtn" class="rdy">開戦</button>';
  for (const el of [$('formMenu'), $('formBar')]) el.addEventListener('mousedown', e => { const b = e.target.closest('[data-f]'); if (b) { e.stopPropagation(); orderFormation(b.dataset.f); }
    if (e.target.closest('[data-esc]')) { e.stopPropagation(); orderSelected('escort'); } if (e.target.closest('#readyBtn')) { e.stopPropagation(); pressReady(); } });
  $('gl').addEventListener('click', () => { if (running && !mapOpen) { try { $('gl').requestPointerLock()?.catch?.(() => {}); } catch (e) {} } });
  addEventListener('mousemove', e => { if (document.pointerLockElement !== $('gl')) return; yaw -= e.movementX * 0.0022; pitch = clamp(pitch - e.movementY * 0.0022, -1.4, 1.4); });
  addEventListener('mousedown', e => { if (document.pointerLockElement !== $('gl') || !player.alive) return; if (e.button === 0 && phase !== 'deploy') playerAttack(); if (e.button === 2) player.blocking = true; });
  addEventListener('mouseup', e => { if (e.button === 2 && player && !keys.KeyT) player.blocking = false; });
  addEventListener('contextmenu', e => e.preventDefault());
  mapC.addEventListener('mousedown', mapEvent); addEventListener('mousemove', mapMove);
  addEventListener('mouseup', () => { if (dragging) { if (NET.mode === 'guest') for (const s of selectedSquads()) deployApply(s, {}); dragging = null; } });
  $('spec').onclick = () => { spectate = true; running = true; $('end').style.display = 'none'; hudT = 0; };
}

// =====================================================================
// オンライン（ホストが全軍を計算、ゲストは結果を表示）。公開MQTTリレー、0.125秒ごと
// =====================================================================
const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
const MAX_P = 5;
const NET = { mode: 'solo', via: '', room: '', myId: 'w' + Math.random().toString(36).slice(2, 10), peers: new Map(), tr: null, isHost: false, hostId: null,
  outEv: [], evSeq: 0, ackIn: 0, lastIn: 0, newArrows: [], snapT: 0, pres: {}, ping: 0, lobbyIv: null, tickIv: null, lastSnapSeq: 0, inSeq: 0, sentAt: [],
  players: [], teamOf: new Map(), gin: [] }; // gin[t] = ゲストごとの受信状態 { ack, echo, lastIn }
const SNAP_MS = 125;
const txt = p => typeof p === 'string' ? p : new TextDecoder().decode(p);
function pushEv(arr) { NET.outEv.push([++NET.evSeq, ...arr]); if (NET.outEv.length > 80) NET.outEv.splice(0, NET.outEv.length - 80); }
function status(t) { $('lobbyStatus').innerHTML = t; }
async function connectTransport(room) {
  const base = `warlord-nhs/v2/${room}/`;
  if (params.get('net') === 'mock') { const bc = new BroadcastChannel('warlord-' + room), hs = []; bc.onmessage = e => hs.forEach(f => f(e.data.t, e.data.d));
    return { pub: (t, d) => bc.postMessage({ t, d }), on: f => hs.push(f), name: 'mock', probe() {}, rtts: () => ({ mock: 1 }), use() {} }; }
  if (!window.mqtt) { status('通信ライブラリを読み込めなかった'); return null; }
  status('リレーサーバーに接続中…'); const conns = [];
  await Promise.all(BROKERS.map(url => new Promise(res => {
    const host = url.split('/')[2].split(':')[0]; let c; try { c = mqtt.connect(url, { clientId: 'wl_' + Math.random().toString(36).slice(2, 12), keepalive: 30, clean: true, reconnectPeriod: 2000, connectTimeout: 6000 }); } catch (e) { res(); return; }
    const to = setTimeout(() => { try { c.end(true); } catch (e) {} res(); }, 7000); c.on('error', () => {});
    c.once('connect', () => { clearTimeout(to); c.subscribe(base + '#', { qos: 0 }); conns.push({ name: host, cl: c, rtt: [] }); res(); });
  })));
  if (!conns.length) return null;
  const hs = []; let use = null;
  for (const c of conns) c.cl.on('message', (topic, p) => {
    if (!topic.startsWith(base)) return; const t = topic.slice(base.length);
    if (t === 'k/' + NET.myId) { c.rtt.push(performance.now() - +txt(p)); if (c.rtt.length > 6) c.rtt.shift(); return; }
    if (t.startsWith('k/') || (use && c !== use)) return; hs.forEach(f => f(t, p));
  });
  return {
    pub: (t, d) => { for (const c of (use ? [use] : conns)) if (c.cl.connected) try { c.cl.publish(base + t, d, { qos: 0 }); } catch (e) {} },
    on: f => hs.push(f), get name() { return use ? use.name : conns.map(c => c.name).join('/'); },
    probe() { for (const c of conns) if (c.cl.connected) try { c.cl.publish(base + 'k/' + NET.myId, String(performance.now()), { qos: 0 }); } catch (e) {} },
    rtts() { const o = {}; for (const c of conns) if (c.rtt.length) { const a = [...c.rtt].sort((x, y) => x - y); o[c.name] = Math.round(a[a.length >> 1]); } return o; },
    use(name) { const c = conns.find(c => c.name === name); if (!c) return; use = c; for (const o of conns) if (o !== c) setTimeout(() => { try { o.cl.end(true); } catch (e) {} }, 3000); },
  };
}
// 全員の回線で一番遅い人が一番速くなるリレーを選ぶ
function pickBroker(list) { let best = null, bv = 1e9; const keys = Object.keys(list[0] || {}); for (const k of keys) { let v = 0; for (const r of list) { if (!r || r[k] === undefined) { v = 1e9; break; } v = Math.max(v, r[k]); } if (v < bv) { bv = v; best = k; } } return best || keys[0] || null; }
async function joinRoom() {
  if (NET.tr) return;
  const room = ($('room').value.trim().toUpperCase() || Math.random().toString(36).slice(2, 6).toUpperCase()).replace(/[^A-Z0-9]/g, '').slice(0, 8);
  $('room').value = room; NET.room = room; $('join').disabled = true;
  const tr = await connectTransport(room);
  if (!tr) { status('接続できなかった…時間をおいてもう一度試してね'); $('join').disabled = false; return; }
  NET.tr = tr; NET.via = tr.name; tr.on(onNet);
  $('invite').textContent = '招待URL: ' + location.origin + location.pathname + '?room=' + room;
  try { history.replaceState(null, '', location.pathname + '?room=' + room + (params.get('net') ? '&net=' + params.get('net') : '') + (TEST ? '&test=1' : '')); } catch (e) {}
  NET.lobbyIv = setInterval(lobbyTick, 1000); lobbyTick();
}
function lobbyTick() {
  NET.pres.lo = LO; NET.pres.name = TEAM_NAME[0]; if (!running) { NET.tr.probe(); NET.pres.rtt = NET.tr.rtts(); } NET.tr.pub('p/' + NET.myId, JSON.stringify(NET.pres));
  const now = Date.now(); for (const [id, o] of NET.peers) if (now - o.t > 5000) NET.peers.delete(id);
  if (!running) updateLobby();
}
function lobbyIds() { return [NET.myId, ...NET.peers.keys()].sort(); }
function updateLobby() {
  const ids = lobbyIds().slice(0, MAX_P), my = ids.indexOf(NET.myId), go = $('go');
  const list = ids.map((id, i) => `<span style="color:${TEAM_CSS[i]}">■${TEAM_NAME[i]}軍${id === NET.myId ? '(あなた)' : ''}</span>`).join(' ');
  if (my < 0) { status(`この部屋は満員（${MAX_P}人まで）。別の部屋コードにしてね`); go.disabled = true; return; }
  NET.isHost = my === 0; NET.hostId = ids[0]; NET.lobbyN = ids.length;
  syncTeamOpts();
  if (ids.length < 2) { status(`部屋「${NET.room}」で仲間を待っています…（招待URLを送ってね。最大${MAX_P}人）<br>${list}`); go.disabled = true; go.textContent = '相手を待っています'; return; }
  const rt = NET.tr.rtts(), rs = Object.entries(rt).map(([k, v]) => `${k.split('.')[1] || k} ${v}ms`).join(' / ');
  if (NET.isHost) { status(`${ids.length}人そろった。あなたがホスト。戦場・軍の数・規模を選んで「開戦」（足りない軍はCPU）<br>${list}　<small>回線: ${rs}</small>`); go.disabled = false; go.textContent = '開戦'; $('cfgnote').textContent = ''; }
  else { status(`${ids.length}人そろった。ホストの開戦を待っています<br>${list}`); go.disabled = true; go.textContent = 'ホストの開戦待ち'; $('cfgnote').textContent = '（設定はホストが決める）'; }
  if (TEST && params.has('autogo') && NET.isHost && !running && ids.length >= +(params.get('autogo') || 2)) setTimeout(() => { if (!running) $('go').click(); }, 300);
}
function onNet(t, p) {
  if (t.startsWith('p/')) {
    const id = t.slice(2); if (id === NET.myId) return; const s = txt(p);
    if (!s) { NET.peers.delete(id); return; }
    let o; try { o = JSON.parse(s); } catch (e) { return; }
    NET.peers.set(id, { t: Date.now(), p: o });
    if (!running && !ended) { updateLobby(); if (o.go && o.go.players && o.go.players[0] === id && o.go.players.includes(NET.myId)) {
      if (o.go.broker) { NET.tr.use(o.go.broker); NET.via = o.go.broker; } startGame({ ...o.go, mode: 'guest' }); } }
  } else if (t === 's') { if (NET.mode === 'guest') recvSnap(p); }
  else if (t.startsWith('i/')) { if (NET.mode === 'host') recvInput(txt(p), t.slice(2)); }
}
const Q = 50, PHASES = ['deploy', 'battle'];
function packSnap() {
  const evB = new TextEncoder().encode(JSON.stringify(NET.outEv.slice(-40)));
  const n = ents.length, ns = squads.length, nm = Math.min(msgs.length, 255), na = Math.min(NET.newArrows.length, 1000);
  const buf = new ArrayBuffer(40 + NT * 30 + n * 7 + ns * 15 + nm * 6 + na * 12 + evB.length), dv = new DataView(buf); let o = 0;
  const u8 = v => dv.setUint8(o++, v), u16 = v => { dv.setUint16(o, clamp(v, 0, 65535)); o += 2; }, i16 = v => { dv.setInt16(o, clamp(Math.round(v), -32767, 32767)); o += 2; }, f32 = v => { dv.setFloat32(o, v); o += 4; }, u32 = v => { dv.setUint32(o, v); o += 4; };
  u8(87); u8(5); u32(++NET.lastSnapSeq); f32(gameT); u8(PHASES.indexOf(phase)); f32(deployT); u8(NT); u8(zone ? (zone.holder ?? -1) + 1 : 0);
  for (let t = 0; t < NT; t++) { const h = horses[t] || { x: 0, z: 0, face: 0, spd: 0 }, g = NET.gin[t] || {};
    u16(Math.ceil(heroes[t].hp)); u16(heroes[t].kills); u8((elim[t] ? 1 : 0) | (ready.has(t) ? 2 : 0)); u8(place[t] || 0);
    i16(h.x * Q); i16(h.z * Q); i16(h.face % (Math.PI * 2) * 5000); i16(h.spd * 100); u32(g.ack || 0); u32(g.echo || 0); }
  u16(n);
  for (const e of ents) { i16(e.x * Q); i16(e.z * Q); dv.setInt8(o++, Math.round(((e.face % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) / (Math.PI * 2) * 250) - 125);
    u8((e.alive ? 1 : 0) | (e.anim > 0.05 ? 2 : 0) | (e.blocking ? 8 : 0) | (e.mounted ? 16 : 0) | (e.gone ? 32 : 0) | (e.rout ? 64 : 0)); u8(Math.round(clamp(e.hp / e.T.hp, 0, 1) * 255)); }
  u8(ns); for (const s of squads) { i16(s.ax * Q); i16(s.az * Q); i16(s.tx * Q); i16(s.tz * Q); i16(s.face * 5000); u8(MODES.indexOf(s.mode)); u8(Math.max(0, s.pending)); u8(Math.round(clamp(s.engaged, 0, 1) * 255)); u8(FORM_IDS.indexOf(s.form)); u8(s.reinfT ? clamp(Math.ceil(s.reinfT - gameT), 1, 255) : 0); u8(Math.round(clamp(s.mor, 0, 100))); }
  u8(nm); for (let i = 0; i < nm; i++) { const m = msgs[i]; u8(m.team); u8(m.squad.idx); i16(m.x * Q); i16(m.z * Q); }
  u16(na); for (let i = 0; i < na; i++) { const a = NET.newArrows[i]; i16(a.x * Q); i16(a.y * Q); i16(a.z * Q); i16(a.vx * 100); i16(a.vy * 100); i16(a.vz * 100); }
  u16(evB.length); new Uint8Array(buf, o, evB.length).set(evB);
  NET.newArrows.length = 0; return new Uint8Array(buf, 0, o + evB.length);
}
function recvSnap(p) {
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength); let o = 0;
  const u8 = () => dv.getUint8(o++), u16 = () => { const v = dv.getUint16(o); o += 2; return v; }, i16 = () => { const v = dv.getInt16(o); o += 2; return v; }, f32 = () => { const v = dv.getFloat32(o); o += 4; return v; }, u32 = () => { const v = dv.getUint32(o); o += 4; return v; };
  if (u8() !== 87 || u8() !== 5) return;
  const seq = u32(); if (seq <= NET.lastSnapSeq) return; NET.lastSnapSeq = seq;
  gameT = f32(); const ph = PHASES[u8()] || 'battle'; deployT = f32(); const nt = u8(); const zh = u8() - 1; if (zone) zone.holder = zh;
  if (ph !== phase) { phase = ph; if (ph === 'battle') beginBattleLocal(); }
  const deploying = phase === 'deploy';
  for (let t = 0; t < nt; t++) { const hp = u16(), kl = u16(), fl = u8(), pl = u8(), x = i16() / Q, z = i16() / Q, f = i16() / 5000, s = i16() / 100, ack = u32(), echo = u32();
    if (heroes[t]) { heroes[t].hp = hp; heroes[t].kills = kl; } if (fl & 2) ready.add(t); else ready.delete(t);
    const h = horses[t]; if (h && t !== ME) { h.nx = x; h.nz = z; h.nf = f; h.spd = s; }
    if (t === ME) { if (echo && NET.sentAt[echo % 64] && NET.sentAt[echo % 64][0] === echo) { const rtt = performance.now() - NET.sentAt[echo % 64][1]; NET.ping = Math.round(NET.ping ? NET.ping * 0.8 + rtt * 0.2 : rtt); }
      NET.outEv = NET.outEv.filter(e => e[0] > ack); } }
  const n = u16(); if (n !== ents.length) { console.warn('ents mismatch', n, ents.length); return; }
  const now = performance.now();
  for (let i = 0; i < n; i++) { const e = ents[i]; const x = i16() / Q, z = i16() / Q, f = dv.getInt8(o++) / 250 * Math.PI * 2, fl = u8(), hpb = u8();
    if (e === player) { e.alive = !!(fl & 1); continue; }
    if (deploying && e.team === ME) continue; // 布陣中の自軍は手元の配置を使う
    if (!e.alive && (fl & 1)) { e.x = x; e.z = z; e.nx = undefined; e.deadT = 0; e.settled = false; e.shown = undefined; e.mounted = !!e.T.mounted; if (e.h) { e.h.alive = true; e.h.deadT = 0; } } // 援軍で復活
    if (e.nx !== undefined && Math.hypot(x - e.nx, z - e.nz) < 6) { e.vx = (x - e.nx) / (SNAP_MS / 1000); e.vz = (z - e.nz) / (SNAP_MS / 1000); } else { e.vx = e.vz = 0; if (e.nx === undefined || Math.hypot(x - e.x, z - e.z) > 6) { e.x = x; e.z = z; } }
    e.nx = x; e.nz = z; e.nf = f;
    if (e.alive && !(fl & 1)) { e.x = x; e.z = z; e.px = x; e.pz = z; e.deadT = 0; if (e.h) { e.h.alive = false; e.mounted = false; } }
    e.alive = !!(fl & 1); e.gone = !!(fl & 32); e.rout = !!(fl & 64);
    if (fl & 2 && e.anim <= 0) { e.anim = e.animDur = e.type === 'hero' && e.W ? Math.max((SWINGS[e.swing] || SWINGS.diag).dur, e.W.cd * 0.95) : (e.T.shoot ? 1.0 : 0.6); }
    e.blocking = !!(fl & 8); if (e.type === 'hero') e.mounted = !!(fl & 16);
    e.hp = hpb / 255 * e.T.hp; }
  const myHp = heroes[ME].hp; if (myHp < (NET.lastHp ?? myHp)) hurtFx(NET.lastHp - myHp); NET.lastHp = myHp;
  NET.snapT = now;
  const ns = u8(); for (let i = 0; i < ns; i++) { const s = squads[i]; const ax = i16() / Q, az = i16() / Q, tx = i16() / Q, tz = i16() / Q, face = i16() / 5000, mode = MODES[u8()] || 'hold', pend = u8(), eng = u8() / 255, form = FORM_IDS[u8()] || 'line', rf = u8(), mor = u8();
    s.reinfT = rf ? gameT + rf : 0; s.pending = pend; s.engaged = eng; s.mor = mor; if (deploying && s.team === ME) continue;
    Object.assign(s, { ax, az, tx, tz, face, mode, form }); }
  const nm = u8(); msgs.length = 0; for (let i = 0; i < nm; i++) { const team = u8(), si = u8(), x = i16() / Q, z = i16() / Q; const s = squads[si]; msgs.push({ team, squad: s, x, z, y: H(x, z), face: Math.atan2(s.cx - x, s.cz - z), cyc: now / 440 }); }
  const na = u16(); for (let i = 0; i < na; i++) arrows.push({ x: i16() / Q, y: i16() / Q, z: i16() / Q, vx: i16() / 100, vy: i16() / 100, vz: i16() / 100, stuck: 0 });
  const evLen = u16(); let evs = []; try { evs = JSON.parse(new TextDecoder().decode(new Uint8Array(p.buffer, p.byteOffset + o, evLen))); } catch (e) {}
  for (const ev of evs) { if (ev[0] <= NET.ackIn) continue; NET.ackIn = ev[0];
    if (ev[1] === 'log') { if (ev[4] === -1 || ev[4] === ME) log(ev[2], ev[3]); }
    else if (ev[1] === 'elim') { if (!elim[ev[2]]) { onEliminated(ev[2], ev[3], ev[4]); log(`${ev[4] >= 0 && ev[4] !== ev[2] ? TEAM_NAME[ev[4]] + '軍が' : ''}${TEAM_NAME[ev[2]]}軍の将を討ち取った！ ${TEAM_NAME[ev[2]]}軍は総崩れ`, TEAM_CSS[ev[2]]); } }
    else if (ev[1] === 'end') end(ev[2], ev[3]); }
  NET.lastIn = Date.now();
}
function sendInput() {
  const p = player, h = horses[ME], id = ++NET.inSeq; NET.sentAt[id % 64] = [id, performance.now()];
  NET.tr.pub('i/' + NET.myId, JSON.stringify({ q: id, x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: +p.y.toFixed(2), f: +p.face.toFixed(3), b: p.blocking ? 1 : 0, m: p.mounted ? 1 : 0,
    hx: +h.x.toFixed(2), hz: +h.z.toFixed(2), hf: +h.face.toFixed(3), hs: +h.spd.toFixed(2), ak: NET.ackIn, ev: NET.outEv }));
}
function recvInput(s, id) {
  const t = NET.teamOf.get(id); if (t === undefined || !human.has(t)) return;
  let o; try { o = JSON.parse(s); } catch (e) { return; }
  const G = NET.gin[t] || (NET.gin[t] = { ack: 0, echo: 0, lastIn: 0, hostAck: 0 });
  if (!G.lastIn) teamLog(-1, `${TEAM_NAME[t]}軍の将が戦場に着いた`, TEAM_CSS[t]);
  G.lastIn = Date.now(); G.echo = o.q | 0; G.hostAck = o.ak | 0;
  const e = heroes[t], h = horses[t];
  if (e.alive) { let x = clamp(+o.x || 0, -WALL, WALL), z = clamp(+o.z || 0, -WALL, WALL); if (phase === 'deploy') [x, z] = clampDeploy(t, x, z);
    e.x = x; e.z = z; e.y = H(e.x, e.z); e.face = +o.f || 0; e.blocking = !!o.b; e.mounted = !!o.m;
    e.spd = e.px !== undefined ? Math.hypot(e.x - e.px, e.z - e.pz) / (SNAP_MS / 1000) : 0; e.px = e.x; e.pz = e.z; }
  if (h) { h.x = +o.hx || h.x; h.z = +o.hz || h.z; h.y = H(h.x, h.z); h.face = +o.hf || 0; h.spd = +o.hs || 0; }
  if (e.mounted && h) e.look = clamp(angDiff(h.face, e.face), -1.3, 1.3); else e.look = 0;
  // ホストの出来事は全員が受け取ったところまで消す
  let minAck = Infinity; for (const u of human) if (u !== ME && NET.gin[u] && NET.gin[u].lastIn) minAck = Math.min(minAck, NET.gin[u].hostAck); if (minAck < Infinity) NET.outEv = NET.outEv.filter(ev => ev[0] > minAck);
  for (const ev of (Array.isArray(o.ev) ? o.ev : [])) {
    if (!Array.isArray(ev) || ev[0] <= G.ack) continue; G.ack = ev[0];
    if (ev[1] === 'a' && e.alive && running && phase === 'battle') { startAttack(e); e.hitAt = 0; }
    else if (ev[1] === 'h' && e.alive && running && phase === 'battle') { // ゲストの画面で当たった相手（距離だけ確かめる）
      const hits = []; for (const id2 of ev.slice(2)) { const v = ents[id2 | 0]; if (v && v.alive && !ally(v.team, t) && Math.hypot(v.x - e.x, v.z - e.z) < e.W.range + 4.5) hits.push([Math.hypot(v.x - e.x, v.z - e.z), v]); }
      heroAttack(e, hits.slice(0, e.W.maxHits)); }
    else if (ev[1] === 'o' && running && phase === 'battle') { const sq = squads[ev[2] | 0]; if (sq && sq.team === t && MODES.includes(ev[3])) sendOrder(t, sq, { mode: ev[3], x: clamp(+ev[4] || 0, -WALL, WALL), z: clamp(+ev[5] || 0, -WALL, WALL), form: FORMS[ev[6]] ? ev[6] : undefined, face: typeof ev[7] === 'number' ? ev[7] : undefined }); }
    else if (ev[1] === 'd' && phase === 'deploy') { const sq = squads[ev[2] | 0]; if (sq && sq.team === t) { [sq.ax, sq.az] = clampDeploy(t, +ev[3] || 0, +ev[4] || 0); sq.face = +ev[5] || 0; sq.form = FORM_IDS[ev[6] | 0] || 'line'; sq.mode = ev[7] ? 'follow' : 'hold'; sq.escort = !!ev[7]; sq.tx = sq.ax; sq.tz = sq.az; sq.snap(); } }
    else if (ev[1] === 'r') ready.add(t);
  }
}
function netTick() {
  if (!NET.tr) return;
  if (NET.mode === 'host') {
    NET.tr.pub('s', packSnap());
    if (!ended) for (const t of [...human]) { if (t === ME) continue; const G = NET.gin[t];
      const quiet = G && G.lastIn ? Date.now() - G.lastIn : Date.now() - NET.startAt;
      if (phase === 'battle' && quiet > (G && G.lastIn ? 8000 : 25000)) { cpuTakeover(t); teamLog(-1, `${TEAM_NAME[t]}軍の将と連絡が取れない。CPUが指揮を引き継ぐ`, '#fa8'); } }
  } else if (NET.mode === 'guest') { sendInput(); if (!ended && Date.now() - NET.lastIn > 8000) end(-1, 'drop'); }
}
function guestTick(dt) {
  // 届いた位置＋速度×(経過時間＋片道の遅れ) で「今いるはずの位置」を推定し、そこへなめらかに寄せる
  const age = (performance.now() - NET.snapT) / 1000, lead = clamp(age + (NET.ping || 200) / 2000, 0, 0.45), k = Math.min(1, dt * 12);
  for (const e of ents) {
    if (e === player || e.nx === undefined) continue; if (phase === 'deploy' && e.team === ME) continue; const ox = e.x, oz = e.z;
    const tx = e.alive ? e.nx + (e.vx || 0) * lead : e.nx, tz = e.alive ? e.nz + (e.vz || 0) * lead : e.nz;
    e.x += (tx - e.x) * k; e.z += (tz - e.z) * k; e.face = lerpAngle(e.face, e.nf, k); e.y = H(e.x, e.z);
    if (e.alive) { const v = Math.hypot(e.x - ox, e.z - oz) / Math.max(dt, 0.001); e.spd = e.spd * 0.85 + v * 0.15; advanceWalk(e, dt); if (e.h) { e.h.spd = e.spd; advanceHorse(e.h, dt); }
      e.ready = !!(e.squad && e.squad.engaged > 0.15 && !e.T.shoot); }
    e.anim = Math.max(0, e.anim - dt);
  }
  for (let t = 0; t < NT; t++) { const oh = horses[t]; if (t === ME || !oh || oh.nx === undefined) continue; const tx = oh.nx + Math.sin(oh.nf) * oh.spd * lead, tz = oh.nz + Math.cos(oh.nf) * oh.spd * lead;
    oh.x += (tx - oh.x) * k; oh.z += (tz - oh.z) * k; oh.face = lerpAngle(oh.face, oh.nf, k); oh.y = H(oh.x, oh.z); advanceHorse(oh, dt);
    const oe = heroes[t]; if (oe.mounted) oe.look = clamp(angDiff(oh.face, oe.face), -1.3, 1.3); }
  if (phase === 'deploy') deployTick(dt, true);
  for (const s of squads) { s.derive(); s.moving = Math.hypot(s.tx - s.ax, s.tz - s.az) > 1.5; }
  buildGrid(); updatePlayer(dt); updateArrows(dt, true);
}

// ===== 布陣 → 開戦 =====
function deployTick(dt, local) {
  if (!local) deployT -= dt;
  for (const s of squads) if (s.team === ME || !local) { if (s.mode === 'follow' && s.alive.length) { const [x, z] = s.followPoint(); [s.ax, s.az] = clampDeploy(s.team, x, z); s.tx = s.ax; s.tz = s.az; s.face = heroes[s.team].face; } s.snap(); }
  if (!local && (deployT <= 0 || [...human].every(t => ready.has(t)))) startBattle();
}
function pressReady() {
  if (phase !== 'deploy') return; ready.add(ME); hudT = 0;
  if (NET.mode === 'solo') startBattle();
  else if (NET.mode === 'guest') { pushEv(['r']); log('準備完了。ほかの将を待っています…', '#e8c77a'); }
  else if (NET.mode === 'host') log('準備完了。ほかの将を待っています…', '#e8c77a');
}
function startBattle() { if (phase !== 'deploy') return; phase = 'battle'; beginBattleLocal(); if (NET.mode === 'host') NET.battleAt = Date.now(); }
function beginBattleLocal() {
  phase = 'battle'; SFX.horn(); openMap(false); hudT = 0;
  for (const s of squads) { s.tx = s.ax; s.tz = s.az; s.tface = null; }
  log('開戦！ 伝令で部隊を動かせ', '#e8c77a');
}

// ===== メインループ =====
function step(dt) {
  if (phase === 'deploy') { deployTick(dt, false); buildGrid(); updatePlayer(dt); for (let t = 0; t < NT; t++) { const h = heroes[t]; if (h !== player && !h.squad) { advanceWalk(h, dt); if (horses[t]) advanceHorse(horses[t], dt); } } return; }
  gameT += dt; buildGrid();
  for (const s of squads) s.update(dt);
  for (const e of ents) { if (!e.alive) continue; if (e.type === 'hero' && !e.squad) { if (e !== player) { e.anim = Math.max(0, e.anim - dt); e.cd -= dt; if (e.hitAt > 0) { e.hitAt -= dt; if (e.hitAt <= 0) heroAttack(e); } advanceWalk(e, dt); const hh = horses[e.team]; if (hh) advanceHorse(hh, dt); } continue; }
    e.anim = Math.max(0, e.anim - dt); soldierAI(e, dt);
    if (e.mounted && e.spd > 8 && frameNo % 6 === e.id % 6 && Math.hypot(e.x - camera.position.x, e.z - camera.position.z) < 100) FX.dust(e.x, e.y + 0.2, e.z); }
  updatePlayer(dt);
  for (const h of heroes) if (h.alive && !h.squad && gameT - h.lastHurt > 5 && h.hp < h.T.hp) h.hp = Math.min(h.T.hp, h.hp + 10 * dt);
  updateArrows(dt); updateMsgs(dt);
  aiTimer -= dt; if (aiTimer <= 0) { aiTimer = 4; for (const t of aiTeams) aiThink(t); }
  moraleTick(dt); objectives(dt);
}
function frame(dt) {
  if (running) { if (NET.mode === 'guest') guestTick(dt); else step(dt); }
  if (player) { render(dt); if (mapOpen) drawMap(); updateHUD(dt); }
}
const clock = new THREE.Clock();
function loop() { requestAnimationFrame(loop); frame(Math.min(clock.getDelta(), 0.05)); }

const pick = a => a[Math.floor(Math.random() * a.length)];
function pickFoe(self) { return pick(ARMOR_IDS.filter(a => a !== self)); }
// CPUの軍の装備と編成（ホストが決めて全員に配る）
function cpuLoadout() { return { self: pickFoe(''), wpn: pick(WEAPON_IDS.filter(w => w !== 'lance')), army: LO.foe !== 'auto' ? LO.foe : pickFoe(LO.army), comp: pick(CPU_COMPS), cpu: 1 }; }
function startGame(cfg) {
  if (running || player) return;
  MAP = MAPS[cfg.map] ? cfg.map : 'hill'; SIZE = cfg.size; NET.mode = cfg.mode; NT = clamp(cfg.nt | 0 || 2, 2, MAP === 'mountain' ? 2 : 5);
  const players = cfg.players || [NET.myId]; ME = cfg.mode === 'guest' ? players.indexOf(NET.myId) : 0;
  NET.players = players; players.forEach((id, t) => NET.teamOf.set(id, t));
  TEAM_A = [...Array(NT).keys()].map(t => t * Math.PI * 2 / NT); SIDE = [...Array(NT).keys()]; TEAM_OFF = []; ZW = [];
  COOP = !!cfg.coop; ODDS = COOP ? clamp(+cfg.odds || 1, 1, 3) : 1;
  if (COOP) { // 協力戦：味方の軍を北側に横並び、敵の軍を南側に横並び
    const A = clamp(cfg.allies | 0 || 1, 1, NT - 1);
    for (let t = 0; t < NT; t++) { const mine = t < A, k = mine ? A : NT - A, i = mine ? t : t - A, w = k === 1 ? 125 : (250 - 14 * (k - 1)) / k / 2;
      SIDE[t] = mine ? 0 : A; TEAM_A[t] = mine ? 0 : Math.PI; TEAM_OFF[t] = (i - (k - 1) / 2) * (2 * w + 14) * (mine ? 1 : -1); ZW[t] = w; } }
  const los = cfg.los || [];
  for (let t = 0; t < NT; t++) { const lo = los[t] || (t === 0 ? LO : cpuLoadout()); los[t] = lo; teamArmor[t] = lo.army; heroArmor[t] = lo.self; heroWpn[t] = lo.wpn; elim[t] = false; }
  zone = MAPS[MAP].zone ? { ...MAPS[MAP].zone, holder: -1 } : null;
  for (let t = 0; t < NT; t++) { const isHuman = t < players.length && !(los[t] && los[t].cpu); if (isHuman) human.add(t); else aiTeams.add(t); spawnArmy(t, los[t], !isHuman); }
  player = heroes[ME]; yaw = teamFrame(ME).a;
  phase = 'deploy'; deployT = DEPLOY_T;
  initRender(); initInput();
  $('start').style.display = 'none'; $('hud').style.display = 'block'; running = true; SFX.init();
  if (cfg.mode !== 'solo') {
    if (NET.lobbyIv) clearInterval(NET.lobbyIv); NET.lobbyIv = setInterval(lobbyTick, 2500);
    NET.lastIn = Date.now(); NET.inSeq = 0; NET.sentAt = []; NET.startAt = Date.now();
    NET.tickIv = setInterval(netTick, SNAP_MS);
  }
  log(`あなたは${TEAM_NAME[ME]}軍の将。いまは布陣の時間：Tab の地図で部隊をドラッグして配置、陣形と護衛を決めて ${cfg.mode === 'solo' ? 'Enter で開戦' : 'Enter で準備完了'}`, '#e8c77a');
  if (COOP) log(`協力戦：${SIDE.slice(0, NT).filter(x => x === 0).length}軍 対 ${SIDE.slice(0, NT).filter(x => x !== 0).length}軍${ODDS > 1 ? `　敵の兵力は${ODDS}倍。正面からでは勝てない。森の伏兵・側面や背後への突撃・敵将の首で崩せ` : ''}`, '#fd8');
  for (let t = 0; t < NT; t++) if (t !== ME) log(`${TEAM_NAME[t]}軍${COOP ? (ally(t, ME) ? '【味方】' : '【敵】') : ''}${aiTeams.has(t) ? '（CPU）' : ''}：${ARMORS[teamArmor[t]].name}　将：${ARMORS[heroArmor[t]].name}・${WEAPONS[heroWpn[t]].name}`, TEAM_CSS[t]);
  if (TEST && params.has('fight')) startBattle(); else openMap(true);
  if (!TEST && !mapOpen) { try { $('gl').requestPointerLock()?.catch?.(() => {}); } catch (e) {} }
  clock.getDelta(); if (!TEST || !params.has('manual')) setTimeout(loop, 0);
  window.G = { ents, squads, msgs, arrows, step, frame, heroes, horses, NET, sendOrder, openMap, selected, orderSelected, orderFormation, issueOrder, playerAttack, tryMount, keys, FORMS, dealDamage, elim, startBattle, pressReady, deployApply, teamFrame, fw, zoneDims, aiTeams, human,
    get player() { return player }, get gameT() { return gameT }, get ME() { return ME }, get ended() { return ended }, get phase() { return phase }, get deployT() { return deployT }, ready, frameNo: () => frameNo, get NT() { return NT }, get zone() { return zone },
    set spectate(v) { spectate = v; }, get SIDE() { return SIDE }, get COOP() { return COOP }, breakSquad, moraleTick, view(o) { if (o.yaw !== undefined) yaw = o.yaw; if (o.pitch !== undefined) pitch = o.pitch; if (o.tp !== undefined) thirdPerson = o.tp; },
    async shot(name) { frame(0.016); if (mapOpen) drawMap(); const url = (mapOpen && params.has('mapshot') ? mapC : renderer.domElement).toDataURL('image/png'); return (await fetch('/shot?name=' + name, { method: 'POST', body: url })).text(); } };
}

// =====================================================================
// スタート画面・武具画面
// =====================================================================
let PV = null;
function initPreview() {
  const cv = $('pv'); if (!cv || PV) return;
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, preserveDrawingBuffer: TEST }); r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.8; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x1b1610);
  const sky = new Sky(); sky.scale.setScalar(50); const su = sky.material.uniforms; su.turbidity.value = 6; su.rayleigh.value = 1.3; su.sunPosition.value.setFromSphericalCoords(1, 1.0, 2.6);
  const es = new THREE.Scene(); es.add(sky); envDressing(es);
  sc.environment = new THREE.PMREMGenerator(r).fromScene(es, 0.02).texture;
  sc.add(new THREE.HemisphereLight(0xffe8c8, 0x302618, 0.6));
  const key = new THREE.DirectionalLight(0xffe2b8, 2.6); key.position.set(3, 6, 4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 }); sc.add(key);
  const rim = new THREE.DirectionalLight(0x9fb8ff, 1.2); rim.position.set(-4, 3, -4); sc.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(4.5, 48), new THREE.MeshStandardMaterial({ color: 0x3a2f22, roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; sc.add(floor);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
  PV = { r, sc, cam, mat: armorMaterial(), rigs: [], rot: 0.6, drag: null, t: 0, mode: 'hero', mounted: false };
  cv.addEventListener('pointerdown', e => { PV.drag = e.clientX; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (PV.drag !== null) { PV.rot += (e.clientX - PV.drag) * 0.01; PV.drag = e.clientX; } });
  cv.addEventListener('pointerup', () => PV.drag = null);
  rebuildPreview(); pvLoop();
}
function rebuildPreview() {
  if (!PV) return; for (const x of PV.rigs) x.r.dispose(); PV.rigs = [];
  const W = WEAPONS[LO.wpn], heroShield = W.shield ? ARMORS[LO.self].shield : null;
  const mk = (armor, wpn, shieldKind, detail, horse, x, z) => { const parts = buildBody(0, armor, true); parts.weapon = buildWeapon(wpn, 0, true); if (shieldKind) parts.shield = buildShield(0, shieldKind, true); if (horse) parts.horse = buildHorse(0, 'barded', true, armor);
    const r = new Rig(PV.sc, PV.mat, parts); const e = { id: 1, x, y: 0, z, face: 0, spd: 0, phase: 0, anim: 0, animDur: 1, swing: WEAPON_SWING[wpn], wpn, alive: true, shieldKind, mounted: !!horse, scale: 1 };
    const h = horse ? { x, y: 0, z, face: 0, spd: 0, phase: 0, alive: true } : null; PV.rigs.push({ r, e, h }); };
  if (PV.mode === 'hero') mk(LO.self, LO.wpn, heroShield, true, PV.mounted, 0, 0);
  else { mk(LO.army, 'arming', ARMORS[LO.army].shield, true, false, -0.75, 0.2); mk(LO.army, 'spear', null, true, false, 0.0, -0.3); mk(LO.army, 'poleaxe', null, true, false, 0.75, 0.2); }
  const cv = $('pv'); const w = cv.clientWidth, h = cv.clientHeight; PV.r.setSize(w, h, false); PV.cam.aspect = w / h; PV.cam.updateProjectionMatrix();
}
function pvLoop() {
  if (!PV || running) return; requestAnimationFrame(pvLoop); pvFrame();
}
function pvFrame() {
  PV.t += 0.016; if (PV.drag === null) PV.rot += 0.004;
  const mounted = PV.mode === 'hero' && PV.mounted, longW = ['glaive', 'lance', 'poleaxe'].includes(LO.wpn), dist = mounted ? 7.4 : PV.mode === 'army' ? 6.2 : longW ? 4.8 : 3.9, ty = mounted ? 1.6 : longW && PV.mode === 'hero' ? 1.25 : 1.0;
  PV.cam.position.set(Math.sin(PV.rot) * dist, ty + 0.55, Math.cos(PV.rot) * dist); PV.cam.lookAt(0, ty, 0);
  const cycle = PV.t % 4;
  for (const x of PV.rigs) { x.e.anim = cycle > 2.6 && cycle < 2.6 + x.e.animDur ? x.e.animDur - (cycle - 2.6) : 0; x.r.update(x.e, x.h); }
  PV.r.render(PV.sc, PV.cam);
}
function renderArmory() {
  const card = (kind, id, o, on) => `<div class="card ${on ? 'on' : ''}" data-k="${kind}" data-id="${id}"><b>${o.name}</b><span>${o.era || ''}</span></div>`;
  $('selfList').innerHTML = ARMOR_IDS.map(id => card('self', id, ARMORS[id], LO.self === id)).join('');
  $('wpnList').innerHTML = WEAPON_IDS.map(id => card('wpn', id, WEAPONS[id], LO.wpn === id)).join('');
  $('armyList').innerHTML = ARMOR_IDS.map(id => card('army', id, ARMORS[id], LO.army === id)).join('');
  $('foeList').innerHTML = card('foe', 'auto', { name: 'おまかせ', era: '毎回ちがう' }, LO.foe === 'auto') + ARMOR_IDS.map(id => card('foe', id, ARMORS[id], LO.foe === id)).join('');
  const A = ARMORS[PV && PV.mode === 'army' ? LO.army : LO.self], W = WEAPONS[LO.wpn];
  $('desc').innerHTML = PV && PV.mode === 'army'
    ? `<h3>自軍：${A.name}<small>${A.era}</small></h3><p>${A.desc}</p><p class="stat">被ダメージ ×${A.def}　移動 ×${A.spd}</p>`
    : `<h3>${A.name}<small>${A.era}</small></h3><p>${A.desc}</p><p class="stat">被ダメージ ×${A.def}　移動 ×${A.spd}</p><h3>${W.name}</h3><p>${W.desc}</p><p class="stat">威力 ${W.dmg}　間合い ${W.range}m　振り ${W.cd}秒　最大 ${W.maxHits}人${W.shield ? '　盾あり' : ''}</p>`;
}
function renderComp() {
  const mul = menuMul(true); let tot = 0;
  $('compList').innerHTML = LO.comp.map((q, i) => { const T = q && TYPES[q.t], n = T ? Math.max(4, Math.round(T.n * mul)) : 0; tot += n;
    return `<div class="crow"><b>${(i + 1) % 10}</b><select data-i="${i}"><option value="">― なし ―</option>${COMP_TYPES.map(k => `<option value="${k}" ${q && q.t === k ? 'selected' : ''}>${TYPES[k].name}</option>`).join('')}</select>
      <label><input type="checkbox" data-e="${i}" ${q && q.esc ? 'checked' : ''} ${T ? '' : 'disabled'}> 護衛</label><span class="cn">${T ? n + '人' : ''}</span></div>`; }).join('');
  const esc = LO.comp.filter(q => q && TYPES[q.t] && q.esc).length;
  $('compInfo').textContent = `合計 ${tot}人（いまの「軍の規模」と「軍の数」での人数）　護衛 ${esc}部隊`;
  $('typeHelp').innerHTML = COMP_TYPES.map(k => `<b style="color:#d8c8a0">${TYPES[k].name}</b>（${TYPES[k].n}人隊）${TYPES[k].d}`).join('<br>');
  $('loSummary').textContent = `自分：${ARMORS[LO.self].name}・${WEAPONS[LO.wpn].name}　自軍：${ARMORS[LO.army].name}　編成：${LO.comp.filter(q => q && TYPES[q.t]).map(q => TYPES[q.t].label).join('')}`;
}
const SIZE_SEL = () => +(document.querySelector('#sizes .on')?.dataset.size || 2), NT_SEL = () => +(document.querySelector('#teams .on')?.dataset.nt || 2);
const SELV = (id, k, d) => +(document.querySelector(`#${id} .on`)?.dataset[k] || d), COOP_SEL = () => document.querySelector('#kinds .on')?.dataset.k === 'coop';
// メニューで選んでいる設定での1軍の人数の倍率（mine=自分の軍、false=敵の軍）
function menuMul(mine) {
  if (!COOP_SEL()) return SIZE_SEL() * (NT_SEL() <= 2 ? 1 : 2.3 / NT_SEL());
  const A = SELV('allies', 'n', 1), tot = SIZE_SEL() * (A <= 1 ? 1 : 1.3); return mine ? tot / A : tot * SELV('odds', 'x', 1) / SELV('foes', 'n', 1);
}
// 軍の数と戦場の組み合わせ（山岳は2軍だけ、オンラインは人数以上）
function syncTeamOpts() {
  const map = document.querySelector('#maps .on')?.dataset.map || 'hill', max = MAPS[map].max, min = NET.tr && document.querySelector('#modes .on')?.dataset.mode === 'online' ? Math.max(2, NET.lobbyN || 2) : 2;
  let cur = NT_SEL(); $('teams').querySelectorAll('.opt').forEach(o => o.classList.toggle('dis', +o.dataset.nt > max || +o.dataset.nt < min));
  if (cur > max || cur < min) { cur = clamp(cur, min, max); $('teams').querySelectorAll('.opt').forEach(o => o.classList.toggle('on', +o.dataset.nt === cur)); }
  const coop = COOP_SEL(); $('coopBox').style.display = coop ? 'block' : 'none'; $('teams').style.display = $('teamsLbl').style.display = coop ? 'none' : '';
  if (coop) { // 味方は人数以上、味方＋敵は戦場の上限まで
    const setRow = (id, lo, hi) => { let v = SELV(id, 'n', 1); const opts = $(id).querySelectorAll('.opt'); opts.forEach(o => o.classList.toggle('dis', +o.dataset.n < lo || +o.dataset.n > hi));
      if (v < lo || v > hi) { v = clamp(v, lo, Math.max(lo, hi)); opts.forEach(o => o.classList.toggle('on', +o.dataset.n === v)); } return v; };
    const online = NET.tr && document.querySelector('#modes .on')?.dataset.mode === 'online', a = setRow('allies', online ? Math.min(4, NET.lobbyN || 1) : 1, Math.min(4, max - 1));
    setRow('foes', 1, max - a); }
  $('mapDesc').textContent = MAPS[map].d + (max < 5 ? `（${max}軍まで）` : '');
  const per = m => Math.round(LO.comp.reduce((t, q) => t + (q && TYPES[q.t] ? Math.max(4, Math.round(TYPES[q.t].n * m)) : 0), 0));
  $('sizeNote').textContent = coop ? `味方 約${per(menuMul(true))}人 × ${SELV('allies', 'n', 1)}軍　対　敵 約${per(menuMul(false))}人 × ${SELV('foes', 'n', 1)}軍` : `1軍 約${per(menuMul(true))}人 × ${cur}軍`;
}
function setupMenu() {
  $('maps').innerHTML = Object.entries(MAPS).map(([k, m], i) => `<div class="opt ${i === 0 ? 'on' : ''}" data-map="${k}">${m.name}</div>`).join('');
  for (const g of ['maps', 'sizes', 'teams', 'kinds', 'allies', 'foes', 'odds']) $(g).addEventListener('click', e => { const o = e.target.closest('.opt'); if (!o || o.classList.contains('dis')) return; $(g).querySelectorAll('.opt').forEach(x => x.classList.remove('on')); o.classList.add('on'); syncTeamOpts(); renderComp(); });
  $('modes').addEventListener('click', e => { const o = e.target.closest('.opt'); if (o) setMode(o.dataset.mode); });
  $('tabs').addEventListener('click', e => { const o = e.target.closest('.tab'); if (!o) return; $('tabs').querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === o));
    $('pageBattle').style.display = o.dataset.p === 'battle' ? 'block' : 'none'; $('pageArmy').style.display = o.dataset.p === 'army' ? 'block' : 'none'; $('pageArmory').style.display = o.dataset.p === 'armory' ? 'grid' : 'none';
    if (o.dataset.p === 'armory') { initPreview(); rebuildPreview(); renderArmory(); } renderComp(); syncTeamOpts(); });
  $('pageArmy').addEventListener('change', e => { const i = e.target.dataset.i, j = e.target.dataset.e;
    if (i !== undefined) LO.comp[+i] = e.target.value ? { t: e.target.value, esc: LO.comp[+i]?.esc ? 1 : 0 } : null;
    if (j !== undefined && LO.comp[+j]) LO.comp[+j].esc = e.target.checked ? 1 : 0;
    if (!validComp(LO.comp)) LO.comp[0] = { t: 'inf' }; saveLO(); renderComp(); syncTeamOpts(); });
  $('pageArmy').addEventListener('click', e => { const p = e.target.closest('[data-preset]'); if (e.target.closest('#compReset') || p) { LO.comp = (p ? CPU_COMPS[+p.dataset.preset] : DEFAULT_COMP).map(q => ({ ...q })); saveLO(); renderComp(); syncTeamOpts(); } });
  $('pageArmory').addEventListener('click', e => { const c = e.target.closest('.card'); if (c) { LO[c.dataset.k] = c.dataset.id; saveLO();
      if (PV) { if (c.dataset.k === 'army' || c.dataset.k === 'foe') PV.mode = 'army'; else PV.mode = 'hero'; $('pvMode').querySelectorAll('.opt').forEach(x => x.classList.toggle('on', x.dataset.m === PV.mode)); rebuildPreview(); } renderArmory(); }
    const m = e.target.closest('#pvMode .opt'); if (m && PV) { PV.mode = m.dataset.m; $('pvMode').querySelectorAll('.opt').forEach(x => x.classList.toggle('on', x === m)); rebuildPreview(); renderArmory(); }
    if (e.target.closest('#pvHorse') && PV) { PV.mounted = !PV.mounted; $('pvHorse').classList.toggle('on', PV.mounted); PV.mode = 'hero'; rebuildPreview(); renderArmory(); } });
  $('go').onclick = onGo; $('join').onclick = joinRoom;
  $('room').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
  $('again').onclick = () => { if (NET.mode === 'solo') location.reload(); else location.href = location.pathname + '?room=' + NET.room + (params.get('net') ? '&net=' + params.get('net') : ''); };
  addEventListener('beforeunload', () => { try { NET.tr && NET.tr.pub('p/' + NET.myId, ''); } catch (e) {} });
  renderComp(); syncTeamOpts();
}
function onGo() {
  const map = document.querySelector('#maps .on').dataset.map, size = SIZE_SEL(), coop = COOP_SEL(), allies = SELV('allies', 'n', 1), odds = SELV('odds', 'x', 1);
  const nt = coop ? allies + SELV('foes', 'n', 1) : NT_SEL(), cc = coop ? { coop: 1, allies, odds } : {};
  const mode = document.querySelector('#modes .on').dataset.mode;
  if (mode === 'solo') return startGame({ map, size, nt, mode: 'solo', ...cc });
  if (!NET.isHost) return;
  const players = lobbyIds().slice(0, MAX_P), n = Math.max(nt, players.length);
  if (coop && players.length > allies) { status('協力戦：味方の軍の数を人数以上にしてね'); return; }
  const los = []; for (let t = 0; t < n; t++) los.push(t === 0 ? LO : t < players.length ? ((NET.peers.get(players[t]) || {}).p?.lo || LO_DEF) : cpuLoadout());
  const broker = pickBroker([NET.tr.rtts(), ...players.slice(1).map(id => (NET.peers.get(id) || {}).p?.rtt)]);
  const go = { map, size, nt: n, t: Date.now(), players, los, broker, ...cc };
  NET.pres = { go, lo: LO }; NET.tr.pub('p/' + NET.myId, JSON.stringify(NET.pres));
  setTimeout(() => { NET.tr.pub('p/' + NET.myId, JSON.stringify(NET.pres)); if (broker) { NET.tr.use(broker); NET.via = broker; } }, 1200);
  startGame({ ...go, mode: 'host' });
}
function setMode(m) {
  $('modes').querySelectorAll('.opt').forEach(x => x.classList.toggle('on', x.dataset.mode === m));
  $('onlineBox').style.display = m === 'online' ? 'block' : 'none';
  const go = $('go');
  if (m === 'solo') { go.disabled = false; go.textContent = '出陣'; $('cfgnote').textContent = ''; }
  else { if (NET.tr) updateLobby(); else { go.disabled = true; go.textContent = 'まず部屋に入ってね'; } }
  syncTeamOpts();
}
setupMenu();
if (TEST && params.get('kind')) document.querySelector(`#kinds [data-k=${params.get('kind')}]`)?.click();
if (params.get('room')) { setMode('online'); $('room').value = params.get('room'); joinRoom(); }
else if (TEST && params.get('map')) { if (params.get('lo')) Object.assign(LO, JSON.parse(params.get('lo'))); startGame({ map: params.get('map'), size: +(params.get('size') || 2), nt: +(params.get('nt') || 2), mode: 'solo', coop: params.has('coop'), allies: +params.get('coop') || 1, odds: +(params.get('odds') || 1) }); }
else if (TEST && params.get('armory')) { $('tabs').querySelector('[data-p=armory]').click(); }
window.WARLORD = { get PV() { return PV; }, renderArmory, rebuildPreview, pvFrame, LO };
