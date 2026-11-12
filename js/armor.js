// WARLORD — 鎧の造形（断面をつないだ板金）。写真: ref/gothic_*.jpg（ウォレスコレクション A21 ほか）
// 体の比率：骨盤 y=1.0、首 1.58、頭頂 ≈1.92（約7.5頭身）。肩の関節は胴の原点から (±0.215, 0.5)。
// パーツの座標（左側＝+x 側で作り、右側は鏡に映して使う）
//   torso  : 骨盤が原点、首の付け根 y=0.58
//   head   : 首の付け根が原点、頭の中心 y≈0.15
//   pauldron/uarm : 肩の関節が原点、肘 y=-0.3
//   couter : 肘が原点  /  farm : 肘が原点、手首 y=-0.28
//   hand   : 手のひらの中心が原点。握りの軸 = +z、手の甲 = +x、手首 = -y 方向 0.075
//   tasset : 腿の付け根が原点（腿と一緒に半分だけ動く）
//   thigh  : 股関節が原点、膝 y=-0.49  /  poleyn : 膝が原点  /  shin : 膝が原点、足首 y=-0.47
import * as THREE from 'three';
import { GB, makeCtx, X, loft, rim, rivet, ringPt, sph, box, tor, cyl, cone, tube, ext } from './models.js';

export const BODY = { HIP: 1.0, NECK: 0.58, SH_Y: 0.5, SH_X: 0.215, UARM: 0.3, FARM: 0.28, THIGH: 0.49, SHIN: 0.47, HIP_X: 0.1, WRIST: 0.075 };
const PI = Math.PI;
const fl = (n, a, w = 1.25, c = 0) => ({ n, a, w, c });
const gauss = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));

