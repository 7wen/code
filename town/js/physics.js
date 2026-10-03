// 简单的 2D 碰撞（俯视平面）：静态 AABB 盒子 + 圆柱，按网格分桶。
export class Colliders {
  constructor(cell = 12) {
    this.cell = cell;
    this.grid = new Map();
    this.stamp = 0;
    this.all = [];
  }
  _key(i, j) { return (i + 2000) * 4096 + (j + 2000); }
  _insert(o, x0, z0, x1, z1) {
    const c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) {
      for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
        const k = this._key(i, j);
        let a = this.grid.get(k);
        if (!a) { a = []; this.grid.set(k, a); }
        a.push(o);
      }
    }
    this.all.push(o);
  }
  addBox(x0, z0, x1, z1, h = 50) {
    const o = { t: 0, x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), h, s: 0 };
    this._insert(o, o.x0, o.z0, o.x1, o.z1);
    return o;
  }
  addCircle(x, z, r, h = 4) {
    const o = { t: 1, x, z, r, h, s: 0 };
    this._insert(o, x - r, z - r, x + r, z + r);
    return o;
  }
  query(x, z, r, out) {
    out.length = 0;
    const st = ++this.stamp, c = this.cell;
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++) {
      for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
        const a = this.grid.get(this._key(i, j));
        if (!a) continue;
        for (const o of a) if (o.s !== st) { o.s = st; out.push(o); }
      }
    }
    return out;
  }

  // 把圆形 p(x,z,半径 r) 推出障碍物，返回累计法线（未碰撞则 null）
  resolve(p, r, dynamic = null) {
    const list = this.query(p.x, p.z, r + 1, this._tmp || (this._tmp = []));
    let nxs = 0, nzs = 0, hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const o of list) {
        const n = pushOut(p, r, o);
        if (n) { nxs += n[0]; nzs += n[1]; hit = moved = true; }
      }
      if (dynamic) {
        for (const o of dynamic) {
          const n = pushOut(p, r, o);
          if (n) { nxs += n[0]; nzs += n[1]; hit = moved = true; o.hit = true; }
        }
      }
      if (!moved) break;
    }
    if (!hit) return null;
    const l = Math.hypot(nxs, nzs) || 1;
    return [nxs / l, nzs / l];
  }

  // 某点是否在高于 y 的建筑里（相机防穿墙）
  blocked(x, z, y) {
    const list = this.query(x, z, 0.3, this._tmp2 || (this._tmp2 = []));
    for (const o of list) {
      if (o.t === 0 && o.h > y && x > o.x0 - 0.3 && x < o.x1 + 0.3 && z > o.z0 - 0.3 && z < o.z1 + 0.3) return true;
    }
    return false;
  }
}

function pushOut(p, r, o) {
  if (o.t === 0) {
    const cx = p.x < o.x0 ? o.x0 : p.x > o.x1 ? o.x1 : p.x;
    const cz = p.z < o.z0 ? o.z0 : p.z > o.z1 ? o.z1 : p.z;
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return null;
    let nx, nz, pen;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      nx = dx / d; nz = dz / d; pen = r - d;
    } else {
      const l = p.x - o.x0, rr = o.x1 - p.x, t = p.z - o.z0, b = o.z1 - p.z;
      const m = Math.min(l, rr, t, b);
      if (m === l) { nx = -1; nz = 0; pen = l + r; }
      else if (m === rr) { nx = 1; nz = 0; pen = rr + r; }
      else if (m === t) { nx = 0; nz = -1; pen = t + r; }
      else { nx = 0; nz = 1; pen = b + r; }
    }
    p.x += nx * pen; p.z += nz * pen;
    return [nx, nz];
  }
  const dx = p.x - o.x, dz = p.z - o.z;
  const rr = r + o.r;
  const d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr) return null;
  const d = Math.sqrt(d2) || 1e-5;
  const nx = d2 > 1e-10 ? dx / d : 1, nz = d2 > 1e-10 ? dz / d : 0;
  const pen = rr - d;
  p.x += nx * pen; p.z += nz * pen;
  return [nx, nz];
}

// 地面高度：人行道、广场等台面
export class Ground {
  constructor(cell = 32) { this.cell = cell; this.grid = new Map(); }
  _key(i, j) { return (i + 2000) * 4096 + (j + 2000); }
  addSlab(x0, z0, x1, z1, h) {
    const o = { x0, z0, x1, z1, h }, c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) {
      for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
        const k = this._key(i, j);
        let a = this.grid.get(k);
        if (!a) { a = []; this.grid.set(k, a); }
        a.push(o);
      }
    }
  }
  heightAt(x, z) {
    const a = this.grid.get(this._key(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    let h = 0;
    if (a) for (const o of a) if (x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1 && o.h > h) h = o.h;
    return h;
  }
}
