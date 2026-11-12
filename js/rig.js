// WARLORD — 関節アニメーション（兵士・将・馬）。ゲーム本体・武具画面・確認ページで共通。
// 人体: 原点は足元, +z が前, キャラの右手は -x 側。
// 角度の向き: sh(肩)・hip(股) は負で前へ, el(肘) は負で曲がる, knee(膝) は正で曲がる。
import * as THREE from 'three';
import { HORSE_JOINTS } from './models.js';

export const HIP_Y = 1.03;
const TAU = Math.PI * 2;
const L = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const easeOut = t => t <= 0 ? 0 : t >= 1 ? 1 : 1 - (1 - t) * (1 - t) * (1 - t);
const frac = x => x - Math.floor(x);

// ------------------------------------------------------------------
// 攻撃の動き：キーフレーム [時刻(0-1), 姿勢, 'snap'なら素早く]
// 構え → 振りかぶり(タメ) → 振り抜き(踏み込み) → 余韻 → 構え
// ------------------------------------------------------------------
export const SWINGS = {
  diag: { dur: 0.6, hit: 0.46,
    idle: { shR: -0.45, elR: -1.15, wP: -1.1, wY: -0.1 },
    ready: { shR: -0.8, elR: -1.3, wP: -0.7, wY: -0.25 },
    keys: [[0.3, { shR: -2.75, elR: -0.75, wP: -2.5, wY: -0.7, twist: -0.5, lean: -0.06, drop: 0.02, side: -0.06 }],
      [0.42, { shR: -1.55, elR: -0.3, wP: -0.55, wY: 0.1, twist: 0.0, lean: 0.12, lunge: 0.14, drop: -0.03 }, 'snap'],
      [0.52, { shR: -0.55, elR: -0.12, wP: 0.75, wY: 0.9, twist: 0.5, lean: 0.24, lunge: 0.24, drop: -0.08, side: 0.06 }, 'snap'],
      [0.74, { shR: -0.5, elR: -0.45, wP: 0.45, wY: 0.6, twist: 0.32, lean: 0.14, lunge: 0.14, drop: -0.05 }]] },
  sweep: { dur: 0.95, hit: 0.52, two: true,
    idle: { shR: -0.55, elR: -1.25, wP: -0.75, wY: -0.35 },
    ready: { shR: -0.95, elR: -1.1, wP: -0.35, wY: -0.6, wR: 0.5 },
    keys: [[0.36, { twist: -1.05, wY: -1.85, wP: -0.3, shR: -1.45, elR: -0.95, wR: 1.25, lean: -0.06, drop: 0.04, side: -0.08 }],
      [0.48, { twist: -0.15, wY: -0.25, wP: -0.12, shR: -1.35, elR: -0.5, wR: 1.3, lunge: 0.16 }, 'snap'],
      [0.6, { twist: 0.95, wY: 1.65, wP: -0.05, shR: -1.25, elR: -0.35, wR: 1.3, lean: 0.16, lunge: 0.28, drop: -0.1, side: 0.1 }, 'snap'],
      [0.8, { twist: 0.6, wY: 1.15, wP: -0.3, shR: -1.0, elR: -0.7, wR: 0.8, lean: 0.08, lunge: 0.12 }]] },
  over: { dur: 0.85, hit: 0.56,
    idle: { shR: -0.5, elR: -1.2, wP: -1.25, wY: -0.05 },
    ready: { shR: -0.95, elR: -1.25, wP: -1.5, wY: -0.15 },
    keys: [[0.38, { shR: -3.05, elR: -0.95, wP: -2.85, twist: -0.3, lean: -0.18, drop: 0.04 }],
      [0.5, { shR: -1.8, elR: -0.3, wP: -1.0, twist: 0, lean: 0.12, lunge: 0.12 }, 'snap'],
      [0.6, { shR: -0.75, elR: -0.12, wP: 0.42, twist: 0.18, lean: 0.3, lunge: 0.26, drop: -0.12 }, 'snap'],
      [0.82, { shR: -0.7, elR: -0.35, wP: 0.28, lean: 0.18, lunge: 0.15, drop: -0.07 }]] },
  thrust: { dur: 0.65, hit: 0.5, two: true,
    idle: { shR: -0.35, elR: -1.45, wP: -0.12, wY: 0.12 },
    ready: { shR: -0.5, elR: -1.5, wP: -0.05, wY: 0.1, lean: 0.1 },
    keys: [[0.34, { shR: 0.15, elR: -1.8, lean: -0.08, lunge: -0.1, twist: -0.3, drop: 0.02 }],
      [0.5, { shR: -1.32, elR: -0.08, lean: 0.24, lunge: 0.4, twist: 0.22, drop: -0.06 }, 'snap'],
      [0.72, { shR: -1.1, elR: -0.3, lean: 0.15, lunge: 0.26 }]] },
  couch: { dur: 0.6, hit: 0.42,
    idle: { shR: -0.2, elR: -1.35, wP: -0.05, wY: 0.18 },
    ready: { shR: -0.25, elR: -1.3, wP: -0.02, wY: 0.16 },
    keys: [[0.4, { lean: 0.38, shR: -0.45, elR: -1.15 }, 'snap'], [0.7, { lean: 0.26 }]] },
  draw: { dur: 1.0, hit: 0.62, bow: true,
    idle: { shL: -0.5, elL: -0.9, shR: -0.4, elR: -0.8, wP: -1.2 },
    ready: { shL: -0.7, elL: -0.7, shR: -0.5, elR: -1.0, wP: -1.3 },
    keys: [[0.3, { shL: -1.55, elL: -0.05, rollL: 0.12, shR: -1.45, elR: -1.6, wP: -1.57, twist: 0.45 }],
      [0.52, { shL: -1.56, elL: -0.03, rollL: 0.12, shR: -1.5, elR: -2.45, wP: -1.57, twist: 0.55, head: -0.06 }],
      [0.62, { shL: -1.56, elL: -0.03, rollL: 0.12, shR: -1.5, elR: -2.45, wP: -1.57, twist: 0.55, head: -0.06 }],
      [0.67, { shL: -1.5, elL: -0.05, rollL: 0.12, shR: -1.2, elR: -1.9, rollR: -0.55, wP: -1.5, twist: 0.5 }, 'snap'],
      [0.85, { shL: -1.0, elL: -0.4, shR: -0.7, elR: -1.0, wP: -1.3, twist: 0.2 }]] },
};
export const WEAPON_SWING = { arming: 'diag', longsword: 'diag', glaive: 'sweep', poleaxe: 'over', mace: 'over', lance: 'couch', spear: 'thrust', bow: 'draw' };
const KEYS = ['shR', 'elR', 'wP', 'wY', 'wR', 'twist', 'lean', 'lunge', 'drop', 'side', 'shL', 'elL', 'rollL', 'rollR', 'head'];