// ------------------------------------------------------------------ ゴシック式
function gothicTorso(gb, S, D) {
  const seg = D ? 112 : 20, sub = D ? 4 : 1;
  const breast = [
    { y: 0.09, rx: 0.15, zf: 0.118, zb: 0.106, ridge: 0.006 },
    { y: 0.17, rx: 0.156, zf: 0.134, zb: 0.106, ridge: 0.016, fl: fl(17, 0.020) },
    { y: 0.28, rx: 0.186, zf: 0.16, zb: 0.114, ridge: 0.021, fl: fl(13, 0.023) },
    { y: 0.38, rx: 0.205, zf: 0.162, zb: 0.124, ridge: 0.015, fl: fl(10, 0.020) },
    { y: 0.46, rx: 0.205, zf: 0.142, zb: 0.13, ridge: 0.006, fl: fl(9, 0.004) },
    { y: 0.53, rx: 0.165, zf: 0.104, zb: 0.112 },
    { y: 0.565, rx: 0.118, zf: 0.084, zb: 0.088 },
  ];
  gb.add(loft(breast, seg, { sub }), 'metal');
  gb.add(rim(breast[6], seg, 0.006), 'metal');
  // 背板の縦の稜線
  gb.add(tube([0.12, 0.25, 0.38, 0.5].map(y => { const s = breast.reduce((a, b) => Math.abs(b.y - y) < Math.abs(a.y - y) ? b : a); return ringPt({ ...s, y }, PI, 0.003); }), 0.005, S(12), 4), 'metal');
  // プラッカート（下腹当て）：上端が V 字に尖って胸の上に重なる
  const pk = [
    { y: 0.03, rx: 0.165, zf: 0.132, zb: 0.12 },
    { y: 0.15, rx: 0.165, zf: 0.146, zb: 0.12, ridge: 0.016, fl: fl(15, 0.020, 1.1) },
    { y: 0.33, rx: 0.192, zf: 0.17, zb: 0.12, ridge: 0.023, fl: fl(12, 0.022, 1.1), dy: tw => -Math.min(1, Math.abs(tw) / 1.15) * 0.2 },
  ];
  gb.add(loft(pk, D ? 64 : S(36), { t0: -1.3, t1: 1.3, out: 0.007, sub }), 'metal');
  gb.add(rim(pk[2], S(36), 0.0065, { t0: -1.3, t1: 1.3, out: 0.011 }), 'metal');
  for (const t of [-1.0, 1.0]) rivet(gb, { ...pk[0], y: 0.06 }, t, 'brass', 0.007);
  rivet(gb, { ...pk[2], dy: pk[2].dy }, 0, 'brass', 0.007);
  // 腰の草摺の上（フォールド）：3枚が少しずつ外へ重なる
  for (let i = 0; i < 3; i++) {
    const a = { y: 0.05 - i * 0.048, rx: 0.164 + i * 0.012, zf: 0.135 + i * 0.011, zb: 0.122 + i * 0.01 };
    const b = { y: -0.005 - i * 0.048, rx: 0.17 + i * 0.013, zf: 0.142 + i * 0.011, zb: 0.127 + i * 0.01 };
    gb.add(loft([b, a], seg, { out: 0.003 * i }), 'metal'); gb.add(rim(b, seg, 0.005, { out: 0.006 + 0.003 * i }), 'metal');
    if (D) for (const t of [PI / 2, -PI / 2]) rivet(gb, b, t, 'brass', 0.006);
  }
  // 革ベルトとバックル
  gb.add(rim({ y: 0.075, rx: 0.158, zf: 0.131, zb: 0.118 }, seg, 0.011, { out: 0.01, rs: 4 }), 'leather');
  { const [x, y, z] = ringPt({ y: 0.075, rx: 0.158, zf: 0.131, zb: 0.118 }, -0.45, 0.02); gb.add(X(box(0.032, 0.03, 0.008), [x, y, z], [0, -0.45, 0]), 'brass'); gb.add(X(box(0.022, 0.018, 0.01), [x, y, z], [0, -0.45, 0]), 'leatherD'); }
  // 鎖の腰巻
  gb.add(loft([{ y: -0.17, rx: 0.178, zf: 0.15, zb: 0.14 }, { y: -0.09, rx: 0.175, zf: 0.148, zb: 0.138 }], seg), 'mail');
  // 喉当て（ゴルゲット）2枚
  for (let i = 0; i < 2; i++) { const a = { y: 0.525 + i * 0.04, rx: 0.128 - i * 0.016, zf: 0.1 - i * 0.012, zb: 0.1 - i * 0.012 }, b = { y: 0.565 + i * 0.04, rx: 0.112 - i * 0.016, zf: 0.088 - i * 0.012, zb: 0.09 - i * 0.012 };
    gb.add(loft([a, b], S(40), { out: 0.004 }), 'metal'); gb.add(rim(b, S(40), 0.005, { out: 0.008 }), 'metal'); }
}
function salletHead(gb, S, D) {
  const seg = S(56), sub = D ? 3 : 1;
  const frontLift = (h, w) => tw => Math.max(0, 1 - Math.abs(tw) / w) ** 1.4 * h; // 前だけ縁を持ち上げて覗き穴をあける
  const sk = [
    { y: 0.035, rx: 0.152, zf: 0.15, zb: 0.27, z0: -0.05, dy: frontLift(0.09, 1.3) },
    { y: 0.075, rx: 0.151, zf: 0.152, zb: 0.215, z0: -0.03, dy: frontLift(0.055, 1.3) },
    { y: 0.145, rx: 0.148, zf: 0.15, zb: 0.165, z0: -0.012 },
    { y: 0.225, rx: 0.134, zf: 0.136, zb: 0.143 },
    { y: 0.29, rx: 0.097, zf: 0.098, zb: 0.104 },
    { y: 0.322, rx: 0.04, zf: 0.04, zb: 0.045 },
  ];
  gb.add(loft(sk, seg, { sub, capTop: true }), 'metal');
  gb.add(rim(sk[0], seg, 0.0065), 'metal');
  gb.add(tube([ringPt(sk[2], 0, 0.002), ringPt(sk[3], 0, 0.002), ringPt(sk[4], 0, 0.002), [0, 0.325, 0], ringPt(sk[4], PI, 0.002), ringPt(sk[3], PI, 0.002), ringPt(sk[2], PI, 0.002)], 0.006, S(20), 4), 'metal'); // 頂部の稜（前から後ろへ）
  if (D) for (let k = -3; k <= 3; k++) rivet(gb, { ...sk[1], dy: null, y: 0.165 }, k * 0.32, 'metal', 0.005);
  // 中の暗がり（覗き穴の奥）
  gb.add(X(sph(0.125, S(16), S(10)), [0, 0.15, -0.005], [0, 0, 0], [1, 1, 1.05]), 'slit');
  // ベヴォア（顎当て）
  const bv = [{ y: -0.04, rx: 0.105, zf: 0.105, zb: 0.1 }, { y: 0.05, rx: 0.134, zf: 0.15, zb: 0.12, ridge: 0.01 }, { y: 0.14, rx: 0.144, zf: 0.162, zb: 0.13, ridge: 0.006 }];
  gb.add(loft(bv, S(40), { t0: -1.75, t1: 1.75, sub }), 'metal'); gb.add(rim(bv[2], S(40), 0.006, { t0: -1.75, t1: 1.75 }), 'metal');
  for (const t of [-1.5, 1.5]) rivet(gb, bv[1], t, 'brass', 0.007);
}
function gothicPauldron(gb, S, D) { // 左肩（外側=+x）。帽子＋3枚の重なり板
  const seg = S(36), c = PI / 2, t0 = c - 1.95, t1 = c + 1.95, sub = D ? 3 : 1;
  const cap = [
    { y: -0.04, rx: 0.12, zf: 0.12, zb: 0.12, x0: 0.01, fl: fl(16, 0.005, 1.6, c) },
    { y: 0.02, rx: 0.115, zf: 0.115, zb: 0.115, x0: 0.005, fl: fl(16, 0.005, 1.6, c) },
    { y: 0.065, rx: 0.088, zf: 0.09, zb: 0.09, fl: fl(14, 0.004, 1.6, c) },
    { y: 0.095, rx: 0.035, zf: 0.04, zb: 0.04, x0: -0.01 },
  ];
  gb.add(loft(cap, seg, { t0, t1, sub }), 'metal'); gb.add(rim(cap[0], seg, 0.0055, { t0, t1 }), 'metal');
  for (let i = 0; i < 3; i++) { const r = 0.117 - i * 0.008, a = { y: -0.03 - i * 0.04, rx: r, zf: r, zb: r, x0: 0.008 }, b = { y: -0.075 - i * 0.04, rx: r - 0.004, zf: r - 0.004, zb: r - 0.004, x0: 0.008 };
    gb.add(loft([b, a], seg, { t0: c - 1.6, t1: c + 1.6, out: 0.003 }), 'metal'); gb.add(rim(b, seg, 0.005, { t0: c - 1.6, t1: c + 1.6, out: 0.007 }), 'metal');
    if (D) rivet(gb, a, c, 'brass', 0.006); }
}
function plainRerebrace(gb, S, D) {
  const s = [{ y: -0.05, rx: 0.062, zf: 0.064, zb: 0.06 }, { y: -0.15, rx: 0.06, zf: 0.066, zb: 0.058 }, { y: -0.25, rx: 0.054, zf: 0.056, zb: 0.054 }];
  gb.add(loft(s, S(24), { sub: D ? 2 : 1 }), 'metal'); gb.add(rim(s[0], S(24), 0.005), 'metal'); gb.add(rim(s[2], S(24), 0.005), 'metal');
}
function fan(gb, S, D, r, n, mat = 'metal') { // 肘当て・膝当ての扇形の翼（外側 +x 向き）
  const g = sph(r, S(16), S(6), 0, PI * 2, 0, PI * 0.38); g.rotateZ(-PI / 2); g.scale(0.35, 1, 1); gb.add(g, mat);
  if (D) for (let k = 0; k < n; k++) { const a = (k / n) * PI * 2; gb.add(tube([[0.0, 0, 0], [Math.sin(PI * 0.38) * r * 0.35 * 0.2, Math.sin(a) * r * 0.9, Math.cos(a) * r * 0.9]], 0.003, 2, 3), 'metalD'); }
  gb.add(X(tor(r * 0.93, 0.004, 3, S(20)), [Math.cos(PI * 0.38) * 0 + r * 0.33 * 0.35, 0, 0], [0, PI / 2, 0]), mat);
}
function gothicCouter(gb, S, D) {
  const s = [{ y: -0.065, rx: 0.052, zf: 0.055, zb: 0.055 }, { y: 0, rx: 0.066, zf: 0.06, zb: 0.075, bump: tw => 0.035 * gauss(Math.abs(tw), PI, 0.32) }, { y: 0.065, rx: 0.055, zf: 0.056, zb: 0.058 }];
  gb.add(loft(s, S(28), { sub: D ? 3 : 1 }), 'metal'); gb.add(rim(s[0], S(28), 0.005), 'metal'); gb.add(rim(s[2], S(28), 0.005), 'metal');
  gb.add(X((() => { const g = new GB(gb.ctx); fan(g, S, D, 0.085, 10); return g.build(); })(), [0.06, 0.0, -0.01]), 'metal');
}
function gothicVambrace(gb, S, D) {
  const s = [{ y: -0.05, rx: 0.052, zf: 0.054, zb: 0.054 }, { y: -0.12, rx: 0.05, zf: 0.05, zb: 0.052 }, { y: -0.27, rx: 0.039, zf: 0.038, zb: 0.04 }];
  gb.add(loft(s, S(24), { sub: D ? 2 : 1 }), 'metal'); gb.add(rim(s[2], S(24), 0.0045), 'metal');
  if (D) gb.add(tube([ringPt(s[0], PI / 2, 0.002), ringPt(s[1], PI / 2, 0.002), ringPt(s[2], PI / 2, 0.002)], 0.003, 8, 3), 'metal');
}
export function gauntlet(gb, S, D, kind = 'gothic', mat = 'metal') { // 握り手（柄の軸 +z が手のひらの中心を通る）
  const leather = kind === 'glove' || kind === 'mail';
  // 手の甲の板
  const hb = [{ y: -0.065, rx: 0.04, zf: 0.034, zb: 0.032, x0: 0.004 }, { y: -0.025, rx: 0.046, zf: 0.045, zb: 0.04, x0: 0.012 }, { y: 0.008, rx: 0.044, zf: 0.048, zb: 0.044, x0: 0.016 }];
  gb.add(loft(hb, S(20), { t0: 0.15, t1: PI - 0.15 }), leather ? 'leatherD' : mat);
  if (!leather) gb.add(rim(hb[2], S(20), 0.004, { t0: 0.15, t1: PI - 0.15 }), mat);
  // 指：握りの軸を巻く弧を4本（内側は革の手袋、外側に板）。ミトンは1枚の板でまとめる
  for (let i = 0; i < 4; i++) { const z = -0.03 + i * 0.02;
    gb.add(X(tor(0.027, 0.0095, 5, S(14), PI * 1.25), [0.004, 0.0, z], [0, 0, -0.15]), kind === 'mail' ? 'mail' : 'leatherD');
    if (!leather && kind !== 'mitten' && kind !== 'mail') gb.add(X(tor(0.031, 0.0065, 4, S(12), PI * 0.95), [0.004, 0.0, z], [0, 0, -0.05]), mat); }
  if (kind === 'mitten') for (let i = 0; i < 3; i++) gb.add(X(cyl(0.036 - i * 0.002, 0.036 - i * 0.002, 0.085, S(14), true, PI * 1.5 + 0.1, PI * 0.95), [0.004, 0.0, 0.0], [PI / 2, 0, 0.35 + i * 0.32]), mat);
  // 親指
  gb.add(X(tor(0.022, 0.009, 5, S(10), PI * 0.9), [-0.006, -0.012, 0.044], [0.25, 0.35, PI * 0.95]), leather ? 'leatherD' : mat);
  gb.add(X(box(0.018, 0.04, 0.07), [-0.024, -0.02, 0.0]), 'leatherD'); // 手のひら
}
function gothicCuisse(gb, S, D) {
  const w = 2.15, sub = D ? 3 : 1;
  const s = [{ y: -0.03, rx: 0.1, zf: 0.104, zb: 0.09 }, { y: -0.18, rx: 0.092, zf: 0.104, zb: 0.086, fl: fl(9, 0.004, 0.75) }, { y: -0.33, rx: 0.08, zf: 0.088, zb: 0.075, fl: fl(9, 0.004, 0.75) }, { y: -0.43, rx: 0.07, zf: 0.074, zb: 0.066 }];
  gb.add(loft(s, S(32), { t0: -w, t1: w, sub }), 'metal');
  for (const e of [s[0], s[3]]) gb.add(rim(e, S(32), 0.005, { t0: -w, t1: w }), 'metal');
  for (const t of [-w, w]) gb.add(tube(s.map(q => ringPt(q, t, 0.003)), 0.0045, S(10), 3), 'metal');
  gb.add(loft(s.map(q => ({ ...q, rx: q.rx - 0.008, zf: q.zf - 0.01, zb: q.zb - 0.004, fl: null })), S(20)), 'clothD'); // 裏の脚衣
  for (const y of [-0.12, -0.34]) { const q = s.reduce((a, b) => Math.abs(b.y - y) < Math.abs(a.y - y) ? b : a); gb.add(rim({ ...q, y }, S(16), 0.007, { t0: w - 0.1, t1: 2 * PI - w + 0.1, out: 0.004 }), 'leather'); }
}
function gothicPoleyn(gb, S, D) {
  const s = [{ y: -0.07, rx: 0.066, zf: 0.07, zb: 0.05 }, { y: 0, rx: 0.075, zf: 0.088, zb: 0.05, ridge: 0.012 }, { y: 0.07, rx: 0.068, zf: 0.072, zb: 0.05 }];
  gb.add(loft(s, S(28), { t0: -1.75, t1: 1.75, sub: D ? 3 : 1 }), 'metal');
  for (const e of [s[0], s[2]]) gb.add(rim(e, S(28), 0.005, { t0: -1.75, t1: 1.75 }), 'metal');
  gb.add(X((() => { const g = new GB(gb.ctx); fan(g, S, D, 0.075, 9); return g.build(); })(), [0.07, 0.0, 0.0]), 'metal');
  for (const yy of [0.1, -0.1]) { const a = { y: yy, rx: 0.07, zf: 0.078, zb: 0.05 }, b = { y: yy + (yy > 0 ? -0.035 : 0.035), rx: 0.072, zf: 0.08, zb: 0.05 }; gb.add(loft([a, b], S(24), { t0: -1.5, t1: 1.5, out: -0.002 }), 'metal'); gb.add(rim(a, S(24), 0.004, { t0: -1.5, t1: 1.5 }), 'metal'); }
}
function gothicGreave(gb, S, D, sab = 'poulaine') {
  const s = [{ y: -0.05, rx: 0.062, zf: 0.06, zb: 0.062 }, { y: -0.16, rx: 0.062, zf: 0.062, zb: 0.08, ridge: 0.006 }, { y: -0.3, rx: 0.053, zf: 0.056, zb: 0.062, ridge: 0.006 }, { y: -0.43, rx: 0.042, zf: 0.046, zb: 0.045 }];
  gb.add(loft(s, S(28), { sub: D ? 3 : 1 }), 'metal'); gb.add(rim(s[0], S(28), 0.005), 'metal'); gb.add(rim(s[3], S(28), 0.0045), 'metal');
  if (D) for (const t of [PI / 2, -PI / 2]) gb.add(tube(s.map(q => ringPt(q, t, 0.002)), 0.003, 8, 3), 'metal'); // 蝶番の線
  sabaton(gb, S, D, sab);
}
export function sabaton(gb, S, D, kind) { // 鉄靴：足の甲に板が段々に重なる。loft の y が前後、zf が下、zb が上
  const toe = kind === 'poulaine' ? 0.42 : kind === 'poulaineS' ? 0.27 : kind === 'bearpaw' ? 0.2 : 0.2;
  const wTip = kind === 'bearpaw' ? 0.06 : kind === 'normal' ? 0.035 : 0.006;
  const sec = [{ y: -0.075, rx: 0.042, zf: 0.035, zb: 0.035 }, { y: -0.02, rx: 0.048, zf: 0.035, zb: 0.055 }];
  const nL = 5; for (let i = 0; i < nL; i++) { const y = 0.0 + i * 0.03, k = i / nL; sec.push({ y, rx: 0.05 - k * 0.004 + 0.003, zf: 0.034, zb: 0.05 - k * 0.012 + 0.004 }); sec.push({ y: y + 0.0001, rx: 0.05 - k * 0.004, zf: 0.034, zb: 0.05 - k * 0.012 }); }
  sec.push({ y: 0.17, rx: kind === 'bearpaw' ? 0.06 : 0.044, zf: 0.03, zb: 0.03 });
  if (toe > 0.2) { sec.push({ y: 0.25, rx: kind === 'poulaine' ? 0.026 : 0.02, zf: 0.018, zb: 0.016 }); sec.push({ y: toe, rx: wTip, zf: 0.004, zb: 0.004 }); }
  else sec.push({ y: toe, rx: wTip, zf: 0.02, zb: 0.012 });
  const g = loft(sec, S(20), {}); X(g, [0, -0.47 - 0.04, 0.0], [PI / 2, 0, 0]); gb.add(g, 'metal');
  gb.add(X(box(0.085, 0.012, toe * 0.75 + 0.08), [0, -0.475 - 0.066, toe * 0.3]), 'leatherD'); // 靴底
}
function gothicTasset(gb, S, D) { // 左腿の前外側に下がる2枚
  const c = 0.55;
  for (let i = 0; i < 2; i++) { const a = { y: -0.04 - i * 0.075, rx: 0.13 + i * 0.006, zf: 0.135 + i * 0.006, zb: 0.12 }, b = { y: -0.12 - i * 0.075, rx: 0.132 + i * 0.006, zf: 0.138 + i * 0.006, zb: 0.12, dy: i === 1 ? (tw => -0.04 * gauss(tw, c, 0.4)) : null };
    gb.add(loft([b, a], S(20), { t0: c - 1.05, t1: c + 1.05, out: 0.004 * i, sub: D ? 2 : 1 }), 'metal'); gb.add(rim(b, S(20), 0.005, { t0: c - 1.05, t1: c + 1.05, out: 0.006 + 0.004 * i }), 'metal');
    if (D) rivet(gb, a, c, 'brass', 0.006); }
  gb.add(X(box(0.02, 0.06, 0.006), [0.06, -0.01, 0.125]), 'leather');
}

