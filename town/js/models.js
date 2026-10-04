import * as THREE from 'three';
import { ModelBuilder } from './util.js';

// 约定：模型前方为 +z，原点在地面。注意：朝 +z 时左手边是 +x。

// ---------------- 骑手（坐姿） ----------------
function rider(mb, c, oz = 0, oy = 0, hands = 0.37) {
  const { skin, top, pants, shoes, helmet } = c;
  mb.box(0.32, 0.16, 0.26, pants, 0, 0.92 + oy, -0.38 + oz);
  for (const s of [-1, 1]) {
    mb.limb(s * 0.1, 0.93 + oy, -0.32 + oz, s * 0.15, 0.98 + oy, 0.06 + oz, 0.075, pants);
    mb.limb(s * 0.15, 0.98 + oy, 0.06 + oz, s * 0.13, 0.43 + oy, 0.12 + oz, 0.062, pants);
    mb.box(0.11, 0.08, 0.24, shoes, s * 0.13, 0.40 + oy, 0.17 + oz);
    mb.limb(s * 0.21, 1.42 + oy, -0.28 + oz, s * 0.25, 1.2 + oy, -0.05 + oz, 0.056, top);
    mb.limb(s * 0.25, 1.2 + oy, -0.05 + oz, s * 0.27, 1.02 + oy, hands + oz, 0.048, c.shortSleeve ? skin : top);
    if (c.shortSleeve) mb.limb(s * 0.21, 1.42 + oy, -0.28 + oz, s * 0.235, 1.3 + oy, -0.17 + oz, 0.068, top);
    if (c.stripe) {
      mb.limb(s * 0.17, 0.97 + oy, -0.32 + oz, s * 0.222, 1.02 + oy, 0.06 + oz, 0.007, c.stripe, 4);
      mb.limb(s * 0.205, 1.02 + oy, 0.06 + oz, s * 0.185, 0.47 + oy, 0.12 + oz, 0.007, c.stripe, 4);
    }
    mb.sphere(0.045, skin, s * 0.27, 1.02 + oy, hands + oz, 1, 1, 1, 0);
  }
  mb.box(0.38, 0.52, 0.22, top, 0, 1.2 + oy, -0.33 + oz, 0.18);
  mb.cyl(0.05, 0.05, 0.1, 6, skin, 0, 1.5 + oy, -0.27 + oz);
  mb.sphere(0.11, skin, 0, 1.61 + oy, -0.24 + oz, 0.95, 1.08, 1, 1);
  if (helmet) {
    mb.sphere(0.135, helmet, 0, 1.66 + oy, -0.26 + oz, 1, 0.78, 1.08, 1);
  } else {
    mb.sphere(0.118, c.hair || '#1d1a17', 0, 1.655 + oy, -0.255 + oz, 1, 0.74, 1.06, 1);
  }
  if (c.glasses) {
    mb.box(0.15, 0.03, 0.012, '#151515', 0, 1.62 + oy, -0.137 + oz);
    for (const s of [-1, 1]) mb.box(0.012, 0.012, 0.12, '#151515', s * 0.1, 1.625 + oy, -0.2 + oz);
  }
}


// 按位置合并法线，夹角小于 crease 的面平滑过渡（挤出体看起来圆润）
function smoothNormals(geo, crease = 0.6) {
  const g = geo;
  const pos = g.attributes.position, nor = g.attributes.normal;
  const idx = g.index;
  const n = idx ? idx.count : pos.count;
  const get = (i) => (idx ? idx.getX(i) : i);
  const faceN = [];
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    va.fromBufferAttribute(pos, get(i)); vb.fromBufferAttribute(pos, get(i + 1)); vc.fromBufferAttribute(pos, get(i + 2));
    faceN.push(vc.sub(vb).cross(va.sub(vb)).normalize().clone());
  }
  const key = (i) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  const buckets = new Map();
  for (let i = 0; i < n; i++) {
    const k = key(get(i));
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(i);
  }
  const out = new Float32Array(n * 3);
  const cos = Math.cos(crease);
  const acc = new THREE.Vector3();
  for (const list of buckets.values()) {
    for (const i of list) {
      const fi = faceN[(i / 3) | 0];
      acc.set(0, 0, 0);
      for (const j of list) { const fj = faceN[(j / 3) | 0]; if (fi.dot(fj) >= cos) acc.add(fj); }
      acc.normalize();
      out[i * 3] = acc.x; out[i * 3 + 1] = acc.y; out[i * 3 + 2] = acc.z;
    }
  }
  // 展开成非索引几何，写回法线
  if (idx) {
    const ng = g.toNonIndexed();
    g.setIndex(null);
    g.setAttribute('position', ng.attributes.position);
    if (ng.attributes.uv) g.setAttribute('uv', ng.attributes.uv);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  g.clearGroups();
  return g;
}

