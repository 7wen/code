import * as THREE from 'three';
import { RNG, Batcher, ModelBuilder } from './util.js';
import * as L from './layout.js';
import { SIGN, signUV } from './textures.js';
import * as MD from './models.js';
import { Colliders, Ground } from './physics.js';

const FLOOR_H = 3.0, SHOP_H = 3.6, SH = L.SLAB_H;

const ZONES = {
  main: { bays: [2, 4], depth: [10, 14], floors: [[3, 2], [4, 4], [5, 3], [6, 2]], shop: 0.95, styles: [0, 1, 2, 7, 6, 5, 0, 7], gable: 0.04, gap: 0.06 },
  street: { bays: [2, 4], depth: [9, 13], floors: [[2, 2], [3, 4], [4, 3], [5, 1]], shop: 0.7, styles: [0, 1, 2, 3, 5, 6, 7], gable: 0.2, gap: 0.1 },
  lane: { bays: [2, 3], depth: [8, 12], floors: [[2, 3], [3, 4], [4, 2]], shop: 0.15, styles: [3, 4, 5, 6, 0, 2, 3], gable: 0.45, gap: 0.18 },
  country: { bays: [2, 3], depth: [8, 11], floors: [[1, 1], [2, 4], [3, 3]], shop: 0.1, styles: [3, 4, 5, 6, 4], gable: 0.55, gap: 0.2 },
  interior: { bays: [2, 3], depth: [8, 10], floors: [[2, 3], [3, 3]], shop: 0, styles: [3, 4, 5, 6, 0], gable: 0.5, gap: 0.2 },
};

