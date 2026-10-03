import * as THREE from 'three';

// ---------- 随机数（可复现） ----------
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) { this.f = mulberry32(seed); }
  next() { return this.f(); }
  range(a, b) { return a + (b - a) * this.f(); }
  int(a, b) { return a + Math.floor(this.f() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
  chance(p) { return this.f() < p; }
  weighted(pairs) {
    let total = 0;
    for (const p of pairs) total += p[1];
    let r = this.f() * total;
    for (const p of pairs) { r -= p[1]; if (r <= 0) return p[0]; }
    return pairs[pairs.length - 1][0];
  }
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// ---------- 静态几何合批：按材质合并成少量网格 ----------
// 竖墙约定：从 (x0,z0) 走到 (x1,z1)，正面朝向行进方向的右手边。
export class Batcher {
  constructor() { this.groups = new Map(); }

  _g(mat) {
    let g = this.groups.get(mat);
    if (!g) { g = { pos: [], nor: [], uv: [], idx: [] }; this.groups.set(mat, g); }
    return g;
  }

  // a 左下, b 右下, c 右上, d 左上（从正面看，逆时针）
  quad(mat, a, b, c, d, uv) {
    const g = this._g(mat);
    const base = g.pos.length / 3;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    g.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    for (let i = 0; i < 4; i++) g.nor.push(nx, ny, nz);
    if (uv.length === 4) g.uv.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]);
    else g.uv.push(...uv);
    g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  tri(mat, a, b, c, uv) {
    const g = this._g(mat);
    const base = g.pos.length / 3;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    g.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) g.nor.push(nx, ny, nz);
    g.uv.push(...uv);
    g.idx.push(base, base + 1, base + 2);
  }

  // 竖直墙面。u = 沿墙距离/us + uo，v = (y - vo)/vs
  wall(mat, x0, z0, x1, z1, y0, y1, us = 1, vs = 1, uo = 0, vo = 0) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    const v0 = (y0 - vo) / vs, v1 = (y1 - vo) / vs;
    this.quad(mat, [x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], [uo, v0, uo + L / us, v1]);
  }

  // 水平面（世界坐标 UV）
  floor(mat, x0, z0, x1, z1, y, s = 1, down = false) {
    if (!down) {
      this.quad(mat, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [x0 / s, -z1 / s, x1 / s, -z0 / s]);
    } else {
      this.quad(mat, [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [x0 / s, z0 / s, x1 / s, z1 / s]);
    }
  }

  // 轴对齐盒子，四个侧面 + 顶面（可选底面）
  box(mat, x0, y0, z0, x1, y1, z1, s = 1, bottom = false, topMat = null) {
    this.wall(mat, x0, z1, x1, z1, y0, y1, s, s); // +z
    this.wall(mat, x1, z1, x1, z0, y0, y1, s, s); // +x
    this.wall(mat, x1, z0, x0, z0, y0, y1, s, s); // -z
    this.wall(mat, x0, z0, x0, z1, y0, y1, s, s); // -x
    this.floor(topMat || mat, x0, z0, x1, z1, y1, s);
    if (bottom) this.floor(mat, x0, z0, x1, z1, y0, s, true);
  }

  // 只有侧面和顶面的“台子”（人行道、广场等），侧面用另一种材质
  slab(topMat, sideMat, x0, z0, x1, z1, h, s = 4) {
    this.floor(topMat, x0, z0, x1, z1, h, s);
    this.wall(sideMat, x0, z1, x1, z1, 0, h, 1, 1, 0, 0);
    this.wall(sideMat, x1, z1, x1, z0, 0, h, 1, 1, 0, 0);
    this.wall(sideMat, x1, z0, x0, z0, 0, h, 1, 1, 0, 0);
    this.wall(sideMat, x0, z0, x0, z1, 0, h, 1, 1, 0, 0);
  }

  build(parent, { cast = true, receive = true } = {}) {
    const meshes = [];
    for (const [mat, g] of this.groups) {
      if (!g.idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      geo.setIndex(g.idx);
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast;
      m.receiveShadow = receive;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      parent.add(m);
      meshes.push(m);
    }
    this.groups.clear();
    return meshes;
  }
}

// ---------- 顶点色模型拼装：车辆、行人、道具 ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const _Y = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();

export class ModelBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; }

  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, jitter = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    _c.set(color);
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) { this.pos.push(p[i]); this.nor.push(n[i]); }
    for (let i = 0; i < p.length / 3; i++) {
      const k = jitter ? 1 + (Math.random() - 0.5) * jitter : 1;
      this.col.push(_c.r * k, _c.g * k, _c.b * k);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
    return this;
  }

  box(w, h, d, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz);
  }

  cyl(rt, rb, h, seg, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y, z, rx, ry, rz);
  }

  // 法线沿径向，得到圆润的明暗（树冠、脑袋）
  sphere(r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, detail = 1, jitter = 0) {
    const g = new THREE.IcosahedronGeometry(r, detail);
    const a = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < a.count; i++) {
      const px = a.getX(i), py = a.getY(i), pz = a.getZ(i);
      const l = Math.hypot(px, py, pz) || 1;
      n.setXYZ(i, px / l, py / l, pz / l);
      if (jitter) {
        const k = 1 + (Math.sin(px * 7.1 + py * 3.3) * 0.5 + Math.cos(pz * 5.7) * 0.5) * jitter;
        a.setXYZ(i, px * k, py * k, pz * k);
      }
    }
    return this.add(g, color, x, y, z, 0, 0, 0, sx, sy, sz, jitter ? 0.12 : 0);
  }

  // 两点之间的圆柱（四肢、杆子）
  limb(x1, y1, z1, x2, y2, z2, r, color, seg = 6) {
    _d.set(x2 - x1, y2 - y1, z2 - z1);
    const len = _d.length();
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    _q.setFromUnitVectors(_Y, _d.normalize());
    _p.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    _s.set(1, 1, 1);
    _m.compose(_p, _q, _s);
    const ng = g.toNonIndexed();
    g.dispose();
    ng.applyMatrix4(_m);
    return this.add(ng, color);
  }

  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.computeBoundingSphere();
    return geo;
  }
}