const P0 = { lean: 0, twist: 0, side: 0, head: 0, headY: 0, drop: 0, lunge: 0, sway: 0, shR: 0, shL: 0, rollR: -0.14, rollL: 0.14, elR: 0, elL: 0,
  hipR: 0, hipL: 0, kneeR: 0.05, kneeL: 0.05, abdR: 0.03, abdL: 0.03, wP: 0, wY: 0, wR: 0, sY: 1.25, sP: 0, bowLeft: false, fall: 0, fallDir: 1, fallSide: 0, wDrop: false, twL: 0, cape: 0, two: false };
export function newPose() { return { ...P0 }; }

// 歩幅に合わせて足の位相を進める（足が滑らない）。向きを変えるだけでも足踏みする
export function advanceWalk(e, dt) {
  const turn = e._lf === undefined ? 0 : Math.abs(((e.face - e._lf + Math.PI) % TAU + TAU) % TAU - Math.PI) / Math.max(dt, 1e-3);
  e._lf = e.face;
  const v = e.spd + Math.min(turn * 0.35, 1.2), run = clamp((v - 3.2) / 2.5, 0, 1), stride = L(1.45, 2.7, run);
  e.phase += v / stride * TAU * dt;
}
// 馬：速さで歩き・速歩・駆け足を切り替え、歩幅に合わせて周期を進める
export function horseGait(spd) { const s = Math.abs(spd); return s < 0.3 ? 0 : s < 3.4 ? 1 : s < 7.5 ? 2 : 3; }
const STRIDE = [1, 1.7, 2.8, 6.2];
export function advanceHorse(h, dt) { const g = horseGait(h.spd); h.gait = g; h.cyc = (h.cyc || 0) + (g ? Math.abs(h.spd) / STRIDE[g] : 0) * dt; h.t = (h.t || 0) + dt; }

function legCycle(u, duty, A, kSw, kSt) { // 返り値 [股, 膝]
  if (u < duty) { const k = u / duty; return [-A + 2 * A * k, kSt * Math.sin(k * Math.PI)]; }
  const k = (u - duty) / (1 - duty), e = 0.5 - 0.5 * Math.cos(k * Math.PI); return [A - 2 * A * e, kSw * Math.sin(k * Math.PI) + 0.04];
}