// ---------------- 玩家的助动车（运动款“鬼火”） ----------------
// 深蓝紫金属漆、棱角车壳、上翘的尾巴、裸露车把、金色前叉、红色后避震、蓝色氛围灯
export function buildPlayerScooter(M) {
  const root = new THREE.Group();
  const lean = new THREE.Group();
  root.add(lean);
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.08, ...o });
  const BODY = std(0x383c9e, { roughness: 0.3, metalness: 0.2 });
  const GLOSS = std(0x101114, { roughness: 0.25, metalness: 0.3 });
  const MATTE = std(0x1a1b1e, { roughness: 0.85 });
  const RUBBER = std(0x0d0d0d, { roughness: 0.95 });
  const CHROME = std(0xe2e6ea, { roughness: 0.25, metalness: 0.45 });
  const GOLD = std(0xe0b43a, { roughness: 0.3, metalness: 0.4 });
  const RED = std(0xc62828, { roughness: 0.4, metalness: 0.3 });
  const LED = std(0x2a4dff, { emissive: 0x3a62ff, emissiveIntensity: 0.8 });
  const HEAD = std(0xf4f6ff, { emissive: 0xeaf0ff, emissiveIntensity: 0.4 });
  const TAIL = std(0x8a1010, { emissive: 0xff2010, emissiveIntensity: 0.3 });
  const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const limb = (parent, a, b, r, mat, seg = 8) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const d = vb.clone().sub(va);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), mat);
    m.position.copy(va).add(vb).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  const R = 0.29;
  function wheel(motor) {
    const g = new THREE.Group();
    add(g, new THREE.TorusGeometry(R - 0.075, 0.075, 10, 26), RUBBER, 0, 0, 0, 0, Math.PI / 2, 0);
    add(g, new THREE.CylinderGeometry(R - 0.1, R - 0.1, 0.07, 22, 1, true), GLOSS, 0, 0, 0, 0, 0, Math.PI / 2);
    add(g, new THREE.TorusGeometry(R - 0.1, 0.008, 4, 26), RED, 0.036, 0, 0, 0, Math.PI / 2, 0); // 轮圈红线
    for (let i = 0; i < 5; i++) add(g, B(0.03, R * 1.5, 0.035), GLOSS, 0, 0, 0, (i / 5) * Math.PI * 2, 0, 0).geometry.translate(0, R * 0.38, 0);
    add(g, new THREE.CylinderGeometry(motor ? 0.11 : 0.05, motor ? 0.11 : 0.05, motor ? 0.13 : 0.1, 16), motor ? MATTE : CHROME, 0, 0, 0, 0, 0, Math.PI / 2);
    add(g, new THREE.CylinderGeometry(0.13, 0.13, 0.008, 20), CHROME, motor ? -0.075 : 0.06, 0, 0, 0, 0, Math.PI / 2); // 刹车盘
    return g;
  }
  const rearWheel = wheel(true);
  rearWheel.position.set(0, R, -0.68);
  lean.add(rearWheel);

  // 后摇臂 + 红色避震
  add(lean, B(0.05, 0.08, 0.5), MATTE, -0.1, 0.36, -0.46, -0.15);
  limb(lean, [0.1, R + 0.05, -0.62], [0.1, 0.74, -0.42], 0.022, GOLD);
  for (let i = 0; i < 7; i++) add(lean, new THREE.TorusGeometry(0.035, 0.008, 4, 10), RED, 0.1, R + 0.12 + i * 0.05, -0.59 + i * 0.026, Math.PI / 2 - 0.45);

  // 车身：侧面轮廓曲线挤出 + 圆角倒边，做出流线型车壳
  // 轮廓坐标 (z 前后, y 高度)，沿 x 方向挤出 width，居中
  const ext = (draw, width, mat, bevel = 0.04, x = 0) => {
    const sh = new THREE.Shape();
    draw(sh);
    const g = new THREE.ExtrudeGeometry(sh, {
      depth: width, curveSegments: 20, bevelEnabled: bevel > 0,
      bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 5,
    });
    g.translate(0, 0, -width / 2);
    g.rotateY(-Math.PI / 2);
    g.translate(x, 0, 0);
    smoothNormals(g);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    lean.add(m);
    return m;
  };
  const strip = (a, b, s) => limb(lean, [s * a[0], a[1], a[2]], [s * b[0], b[1], b[2]], 0.009, LED, 5);

  // 座下主车壳：前沿向后上方扫，尾巴一路上翘到尖
  ext((p) => {
    p.moveTo(-0.16, 0.40);
    p.bezierCurveTo(-0.19, 0.62, -0.24, 0.78, -0.36, 0.82);
    p.lineTo(-0.66, 0.84);
    p.bezierCurveTo(-0.86, 0.88, -1.04, 0.99, -1.25, 1.09);
    p.quadraticCurveTo(-1.27, 1.04, -1.22, 1.0);
    p.bezierCurveTo(-1.06, 0.92, -0.96, 0.8, -0.88, 0.71);
    p.quadraticCurveTo(-0.68, 0.65, -0.5, 0.57);
    p.quadraticCurveTo(-0.3, 0.43, -0.16, 0.40);
  }, 0.27, BODY, 0.045);
  // 下半截黑色亮面饰板，斜线分色
  ext((p) => {
    p.moveTo(-0.15, 0.39);
    p.lineTo(-0.25, 0.6);
    p.lineTo(-0.84, 0.72);
    p.quadraticCurveTo(-0.66, 0.63, -0.5, 0.56);
    p.quadraticCurveTo(-0.3, 0.42, -0.15, 0.39);
  }, 0.3, GLOSS, 0.04);
  for (const s of [-1, 1]) {
    strip([0.2, 0.6, -0.25], [0.2, 0.72, -0.84], s);   // 分色线上的氛围灯
    strip([0.165, 0.9, -0.9], [0.13, 1.04, -1.2], s);   // 尾巴两侧
  }
  // 座垫：前低后高的分体座
  ext((p) => {
    p.moveTo(-0.24, 0.84);
    p.quadraticCurveTo(-0.25, 0.94, -0.36, 0.94);
    p.lineTo(-0.62, 0.93);
    p.quadraticCurveTo(-0.7, 0.93, -0.73, 0.99);
    p.lineTo(-0.97, 1.06);
    p.quadraticCurveTo(-1.03, 1.06, -1.0, 1.0);
    p.lineTo(-0.66, 0.86);
    p.lineTo(-0.36, 0.83);
  }, 0.22, RUBBER, 0.04);
  // 尾灯、转向灯、车牌
  add(lean, B(0.17, 0.035, 0.05), TAIL, 0, 1.06, -1.255, 0.9);
  for (const s of [-1, 1]) add(lean, B(0.05, 0.03, 0.05), std(0xffa21a, { emissive: 0xff8000, emissiveIntensity: 0.25 }), s * 0.11, 1.0, -1.2, 0.9);
  limb(lean, [0, 0.98, -1.12], [0, 0.66, -1.12], 0.012, GLOSS, 5);
  add(lean, B(0.18, 0.11, 0.01), std(0xeef2f6), 0, 0.62, -1.13, 0.15);
  add(lean, B(0.17, 0.02, 0.012), std(0x1f5fa8), 0, 0.66, -1.136, 0.15);
  add(lean, B(0.12, 0.025, 0.4), GLOSS, 0, R + 0.18, -0.8, 0.45); // 后挡泥

  // 底盘 + 脚踏板
  ext((p) => {
    p.moveTo(0.3, 0.3); p.lineTo(-0.2, 0.3); p.quadraticCurveTo(-0.26, 0.3, -0.24, 0.42);
    p.lineTo(0.32, 0.42); p.quadraticCurveTo(0.36, 0.36, 0.3, 0.3);
  }, 0.26, BODY, 0.03);
  add(lean, B(0.32, 0.03, 0.48), RUBBER, 0, 0.445, 0.06);
  for (let i = 0; i < 6; i++) add(lean, B(0.28, 0.01, 0.02), MATTE, 0, 0.463, -0.14 + i * 0.08);
  add(lean, B(0.32, 0.03, 0.02), LED, 0, 0.29, 0.3);                // 底部蓝光

  // 前护板 + 车头：从脚踏板前沿一路弧形扫到上翘的车鼻
  ext((p) => {
    p.moveTo(0.27, 0.36);
    p.quadraticCurveTo(0.46, 0.39, 0.55, 0.6);
    p.bezierCurveTo(0.63, 0.79, 0.67, 0.92, 0.61, 1.03);
    p.quadraticCurveTo(0.55, 1.08, 0.47, 1.06);
    p.bezierCurveTo(0.4, 0.95, 0.3, 0.8, 0.26, 0.52);
  }, 0.34, BODY, 0.055);
  // 车鼻下方黑色导流
  ext((p) => {
    p.moveTo(0.5, 0.52); p.quadraticCurveTo(0.6, 0.66, 0.63, 0.82); p.lineTo(0.58, 0.8); p.quadraticCurveTo(0.55, 0.66, 0.47, 0.54);
  }, 0.3, GLOSS, 0.03);
  // 内侧护板（骑手腿前面）
  ext((p) => {
    p.moveTo(0.25, 0.44); p.bezierCurveTo(0.29, 0.75, 0.37, 0.93, 0.45, 1.04); p.lineTo(0.42, 1.04); p.bezierCurveTo(0.34, 0.93, 0.26, 0.75, 0.22, 0.44);
  }, 0.36, MATTE, 0.02);
  // 双眼大灯（贴着车鼻斜面）+ 眉灯
  const headlight = add(lean, B(0.12, 0.045, 0.03), HEAD, 0.095, 0.95, 0.655, -0.45, 0.35);
  add(lean, B(0.12, 0.045, 0.03), HEAD, -0.095, 0.95, 0.655, -0.45, -0.35);
  add(lean, B(0.24, 0.012, 0.02), LED, 0, 1.01, 0.645, -0.6);
  for (const s of [-1, 1]) {
    add(lean, B(0.05, 0.03, 0.04), std(0xffa21a, { emissive: 0xff8000, emissiveIntensity: 0.25 }), s * 0.2, 0.86, 0.62, -0.45, s * 0.3);
    strip([0.235, 0.62, 0.56], [0.235, 0.98, 0.6], s);  // 前护板侧边灯条
  }

  // 车头（转向）
  const fork = new THREE.Group();
  fork.position.set(0, 0, 0.66);
  lean.add(fork);
  const frontWheel = wheel(false);
  frontWheel.position.set(0, R, 0.08);
  fork.add(frontWheel);
  for (const s of [-1, 1]) {
    limb(fork, [s * 0.085, R, 0.08], [s * 0.085, 0.62, -0.02], 0.03, GOLD);
    limb(fork, [s * 0.085, 0.62, -0.02], [s * 0.085, 1.0, -0.14], 0.022, CHROME);
  }
  add(fork, B(0.13, 0.035, 0.42), BODY, 0, R + 0.17, 0.1, -0.1); // 前挡泥
  // 裸露车把、仪表、后视镜
  limb(fork, [-0.34, 1.13, -0.2], [0.34, 1.13, -0.2], 0.016, GLOSS);
  for (const s of [-1, 1]) {
    limb(fork, [s * 0.26, 1.13, -0.2], [s * 0.36, 1.13, -0.21], 0.024, RUBBER);
    add(fork, new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), CHROME, s * 0.375, 1.13, -0.21, 0, 0, Math.PI / 2);
    limb(fork, [s * 0.2, 1.14, -0.19], [s * 0.25, 1.36, -0.2], 0.007, CHROME, 4);
    add(fork, B(0.13, 0.06, 0.02), GLOSS, s * 0.26, 1.38, -0.2, 0, s * 0.1);
    add(fork, B(0.115, 0.048, 0.005), std(0x9fb2c4, { roughness: 0.1, metalness: 0.8 }), s * 0.26, 1.38, -0.212, 0, s * 0.1);
  }
  add(fork, B(0.18, 0.05, 0.11), GLOSS, 0, 1.16, -0.12, -0.5);
  add(fork, B(0.13, 0.005, 0.07), LED, 0, 1.188, -0.12, -0.5);    // 液晶仪表

  // 挡风被（B 键切换）
  const quilt = new THREE.Group();
  lean.add(quilt);
  add(quilt, B(0.7, 0.78, 0.06), M.plaid, 0, 0.74, 0.48, -0.25);
  for (const s of [-1, 1]) {
    add(quilt, B(0.06, 0.58, 0.5), M.plaid, s * 0.36, 0.72, 0.22, -0.1);
    add(quilt, B(0.18, 0.16, 0.24), M.plaid, s * 0.32, 1.12, 0.44);
  }
  quilt.visible = false;

  // 骑手：橙色 T 恤、黑色运动裤、白鞋、眼镜。G 键切换头盔
  const look = { skin: '#d9a982', top: '#e2582b', pants: '#17181b', shoes: '#f0f0ec', stripe: '#e8e8e4', shortSleeve: true, glasses: true };
  const mk = (helmet) => {
    const mb = new ModelBuilder();
    rider(mb, { ...look, helmet }, 0.01, 0.07, 0.45);
    const m = new THREE.Mesh(mb.build(), M.vc);
    m.castShadow = true;
    lean.add(m);
    return m;
  };
  const riderBare = mk(null);
  const riderHelmet = mk('#f2c230');
  riderHelmet.visible = false;

  // 车底蓝色氛围光（傍晚、夜里才亮）
  const glow = new THREE.PointLight(0x3a62ff, 0, 3.2, 1.6);
  glow.position.set(0, 0.25, -0.1);
  lean.add(glow);

  return { root, lean, fork, frontWheel, rearWheel, quilt, tail: { material: TAIL }, headlight, ledMat: LED, glow, riderBare, riderHelmet };
}