// ------------------------------------------------------------------ 共通の部品（他の7種で使う）
const ring = (y, rx, zf, zb, o = {}) => ({ y, rx, zf, zb, ...o });
function plateBreast(gb, S, D, o = {}) {
  const seg = D ? 112 : 20, sub = D ? 4 : 1, g = o.globose ? 0.012 : 0, F = o.flute;
  const f = (n, a) => F === 'fine' ? fl(n, a, 2.6) : null;
  const B = [ring(0.09, 0.15, 0.118, 0.106, { ridge: 0.004 }), ring(0.17, 0.156, 0.134 + g, 0.106, { ridge: o.ridge ?? 0.012, fl: f(30, 0.012) }), ring(0.28, 0.186, 0.162 + g * 1.4, 0.114, { ridge: o.ridge ?? 0.014, fl: f(26, 0.013) }),
    ring(0.38, 0.205, 0.162 + g, 0.124, { ridge: (o.ridge ?? 0.012) * 0.7, fl: f(22, 0.012) }), ring(0.46, 0.205, 0.142, 0.13, { fl: f(20, 0.008) }), ring(0.53, 0.165, 0.104, 0.112), ring(0.565, 0.118, 0.084, 0.088)];
  gb.add(loft(B, seg, { sub }), 'metal'); gb.add(rim(B[6], seg, o.rope ? 0.009 : 0.006), o.rope ? 'metalD' : 'trim');
  if (o.trim) for (const y of [0.2, 0.42]) gb.add(rim({ ...B[y < 0.3 ? 2 : 3], y, fl: null }, seg, 0.004, { t0: -0.9, t1: 0.9, out: 0.006 }), 'gold');
  if (o.plackart === 'round') { // ミラノ式：上が丸い補強板と革ベルト
    const P = [ring(0.03, 0.165, 0.134, 0.12), ring(0.15, 0.166, 0.15 + g, 0.12), ring(0.27, 0.18, 0.168 + g, 0.12, { dy: tw => -((Math.abs(tw) / 1.25) ** 2) * 0.1 })];
    gb.add(loft(P, D ? 64 : S(36), { t0: -1.25, t1: 1.25, out: 0.007, sub }), 'metal'); gb.add(rim(P[2], D ? 64 : S(36), 0.006, { t0: -1.25, t1: 1.25, out: 0.011 }), 'metal');
    const [x, y, z] = ringPt(P[2], 0, 0.016); gb.add(X(box(0.032, 0.17, 0.008), [x, y + 0.06, z - 0.004], [-0.25, 0, 0]), 'leatherL'); gb.add(X(box(0.036, 0.03, 0.01), [x, y + 0.0, z + 0.004]), 'brass');
  }
}
function faulds(gb, S, D, o = {}) {
  const seg = D ? 80 : S(48), n = o.n || 3, fla = o.flare || 0.013;
  for (let i = 0; i < n; i++) {
    const a = ring(0.05 - i * 0.048, 0.164 + i * fla, 0.135 + i * fla * 0.9, 0.122 + i * fla * 0.8), b = ring(-0.005 - i * 0.048, 0.17 + i * fla + fla * 0.4, 0.142 + i * fla * 0.9 + fla * 0.3, 0.127 + i * fla * 0.8,
      { fl: o.fluted ? fl(44, 0.006, PI) : null, dy: o.scallop ? (tw => -0.012 * Math.abs(Math.sin(tw * 4))) : null });
    gb.add(loft([b, { ...a, fl: o.fluted ? fl(44, 0.004, PI) : null }], seg, { out: 0.003 * i }), 'metal'); gb.add(rim(b, seg, o.rope ? 0.008 : 0.005, { out: 0.006 + 0.003 * i }), o.rope ? 'metalD' : 'trim');
  }
}
function gorget(gb, S, D, o = {}) { for (let i = 0; i < 2; i++) { const a = ring(0.525 + i * 0.04, 0.128 - i * 0.016, 0.1 - i * 0.012, 0.1 - i * 0.012), b = ring(0.565 + i * 0.04, 0.112 - i * 0.016, 0.088 - i * 0.012, 0.09 - i * 0.012);
  gb.add(loft([a, b], S(40), { out: 0.004 }), 'metal'); gb.add(rim(b, S(40), o.rope ? 0.008 : 0.005, { out: 0.008 }), o.rope ? 'metalD' : 'trim'); } }