// ------------------------------------------------------------------
// 馬
// ------------------------------------------------------------------
// 馬の脚順: 0=右前 1=左前 2=右後 3=左後。オフセットは周期の何割ずれるか
const GAIT = [null,
  { off: [0.75, 0.25, 0.5, 0.0], duty: 0.65, A: 0.3, kf: 0.9, kh: 0.6 },  // 歩き（4拍子）
  { off: [0.5, 0.0, 0.0, 0.5], duty: 0.5, A: 0.42, kf: 1.25, kh: 0.9 },   // 速歩（対角の2拍子）
  { off: [0.62, 0.52, 0.1, 0.0], duty: 0.38, A: 0.62, kf: 1.6, kh: 1.15 }, // 駆け足（ギャロップ）
];
export function poseHorse(h, O) {
  const g = h.gait ?? horseGait(h.spd || 0), G = GAIT[g], u = frac(h.cyc || 0), tt = h.t || 0, dead = h.alive === false;
  O.hb.makeTranslation(h.x, h.y, h.z); RY(O.hb, h.face);
  let neckA = 0;
  if (dead) { const d = h.deadT || 0, b = sstep(d / 0.35), f = sstep((d - 0.2) / 0.7); T(O.hb, 0, -0.35 * b * (1 - f) - 0.88 * f, 0); T(O.hb, 0, 1.3, 0); RZ(O.hb, f * Math.PI / 2 * ((h.id || 0) % 2 ? 1 : -1)); T(O.hb, 0, -1.3, 0); neckA = 0.5 * f + 0.3 * b; }
  else if (g === 0) { T(O.hb, 0, Math.sin(tt * 1.3 + (h.x || 0)) * 0.006, 0); neckA = Math.sin(tt * 0.6 + (h.z || 0)) * 0.12 + 0.05; }
  else if (g === 1) { T(O.hb, 0, Math.abs(Math.sin(u * TAU * 2)) * 0.025, 0); RX(O.hb, Math.sin(u * TAU * 2) * 0.012); neckA = Math.sin(u * TAU * 2 + 0.5) * 0.08; }
  else if (g === 2) { T(O.hb, 0, Math.abs(Math.sin(u * TAU * 2)) * 0.07, 0); neckA = Math.sin(u * TAU * 2) * 0.05 - 0.05; }
  else { T(O.hb, 0, Math.sin(u * TAU - 0.6) * 0.11 + 0.04, 0); RX(O.hb, Math.sin(u * TAU + 1.2) * 0.075); neckA = Math.sin(u * TAU + 2.2) * 0.2 - 0.1; }
  const nj = HORSE_JOINTS.neck; O.hn.copy(O.hb); T(O.hn, nj[0], nj[1], nj[2]); RX(O.hn, neckA);
  for (let i = 0; i < 4; i++) {
    const j = HORSE_JOINTS.legs[i], front = i < 2; let hip = front ? 0 : 0.12, knee = front ? 0 : -0.1;
    if (dead) { const f = sstep((h.deadT || 0) / 0.5); hip = front ? -0.6 * f : 0.5 * f; knee = front ? 1.4 * f : -1.0 * f; }
    else if (G) { const [a, k] = legCycle(frac(u + G.off[i]), G.duty, G.A, front ? G.kf : G.kh, 0.08); hip += a; knee += front ? k : -k * 0.8; }
    else if (!front) { hip += Math.sin(tt * 0.45 + i) * 0.02; }
    const U = O.hl[i], D = O.hl[i + 4];
    U.copy(O.hb); T(U, j[0], j[1], j[2]); RX(U, hip);
    D.copy(U); T(D, 0, -0.57, 0); RX(D, knee);
  }
  h._bob = O.hb.elements[13] - h.y;
}

// ------------------------------------------------------------------
// 姿勢のパラメータ
// ------------------------------------------------------------------
// 両手武器の左手の位置（柄の軸に沿った、右手からの距離。負=石突き側）
export const GRIP_L = { longsword: -0.17, glaive: -0.55, poleaxe: -0.48, spear: -0.6, bow: null, arming: null, mace: null, lance: null };
function sampleSwing(sw, k, base, out) {
  let prevT = 0, prev = base;
  for (let i = 0; i <= sw.keys.length; i++) {
    const [kt, pose, mode] = i < sw.keys.length ? sw.keys[i] : [1, base, null];
    if (k <= kt) { const f = (k - prevT) / Math.max(1e-4, kt - prevT), w = mode === 'snap' ? easeOut(f) : sstep(f);
      for (const key of KEYS) { const a = prev[key] ?? base[key], b = pose[key] ?? base[key]; out[key] = L(a, b, w); } return out; }
    prevT = kt; prev = { ...base, ...pose };
  }
  for (const key of KEYS) out[key] = base[key]; return out;
}
const _sA = {}, _sB = {}, _sC = {};
// 2関節の脚を、足首の目標位置から逆算する（股の角度, 膝の角度）
function legIK(dy, dz, a, b) { const d = clamp(Math.hypot(dy, dz), 0.25, a + b - 0.002), phi = Math.atan2(-dz, -dy);
  const beta = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1)), knee = Math.PI - Math.acos(clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1)); return [phi - beta, knee]; }