// ---------------- NPC 车辆 ----------------
export const CAR_COLORS = ['#e8e8e6', '#e8e8e6', '#c7c9cb', '#2b2d30', '#9b1d1d', '#3c5f8f', '#b9b2a3', '#5d6a72'];
export const BIKE_COLORS = ['#e9e7e2', '#c4241d', '#2f63a8', '#f2c230', '#6fb7a8', '#e48fb0', '#2b2d30', '#9aa0a6'];
const CLOTH = ['#3c4450', '#7a2e2e', '#2e5e3e', '#5a4a3a', '#2b3a5a', '#8a8a8a', '#b04a6a', '#c48a2a', '#e6e2d8', '#1e1e1e'];
const PANTS = ['#2f3b55', '#1e1e1e', '#4a4a4a', '#5a4a3a', '#33405a'];
const HELMET = ['#f2c230', '#e9e7e2', '#c4241d', '#2f63a8', null, null];
const SKIN = ['#d9a982', '#c99470', '#e0b48f', '#b9845e'];

function pick(a) { return a[(Math.random() * a.length) | 0]; }

function wheelPair(mb, r, w, x, z) {
  for (const s of [-1, 1]) {
    mb.cyl(r, r, w, 12, '#1b1b1b', s * x, r, z, 0, 0, Math.PI / 2);
    mb.cyl(r * 0.55, r * 0.55, w + 0.01, 10, '#9a9ea2', s * x, r, z, 0, 0, Math.PI / 2);
  }
}

