import * as THREE from 'three';
import { clamp, damp } from './util.js';
import { buildPlayerScooter } from './models.js';
import { onRoad } from './layout.js';

// 电动助动车：自行车运动学模型 + 过弯侧倾 + 简单碰撞
export const MAX_SPEED = 12.5;      // 45 km/h
const WHEELBASE = 1.28;
const RADIUS = 0.5;

export class Player {
  constructor(scene, M, W) {
    this.W = W;
    this.m = buildPlayerScooter(M);
    scene.add(this.m.root);
    this.headlight = new THREE.SpotLight(0xfff0d0, 0, 55, 0.6, 0.45, 1.2);
    this.headlight.position.set(0, 1.0, -0.05);
    this.headlight.target.position.set(0, 0, 14);
    this.m.fork.add(this.headlight, this.headlight.target);
    this.pos = { x: 0, z: 0 };
    this.y = 0;
    this.heading = 0;
    this.v = 0;
    this.steer = 0;
    this.delta = 0;
    this.lean = 0;
    this.odo = 0;
    this.surface = 'road';
    this.t = 0;
    this.tailBase = 0.3;
    this.reset(W.spawn.x, W.spawn.z, W.spawn.h);
  }

  reset(x, z, h) {
    this.pos.x = x; this.pos.z = z; this.heading = h;
    this.v = 0; this.steer = 0; this.lean = 0;
    this.y = this.W.ground.heightAt(x, z);
    this.sync();
  }

  get forward() { return [Math.sin(this.heading), Math.cos(this.heading)]; }

  getSurface() {
    if (onRoad(this.pos.x, this.pos.z)) return 'road';
    if (this.W.ground.heightAt(this.pos.x, this.pos.z) > 0) return 'walk';
    return 'dirt';
  }

  update(dt, inp, dynamic) {
    const ev = { impact: 0 };
    this.t += dt;
    this.surface = this.getSurface();
    const dirt = this.surface === 'dirt';
    const maxV = dirt ? 6.5 : MAX_SPEED;
    let v = this.v;
    const thr = inp.throttle, brk = inp.brake;

    if (thr > 0 && v >= -0.05) {
      const a = 3.3 * (1 - Math.pow(Math.max(0, v) / maxV, 2)) + 0.2;
      v += a * thr * dt;
    }
    if (brk > 0) {
      if (v > 0.1) v -= 8.0 * dt;
      else if (thr === 0) v = Math.max(-1.8, v - 2.2 * dt); // 慢慢往后退
    }
    if (inp.handbrake) v = v > 0 ? Math.max(0, v - 11 * dt) : Math.min(0, v + 11 * dt);
    const drag = (dirt ? 1.3 : 0.22) + 0.006 * v * v;
    if (v > 0) v = Math.max(0, v - drag * dt * (thr > 0 ? 0.35 : 1));
    else if (v < 0 && brk === 0) v = Math.min(0, v + 2.0 * dt);
    if (v > maxV) v = damp(v, maxV, 2.5, dt);

    // 转向
    this.steer = damp(this.steer, inp.steer, 7, dt);
    const sp = Math.abs(v);
    // 转向角上限随车速减小：侧向加速度不超过约 0.9g
    const maxSteer = Math.min(0.62, Math.atan((9 * WHEELBASE) / Math.max(sp * sp, 0.01)));
    this.delta = this.steer * maxSteer;
    const yawRate = (v / WHEELBASE) * Math.tan(this.delta);
    this.heading += yawRate * dt;

    // 移动 + 碰撞
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.pos.x += fx * v * dt;
    this.pos.z += fz * v * dt;
    const n = this.W.col.resolve(this.pos, RADIUS, dynamic);
    if (n) {
      const dot = fx * n[0] + fz * n[1];
      const into = -dot * v;
      if (into > 0) {
        ev.impact = into;
        v *= 1 - Math.min(1, Math.abs(dot)) * 0.92;
      }
    }
    this.v = v;
    this.odo += Math.abs(v) * dt;

    // 侧倾
    const leanTarget = clamp(-Math.atan2(v * yawRate, 9.8), -0.6, 0.6);
    this.lean = damp(this.lean, leanTarget, 6, dt);

    // 地面高度（上下马路牙子）
    const g = this.W.ground.heightAt(this.pos.x, this.pos.z);
    this.y = g > this.y ? damp(this.y, g, 30, dt) : damp(this.y, g, 14, dt);

    // 灯
    const tail = this.m.tail.material;
    tail.emissiveIntensity = brk > 0 || inp.handbrake ? 2.5 : this.tailBase;

    this.sync(dt);
    return ev;
  }

  sync(dt = 0) {
    const m = this.m;
    let bob = 0;
    if (this.surface === 'dirt') bob = Math.sin(this.t * 17) * 0.018 * Math.min(1, Math.abs(this.v) / 3);
    m.root.position.set(this.pos.x, this.y + bob, this.pos.z);
    m.root.rotation.y = this.heading;
    m.lean.rotation.z = this.lean;
    m.fork.rotation.y = this.delta * 0.9;
    const spin = (this.v / 0.24) * dt;
    m.frontWheel.rotation.x += spin;
    m.rearWheel.rotation.x += spin;
  }
}