export function poseParams(e, P, t = 0) {
  Object.assign(P, P0);
  const sw = SWINGS[e.swing] || SWINGS.diag, seed = (e.id || 0) * 1.37, dead = e.alive === false;
  let amt = 0;
  // ---- 足まわり ----
  if (e.mounted && !dead) { P.hipR = P.hipL = -1.22; P.kneeR = P.kneeL = 1.45; P.abdR = P.abdL = 0.42; }
  else if (!dead) {
    const v = e.spd || 0, run = clamp((v - 3.2) / 2.5, 0, 1), ph = e.phase || 0, u = frac(ph / TAU); amt = clamp(v / 1.4, 0, 1);
    const duty = L(0.6, 0.38, run), A = L(0.42, 0.72, run) * amt, kSw = L(1.0, 1.85, run) * amt, kSt = L(0.12, 0.4, run) * amt;
    const [hr, kr] = legCycle(u, duty, A, kSw, kSt), [hl, kl] = legCycle(frac(u + 0.5), duty, A, kSw, kSt);
    P.hipR = hr; P.kneeR = kr + 0.04; P.hipL = hl; P.kneeL = kl + 0.04;
    P.drop = -(L(0.025, 0.055, run) * Math.cos(ph * 2) + L(0.0, 0.03, run)) * amt;
    P.twist = Math.sin(ph) * 0.1 * amt; P.side = Math.sin(ph) * 0.03 * amt; P.lean = 0.04 * amt + 0.2 * run;
    P.shR = -hl * 0.65 * (1 - run * 0.2); P.shL = -hr * 0.65; P.elR = -0.25 - run * 0.95; P.elL = -0.25 - run * 0.95;
    P.head = -P.lean * 0.6; P.cape = 0.06 + v * 0.07;
    const idle = 1 - amt; // 立ち止まり：呼吸・重心の左右移動・見回し
    if (idle > 0) { P.lean += Math.sin(t * 1.7 + seed) * 0.014 * idle; P.sway = Math.sin(t * 0.45 + seed) * 0.03 * idle; P.side += Math.sin(t * 0.45 + seed) * 0.025 * idle;
      P.headY = Math.sin(t * 0.31 + seed * 3) * 0.35 * idle * (Math.sin(t * 0.13 + seed) > 0.3 ? 1 : 0.2); }
  }
  // ---- 構え ----
  const ready = (e.ready || e.blocking) && !dead ? 1 : 0, wk = (P.shR + 0.45) * 0.4;
  for (const k of ['shR', 'elR', 'wP', 'wY', 'wR', 'shL', 'elL']) { const a = sw.idle[k], b = sw.ready[k]; if (a !== undefined || b !== undefined) P[k] = L(a ?? P[k], b ?? a ?? P[k], ready); }
  if (!ready) P.shR += wk;
  if (ready && !e.mounted) { P.drop -= 0.08; P.lean += 0.1 + (sw.ready.lean || 0); }
  if (e.shieldKind && !sw.two && !sw.bow) { P.shL = L(-0.2, -0.75, ready); P.elL = L(-0.75, -1.55, ready); P.twL = L(0, -1.35, ready); }
  else if (!sw.two && !sw.bow) { P.shL = L(P.shL * 0.8 + 0.08, -0.4, ready); P.elL = L(-0.3, -0.9, ready); }
  if (!dead) { P.wP += Math.sin(t * 1.1 + seed) * 0.025 * (1 - amt); P.wY += Math.sin(t * 0.8 + seed * 2) * 0.02 * (1 - amt); } // 剣先がわずかに揺れる
  if ((sw.two || GRIP_L[e.wpn]) && !dead) P.side -= 0.025; // 重い武器の反対へ少し傾く
  // ---- 攻撃：腰→肩→腕→武器の順に少しずつ遅れて動く ----
  if (e.anim > 0 && !dead) {
    const dur = e.animDur || sw.dur, k = clamp(1 - e.anim / dur, 0, 1), base = {};
    for (const key of KEYS) base[key] = P[key];
    sampleSwing(sw, clamp(k + 0.05, 0, 1), base, _sA); sampleSwing(sw, k, base, _sB); sampleSwing(sw, clamp(k - 0.05, 0, 1), base, _sC);
    for (const key of ['twist', 'lean', 'side', 'drop', 'lunge']) P[key] = _sA[key];
    for (const key of ['shR', 'shL', 'rollL', 'rollR', 'head']) P[key] = _sB[key];
    P.elR = L(_sB.elR, _sC.elR, 0.5); P.elL = L(_sB.elL, _sC.elL, 0.5);
    for (const key of ['wP', 'wY', 'wR']) P[key] = _sC[key];
  }
  // ---- 防御 ----
  if (e.blocking && !dead) {
    if (e.shieldKind) { P.shL = -0.95; P.elL = -1.6; P.twL = -1.45; P.lean += 0.08; }
    else { P.shR = -1.3; P.elR = -1.3; P.wP = -0.15; P.wY = 1.5; P.wR = 1.4; }
  }
  // ---- 被弾ののけぞり ----
  const hA = e.hitAge ?? 9;
  if (hA < 0.4 && !dead) { const k = (hA < 0.06 ? hA / 0.06 : 1 - sstep((hA - 0.06) / 0.34)) * 0.85, sd = (e.hitSide || 1);
    P.lean -= 0.32 * k; P.head -= 0.35 * k; P.twist += 0.22 * k * sd; P.lunge -= 0.1 * k; P.drop -= 0.03 * k; P.shL -= 0.3 * k; P.side += 0.06 * k * sd; }
  // ---- 盾で受けた：腕が押し戻され、上半身ごと衝撃を受ける ----
  const bA = e.blockAge ?? 9;
  if (bA < 0.4 && e.shieldKind && !dead) { const k = bA < 0.05 ? bA / 0.05 : 1 - sstep((bA - 0.05) / 0.35);
    P.shL = L(P.shL, -0.7, k); P.elL = L(P.elL, -1.85, k); P.twL = L(P.twL || 0, -1.45, Math.max(k, ready)); P.lean -= 0.18 * k; P.twist += 0.18 * k; P.lunge -= 0.07 * k; P.head -= 0.12 * k; }
  // ---- 騎乗 ----
  if (e.mounted && !dead && e._horse) { const h = e._horse, g = h.gait || 0, u = frac(h.cyc || 0);
    if (g === 1) P.drop += Math.abs(Math.sin(u * TAU * 2)) * 0.02;
    if (g === 2) { P.drop += Math.abs(Math.sin(u * TAU * 2)) * 0.06 - 0.02; P.lean += 0.06; }
    if (g === 3) { P.drop += Math.sin(u * TAU - 0.6) * 0.06 + 0.05; P.lean += 0.32; P.head -= 0.25; P.kneeR = P.kneeL = 1.65; P.hipR = P.hipL = -1.05; }
    P.cape = 0.1 + Math.abs(h.spd || 0) * 0.07;
  }
  // ---- 足を地面に固定（止まっているとき）：腰の前後移動は膝で吸収する ----
  if (!dead && !e.mounted && !e.air && amt < 1) {
    const w = 1 - amt, fR = ready ? -0.17 : -0.02, fL = ready ? 0.19 : 0.03, hy = HIP_Y + P.drop - 0.02 - 0.075;
    const [h1, k1] = legIK(-hy, fR - P.lunge, 0.49, 0.47), [h2, k2] = legIK(-hy, fL - P.lunge, 0.49, 0.47);
    P.hipR = L(P.hipR, h1 + P.lean * 0.0, w); P.kneeR = L(P.kneeR, k1, w); P.hipL = L(P.hipL, h2, w); P.kneeL = L(P.kneeL, k2, w);
    if (ready) { P.abdR += 0.05 * w; P.abdL += 0.05 * w; }
  }
  if (e.air && !dead) { P.hipR = -0.7; P.hipL = -0.3; P.kneeR = 1.1; P.kneeL = 0.8; }
  // ---- 死：膝から崩れて倒れる（4通り） ----
  if (dead) {
    const v = (e.id || 0) % 4, dt0 = e.deadT || 0, b = sstep(dt0 / 0.32), f = sstep((dt0 - 0.18) / 0.62);
    P.fallDir = v === 0 ? -1 : 1; P.fallSide = v === 2 ? 1 : 0;
    P.kneeR = L(0, 1.25, b) * (1 - f) + 0.15 * f; P.kneeL = L(0, v === 3 ? 1.6 : 1.1, b) * (1 - f) + 0.25 * f;
    P.hipR = L(0, -0.6, b) * (1 - f) + (v === 0 ? 0.05 : -0.15) * f; P.hipL = L(0, -0.4, b) * (1 - f) + 0.1 * f;
    P.drop = -0.32 * b * (1 - f); P.lean = (v === 0 ? -0.35 : 0.4) * b * (1 - f);
    P.shR = L(-0.5, v === 0 ? -2.6 : -0.3, f); P.shL = L(-0.3, v === 0 ? -2.4 : 0.2, f); P.rollR = -0.3 - 0.9 * f; P.rollL = 0.3 + 0.9 * f; P.elR = -0.4; P.elL = -0.3; P.twL = 0;
    P.head = v === 0 ? 0.3 * f : -0.3 * f; P.headY = (v - 1.5) * 0.4 * f; P.fall = f; P.wDrop = dt0 > 0.12; P.cape = 0.0;
  }
  P.twist += e.look || 0; if (!dead) P.head += e.headP || 0;
  P.bowLeft = !!sw.bow; P.two = !!sw.two || (GRIP_L[e.wpn] !== null && GRIP_L[e.wpn] !== undefined);
  P.cape = (P.cape || 0.05) + Math.sin(t * 2.1 + seed) * 0.03;
}