export function sedanGeo(color) {
  const mb = new ModelBuilder();
  mb.box(1.76, 0.6, 4.3, color, 0, 0.64, 0);
  mb.box(1.7, 0.1, 4.2, '#262626', 0, 0.37, 0);
  mb.box(1.58, 0.5, 2.25, '#25303a', 0, 1.18, -0.25);
  mb.box(1.5, 0.07, 1.85, color, 0, 1.45, -0.3);
  mb.box(1.6, 0.06, 0.9, color, 0, 0.95, 1.55, -0.12);
  mb.box(1.6, 0.06, 0.6, color, 0, 0.98, -1.8, 0.1);
  for (const s of [-1, 1]) {
    mb.box(0.36, 0.12, 0.05, '#f4f2e6', s * 0.58, 0.76, 2.16);
    mb.box(0.32, 0.12, 0.05, '#a1221b', s * 0.6, 0.8, -2.16);
    mb.box(0.12, 0.08, 0.1, '#222', s * 0.92, 1.05, 0.75);
  }
  mb.box(1.8, 0.22, 0.14, '#3a3a3a', 0, 0.44, 2.18);
  mb.box(1.8, 0.22, 0.14, '#3a3a3a', 0, 0.44, -2.18);
  mb.box(0.62, 0.14, 0.03, '#1c1c1c', 0, 0.66, 2.16);
  mb.box(0.4, 0.12, 0.02, '#f0f0f0', 0, 0.48, 2.26); // 车牌
  wheelPair(mb, 0.31, 0.22, 0.8, 1.35);
  wheelPair(mb, 0.31, 0.22, 0.8, -1.35);
  return mb.build();
}

