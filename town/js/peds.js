import * as THREE from 'three';
import { pedGeos } from './models.js';
import { RNG } from './util.js';

// 人行道上走来走去的路人，以及广场上跳广场舞的阿姨们
export class Peds {
  constructor(scene, M, W, count = 80) {
    this.W = W;
    this.list = [];
    this.circles = [];
    this.t = 0;
    const rng = (this.rng = new RNG(4242));
    const variants = [];
    for (let i = 0; i < 14; i++) {
      variants.push(pedGeos({ old: rng.chance(0.3), long: rng.chance(0.3), bag: rng.chance(0.3) }));
    }
    const paths = W.pedPaths.map((p) => ({ ...p, len: Math.hypot(p.x1 - p.x0, p.z1 - p.z0) })).filter((p) => p.len > 6);
    const pool = paths.map((p) => [p, p.len * (p.sp || 1)]);
    for (let i = 0; i < count && pool.length; i++) {
      const path = rng.weighted(pool);
      const v = rng.pick(variants);
      const p = this.make(scene, M, v, rng.range(0.92, 1.06));
      p.path = path;
      p.d = rng.range(0, path.len);
      p.dir = rng.chance(0.5) ? 1 : -1;
      p.speed = rng.range(0.9, 1.45);
      p.lat = rng.range(-0.35, 0.35);
      p.pause = rng.chance(0.2) ? rng.range(1, 8) : 0;
      this.list.push(p);
    }
    // 广场舞
    this.dancers = [];
    if (W.dancers) {
      const bright = ['#d0243c', '#e2558a', '#8e3fb5', '#e66b2a', '#2f7fd0', '#e8c23a'];
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 5; c++) {
          const v = pedGeos({ old: true, top: rng.pick(bright), pants: '#1e1e1e' });
          const p = this.make(scene, M, v, rng.range(0.92, 1.0));
          p.x = W.dancers.x + (c - 2) * 1.6 + rng.range(-0.15, 0.15);
          p.z = W.dancers.z + (r - 1.5) * 1.6;
          p.h = W.dancers.facing;
          p.phase = rng.range(0, 0.4);
          this.dancers.push(p);
        }
      }
    }
  }

  make(scene, M, v, scale) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(v.body, M.vc);
    const legL = new THREE.Mesh(v.leg, M.vc);
    const legR = new THREE.Mesh(v.leg, M.vc);
    legL.position.set(0.09, 0.84, 0);
    legR.position.set(-0.09, 0.84, 0);
    body.castShadow = legL.castShadow = legR.castShadow = true;
    g.add(body, legL, legR);
    g.scale.setScalar(scale);
    scene.add(g);
    return { g, body, legL, legR, x: 0, z: 0, h: 0, walk: 0, phase: 0 };
  }

  update(dt, player) {
    this.t += dt;
    const px = player.pos.x, pz = player.pos.z, pv = Math.abs(player.v);
    const ground = this.W.ground;
    for (const p of this.list) {
      const P = p.path;
      const ux = (P.x1 - P.x0) / P.len, uz = (P.z1 - P.z0) / P.len;
      let moving = p.pause <= 0;
      if (p.pause > 0) p.pause -= dt;
      // 车太近就停下来看着
      const dxp = px - p.x, dzp = pz - p.z;
      const dp = Math.hypot(dxp, dzp);
      const fx = ux * p.dir, fz = uz * p.dir;
      if (dp < 2.6 && dxp * fx + dzp * fz > -0.3 && pv > 0.3) moving = false;
      if (moving) {
        p.d += p.dir * p.speed * dt;
        if (p.d < 0 || p.d > P.len) {
          p.d = Math.max(0, Math.min(P.len, p.d));
          p.dir *= -1;
          if (this.rng.chance(0.5)) p.pause = this.rng.range(0.5, 4);
        } else if (this.rng.chance(dt * 0.025)) p.pause = this.rng.range(2, 7);
        p.walk += p.speed * dt * 5.2;
        p.h = Math.atan2(ux * p.dir, uz * p.dir);
      } else {
        p.walk = 0;
        if (dp < 6) p.h = turnTo(p.h, Math.atan2(dxp, dzp), dt * 3);
      }
      p.x = P.x0 + ux * p.d - uz * p.lat;
      p.z = P.z0 + uz * p.d + ux * p.lat;
      const sw = moving ? Math.sin(p.walk) * 0.45 : 0;
      p.legL.rotation.x = sw;
      p.legR.rotation.x = -sw;
      p.g.position.set(p.x, ground.heightAt(p.x, p.z) + (moving ? Math.abs(Math.cos(p.walk)) * 0.03 : 0), p.z);
      p.g.rotation.y = p.h;
    }
    // 广场舞：踏步、摆身子
    const beat = this.t * 2.1;
    for (const p of this.dancers) {
      const b = beat + p.phase;
      const step = Math.sin(b * Math.PI);
      p.legL.rotation.x = Math.max(0, step) * 0.5;
      p.legR.rotation.x = Math.max(0, -step) * 0.5;
      p.body.rotation.z = Math.sin(b * Math.PI * 0.5) * 0.12;
      const turn = Math.floor(b / 8) % 4;
      p.g.rotation.y = p.h + [0, Math.PI / 2, Math.PI, -Math.PI / 2][turn] * 0.25 + Math.sin(b * Math.PI * 0.5) * 0.25;
      p.g.position.set(p.x, 0.15 + Math.abs(step) * 0.04, p.z);
    }
    // 给玩家碰撞用
    const C = this.circles;
    let k = 0;
    for (const arr of [this.list, this.dancers]) {
      for (const p of arr) {
        if (Math.abs(p.x - px) > 6 || Math.abs(p.z - pz) > 6) continue;
        const o = C[k] || (C[k] = { t: 1, x: 0, z: 0, r: 0.32, h: 2 });
        o.x = p.x; o.z = p.z; o.hit = false; o.ped = p;
        k++;
      }
    }
    C.length = k;
  }
}

function turnTo(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, k);
}