// ------------------------------------------------------------------
// 出力：パーツごとの行列。sided は [0]=右(鏡), [1]=左
// ------------------------------------------------------------------
export const SIDED = ['pauldron', 'uarm', 'couter', 'farm', 'hand', 'tasset', 'thigh', 'poleyn', 'shin', 'skirtF', 'skirtB'];
export const SINGLE = ['torso', 'head', 'cape'];
export function newOut() {
  const M = () => new THREE.Matrix4(), p = {};
  for (const k of SIDED) p[k] = [M(), M()]; for (const k of SINGLE) p[k] = [M()];
  return { p, root: M(), wpn: M(), shd: M(), hb: M(), hn: M(), hl: [M(), M(), M(), M(), M(), M(), M(), M()], hand: [new THREE.Vector3(), new THREE.Vector3()] };
}
const _t = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _w = new THREE.Vector3();
const MIRROR = new THREE.Matrix4().makeScale(-1, 1, 1);
const SHIELD_BASIS = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1); // 盾: 横=前腕の向き, 上=前腕の+z, 表=前腕の外側(+x)
const T = (m, x, y, z) => { _t.makeTranslation(x, y, z); return m.multiply(_t); };
const RX = (m, a) => { if (a) { _t.makeRotationX(a); m.multiply(_t); } return m; };
const RY = (m, a) => { if (a) { _t.makeRotationY(a); m.multiply(_t); } return m; };
const RZ = (m, a) => { if (a) { _t.makeRotationZ(a); m.multiply(_t); } return m; };
const ptOf = (m, x, y, z, v) => v.set(x, y, z).applyMatrix4(m);
const axisOf = (m, i, v) => { const e = m.elements; return v.set(e[i * 4], e[i * 4 + 1], e[i * 4 + 2]).normalize(); };
// 原点 o、-y が dir を向く行列（腕の骨）。ref で回転の向きを決める
function boneTo(m, o, dir, ref) { _y.copy(dir).multiplyScalar(-1).normalize(); _x.crossVectors(_y, ref).normalize(); if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0); _z.crossVectors(_x, _y); m.makeBasis(_x, _y, _z); m.setPosition(o); return m; }