export function vanGeo(color) {
  const mb = new ModelBuilder();
  mb.box(1.6, 1.42, 3.8, color, 0, 1.04, 0);
  mb.box(1.62, 0.5, 3.0, '#25303a', 0, 1.42, -0.35);
  mb.box(1.5, 0.6, 0.06, '#2a3540', 0, 1.38, 1.9, -0.18);
  mb.box(1.56, 0.06, 3.7, shadeHex(color, 0.9), 0, 1.77, -0.03);
  mb.box(1.62, 0.18, 0.14, '#3a3a3a', 0, 0.42, 1.95);
  mb.box(1.62, 0.18, 0.14, '#3a3a3a', 0, 0.42, -1.95);
  for (const s of [-1, 1]) {
    mb.box(0.28, 0.16, 0.04, '#f4f2e6', s * 0.56, 0.78, 1.91);
    mb.box(0.18, 0.28, 0.04, '#a1221b', s * 0.68, 0.9, -1.91);
  }
  wheelPair(mb, 0.28, 0.2, 0.72, 1.25);
  wheelPair(mb, 0.28, 0.2, 0.72, -1.25);
  return mb.build();
}

export function truckGeo() {
  const mb = new ModelBuilder();
  const blue = '#2f5fa8';
  mb.box(1.75, 1.45, 1.5, blue, 0, 1.28, 1.6);
  mb.box(1.6, 0.55, 0.06, '#25303a', 0, 1.65, 2.36, -0.08);
  mb.box(1.78, 0.5, 1.1, '#25303a', 0, 1.62, 1.55);
  mb.box(1.85, 0.12, 3.2, '#3a3a3a', 0, 0.75, -0.75);
  mb.box(1.85, 0.5, 0.06, blue, 0, 1.06, -2.33);
  for (const s of [-1, 1]) mb.box(0.06, 0.5, 3.2, blue, s * 0.9, 1.06, -0.75);
  mb.box(1.82, 0.2, 0.12, '#2a2a2a', 0, 0.55, 2.38);
  for (const s of [-1, 1]) mb.box(0.3, 0.14, 0.04, '#f4f2e6', s * 0.6, 0.85, 2.37);
  wheelPair(mb, 0.36, 0.24, 0.78, 1.6);
  wheelPair(mb, 0.36, 0.28, 0.78, -1.3);
  return mb.build();
}

