// WARLORD — 鎧・武器・馬の3Dモデル（実物の写真を元に形を組んでいる。資料は ref/ と ref/SOURCES.md）
// 座標: y が上, +z が前。単位はメートル。
// 1つのパーツの中で「鋼・金・布・革」を混ぜられるよう、頂点ごとに色と金属度/粗さ(aMR)を持たせている。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hasNew, buildBodyNew, buildLightHelmNew } from './armor.js';

// 軍の色（青・赤・緑・金・紫）と紋章の色。TEAM_GILT=紋章が金属（金糸）かどうか
export const TEAM_CLOTH = [0x1f3f8a, 0x8c1c1c, 0x23602c, 0xb88a16, 0x4e2468];
export const TEAM_CLOTH2 = [0xc9a646, 0xe8e0cc, 0xe8e0cc, 0x1c1a18, 0xc9a646];
export const TEAM_GILT = [1, 0, 0, 0, 1];

// [色, 金属度, 粗さ, 材質の種類]  種類: 0=磨いた鋼 1=使い込んだ鋼 2=黒染め 3=真鍮 4=革 5=布 6=鎖帷子 7=その他 8=木
const PAL = {
  steel: [0xb3b9c1, 1, 0.28, 0], steelD: [0x7a8089, 1, 0.48, 1], steelL: [0xcdd2d8, 1, 0.22, 0],
  black: [0x26272b, 0.85, 0.4, 2], gold: [0xd4a64c, 1, 0.3, 3], brass: [0xb48a3e, 1, 0.38, 3],
  mail: [0x8a9098, 0.9, 0.45, 6], leather: [0x5c3a21, 0, 0.62, 4], leatherD: [0x37220f, 0, 0.7, 4], leatherL: [0x9a6f42, 0, 0.6, 4],
  wood: [0x6d4a2c, 0, 0.72, 8], woodD: [0x3e2817, 0, 0.75, 8], lacquer: [0x1c1512, 0.2, 0.4, 7],
  skin: [0xd6a581, 0, 0.62, 7], slit: [0x030303, 0, 1, 7], white: [0xe2dccd, 0, 0.88, 5], hair: [0x2a1b10, 0, 0.9, 7],
  red: [0xa31717, 0, 0.8, 5], rope: [0xb79a6a, 0, 0.9, 5], felt: [0x2e2e35, 0, 0.95, 5], string: [0xddd2b5, 0, 0.9, 7],
  horse: [0x5a3a24, 0, 0.55, 7], horseBlack: [0x1d1714, 0, 0.5, 7], horseD: [0x22160d, 0, 0.7, 7], hoof: [0x1b1816, 0, 0.6, 7],
  yellow: [0xd8b030, 0, 0.8, 5], padding: [0x8f7f63, 0, 0.9, 5],
};