// 人の姿勢。horse を渡すと騎乗（馬の姿勢も O に入る）。t は時刻（呼吸など）
export function computePose(e, P, O, horse, t = 0) {
  if (horse && e.mounted) { e._horse = horse; poseHorse(horse, O); } else e._horse = null;
  poseParams(e, P, t);
  const sc = e.scale || 1, dead = e.alive === false, p = O.p;
  if (horse && e.mounted) { O.root.copy(O.hb); T(O.root, 0, HORSE_JOINTS.saddleY + 0.03 - HIP_Y, -0.02); }
  else {
    O.root.makeTranslation(e.x, e.y, e.z); RY(O.root, e.face);
    if (dead) { const f = P.fall; T(O.root, 0, f * 0.14, 0); if (P.fallSide) RZ(O.root, f * Math.PI / 2 * 0.95); else RX(O.root, P.fallDir * f * Math.PI / 2 * 0.97); }
  }
  if (sc !== 1) O.root.scale(_s.set(sc, sc, sc));
  // 腰と胴
  const H = p.skirtB[0]; // 作業用に借りる（あとで上書き）
  H.copy(O.root); T(H, P.sway, HIP_Y + P.drop, P.lunge); RY(H, P.twist * 0.25);
  const tor = p.torso[0]; tor.copy(O.root); T(tor, P.sway, HIP_Y + P.drop, P.lunge); RY(tor, P.twist * 0.65); RZ(tor, P.side); RX(tor, P.lean);
  p.head[0].copy(tor); T(p.head[0], 0, 0.58, 0); RY(p.head[0], -P.twist * 0.35 + P.headY); RX(p.head[0], P.head);
  p.cape[0].copy(tor); T(p.cape[0], 0, 0.53, -0.12); RX(p.cape[0], -clamp(P.cape, 0, 1.1));
  // 脚
  const hip = [P.hipR, P.hipL], kn = [P.kneeR, P.kneeL], ab = [P.abdR, P.abdL];
  const legs = [];
  for (let i = 0; i < 2; i++) {
    const sx = i ? 0.1 : -0.1, sg = i ? 1 : -1, hh = dead ? 0 : hip[i], kk = dead ? 0.05 : kn[i];
    const th = p.thigh[i]; th.copy(H); T(th, sx, -0.02, 0); RZ(th, sg * ab[i]); RX(th, hh);
    p.tasset[i].copy(H); T(p.tasset[i], sx, -0.02, 0); RZ(p.tasset[i], sg * ab[i] * 0.5); RX(p.tasset[i], Math.min(0, hh) * 0.55 + Math.max(0, hh) * 0.15);
    p.skirtF[i].copy(H); T(p.skirtF[i], sx, -0.02, 0); RX(p.skirtF[i], Math.min(0, hh) * 0.8 + Math.max(0, hh) * 0.2);
    legs.push([th, kk, hh]);
  }
  for (let i = 0; i < 2; i++) { const [th, kk, hh] = legs[i];
    p.poleyn[i].copy(th); T(p.poleyn[i], 0, -0.49, 0); RX(p.poleyn[i], kk * 0.5);
    p.shin[i].copy(th); T(p.shin[i], 0, -0.49, 0); RX(p.shin[i], kk); }
  // 後ろの裾は歩くと遅れてなびく
  { const Hc = p.skirtB[0].clone(); for (let i = 0; i < 2; i++) { const hh = dead ? 0 : hip[i]; const m = p.skirtB[i]; m.copy(Hc); T(m, i ? 0.1 : -0.1, -0.02, 0); RX(m, Math.max(0, hh) * 0.75 + Math.min(0, hh) * 0.15 + clamp((e.spd || 0) * 0.04, 0, 0.35)); } }
  // 腕
  const sh = [P.shR, P.shL], el = [P.elR, P.elL], roll = [P.rollR, P.rollL], tw = [0, P.twL || 0];
  const shoulderW = O._sw || (O._sw = [new THREE.Vector3(), new THREE.Vector3()]);
  for (let i = 0; i < 2; i++) {
    const sx = i ? 0.215 : -0.215, a = dead ? -0.3 : sh[i], b = dead ? -0.2 : el[i];
    const ua = p.uarm[i]; ua.copy(tor); T(ua, sx, 0.5, 0); ptOf(ua, 0, 0, 0, shoulderW[i]);
    p.pauldron[i].copy(ua); RZ(p.pauldron[i], roll[i] * 0.45); RX(p.pauldron[i], clamp(a, -1.6, 0.6) * 0.3);
    RZ(ua, roll[i]); RX(ua, a); RY(ua, tw[i]);
    p.farm[i].copy(ua); T(p.farm[i], 0, -0.3, 0); RX(p.farm[i], b);
    p.couter[i].copy(ua); T(p.couter[i], 0, -0.3, 0); RX(p.couter[i], b * 0.5);
    ptOf(p.farm[i], 0, -0.28, 0, O.hand[i]); // 手首
  }
  // 武器：右手（弓は左手）で握る。手は武器の柄に合わせて向きを決め、柄が手のひらの中心を通る
  const yaw = (horse && e.mounted ? horse.face : e.face) + P.twist * 0.8;
  _q.setFromEuler(_e.set(P.wP, yaw + P.wY, P.wR, 'YXZ'));
  const hi = P.bowLeft ? 1 : 0, wrist = O.hand[hi];
  _z.set(0, 0, 1).applyQuaternion(_q); // 柄の軸
  ptOf(p.farm[hi], 0, 0, 0, _c); _w.subVectors(wrist, _c).normalize(); // 肘→手首
  _d.copy(_w).addScaledVector(_z, -_w.dot(_z)); if (_d.lengthSq() < 1e-4) _d.set(0, 1, 0); _d.normalize();
  _x.crossVectors(_d, _z).normalize(); const palm = _p.copy(wrist).addScaledVector(_d, 0.075);
  const hm = p.hand[hi]; hm.makeBasis(_x, _d, _z); hm.setPosition(palm); if (sc !== 1) hm.scale(_s.set(sc, sc, sc));
  if (P.wDrop) { _q.setFromEuler(_e.set(0, e.face + 1.1 + (e.id || 0) * 0.7, Math.PI / 2, 'YXZ')); O.wpn.compose(_c.set(palm.x, e.y + 0.04, palm.z), _q, _s.set(sc, sc, sc)); }
  else { O.wpn.makeBasis(_x, _d, _z); O.wpn.setPosition(palm); if (sc !== 1) O.wpn.scale(_s.set(sc, sc, sc)); } // 刃は拳の指関節の向き（手の +y）にそろえる
  // 両手武器：左手を柄の位置へ。腕は手の位置から逆算（IK）
  const gl = GRIP_L[e.wpn];
  if (P.two && gl !== null && gl !== undefined && !dead) {
    const target = new THREE.Vector3().copy(palm).addScaledVector(_z, gl * sc), S0 = shoulderW[1];
    _d.subVectors(target, S0); const dl = _d.length(); _d.normalize();
    const yL = new THREE.Vector3().copy(_d).addScaledVector(_z, -_d.dot(_z)).normalize(); const wristT = new THREE.Vector3().copy(target).addScaledVector(yL, -0.075 * sc);
    const Ls = 0.3 * sc, Lf = 0.28 * sc; _d.subVectors(wristT, S0); const d = clamp(_d.length(), 0.05, Ls + Lf - 0.003); _d.normalize();
    const ca = clamp((Ls * Ls + d * d - Lf * Lf) / (2 * Ls * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
    const fwd = axisOf(tor, 2, _x), down = axisOf(tor, 1, _y).multiplyScalar(-1), out = axisOf(tor, 0, _z);
    const pole = new THREE.Vector3().copy(down).addScaledVector(out, 0.6).addScaledVector(fwd, -0.3); pole.addScaledVector(_d, -pole.dot(_d)).normalize();
    const elbow = new THREE.Vector3().copy(S0).addScaledVector(_d, Ls * ca).addScaledVector(pole, Ls * sa);
    const refF = axisOf(tor, 2, new THREE.Vector3());
    boneTo(p.uarm[1], S0, elbow.clone().sub(S0), refF); if (sc !== 1) p.uarm[1].scale(_s.set(sc, sc, sc));
    const wt = wristT.clone(); boneTo(p.farm[1], elbow, wt.clone().sub(elbow), refF); if (sc !== 1) p.farm[1].scale(_s.set(sc, sc, sc));
    p.couter[1].copy(p.farm[1]); p.pauldron[1].copy(tor); T(p.pauldron[1], 0.215, 0.5, 0); RX(p.pauldron[1], -0.25);
    const zz = new THREE.Vector3(0, 0, 1).applyQuaternion(_q), yF = wt.clone().sub(elbow).normalize(); yF.addScaledVector(zz, -yF.dot(zz)).normalize(); // 前腕の向きに合わせる
    const xx = new THREE.Vector3().crossVectors(yF, zz).normalize();
    p.hand[1].makeBasis(xx, yF, zz); p.hand[1].setPosition(target); if (sc !== 1) p.hand[1].scale(_s.set(sc, sc, sc));
    O.hand[1].copy(wt);
  } else { // 空いている手：前腕の先で拳を作る
    const fi = 1 - hi; p.hand[fi].copy(p.farm[fi]); T(p.hand[fi], 0, -0.28 - 0.075, 0); RX(p.hand[fi], Math.PI); RY(p.hand[fi], fi ? 0 : 0);
  }
  // 盾：左の前腕にベルトで固定（前腕と一緒に動く）
  if (dead && P.fall > 0.6) { _q.setFromEuler(_e.set(-Math.PI / 2, yaw, 0, 'YXZ')); O.shd.compose(_c.set(O.hand[1].x, e.y + 0.05, O.hand[1].z), _q, _s.set(sc, sc, sc)); }
  else if (e.shieldKind === 'pavise' && !dead) { // 大楯：体の前に立てて構える（左手で支える）
    const fy = yaw - 0.1, bob = Math.sin((e.phase || 0) * 2) * 0.02 * Math.min(1, (e.spd || 0) / 3), fx = Math.sin(fy), fz = Math.cos(fy), lx = Math.cos(fy), lz = -Math.sin(fy);
    _q.setFromEuler(_e.set(-0.05, fy, 0, 'YXZ')); O.shd.compose(_c.set(e.x + (fx * 0.5 + lx * 0.12) * sc, e.y + 0.78 * sc + bob, e.z + (fz * 0.5 + lz * 0.12) * sc), _q, _s.set(sc, sc, sc)); }
  else { O.shd.copy(p.farm[1]); T(O.shd, 0.07, -0.15, -0.08); O.shd.multiply(SHIELD_BASIS); }
  // 右側のパーツは左用の形を鏡に映す
  for (const k of SIDED) p[k][0].multiply(MIRROR);
  return O;
}

// 将・プレイヤー用：個別メッシュで描く（細かい形状）
export class Rig {
  constructor(scene, mat, parts) {
    this.scene = scene; this.O = newOut(); this.P = newPose(); this.parts = parts;
    const mk = geo => { if (!geo) return null; const m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false; m.matrixWorldAutoUpdate = false; m.castShadow = true; m.receiveShadow = true; scene.add(m); return m; };
    this.meshes = {}; for (const k of SIDED) this.meshes[k] = [mk(parts[k]), mk(parts[k])]; for (const k of SINGLE) this.meshes[k] = [mk(parts[k])];
    this.meshes.wpn = mk(parts.weapon); this.meshes.shd = mk(parts.shield);
    this.meshes.hb = mk(parts.horse && parts.horse.body); this.meshes.hn = mk(parts.horse && parts.horse.neck);
    this.meshes.hl = parts.horse ? [0, 1, 2, 3, 4, 5, 6, 7].map(i => mk(i < 4 ? parts.horse.leg : parts.horse.legL)) : [];
  }
  set(m, mat, vis = true) { if (!m) return; m.visible = vis; if (vis) { m.matrix.copy(mat); m.matrixWorld.copy(mat); } }
  update(e, horse, opts = {}) {
    const O = this.O, M = this.meshes; computePose(e, this.P, O, horse, opts.t || 0);
    const body = !opts.hideBody;
    for (const k of SIDED) for (let i = 0; i < 2; i++) this.set(M[k][i], O.p[k][i], body);
    for (const k of SINGLE) this.set(M[k][0], O.p[k][0], body);
    this.set(M.wpn, O.wpn, body); this.set(M.shd, O.shd, body);
    if (horse) { if (!e.mounted) poseHorse(horse, O); this.set(M.hb, O.hb); this.set(M.hn, O.hn); for (let i = 0; i < 8; i++) this.set(M.hl[i], O.hl[i]); }
  }
  setVisible(v) { for (const m of Object.values(this.meshes).flat()) if (m) m.visible = v; }
  dispose() { for (const m of Object.values(this.meshes).flat()) if (m) this.scene.remove(m); }
}