function scooterBody(mb, color, oz = 0) {
  const dark = '#2b2d30';
  mb.cyl(0.24, 0.24, 0.1, 12, '#161616', 0, 0.24, -0.62 + oz, 0, 0, Math.PI / 2);
  mb.cyl(0.24, 0.24, 0.1, 12, '#161616', 0, 0.24, 0.66 + oz, 0, 0, Math.PI / 2);
  mb.box(0.34, 0.34, 0.84, color, 0, 0.57, -0.47 + oz);
  mb.box(0.34, 0.06, 0.52, dark, 0, 0.34, 0.08 + oz);
  mb.box(0.44, 0.72, 0.07, color, 0, 0.68, 0.41 + oz, -0.22);
  mb.box(0.3, 0.11, 0.72, '#151515', 0, 0.79, -0.43 + oz);
  mb.box(0.46, 0.14, 0.2, color, 0, 1.0, 0.4 + oz);
  mb.box(0.14, 0.05, 0.42, color, 0, 0.5, 0.68 + oz);
  mb.cyl(0.075, 0.08, 0.05, 10, '#fafaf2', 0, 0.98, 0.52 + oz, Math.PI / 2);
  mb.box(0.14, 0.05, 0.02, '#a1221b', 0, 0.68, -1.04 + oz);
  for (const s of [-1, 1]) mb.box(0.12, 0.06, 0.02, '#151515', s * 0.24, 1.3, 0.36 + oz);
}

export function ebikeRiderGeo(color) {
  const mb = new ModelBuilder();
  scooterBody(mb, color);
  if (Math.random() < 0.4) mb.box(0.38, 0.28, 0.34, '#2b2d30', 0, 0.93, -0.9);
  rider(mb, { skin: pick(SKIN), top: pick(CLOTH), pants: pick(PANTS), shoes: pick(['#e6e6e2', '#222', '#6b4a2a']), helmet: pick(HELMET) });
  return mb.build();
}

export function parkedEbikeGeo(color) {
  const mb = new ModelBuilder();
  scooterBody(mb, color);
  return mb.build();
}

export function trikeGeo(color) {
  const mb = new ModelBuilder();
  const dark = '#2b2d30';
  mb.cyl(0.24, 0.24, 0.1, 12, '#161616', 0, 0.24, 1.15, 0, 0, Math.PI / 2);
  mb.box(0.14, 0.05, 0.42, color, 0, 0.5, 1.17);
  mb.box(0.5, 0.75, 0.08, color, 0, 0.72, 0.85, -0.2);
  mb.box(0.5, 0.14, 0.2, color, 0, 1.02, 0.86);
  mb.box(0.36, 0.06, 0.5, dark, 0, 0.36, 0.55);
  mb.box(0.36, 0.3, 0.5, color, 0, 0.55, 0.0);
  mb.box(0.3, 0.1, 0.45, '#151515', 0, 0.75, 0.05);
  mb.box(1.15, 0.06, 1.45, '#3a3a3a', 0, 0.55, -0.85);
  mb.box(1.15, 0.38, 0.05, color, 0, 0.77, -1.56);
  mb.box(1.15, 0.38, 0.05, color, 0, 0.77, -0.14);
  for (const s of [-1, 1]) mb.box(0.05, 0.38, 1.45, color, s * 0.575, 0.77, -0.85);
  // 车斗里的货
  if (Math.random() < 0.7) {
    for (let i = 0; i < 4; i++) mb.box(0.4, 0.3, 0.4, pick(['#a5804f', '#2f6db5', '#3d9a4a', '#d23c2f', '#e6e2d8']), (i % 2 - 0.5) * 0.5, 0.75, -0.5 - Math.floor(i / 2) * 0.6);
  }
  wheelPair(mb, 0.25, 0.12, 0.5, -0.85);
  rider(mb, { skin: pick(SKIN), top: pick(CLOTH), pants: pick(PANTS), shoes: '#222', helmet: null, hair: pick(['#1d1a17', '#8a8580']) }, 0.48, 0, 0.37);
  return mb.build();
}