// ---------- 材質：頂点ごとに 金属度・粗さ・種類。種類ごとに傷・汚れ・鎖目・革や木の質感を描画中に計算する ----------
export const CLOTH_TIME = { value: 0 };
export function armorMaterial(opts = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, shadowSide: THREE.BackSide, envMapIntensity: 0.75, ...opts });
  m.onBeforeCompile = sh => {
    sh.uniforms.uClothT = CLOTH_TIME;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aMR;\nvarying vec3 vMR;\nvarying vec3 vObj;\nuniform float uClothT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vMR = aMR; vObj = position;
      if (aMR.z > 4.5 && aMR.z < 5.5) { // 布：裾ほど揺れる
        #ifdef USE_INSTANCING
        float ph = instanceMatrix[3][0] * 0.7 + instanceMatrix[3][2] * 0.4;
        #else
        float ph = 0.0;
        #endif
        float lw = clamp(-position.y * 2.0, 0.0, 1.2);
        transformed.x += sin(uClothT * 2.3 + position.y * 7.0 + ph) * 0.012 * lw;
        transformed.z += sin(uClothT * 1.7 + position.x * 9.0 + ph * 1.3) * 0.01 * lw;
      }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vMR; varying vec3 vObj;
      float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vMR.x;')
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = vMR.y; float mailH = -1.0;
      { int cls = int(vMR.z + 0.5); float n1 = vn(vObj * 46.0), n2 = vn(vObj * 7.0), n3 = vn(vObj * vec3(160.0, 9.0, 160.0));
        if (cls <= 2) { // 鋼：細かい磨き傷と、くぼみの汚れ
          roughnessFactor = clamp(roughnessFactor + (vn(vObj * 140.0) - 0.5) * 0.06 + (n3 - 0.5) * 0.03 + (cls == 1 ? 0.06 + (n1 - 0.5) * 0.1 : 0.0), 0.12, 0.9);
          diffuseColor.rgb *= 0.95 + 0.07 * n2 - (cls == 1 ? 0.05 * n1 : 0.0); }
        else if (cls == 3) { roughnessFactor = clamp(roughnessFactor + (n1 - 0.5) * 0.2, 0.15, 0.9); diffuseColor.rgb *= 0.85 + 0.25 * n2; }
        else if (cls == 4) { diffuseColor.rgb *= 0.78 + 0.3 * n1 * n2 + 0.08 * n3; roughnessFactor = clamp(roughnessFactor + (n1 - 0.5) * 0.25, 0.35, 1.0); }
        else if (cls == 5) { diffuseColor.rgb *= 0.88 + 0.16 * n2 + 0.05 * sin(vObj.y * 900.0) * sin(vObj.x * 900.0 + vObj.z * 900.0); }
        else if (cls == 8) { diffuseColor.rgb *= 0.8 + 0.25 * vn(vObj * vec3(30.0, 3.0, 30.0)) + 0.06 * n1; }
        else if (cls == 6) { // 鎖帷子：輪が横に並び、段ごとに半分ずれる
          vec2 q = vec2((vObj.x + vObj.z) * 95.0, vObj.y * 120.0); q.x += 0.5 * floor(q.y);
          vec2 f = fract(q) - 0.5; float d = length(f * vec2(1.0, 1.25));
          mailH = smoothstep(0.5, 0.33, d) * smoothstep(0.08, 0.22, d);
          diffuseColor.rgb *= 0.42 + 0.68 * mailH; roughnessFactor = mix(0.75, 0.38, mailH); }
      }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if (mailH >= 0.0) { vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float hx = dFdx(mailH) * 0.6, hy = dFdy(mailH) * 0.6;
        vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1) * faceDirection; vec3 g = sign(det) * (hx * r1 + hy * r2);
        normal = normalize(abs(det) * normal - g); }`);
  };
  m.customProgramCacheKey = () => 'armorMR3';
  return m;
}

// 金属の映り込みに使う「周りの景色」：空の下に、明暗のある地平線（丘・木）と地面を置く
export function envDressing(scene) {
  const g = new THREE.CylinderGeometry(30, 30, 9, 64, 3, true), pos = g.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i), a = Math.atan2(x, z);
    const n = 0.5 + 0.25 * Math.sin(a * 7) + 0.15 * Math.sin(a * 23 + 1) + 0.1 * Math.sin(a * 3 + 2), top = y > 0 ? 1 : 0;
    const c = top ? (n > 0.6 ? [0.62, 0.68, 0.76] : [0.2 + 0.1 * n, 0.25 + 0.1 * n, 0.2]) : [0.24 + 0.08 * n, 0.24 + 0.08 * n, 0.18]; col.push(...c); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })); m.position.y = 1.5; scene.add(m);
  const fl = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({ color: 0x4a4436 })); fl.rotation.x = -Math.PI / 2; fl.position.y = -2.5; scene.add(fl);
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff2d0 })); sunDisc.position.set(-14, 22, 12); scene.add(sunDisc);
}

// ---------- 形を作る道具 ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
export function X(g, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], order = 'XYZ') {
  _m.compose(_v.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2], order)), _s.set(s[0], s[1], s[2]));
  g.applyMatrix4(_m); return g;
}
export const cyl = (rt, rb, h, seg = 12, open = false, ts = 0, tl = Math.PI * 2) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, ts, tl);
export const sph = (r, ws = 12, hs = 8, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) => new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl);
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const tor = (R, r, rs = 5, ts = 16, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, rs, ts, arc);
export const cone = (r, h, seg = 10) => new THREE.ConeGeometry(r, h, seg);
export const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
export const ext = (shape, depth, bevel = 0.004, cs = 10) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: cs });
export const tube = (pts, r, seg = 16, rs = 6, closed = false) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => Array.isArray(p) ? new THREE.Vector3(...p) : p), closed), seg, r, rs, closed);
// 平面の形 (u,v) を (z=u, x=v, y=厚み) に回す（刃物を柄の先に付けるとき用）
const UZVX = new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1);
// (u,v) を (z=u, y=v, x=厚み) に回す（縦向きの刃）
const UZVY = new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
// 形の y（長さ）を柄の軸 z へ、x（幅）を刃の向き y へ、厚みを x へ（剣・穂先・フランジ用）
const LEN_Z = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);
// (u,v) を (z=u, y=-v, x=厚み) に回す（片刃を +y 側に向ける）
const UZVNY = new THREE.Matrix4().set(0, 0, 1, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);

// ---------- 断面をつないで面を作る（ロフト）----------
// 断面 sec: { y, rx(横の半径), zf(前の奥行き), zb(後ろの奥行き), x0, z0(中心のずれ), ridge(正中の稜), fl:{n,a,w}(溝彫り), dy(θ)(縁の高さを角度で変える), bump(θ) }
// θ は前(+z)が0、キャラの左(+x)が +π/2。
const wrapA = t => ((t + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
export function ringPt(sec, th, out = 0) {
  const s = Math.sin(th), c = Math.cos(th), tw = wrapA(th), rz = c >= 0 ? sec.zf : sec.zb;
  let r = 1 / Math.sqrt((s / sec.rx) ** 2 + (c / rz) ** 2);
  if (sec.ridge) r += sec.ridge * Math.exp(-(((tw - (sec.ridgeAt || 0)) / (sec.ridgeW || 0.16)) ** 2));
  if (sec.fl) { const f = sec.fl, win = Math.max(0, 1 - Math.abs(wrapA(tw - (f.c || 0))) / f.w); r += f.a * win * win * Math.pow(0.5 + 0.5 * Math.cos(f.n * wrapA(tw - (f.c || 0))), 6); } // 溝彫り：細い稜と広い谷
  if (sec.bump) r += sec.bump(tw);
  r += out;
  return [(sec.x0 || 0) + s * r, sec.y + (sec.dy ? sec.dy(tw) : 0), (sec.z0 || 0) + c * r];
}
function lerpSec(a, b, t) {
  const o = {}; for (const k of ['y', 'rx', 'zf', 'zb', 'x0', 'z0', 'ridge']) o[k] = (a[k] || 0) + ((b[k] || 0) - (a[k] || 0)) * t;
  o.ridgeAt = a.ridgeAt; o.ridgeW = a.ridgeW; o.bump = t < 0.5 ? a.bump : b.bump; o.dy = (a.dy || b.dy) ? (tw => (a.dy ? a.dy(tw) : 0) * (1 - t) + (b.dy ? b.dy(tw) : 0) * t) : null;
  if (a.fl || b.fl) { const fa = a.fl || { ...b.fl, a: 0 }, fb = b.fl || { ...a.fl, a: 0 }; o.fl = { n: fa.n + (fb.n - fa.n) * t, a: fa.a + (fb.a - fa.a) * t, w: fa.w + (fb.w - fa.w) * t, c: fa.c || 0 }; }
  return o;
}
export function expand(secs, sub) { if (sub <= 1) return secs; const out = []; for (let i = 0; i < secs.length - 1; i++) for (let k = 0; k < sub; k++) out.push(lerpSec(secs[i], secs[i + 1], k / sub)); out.push(secs[secs.length - 1]); return out; }
export function loft(secs, seg, o = {}) {
  const S = expand(secs, o.sub || 1), t0 = o.t0 ?? -Math.PI, t1 = o.t1 ?? Math.PI, full = o.t0 === undefined && o.t1 === undefined;
  const cols = full ? seg : seg + 1, pos = [], idx = [];
  for (const sec of S) for (let j = 0; j < cols; j++) { const th = t0 + (t1 - t0) * j / seg; pos.push(...ringPt(sec, th, o.out || 0)); }
  for (let i = 0; i < S.length - 1; i++) for (let j = 0; j < seg; j++) { const a = i * cols + j, b = i * cols + (j + 1) % cols, c = (i + 1) * cols + j, d = (i + 1) * cols + (j + 1) % cols; idx.push(a, b, c, b, d, c); }
  if (o.capTop) { const cIdx = pos.length / 3, top = S[S.length - 1]; pos.push(top.x0 || 0, top.y + (o.capTop === true ? 0 : o.capTop), top.z0 || 0); for (let j = 0; j < seg; j++) idx.push((S.length - 1) * cols + j, (S.length - 1) * cols + (j + 1) % cols, cIdx); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// 板の縁の折り返し：断面に沿った細い管
export function rim(sec, seg, r, o = {}) {
  const t0 = o.t0 ?? -Math.PI, t1 = o.t1 ?? Math.PI, closed = o.t0 === undefined && o.t1 === undefined, pts = [];
  const n = closed ? seg : seg + 1; for (let j = 0; j < n; j++) { const th = t0 + (t1 - t0) * j / seg; pts.push(new THREE.Vector3(...ringPt(sec, th, (o.out ?? r * 0.6)))); }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), closed ? seg : seg, r, o.rs || 4, closed); g.userData.fine = true; return g;
}
// リベット（小さな半球）を断面上に
export function rivet(gb, sec, th, mat = 'metal', r = 0.006) { if (!gb.ctx.detail) return; const [x, y, z] = ringPt(sec, th, 0.002); const g = sph(r, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2); const n = new THREE.Vector3(Math.sin(th), 0, Math.cos(th));
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n)); X(g, [x, y, z]); gb.add(g, mat); }

export class GB {
  constructor(ctx) { this.ctx = ctx; this.list = []; }
  add(geo, mat) {
    if (geo.userData && geo.userData.fine && !this.ctx.detail && !this.ctx.keepFine) return this; // 兵士用の軽い形では縁の細い管を省く
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const spec = this.ctx.pal(mat), n = g.attributes.position.count;
    const col = new Float32Array(n * 3), mr = new Float32Array(n * 3), c = new THREE.Color(spec[0]);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; mr[i * 3] = spec[1]; mr[i * 3 + 1] = spec[2]; mr[i * 3 + 2] = spec[3] ?? 7; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aMR', new THREE.BufferAttribute(mr, 3));
    this.list.push(g); return this;
  }
  build() { if (!this.list.length) this.add(box(0.001, 0.001, 0.001), 'slit'); const g = mergeGeometries(this.list); g.computeBoundingSphere(); return g; }
}
// team と鎧の金属色からパレットを作る
export function makeCtx(team, set, detail) {
  const steel = set && set.steel === 'black' ? 'black' : 'steel';
  return {
    team, detail, set,
    S: n => detail ? n : Math.max(4, Math.round(n * 0.3)),
    pal(name) {
      if (name === 'cloth') return [TEAM_CLOTH[team], 0, 0.85, 5];
      if (name === 'cloth2') return TEAM_GILT[team] ? [TEAM_CLOTH2[team], 0.6, 0.35, 3] : [TEAM_CLOTH2[team], 0, 0.85, 5];
      if (name === 'clothD') return [new THREE.Color(TEAM_CLOTH[team]).multiplyScalar(0.55).getHex(), 0, 0.9, 5];
      if (name === 'metal') return PAL[steel];
      if (name === 'metalD') return steel === 'black' ? [0x1a1b1f, 0.8, 0.5, 2] : PAL.steelD;
      if (name === 'trim') return set && set.trim ? PAL[set.trim] : (steel === 'black' ? PAL.gold : PAL.steelD);
      return PAL[name] || PAL.steel;
    },
  };
}

// ============================================================
// 鎧セット（写真を元にした8種）
// ============================================================
export const ARMORS = {
  gothic: {
    name: 'ゴシック式', era: '15世紀後半・ドイツ', def: 0.6, spd: 0.95, shield: 'heater', trim: 'brass',
    desc: '後ろへ長く伸びるサレット兜、放射状の溝彫り、尖った肘当てと長い爪先の鉄靴。ロンドン・ウォレスコレクションの騎馬甲冑が元。',
    helm: 'sallet', torso: 'gothic', arm: 'gothic', leg: 'gothic',
  },
  maximilian: {
    name: 'マクシミリアン式', era: '16世紀初頭・ドイツ', def: 0.58, spd: 0.94, shield: 'heater',
    desc: '段々の蛇腹面頬のアーメット兜、ねじり縄の縁取り、肩の円盤（ロンデル）、全身の細かい溝彫りと幅広の熊足鉄靴。',
    helm: 'bellows', torso: 'fluted', arm: 'fluted', leg: 'fluted',
  },
  milanese: {
    name: 'ミラノ式', era: '15世紀・イタリア', def: 0.6, spd: 0.95, shield: 'heater',
    desc: 'T字の顔開きの兜、左右で大きさの違う大肩当て、胸の上に重ねた補強板（プラッカート）と革ベルト。グラスゴー所蔵「アヴァント甲冑」が元。',
    helm: 'barbute', torso: 'milanese', arm: 'milanese', leg: 'milanese',
  },
  templar: {
    name: 'テンプル騎士', era: '12〜13世紀・十字軍', def: 0.74, spd: 1.0, shield: 'heater',
    desc: '十字の覗き窓を持つ円筒形のグレートヘルム、鎖帷子の上に十字の白いサーコートとマント。',
    helm: 'greathelm', torso: 'templar', arm: 'mail', leg: 'mail',
  },
  norman: {
    name: 'ノルマン騎士', era: '11世紀・ノルマン朝', def: 0.82, spd: 1.03, shield: 'kite',
    desc: '鋲打ちの帯で組んだ円錐兜（鼻当て付き）、膝まである鎖帷子、細長いカイトシールド。バイユーのタペストリーの騎士の姿。',
    helm: 'nasal', torso: 'hauberk', arm: 'mail', leg: 'cloth',
  },
  hounskull: {
    name: 'ハウンスカル', era: '14世紀後半・百年戦争', def: 0.64, spd: 0.97, shield: 'heater',
    desc: '豚の鼻のように尖った面頬のバシネット兜と鎖の垂れ（アヴェンテイル）、体にぴったりの陣羽織ジュポン。',
    helm: 'hounskull', torso: 'jupon', arm: 'plate14', leg: 'plate14',
  },
  black: {
    name: '黒騎士', era: '16世紀・エッチング甲冑', def: 0.58, spd: 0.94, shield: 'heater', steel: 'black', trim: 'gold',
    desc: '黒染めの鋼に金の縁取り。羽根飾りのクローズヘルムと、紋章入りの垂れ布。',
    helm: 'close', torso: 'blackKnight', arm: 'smooth', leg: 'smooth',
  },
  brigandine: {
    name: 'ブリガンダイン傭兵', era: '15世紀・傭兵', def: 0.84, spd: 1.06, shield: 'heater',
    desc: 'つばの広いケトルハット、布の下に鉄板を鋲留めしたブリガンダイン、鎖の袖。軽くて動きやすい。',
    helm: 'kettle', torso: 'brigandine', arm: 'mail', leg: 'cloth',
  },
};
export const ARMOR_IDS = Object.keys(ARMORS);

// ---------------- 兜（原点=首の付け根, 頭の中心は y=0.13） ----------------
function face(gb, S) { gb.add(X(sph(0.1, S(12), S(10)), [0, 0.12, 0.012], [0, 0, 0], [0.9, 1.08, 0.98]), 'skin'); }
function ropeRing(gb, R, y, S, mat = 'metal', sx = 1, sz = 1.08) { // ねじり縄の縁
  gb.add(X(tor(R, 0.009, 4, S(28)), [0, y, 0], [Math.PI / 2, 0, 0], [sx, sz, 1]), mat);
}
const HELMS = {
  sallet(gb, S) {
    gb.add(X(sph(0.14, S(20), S(10), 0, Math.PI * 2, 0, Math.PI * 0.5), [0, 0.125, -0.01], [0, 0, 0], [1, 1.05, 1.12]), 'metal');
    gb.add(X(cyl(0.14, 0.215, 0.11, S(20), true, Math.PI * 0.5, Math.PI), [0, 0.085, -0.04], [-0.42, 0, 0], [1, 1, 1.15]), 'metal'); // 長い尾
    gb.add(X(cyl(0.142, 0.145, 0.05, S(16), true, -Math.PI * 0.5, Math.PI), [0, 0.105, 0.0], [0, 0, 0], [1, 1, 1.12]), 'metal'); // 前縁
    gb.add(X(box(0.19, 0.014, 0.05), [0, 0.135, 0.13]), 'slit'); // 覗き穴
    gb.add(X(sph(0.125, S(16), S(8), 0, Math.PI, Math.PI * 0.42, Math.PI * 0.42), [0, 0.085, 0.015], [0, 0, 0], [1.02, 1, 1.15]), 'metal'); // ベヴォア（顎当て）
    gb.add(X(box(0.014, 0.02, 0.27), [0, 0.272, -0.03], [0.12, 0, 0]), 'metal'); // 頂部の稜
    for (let k = -2; k <= 2; k++) if (k) gb.add(X(tor(0.142, 0.004, 3, S(12), Math.PI * 0.55), [k * 0.035, 0.125, -0.01], [0, Math.PI / 2, Math.PI * 0.25], [1, 1.05, 1.1]), 'metal'); // 溝彫り
  },
  bellows(gb, S) { // マクシミリアン：溝彫りアーメット＋蛇腹面頬
    gb.add(X(sph(0.142, S(20), S(14)), [0, 0.13, -0.005], [0, 0, 0], [1, 1.1, 1.12]), 'metal');
    for (let k = -4; k <= 4; k++) { const off = k * 0.03, R = Math.sqrt(Math.max(0.001, 0.15 * 0.15 - off * off));
      gb.add(X(tor(R, 0.005, 3, S(16), Math.PI), [off, 0.13, -0.005], [0, Math.PI / 2, 0], [1, 1.1, 1.12]), 'metal'); }
    for (let i = 0; i < 4; i++) { // 段々の面頬（横の稜線とすき間）
      const y = 0.17 - i * 0.04, z = 0.15 - i * 0.004;
      gb.add(X(box(0.2 - i * 0.012, 0.026, 0.05), [0, y, z - 0.02], [-0.25, 0, 0]), 'metal');
      if (i < 3) gb.add(X(box(0.17 - i * 0.012, 0.006, 0.02), [0, y - 0.019, z + 0.005]), 'slit');
    }
    ropeRing(gb, 0.12, 0.005, S);
    gb.add(X(cyl(0.12, 0.13, 0.05, S(16)), [0, 0.02, 0]), 'metal');
  },
  barbute(gb, S) { // ミラノ：T字の顔開き
    gb.add(X(lathe([[0, 0.31], [0.05, 0.3], [0.11, 0.25], [0.142, 0.17], [0.15, 0.08], [0.148, -0.01], [0.135, -0.05]], S(22)), [0, 0, 0], [0, 0, 0], [1, 1, 1.12]), 'metal');
    gb.add(X(box(0.16, 0.035, 0.05), [0, 0.16, 0.152]), 'slit'); // T の横棒
    gb.add(X(box(0.06, 0.15, 0.05), [0, 0.07, 0.16]), 'slit'); // T の縦棒
    gb.add(X(tor(0.15, 0.006, 3, S(24)), [0, -0.045, 0.0], [Math.PI / 2, 0, 0], [1, 1.12, 1]), 'metalD');
  },
  greathelm(gb, S) {
    gb.add(X(cyl(0.142, 0.147, 0.29, S(22)), [0, 0.13, 0], [0, 0, 0], [1, 1, 1.06]), 'metal');
    gb.add(X(sph(0.142, S(16), S(4), 0, Math.PI * 2, 0, Math.PI * 0.2), [0, 0.245, 0], [0, 0, 0], [1, 0.6, 1.06]), 'metalD');
    gb.add(X(box(0.04, 0.25, 0.012), [0, 0.11, 0.157]), 'gold'); // 金の十字（縦）
    gb.add(X(box(0.27, 0.036, 0.012), [0, 0.165, 0.155], [0, 0, 0]), 'gold'); // 十字（横）
    for (const sx of [-1, 1]) {
      gb.add(X(box(0.075, 0.012, 0.02), [sx * 0.065, 0.165, 0.158]), 'slit'); // 目のすき間
      for (let k = 0; k < 3; k++) gb.add(X(box(0.035, 0.007, 0.02), [sx * 0.072, 0.095 - k * 0.028, 0.154]), 'slit'); // 呼吸用の切れ込み
    }
    gb.add(X(tor(0.146, 0.007, 3, S(24)), [0, -0.015, 0], [Math.PI / 2, 0, 0], [1, 1.06, 1]), 'metalD');
  },
  nasal(gb, S) { // 鋲打ちの帯で組んだ円錐兜
    face(gb, S);
    gb.add(X(lathe([[0, 0.34], [0.03, 0.33], [0.09, 0.27], [0.128, 0.19], [0.138, 0.14]], S(18)), [0, 0, 0], [0, 0, 0], [1, 1, 1.08]), 'metalD');
    for (let k = 0; k < 4; k++) gb.add(X(box(0.026, 0.2, 0.01), [0, 0.245, 0.0], [0, k * Math.PI / 4, 0]), 'metal'); // 縦の帯（概形）
    gb.add(X(cyl(0.141, 0.141, 0.035, S(20), true), [0, 0.15, 0], [0, 0, 0], [1, 1, 1.08]), 'metal'); // 額の帯
    gb.add(X(box(0.03, 0.1, 0.012), [0, 0.1, 0.152]), 'metal'); // 鼻当て
    gb.add(X(sph(0.15, S(18), S(10), Math.PI / 2 + 0.6, Math.PI * 2 - 1.2, 0.35, Math.PI * 0.62), [0, 0.11, 0]), 'mail'); // 鎖頭巾
    gb.add(X(cyl(0.125, 0.21, 0.12, S(16), true), [0, 0.0, 0]), 'mail');
  },
  hounskull(gb, S) { // 後ろへ反った尖り頭頂＋豚鼻の面頬
    gb.add(X(lathe([[0, 0.36], [0.035, 0.33], [0.095, 0.26], [0.132, 0.17], [0.143, 0.08], [0.142, 0.02]], S(20)), [0, 0, -0.01], [-0.18, 0, 0], [1, 1, 1.1]), 'metal');
    gb.add(X(cone(0.115, 0.24, S(14)), [0, 0.12, 0.2], [Math.PI / 2, 0, 0], [1, 0.85, 1]), 'metal'); // 突き出た面頬
    for (const sx of [-1, 1]) {
      gb.add(X(box(0.07, 0.012, 0.05), [sx * 0.045, 0.172, 0.165], [0.3, sx * 0.3, 0]), 'slit'); // 目の切れ込み
      for (let k = 0; k < 2; k++) gb.add(X(box(0.03, 0.006, 0.03), [sx * 0.05, 0.1 - k * 0.025, 0.215 - k * 0.01], [0, sx * 0.5, 0]), 'slit');
    }
    gb.add(X(cyl(0.142, 0.25, 0.16, S(18), true), [0, -0.02, -0.01]), 'mail'); // アヴェンテイル（鎖の垂れ）
    gb.add(X(tor(0.143, 0.007, 3, S(20)), [0, 0.06, -0.01], [Math.PI / 2, 0, 0], [1, 1.1, 1]), 'brass'); // 縁の金具
  },
  close(gb, S) { // 黒騎士：クローズヘルム＋金の縁取り＋羽根飾り
    gb.add(X(sph(0.142, S(20), S(14)), [0, 0.13, 0], [0, 0, 0], [1, 1.12, 1.12]), 'metal');
    gb.add(X(box(0.012, 0.035, 0.27), [0, 0.29, 0]), 'metal');
    gb.add(X(box(0.1, 0.13, 0.03), [0.045, 0.12, 0.14], [0, 0.5, 0]), 'metal');
    gb.add(X(box(0.1, 0.13, 0.03), [-0.045, 0.12, 0.14], [0, -0.5, 0]), 'metal');
    gb.add(X(box(0.18, 0.01, 0.03), [0, 0.16, 0.155]), 'slit');
    gb.add(X(tor(0.15, 0.006, 3, S(24), Math.PI), [0, 0.13, 0.0], [0, Math.PI / 2, 0], [1, 1.12, 1.12]), 'gold');
    gb.add(X(tor(0.13, 0.007, 3, S(20)), [0, 0.0, 0], [Math.PI / 2, 0, 0], [1, 1.1, 1]), 'gold');
    for (let k = 0; k < 4; k++) gb.add(X(sph(1, 8, 6), [0, 0.32 + k * 0.01, -0.05 - k * 0.05], [-0.7 - k * 0.15, (k - 1.5) * 0.15, 0], [0.035, 0.03, 0.17]), k % 2 ? 'cloth' : 'white');
  },
  kettle(gb, S) {
    face(gb, S);
    gb.add(X(sph(0.135, S(16), S(8), 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.16, 0], [0, 0, 0], [1, 1.1, 1.06]), 'metal');
    gb.add(X(cyl(0.138, 0.27, 0.06, S(22), true), [0, 0.14, 0]), 'metal'); // 広いつば
    gb.add(X(tor(0.27, 0.007, 3, S(22)), [0, 0.11, 0], [Math.PI / 2, 0, 0]), 'metalD');
    gb.add(X(box(0.012, 0.035, 0.26), [0, 0.3, 0]), 'metal');
    gb.add(X(cyl(0.1, 0.17, 0.11, S(14), true), [0, 0.02, 0]), 'mail');
  },
};

// ---------------- 胴（原点=骨盤, 首の付け根は y=0.55） ----------------
function cuirass(gb, S, o = {}) {
  const m = o.mat || 'metal';
  gb.add(X(sph(1, S(20), S(14)), [0, 0.31, 0.012], [0, 0, 0], [0.215, 0.235, o.globose ? 0.165 : 0.15]), m);
  gb.add(X(box(0.012, 0.36, 0.02), [0, 0.27, (o.globose ? 0.165 : 0.15) + 0.004], [-0.06, 0, 0]), m);
  gb.add(X(sph(1, S(16), S(8)), [0, 0.1, 0.006], [0, 0, 0], [0.172, 0.16, 0.125]), m);
  gb.add(X(cyl(0.085, 0.125, 0.07, S(14)), [0, 0.52, 0]), m); // 喉当て
  gb.add(X(cyl(0.075, 0.088, 0.05, S(12)), [0, 0.575, 0]), m);
}
function fauld(gb, S, n = 3, mat = 'metal', flare = 0.012, scallop = false) {
  for (let i = 0; i < n; i++) gb.add(X(cyl(0.18 + i * flare, 0.195 + i * flare, 0.056, S(16), true), [0, -0.015 - i * 0.046, 0], [0, 0, 0], [1, 1, 0.8]), mat);
  if (scallop) for (const sx of [-1, 1]) gb.add(X(sph(0.07, S(10), S(6), 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), [sx * 0.08, -0.13, 0.15], [0.3, 0, 0], [1.1, 0.5, 0.4]), mat);
}
function tassets(gb, S, mat = 'metal', len = 0.17) {
  for (const sx of [-1, 1]) { gb.add(X(cyl(0.2, 0.22, len, S(8), true, -0.42, 0.84), [sx * 0.08, -0.17 - len / 2 + 0.08, -0.03], [0.12, sx * 0.3, 0], [1, 1, 1]), mat); gb.add(X(tor(0.2, 0.004, 3, S(8), 0.84), [sx * 0.08, -0.17 - len + 0.08, -0.03], [Math.PI / 2 + 0.12, 0, Math.PI / 2 - 0.42 + sx * 0.3], [1, 1, 1]), 'metalD'); }
}
function belt(gb, S, y = 0.02) { gb.add(X(tor(0.178, 0.011, 4, S(20)), [0, y, 0.005], [Math.PI / 2, 0, 0], [1, 0.8, 1]), 'leather'); gb.add(X(box(0.04, 0.03, 0.01), [0, y, 0.15]), 'brass'); }
function flutes(gb, S, n, y0, y1, spread, mat = 'metal', depth = 0.15) {
  for (let k = 0; k < n; k++) { const a = (k - (n - 1) / 2) * spread;
    gb.add(X(box(0.009, y1 - y0, 0.01), [Math.sin(a) * 0.19, (y0 + y1) / 2, Math.cos(a) * depth + 0.012], [0, a, a * 0.6]), mat); }
}
const TORSOS = {
  gothic(gb, S) {
    cuirass(gb, S);
    flutes(gb, S, 7, 0.18, 0.44, 0.22); // 放射状の溝彫り
    gb.add(X(cyl(0.02, 0.17, 0.2, S(12), true, -0.9, 1.8), [0, 0.2, 0.02], [0, 0, 0], [1, 1, 0.82]), 'metal'); // V 字のプラッカート
    gb.add(X(tor(0.095, 0.006, 3, S(16)), [0, 0.5, 0.01], [Math.PI / 2, 0, 0]), 'trim');
    fauld(gb, S, 3); tassets(gb, S, 'metal', 0.16); belt(gb, S, 0.035);
    gb.add(X(cyl(0.06, 0.22, 0.24, S(16), true), [0, -0.22, 0], [0, 0, 0], [1, 1, 0.75]), 'mail'); // 鎖の腰巻
  },
  fluted(gb, S) { // マクシミリアン
    cuirass(gb, S, { globose: true }); flutes(gb, S, 13, 0.06, 0.44, 0.11);
    ropeRing(gb, 0.1, 0.5, S);
    for (let i = 0; i < 4; i++) { const r = 0.185 + i * 0.022; gb.add(X(cyl(r, r + 0.02, 0.06, S(22), true), [0, -0.02 - i * 0.055, 0], [0, 0, 0], [1, 1, 0.82]), 'metal'); }
    for (let k = 0; k < 16; k++) { const a = (k - 7.5) * 0.17; gb.add(X(box(0.008, 0.22, 0.008), [Math.sin(a) * 0.22, -0.1, Math.cos(a) * 0.18 + 0.01], [-0.2, a, 0]), 'metal'); } // 裾の溝
    belt(gb, S, 0.04);
  },
  milanese(gb, S) {
    cuirass(gb, S, { globose: true });
    gb.add(X(sph(1, S(16), S(8), 0, Math.PI, Math.PI * 0.5, Math.PI * 0.42), [0, 0.2, 0.02], [0, 0, 0], [0.19, 0.22, 0.165]), 'metal'); // プラッカート
    gb.add(X(box(0.045, 0.2, 0.012), [0, 0.32, 0.165], [-0.15, 0, 0]), 'leatherL'); // 胸の革ベルト
    gb.add(X(box(0.025, 0.025, 0.014), [0, 0.24, 0.17]), 'brass');
    fauld(gb, S, 3, 'metal', 0.014, true);
    for (const sx of [-1, 1]) gb.add(X(box(0.035, 0.12, 0.01), [sx * 0.1, -0.16, 0.16]), 'leatherL'); // 腿当ての吊り革
    gb.add(X(cyl(0.07, 0.22, 0.2, S(16), true), [0, -0.2, 0], [0, 0, 0], [1, 1, 0.75]), 'mail');
  },
  templar(gb, S) {
    gb.add(X(sph(1, S(16), S(10)), [0, 0.3, 0.01], [0, 0, 0], [0.205, 0.25, 0.15]), 'mail');
    gb.add(X(cyl(0.08, 0.13, 0.1, S(14)), [0, 0.52, 0]), 'mail');
    gb.add(X(cyl(0.21, 0.34, 0.98, S(18), true), [0, -0.02, 0], [0, 0, 0], [1, 1, 0.74]), 'white'); // サーコート
    gb.add(X(cyl(0.12, 0.21, 0.06, S(16), true), [0, 0.5, 0], [0, 0, 0], [1, 1, 0.74]), 'white');
    gb.add(X(box(0.06, 0.4, 0.012), [0, 0.2, 0.192], [0.03, 0, 0]), 'cloth'); // 十字
    gb.add(X(box(0.25, 0.06, 0.012), [0, 0.3, 0.188]), 'cloth');
    belt(gb, S, 0.03);
    gb.add(X(cyl(0.24, 0.42, 1.25, S(16), true, Math.PI * 0.55, Math.PI * 0.9), [0, -0.1, -0.03], [0.05, 0, 0], [1, 1, 0.8]), 'white'); // マント
    gb.add(X(cyl(0.08, 0.06, 0.5, S(10), true), [0, -0.25, 0]), 'mail');
  },
  hauberk(gb, S) {
    gb.add(X(sph(1, S(16), S(10)), [0, 0.3, 0.01], [0, 0, 0], [0.205, 0.25, 0.15]), 'mail');
    gb.add(X(cyl(0.2, 0.31, 0.62, S(18), true), [0, -0.17, 0], [0, 0, 0], [1, 1, 0.8]), 'mail');
    gb.add(X(box(0.012, 0.3, 0.02), [0, -0.33, 0.2]), 'slit'); // 前の割れ目
    belt(gb, S, 0.05);
  },
  jupon(gb, S) { // 体にぴったりの陣羽織
    gb.add(X(sph(1, S(18), S(12)), [0, 0.3, 0.012], [0, 0, 0], [0.21, 0.25, 0.16]), 'cloth');
    gb.add(X(cyl(0.18, 0.24, 0.32, S(18), true), [0, -0.08, 0], [0, 0, 0], [1, 1, 0.8]), 'cloth');
    for (let i = 0; i < 6; i++) gb.add(X(tor(0.2 - Math.abs(i - 1.5) * 0.008, 0.004, 3, S(18)), [0, 0.42 - i * 0.075, 0.012], [Math.PI / 2, 0, 0], [1, 0.8, 1]), 'clothD'); // キルトの縫い目
    gb.add(X(tor(0.19, 0.016, 4, S(20)), [0, -0.1, 0], [Math.PI / 2 - 0.08, 0, 0], [1, 0.82, 1]), 'gold'); // 騎士帯
    gb.add(X(cyl(0.085, 0.12, 0.06, S(14)), [0, 0.52, 0]), 'mail');
  },
  blackKnight(gb, S) {
    cuirass(gb, S, { globose: true });
    gb.add(X(tor(0.095, 0.007, 3, S(16)), [0, 0.5, 0.01], [Math.PI / 2, 0, 0]), 'gold');
    for (let k = -1; k <= 1; k++) gb.add(X(box(0.012, 0.3, 0.008), [k * 0.06, 0.3, 0.158 - Math.abs(k) * 0.02], [0, k * 0.35, 0]), 'gold'); // 金のエッチング帯
    fauld(gb, S, 3, 'metal');
    for (let i = 0; i < 3; i++) gb.add(X(tor(0.182 + i * 0.012, 0.004, 3, S(18)), [0, -0.04 - i * 0.046, 0], [Math.PI / 2, 0, 0], [1, 0.8, 1]), 'gold');
    gb.add(X(box(0.26, 0.5, 0.012), [0, -0.38, 0.17]), 'felt'); // 垂れ布（前）
    gb.add(X(box(0.27, 0.5, 0.012), [0, -0.38, -0.15]), 'felt');
    gb.add(X(box(0.1, 0.12, 0.014), [0, -0.3, 0.178], [0, 0, Math.PI / 4]), 'gold'); // 紋章
    gb.add(X(box(0.24, 0.012, 0.014), [0, -0.14, 0.178]), 'gold');
  },
  brigandine(gb, S) {
    gb.add(X(sph(1, S(16), S(12)), [0, 0.3, 0.012], [0, 0, 0], [0.21, 0.25, 0.155]), 'cloth');
    gb.add(X(cyl(0.18, 0.21, 0.24, S(16), true), [0, -0.03, 0], [0, 0, 0], [1, 1, 0.8]), 'cloth');
    for (let i = 0; i < 5; i++) gb.add(X(tor(0.205 - Math.abs(i - 2) * 0.012, 0.005, 3, S(18)), [0, 0.4 - i * 0.08, 0.012], [Math.PI / 2, 0, 0], [1, 0.78, 1]), 'brass'); // 鉄板の鋲の列（線で表現）
    gb.add(X(cyl(0.085, 0.12, 0.06, S(14)), [0, 0.52, 0]), 'mail');
    gb.add(X(cyl(0.19, 0.25, 0.22, S(16), true), [0, -0.22, 0], [0, 0, 0], [1, 1, 0.8]), 'mail');
    belt(gb, S, -0.04);
  },
};

// ---------------- 上腕（原点=肩, 下へ 0.3） ----------------
function rerebrace(gb, S, mat = 'metal') { gb.add(X(cyl(0.06, 0.054, 0.22, S(12)), [0, -0.14, 0]), mat); }
function couter(gb, S, kind, mat = 'metal') {
  gb.add(X(sph(0.056, S(10), S(8)), [0, -0.3, -0.005]), mat);
  if (kind === 'point') gb.add(X(cone(0.045, 0.12, S(8)), [0, -0.3, -0.07], [-Math.PI / 2, 0, 0]), mat);
  if (kind === 'wing') gb.add(X(sph(0.09, S(10), S(6), 0, Math.PI * 2, 0, Math.PI * 0.35), [0, -0.3, -0.035], [-Math.PI / 2, 0, 0], [1, 0.4, 1]), mat);
  if (kind === 'fluted') { gb.add(X(sph(0.085, S(12), S(6), 0, Math.PI * 2, 0, Math.PI * 0.4), [0, -0.3, -0.03], [-Math.PI / 2, 0, 0], [1, 0.45, 1]), mat);
    for (let k = 0; k < 6; k++) gb.add(X(box(0.006, 0.006, 0.07), [0, -0.3, -0.06], [0, 0, k * Math.PI / 6], [1, 1, 1]), mat); }
}
function pauldron(gb, S, r, mat = 'metal', lames = 2, flute = 0) {
  gb.add(X(sph(r, S(14), S(8), 0, Math.PI * 2, 0, Math.PI * 0.55), [0, 0.0, 0], [0, 0, 0], [1.08, 0.85, 1.12]), mat);
  for (let i = 0; i < lames; i++) gb.add(X(cyl(r * (0.92 - i * 0.08), r * (1.0 - i * 0.08), 0.05, S(14), true), [0, -0.055 - i * 0.045, 0], [0, 0, 0], [1.08, 1, 1.12]), mat);
  for (let k = 0; k < flute; k++) gb.add(X(tor(r * 1.02, 0.004, 3, S(12), Math.PI * 0.55), [0, 0, 0], [0, k * Math.PI / flute, Math.PI * 0.22], [1.08, 0.85, 1.12]), mat);
}
const UARMS = {
  gothic(gb, S) { rerebrace(gb, S); pauldron(gb, S, 0.105, 'metal', 2, 4); couter(gb, S, 'point'); gb.add(X(tor(0.11, 0.005, 3, S(14)), [0, -0.01, 0], [Math.PI / 2, 0, 0], [1.08, 1.12, 1]), 'trim'); },
  fluted(gb, S) { rerebrace(gb, S); pauldron(gb, S, 0.115, 'metal', 3, 6); couter(gb, S, 'fluted');
    gb.add(X(cyl(0.065, 0.065, 0.012, S(16)), [0, -0.05, 0.11], [Math.PI / 2, 0, 0]), 'metal'); // ロンデル（肩の円盤）
    for (let k = 0; k < 8; k++) gb.add(X(box(0.004, 0.06, 0.004), [0, -0.05, 0.118], [0, 0, k * Math.PI / 8]), 'metalD');
    gb.add(X(tor(0.065, 0.006, 3, S(16)), [0, -0.05, 0.117]), 'metal'); },
  milanese(gb, S) { rerebrace(gb, S); pauldron(gb, S, 0.14, 'metal', 3); couter(gb, S, 'wing');
    gb.add(X(sph(0.15, S(12), S(6), 0, Math.PI, Math.PI * 0.2, Math.PI * 0.4), [0, -0.04, 0.02], [0, 0, 0], [1.1, 1, 1]), 'metal'); }, // 前に張り出す翼
  plate14(gb, S) { rerebrace(gb, S); gb.add(X(sph(0.075, S(10), S(6), 0, Math.PI * 2, 0, Math.PI * 0.6), [0, 0, 0], [0, 0, 0], [1, 0.8, 1]), 'mail'); couter(gb, S, 'wing'); },
  smooth(gb, S) { rerebrace(gb, S); pauldron(gb, S, 0.115, 'metal', 3); couter(gb, S, 'wing');
    gb.add(X(tor(0.12, 0.006, 3, S(14)), [0, -0.02, 0], [Math.PI / 2, 0, 0], [1.08, 1.12, 1]), 'trim'); },
  mail(gb, S) { gb.add(X(cyl(0.058, 0.05, 0.31, S(10)), [0, -0.15, 0]), 'mail'); gb.add(X(sph(0.07, S(10), S(6), 0, Math.PI * 2, 0, Math.PI * 0.6), [0, 0, 0]), 'mail'); },
};
// ---------------- 前腕＋ガントレット（原点=肘, 手は y=-0.3） ----------------
function gauntlet(gb, S, kind, mat = 'metal') {
  if (kind === 'glove') { gb.add(X(box(0.072, 0.1, 0.045), [0, -0.3, 0.005]), 'leatherD'); gb.add(X(cyl(0.048, 0.055, 0.06, S(10)), [0, -0.23, 0]), 'leatherD'); return; }
  const cuffTop = kind === 'gothic' ? 0.075 : kind === 'mitten' ? 0.07 : 0.062;
  gb.add(X(cyl(0.046, cuffTop, 0.075, S(10), true), [0, -0.235, 0]), mat);
  if (kind === 'gothic') gb.add(X(cone(0.03, 0.08, S(6)), [0, -0.2, -0.05], [-Math.PI * 0.6, 0, 0]), mat);
  gb.add(X(box(0.078, 0.065, 0.048), [0, -0.29, 0.006]), mat);
  if (kind === 'mitten') gb.add(X(sph(0.05, S(10), S(6)), [0, -0.335, 0.012], [0, 0, 0], [0.85, 0.8, 0.6]), mat);
  else for (let i = 0; i < 3; i++) gb.add(X(box(0.076, 0.016, 0.05), [0, -0.326 - i * 0.017, 0.01 + i * 0.006], [0.3 + i * 0.25, 0, 0]), kind === 'gothic' ? mat : 'metalD');
  gb.add(X(box(0.024, 0.055, 0.026), [-0.042, -0.29, 0.02], [0, 0, 0.3]), mat);
}
const FARMS = {
  gothic(gb, S) { gb.add(X(cyl(0.046, 0.04, 0.2, S(10)), [0, -0.11, 0]), 'metal'); gauntlet(gb, S, 'gothic'); },
  fluted(gb, S) { gb.add(X(cyl(0.047, 0.041, 0.2, S(10)), [0, -0.11, 0]), 'metal'); for (let k = 0; k < 5; k++) gb.add(X(box(0.005, 0.18, 0.005), [Math.sin(k * 1.2) * 0.048, -0.11, Math.cos(k * 1.2) * 0.048]), 'metalD'); gauntlet(gb, S, 'mitten'); },
  milanese(gb, S) { gb.add(X(cyl(0.047, 0.041, 0.2, S(10)), [0, -0.11, 0]), 'metal'); gauntlet(gb, S, 'mitten'); },
  plate14(gb, S) { gb.add(X(cyl(0.046, 0.04, 0.2, S(10)), [0, -0.11, 0]), 'metal'); gauntlet(gb, S, 'hour'); },
  smooth(gb, S) { gb.add(X(cyl(0.046, 0.04, 0.2, S(10)), [0, -0.11, 0]), 'metal'); gb.add(X(tor(0.046, 0.005, 3, S(12)), [0, -0.02, 0], [Math.PI / 2, 0, 0]), 'trim'); gauntlet(gb, S, 'hour'); },
  mail(gb, S) { gb.add(X(cyl(0.05, 0.044, 0.22, S(10)), [0, -0.11, 0]), 'mail'); gauntlet(gb, S, 'glove'); },
};
// ---------------- 太もも（原点=股関節, 下へ 0.46） ----------------
function cuisse(gb, S, mat = 'metal') { gb.add(X(cyl(0.092, 0.07, 0.37, S(12)), [0, -0.2, 0.004]), mat); gb.add(X(cyl(0.094, 0.094, 0.03, S(12), true), [0, -0.03, 0.004]), 'metalD'); }
function poleyn(gb, S, kind, mat = 'metal') {
  gb.add(X(sph(0.066, S(10), S(8)), [0, -0.46, 0.022]), mat);
  if (kind === 'fan') for (const sx of [-1, 1]) gb.add(X(sph(0.07, S(10), S(6), 0, Math.PI * 2, 0, Math.PI * 0.35), [sx * 0.045, -0.46, 0], [0, 0, sx * Math.PI / 2], [1, 0.4, 1]), mat);
  if (kind === 'big') gb.add(X(sph(0.09, S(12), S(6), 0, Math.PI * 2, 0, Math.PI * 0.45), [0, -0.46, 0.035], [Math.PI / 2, 0, 0], [1, 0.5, 1.1]), mat);
}
const THIGHS = {
  gothic(gb, S) { cuisse(gb, S); for (let k = -1; k <= 1; k++) gb.add(X(box(0.007, 0.3, 0.008), [k * 0.03, -0.2, 0.075]), 'metal'); poleyn(gb, S, 'fan'); },
  fluted(gb, S) { cuisse(gb, S); for (let k = -2; k <= 2; k++) gb.add(X(box(0.006, 0.32, 0.007), [k * 0.025, -0.2, 0.075 - Math.abs(k) * 0.006]), 'metal'); poleyn(gb, S, 'fan'); },
  milanese(gb, S) { cuisse(gb, S); poleyn(gb, S, 'big'); },
  plate14(gb, S) { cuisse(gb, S); poleyn(gb, S, 'fan'); },
  smooth(gb, S) { cuisse(gb, S); poleyn(gb, S, 'fan'); gb.add(X(tor(0.075, 0.005, 3, S(12)), [0, -0.03, 0], [Math.PI / 2, 0, 0]), 'trim'); },
  mail(gb, S) { gb.add(X(cyl(0.08, 0.062, 0.47, S(10)), [0, -0.23, 0]), 'mail'); gb.add(X(sph(0.06, S(8), S(6)), [0, -0.46, 0.01]), 'mail'); },
  cloth(gb, S) { gb.add(X(cyl(0.078, 0.06, 0.47, S(10)), [0, -0.23, 0]), 'clothD'); },
};
// ---------------- すね＋鉄靴（原点=膝, 足首は y=-0.46） ----------------
function greave(gb, S, mat = 'metal') { gb.add(X(cyl(0.066, 0.05, 0.39, S(12)), [0, -0.22, 0.004]), mat); }
function sabaton(gb, S, kind, mat = 'metal') {
  const y = -0.475;
  if (kind === 'boot') { gb.add(X(cyl(0.058, 0.052, 0.26, S(10)), [0, -0.33, 0]), 'leather'); gb.add(X(box(0.085, 0.055, 0.22), [0, y, 0.05]), 'leather'); gb.add(X(sph(0.042, S(8), S(6)), [0, y, 0.15], [0, 0, 0], [1, 0.7, 1.2]), 'leather'); return; }
  gb.add(X(box(0.088, 0.058, 0.17), [0, y, 0.03]), mat);
  for (let i = 0; i < 3; i++) gb.add(X(box(0.092, 0.012, 0.03), [0, y + 0.03, 0.04 + i * 0.035], [0.2, 0, 0]), 'metalD');
  if (kind === 'poulaine') gb.add(X(cone(0.042, 0.34, S(8)), [0, y - 0.01, 0.28], [Math.PI / 2, 0, 0], [1, 1, 0.7]), mat); // 長く尖った爪先
  else if (kind === 'poulaineS') gb.add(X(cone(0.042, 0.18, S(8)), [0, y - 0.01, 0.2], [Math.PI / 2, 0, 0], [1, 1, 0.7]), mat);
  else if (kind === 'bearpaw') gb.add(X(sph(0.075, S(12), S(6)), [0, y - 0.005, 0.14], [0, 0, 0], [1.05, 0.45, 0.7]), mat); // 熊足
  else gb.add(X(sph(0.048, S(10), S(6)), [0, y - 0.005, 0.135], [0, 0, 0], [1, 0.65, 1.3]), mat);
}
const SHINS = {
  gothic(gb, S) { greave(gb, S); sabaton(gb, S, 'poulaine'); },
  fluted(gb, S) { greave(gb, S); for (let k = -1; k <= 1; k++) gb.add(X(box(0.006, 0.3, 0.006), [k * 0.025, -0.2, 0.06]), 'metal'); sabaton(gb, S, 'bearpaw'); },
  milanese(gb, S) { greave(gb, S); sabaton(gb, S, 'normal'); },
  plate14(gb, S) { greave(gb, S); sabaton(gb, S, 'poulaineS'); },
  smooth(gb, S) { greave(gb, S); sabaton(gb, S, 'normal'); gb.add(X(tor(0.05, 0.005, 3, S(12)), [0, -0.4, 0.004], [Math.PI / 2, 0, 0]), 'trim'); },
  mail(gb, S) { gb.add(X(cyl(0.06, 0.05, 0.42, S(10)), [0, -0.22, 0]), 'mail'); sabaton(gb, S, 'boot'); },
  cloth(gb, S) { gb.add(X(cyl(0.06, 0.05, 0.2, S(10)), [0, -0.1, 0]), 'clothD'); sabaton(gb, S, 'boot'); },
};

// 鎧セットから兵士のパーツ形状をまとめて作る
export function buildBody(team, armorId, detail) {
  if (hasNew(armorId)) return buildBodyNew(team, ARMORS[armorId], armorId, detail);
  const set = ARMORS[armorId], ctx = makeCtx(team, set, detail), S = ctx.S;
  const mk = fn => { const gb = new GB(ctx); fn(gb, S); return gb.build(); };
  return {
    head: mk(gb => HELMS[set.helm](gb, S)),
    torso: mk(gb => TORSOS[set.torso](gb, S)),
    uarm: mk(gb => UARMS[set.arm](gb, S)),
    farm: mk(gb => FARMS[set.arm === 'mail' ? 'mail' : set.arm](gb, S)),
    thigh: mk(gb => THIGHS[set.leg](gb, S)),
    shin: mk(gb => SHINS[set.leg](gb, S)),
  };
}
export function buildLightHelm(team, detail) { return buildLightHelmNew(team, detail); }

// ============================================================
// 盾（原点=持ち手。+z が表）
// ============================================================
function heaterShape(w, h) { const s = new THREE.Shape(); s.moveTo(-w / 2, h * 0.36); s.lineTo(w / 2, h * 0.36); s.lineTo(w / 2, h * 0.02);
  s.bezierCurveTo(w / 2, -h * 0.3, w * 0.22, -h * 0.52, 0, -h * 0.64); s.bezierCurveTo(-w * 0.22, -h * 0.52, -w / 2, -h * 0.3, -w / 2, h * 0.02); s.closePath(); return s; }
function kiteShape(w, h) { const s = new THREE.Shape(); s.moveTo(-w / 2, h * 0.3); s.quadraticCurveTo(-w / 2, h * 0.5, 0, h * 0.5); s.quadraticCurveTo(w / 2, h * 0.5, w / 2, h * 0.3);
  s.bezierCurveTo(w * 0.48, h * 0.0, w * 0.15, -h * 0.35, 0, -h * 0.5); s.bezierCurveTo(-w * 0.15, -h * 0.35, -w * 0.48, h * 0.0, -w / 2, h * 0.3); s.closePath(); return s; }
// 軍ごとの紋章：青=山形 赤=十字 緑=斜め十字 金=横帯 紫=縦帯と横帯
function emblem(gb, team, h, cy, zf, k) {
  const at = (w, hh, x, y, rz) => { const g = X(box(w, hh, 0.006), [x, y, 0], [0, 0, rz || 0]); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + zf(p.getX(i))); g.computeVertexNormals(); gb.add(g, 'cloth2'); };
  const t = team % 5, w = 0.06 * k;
  if (t === 0) { at(w, h * 0.55, -0.1 * k, cy + 0.02, -0.62); at(w, h * 0.55, 0.1 * k, cy + 0.02, 0.62); }
  else if (t === 1) { at(w, h * 1.0, 0, cy - 0.02); at(h * 0.68, w, 0, cy + h * 0.25); }
  else if (t === 2) { at(w, h * 1.05, 0, cy, 0.62); at(w, h * 1.05, 0, cy, -0.62); }
  else if (t === 3) { at(h * 0.85, w * 1.6, 0, cy + h * 0.1); at(h * 0.85, w * 0.6, 0, cy - h * 0.18); }
  else { at(w * 1.4, h * 1.0, 0, cy); at(h * 0.6, w, 0, cy - h * 0.25); }
}
export function buildShield(team, kind, detail) {
  const ctx = makeCtx(team, null, detail), gb = new GB(ctx), cs = detail ? 14 : 6;
  if (kind === 'pavise') { // 大楯（パヴィース）：身の丈ほどの木の楯。縦の稜、表は布張りに軍の紋章、縁は鉄板
    const W = 0.74, Hh = 1.42, s = new THREE.Shape(); s.moveTo(-W / 2, -0.72); s.lineTo(W / 2, -0.72); s.lineTo(W / 2 - 0.02, 0.58); s.quadraticCurveTo(0, 0.74, -W / 2 + 0.02, 0.58); s.closePath();
    const bend = g => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - 0.32 * p.getX(i) ** 2); g.computeVertexNormals(); return g; };
    gb.add(bend(X(ext(s, 0.04, 0.006, cs), [0, 0, -0.066])), 'wood');
    gb.add(bend(X(ext(s, 0.004, 0, cs), [0, 0, -0.008])), 'cloth');
    gb.add(X(box(0.045, Hh - 0.06, 0.03), [0, -0.05, -0.006]), 'woodD'); // 中央の稜（盛り上がった背骨）
    { const pts = s.getPoints(detail ? 30 : 10).map(p => new THREE.Vector3(p.x, p.y, -0.32 * p.x * p.x - 0.004)); gb.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), detail ? 60 : 18, 0.012, 4, true), 'steelD'); }
    emblem(gb, team, 0.6, 0.12, x => -0.32 * x * x + 0.012, 1.3);
    gb.add(X(box(0.7, 0.05, 0.06), [0, -0.69, -0.03]), 'woodD');
    for (const x of [-0.12, 0.12]) gb.add(X(tor(0.05, 0.009, 4, 8, Math.PI), [x, 0.08, -0.1], [0, Math.PI / 2, Math.PI / 2]), 'leather');
    return gb.build();
  }
  // 実物の盾：板を横に反らせた木の芯、表は塗装、縁は金具、中央に鋲（ボス）。裏は前腕を通す革ベルト2本（エナーム）と首掛けベルト（ギージ）
  const sh = kind === 'kite' ? kiteShape(0.5, 1.05) : heaterShape(0.56, 0.72), bend = g => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - 0.5 * p.getX(i) ** 2); g.computeVertexNormals(); return g; };
  gb.add(bend(X(ext(sh, 0.026, 0.004, cs), [0, 0, -0.036])), 'wood');
  gb.add(bend(X(ext(sh, 0.003, 0, cs), [0, 0, -0.003])), 'cloth'); // 塗装面
  { const pts = sh.getPoints(detail ? 40 : 14).map(p => new THREE.Vector3(p.x, p.y, -0.5 * p.x * p.x - 0.002)); const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), detail ? 80 : 24, 0.008, 4, true); gb.add(g, 'steelD'); }
  emblem(gb, team, kind === 'kite' ? 0.4 : 0.31, kind === 'kite' ? 0 : -0.04, x => -0.5 * x * x + 0.003, 1);
  gb.add(X(sph(kind === 'kite' ? 0.05 : 0.04, detail ? 12 : 6, detail ? 6 : 3, 0, Math.PI * 2, 0, Math.PI / 2), [0, kind === 'kite' ? 0.1 : 0.05, 0.004], [Math.PI / 2, 0, 0], [1, 0.6, 1]), 'steel');
  for (const x of [-0.11, 0.11]) gb.add(X(tor(0.05, 0.009, 4, detail ? 12 : 6, Math.PI), [x, 0.08, -0.07], [0, Math.PI / 2, Math.PI / 2]), 'leather'); // エナーム
  gb.add(tube([[-0.2, 0.22, -0.045], [-0.08, 0.3, -0.07], [0.08, 0.3, -0.07], [0.2, 0.22, -0.045]], 0.008, detail ? 12 : 4, 3), 'leatherD'); // ギージ
  if (detail) for (const [x, y] of [[-0.18, 0.2], [0.18, 0.2], [-0.12, -0.15], [0.12, -0.15]]) gb.add(X(sph(0.007, 6, 4), [x, y, -0.5 * x * x + 0.003]), 'brass');
  return gb.build();
}

// ============================================================
// 武器（原点=右手の握り。+z が切っ先の向き）
// ============================================================
function bladeShape(w, len, tipLen) { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w * 0.32, len - tipLen); s.quadraticCurveTo(w * 0.18, len - tipLen * 0.3, 0, len);
  s.quadraticCurveTo(-w * 0.18, len - tipLen * 0.3, -w * 0.32, len - tipLen); s.closePath(); return s; }
function addAlongZ(gb, geo, z, mat) { gb.add(X(geo, [0, 0, z], [Math.PI / 2, 0, 0]), mat); }
export const WEAPONS = {
  glaive: { name: '偃月矛', desc: '三日月形の大刃を長い柄につけた大矛。広く薙ぎ払い、一度に大勢を斬る。重いぶん振りは遅い。', dmg: 40, range: 4.3, cd: 0.95, maxHits: 8, cone: 0.0, swing: 'sweep', twoHand: true, block: 0.4 },
  longsword: { name: 'ロングソード', desc: '両手持ちの長剣（15世紀ドイツ型）。速さと威力のバランスが良い。', dmg: 32, range: 3.0, cd: 0.55, maxHits: 4, cone: 0.3, swing: 'diag', twoHand: true, block: 0.35 },
  poleaxe: { name: 'ポールアックス', desc: '斧・槌・突き刃を一本にした騎士の長柄武器。鎧ごと叩き割る（盾と鎧の守りを無視しやすい）。', dmg: 58, range: 3.4, cd: 1.0, maxHits: 2, cone: 0.5, swing: 'over', twoHand: true, pierce: true, block: 0.4 },
  mace: { name: 'フランジメイス', desc: '放射状の刃（フランジ）を持つ鋼の槌。板金鎧に強く、盾と一緒に使える。', dmg: 38, range: 2.6, cd: 0.62, maxHits: 2, cone: 0.4, swing: 'over', shield: true, pierce: true, block: 0.15 },
  arming: { name: '片手剣と盾', desc: '十字鍔の片手剣とヒーターシールド。速く振れて、盾でしっかり守れる。', dmg: 26, range: 2.7, cd: 0.42, maxHits: 3, cone: 0.35, swing: 'diag', shield: true, block: 0.12 },
  lance: { name: 'ランス', desc: '騎乗突撃用の長槍。馬の速さがそのまま威力になる。徒歩ではいまいち。', dmg: 22, range: 4.9, cd: 0.8, maxHits: 2, cone: 0.75, swing: 'thrust', shield: true, lance: true, block: 0.15 },
};
export const WEAPON_IDS = Object.keys(WEAPONS);

const WPN_BUILD = {
  glaive(gb, d) { // 偃月矛：柄 2.5m、三日月の大刃、竜頭の口金、赤い房
    const cs = d ? 18 : 8, sg = d ? 12 : 6;
    addAlongZ(gb, cyl(0.02, 0.022, 2.5, sg), 0.25, 'lacquer');
    for (const z of [-0.95, -0.4, 0.55, 1.1]) addAlongZ(gb, cyl(0.026, 0.026, 0.07, sg), z, 'steelD'); // 彫り込みの節
    addAlongZ(gb, cyl(0.03, 0.022, 0.06, sg), 1.42, 'gold');
    gb.add(X(sph(0.05, sg, 8), [0, 0, 1.5], [0, 0, 0], [0.9, 0.9, 1.3]), 'steelD'); // 竜頭の口金
    gb.add(X(cone(0.03, 0.08, sg), [0, 0.035, 1.53], [-0.4, 0, 0]), 'steelD');
    addAlongZ(gb, cone(0.022, 0.16, sg), -1.08, 'steelD'); // 石突き
    gb.add(X(cone(0.028, 0.06, sg), [0, 0, -1.03], [-Math.PI / 2, 0, 0]), 'steelD');
    const s = new THREE.Shape(); // 刃（u=柄の先へ, v=刃側がマイナス）
    s.moveTo(0, 0.05); s.lineTo(0, -0.04);
    s.bezierCurveTo(0.13, -0.24, 0.48, -0.25, 0.7, 0.16);
    s.bezierCurveTo(0.6, 0.09, 0.5, 0.05, 0.38, 0.06);
    s.quadraticCurveTo(0.33, 0.12, 0.27, 0.06); // 背の切り欠き
    s.lineTo(0.1, 0.05); s.closePath();
    const bg = ext(s, 0.012, 0.007, cs); bg.applyMatrix4(UZVNY); X(bg, [-0.006, 0, 1.53]); gb.add(bg, 'steelL');
    for (let i = 0; i < (d ? 6 : 3); i++) gb.add(X(cyl(0.008, 0.002, 0.24, 4), [0.03 * Math.cos(i), -0.12, 1.47 + 0.02 * Math.sin(i * 2)], [0.2 * Math.sin(i), 0, 0.25 * Math.cos(i)]), 'red'); // 赤い房
  },
  longsword(gb, d) {
    const cs = d ? 12 : 6;
    const b = ext(bladeShape(0.05, 0.98, 0.2), 0.006, 0.003, cs); b.applyMatrix4(LEN_Z); X(b, [-0.003, 0, 0.1]); gb.add(b, 'steelL');
    gb.add(X(box(0.008, 0.012, 0.75), [0, 0, 0.47]), 'steelD'); // 樋（フラー）
    gb.add(X(box(0.012, 0.29, 0.03), [0, 0, 0.085]), 'steel'); // 十字鍔
    for (const sy of [-1, 1]) gb.add(X(sph(0.016, 6, 6), [0, sy * 0.15, 0.085]), 'steel');
    addAlongZ(gb, cyl(0.016, 0.018, 0.26, 8), -0.06, 'leather');
    gb.add(X(sph(0.032, 10, 8), [0, 0, -0.21], [0, 0, 0], [0.7, 1, 1]), 'steel');
  },
  arming(gb, d) {
    const cs = d ? 10 : 5;
    const b = ext(bladeShape(0.048, 0.76, 0.16), 0.006, 0.003, cs); b.applyMatrix4(LEN_Z); X(b, [-0.003, 0, 0.09]); gb.add(b, 'steelL');
    gb.add(X(box(0.012, 0.22, 0.028), [0, 0, 0.075]), 'steel');
    addAlongZ(gb, cyl(0.016, 0.017, 0.13, 8), 0.0, 'leather');
    gb.add(X(sph(0.03, 10, 8), [0, 0, -0.08], [0, 0, 0], [0.7, 1, 1]), 'brass');
  },
  poleaxe(gb, d) { // 斧刃＋槌＋穂先＋ランゲット（柄の補強板）
    const cs = d ? 12 : 6;
    addAlongZ(gb, cyl(0.02, 0.02, 1.9, d ? 10 : 6), 0.35, 'wood');
    for (const sx of [-1, 1]) gb.add(X(box(0.006, 0.014, 0.6), [sx * 0.021, 0, 0.98]), 'steelD'); // ランゲット
    const ax = new THREE.Shape(); ax.moveTo(0, 0.03); ax.lineTo(0.05, 0.04); ax.quadraticCurveTo(0.1, -0.06, 0.2, -0.05); ax.quadraticCurveTo(0.25, -0.16, 0.18, -0.27); ax.quadraticCurveTo(0.1, -0.2, -0.04, -0.24); ax.quadraticCurveTo(0.02, -0.12, 0, -0.03); ax.closePath();
    const ag = ext(ax, 0.01, 0.004, cs); ag.applyMatrix4(UZVNY); X(ag, [-0.005, 0, 1.22]); gb.add(ag, 'steel'); // 斧（+y＝拳の側）
    gb.add(X(box(0.045, 0.1, 0.05), [0, -0.07, 1.3]), 'steel'); // 槌（反対側）
    for (let k = 0; k < 6; k++) gb.add(X(cone(0.009, 0.022, 4), [((k % 2) - 0.5) * 0.026, -0.127, 1.28 + Math.floor(k / 2) * 0.02], [Math.PI, 0, 0]), 'steel'); // ぎざぎざの槌面
    { const sp = new THREE.Shape(); sp.moveTo(-0.022, 0); sp.quadraticCurveTo(-0.04, 0.12, 0, 0.4); sp.quadraticCurveTo(0.04, 0.12, 0.022, 0); sp.closePath(); const g = ext(sp, 0.008, 0.004, cs); g.applyMatrix4(LEN_Z); X(g, [-0.004, 0, 1.34]); gb.add(g, 'steelL'); } // 木の葉形の穂先
    addAlongZ(gb, cyl(0.03, 0.03, 0.04, 8), 0.75, 'steel'); // ロンデル鍔
    addAlongZ(gb, cone(0.02, 0.12, 6), -0.66, 'steel');
  },
  mace(gb, d) {
    addAlongZ(gb, cyl(0.016, 0.017, 0.62, 8), 0.2, 'steelD');
    addAlongZ(gb, cyl(0.019, 0.019, 0.16, 8), -0.02, 'leather');
    gb.add(X(sph(0.028, 8, 6), [0, 0, -0.12]), 'steel');
    gb.add(X(sph(0.035, 10, 8), [0, 0, 0.5]), 'steel');
    const f = new THREE.Shape(); f.moveTo(0, 0); f.lineTo(0.03, 0); f.quadraticCurveTo(0.075, 0.07, 0.03, 0.17); f.lineTo(0, 0.17); f.closePath();
    for (let k = 0; k < 7; k++) { const g = ext(f, 0.006, 0.002, d ? 8 : 4); X(g, [0, 0, -0.003]); g.applyMatrix4(LEN_Z); X(g, [0, 0, 0.42], [0, 0, k * Math.PI * 2 / 7]); gb.add(g, 'steel'); }
    addAlongZ(gb, cone(0.015, 0.05, 6), 0.62, 'steel');
  },
  lance(gb, d) {
    const sg = d ? 12 : 6;
    gb.add(X(cyl(0.022, 0.06, 2.6, sg), [0, 0, 1.55], [Math.PI / 2, 0, 0]), 'cloth');
    for (let i = 0; i < 6; i++) gb.add(X(cyl(0.06 - i * 0.0065, 0.062 - i * 0.0065, 0.18, sg), [0, 0, 0.55 + i * 0.4], [Math.PI / 2, 0, 0]), 'cloth2'); // 塗り分け
    gb.add(X(cone(0.024, 0.22, sg), [0, 0, 2.95], [Math.PI / 2, 0, 0]), 'steel');
    gb.add(X(cyl(0.035, 0.19, 0.24, sg, true), [0, 0, 0.2], [Math.PI / 2, 0, 0], [1, 1, 1.15]), 'steel'); // ヴァンプレート（手の鍔）
    addAlongZ(gb, cyl(0.035, 0.03, 0.55, sg), -0.12, 'wood');
  },
  spear(gb, d) {
    addAlongZ(gb, cyl(0.017, 0.017, 2.7, d ? 8 : 5), 0.6, 'wood');
    const s = new THREE.Shape(); s.moveTo(-0.025, 0); s.quadraticCurveTo(-0.045, 0.1, 0, 0.3); s.quadraticCurveTo(0.045, 0.1, 0.025, 0); s.closePath();
    const g = ext(s, 0.006, 0.003, d ? 8 : 4); g.applyMatrix4(LEN_Z); X(g, [-0.003, 0, 1.97]); gb.add(g, 'steel');
    addAlongZ(gb, cyl(0.02, 0.022, 0.08, 6), 1.95, 'steelD');
  },
  bow(gb, d) { // イングランドの長弓（握りが原点）
    gb.add(tube([[0, -0.16, -0.9], [0, -0.05, -0.45], [0, 0, 0], [0, -0.05, 0.45], [0, -0.16, 0.9]], 0.014, d ? 20 : 10, d ? 6 : 4), 'wood');
    gb.add(X(cyl(0.0025, 0.0025, 1.8, 3), [0, -0.16, 0], [Math.PI / 2, 0, 0]), 'string');
    addAlongZ(gb, cyl(0.02, 0.02, 0.1, 6), 0, 'leather');
  },
};
export function buildWeapon(kind, team, detail) { const gb = new GB(makeCtx(team, null, detail)); WPN_BUILD[kind](gb, detail); return gb.build(); }
export function buildArrow() {
  const gb = new GB(makeCtx(0, null, false));
  gb.add(X(cyl(0.005, 0.005, 0.8, 4), [0, 0, 0], [Math.PI / 2, 0, 0]), 'wood');
  gb.add(X(cone(0.012, 0.05, 4), [0, 0, 0.42], [Math.PI / 2, 0, 0]), 'steelD');
  for (let k = 0; k < 3; k++) gb.add(X(box(0.002, 0.03, 0.1), [0, 0, -0.35], [0, 0, k * Math.PI * 2 / 3]), 'white');
  return gb.build();
}

// ============================================================
// 馬（原点=地面。体の中心 y≈1.3、前脚の付け根 z=+0.6、後脚 z=-0.6）
// style: 'barded' = 自分の馬（全身の馬鎧）, 'caparison' = 騎兵（布の馬衣）, 'messenger'
// ============================================================
export const HORSE_JOINTS = { neck: [0, 1.52, 0.78], legs: [[-0.19, 1.2, 0.62], [0.19, 1.2, 0.62], [-0.19, 1.24, -0.62], [0.19, 1.24, -0.62]], saddleY: 1.72 };
export function buildHorse(team, style, detail, steelSet) {
  const ctx = makeCtx(team, steelSet ? ARMORS[steelSet] : null, detail), S = ctx.S;
  const coat = style === 'barded' ? 'horseBlack' : style === 'messenger' ? 'horse' : (team ? 'horse' : 'horseBlack');
  const body = new GB(ctx), neck = new GB(ctx), leg = new GB(ctx);
  // --- 胴体 ---
  body.add(X(new THREE.CapsuleGeometry(0.39, 0.95, S(6), S(16)), [0, 1.3, 0], [Math.PI / 2, 0, 0], [0.95, 1, 1.1]), coat);
  body.add(X(sph(0.4, S(14), S(10)), [0, 1.33, 0.58], [0, 0, 0], [0.92, 1.05, 0.85]), coat);
  body.add(X(sph(0.43, S(14), S(10)), [0, 1.36, -0.6], [0, 0, 0], [0.98, 1, 0.9]), coat);
  body.add(tube([[0, 1.42, -1.0], [0, 1.25, -1.18], [0, 0.85, -1.22], [0, 0.55, -1.18]], 0.05, S(10), 5), 'hair'); // 尾
  // 鞍
  body.add(X(sph(0.24, S(12), S(6), 0, Math.PI * 2, 0, Math.PI / 2), [0, 1.66, 0.02], [0, 0, 0], [1.05, 0.35, 1.25]), 'leatherD');
  body.add(X(cyl(0.14, 0.16, 0.16, S(10), true, -Math.PI / 2, Math.PI), [0, 1.78, 0.3], [0.2, 0, 0]), 'leatherD'); // 前橋
  body.add(X(cyl(0.16, 0.18, 0.2, S(10), true, Math.PI / 2, Math.PI), [0, 1.8, -0.24], [-0.25, 0, 0]), 'leatherD'); // 後橋
  for (const sx of [-1, 1]) { body.add(X(box(0.02, 0.5, 0.04), [sx * 0.42, 1.38, 0.08]), 'leatherD'); body.add(X(tor(0.05, 0.01, 4, 10), [sx * 0.42, 1.1, 0.08], [0, Math.PI / 2, 0]), 'steelD'); }
  if (style === 'barded') { // 写真の馬鎧：溝彫りの胸当て・尻当て、下縁は波形
    const m = 'metal';
    // ペイトラル（胸当て）：胸の丸みに沿った帯
    body.add(X(sph(0.6, S(24), S(10), -0.2 * Math.PI, 1.4 * Math.PI, 0.3 * Math.PI, 0.42 * Math.PI), [0, 1.25, 0.42], [0, 0, 0], [0.92, 0.95, 0.85]), m);
    // クラッパー（尻当て）：尻を覆うドーム
    body.add(X(sph(0.6, S(24), S(12), 0.8 * Math.PI, 1.4 * Math.PI, 0, 0.62 * Math.PI), [0, 1.12, -0.5], [0, 0, 0], [0.9, 0.85, 1.05]), m);
    const nF = detail ? 10 : 6;
    for (let k = 0; k < nF; k++) { const a = -0.62 * Math.PI + k * (1.24 * Math.PI) / (nF - 1); // 胸当ての溝彫り
      body.add(X(box(0.012, 0.24, 0.012), [Math.sin(a) * 0.553, 1.25, 0.42 + Math.cos(a) * 0.515], [0, a, 0]), 'metalD'); }
    for (let k = 0; k < nF; k++) { const a = Math.PI * 0.35 + k * (1.3 * Math.PI) / (nF - 1); // 尻当ての溝彫り
      body.add(X(box(0.012, 0.28, 0.012), [Math.sin(a) * 0.545, 1.16, -0.5 + Math.cos(a) * 0.64], [0.15 * Math.cos(a), a, 0]), 'metalD'); }
    for (const sx of [-1, 1]) body.add(X(box(0.02, 0.34, 0.5), [sx * 0.43, 1.28, -0.02]), m); // フランチャード（脇の板）
    body.add(X(tor(0.55, 0.01, 3, S(22), 1.3 * Math.PI), [0, 1.5, 0.42], [Math.PI / 2, 0, -0.15 * Math.PI], [0.92, 0.85, 1]), 'trim');
  } else if (style === 'caparison') { // 布の馬衣
    body.add(X(cyl(0.46, 0.56, 0.95, S(20), true), [0, 1.0, 0], [0, 0, 0], [1, 1, 2.05]), 'cloth');
    body.add(X(sph(0.5, S(14), S(6), 0, Math.PI * 2, 0, Math.PI / 2), [0, 1.42, 0], [0, 0, 0], [0.98, 0.5, 2.1]), 'cloth');
    body.add(X(tor(0.56, 0.012, 3, S(22)), [0, 0.53, 0], [Math.PI / 2, 0, 0], [1, 2.05, 1]), 'cloth2');
  } else if (style === 'messenger') body.add(X(box(0.7, 0.04, 0.6), [0, 1.62, 0.0]), 'yellow');
  // --- 首と頭（原点=首の付け根） ---
  const nd = [0, Math.cos(0.62), Math.sin(0.62)];
  neck.add(X(cyl(0.15, 0.26, 0.85, S(12)), [0, nd[1] * 0.4, nd[2] * 0.4], [0.62, 0, 0], [0.82, 1, 1]), coat);
  neck.add(X(box(0.05, 0.8, 0.12), [0, nd[1] * 0.42 + 0.05, nd[2] * 0.42 - 0.12], [0.62, 0, 0]), 'hair'); // たてがみ
  const hp = [0, 0.75, 0.5], hd = [0, -Math.cos(0.55), Math.sin(0.55) * 1.0];
  neck.add(X(cyl(0.085, 0.15, 0.6, S(10)), [hp[0], hp[1] - 0.27, hp[2] + 0.2], [Math.PI - 0.95, 0, 0], [0.78, 1, 1.1]), coat);
  neck.add(X(sph(0.15, S(12), S(8)), [0, 0.7, 0.48], [0, 0, 0], [0.75, 0.95, 1]), coat);
  neck.add(X(sph(0.085, S(10), S(6)), [0, 0.43, 0.72], [0, 0, 0], [0.85, 0.8, 1]), coat); // 鼻先
  for (const sx of [-1, 1]) neck.add(X(cone(0.035, 0.13, 6), [sx * 0.06, 0.86, 0.42], [-0.25, 0, sx * -0.2]), coat); // 耳
  neck.add(X(box(0.012, 0.012, 0.5), [0, 0.5, 0.55], [0.9, 0, 0]), 'leatherD'); // 手綱
  if (style === 'barded' || style === 'caparison') { // シャンフロン（顔当て）
    neck.add(X(cyl(0.1, 0.17, 0.62, S(12), true, Math.PI * 0.5, Math.PI), [0, 0.5, 0.67], [Math.PI - 0.95, 0, 0], [0.86, 1, 1.15]), 'metal');
    for (const sx of [-1, 1]) neck.add(X(sph(0.055, S(10), S(6), 0, Math.PI * 2, 0, Math.PI / 2), [sx * 0.1, 0.66, 0.55], [0, 0, sx * -1.3]), 'metal'); // 目の覆い
    if (style === 'barded') {
      neck.add(X(cone(0.03, 0.22, S(8)), [0, 0.8, 0.62], [0.95, 0, 0]), 'metal'); // 額のトゲ
      neck.add(X(cyl(0.035, 0.035, 0.012, S(12)), [0, 0.72, 0.62], [0.95, 0, 0]), 'trim');
      for (let k = -1; k <= 1; k++) neck.add(X(box(0.01, 0.4, 0.012), [k * 0.03, 0.52, 0.76], [Math.PI - 0.95, 0, 0]), 'metalD');
      for (let i = 0; i < 9; i++) { const t = 0.05 + i * 0.085, r = 0.26 - t * 0.12 + 0.03; // クリネット（首の鱗状の板）
        neck.add(X(cyl(r, r + 0.012, 0.11, S(12), true, Math.PI * 0.55, Math.PI * 0.9), [0, nd[1] * t, nd[2] * t], [0.62, 0, 0], [0.86, 1, 1]), 'metal');
        if (detail) neck.add(X(tor(r + 0.01, 0.004, 3, S(10), Math.PI * 0.9), [0, nd[1] * t - 0.05, nd[2] * t], [Math.PI / 2 + 0.62, 0, Math.PI * 0.55], [0.86, 1, 1]), 'metalD'); }
    } else neck.add(X(cyl(0.18, 0.28, 0.75, S(12), true), [0, nd[1] * 0.38, nd[2] * 0.38], [0.62, 0, 0], [0.86, 1, 1]), 'cloth');
  }
  // --- 脚：上（原点=付け根, 下へ 0.57 で膝）と下（原点=膝, 下へ 0.62 で蹄の底） ---
  const legL = new GB(ctx);
  leg.add(X(cyl(0.115, 0.07, 0.57, S(8)), [0, -0.28, 0]), coat);
  leg.add(X(sph(0.072, S(8), S(6)), [0, -0.57, 0.0]), coat);
  if (style === 'caparison') leg.add(X(cyl(0.125, 0.1, 0.3, S(8)), [0, -0.12, 0]), 'cloth');
  legL.add(X(cyl(0.05, 0.045, 0.42, S(6)), [0, -0.22, 0]), coat);
  legL.add(X(sph(0.056, S(8), S(6)), [0, -0.45, 0.0]), coat);
  legL.add(X(cyl(0.05, 0.045, 0.1, S(6)), [0, -0.51, 0.025], [0.35, 0, 0]), coat);
  legL.add(X(cyl(0.056, 0.074, 0.08, S(8)), [0, -0.58, 0.04]), 'hoof');
  return { body: body.build(), neck: neck.build(), leg: leg.build(), legL: legL.build() };
}