function beltAt(gb, S, y, r = 0.158, mat = 'leather', buckle = 'brass') { const q = ring(y, r, r * 0.83, r * 0.75); gb.add(rim(q, S(48), 0.011, { out: 0.01, rs: 4 }), mat);
  const [x, yy, z] = ringPt(q, -0.45, 0.02); gb.add(X(box(0.032, 0.03, 0.008), [x, yy, z], [0, -0.45, 0]), buckle); }
function mailTube(gb, S, y0, y1, r0, r1, mat = 'mail', o = {}) { gb.add(loft([ring(y0, r0, r0 * 0.9, r0 * 0.85, o), ring(y1, r1, r1 * 0.9, r1 * 0.85, o)], S(o.seg || 40), o.win || {}), mat); }
function bodyCore(gb, S, D, mat, o = {}) { // 鎧の下の胴（鎖や布）
  const B = [ring(0.0, 0.16, 0.13, 0.12), ring(0.14, 0.158, 0.135, 0.11), ring(0.3, 0.192, 0.152, 0.12), ring(0.45, 0.2, 0.135, 0.128), ring(0.53, 0.16, 0.1, 0.11), ring(0.6, 0.085, 0.075, 0.075)];
  gb.add(loft(B.map(b => ({ ...b, rx: b.rx + (o.pad || 0), zf: b.zf + (o.pad || 0), zb: b.zb + (o.pad || 0) })), D ? 64 : S(40), { sub: D ? 2 : 1 }), mat);
  if (o.quilt) for (let i = 0; i < 7; i++) gb.add(rim({ ...B[Math.min(4, Math.floor(i / 1.5))], y: 0.05 + i * 0.065, rx: 0.166 + (o.pad || 0) + Math.sin(i / 7 * PI) * 0.03, zf: 0.14 + (o.pad || 0) + Math.sin(i / 7 * PI) * 0.02 }, S(40), 0.004, { out: 0.002 }), o.quilt);
}
// 兜
function face(gb, S) { gb.add(X(sph(0.1, S(14), S(12)), [0, 0.135, 0.014], [0, 0, 0], [0.88, 1.1, 0.98]), 'skin'); gb.add(X(sph(0.042, S(10), S(8)), [0, 0.03, 0.0]), 'skin'); }
function mailCoif(gb, S, D, open = true) { const w = open ? { t0: 0.75, t1: 2 * PI - 0.75 } : {}; gb.add(loft([ring(-0.06, 0.2, 0.18, 0.2), ring(0.03, 0.12, 0.11, 0.12), ring(0.15, 0.135, 0.13, 0.14), ring(0.26, 0.11, 0.1, 0.11), ring(0.3, 0.04, 0.04, 0.04)], S(36), { ...w, sub: D ? 2 : 1 }), 'mail'); }
function armetHead(gb, S, D, o = {}) {
  const seg = D ? 72 : S(48), sub = D ? 3 : 1, F = o.fluted ? fl(26, 0.006, PI) : null;
  const K = [ring(-0.01, 0.125, 0.15, 0.135), ring(0.06, 0.142, 0.17, 0.15, { fl: F }), ring(0.15, 0.15, 0.165, 0.155, { fl: F }), ring(0.24, 0.135, 0.145, 0.142, { fl: F }), ring(0.3, 0.09, 0.095, 0.095), ring(0.33, 0.03, 0.03, 0.03)];
  gb.add(loft(K, seg, { sub, capTop: true }), 'metal'); gb.add(rim(K[0], seg, o.rope ? 0.009 : 0.006), o.rope ? 'metalD' : 'trim');
  gb.add(tube([ringPt(K[1], 0, 0.004), ringPt(K[2], 0, 0.006), ringPt(K[3], 0, 0.004), [0, 0.34, 0], ringPt(K[3], PI, 0.004), ringPt(K[2], PI, 0.004)], 0.008, S(20), 4), 'metal'); // 鶏冠
  if (o.bellows) { for (let i = 0; i < 4; i++) { const y = 0.19 - i * 0.04, q = ring(y, 0.152, 0.18 - i * 0.004, 0.15); gb.add(loft([{ ...q, y: y - 0.018 }, { ...q, y: y + 0.018, zf: q.zf - 0.012 }], S(30), { t0: -1.2, t1: 1.2, out: 0.012 }), 'metal');
    if (i < 3) gb.add(loft([{ ...q, y: y - 0.03 }, { ...q, y: y - 0.019 }], S(24), { t0: -0.9, t1: 0.9, out: 0.006 }), 'slit'); } }
  else { const V = [ring(0.1, 0.15, 0.19, 0.14, { ridge: 0.03, ridgeW: 0.25 }), ring(0.2, 0.152, 0.185, 0.14, { ridge: 0.02 })]; gb.add(loft(V, S(30), { t0: -1.25, t1: 1.25, out: 0.008 }), 'metal'); gb.add(rim(V[1], S(30), 0.005, { t0: -1.25, t1: 1.25, out: 0.012 }), o.gold ? 'gold' : 'metal');
    for (const sx of [-1, 1]) gb.add(X(box(0.06, 0.009, 0.02), [sx * 0.045, 0.215, 0.175], [0, sx * 0.4, 0]), 'slit'); }
  gb.add(X(sph(0.125, S(16), S(10)), [0, 0.15, 0], [0, 0, 0], [1, 1, 1.05]), 'slit');
  if (o.rondel) gb.add(X(cyl(0.04, 0.04, 0.008, S(16)), [0, 0.03, -0.155], [PI / 2 - 0.3, 0, 0]), 'metal');
  if (o.plume) for (let k = 0; k < 5; k++) gb.add(X(sph(1, 8, 6), [0, 0.335 + k * 0.008, -0.05 - k * 0.045], [-0.7 - k * 0.13, (k - 2) * 0.12, 0], [0.032, 0.028, 0.16]), k % 2 ? 'cloth' : 'white');
}
function barbuteHead(gb, S, D) {
  const seg = D ? 72 : S(48);
  const K = [ring(-0.05, 0.132, 0.15, 0.15), ring(0.03, 0.148, 0.162, 0.16), ring(0.14, 0.152, 0.16, 0.165), ring(0.24, 0.13, 0.135, 0.14), ring(0.3, 0.075, 0.08, 0.085), ring(0.335, 0.012, 0.012, 0.012)];
  gb.add(loft(K, seg, { sub: D ? 3 : 1, capTop: true }), 'metal'); gb.add(rim(K[0], seg, 0.006), 'metal');
  gb.add(loft([ring(0.155, 0.153, 0.163, 0.16), ring(0.19, 0.152, 0.161, 0.16)], S(20), { t0: -0.62, t1: 0.62, out: 0.002 }), 'slit'); // T の横
  gb.add(loft([ring(-0.05, 0.133, 0.152, 0.15), ring(0.16, 0.153, 0.163, 0.16)], S(10), { t0: -0.22, t1: 0.22, out: 0.002 }), 'slit'); // T の縦
  gb.add(X(sph(0.125, S(16), S(10)), [0, 0.14, 0], [0, 0, 0], [1, 1.1, 1.05]), 'slit');
}
function greatHelm(gb, S, D) {
  const seg = D ? 64 : S(40);
  const K = [ring(-0.02, 0.142, 0.15, 0.15), ring(0.12, 0.146, 0.156, 0.152), ring(0.25, 0.144, 0.152, 0.15), ring(0.28, 0.12, 0.125, 0.125), ring(0.3, 0.02, 0.02, 0.02)];
  gb.add(loft(K, seg, { capTop: true }), 'metal'); gb.add(rim(K[0], seg, 0.006), 'metal'); gb.add(rim(K[2], seg, 0.005), 'metal');
  gb.add(X(box(0.042, 0.26, 0.012), [0, 0.11, 0.162]), 'gold'); gb.add(X(box(0.27, 0.038, 0.012), [0, 0.168, 0.159], [0, 0, 0]), 'gold');
  for (const sx of [-1, 1]) { gb.add(X(box(0.07, 0.012, 0.03), [sx * 0.068, 0.168, 0.157]), 'slit'); for (let k = 0; k < 3; k++) gb.add(X(box(0.032, 0.007, 0.03), [sx * 0.075, 0.095 - k * 0.028, 0.152]), 'slit'); }
  if (D) for (let k = 0; k < 6; k++) { gb.add(X(sph(0.006, 6, 4), [0, 0.0 + k * 0.045, 0.169]), 'gold'); }
  gb.add(X(sph(0.125, S(16), S(10)), [0, 0.13, 0]), 'slit');
}
function nasalHelm(gb, S, D) {
  face(gb, S); mailCoif(gb, S, D, true);
  const K = [ring(0.14, 0.14, 0.15, 0.15), ring(0.2, 0.128, 0.138, 0.138), ring(0.27, 0.09, 0.095, 0.095), ring(0.33, 0.035, 0.035, 0.035), ring(0.355, 0.004, 0.004, 0.004)];
  gb.add(loft(K, S(40), { sub: D ? 2 : 1 }), 'metalD');
  gb.add(loft([ring(0.135, 0.143, 0.153, 0.153), ring(0.165, 0.142, 0.152, 0.152)], S(40), { out: 0.003 }), 'metal'); // 額の帯
  for (let k = 0; k < 4; k++) { const t = k * PI / 2 + PI / 4; gb.add(tube(K.slice(0, 4).map(q => ringPt(q, t, 0.003)), 0.009, 8, 3), 'metal'); }
  gb.add(X(box(0.03, 0.105, 0.01), [0, 0.095, 0.158], [-0.08, 0, 0]), 'metal');
}
function hounskullHead(gb, S, D) {
  const seg = D ? 64 : S(40);
  const K = [ring(0.02, 0.143, 0.15, 0.16, { z0: -0.01 }), ring(0.1, 0.143, 0.148, 0.16, { z0: -0.015 }), ring(0.18, 0.133, 0.13, 0.155, { z0: -0.025 }), ring(0.26, 0.095, 0.085, 0.12, { z0: -0.04 }), ring(0.33, 0.035, 0.03, 0.045, { z0: -0.06 }), ring(0.37, 0.004, 0.004, 0.004, { z0: -0.075 })];
  gb.add(loft(K, seg, { sub: D ? 3 : 1 }), 'metal');
  // 豚鼻の面頬：断面が前へ尖る
  const V = [ring(0.02, 0.13, 0.17, 0.05, { ridge: 0.09, ridgeW: 0.35 }), ring(0.1, 0.14, 0.18, 0.05, { ridge: 0.12, ridgeW: 0.3 }), ring(0.18, 0.138, 0.165, 0.05, { ridge: 0.05, ridgeW: 0.3 }), ring(0.22, 0.13, 0.14, 0.05)];
  gb.add(loft(V, S(32), { t0: -1.5, t1: 1.5, sub: D ? 2 : 1 }), 'metal'); gb.add(rim(V[3], S(32), 0.005, { t0: -1.5, t1: 1.5 }), 'metal');
  for (const sx of [-1, 1]) { gb.add(X(box(0.075, 0.01, 0.06), [sx * 0.05, 0.19, 0.155], [0.2, sx * 0.45, 0]), 'slit'); for (let k = 0; k < 2; k++) gb.add(X(box(0.03, 0.006, 0.05), [sx * 0.055, 0.1 - k * 0.03, 0.2 - k * 0.01], [0, sx * 0.6, 0]), 'slit'); }
  gb.add(loft([ring(-0.12, 0.25, 0.2, 0.22), ring(-0.02, 0.17, 0.15, 0.16), ring(0.04, 0.145, 0.14, 0.155)], S(40)), 'mail'); // アヴェンテイル
  gb.add(rim(K[0], seg, 0.007, { out: 0.006 }), 'brass');
  gb.add(X(sph(0.12, S(14), S(10)), [0, 0.14, 0.0]), 'slit');
}
function kettleHat(gb, S, D) {
  face(gb, S); mailCoif(gb, S, D, true);
  const K = [ring(0.16, 0.145, 0.15, 0.15), ring(0.24, 0.13, 0.135, 0.135), ring(0.3, 0.085, 0.09, 0.09), ring(0.325, 0.02, 0.02, 0.02)];
  gb.add(loft(K, S(40), { sub: D ? 2 : 1 }), 'metal');
  const Bm = [ring(0.165, 0.15, 0.155, 0.155), ring(0.135, 0.26, 0.26, 0.26)]; gb.add(loft(Bm, S(48)), 'metal'); gb.add(rim(Bm[1], S(48), 0.006), 'metal');
  gb.add(tube([ringPt(K[0], 0, 0.004), ringPt(K[1], 0, 0.004), [0, 0.33, 0], ringPt(K[1], PI, 0.004), ringPt(K[0], PI, 0.004)], 0.007, 12, 3), 'metal');
}
// 腕
function pauldronPlate(gb, S, D, o = {}) {
  const seg = S(36), c = PI / 2, r = o.r || 0.115, wid = o.big ? 2.2 : 1.95, F = o.fluted ? fl(18, 0.006, 1.6, c) : null;
  const cap = [ring(-0.04, r + 0.005, r + 0.005, r + 0.005, { x0: 0.01, fl: F }), ring(0.02, r, r, r, { x0: 0.005, fl: F }), ring(0.065, r * 0.77, r * 0.78, r * 0.78), ring(0.095, r * 0.3, r * 0.35, r * 0.35, { x0: -0.01 })];
  gb.add(loft(cap, seg, { t0: c - wid, t1: c + wid, sub: D ? 3 : 1 }), 'metal'); gb.add(rim(cap[0], seg, o.rope ? 0.008 : 0.0055, { t0: c - wid, t1: c + wid }), o.rope ? 'metalD' : 'trim');
  for (let i = 0; i < (o.lames ?? 3); i++) { const rr = r + 0.002 - i * 0.008, a = ring(-0.03 - i * 0.04, rr, rr, rr, { x0: 0.008 }), b = ring(-0.075 - i * 0.04, rr - 0.004, rr - 0.004, rr - 0.004, { x0: 0.008 });
    gb.add(loft([b, a], seg, { t0: c - 1.6, t1: c + 1.6, out: 0.003 }), 'metal'); gb.add(rim(b, seg, 0.005, { t0: c - 1.6, t1: c + 1.6, out: 0.007 }), 'trim'); }
  if (o.big) { const W = [ring(-0.16, 0.16, 0.2, 0.12, { x0: 0.02 }), ring(-0.02, 0.15, 0.19, 0.13, { x0: 0.02 })]; gb.add(loft(W, S(28), { t0: -0.3, t1: 1.6, out: 0.02 }), 'metal'); gb.add(rim(W[0], S(28), 0.006, { t0: -0.3, t1: 1.6, out: 0.026 }), 'metal'); }
  if (o.rondel) { gb.add(X(cyl(0.062, 0.062, 0.01, S(24)), [0.02, -0.06, 0.13], [PI / 2, 0, 0]), 'metal'); if (D) for (let k = 0; k < 12; k++) gb.add(X(box(0.004, 0.055, 0.004), [0.02, -0.06, 0.137], [0, 0, k * PI / 12]), 'metalD'); gb.add(X(tor(0.062, 0.006, 3, S(20)), [0.02, -0.06, 0.137]), 'metalD'); }
}
function couterPlate(gb, S, D, o = {}) {
  const s = [ring(-0.065, 0.052, 0.055, 0.055), ring(0, 0.066, 0.06, 0.07), ring(0.065, 0.055, 0.056, 0.058)];
  gb.add(loft(s, S(28), { sub: D ? 2 : 1 }), 'metal'); gb.add(rim(s[0], S(28), 0.005), 'trim'); gb.add(rim(s[2], S(28), 0.005), 'trim');
  if (o.fan !== false) gb.add(X((() => { const g = new GB(gb.ctx); fan(g, S, D, o.big ? 0.11 : 0.08, o.fluted ? 12 : 0); return g.build(); })(), [0.06, 0.0, -0.01]), 'metal');
}
function vambracePlate(gb, S, D, o = {}) {
  const s = [ring(-0.05, 0.052, 0.054, 0.054, { fl: o.fluted ? fl(10, 0.004, PI) : null }), ring(-0.14, 0.049, 0.05, 0.052, { fl: o.fluted ? fl(10, 0.004, PI) : null }), ring(-0.27, 0.039, 0.038, 0.04)];
  gb.add(loft(s, S(24), { sub: D ? 2 : 1 }), 'metal'); if (o.trim) gb.add(rim(s[0], S(24), 0.005), 'trim'); cuff(gb, S, D, o.cuff || 'plain');
}
function cuff(gb, S, D, kind) { // 籠手の袖：前腕の手首側（手首 y=-0.28）
  if (kind === 'glove') { gb.add(loft([ring(-0.28, 0.04, 0.034, 0.034), ring(-0.2, 0.05, 0.045, 0.045)], S(16)), 'leatherD'); return; }
  if (kind === 'mail') return;
  const pt = kind === 'gothic' ? (tw => 0.05 * gauss(tw, PI / 2, 0.45)) : null;
  const cf = [ring(-0.285, 0.044, 0.038, 0.038), ring(-0.24, 0.054, 0.047, 0.047), ring(-0.19, 0.068, 0.058, 0.058, { dy: pt })];
  gb.add(loft(cf, S(24), { sub: D ? 2 : 1 }), 'metal'); gb.add(rim(cf[2], S(24), 0.0045), 'trim');
}
function mailArm(gb, S, D, len = 0.3) { gb.add(loft([ring(0.04, 0.075, 0.075, 0.075), ring(-0.06, 0.066, 0.068, 0.064), ring(-len, 0.057, 0.058, 0.056)], S(24)), 'mail'); }
function mailForearm(gb, S, D, glove = 'glove') { gb.add(loft([ring(0.02, 0.058, 0.058, 0.058), ring(-0.27, 0.042, 0.04, 0.042)], S(24)), 'mail'); cuff(gb, S, D, glove); }
// 脚
function cuissePlate(gb, S, D, o = {}) {
  const w = 2.15, F = o.fluted ? fl(14, 0.004, 1.3) : null;
  const s = [ring(-0.03, 0.1, 0.104, 0.09), ring(-0.18, 0.092, 0.104, 0.086, { fl: F }), ring(-0.33, 0.08, 0.088, 0.075, { fl: F }), ring(-0.43, 0.07, 0.074, 0.066)];
  gb.add(loft(s, S(32), { t0: -w, t1: w, sub: D ? 3 : 1 }), 'metal');
  for (const e of [s[0], s[3]]) gb.add(rim(e, S(32), 0.005, { t0: -w, t1: w }), 'trim');
  gb.add(loft(s.map(q => ({ ...q, rx: q.rx - 0.008, zf: q.zf - 0.01, zb: q.zb - 0.004, fl: null })), S(20)), 'clothD');
  for (const y of [-0.12, -0.34]) gb.add(rim(ring(y, 0.09, 0.095, 0.082), S(16), 0.007, { t0: w - 0.1, t1: 2 * PI - w + 0.1, out: 0.004 }), 'leather');
}
function poleynPlate(gb, S, D, o = {}) {
  const s = [ring(-0.07, 0.066, 0.07, 0.05), ring(0, 0.075, 0.088, 0.05, { ridge: 0.012 }), ring(0.07, 0.068, 0.072, 0.05)];
  gb.add(loft(s, S(28), { t0: -1.75, t1: 1.75, sub: D ? 3 : 1 }), 'metal'); for (const e of [s[0], s[2]]) gb.add(rim(e, S(28), 0.005, { t0: -1.75, t1: 1.75 }), 'trim');
  if (o.fan !== false) gb.add(X((() => { const g = new GB(gb.ctx); fan(g, S, D, o.big ? 0.095 : 0.072, o.fluted ? 10 : 0); return g.build(); })(), [0.07, 0.0, 0.0]), 'metal');
}
function greavePlate(gb, S, D, o = {}) {
  const F = o.fluted ? fl(12, 0.003, 1.2) : null;
  const s = [ring(-0.05, 0.062, 0.06, 0.062), ring(-0.16, 0.062, 0.062, 0.08, { ridge: 0.006, fl: F }), ring(-0.3, 0.053, 0.056, 0.062, { ridge: 0.006, fl: F }), ring(-0.43, 0.042, 0.046, 0.045)];
  gb.add(loft(s, S(28), { sub: D ? 3 : 1 }), 'metal'); gb.add(rim(s[0], S(28), 0.005), 'trim'); gb.add(rim(s[3], S(28), 0.0045), 'trim');
  sabaton(gb, S, D, o.sab || 'normal');
}
function mailLeg(gb, S, D) { gb.add(loft([ring(0.0, 0.1, 0.1, 0.095), ring(-0.25, 0.085, 0.088, 0.08), ring(-0.49, 0.066, 0.068, 0.064)], S(24)), 'mail'); }
function clothLeg(gb, S, D, mat = 'clothD') { gb.add(loft([ring(0.0, 0.098, 0.098, 0.094), ring(-0.25, 0.082, 0.086, 0.078), ring(-0.49, 0.062, 0.064, 0.06)], S(24)), mat); }
function bootShin(gb, S, D, o = {}) {
  gb.add(loft([ring(-0.02, 0.058, 0.058, 0.06), ring(-0.16, 0.058, 0.058, 0.072), ring(-0.25, 0.05, 0.052, 0.058)], S(20)), o.mail ? 'mail' : 'clothD');
  gb.add(loft([ring(-0.47, 0.046, 0.05, 0.05), ring(-0.36, 0.05, 0.054, 0.056), ring(-0.22, 0.056, 0.058, 0.064)], S(20)), 'leather'); gb.add(rim(ring(-0.22, 0.056, 0.058, 0.064), S(20), 0.006), 'leatherD');
  const sec = [ring(-0.08, 0.042, 0.035, 0.035), ring(0.0, 0.047, 0.035, 0.055), ring(0.1, 0.046, 0.032, 0.04), ring(0.18, 0.04, 0.025, 0.025), ring(0.21, 0.012, 0.012, 0.01)];
  const g = loft(sec, S(16)); X(g, [0, -0.47 - 0.04, 0], [PI / 2, 0, 0]); gb.add(g, 'leather'); gb.add(X(box(0.085, 0.012, 0.27), [0, -0.546, 0.06]), 'leatherD');
}
// 布の裾（左前・左後ろの四半分。股関節(+0.1)が原点なので中心は x0=-0.1）
function skirtPanel(gb, S, D, mat, len, front, o = {}) {
  const t0 = front ? -0.05 : PI / 2 - 0.15, t1 = front ? PI / 2 + 0.15 : PI + 0.05, r0 = o.r0 || 0.2, r1 = o.r1 || 0.3;
  const sec = []; for (let i = 0; i <= 4; i++) { const k = i / 4, r = r0 + (r1 - r0) * k; sec.push(ring(0.02 - len * k, r, r * 0.86, r * 0.8, { x0: -0.1 })); }
  gb.add(loft(sec.reverse(), S(14), { t0, t1 }), mat);
  if (o.hem) gb.add(rim(sec[0], S(14), 0.006, { t0, t1, out: 0.003 }), o.hem);
  if (o.cross && front) { const [x, y, z] = ringPt(sec[2], 0.2, 0.004); gb.add(X(box(0.05, len * 0.42, 0.01), [x - 0.02, y + 0.02, z], [0, 0.15, 0]), o.cross); }
}
function capePiece(gb, S, D, mat, len = 1.25) { // 胴の (0,0.53,-0.12) が原点
  const sec = []; for (let i = 0; i <= 5; i++) { const k = i / 5; sec.push(ring(-len * k, 0.2 + k * 0.17, 0.12, 0.1 + k * 0.08, { z0: 0.12 + k * 0.03 })); }
  gb.add(loft(sec.reverse(), S(20), { t0: PI - 1.3, t1: PI + 1.3 }), mat);
}