// ---------------- 行人 ----------------
export function pedGeos(variant) {
  const top = variant.top || pick(CLOTH), pants = variant.pants || pick(PANTS), skin = pick(SKIN);
  const hair = variant.old ? pick(['#9a9792', '#cfccc7']) : pick(['#1d1a17', '#2b2118', '#3b2a1a']);
  const body = new ModelBuilder();
  body.box(0.36, 0.56, 0.22, top, 0, 1.18, 0);
  body.box(0.34, 0.12, 0.2, pants, 0, 0.88, 0);
  for (const s of [-1, 1]) {
    body.box(0.09, 0.5, 0.11, top, s * 0.235, 1.18, 0, 0, 0, s * -0.06);
    body.sphere(0.045, skin, s * 0.255, 0.9, 0, 1, 1, 1, 0);
  }
  body.cyl(0.05, 0.05, 0.08, 6, skin, 0, 1.49, 0);
  body.sphere(0.11, skin, 0, 1.6, 0, 0.95, 1.1, 1, 1);
  body.sphere(0.118, hair, 0, 1.64, -0.015, 1, variant.long ? 1.2 : 0.75, 1.05, 1);
  if (variant.bag) body.box(0.08, 0.3, 0.26, pick(['#c4241d', '#2f6db5', '#e6e2d8']), -0.27, 0.95, 0);
  const leg = new ModelBuilder();
  leg.box(0.13, 0.78, 0.14, pants, 0, -0.39, 0);
  leg.box(0.12, 0.07, 0.24, pick(['#e6e6e2', '#222', '#6b4a2a']), 0, -0.79, 0.04);
  return { body: body.build(), leg: leg.build() };
}

// ---------------- 道具（实例化） ----------------
export function treeGeo() {
  const mb = new ModelBuilder();
  mb.cyl(0.11, 0.17, 3.2, 7, '#5a4a3a', 0, 1.6, 0);
  mb.limb(0, 2.6, 0, 0.6, 3.6, 0.2, 0.07, '#5a4a3a');
  mb.limb(0, 2.8, 0, -0.5, 3.8, -0.3, 0.07, '#5a4a3a');
  const greens = ['#4f7a35', '#5f8a3e', '#466e30'];
  mb.sphere(1.5, greens[0], 0, 4.4, 0, 1.15, 0.85, 1.1, 1, 0.18);
  mb.sphere(1.1, greens[1], 0.8, 4.0, 0.4, 1, 0.9, 1, 1, 0.18);
  mb.sphere(1.1, greens[2], -0.8, 4.2, -0.3, 1, 0.9, 1, 1, 0.18);
  mb.sphere(1.0, greens[1], 0.1, 5.2, -0.2, 1, 0.8, 1, 1, 0.18);
  return mb.build();
}

export function willowGeo() {
  const mb = new ModelBuilder();
  mb.cyl(0.14, 0.22, 3.0, 7, '#4f4232', 0, 1.5, 0, 0.08);
  const g = ['#7a9a44', '#88a64e', '#6a8a3c'];
  mb.sphere(1.5, g[0], 0, 4.0, 0, 1.1, 0.7, 1.1, 1, 0.15);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    mb.sphere(0.7, g[i % 3], Math.cos(a) * 1.25, 2.9, Math.sin(a) * 1.25, 0.6, 2.0, 0.6, 1, 0.1);
  }
  return mb.build();
}

export function poplarGeo() {
  const mb = new ModelBuilder();
  mb.cyl(0.1, 0.16, 4, 6, '#8a8478', 0, 2, 0);
  mb.sphere(1.1, '#557a38', 0, 6.0, 0, 0.9, 3.0, 0.9, 1, 0.12);
  return mb.build();
}

export function lampPoleGeo() {
  const mb = new ModelBuilder();
  mb.cyl(0.07, 0.11, 7.5, 8, '#8d9196', 0, 3.75, 0);
  mb.cyl(0.18, 0.2, 0.5, 8, '#6b6e72', 0, 0.25, 0);
  mb.limb(0, 7.2, 0, 0, 7.45, 1.6, 0.045, '#8d9196');
  mb.box(0.3, 0.12, 0.6, '#6b6e72', 0, 7.42, 1.65);
  return mb.build();
}
export function lampHeadGeo() {
  const g = new THREE.BoxGeometry(0.24, 0.05, 0.5);
  g.translate(0, 7.34, 1.65);
  return g;
}