export function buildWorld(scene, M) {
  const rng = new RNG(20261003);
  const B = new Batcher();
  const col = new Colliders();
  const ground = new Ground();
  const W = {
    col, ground, buildings: [], fields: [], ponds: [], pedPaths: [], strips: [], reserved: [],
    signals: [], dancers: null, hillMats: [], spawn: { x: -40, z: 5.2, h: Math.PI / 2 },
  };

  // ---------- 实例化道具 ----------
  const inst = new Map();
  const defInst = (key, geo, mat, cast = true) => inst.set(key, { geo, mat, list: [], cast });
  defInst('tree', MD.treeGeo(), M.vc);
  defInst('willow', MD.willowGeo(), M.vc);
  defInst('poplar', MD.poplarGeo(), M.vc);
  defInst('lamp', MD.lampPoleGeo(), M.vc);
  defInst('lampHead', MD.lampHeadGeo(), M.lampHead, false);
  defInst('glow', new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2), M.glow, false);
  defInst('upole', MD.utilityPoleGeo(), M.vc);
  MD.BIKE_COLORS.forEach((c, i) => defInst('ebike' + i, MD.parkedEbikeGeo(c), M.vc));
  defInst('bin', MD.binGeo(), M.vc);
  defInst('table0', MD.tableSetGeo('#c4241d'), M.vc);
  defInst('table1', MD.tableSetGeo('#2f63a8'), M.vc);
  defInst('lantern', MD.lanternGeo(), M.vc, false);
  defInst('solar', MD.solarGeo(), M.vcShiny);
  defInst('tank', MD.tankGeo(), M.vc);
  defInst('bench', MD.benchGeo(), M.vc);
  defInst('greenhouse', MD.greenhouseGeo(), M.vc);
  defInst('haystack', MD.haystackGeo(), M.vc);
  defInst('flagpole', MD.flagpoleGeo(), M.vc);

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
  function place(key, x, y, z, ry = 0, s = 1, sy = s) {
    _e.set(0, ry, 0); _q.setFromEuler(_e);
    _m.compose(_v.set(x, y, z), _q, _s.set(s, sy, s));
    inst.get(key).list.push(_m.clone());
  }
  function tree(x, z, y = SH, s = 1, kind = 'tree') {
    place(kind, x, y, z, rng.range(0, Math.PI * 2), s * rng.range(0.85, 1.15));
    col.addCircle(x, z, 0.3 * s);
  }

  // ---------- 地面、河道 ----------
  const R = L.RIVER;
  B.floor(M.ground, -2000, -2000, 2000, R.z0, 0, 24);
  B.floor(M.ground, -2000, R.z1, 2000, 2000, 0, 24);
  B.floor(M.bed, -2000, R.z0, 2000, R.z1, R.bed, 8);
  B.wall(M.bank, -2000, R.z0, 2000, R.z0, R.bed, 0, 4, 4, 0, R.bed);
  B.wall(M.bank, 2000, R.z1, -2000, R.z1, R.bed, 0, 4, 4, 0, R.bed);
  B.floor(M.water, -2000, R.z0, 2000, R.z1, R.water, 12);

  // 世界边界
  const WH = L.WORLD_HALF;
  col.addBox(-WH - 20, -WH - 20, WH + 20, -WH);
  col.addBox(-WH - 20, WH, WH + 20, WH + 20);
  col.addBox(-WH - 20, -WH, -WH, WH);
  col.addBox(WH, -WH, WH + 20, WH);

  // 桥
  for (const br of L.BRIDGES) {
    B.box(M.concrete, br.x0, -0.7, 176, br.x1, 0, 204, 2);
    for (const pz of [186, 192.5]) B.box(M.concrete, br.x0 + 1.5, R.bed, pz, br.x1 - 1.5, -0.7, pz + 1.5, 2);
    for (const [wx0, wx1, outer] of [[br.x0, br.x0 + br.walk, br.x0], [br.x1 - br.walk, br.x1, br.x1 - 0.25]]) {
      B.slab(M.sidewalk, M.curb, wx0, 176, wx1, 204, SH, 4);
      ground.addSlab(wx0, 176, wx1, 204, SH);
      for (let z = 176; z <= 204.01; z += 1.75) B.box(M.rail, outer, SH, z - 0.1, outer + 0.25, 1.0, z + 0.1, 1);
      B.box(M.rail, outer - 0.02, 0.95, 176, outer + 0.27, 1.1, 204, 1);
      col.addBox(outer, 176, outer + 0.25, 204, 1.1);
    }
  }

  // 河岸栏杆 + 滨河步道
  const riverGaps = L.BRIDGES.map((b) => [b.x0, b.x1]);
  const bankSegs = [];
  {
    let x = -335;
    for (const [g0, g1] of riverGaps) { bankSegs.push([x, g0]); x = g1; }
    bankSegs.push([x, 335]);
  }
  for (const [x0, x1] of bankSegs) {
    // 北岸步道（滨河路南侧），桥头处让出车道
    const sx0 = x0 === -335 ? x0 : x0 - 2, sx1 = x1 === 335 ? x1 : x1 + 2;
    const cut0 = Math.max(sx0, -335), cut1 = Math.min(sx1, 335);
    const strips = [];
    // 建设路、东风路车行道穿过步道
    let a = cut0;
    for (const v of [L.ROADS[1], L.ROADS[8]]) {
      if (v.c - v.hw > a && v.c - v.hw < cut1) { strips.push([a, v.c - v.hw]); a = v.c + v.hw; }
    }
    strips.push([a, cut1]);
    for (const [s0, s1] of strips) {
      if (s1 - s0 < 1) continue;
      B.slab(M.plaza, M.curb, s0, 173.5, s1, R.z0, SH, 4);
      ground.addSlab(s0, 173.5, s1, R.z0, SH);
      W.strips.push({ x0: s0, z0: 173.5, x1: s1, z1: R.z0 });
    }
    for (const [zz, y0] of [[R.z0 - 0.3, SH], [R.z1, 0]]) {
      for (let x = x0; x <= x1; x += 2) B.box(M.rail, x - 0.1, y0, zz, x + 0.1, y0 + 0.95, zz + 0.3, 1);
      B.box(M.rail, x0, y0 + 0.85, zz - 0.02, x1, y0 + 1.0, zz + 0.32, 1);
      col.addBox(x0, zz, x1, zz + 0.3, 1.1);
    }
    for (let x = x0 + 5; x < x1 - 4; x += 10) {
      if (Math.abs(x) > 330) continue;
      tree(x + rng.range(-1, 1), 177.6, SH, rng.range(0.9, 1.15), 'willow');
      if (rng.chance(0.35)) place('bench', x + 5, SH, 178.9, 0);
    }
    for (let x = x0 + 12; x < x1 - 4; x += 26) {
      if (Math.abs(x) > 330) continue;
      lamp(x, 174.0, 0, -1, 1.6);
    }
  }

  // ---------- 道路 ----------
  for (const r of L.ROADS) {
    const concrete = r.kind === 'lane' || r.kind === 'country';
    const y = L.ROAD_Y[r.kind];
    const rr = L.roadRect(r);
    B.floor(concrete ? M.concreteRoad : M.asphalt, rr.x0, rr.z0, rr.x1, rr.z1, y, concrete ? 6 : 8);
    markings(r, y + 0.006);
  }

  function strip(mat, r, s0, s1, off, width, y) {
    if (r.axis === 'x') B.floor(mat, s0, r.c + off - width / 2, s1, r.c + off + width / 2, y, 1);
    else B.floor(mat, r.c + off - width / 2, s0, r.c + off + width / 2, s1, y, 1);
  }
  function segmentsOf(r) {
    let segs = [[r.a0, r.a1]];
    for (const it of r.inters) {
      const o = it.other, h = o.hw + Math.max(o.sw, 0.5) + 0.4;
      const g0 = it.s - h, g1 = it.s + h;
      const next = [];
      for (const [a, b] of segs) {
        if (g1 <= a || g0 >= b) next.push([a, b]);
        else {
          if (g0 > a) next.push([a, g0]);
          if (g1 < b) next.push([g1, b]);
        }
      }
      segs = next;
    }
    return segs.filter(([a, b]) => b - a > 1);
  }
  function markings(r, y) {
    const segs = segmentsOf(r);
    for (const [s0, s1] of segs) {
      if (r.kind === 'main') {
        strip(M.markY, r, s0, s1, -0.15, 0.12, y);
        strip(M.markY, r, s0, s1, 0.15, 0.12, y);
        for (const sd of [-1, 1]) {
          for (let s = s0; s + 4 <= s1; s += 10) strip(M.mark, r, s, s + 4, sd * r.hw / 2, 0.12, y);
          strip(M.mark, r, s0, s1, sd * (r.hw - 0.3), 0.15, y);
        }
      } else if (r.w >= 7) {
        for (let s = s0; s + 3 <= s1; s += 7) strip(M.mark, r, s, s + 3, 0, 0.12, y);
      }
    }
    // 斑马线 + 停止线
    if (r.sw < 2) return;
    for (const it of r.inters) {
      const o = it.other;
      if (o.sw < 2) continue;
      for (const side of [-1, 1]) {
        const a = it.s + side * (o.hw + 0.6), b = it.s + side * (o.hw + 3.4);
        const s0 = Math.min(a, b), s1 = Math.max(a, b);
        if (s0 < r.a0 || s1 > r.a1) continue;
        for (let off = -r.hw + 0.6; off <= r.hw - 0.5; off += 1.0) strip(M.mark, r, s0, s1, off, 0.5, y + 0.002);
        const sl = it.s + side * (o.hw + 3.9);
        let lo, hi;
        if (r.axis === 'x') [lo, hi] = side > 0 ? [-r.hw, 0] : [0, r.hw];
        else [lo, hi] = side > 0 ? [0, r.hw] : [-r.hw, 0];
        strip(M.mark, r, sl - 0.18, sl + 0.18, (lo + hi) / 2, hi - lo - 0.2, y + 0.002);
      }
    }
  }

  // ---------- 建筑 ----------
  const NORMAL = { 'z+': [0, 1], 'z-': [0, -1], 'x+': [1, 0], 'x-': [-1, 0] };
  function faceList(b) {
    return {
      'z+': [b.x0, b.z1, b.x1, b.z1],
      'x+': [b.x1, b.z1, b.x1, b.z0],
      'z-': [b.x1, b.z0, b.x0, b.z0],
      'x-': [b.x0, b.z0, b.x0, b.z1],
    };
  }
  function signQuad(x0, z0, x1, z1, nx, nz, off, y0, y1, cell) {
    B.quad(M.sign, [x0 + nx * off, y0, z0 + nz * off], [x1 + nx * off, y0, z1 + nz * off],
      [x1 + nx * off, y1, z1 + nz * off], [x0 + nx * off, y1, z0 + nz * off], signUV(cell));
  }

  function addBuilding(b) {
    const base = b.base ?? SH;
    const shop = b.shop ?? -1;
    const gH = shop >= 0 ? SHOP_H : FLOOR_H;
    const top = base + gH + (b.floors - 1) * FLOOR_H;
    b.top = top;
    const fac = M.facade[b.style], plain = M.plain[b.style];
    const faces = faceList(b);
    for (const key in faces) {
      const [x0, z0, x1, z1] = faces[key];
      const Lf = Math.hypot(x1 - x0, z1 - z0);
      const bays = Math.max(1, Math.round(Lf / 3.6));
      const us = (Lf / bays) * 2;
      if (shop >= 0) {
        if (key === b.front) B.wall(M.shop[shop], x0, z0, x1, z1, base, base + gH, us, SHOP_H, 0, base);
        else B.wall(plain, x0, z0, x1, z1, base, base + gH, 2, 2, 0, base);
        if (top > base + gH + 0.01) B.wall(fac, x0, z0, x1, z1, base + gH, top, us, 6, 0, base + gH);
      } else {
        B.wall(fac, x0, z0, x1, z1, base, top, us, 6, 0, base);
      }
    }
    // 门头招牌 + 雨棚
    if (shop >= 0) {
      const [x0, z0, x1, z1] = faces[b.front];
      const [nx, nz] = NORMAL[b.front];
      const Lf = Math.hypot(x1 - x0, z1 - z0);
      const tx = (x1 - x0) / Lf, tz = (z1 - z0) / Lf;
      const ey = base + gH;
      const ed = 0.55;
      const ex = [x0, x1, x0 + nx * ed, x1 + nx * ed], ez = [z0, z1, z0 + nz * ed, z1 + nz * ed];
      B.box(M.eave, Math.min(...ex), ey - 0.12, Math.min(...ez), Math.max(...ex), ey + 0.03, Math.max(...ez), 1, true);
      if (b.sign >= 0) {
        let ws = Math.min(Lf - 0.6, 8.6), hs = ws / 8;
        if (hs < 0.6) hs = 0.6;
        const m = Lf / 2, s0 = m - ws / 2, s1 = m + ws / 2;
        const ax = x0 + tx * s0, az = z0 + tz * s0, bx = x0 + tx * s1, bz = z0 + tz * s1;
        const yt = ey - 0.14, yb = yt - hs;
        // 招牌灯箱的侧边和底边
        const d = 0.22;
        B.quad(M.eave, [ax, yb, az], [bx, yb, bz], [bx + nx * d, yb, bz + nz * d], [ax + nx * d, yb, az + nz * d], [0, 0, 1, 1]);
        B.quad(M.eave, [ax, yb, az], [ax + nx * d, yb, az + nz * d], [ax + nx * d, yt, az + nz * d], [ax, yt, az], [0, 0, 1, 1]);
        B.quad(M.eave, [bx + nx * d, yb, bz + nz * d], [bx, yb, bz], [bx, yt, bz], [bx + nx * d, yt, bz + nz * d], [0, 0, 1, 1]);
        signQuad(ax, az, bx, bz, nx, nz, d, yb, yt, b.sign);
      }
      if (rng.chance(0.14)) {
        for (const f of [0.18, 0.82]) place('lantern', x0 + tx * Lf * f + nx * 0.45, ey - 0.55, z0 + tz * Lf * f + nz * 0.45);
      }
    }
    // 屋顶
    if (b.roof === 'gable') gableRoof(b, top, plain, rng.pick(M.roofTile));
    else {
      const w = b.x1 - b.x0, d = b.z1 - b.z0;
      B.floor(rng.chance(0.3) ? M.roofFlat[1] : M.roofFlat[0], b.x0, b.z0, b.x1, b.z1, top, 8);
      const t = 0.2, ph = 0.6;
      B.box(plain, b.x0, top, b.z0, b.x1, top + ph, b.z0 + t, 2);
      B.box(plain, b.x0, top, b.z1 - t, b.x1, top + ph, b.z1, 2);
      B.box(plain, b.x0, top, b.z0 + t, b.x0 + t, top + ph, b.z1 - t, 2);
      B.box(plain, b.x1 - t, top, b.z0 + t, b.x1, top + ph, b.z1 - t, 2);
      if (w > 7 && d > 7 && rng.chance(0.45)) {
        const sx = rng.chance(0.5) ? b.x0 + 0.5 : b.x1 - 3.3, sz = rng.chance(0.5) ? b.z0 + 0.5 : b.z1 - 3.3;
        B.box(plain, sx, top, sz, sx + 2.8, top + 2.6, sz + 2.8, 2, false, M.roofFlat[0]);
      }
      if (rng.chance(0.6)) {
        const n = Math.min(3, Math.floor((w - 1) / 2.3));
        const z = b.z0 + 1.4 + rng.next() * Math.max(0, d - 3.5);
        for (let i = 0; i < n; i++) if (rng.chance(0.75)) place('solar', b.x0 + 1.4 + i * 2.3, top, z, 0);
      }
      if (rng.chance(0.2)) place('tank', b.x1 - 1.2, top, b.z1 - 1.2);
    }
    col.addBox(b.x0, b.z0, b.x1, b.z1, top);
    W.buildings.push(b);
    return b;
  }

  function gableRoof(b, top, wallMat, roofMat) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    const ov = 0.45, og = 0.3;
    if (w >= d) {
      const half = d / 2, rise = half * 0.55, zc = (b.z0 + b.z1) / 2, yr = top + rise;
      const ye = top - (ov * rise) / half;
      const slope = Math.hypot(half + ov, yr - ye);
      const uv = [0, 0, (w + 2 * og) / 2, slope / 2];
      B.quad(roofMat, [b.x1 + og, ye, b.z0 - ov], [b.x0 - og, ye, b.z0 - ov], [b.x0 - og, yr, zc], [b.x1 + og, yr, zc], uv);
      B.quad(roofMat, [b.x0 - og, ye, b.z1 + ov], [b.x1 + og, ye, b.z1 + ov], [b.x1 + og, yr, zc], [b.x0 - og, yr, zc], uv);
      B.tri(wallMat, [b.x0, top, b.z0], [b.x0, top, b.z1], [b.x0, yr, zc], [0, 0, d / 2, 0, d / 4, rise / 2]);
      B.tri(wallMat, [b.x1, top, b.z1], [b.x1, top, b.z0], [b.x1, yr, zc], [0, 0, d / 2, 0, d / 4, rise / 2]);
      B.box(roofMat, b.x0 - og, yr - 0.05, zc - 0.13, b.x1 + og, yr + 0.12, zc + 0.13, 1);
    } else {
      const half = w / 2, rise = half * 0.55, xc = (b.x0 + b.x1) / 2, yr = top + rise;
      const ye = top - (ov * rise) / half;
      const slope = Math.hypot(half + ov, yr - ye);
      const uv = [0, 0, (d + 2 * og) / 2, slope / 2];
      B.quad(roofMat, [b.x0 - ov, ye, b.z0 - og], [b.x0 - ov, ye, b.z1 + og], [xc, yr, b.z1 + og], [xc, yr, b.z0 - og], uv);
      B.quad(roofMat, [b.x1 + ov, ye, b.z1 + og], [b.x1 + ov, ye, b.z0 - og], [xc, yr, b.z0 - og], [xc, yr, b.z1 + og], uv);
      B.tri(wallMat, [b.x1, top, b.z0], [b.x0, top, b.z0], [xc, yr, b.z0], [0, 0, w / 2, 0, w / 4, rise / 2]);
      B.tri(wallMat, [b.x0, top, b.z1], [b.x1, top, b.z1], [xc, yr, b.z1], [0, 0, w / 2, 0, w / 4, rise / 2]);
      B.box(roofMat, xc - 0.13, yr - 0.05, b.z0 - og, xc + 0.13, yr + 0.12, b.z1 + og, 1);
    }
  }

  let lastSign = -1;
  function chooseShop(p, w) {
    if (w >= 4.5 && rng.chance(p.shop)) {
      let s;
      do { s = rng.int(0, SIGN.COMMON_COUNT - 1); } while (s === lastSign);
      lastSign = s;
      return { shop: rng.int(1, M.shop.length - 1), sign: s };
    }
    if (rng.chance(0.3)) return { shop: 0, sign: -1 };
    return { shop: -1, sign: -1 };
  }

  // 沿街区某条边排一排房子。side: 'zm'|'zp'|'xm'|'xp'（地块的哪条边），建筑从边线向内延伸
  function placeRow(lot, side, a0, a1, dMax, road, zoneKey, frontOverride) {
    const p = ZONES[zoneKey];
    if (dMax < 6) return;
    const front = frontOverride || { zm: 'z-', zp: 'z+', xm: 'x-', xp: 'x+' }[side];
    let cur = a0;
    while (a1 - cur > 4.5) {
      if (cur > a0 + 1 && rng.chance(p.gap)) { cur += rng.range(1.5, 3.2); continue; }
      let w = rng.int(p.bays[0], p.bays[1]) * 3.6 * rng.range(0.96, 1.06);
      if (a1 - (cur + w) < 5) w = a1 - cur;
      const d = Math.min(dMax, rng.range(p.depth[0], p.depth[1]));
      let r;
      if (side === 'zm') r = { x0: cur, x1: cur + w, z0: lot.z0, z1: lot.z0 + d };
      else if (side === 'zp') r = { x0: cur, x1: cur + w, z0: lot.z1 - d, z1: lot.z1 };
      else if (side === 'xm') r = { z0: cur, z1: cur + w, x0: lot.x0, x1: lot.x0 + d };
      else r = { z0: cur, z1: cur + w, x0: lot.x1 - d, x1: lot.x1 };
      const sh = chooseShop(p, w);
      const b = addBuilding({
        ...r, front, floors: rng.weighted(p.floors), style: rng.pick(p.styles),
        shop: sh.shop, sign: sh.sign, roof: rng.chance(p.gable) ? 'gable' : 'flat',
      });
      if (road && sh.shop > 0) frontProps(b, road, w);
      cur += w;
    }
  }

  // 店门口：停放的电动车、小饭桌
  function frontProps(b, road, w) {
    const faces = faceList(b);
    const [x0, z0, x1, z1] = faces[b.front];
    const [nx, nz] = NORMAL[b.front];
    const tx = (x1 - x0) / w, tz = (z1 - z0) / w;
    const sw = road.sw;
    if (sw < 2.5) return;
    if (rng.chance(0.55)) {
      const n = rng.int(1, 4);
      const perp = sw >= 3.5;
      let s = rng.range(0.8, Math.max(1, w - n * 0.8 - 0.8));
      for (let i = 0; i < n && s < w - 0.6; i++, s += perp ? 0.75 : 1.9) {
        const off = perp ? 1.0 : 0.6;
        const px = x0 + tx * s + nx * off, pz = z0 + tz * s + nz * off;
        const ry = perp ? Math.atan2(-nx, -nz) + rng.range(-0.15, 0.15) : Math.atan2(tx, tz);
        place('ebike' + rng.int(0, MD.BIKE_COLORS.length - 1), px, SH, pz, ry);
        col.addCircle(px, pz, perp ? 0.45 : 0.4, 1.2);
      }
    }
    if (sw >= 3.5 && SIGN.EATERY.includes(b.sign) && rng.chance(0.75)) {
      const s = w * rng.range(0.3, 0.7);
      const px = x0 + tx * s + nx * 2.5, pz = z0 + tz * s + nz * 2.5;
      place(rng.chance(0.5) ? 'table0' : 'table1', px, SH, pz, rng.range(0, 1));
      col.addCircle(px, pz, 0.9, 1);
    }
  }

  function fillInterior(x0, z0, x1, z1) {
    const w = x1 - x0, d = z1 - z0;
    if (w < 10 || d < 10) {
      if (w > 3 && d > 3 && rng.chance(0.5)) tree((x0 + x1) / 2, (z0 + z1) / 2);
      return;
    }
    const r = rng.next();
    if (r < 0.55) {
      let z = z0 + 1;
      while (z1 - z > 9) {
        const hd = Math.min(rng.range(8, 10), z1 - z - 1);
        let x = x0 + 1;
        while (x1 - x > 8) {
          const hw = Math.min(rng.range(8, 11), x1 - x - 1);
          if (hw >= 7 && hd >= 7) {
            addBuilding({
              x0: x, z0: z, x1: x + hw, z1: z + hd, front: rng.chance(0.5) ? 'z+' : 'z-',
              floors: rng.int(2, 3), style: rng.pick(ZONES.interior.styles), roof: rng.chance(0.5) ? 'gable' : 'flat',
            });
          }
          x += hw + rng.range(2.5, 4.5);
        }
        z += hd + rng.range(3.5, 5);
      }
    } else if (r < 0.8) {
      const n = rng.int(3, 8);
      for (let i = 0; i < n; i++) tree(rng.range(x0 + 1.5, x1 - 1.5), rng.range(z0 + 1.5, z1 - 1.5));
    } else {
      B.floor(M.fields.crops, x0 + 2, z0 + 2, x1 - 2, z1 - 2, SH + 0.03, 10);
      tree(x0 + 1.2, z0 + 1.2);
    }
  }

  const RANK = { main: 3, street: 2, country: 1, lane: 0 };
  function fillNormalBlock(blk) {
    const lot = blk.lot, rd = blk.roads;
    const lw = lot.x1 - lot.x0, ld = lot.z1 - lot.z0;
    const xr = RANK[rd.zm.kind] + RANK[rd.zp.kind], zr = RANK[rd.xm.kind] + RANK[rd.xp.kind];
    if (xr >= zr) {
      const dM = Math.min(14, (ld - 6) / 2);
      placeRow(lot, 'zm', lot.x0, lot.x1, dM, rd.zm, rd.zm.kind);
      placeRow(lot, 'zp', lot.x0, lot.x1, dM, rd.zp, rd.zp.kind);
      const iz0 = lot.z0 + dM + 1, iz1 = lot.z1 - dM - 1;
      const dM2 = Math.min(13, (lw - 6) / 2);
      if (iz1 - iz0 > 8) {
        placeRow(lot, 'xm', iz0, iz1, dM2, rd.xm, rd.xm.kind);
        placeRow(lot, 'xp', iz0, iz1, dM2, rd.xp, rd.xp.kind);
        fillInterior(lot.x0 + dM2 + 1, iz0, lot.x1 - dM2 - 1, iz1);
      }
    } else {
      const dM = Math.min(14, (lw - 6) / 2);
      placeRow(lot, 'xm', lot.z0, lot.z1, dM, rd.xm, rd.xm.kind);
      placeRow(lot, 'xp', lot.z0, lot.z1, dM, rd.xp, rd.xp.kind);
      const ix0 = lot.x0 + dM + 1, ix1 = lot.x1 - dM - 1;
      const dM2 = Math.min(13, (ld - 6) / 2);
      if (ix1 - ix0 > 8) {
        placeRow(lot, 'zm', ix0, ix1, dM2, rd.zm, rd.zm.kind);
        placeRow(lot, 'zp', ix0, ix1, dM2, rd.zp, rd.zp.kind);
        fillInterior(ix0, lot.z0 + dM2 + 1, ix1, lot.z1 - dM2 - 1);
      }
    }
  }

  // ---------- 特殊地块 ----------
  function buildPlaza(blk) {
    const lot = blk.lot;
    placeRow(lot, 'zp', lot.x0, lot.x1, 12, blk.roads.zp, 'street', 'z-');
    const cx = (lot.x0 + lot.x1) / 2;
    const sz = lot.z1 - 16;
    // 舞台
    B.box(M.concrete, cx - 8, SH, sz - 6, cx + 8, 1.0, sz, 2);
    B.box(M.stage, cx - 8, 1.0, sz - 0.6, cx + 8, 6.2, sz, 2);
    col.addBox(cx - 8, sz - 6, cx + 8, sz, 6.2);
    signQuad(cx + 6.5, sz - 0.62, cx - 6.5, sz - 0.62, 0, 0, 0, 4.6, 6.0, SIGN.PLAZA);
    // 树池、长椅、灯
    for (const px of [lot.x0 + 6, lot.x0 + 15, lot.x1 - 15, lot.x1 - 6]) {
      for (const pz of [lot.z0 + 6, lot.z0 + 15]) {
        B.box(M.curb, px - 1.2, SH, pz - 1.2, px + 1.2, 0.6, pz + 1.2, 1, false, M.yard);
        place('tree', px, 0.6, pz, rng.range(0, 6), 1.1);
        col.addCircle(px, pz, 1.35, 1);
        if (rng.chance(0.7)) place('bench', px, SH, pz + 2.2, Math.PI);
      }
    }
    for (const [px, pz] of [[lot.x0 + 3, sz - 3], [lot.x1 - 3, sz - 3], [lot.x0 + 3, lot.z0 + 2], [lot.x1 - 3, lot.z0 + 2]]) {
      lamp(px, pz, px < cx ? 1 : -1, 0, 1.6);
    }
    W.dancers = { x: cx, z: sz - 12, facing: 0 };
  }

  function buildMarket(blk) {
    const lot = blk.lot;
    const x0 = lot.x0 + 2, x1 = lot.x1 - 2, z0 = lot.z0 + 2, z1 = lot.z1 - 3;
    const zc = (z0 + z1) / 2, ye = 5.0, yr = 7.0;
    const n = Math.round((x1 - x0) / 8.5);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      for (const z of [z0, zc, z1]) {
        B.box(M.metal, x - 0.12, SH, z - 0.12, x + 0.12, z === zc ? yr : ye, z + 0.12, 1);
        col.addCircle(x, z, 0.25, 6);
      }
    }
    const ov = 1.0;
    B.quad(M.shed, [x1 + ov, ye - 0.3, z0 - ov], [x0 - ov, ye - 0.3, z0 - ov], [x0 - ov, yr, zc], [x1 + ov, yr, zc], [0, 0, (x1 - x0) / 2, 8]);
    B.quad(M.shed, [x0 - ov, ye - 0.3, z1 + ov], [x1 + ov, ye - 0.3, z1 + ov], [x1 + ov, yr, zc], [x0 - ov, yr, zc], [0, 0, (x1 - x0) / 2, 8]);
    // 摊位
    const produce = new ModelBuilder();
    const VEG = ['#4f8a32', '#6aa23a', '#d23c2f', '#e67e22', '#f2c230', '#8e44ad', '#e8e4d8', '#7a5230', '#3d7a2e'];
    const rows = [z0 + 5, z0 + 11, z1 - 11, z1 - 5];
    const mx = (x0 + x1) / 2;
    for (const rz of rows) {
      for (const [sx0, sx1] of [[x0 + 3, mx - 2.5], [mx + 2.5, x1 - 3]]) {
        B.box(M.concrete, sx0, SH, rz - 0.6, sx1, 0.95, rz + 0.6, 1, false, M.yard);
        col.addBox(sx0, rz - 0.6, sx1, rz + 0.6, 1);
        for (let x = sx0 + 0.4; x < sx1 - 0.4; x += 0.55) {
          const c = VEG[(rng.next() * VEG.length) | 0];
          if (rng.chance(0.5)) produce.sphere(0.22, c, x, 1.08, rz + rng.range(-0.3, 0.3), 1.2, 0.6, 1, 1);
          else produce.box(0.45, 0.18, 0.5, c, x, 1.04, rz + rng.range(-0.2, 0.2));
        }
      }
      W.pedPaths.push({ x0: x0 + 3, z0: rz + 3, x1: x1 - 3, z1: rz + 3, sp: 0.6 });
    }
    const pm = new THREE.Mesh(produce.build(), M.vc);
    pm.castShadow = pm.receiveShadow = true;
    scene.add(pm);
    // 门楼
    const gz = lot.z1 - 0.5;
    for (const gx of [mx - 5.5, mx + 5]) {
      B.box(M.concrete, gx, SH, gz - 0.25, gx + 0.5, 5.4, gz + 0.25, 1);
      col.addBox(gx, gz - 0.25, gx + 0.5, gz + 0.25, 5.4);
    }
    B.box(M.stage, mx - 5.8, 4.3, gz - 0.3, mx + 5.8, 5.5, gz + 0.3, 1);
    signQuad(mx - 4.8, gz + 0.32, mx + 4.8, gz + 0.32, 0, 0, 0, 4.35, 5.45, SIGN.MARKET);
  }

  function buildSchool(blk) {
    const lot = blk.lot;
    const gx0 = -170, gx1 = -160;
    const wh = 2.4, t = 0.25;
    const segs = [
      [lot.x0, lot.z0, lot.x1, lot.z0 + t], [lot.x0, lot.z0, lot.x0 + t, lot.z1], [lot.x1 - t, lot.z0, lot.x1, lot.z1],
      [lot.x0, lot.z1 - t, gx0, lot.z1], [gx1, lot.z1 - t, lot.x1, lot.z1],
    ];
    for (const [a, b, c, d] of segs) {
      B.box(M.schoolWall, a, SH, b, c, SH + wh, d, 2.6);
      col.addBox(a, b, c, d, SH + wh);
    }
    // 校门
    for (const px of [gx0 - 0.8, gx1]) {
      B.box(M.plain[0], px, SH, lot.z1 - 0.6, px + 0.8, 4.8, lot.z1 + 0.2, 2);
      col.addBox(px, lot.z1 - 0.6, px + 0.8, lot.z1 + 0.2, 5);
    }
    B.box(M.plain[0], gx0 - 0.8, 3.9, lot.z1 - 0.6, gx1 + 0.8, 4.9, lot.z1 + 0.2, 2);
    signQuad(gx0 - 0.4, lot.z1 + 0.22, gx1 + 0.4, lot.z1 + 0.22, 0, 0, 0, 3.95, 4.85, SIGN.SCHOOL);
    signQuad(lot.x0 + 3, lot.z1 + 0.01, lot.x0 + 15, lot.z1 + 0.01, 0, 0, 0, 0.75, 2.25, SIGN.STUDY);
    // 教学楼
    addBuilding({ x0: lot.x0 + 6, z0: lot.z0 + 3, x1: lot.x1 - 6, z1: lot.z0 + 15, front: 'z+', floors: 4, style: 0, roof: 'flat' });
    // 操场
    const fx0 = lot.x0 + 3, fx1 = lot.x1 - 3, fz0 = lot.z0 + 20, fz1 = lot.z1 - 4;
    B.floor(M.turf, fx0, fz0, fx1, fz1, SH + 0.02, 6);
    const cx = (fx0 + fx1) / 2, cz = (fz0 + fz1) / 2;
    const straight = Math.max(4, fz1 - fz0 - 34) / 2, ro = Math.min(16, (fx1 - fx0) / 2 - 1), ri = ro - 4;
    const shape = new THREE.Shape();
    const ring = (path, r, hole) => {
      if (!hole) {
        path.moveTo(r, -straight);
        path.lineTo(r, straight);
        path.absarc(0, straight, r, 0, Math.PI, false);
        path.lineTo(-r, -straight);
        path.absarc(0, -straight, r, Math.PI, Math.PI * 2, false);
      } else {
        path.moveTo(r, -straight);
        path.absarc(0, -straight, r, 0, -Math.PI, true);
        path.lineTo(-r, straight);
        path.absarc(0, straight, r, Math.PI, 0, true);
        path.lineTo(r, -straight);
      }
    };
    ring(shape, ro, false);
    const hole = new THREE.Path();
    ring(hole, ri, true);
    shape.holes.push(hole);
    const tg = new THREE.ShapeGeometry(shape, 16);
    tg.rotateX(-Math.PI / 2);
    const track = new THREE.Mesh(tg, M.track);
    track.position.set(cx, SH + 0.04, cz);
    track.receiveShadow = true;
    scene.add(track);
    place('flagpole', cx, SH, lot.z0 + 18);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), M.flag);
    flag.position.set(cx + 0.95, SH + 11.2, lot.z0 + 18);
    scene.add(flag);
    W.flag = flag;
    col.addCircle(cx, lot.z0 + 18, 0.8, 12);
  }

  function buildGov(blk) {
    const lot = blk.lot;
    const b = addBuilding({ x0: lot.x0 + 20, z0: lot.z0 + 4, x1: lot.x0 + 34, z1: lot.z1 - 4, front: 'x-', floors: 5, style: 0, roof: 'flat' });
    const zc = (b.z0 + b.z1) / 2;
    signQuad(b.x0, zc - 7, b.x0, zc + 7, -1, 0, 0.05, b.top - 2.6, b.top - 0.85, SIGN.GOV);
    place('flagpole', lot.x0 + 9, SH, zc);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), M.flag);
    flag.rotation.y = Math.PI / 2;
    flag.position.set(lot.x0 + 9, SH + 11.2, zc + 0.95);
    scene.add(flag);
    W.flag2 = flag;
    col.addCircle(lot.x0 + 9, zc, 0.8, 12);
    // 围栏（留出大门）
    const fx = lot.x0 + 0.2;
    for (const [z0, z1] of [[lot.z0, zc - 5], [zc + 5, lot.z1]]) {
      for (let z = z0; z <= z1; z += 0.25) B.box(M.metal, fx, SH, z - 0.02, fx + 0.04, 1.4, z + 0.02, 1);
      B.box(M.metal, fx - 0.02, 1.3, z0, fx + 0.06, 1.4, z1, 1);
      B.box(M.concrete, fx - 0.15, SH, z0, fx + 0.2, 0.5, z1, 1);
      col.addBox(fx - 0.15, z0, fx + 0.2, z1, 1.4);
    }
    // 院里停着几辆车
    for (let i = 0; i < 4; i++) {
      const car = new THREE.Mesh(MD.sedanGeo(rng.pick(['#e8e8e6', '#2b2d30', '#c7c9cb'])), M.vcShiny);
      const cz = lot.z0 + 5 + i * 3.2;
      car.position.set(b.x0 - 4, SH, cz);
      car.rotation.y = -Math.PI / 2;
      car.castShadow = true;
      scene.add(car);
      col.addBox(b.x0 - 6.2, cz - 0.9, b.x0 - 1.8, cz + 0.9, 1.5);
    }
    for (let z = lot.z0 + 3; z < lot.z1 - 2; z += 7) tree(b.x1 + 3, z);
    for (let x = b.x1 + 8; x < lot.x1 - 3; x += 7) for (let z = lot.z0 + 4; z < lot.z1 - 3; z += 8) if (rng.chance(0.6)) tree(x, z);
  }

  // ---------- 灯、电线杆 ----------
  // (x,z) 灯杆位置，(dx,dz) 指向路面
  function lamp(x, z, dx, dz, reach) {
    const ry = Math.atan2(dx, dz);
    place('lamp', x, SH, z, ry);
    place('lampHead', x, SH, z, ry);
    place('glow', x + dx * reach, 0.09, z + dz * reach, 0);
    col.addCircle(x, z, 0.18, 8);
  }
  const poleLines = new Map();
  function upole(key, x, z, along, ry, y = SH) {
    place('upole', x, y, z, ry);
    col.addCircle(x, z, 0.2, 9);
    if (!poleLines.has(key)) poleLines.set(key, []);
    poleLines.get(key).push({ x, z, y, along, ry });
  }

  // 沿街区各边：行道树、路灯、电线杆、垃圾桶、行人路径
  function blockEdges(blk) {
    const s = blk.slab;
    const edges = [
      { road: blk.roads.zm, axis: 'x', a0: s.x0, a1: s.x1, edge: s.z0, inward: 1, key: 'zm' },
      { road: blk.roads.zp, axis: 'x', a0: s.x0, a1: s.x1, edge: s.z1, inward: -1, key: 'zp' },
      { road: blk.roads.xm, axis: 'z', a0: s.z0, a1: s.z1, edge: s.x0, inward: 1, key: 'xm' },
      { road: blk.roads.xp, axis: 'z', a0: s.z0, a1: s.z1, edge: s.x1, inward: -1, key: 'xp' },
    ];
    for (const e of edges) {
      const r = e.road;
      const pt = (along, off) => (e.axis === 'x' ? [along, e.edge + e.inward * off] : [e.edge + e.inward * off, along]);
      const toRoad = e.axis === 'x' ? [0, -e.inward] : [-e.inward, 0];
      const lampSide = e.key === 'zm' || e.key === 'xm';
      if (r.kind === 'main') {
        for (let a = e.a0 + 6; a < e.a1 - 4; a += 30) { const [x, z] = pt(a, 0.35); lamp(x, z, toRoad[0], toRoad[1], 1.6); }
        for (let a = e.a0 + 3; a < e.a1 - 2; a += 12) {
          if (((a - e.a0 - 6) % 30 + 30) % 30 < 3) continue;
          const [x, z] = pt(a, 0.9); tree(x, z, SH, rng.range(0.9, 1.1));
        }
        for (let a = e.a0 + 20; a < e.a1 - 5; a += 55) { const [x, z] = pt(a, 0.5); place('bin', x, SH, z); col.addCircle(x, z, 0.35, 1); }
      } else if (r.kind === 'street') {
        if (lampSide) for (let a = e.a0 + 8; a < e.a1 - 4; a += 36) { const [x, z] = pt(a, 0.35); lamp(x, z, toRoad[0], toRoad[1], 1.6); }
        else for (let a = e.a0 + 5; a < e.a1 - 3; a += 32) { const [x, z] = pt(a, 0.35); upole(`${r.id}:${e.key}`, x, z, a, e.axis === 'x' ? Math.PI / 2 : 0); }
        if (r.sw >= 2.5) for (let a = e.a0 + 3; a < e.a1 - 2; a += 14) { if (rng.chance(0.75)) { const [x, z] = pt(a, 0.7); tree(x, z, SH, 0.8); } }
      } else {
        // 巷子、环路：一侧电线杆
        if (lampSide) for (let a = e.a0 + 4; a < e.a1 - 3; a += 30) { const [x, z] = pt(a, 0.3); upole(`${r.id}:${e.key}`, x, z, a, e.axis === 'x' ? Math.PI / 2 : 0); }
      }
      if (r.sw >= 2) {
        const off = r.kind === 'main' ? 1.7 : r.sw * 0.52;
        const [x0, z0] = pt(e.a0 + 1, off), [x1, z1] = pt(e.a1 - 1, off);
        W.pedPaths.push({ x0, z0, x1, z1 });
      }
    }
  }

  // ---------- 街区 ----------
  for (const blk of L.BLOCKS) {
    const s = blk.slab, lot = blk.lot;
    B.slab(blk.type === 'plaza' ? M.plaza : M.sidewalk, M.curb, s.x0, s.z0, s.x1, s.z1, SH, 4);
    ground.addSlab(s.x0, s.z0, s.x1, s.z1, SH);
    if (blk.type !== 'plaza') B.floor(M.yard, lot.x0, lot.z0, lot.x1, lot.z1, SH + 0.015, 10);
    if (blk.type === 'plaza') buildPlaza(blk);
    else if (blk.type === 'market') buildMarket(blk);
    else if (blk.type === 'school') buildSchool(blk);
    else if (blk.type === 'gov') buildGov(blk);
    else fillNormalBlock(blk);
    blockEdges(blk);
  }

  // ---------- 红绿灯（人民路 × 建设路） ----------
  {
    const sigBox = new THREE.BoxGeometry(0.34, 1.0, 0.3);
    const lightGeo = new THREE.CircleGeometry(0.1, 14);
    const poleMat = M.metal;
    const approaches = [
      { axis: 'x', h: [1, 0], r: [0, 1] }, { axis: 'x', h: [-1, 0], r: [0, -1] },
      { axis: 'z', h: [0, 1], r: [-1, 0] }, { axis: 'z', h: [0, -1], r: [1, 0] },
    ];
    for (const ap of approaches) {
      const px = ap.axis === 'x' ? ap.h[0] * 6.7 : ap.r[0] * 6.7;
      const pz = ap.axis === 'x' ? ap.r[1] * 7.7 : ap.h[1] * 7.7;
      const g = new THREE.Group();
      g.position.set(px, SH, pz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 6.2, 8), poleMat);
      pole.position.y = 3.1; pole.castShadow = true;
      g.add(pole);
      // 横臂伸向车道（-r 方向）
      const armLen = 4.5;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, armLen), poleMat);
      const ry = Math.atan2(-ap.r[0], -ap.r[1]);
      arm.rotation.y = ry;
      arm.position.set(-ap.r[0] * armLen / 2, 5.9, -ap.r[1] * armLen / 2);
      g.add(arm);
      const head = new THREE.Group();
      head.position.set(-ap.r[0] * (armLen - 0.4), 5.3, -ap.r[1] * (armLen - 0.4));
      head.rotation.y = Math.atan2(-ap.h[0], -ap.h[1]);
      const box = new THREE.Mesh(sigBox, new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.6 }));
      head.add(box);
      const mk = (c, y) => {
        const m = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: c }));
        m.position.set(0, y, 0.16);
        head.add(m);
        return m;
      };
      const sig = { axis: ap.axis, red: mk(0xff2a1a, 0.3), yellow: mk(0xffb81a, 0), green: mk(0x2aff6a, -0.3) };
      g.add(head);
      scene.add(g);
      W.signals.push(sig);
      col.addCircle(px, pz, 0.2, 6);
    }
  }

  // ---------- 城外：农舍、田地、杨树 ----------
  const rectOverlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
  const roadRects = L.ROADS.map((r) => L.roadRect(r, 2.5));
  const townRect = { x0: -203.5, x1: 203.5, z0: -193.5, z1: 180 };
  const riverRect = { x0: -2000, x1: 2000, z0: 166, z1: 206 };
  function freeRect(rc) {
    if (Math.abs(rc.x0) > 318 || Math.abs(rc.x1) > 318 || Math.abs(rc.z0) > 318 || Math.abs(rc.z1) > 318) return false;
    if (rectOverlap(rc, townRect) || rectOverlap(rc, riverRect)) return false;
    for (const r of roadRects) if (rectOverlap(rc, r)) return false;
    for (const r of W.reserved) if (rectOverlap(rc, r)) return false;
    return true;
  }

  const ruralRoads = [
    [L.ROADS[0], [[-318, -210], [210, 318]]],
    [L.ROADS[1], [[-318, -200], [210, 318]]],
    [L.ROADS[5], [[-318, 318]]],
    [L.ROADS[6], [[-318, 318]]],
    [L.ROADS[9], [[-186, 166]]],
    [L.ROADS[10], [[-186, 166]]],
    [L.ROADS[4], [[-318, -206], [206, 318]]],
    [L.ROADS[8], [[206, 246]]],
  ];
  for (const [r, ranges] of ruralRoads) {
    for (const [s0, s1] of ranges) {
      for (const side of [-1, 1]) {
        let s = s0 + rng.range(2, 15);
        while (s < s1 - 14) {
          const nearI = r.inters.some((it) => Math.abs(it.s - s) < it.other.hw + 10);
          if (!nearI && rng.chance(0.5)) {
            const w = rng.range(9, 13), d = rng.range(9, 11), set = rng.range(4.5, 7);
            const n0 = r.hw + set, n1 = n0 + d;
            const rc = r.axis === 'x'
              ? { x0: s, x1: s + w, z0: side > 0 ? r.c + n0 : r.c - n1, z1: side > 0 ? r.c + n1 : r.c - n0 }
              : { z0: s, z1: s + w, x0: side > 0 ? r.c + n0 : r.c - n1, x1: side > 0 ? r.c + n1 : r.c - n0 };
            const yard = r.axis === 'x'
              ? { x0: s - 1, x1: s + w + 1, z0: side > 0 ? r.c + r.hw : r.c - n0, z1: side > 0 ? r.c + n0 : r.c - r.hw }
              : { z0: s - 1, z1: s + w + 1, x0: side > 0 ? r.c + r.hw : r.c - n0, x1: side > 0 ? r.c + n0 : r.c - r.hw };
            const big = { x0: Math.min(rc.x0, yard.x0) - 2, x1: Math.max(rc.x1, yard.x1) + 2, z0: Math.min(rc.z0, yard.z0) - 2, z1: Math.max(rc.z1, yard.z1) + 2 };
            const test = { x0: rc.x0 - 2, x1: rc.x1 + 2, z0: rc.z0 - 2, z1: rc.z1 + 2 };
            if (freeRect(test)) {
              const front = r.axis === 'x' ? (side > 0 ? 'z-' : 'z+') : (side > 0 ? 'x-' : 'x+');
              let shop = -1, sign = -1;
              if (rng.chance(0.14)) { shop = rng.int(1, M.shop.length - 1); sign = rng.pick([SIGN.FARM, SIGN.AUTO, SIGN.TYRE, 29, 30, 9]); }
              else if (rng.chance(0.3)) shop = 0;
              addBuilding({ ...rc, base: 0, front, floors: rng.weighted([[2, 5], [3, 3], [1, 1]]), style: rng.pick([3, 4, 5, 6, 0, 4]), shop, sign, roof: rng.chance(0.6) ? 'gable' : 'flat' });
              B.floor(M.yard, yard.x0, yard.z0, yard.x1, yard.z1, 0.025, 10);
              W.reserved.push(big);
              if (rng.chance(0.7)) {
                const tx = r.axis === 'x' ? s + w + 2.5 : (rc.x0 + rc.x1) / 2 + side * 3;
                const tz = r.axis === 'x' ? (rc.z0 + rc.z1) / 2 : s + w + 2.5;
                tree(tx, tz, 0, rng.range(0.9, 1.25));
              }
              if (rng.chance(0.3)) {
                const hx = r.axis === 'x' ? s - 3 : (rc.x0 + rc.x1) / 2;
                const hz = r.axis === 'x' ? (rc.z0 + rc.z1) / 2 : s - 3;
                place('haystack', hx, 0, hz, rng.range(0, 6), rng.range(0.8, 1.2));
                col.addCircle(hx, hz, 1.1, 2);
              }
            }
            s += w + rng.range(18, 40);
          } else s += rng.range(15, 30);
        }
      }
    }
  }

  // 杨树行
  for (const [r, ranges] of ruralRoads) {
    if (r.kind === 'main' && r.axis === 'z') continue;
    for (const [s0, s1] of ranges) {
      for (const side of [-1, 1]) {
        let s = s0;
        while (s < s1) {
          const runLen = rng.range(40, 100);
          if (rng.chance(0.55)) {
            for (let a = s; a < Math.min(s1, s + runLen); a += 7) {
              const off = r.hw + 2.2;
              const x = r.axis === 'x' ? a : r.c + side * off, z = r.axis === 'x' ? r.c + side * off : a;
              const t = { x0: x - 1, x1: x + 1, z0: z - 1, z1: z + 1 };
              if (W.reserved.some((q) => rectOverlap(q, t)) || r.inters.some((it) => Math.abs(it.s - a) < it.other.hw + 4)) continue;
              if (rectOverlap(t, townRect) || rectOverlap(t, riverRect)) continue;
              place('poplar', x, 0, z, rng.range(0, 6), rng.range(0.85, 1.2));
              col.addCircle(x, z, 0.25, 8);
            }
          }
          s += runLen + rng.range(10, 40);
        }
      }
    }
  }

  // 乡道电线杆
  for (const [r, ranges] of ruralRoads) {
    for (const [s0, s1] of ranges) {
      for (let a = s0 + 5; a < s1; a += 35) {
        const off = -(r.hw + 1.2);
        const x = r.axis === 'x' ? a : r.c + off, z = r.axis === 'x' ? r.c + off : a;
        if (r.inters.some((it) => Math.abs(it.s - a) < it.other.hw + 2)) continue;
        if (W.reserved.some((q) => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1)) continue;
        upole(`rural:${r.id}`, x, z, a, r.axis === 'x' ? Math.PI / 2 : 0, 0);
      }
    }
  }

  // 田地
  const zones = [
    { x0: -330, x1: 330, z0: -330, z1: -197 },
    { x0: -330, x1: -207, z0: -186, z1: 166 },
    { x0: 207, x1: 330, z0: -186, z1: 166 },
    { x0: -330, x1: 330, z0: 206, z1: 330 },
  ];
  const clipRects = [...L.ROADS.map((r) => L.roadRect(r, 3)), ...W.reserved];
  function clip(rc) {
    let cur = [rc];
    for (const c of clipRects) {
      const next = [];
      for (const p of cur) {
        if (!rectOverlap(p, c)) { next.push(p); continue; }
        const parts = [
          { x0: p.x0, x1: c.x0, z0: p.z0, z1: p.z1 }, { x0: c.x1, x1: p.x1, z0: p.z0, z1: p.z1 },
          { x0: p.x0, x1: p.x1, z0: p.z0, z1: c.z0 }, { x0: p.x0, x1: p.x1, z0: c.z1, z1: p.z1 },
        ].filter((q) => q.x1 - q.x0 >= 8 && q.z1 - q.z0 >= 8);
        if (parts.length) {
          parts.sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0));
          next.push(parts[0]);
        }
      }
      cur = next;
    }
    return cur;
  }
  for (const zn of zones) {
    let x = zn.x0;
    while (x < zn.x1 - 8) {
      const cw = rng.range(26, 44);
      let z = zn.z0;
      while (z < zn.z1 - 8) {
        const ch = rng.range(22, 38);
        const cell = { x0: x + 1, z0: z + 1, x1: Math.min(zn.x1, x + cw) - 1, z1: Math.min(zn.z1, z + ch) - 1 };
        for (const f of clip(cell)) {
          const type = rng.weighted([['crops', 45], ['rapeseed', 18], ['soil', 10], ['paddy', 12], ['greenhouse', 9], ['pond', 6]]);
          f.type = type;
          if (type === 'pond') {
            B.floor(M.water, f.x0 + 1, f.z0 + 1, f.x1 - 1, f.z1 - 1, 0.035, 12);
            col.addBox(f.x0 + 1.4, f.z0 + 1.4, f.x1 - 1.4, f.z1 - 1.4, 0.5);
            W.ponds.push(f);
          } else {
            B.floor(type === 'greenhouse' ? M.fields.soil : M.fields[type], f.x0, f.z0, f.x1, f.z1, 0.02, 10);
            if (type === 'greenhouse' && f.z1 - f.z0 > 32) {
              const n = Math.floor((f.x1 - f.x0 - 1) / 6.2);
              const zc = (f.z0 + f.z1) / 2;
              for (let i = 0; i < n; i++) {
                const gx = f.x0 + 3.3 + i * 6.2;
                place('greenhouse', gx, 0, zc);
                col.addBox(gx - 2.6, zc - 15, gx + 2.6, zc + 15, 2.2);
              }
            }
          }
          W.fields.push(f);
        }
        z += ch;
      }
      x += cw;
    }
  }

  // ---------- 电线 ----------
  {
    const pts = [];
    for (const list of poleLines.values()) {
      list.sort((a, b) => a.along - b.along);
      for (let i = 0; i + 1 < list.length; i++) {
        const p = list[i], q = list[i + 1];
        const dist = Math.hypot(q.x - p.x, q.z - p.z);
        if (dist > 48) continue;
        const ox = Math.cos(p.ry), oz = -Math.sin(p.ry);
        for (const [off, h] of [[-0.7, 8.5], [0, 8.5], [0.7, 8.5], [0.35, 7.6]]) {
          const a = [p.x + ox * off, p.y + h, p.z + oz * off], b = [q.x + ox * off, q.y + h, q.z + oz * off];
          const seg = 8;
          for (let k = 0; k < seg; k++) {
            const t0 = k / seg, t1 = (k + 1) / seg;
            const sag = (t) => 4 * t * (1 - t) * 0.55;
            pts.push(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0 - sag(t0), a[2] + (b[2] - a[2]) * t0);
            pts.push(a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1 - sag(t1), a[2] + (b[2] - a[2]) * t1);
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const wires = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1e1e1e }));
    wires.matrixAutoUpdate = false;
    scene.add(wires);
  }

  // ---------- 远山 ----------
  for (const [radius, height, seed] of [[900, 120, 1], [1250, 220, 2]]) {
    const seg = 160;
    const pos = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const h = height * (0.35 + 0.3 * Math.sin(a * 3 + seed) + 0.2 * Math.sin(a * 7 + seed * 2) + 0.15 * Math.sin(a * 13 + seed * 5)) + 20;
      pos.push(Math.cos(a) * radius, -10, Math.sin(a) * radius);
      pos.push(Math.cos(a) * (radius + 60), Math.max(15, h), Math.sin(a) * (radius + 60));
      if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ color: 0x8c9aa0, fog: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = -1;
    scene.add(m);
    W.hillMats.push(mat);
  }

  // ---------- 输出 ----------
  B.build(scene);
  for (const [key, e] of inst) {
    if (!e.list.length) continue;
    const im = new THREE.InstancedMesh(e.geo, e.mat, e.list.length);
    e.list.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = e.cast;
    im.receiveShadow = key !== 'glow';
    im.computeBoundingSphere();
    scene.add(im);
    if (key === 'glow') W.glow = im;
  }
  return W;
}