// ------------------------------------------------------------------ 組み立て（鎧ごとの部品表）
const glove = (kind, mat) => (gb, S, D) => gauntlet(gb, S, D, kind, mat);
const NEW_SETS = {
  gothic: { torso: gothicTorso, head: salletHead, pauldron: gothicPauldron, uarm: plainRerebrace, couter: gothicCouter, farm: (gb, S, D) => { gothicVambrace(gb, S, D); cuff(gb, S, D, 'gothic'); }, hand: glove('gothic'), tasset: gothicTasset, thigh: gothicCuisse, poleyn: gothicPoleyn, shin: (gb, S, D) => gothicGreave(gb, S, D, 'poulaine') },
  maximilian: {
    torso: (gb, S, D) => { plateBreast(gb, S, D, { flute: 'fine', globose: true, rope: true, ridge: 0.006 }); faulds(gb, S, D, { n: 4, flare: 0.02, fluted: true, rope: true }); gorget(gb, S, D, { rope: true }); beltAt(gb, S, 0.075); },
    head: (gb, S, D) => armetHead(gb, S, D, { fluted: true, bellows: true, rope: true }), pauldron: (gb, S, D) => pauldronPlate(gb, S, D, { fluted: true, rope: true, rondel: true }),
    uarm: plainRerebrace, couter: (gb, S, D) => couterPlate(gb, S, D, { fluted: true }), farm: (gb, S, D) => vambracePlate(gb, S, D, { fluted: true }), hand: glove('mitten'),
    tasset: null, thigh: (gb, S, D) => cuissePlate(gb, S, D, { fluted: true }), poleyn: (gb, S, D) => poleynPlate(gb, S, D, { fluted: true }), shin: (gb, S, D) => greavePlate(gb, S, D, { fluted: true, sab: 'bearpaw' }) },
  milanese: {
    torso: (gb, S, D) => { plateBreast(gb, S, D, { globose: true, plackart: 'round', ridge: 0.004 }); faulds(gb, S, D, { n: 3, scallop: true }); gorget(gb, S, D); gb.add(loft([ring(-0.17, 0.178, 0.15, 0.14), ring(-0.09, 0.175, 0.148, 0.138)], S(48)), 'mail'); },
    head: barbuteHead, pauldron: (gb, S, D) => pauldronPlate(gb, S, D, { r: 0.138, lames: 4 }), uarm: plainRerebrace, couter: (gb, S, D) => couterPlate(gb, S, D, { big: true }),
    farm: (gb, S, D) => vambracePlate(gb, S, D, {}), hand: glove('mitten'), tasset: gothicTasset, thigh: (gb, S, D) => cuissePlate(gb, S, D), poleyn: (gb, S, D) => poleynPlate(gb, S, D, { big: true }), shin: (gb, S, D) => greavePlate(gb, S, D, { sab: 'normal' }) },
  templar: {
    torso: (gb, S, D) => { bodyCore(gb, S, D, 'mail', {}); bodyCore(gb, S, D, 'white', { pad: 0.012 }); const [x, y, z] = ringPt(ring(0.3, 0.204, 0.164, 0.13), 0, 0.006); gb.add(X(box(0.055, 0.34, 0.012), [x, y, z], [-0.1, 0, 0]), 'cloth'); gb.add(X(box(0.24, 0.055, 0.012), [x, y + 0.06, z - 0.006], [-0.1, 0, 0]), 'cloth'); beltAt(gb, S, 0.03, 0.17); mailTube(gb, S, 0.53, 0.62, 0.13, 0.09); },
    head: (gb, S, D) => { mailCoif(gb, S, D, false); greatHelm(gb, S, D); }, pauldron: null, uarm: (gb, S, D) => mailArm(gb, S, D), couter: (gb, S, D) => couterPlate(gb, S, D, { fan: false }), farm: (gb, S, D) => mailForearm(gb, S, D, 'mail'), hand: glove('glove'),
    tasset: null, thigh: (gb, S, D) => mailLeg(gb, S, D), poleyn: (gb, S, D) => poleynPlate(gb, S, D, { fan: false }), shin: (gb, S, D) => bootShin(gb, S, D, { mail: true }),
    skirtF: (gb, S, D) => skirtPanel(gb, S, D, 'white', 0.62, true), skirtB: (gb, S, D) => skirtPanel(gb, S, D, 'white', 0.62, false), cape: (gb, S, D) => capePiece(gb, S, D, 'white', 1.3) },
  norman: {
    torso: (gb, S, D) => { bodyCore(gb, S, D, 'mail', { pad: 0.008 }); beltAt(gb, S, 0.05, 0.17); mailTube(gb, S, 0.53, 0.64, 0.14, 0.1); },
    head: nasalHelm, pauldron: null, uarm: (gb, S, D) => mailArm(gb, S, D), couter: null, farm: (gb, S, D) => { gb.add(loft([ring(0.02, 0.058, 0.058, 0.058), ring(-0.12, 0.05, 0.05, 0.05)], S(20)), 'mail'); gb.add(loft([ring(-0.12, 0.046, 0.046, 0.046), ring(-0.27, 0.04, 0.04, 0.04)], S(16)), 'padding'); cuff(gb, S, D, 'glove'); },
    hand: glove('glove'), tasset: null, thigh: (gb, S, D) => clothLeg(gb, S, D), poleyn: null, shin: (gb, S, D) => bootShin(gb, S, D),
    skirtF: (gb, S, D) => skirtPanel(gb, S, D, 'mail', 0.55, true, { r0: 0.2, r1: 0.27 }), skirtB: (gb, S, D) => skirtPanel(gb, S, D, 'mail', 0.55, false, { r0: 0.2, r1: 0.27 }) },
  hounskull: {
    torso: (gb, S, D) => { bodyCore(gb, S, D, 'cloth', { pad: 0.016, quilt: 'clothD' }); gb.add(rim(ring(-0.08, 0.2, 0.17, 0.16), S(48), 0.016, { rs: 4 }), 'gold'); gb.add(loft([ring(-0.18, 0.205, 0.175, 0.165), ring(-0.02, 0.19, 0.16, 0.15)], S(48)), 'cloth'); mailTube(gb, S, 0.5, 0.6, 0.15, 0.11); },
    head: hounskullHead, pauldron: (gb, S, D) => pauldronPlate(gb, S, D, { r: 0.09, lames: 2 }), uarm: plainRerebrace, couter: (gb, S, D) => couterPlate(gb, S, D, {}), farm: (gb, S, D) => vambracePlate(gb, S, D, {}), hand: glove('hour'),
    tasset: null, thigh: (gb, S, D) => cuissePlate(gb, S, D), poleyn: (gb, S, D) => poleynPlate(gb, S, D), shin: (gb, S, D) => greavePlate(gb, S, D, { sab: 'poulaineS' }) },
  black: {
    torso: (gb, S, D) => { plateBreast(gb, S, D, { globose: true, trim: true, ridge: 0.008 }); faulds(gb, S, D, { n: 3 }); gorget(gb, S, D); },
    head: (gb, S, D) => armetHead(gb, S, D, { plume: true, gold: true }), pauldron: (gb, S, D) => pauldronPlate(gb, S, D, { r: 0.12 }), uarm: plainRerebrace, couter: (gb, S, D) => couterPlate(gb, S, D, {}), farm: (gb, S, D) => vambracePlate(gb, S, D, { trim: true }), hand: glove('hour'),
    tasset: null, thigh: (gb, S, D) => cuissePlate(gb, S, D), poleyn: (gb, S, D) => poleynPlate(gb, S, D), shin: (gb, S, D) => greavePlate(gb, S, D, { sab: 'normal' }),
    skirtF: (gb, S, D) => skirtPanel(gb, S, D, 'felt', 0.45, true, { r0: 0.2, r1: 0.25, hem: 'gold' }), skirtB: (gb, S, D) => skirtPanel(gb, S, D, 'felt', 0.45, false, { r0: 0.2, r1: 0.25, hem: 'gold' }) },
  brigandine: {
    torso: (gb, S, D) => { bodyCore(gb, S, D, 'cloth', { pad: 0.014 }); for (let r = 0; r < 5; r++) for (let k = -4; k <= 4; k++) if (D || (k % 2 === 0)) rivet(gb, ring(0.08 + r * 0.085, 0.172 + Math.sin(r / 4 * PI) * 0.03, 0.15 + Math.sin(r / 4 * PI) * 0.018, 0.13), k * 0.33, 'brass', 0.006);
      gb.add(loft([ring(-0.2, 0.2, 0.17, 0.16), ring(-0.03, 0.19, 0.16, 0.15)], S(40)), 'mail'); beltAt(gb, S, -0.02, 0.18); mailTube(gb, S, 0.52, 0.6, 0.12, 0.09); },
    head: kettleHat, pauldron: null, uarm: (gb, S, D) => mailArm(gb, S, D), couter: null, farm: (gb, S, D) => mailForearm(gb, S, D, 'glove'), hand: glove('glove'),
    tasset: null, thigh: (gb, S, D) => clothLeg(gb, S, D), poleyn: null, shin: (gb, S, D) => bootShin(gb, S, D) },
};
export function hasNew(id) { return !!NEW_SETS[id]; }
export function buildBodyNew(team, set, armorId, detail) {
  const def = NEW_SETS[armorId], ctx = makeCtx(team, set, detail), S = ctx.S, out = {};
  for (const [k, fn] of Object.entries(def)) { if (!fn) continue; const gb = new GB(ctx); fn(gb, S, detail); out[k] = gb.build(); }
  return out;
}
export function buildLightHelmNew(team, detail) { const ctx = makeCtx(team, null, detail), gb = new GB(ctx); kettleHat(gb, ctx.S, detail); return gb.build(); }