export function utilityPoleGeo() {
  const mb = new ModelBuilder();
  mb.cyl(0.11, 0.16, 9, 7, '#a7a49c', 0, 4.5, 0);
  mb.box(1.7, 0.1, 0.1, '#8a8780', 0, 8.4, 0);
  mb.box(1.0, 0.08, 0.08, '#8a8780', 0, 7.6, 0);
  for (const x of [-0.7, 0, 0.7]) mb.cyl(0.04, 0.05, 0.12, 6, '#e8e6df', x, 8.5, 0);
  if (Math.random() < 1) mb.cyl(0.22, 0.22, 0.6, 8, '#6f7377', 0.35, 6.8, 0); // 变压器/接线盒
  return mb.build();
}

export function binGeo() {
  const mb = new ModelBuilder();
  mb.box(0.5, 0.8, 0.5, '#2f7d4a', 0, 0.4, 0);
  mb.box(0.54, 0.08, 0.54, '#25603a', 0, 0.84, 0);
  return mb.build();
}

export function tableSetGeo(color) {
  const mb = new ModelBuilder();
  mb.box(0.9, 0.04, 0.9, color, 0, 0.72, 0);
  for (const x of [-0.4, 0.4]) for (const z of [-0.4, 0.4]) mb.cyl(0.02, 0.02, 0.72, 4, '#888', x, 0.36, z);
  const stools = [[0, 0.75], [0, -0.75], [0.75, 0], [-0.75, 0]];
  for (const [x, z] of stools) {
    mb.cyl(0.16, 0.18, 0.04, 8, color, x, 0.45, z);
    mb.cyl(0.14, 0.2, 0.43, 8, shadeHex(color, 0.85), x, 0.22, z);
  }
  return mb.build();
}

export function lanternGeo() {
  const mb = new ModelBuilder();
  mb.sphere(0.24, '#c81e1e', 0, 0, 0, 1, 0.85, 1, 1);
  mb.cyl(0.1, 0.1, 0.05, 8, '#e2b33a', 0, 0.21, 0);
  mb.cyl(0.1, 0.1, 0.05, 8, '#e2b33a', 0, -0.21, 0);
  mb.box(0.02, 0.3, 0.02, '#e2b33a', 0, -0.38, 0);
  return mb.build();
}

export function solarGeo() {
  const mb = new ModelBuilder();
  mb.cyl(0.22, 0.22, 1.9, 8, '#d9dcdf', 0, 1.25, -0.2, 0, 0, Math.PI / 2);
  for (let i = 0; i < 8; i++) mb.box(0.13, 0.07, 1.6, i % 2 ? '#2a3644' : '#1b2430', -0.82 + i * 0.235, 0.7, 0.45, -1.0);
  mb.box(1.95, 0.04, 0.04, '#9aa0a6', 0, 0.12, 1.05);
  for (const x of [-0.95, 0.95]) {
    mb.limb(x, 0, 1.05, x, 1.25, -0.2, 0.025, '#9aa0a6', 3);
    mb.limb(x, 0, -0.2, x, 1.05, -0.2, 0.025, '#9aa0a6', 3);
  }
  return mb.build();
}

export function tankGeo() {
  const mb = new ModelBuilder();
  mb.cyl(0.6, 0.6, 1.4, 14, '#3f74b5', 0, 1.1, 0);
  mb.cyl(0.15, 0.6, 0.15, 14, '#3f74b5', 0, 1.87, 0);
  for (const x of [-0.4, 0.4]) mb.box(0.08, 0.4, 1.2, '#7a7a7a', x, 0.2, 0);
  return mb.build();
}

export function benchGeo() {
  const mb = new ModelBuilder();
  mb.box(1.6, 0.05, 0.42, '#8a6240', 0, 0.45, 0);
  mb.box(1.6, 0.3, 0.04, '#8a6240', 0, 0.72, -0.2, -0.15);
  for (const x of [-0.7, 0.7]) mb.box(0.06, 0.45, 0.4, '#3a3a3a', x, 0.22, 0);
  return mb.build();
}

export function greenhouseGeo() {
  const g = new THREE.CylinderGeometry(2.6, 2.6, 30, 12, 1, true, -Math.PI / 2, Math.PI);
  g.rotateX(-Math.PI / 2);
  g.scale(1, 0.85, 1);
  const mb = new ModelBuilder();
  mb.add(g, '#e4ebee');
  return mb.build();
}

export function haystackGeo() {
  const mb = new ModelBuilder();
  mb.sphere(1.2, '#c9a95a', 0, 0.8, 0, 1, 0.9, 1, 1, 0.15);
  return mb.build();
}

export function flagpoleGeo() {
  const mb = new ModelBuilder();
  mb.cyl(0.05, 0.08, 12, 8, '#d9dcdf', 0, 6, 0);
  mb.cyl(0.6, 0.8, 0.5, 10, '#c9c4ba', 0, 0.25, 0);
  return mb.build();
}

function shadeHex(h, k) {
  const c = new THREE.Color(h);
  c.multiplyScalar(k);
  return '#' + c.getHexString();
}
