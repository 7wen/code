// 青石镇的平面布局：道路、街区、特殊地块。坐标单位：米。
// x 向东，z 向南（屏幕上方为北 = -z）。

export const TOWN_NAME = '青石镇';
export const WORLD_HALF = 322;          // 可骑行范围
export const SLAB_H = 0.15;             // 人行道/街区台面高度
export const RIVER = { z0: 180, z1: 200, water: -1.3, bed: -2.6 };

// 道路图层高度（避免重叠处闪烁）
export const ROAD_Y = { lane: 0.03, country: 0.04, street: 0.05, main: 0.06 };

// axis:'x' 表示沿 x 方向延伸（东西向），c 为其 z 坐标；axis:'z' 为南北向，c 为其 x 坐标。
export const ROADS = [
  { name: '人民路', axis: 'x', c: 0, a0: -340, a1: 340, w: 14, sw: 4, kind: 'main' },
  { name: '建设路', axis: 'z', c: 0, a0: -340, a1: 340, w: 12, sw: 3.5, kind: 'main' },
  { name: '解放街', axis: 'x', c: -100, a0: -203.5, a1: 203.5, w: 8, sw: 2.5, kind: 'street' },
  { name: '新华路', axis: 'x', c: 100, a0: -203.5, a1: 203.5, w: 8, sw: 2.5, kind: 'street' },
  { name: '滨河路', axis: 'x', c: 170, a0: -340, a1: 340, w: 7, sw: 2, kind: 'street' },
  { name: '北环路', axis: 'x', c: -190, a0: -340, a1: 340, w: 7, sw: 1.5, kind: 'country' },
  { name: '南岸村道', axis: 'x', c: 250, a0: -340, a1: 340, w: 6, sw: 0, kind: 'country' },
  { name: '文化路', axis: 'z', c: -130, a0: -193.5, a1: 173.5, w: 8, sw: 2.5, kind: 'street' },
  { name: '东风路', axis: 'z', c: 130, a0: -193.5, a1: 253, w: 8, sw: 2.5, kind: 'street' },
  { name: '西环路', axis: 'z', c: -200, a0: -193.5, a1: 173.5, w: 7, sw: 1.5, kind: 'country' },
  { name: '东环路', axis: 'z', c: 200, a0: -193.5, a1: 173.5, w: 7, sw: 1.5, kind: 'country' },
  { name: '槐树巷', axis: 'x', c: -50, a0: -200, a1: 200, w: 4.5, sw: 0.8, kind: 'lane' },
  { name: '桂花巷', axis: 'x', c: 50, a0: -200, a1: 200, w: 4.5, sw: 0.8, kind: 'lane' },
  { name: '石板巷', axis: 'z', c: -65, a0: -190, a1: 170, w: 4.5, sw: 0.8, kind: 'lane' },
  { name: '井头巷', axis: 'z', c: 65, a0: -190, a1: 170, w: 4.5, sw: 0.8, kind: 'lane' },
];
ROADS.forEach((r, i) => { r.id = i; r.hw = r.w / 2; r.inters = []; });

export const BRIDGES = [
  { road: ROADS[1], x0: -8, x1: 8, walk: 2 },
  { road: ROADS[8], x0: 124, x1: 136, walk: 2 },
];

// 网格线（街区由这些道路围合）
export const XL = [-200, -130, -65, 0, 65, 130, 200];
export const ZL = [-190, -100, -50, 0, 50, 100, 170];
export const V_ROADS = XL.map((x) => ROADS.find((r) => r.axis === 'z' && r.c === x));
export const H_ROADS = ZL.map((z) => ROADS.find((r) => r.axis === 'x' && r.c === z));

// 特殊地块
const SPECIAL = {
  '2,3': { type: 'plaza', label: '文化广场' },
  '4,2': { type: 'market', label: '农贸市场' },
  '0,0': { type: 'school', label: '中心小学' },
  '3,1': { type: 'gov', label: '镇政府' },
};

export const BLOCKS = [];
for (let i = 0; i < XL.length - 1; i++) {
  for (let j = 0; j < ZL.length - 1; j++) {
    const xm = V_ROADS[i], xp = V_ROADS[i + 1], zm = H_ROADS[j], zp = H_ROADS[j + 1];
    const slab = { x0: XL[i] + xm.hw, x1: XL[i + 1] - xp.hw, z0: ZL[j] + zm.hw, z1: ZL[j + 1] - zp.hw };
    const lot = { x0: slab.x0 + xm.sw, x1: slab.x1 - xp.sw, z0: slab.z0 + zm.sw, z1: slab.z1 - zp.sw };
    const sp = SPECIAL[`${i},${j}`];
    BLOCKS.push({ i, j, slab, lot, roads: { xm, xp, zm, zp }, type: sp ? sp.type : 'normal', label: sp ? sp.label : null });
  }
}

// 路口
export const INTERSECTIONS = [];
for (const h of ROADS) {
  if (h.axis !== 'x') continue;
  for (const v of ROADS) {
    if (v.axis !== 'z') continue;
    if (v.c >= h.a0 && v.c <= h.a1 && h.c >= v.a0 && h.c <= v.a1) {
      const I = { x: v.c, z: h.c, h, v };
      INTERSECTIONS.push(I);
      h.inters.push({ s: v.c, other: v, os: h.c, I });
      v.inters.push({ s: h.c, other: h, os: v.c, I });
    }
  }
}
for (const r of ROADS) r.inters.sort((a, b) => a.s - b.s);

// 道路矩形（只含车行道）
export function roadRect(r, extra = 0) {
  const e = r.hw + extra;
  return r.axis === 'x'
    ? { x0: r.a0, x1: r.a1, z0: r.c - e, z1: r.c + e }
    : { x0: r.c - e, x1: r.c + e, z0: r.a0, z1: r.a1 };
}

export function onRoad(x, z) {
  for (const r of ROADS) {
    if (r.axis === 'x') {
      if (x >= r.a0 && x <= r.a1 && Math.abs(z - r.c) <= r.hw) return r;
    } else if (z >= r.a0 && z <= r.a1 && Math.abs(x - r.c) <= r.hw) return r;
  }
  return null;
}

// 当前所在位置的名字（HUD 用）
export function placeName(x, z) {
  if (z > RIVER.z0 && z < RIVER.z1) {
    for (const b of BRIDGES) if (x >= b.x0 && x <= b.x1) return b.road === ROADS[1] ? '青石桥' : '东风桥';
    return '青溪河';
  }
  let best = null, bestD = 1e9;
  for (const r of ROADS) {
    const along = r.axis === 'x' ? x : z;
    const perp = Math.abs((r.axis === 'x' ? z : x) - r.c);
    if (along < r.a0 || along > r.a1) continue;
    const lim = r.hw + Math.max(r.sw, 1) + 0.5;
    if (perp <= lim && perp / lim < bestD) { bestD = perp / lim; best = r; }
  }
  if (best) return best.name;
  for (const b of BLOCKS) {
    const s = b.slab;
    if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return b.label || '居民区';
  }
  if (z > 173 && z < RIVER.z0 && Math.abs(x) < 330) return '滨河步道';
  if (z > RIVER.z1) return '河南村';
  return '镇郊田野';
}
