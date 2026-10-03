import * as THREE from 'three';
import * as L from './layout.js';
import * as MD from './models.js';
import { RNG } from './util.js';

const TYPES = {
  car: { len: 4.4, wid: 1.8, vmax: 10.5, small: false, w: 38 },
  van: { len: 3.9, wid: 1.65, vmax: 9.5, small: false, w: 20 },
  truck: { len: 4.8, wid: 1.9, vmax: 8.5, small: false, w: 6 },
  trike: { len: 2.6, wid: 1.2, vmax: 6.0, small: true, w: 12 },
  ebike: { len: 1.8, wid: 0.7, vmax: 7.0, small: true, w: 24 },
};
const ROAD_W = { main: 4, street: 2.5, country: 1.2, lane: 0.6 };
const LIGHT_CYCLE = 32;
const MAIN_X = L.ROADS[0], MAIN_Z = L.ROADS[1];

function laneOff(r, small) {
  if (r.kind === 'lane') return small ? 1.4 : 1.1;
  if (r.w >= 12) return small ? r.hw - 1.0 : 1.9;
  return small ? r.hw - 0.9 : Math.max(1.3, r.hw * 0.5);
}
function lanePos(r, s, dir, off) {
  return r.axis === 'x' ? [s, r.c + dir * off] : [r.c - dir * off, s];
}
function roadHeading(r, dir) {
  return r.axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
}
function bez(T, t) {
  const u = 1 - t;
  return [
    u * u * T.p0[0] + 2 * u * t * T.p1[0] + t * t * T.p2[0],
    u * u * T.p0[1] + 2 * u * t * T.p1[1] + t * t * T.p2[1],
  ];
}
function bezTan(T, t) {
  return [
    2 * (1 - t) * (T.p1[0] - T.p0[0]) + 2 * t * (T.p2[0] - T.p1[0]),
    2 * (1 - t) * (T.p1[1] - T.p0[1]) + 2 * t * (T.p2[1] - T.p1[1]),
  ];
}
function bezLen(T) {
  let l = 0, prev = T.p0;
  for (let i = 1; i <= 12; i++) {
    const p = bez(T, i / 12);
    l += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return Math.max(0.5, l);
}

// 车灯（夜里亮）
function lampGeo(len, wid, h) {
  const g1 = new THREE.BoxGeometry(0.22, 0.1, 0.04);
  const g2 = g1.clone();
  g1.translate(wid * 0.33, h, len / 2 + 0.02);
  g2.translate(-wid * 0.33, h, len / 2 + 0.02);
  const pos = [...g1.toNonIndexed().attributes.position.array, ...g2.toNonIndexed().attributes.position.array];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export class Traffic {
  constructor(scene, M, W, count = 46) {
    this.scene = scene;
    this.M = M;
    this.W = W;
    this.rng = new RNG(99);
    this.list = [];
    this.t = 0;
    this.events = [];
    this.circles = [];
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xfffbe8, emissive: 0xfff2cc, emissiveIntensity: 0 });
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x6a0d0d, emissive: 0xff1a0a, emissiveIntensity: 0.2 });
    this.roadPool = [];
    for (const r of L.ROADS) this.roadPool.push([r, ROAD_W[r.kind] * (Math.min(r.a1, 300) - Math.max(r.a0, -300)) / 100]);
    for (let i = 0; i < count; i++) this.spawn(W.spawn.x, W.spawn.z);
  }

  light(axis) {
    const t = this.t % LIGHT_CYCLE;
    if (axis === 'x') return t < 13 ? 'G' : t < 16 ? 'Y' : 'R';
    return t < 16 ? 'R' : t < 29 ? 'G' : t < 32 ? 'Y' : 'R';
  }

  spawn(px, pz) {
    const rng = this.rng;
    const type = rng.weighted(Object.entries(TYPES).map(([k, v]) => [k, v.w]));
    const T = TYPES[type];
    for (let tries = 0; tries < 40; tries++) {
      const road = rng.weighted(this.roadPool);
      if (road.kind === 'lane' && !T.small && rng.chance(0.6)) continue;
      const lo = Math.max(road.a0 + 10, -300), hi = Math.min(road.a1 - 10, 300);
      if (hi <= lo) continue;
      const s = rng.range(lo, hi);
      if (road.inters.some((it) => Math.abs(it.s - s) < it.other.hw + 8)) continue;
      const dir = rng.chance(0.5) ? 1 : -1;
      const off = laneOff(road, T.small);
      const [x, z] = lanePos(road, s, dir, off);
      if (Math.hypot(x - px, z - pz) < 35) continue;
      if (this.list.some((o) => Math.hypot(o.x - x, o.z - z) < 14)) continue;
      let geo;
      if (type === 'car') geo = MD.sedanGeo(rng.pick(MD.CAR_COLORS));
      else if (type === 'van') geo = MD.vanGeo(rng.pick(['#e8e8e6', '#c7c9cb', '#e8e8e6', '#5f86b8']));
      else if (type === 'truck') geo = MD.truckGeo();
      else if (type === 'trike') geo = MD.trikeGeo(rng.pick(['#c4241d', '#2f63a8', '#3d8a4a']));
      else geo = MD.ebikeRiderGeo(rng.pick(MD.BIKE_COLORS));
      const mesh = new THREE.Mesh(geo, T.small ? this.M.vc : this.M.vcShiny);
      mesh.castShadow = true;
      if (!T.small) {
        const hl = new THREE.Mesh(lampGeo(T.len, T.wid, type === 'van' ? 0.78 : 0.76), this.headMat);
        const tl = new THREE.Mesh(lampGeo(T.len, T.wid, 0.8), this.tailMat);
        tl.rotation.y = Math.PI;
        mesh.add(hl, tl);
      }
      this.scene.add(mesh);
      const a = {
        type, mesh, len: T.len, wid: T.wid, vmax: T.vmax * rng.range(0.85, 1.1), small: T.small,
        road, dir, off, s, x, z, h: roadHeading(road, dir), v: T.vmax * 0.6,
        turn: null, plan: null, planI: null, lastI: null, stuck: 0, ghost: 0, honkCd: 0, blockT: 0,
      };
      this.list.push(a);
      this.place(a);
      return a;
    }
    return null;
  }

  place(a) {
    a.mesh.position.set(a.x, 0.01, a.z);
    a.mesh.rotation.y = a.h;
  }

  nextInter(a) {
    const its = a.road.inters;
    if (a.dir > 0) {
      for (const it of its) if (it.s > a.s - 0.5 && it.I !== a.lastI) return it;
    } else {
      for (let i = its.length - 1; i >= 0; i--) if (its[i].s < a.s + 0.5 && its[i].I !== a.lastI) return its[i];
    }
    return null;
  }

  options(a, it) {
    const r = a.road, o = it.other, opts = [];
    const ahead = a.dir > 0 ? r.a1 - it.s : it.s - r.a0;
    if (ahead > o.hw + 8) opts.push(['S', 50]);
    const rightDir = r.axis === 'x' ? a.dir : -a.dir;
    for (const [k, nd, w] of [['R', rightDir, 27], ['L', -rightDir, 23]]) {
      const room = nd > 0 ? o.a1 - it.os : it.os - o.a0;
      if (room > r.hw + 8 && !(o.kind === 'lane' && !a.small && this.rng.chance(0.7))) opts.push([k, w, nd]);
    }
    return opts;
  }

  makeTurn(a, it, nd, kind) {
    const o = it.other;
    const offN = laneOff(o, a.small);
    const exitS = it.os + nd * (a.road.hw + 2.0);
    const p2 = lanePos(o, exitS, nd, offN);
    const corner = lanePos(o, 0, nd, offN);
    const p1 = a.road.axis === 'x' ? [corner[0], a.z] : [a.x, corner[1]];
    const T = { p0: [a.x, a.z], p1, p2, t: 0, road: o, dir: nd, off: offN, s: exitS, I: it.I, vlim: kind === 'R' ? 4.2 : 5.5 };
    T.len = bezLen(T);
    a.turn = T;
  }

  makeUTurn(a) {
    const r = a.road;
    const p2 = lanePos(r, a.s, -a.dir, a.off);
    const p1 = lanePos(r, a.s + a.dir * 7, a.dir, 0);
    const T = { p0: [a.x, a.z], p1, p2, t: 0, road: r, dir: -a.dir, off: a.off, s: a.s, I: null, vlim: 3.5 };
    T.len = bezLen(T);
    a.turn = T;
  }

  update(dt, player, peds) {
    this.t += dt;
    this.events.length = 0;
    const px = player.pos.x, pz = player.pos.z;
    for (const a of this.list) {
      let target = a.vmax;
      if (a.turn) target = Math.min(target, a.turn.vlim);
      const fx = Math.sin(a.h), fz = Math.cos(a.h);
      let gap = 1e9, byPlayer = false, redStop = false;
      const check = (x, z, l, w, isPlayer) => {
        const dx = x - a.x, dz = z - a.z;
        const along = dx * fx + dz * fz;
        if (along <= 0 || along > 28) return;
        const lat = Math.abs(dx * fz - dz * fx);
        if (lat > (a.wid + w) / 2 + 0.35) return;
        const g = along - (a.len + l) / 2;
        if (g < gap) { gap = g; byPlayer = !!isPlayer; }
      };
      if (a.ghost <= 0) {
        for (const b of this.list) if (b !== a && Math.abs(b.x - a.x) < 30 && Math.abs(b.z - a.z) < 30) check(b.x, b.z, b.len, b.wid, false);
        check(px, pz, 1.8, 0.8, true);
        for (const p of peds) if (Math.abs(p.x - a.x) < 12 && Math.abs(p.z - a.z) < 12) check(p.x, p.z, 0.5, 0.5, false);
        target = Math.min(target, Math.max(0, (gap - 2.0) * 0.9));
      }

      // 红绿灯
      if (!a.turn && (a.road === MAIN_X || a.road === MAIN_Z)) {
        const it = a.road.inters.find((q) => q.other === (a.road === MAIN_X ? MAIN_Z : MAIN_X));
        const stopS = it.s - a.dir * (it.other.hw + 4.3);
        const front = a.s + (a.dir * a.len) / 2;
        const dist = (stopS - front) * a.dir;
        const st = this.light(a.road.axis);
        if (dist > -0.5 && dist < 45 && (st === 'R' || (st === 'Y' && dist > 5))) {
          target = Math.min(target, Math.max(0, dist * 0.8 - 0.2));
          redStop = true;
        }
      }

      // 提前决定在下一个路口怎么走，转弯前减速
      if (!a.turn) {
        const it = this.nextInter(a);
        if (it) {
          const entry = it.other.hw + 2.0;
          const distTo = (it.s - a.s) * a.dir;
          if (a.planI !== it && distTo < entry + 25) {
            const opts = this.options(a, it);
            a.planI = it;
            a.plan = opts.length ? this.rng.weighted(opts.map((o) => [o, o[1]])) : null;
          }
          if (a.planI === it && a.plan && a.plan[0] !== 'S') {
            target = Math.min(target, (a.plan[0] === 'R' ? 4.2 : 5.5) + Math.max(0, distTo - entry) * 0.5);
          }
          if (a.planI === it && distTo <= entry) {
            if (!a.plan) this.makeUTurn(a);
            else if (a.plan[0] === 'S') a.lastI = it.I;
            else this.makeTurn(a, it, a.plan[2], a.plan[0]);
            a.planI = null;
          }
        } else {
          const toEnd = a.dir > 0 ? a.road.a1 - a.s : a.s - a.road.a0;
          if (toEnd < 8) this.makeUTurn(a);
        }
      }

      // 加减速
      if (a.v < target) a.v = Math.min(target, a.v + 2.3 * dt);
      else a.v = Math.max(target, a.v - 7.5 * dt);
      if (a.ghost > 0) { a.ghost -= dt; a.v = Math.max(a.v, 2.5); }
      if (a.v < 0.2 && !redStop) a.stuck += dt; else a.stuck = 0;
      if (a.stuck > 8 && !byPlayer) { a.ghost = 3; a.stuck = 0; }

      // 被玩家挡住就按喇叭
      a.honkCd -= dt;
      if (byPlayer && a.v < 1.5 && gap < 6) a.blockT += dt; else a.blockT = 0;
      if (a.blockT > 1.8 && a.honkCd <= 0) {
        a.honkCd = 3 + this.rng.next() * 3;
        this.events.push({ type: 'honk', small: a.small, dist: Math.hypot(a.x - px, a.z - pz) });
      }

      this.advance(a, a.v * dt);
      this.place(a);
    }
    // 给玩家碰撞用的圆
    const C = this.circles;
    let k = 0;
    for (const a of this.list) {
      if (Math.abs(a.x - px) > 15 || Math.abs(a.z - pz) > 15) continue;
      const fx = Math.sin(a.h), fz = Math.cos(a.h);
      const n = a.small && a.type === 'ebike' ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const o = C[k] || (C[k] = { t: 1, x: 0, z: 0, r: 0, h: 3 });
        const off = n === 1 ? 0 : (i === 0 ? 1 : -1) * a.len * 0.27;
        o.x = a.x + fx * off; o.z = a.z + fz * off; o.r = a.wid / 2 + 0.05; o.hit = false; o.owner = a;
        k++;
      }
    }
    C.length = k;
    return this.events;
  }

  advance(a, d) {
    if (a.turn) {
      const T = a.turn;
      T.t += d / T.len;
      if (T.t >= 1) {
        a.road = T.road; a.dir = T.dir; a.off = T.off; a.s = T.s; a.lastI = T.I;
        a.turn = null;
        a.h = roadHeading(a.road, a.dir);
        [a.x, a.z] = lanePos(a.road, a.s, a.dir, a.off);
      } else {
        [a.x, a.z] = bez(T, T.t);
        const tg = bezTan(T, T.t);
        if (Math.hypot(tg[0], tg[1]) > 1e-4) a.h = Math.atan2(tg[0], tg[1]);
      }
      return;
    }
    a.s += a.dir * d;
    [a.x, a.z] = lanePos(a.road, a.s, a.dir, a.off);
    a.h = roadHeading(a.road, a.dir);
  }

  setNight(head, tail) {
    this.headMat.emissiveIntensity = head;
    this.tailMat.emissiveIntensity = tail;
  }
}
