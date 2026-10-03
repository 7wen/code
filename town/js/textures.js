import * as THREE from 'three';
import { RNG } from './util.js';

// 所有贴图都用 canvas 程序化绘制，不依赖外部图片。
export const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC","WenQuanYi Zen Hei","WenQuanYi Micro Hei",sans-serif';

let ANISO = 4;
const rng = new RNG(777);
const R = () => rng.next();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function tex(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  return t;
}
function rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// f>0 变亮，f<0 变暗
export function shade(h, f) {
  const k = (v) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f))));
  const [r, g, b] = rgb(h);
  return `rgb(${k(r)},${k(g)},${k(b)})`;
}
function jitter(h, amt) { return shade(h, (R() - 0.5) * 2 * amt); }

function speckle(ctx, w, h, n, colors, s0, s1, alpha) {
  ctx.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(R() * colors.length) | 0];
    const s = s0 + (s1 - s0) * R();
    ctx.fillRect(R() * w, R() * h, s, s);
  }
  ctx.globalAlpha = 1;
}
// 柔和色斑，四方连续（边缘处重复绘制）
function blotches(ctx, w, h, n, color, r0, r1, alpha) {
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h, r = r0 + (r1 - r0) * R();
    const a = alpha * (0.4 + 0.6 * R());
    for (const ox of [-w, 0, w]) {
      for (const oy of [-h, 0, h]) {
        const cx = x + ox, cy = y + oy;
        if (cx + r < 0 || cx - r > w || cy + r < 0 || cy - r > h) continue;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = a;
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }
  }
  ctx.globalAlpha = 1;
}
function streaks(ctx, w, h, n, color, alpha) {
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h, len = 30 + R() * 140, wd = 2 + R() * 6;
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * (0.4 + R() * 0.6);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, wd, len);
  }
  ctx.globalAlpha = 1;
}
function cracks(ctx, n, w, h, color, lw) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  for (let i = 0; i < n; i++) {
    let x = R() * w, y = R() * h, a = R() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 10; k++) {
      a += (R() - 0.5) * 1.2;
      x += Math.cos(a) * 12; y += Math.sin(a) * 12;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// ---------------- 地面类 ----------------
function asphaltTex() {
  const c = canvas(512, 512), x = c.getContext('2d');
  x.fillStyle = '#56585a'; x.fillRect(0, 0, 512, 512);
  blotches(x, 512, 512, 40, '#3f4143', 30, 100, 0.5);
  blotches(x, 512, 512, 25, '#6a6a68', 30, 90, 0.35);
  speckle(x, 512, 512, 26000, ['#2f3032', '#6f7072', '#807d78', '#46484a'], 1, 2.2, 0.55);
  for (let i = 0; i < 3; i++) {
    x.fillStyle = 'rgba(38,39,41,0.35)';
    x.fillRect(R() * 400, R() * 400, 60 + R() * 120, 40 + R() * 90);
  }
  cracks(x, 5, 512, 512, 'rgba(28,28,28,0.5)', 1.2);
  return tex(c);
}

function concreteRoadTex() {
  const c = canvas(512, 512), x = c.getContext('2d');
  x.fillStyle = '#a29f98'; x.fillRect(0, 0, 512, 512);
  blotches(x, 512, 512, 40, '#86837c', 30, 90, 0.5);
  blotches(x, 512, 512, 20, '#b9b6ae', 30, 80, 0.4);
  speckle(x, 512, 512, 14000, ['#7c7a74', '#bdbab3', '#908d86'], 1, 2, 0.5);
  x.fillStyle = 'rgba(80,78,74,0.8)';
  for (const p of [0, 256]) { x.fillRect(p, 0, 2, 512); x.fillRect(0, p, 512, 2); }
  cracks(x, 4, 512, 512, 'rgba(70,68,64,0.55)', 1);
  return tex(c);
}

function tileGrid(x, size, n, base, alt, altP, grout, jit) {
  const t = size / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      x.fillStyle = jitter(R() < altP ? alt : base, jit);
      x.fillRect(i * t, j * t, t, t);
    }
  }
  x.fillStyle = grout;
  for (let i = 0; i <= n; i++) { x.fillRect(i * t - 1, 0, 2, size); x.fillRect(0, i * t - 1, size, 2); }
}

function sidewalkTex() {
  const c = canvas(512, 512), x = c.getContext('2d');
  tileGrid(x, 512, 10, '#94918b', '#9b7e74', 0.18, 'rgba(90,88,84,0.9)', 0.06);
  blotches(x, 512, 512, 30, '#5f5d58', 20, 70, 0.25);
  speckle(x, 512, 512, 6000, ['#6e6c68', '#b0ada7'], 1, 2, 0.4);
  return tex(c);
}

function plazaTex() {
  const c = canvas(512, 512), x = c.getContext('2d');
  tileGrid(x, 512, 8, '#bdb6a9', '#a9a194', 0.25, 'rgba(120,114,104,0.8)', 0.05);
  blotches(x, 512, 512, 25, '#8f887c', 20, 80, 0.2);
  speckle(x, 512, 512, 5000, ['#8d877c', '#d0cabf'], 1, 2, 0.35);
  return tex(c);
}

function curbTex() {
  const c = canvas(128, 128), x = c.getContext('2d');
  x.fillStyle = '#b3b1ab'; x.fillRect(0, 0, 128, 128);
  speckle(x, 128, 128, 1500, ['#8e8c87', '#d0cec9'], 1, 2, 0.6);
  x.fillStyle = '#6f6d69'; x.fillRect(0, 0, 2, 128);
  return tex(c);
}

function yardTex() {
  const c = canvas(512, 512), x = c.getContext('2d');
  x.fillStyle = '#8f897c'; x.fillRect(0, 0, 512, 512);
  blotches(x, 512, 512, 40, '#6d675b', 30, 100, 0.4);
  blotches(x, 512, 512, 20, '#a8a294', 30, 90, 0.4);
  speckle(x, 512, 512, 9000, ['#5e584d', '#b4ae9f'], 1, 2.5, 0.5);
  cracks(x, 6, 512, 512, 'rgba(60,56,50,0.4)', 1);
  return tex(c);
}

function groundTex() {
  const c = canvas(512, 512), x = c.getContext('2d');
  x.fillStyle = '#6e7a46'; x.fillRect(0, 0, 512, 512);
  blotches(x, 512, 512, 50, '#8a7b55', 30, 110, 0.55);
  blotches(x, 512, 512, 50, '#55663a', 30, 110, 0.5);
  blotches(x, 512, 512, 20, '#93915f', 20, 60, 0.4);
  speckle(x, 512, 512, 22000, ['#4a5a30', '#8b9460', '#7b6c4c', '#9fa36f'], 1, 2.5, 0.5);
  return tex(c);
}

function fieldTex(kind) {
  const c = canvas(512, 512), x = c.getContext('2d');
  if (kind === 'crops' || kind === 'rapeseed') {
    x.fillStyle = kind === 'crops' ? '#5d4a36' : '#4e6630';
    x.fillRect(0, 0, 512, 512);
    speckle(x, 512, 512, 6000, ['#4a3b2b', '#6e5a44'], 1, 3, 0.6);
    for (let r = 0; r < 16; r++) {
      const y = r * 32 + 8;
      for (let i = 0; i < 90; i++) {
        const cx = R() * 512, cy = y + R() * 16;
        const s = 5 + R() * 9;
        x.fillStyle = kind === 'crops'
          ? jitter(R() < 0.5 ? '#507d2f' : '#679438', 0.15)
          : jitter(R() < 0.7 ? '#e5c935' : '#f1db57', 0.08);
        x.beginPath(); x.ellipse(cx, cy, s, s * 0.8, 0, 0, Math.PI * 2); x.fill();
        if (cx < s) { x.beginPath(); x.ellipse(cx + 512, cy, s, s * 0.8, 0, 0, Math.PI * 2); x.fill(); }
        if (cx > 512 - s) { x.beginPath(); x.ellipse(cx - 512, cy, s, s * 0.8, 0, 0, Math.PI * 2); x.fill(); }
      }
    }
  } else if (kind === 'soil') {
    for (let r = 0; r < 32; r++) {
      x.fillStyle = r % 2 ? '#6a5440' : '#594634';
      x.fillRect(0, r * 16, 512, 16);
    }
    speckle(x, 512, 512, 9000, ['#3f3124', '#7d6750'], 1, 3, 0.5);
  } else { // paddy
    x.fillStyle = '#6b7c6e'; x.fillRect(0, 0, 512, 512);
    blotches(x, 512, 512, 20, '#8a9c93', 30, 80, 0.4);
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 16; j++) {
        x.fillStyle = jitter('#5f9a3a', 0.15);
        x.beginPath(); x.arc(i * 32 + 16 + (R() - 0.5) * 4, j * 32 + 16 + (R() - 0.5) * 4, 6 + R() * 3, 0, Math.PI * 2); x.fill();
      }
    }
  }
  return tex(c);
}

function waterTex() {
  const c = canvas(512, 512), x = c.getContext('2d');
  x.fillStyle = '#41594f'; x.fillRect(0, 0, 512, 512);
  blotches(x, 512, 512, 30, '#2f453c', 40, 120, 0.5);
  blotches(x, 512, 512, 20, '#5d7a6c', 40, 100, 0.4);
  x.strokeStyle = 'rgba(190,210,200,0.18)';
  x.lineWidth = 1.5;
  for (let i = 0; i < 260; i++) {
    const cx = R() * 512, cy = R() * 512, w = 8 + R() * 26;
    x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(cx + w / 2, cy - 3, cx + w, cy); x.stroke();
  }
  return tex(c);
}

function bankTex() {
  const c = canvas(512, 512), x = c.getContext('2d');
  x.fillStyle = '#5a5850'; x.fillRect(0, 0, 512, 512);
  let y = 0;
  while (y < 512) {
    const h = 34 + R() * 22;
    let bx = -R() * 60;
    while (bx < 512) {
      const w = 50 + R() * 60;
      x.fillStyle = jitter('#85827a', 0.12);
      x.fillRect(bx + 2, y + 2, w - 4, h - 4);
      bx += w;
    }
    y += h;
  }
  // 水线以下潮湿、长青苔
  const g = x.createLinearGradient(0, 330, 0, 512);
  g.addColorStop(0, 'rgba(40,52,36,0.0)');
  g.addColorStop(0.15, 'rgba(40,52,36,0.6)');
  g.addColorStop(1, 'rgba(30,36,28,0.8)');
  x.fillStyle = g; x.fillRect(0, 330, 512, 182);
  blotches(x, 512, 512, 20, '#4a5e34', 10, 40, 0.35);
  return tex(c);
}

function roofFlatTex(tar) {
  const c = canvas(512, 512), x = c.getContext('2d');
  x.fillStyle = tar ? '#3e3c3a' : '#8f8b84'; x.fillRect(0, 0, 512, 512);
  blotches(x, 512, 512, 40, tar ? '#2b2a29' : '#5e5b55', 20, 90, 0.5);
  speckle(x, 512, 512, 8000, tar ? ['#555350', '#2a2928'] : ['#6f6c66', '#aba79f'], 1, 2, 0.5);
  if (tar) {
    x.fillStyle = 'rgba(95,92,88,0.6)';
    for (let i = 0; i < 8; i++) x.fillRect(0, i * 64, 512, 3);
  }
  return tex(c);
}

function roofTileTex(color, glaze) {
  const c = canvas(256, 256), x = c.getContext('2d');
  x.fillStyle = shade(color, -0.4); x.fillRect(0, 0, 256, 256);
  const cols = 12, cw = 256 / cols;
  for (let i = 0; i < cols; i++) {
    const g = x.createLinearGradient(i * cw, 0, (i + 1) * cw, 0);
    g.addColorStop(0, shade(color, -0.35));
    g.addColorStop(0.5, glaze ? shade(color, 0.35) : shade(color, 0.12));
    g.addColorStop(1, shade(color, -0.35));
    x.fillStyle = g;
    x.fillRect(i * cw + 1, 0, cw - 2, 256);
  }
  for (let r = 0; r < 8; r++) {
    const g = x.createLinearGradient(0, r * 32, 0, r * 32 + 8);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, r * 32, 256, 8);
  }
  speckle(x, 256, 256, 1500, ['#000000', '#ffffff'], 1, 2, 0.08);
  return tex(c);
}

function corrugatedTex(color) {
  const c = canvas(256, 256), x = c.getContext('2d');
  for (let i = 0; i < 16; i++) {
    const g = x.createLinearGradient(i * 16, 0, i * 16 + 16, 0);
    g.addColorStop(0, shade(color, -0.25));
    g.addColorStop(0.5, shade(color, 0.15));
    g.addColorStop(1, shade(color, -0.25));
    x.fillStyle = g; x.fillRect(i * 16, 0, 16, 256);
  }
  streaks(x, 256, 256, 30, 'rgba(60,45,30,1)', 0.15);
  return tex(c);
}

// ---------------- 外立面 ----------------
// 每张贴图 = 2 开间（各 3.6m）× 2 层（各 3.0m），512×512 像素
export const FACADE_STYLES = [
  { key: 'whiteTile', wall: 'tile', base: '#e2dfd8', glass: 'blue', frame: '#f0f0ee', cage: 0.3, ac: 0.45, band: '#cbc6bc' },
  { key: 'beigeTile', wall: 'tile', base: '#d6c4a4', glass: 'green', frame: '#c9ccce', cage: 0.35, ac: 0.4, band: '#bcab8c' },
  { key: 'pinkTile', wall: 'tile', base: '#d4b2a5', glass: 'blue', frame: '#e8e8e6', cage: 0.3, ac: 0.35, band: '#c09a8c' },
  { key: 'greyCement', wall: 'cement', base: '#9c9a93', glass: 'old', frame: '#6b5a46', cage: 0.45, ac: 0.25, band: '#8a8881' },
  { key: 'redBrick', wall: 'brick', base: '#9a4b34', glass: 'dark', frame: '#5d5d5a', cage: 0.1, ac: 0.08, band: '#8d8a84' },
  { key: 'yellowPaint', wall: 'paint', base: '#d4c18d', glass: 'blue', frame: '#e2e2df', cage: 0.3, ac: 0.3, band: '#bfaa76', balcony: 0.5 },
  { key: 'whiteBalcony', wall: 'tile', base: '#e8e6e1', glass: 'blue', frame: '#d0d3d6', cage: 0.2, ac: 0.45, band: '#d3cfc6', balcony: 1 },
  { key: 'greyTile', wall: 'tile', base: '#b7b6b0', glass: 'green', frame: '#f2f2f0', cage: 0.25, ac: 0.4, band: '#a09f99' },
];

const GLASS = {
  blue: ['#a7c2d8', '#3b5b76'],
  green: ['#a2c6b6', '#2c5646'],
  old: ['#8c9ea8', '#38434d'],
  dark: ['#2b2723', '#141210'],
};
const LIT = ['#ffd08a', '#ffe0b0', '#fff0d6', '#e2ebff', '#ffc47e', '#fff6e8'];
const CURTAIN = ['#e9dcc0', '#c8d8e6', '#e6c0c0', '#f2efe8', '#b7c99f', '#d8c9e6', '#8a6a52'];
const CLOTHES = ['#c0392b', '#2e5e9e', '#f1f1f1', '#e3b23c', '#3d7a4a', '#7a4b8a', '#222222', '#e78fa6'];

function drawWall(x, w, h, st) {
  x.fillStyle = st.base; x.fillRect(0, 0, w, h);
  if (st.wall === 'tile') {
    const tw = 14, th = 9;
    for (let yy = 0; yy < h; yy += th) {
      for (let xx = 0; xx < w; xx += tw) {
        if (R() < 0.35) {
          x.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)';
          x.fillRect(xx, yy, tw, th);
        }
      }
    }
    x.fillStyle = 'rgba(0,0,0,0.07)';
    for (let yy = 0; yy < h; yy += th) x.fillRect(0, yy, w, 1);
    for (let xx = 0; xx < w; xx += tw) x.fillRect(xx, 0, 1, h);
    streaks(x, w, h, 26, 'rgba(70,62,52,1)', 0.07);
  } else if (st.wall === 'cement') {
    blotches(x, w, h, 40, '#77746d', 20, 70, 0.4);
    blotches(x, w, h, 20, '#b4b1a9', 20, 60, 0.35);
    speckle(x, w, h, 7000, ['#6f6d67', '#b5b2ab'], 1, 2, 0.5);
    streaks(x, w, h, 40, 'rgba(50,46,40,1)', 0.14);
  } else if (st.wall === 'paint') {
    blotches(x, w, h, 30, shade(st.base, -0.25), 20, 70, 0.3);
    speckle(x, w, h, 4000, [shade(st.base, -0.2), shade(st.base, 0.2)], 1, 2, 0.4);
    for (let i = 0; i < 10; i++) { // 墙皮剥落
      x.fillStyle = '#a19d94';
      x.beginPath();
      const px = R() * w, py = R() * h;
      x.moveTo(px, py);
      for (let k = 0; k < 6; k++) x.lineTo(px + (R() - 0.5) * 40, py + (R() - 0.5) * 30);
      x.fill();
    }
    streaks(x, w, h, 30, 'rgba(70,60,45,1)', 0.12);
  } else if (st.wall === 'brick') {
    x.fillStyle = '#b3a593'; x.fillRect(0, 0, w, h);
    const bh = 10, bw = 26;
    for (let r = 0; r * bh < h; r++) {
      const off = (r % 2) * bw / 2;
      for (let xx = -bw; xx < w + bw; xx += bw) {
        x.fillStyle = jitter(st.base, 0.14);
        x.fillRect(xx + off + 1, r * bh + 1, bw - 2, bh - 2);
      }
    }
    streaks(x, w, h, 20, 'rgba(40,30,25,1)', 0.12);
  }
}

function drawWindow(x, e, cx, fb, st) {
  const brick = st.glass === 'dark';
  const ww = brick ? 118 : 136 + ((R() * 24) | 0);
  const wh = brick ? 116 : 118 + ((R() * 14) | 0);
  const x0 = cx - ww / 2, y1 = fb - 74, y0 = y1 - wh;
  // 洞口阴影 / 窗台
  x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(x0 - 4, y0 - 4, ww + 8, wh + 8);
  x.fillStyle = shade(st.base, 0.18); x.fillRect(x0 - 8, y1 + 4, ww + 16, 6);
  x.fillStyle = st.frame; x.fillRect(x0, y0, ww, wh);
  const gx = x0 + 5, gy = y0 + 5, gw = ww - 10, gh = wh - 10;
  const gc = GLASS[st.glass];
  const g = x.createLinearGradient(0, gy, 0, gy + gh);
  g.addColorStop(0, gc[0]); g.addColorStop(1, gc[1]);
  x.fillStyle = g; x.fillRect(gx, gy, gw, gh);
  if (!brick) {
    x.fillStyle = 'rgba(255,255,255,0.12)';
    x.beginPath(); x.moveTo(gx + gw * 0.2, gy); x.lineTo(gx + gw * 0.45, gy); x.lineTo(gx + gw * 0.15, gy + gh); x.lineTo(gx - gw * 0.1, gy + gh); x.fill();
  }
  const lit = R() < 0.45;
  if (lit) { e.fillStyle = LIT[(R() * LIT.length) | 0]; e.fillRect(gx, gy, gw, gh); }
  if (!brick && R() < 0.65) {
    const cw = gw * (0.3 + R() * 0.4);
    const left = R() < 0.5;
    const cxx = left ? gx : gx + gw - cw;
    x.fillStyle = CURTAIN[(R() * CURTAIN.length) | 0];
    x.globalAlpha = 0.75; x.fillRect(cxx, gy, cw, gh); x.globalAlpha = 1;
    x.fillStyle = 'rgba(0,0,0,0.12)';
    for (let k = cxx + 4; k < cxx + cw; k += 7) x.fillRect(k, gy, 2, gh);
    if (lit) { e.fillStyle = 'rgba(0,0,0,0.45)'; e.fillRect(cxx, gy, cw, gh); }
  }
  // 窗框分格
  const n = R() < 0.5 ? 2 : 3;
  x.fillStyle = st.frame; e.fillStyle = '#000';
  for (let i = 1; i < n; i++) { const mx = gx + (gw * i) / n; x.fillRect(mx - 2, gy, 4, gh); e.fillRect(mx - 2, gy, 4, gh); }
  const ty = gy + gh * 0.28;
  x.fillRect(gx, ty - 2, gw, 4); e.fillRect(gx, ty - 2, gw, 4);
  // 防盗窗
  if (R() < st.cage) {
    const cx0 = x0 - 9, cy0 = y0 - 10, cw = ww + 18, ch = wh + 16;
    x.fillStyle = 'rgba(0,0,0,0.2)'; x.fillRect(cx0 + 3, cy0 + ch, cw, 5);
    x.strokeStyle = '#c9cdd1'; x.lineWidth = 3; x.strokeRect(cx0, cy0, cw, ch);
    x.fillStyle = 'rgba(205,210,214,0.95)'; e.fillStyle = 'rgba(0,0,0,0.75)';
    for (let bx = cx0 + 6; bx < cx0 + cw - 2; bx += 11) { x.fillRect(bx, cy0, 2, ch); e.fillRect(bx, cy0, 2, ch); }
    for (const f of [0.35, 0.7]) { x.fillRect(cx0, cy0 + ch * f, cw, 2); e.fillRect(cx0, cy0 + ch * f, cw, 2); }
    if (R() < 0.35) { // 花盆
      for (let k = 0; k < 3; k++) {
        x.fillStyle = jitter('#4f7d35', 0.2);
        x.beginPath(); x.arc(cx0 + 15 + R() * (cw - 30), cy0 + ch - 10, 8 + R() * 6, 0, Math.PI * 2); x.fill();
      }
    }
    if (R() < 0.3) { // 晾衣服
      for (let k = 0; k < 4; k++) {
        x.fillStyle = CLOTHES[(R() * CLOTHES.length) | 0];
        x.fillRect(cx0 + 10 + k * (cw - 20) / 4, cy0 + 6, 16 + R() * 10, 26 + R() * 24);
      }
    }
  }
  // 空调外机
  if (R() < st.ac) {
    const right = R() < 0.5;
    let ax = right ? x0 + ww + 14 : x0 - 14 - 58;
    ax = Math.max(cx - 126, Math.min(cx + 126 - 58, ax));
    const ay = y1 - 34;
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(ax + 4, ay + 4, 58, 40);
    x.fillStyle = '#e6e6e1'; x.fillRect(ax, ay, 58, 40);
    x.fillStyle = '#5c5c5a'; x.beginPath(); x.arc(ax + 22, ay + 20, 14, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#9a9a96'; x.lineWidth = 1;
    for (let k = 0; k < 5; k++) { x.beginPath(); x.moveTo(ax + 8, ay + 8 + k * 6); x.lineTo(ax + 36, ay + 8 + k * 6); x.stroke(); }
    x.fillStyle = '#c9c9c4'; x.fillRect(ax + 42, ay + 6, 12, 28);
    const g2 = x.createLinearGradient(0, ay + 40, 0, ay + 120);
    g2.addColorStop(0, 'rgba(60,55,45,0.25)'); g2.addColorStop(1, 'rgba(60,55,45,0)');
    x.fillStyle = g2; x.fillRect(ax + 26, ay + 40, 5, 80);
  }
  // 窗下水渍
  const g3 = x.createLinearGradient(0, y1 + 10, 0, y1 + 70);
  g3.addColorStop(0, 'rgba(70,60,50,0.12)'); g3.addColorStop(1, 'rgba(70,60,50,0)');
  x.fillStyle = g3; x.fillRect(x0 + 6, y1 + 10, ww - 12, 60);
}

function drawBalcony(x, e, cx, fb, st) {
  const x0 = cx - 112, w = 224, top = fb - 236, bot = fb - 6;
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(x0 - 4, top - 4, w + 8, bot - top + 8);
  x.fillStyle = '#3b3a38'; x.fillRect(x0, top, w, bot - top);
  // 推拉门
  const dy0 = top + 26, dy1 = bot - 6;
  x.fillStyle = st.frame; x.fillRect(x0 + 10, dy0, w - 20, dy1 - dy0);
  const gc = GLASS[st.glass === 'dark' ? 'old' : st.glass];
  const g = x.createLinearGradient(0, dy0, 0, dy1);
  g.addColorStop(0, gc[0]); g.addColorStop(1, gc[1]);
  x.fillStyle = g; x.fillRect(x0 + 15, dy0 + 5, w - 30, dy1 - dy0 - 10);
  if (R() < 0.45) { e.fillStyle = LIT[(R() * LIT.length) | 0]; e.fillRect(x0 + 15, dy0 + 5, w - 30, dy1 - dy0 - 10); }
  x.fillStyle = st.frame; e.fillStyle = '#000';
  for (const f of [0.25, 0.5, 0.75]) { x.fillRect(x0 + 10 + (w - 20) * f - 2, dy0, 4, dy1 - dy0); e.fillRect(x0 + 10 + (w - 20) * f - 2, dy0, 4, dy1 - dy0); }
  // 顶部阴影
  const gs = x.createLinearGradient(0, top, 0, top + 40);
  gs.addColorStop(0, 'rgba(0,0,0,0.55)'); gs.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gs; x.fillRect(x0, top, w, 40);
  // 晾衣
  if (R() < 0.6) {
    x.fillStyle = '#9a9a9a'; x.fillRect(x0 + 6, top + 22, w - 12, 2);
    let k = x0 + 12;
    while (k < x0 + w - 30) {
      const cw = 14 + R() * 22, ch = 30 + R() * 50;
      x.fillStyle = CLOTHES[(R() * CLOTHES.length) | 0];
      x.fillRect(k, top + 24, cw, ch);
      e.fillStyle = '#000'; e.fillRect(k, top + 24, cw, ch);
      k += cw + 4 + R() * 12;
    }
  }
  // 栏板
  const ry = bot - 92;
  if (st.wall === 'tile' || R() < 0.5) {
    x.fillStyle = shade(st.base, -0.05); x.fillRect(x0 - 6, ry, w + 12, bot - ry + 6);
    x.fillStyle = 'rgba(0,0,0,0.06)';
    for (let yy = ry; yy < bot; yy += 9) x.fillRect(x0 - 6, yy, w + 12, 1);
    x.fillStyle = shade(st.base, 0.3); x.fillRect(x0 - 8, ry - 6, w + 16, 7);
    e.fillStyle = '#000'; e.fillRect(x0 - 6, ry - 6, w + 12, bot - ry + 12);
  } else {
    x.fillStyle = '#d7dadd'; x.fillRect(x0 - 6, ry - 6, w + 12, 6);
    e.fillStyle = '#000';
    for (let bx = x0; bx < x0 + w; bx += 12) { x.fillRect(bx, ry, 3, bot - ry); e.fillRect(bx, ry, 3, bot - ry); }
  }
  if (R() < 0.4) {
    for (let k = 0; k < 3; k++) {
      x.fillStyle = jitter('#4c7a33', 0.2);
      x.beginPath(); x.arc(x0 + 20 + R() * (w - 40), ry - 12, 9 + R() * 6, 0, Math.PI * 2); x.fill();
    }
  }
}

function facadeTex(st) {
  const c = canvas(512, 512), x = c.getContext('2d');
  const ec = canvas(512, 512), e = ec.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, 512, 512);
  drawWall(x, 512, 512, st);
  for (let f = 0; f < 2; f++) {
    const fb = 256 * (f + 1);
    // 楼层腰线 / 砖房的圈梁
    if (st.wall === 'brick') { x.fillStyle = '#8d8a84'; x.fillRect(0, fb - 20, 512, 20); }
    else { x.fillStyle = st.band; x.fillRect(0, fb - 7, 512, 7); }
    for (let b = 0; b < 2; b++) {
      const cx = 128 + 256 * b;
      if (st.balcony && R() < st.balcony * (f === 1 ? 0.9 : 0.6)) drawBalcony(x, e, cx, fb, st);
      else drawWindow(x, e, cx, fb, st);
    }
  }
  return { map: tex(c), emissive: tex(ec) };
}

function plainTex(st) {
  const c = canvas(256, 256), x = c.getContext('2d');
  drawWall(x, 256, 256, st);
  return tex(c);
}

// ---------------- 底商门面 ----------------
// 512×256 = 2 开间 7.2m × 3.6m
const PRODUCT = ['#d23c2f', '#f2c230', '#2f6db5', '#f4f4f0', '#3d9a4a', '#e67e22', '#8e44ad', '#16a085', '#c0392b', '#ecf0f1'];

function bayInterior(x, e, bx0, by0, bx1, by1, lit) {
  const g = x.createLinearGradient(0, by0, 0, by1);
  g.addColorStop(0, '#3b352e'); g.addColorStop(1, '#1d1915');
  x.fillStyle = g; x.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
  if (lit) { e.fillStyle = '#e8d6b4'; e.globalAlpha = 0.7; e.fillRect(bx0, by0, bx1 - bx0, by1 - by0); e.globalAlpha = 1; }
  // 货架
  const shelves = 3 + ((R() * 2) | 0);
  for (let s = 0; s < shelves; s++) {
    const sy = by0 + 14 + s * ((by1 - by0 - 50) / shelves);
    x.fillStyle = '#6b5e4f'; x.fillRect(bx0 + 6, sy + 22, bx1 - bx0 - 12, 3);
    let px = bx0 + 8;
    while (px < bx1 - 14) {
      const pw = 6 + R() * 10, ph = 8 + R() * 14;
      const col = PRODUCT[(R() * PRODUCT.length) | 0];
      x.fillStyle = shade(col, -0.35); x.fillRect(px, sy + 22 - ph, pw, ph);
      if (lit) { e.fillStyle = col; e.fillRect(px, sy + 22 - ph, pw, ph); }
      px += pw + 1 + R() * 3;
    }
  }
  // 地上的纸箱
  for (let k = 0; k < 3; k++) {
    const w = 18 + R() * 20, h = 14 + R() * 20;
    const px = bx0 + 6 + R() * (bx1 - bx0 - 30);
    x.fillStyle = jitter('#a5804f', 0.15); x.fillRect(px, by1 - h, w, h);
    e.fillStyle = '#000'; e.fillRect(px, by1 - h, w, h);
  }
}

function drawShutter(x, bx0, by0, bx1, by1) {
  const col = ['#b8bbbd', '#aaaeb1', '#6f8fae', '#9aa5a8', '#c3c0b8'][(R() * 5) | 0];
  x.fillStyle = col; x.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
  for (let y = by0; y < by1; y += 5) {
    x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(bx0, y, bx1 - bx0, 1);
    x.fillStyle = 'rgba(255,255,255,0.2)'; x.fillRect(bx0, y + 2, bx1 - bx0, 1);
  }
  x.fillStyle = '#55585a'; x.fillRect(bx0, by1 - 7, bx1 - bx0, 7);
  const g = x.createLinearGradient(0, by1 - 60, 0, by1);
  g.addColorStop(0, 'rgba(60,50,40,0)'); g.addColorStop(1, 'rgba(60,50,40,0.3)');
  x.fillStyle = g; x.fillRect(bx0, by1 - 60, bx1 - bx0, 60);
}

function shopTex(types) {
  const c = canvas(512, 256), x = c.getContext('2d');
  const ec = canvas(512, 256), e = ec.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, 512, 256);
  x.fillStyle = '#8b8882'; x.fillRect(0, 0, 512, 256);
  speckle(x, 512, 60, 1500, ['#6f6c66', '#a7a49d'], 1, 2, 0.5);
  const by0 = 58, by1 = 250;
  const bays = [[14, 249], [263, 498]];
  types.forEach((t, i) => {
    const [bx0, bx1] = bays[i];
    if (t === 'shutter') {
      drawShutter(x, bx0, by0, bx1, by1);
      if (R() < 0.5) { // 小广告
        x.save();
        x.translate(bx0 + 30 + R() * 100, by0 + 80 + R() * 60);
        x.rotate((R() - 0.5) * 0.2);
        x.fillStyle = 'rgba(25,25,25,0.75)';
        x.font = `bold 15px ${FONT}`;
        x.fillText(R() < 0.5 ? '开锁换锁 139' : '高价回收', 0, 0);
        x.restore();
      }
    } else if (t === 'half') {
      const ys = by0 + 30 + R() * 50;
      bayInterior(x, e, bx0, ys, bx1, by1, R() < 0.8);
      drawShutter(x, bx0, by0, bx1, ys);
    } else if (t === 'open') {
      bayInterior(x, e, bx0, by0, bx1, by1, true);
      if (R() < 0.45) { // 透明门帘
        for (let k = bx0; k < bx1; k += 11) {
          x.fillStyle = 'rgba(220,230,235,0.16)'; x.fillRect(k, by0 + 4, 9, by1 - by0 - 4);
          x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(k + 2, by0 + 4, 1, by1 - by0 - 4);
        }
      }
    } else { // glass
      bayInterior(x, e, bx0, by0, bx1, by1, true);
      x.fillStyle = 'rgba(70,95,105,0.55)'; x.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
      x.fillStyle = 'rgba(255,255,255,0.12)';
      x.beginPath(); x.moveTo(bx0 + 40, by0); x.lineTo(bx0 + 110, by0); x.lineTo(bx0 + 40, by1); x.lineTo(bx0 - 20, by1); x.fill();
      x.fillStyle = '#c9ccd0'; e.fillStyle = '#000';
      const mid = (bx0 + bx1) / 2;
      for (const fx of [bx0, bx0 + 50, mid - 3, bx1 - 56, bx1 - 6]) { x.fillRect(fx, by0, 6, by1 - by0); e.fillRect(fx, by0, 6, by1 - by0); }
      x.fillRect(bx0, by0, bx1 - bx0, 6); x.fillRect(bx0, by1 - 8, bx1 - bx0, 8);
      x.fillStyle = '#d23c2f'; x.font = `bold 16px ${FONT}`; x.textAlign = 'center';
      x.fillText('欢迎光临', mid, by0 + 50);
      x.textAlign = 'left';
    }
  });
  // 瓷砖柱子 + 台阶
  for (const px of [0, 249, 498]) {
    x.fillStyle = '#d5d1c9'; x.fillRect(px, by0 - 4, 14, by1 - by0 + 4);
    e.fillStyle = '#000'; e.fillRect(px, 0, 14, 256);
    x.fillStyle = 'rgba(0,0,0,0.08)';
    for (let y = by0; y < by1; y += 12) x.fillRect(px, y, 14, 1);
  }
  x.fillStyle = '#6b6863'; x.fillRect(0, 250, 512, 6);
  return { map: tex(c), emissive: tex(ec) };
}

// ---------------- 招牌图集 ----------------
// 2 列 × 20 行，每格 1024×128
export const SIGN_COLS = 2, SIGN_ROWS = 20;
const SIGNS = [
  ['兴旺超市', '#c4241d', '#ffd93b', '日用百货 烟酒饮料'],
  ['沙县小吃', '#d8d3c8', '#b3221a', '蒸饺 拌面 炖罐'],
  ['兰州牛肉拉面', '#1f7a4a', '#ffffff', '清真 正宗手工'],
  ['黄焖鸡米饭', '#f1c232', '#b3221a', '外卖 堂食'],
  ['手机维修 配件', '#1f5fa8', '#ffffff', '贴膜 换屏 充值'],
  ['平价大药房', '#178a52', '#ffffff', '医保定点'],
  ['名烟名酒', '#a3151b', '#f6d27a', '批发 零售'],
  ['小芳美发', '#7b3f8c', '#ffffff', '烫染 剪发'],
  ['五金建材', '#2a62a5', '#ffe14d', '水电 卫浴 油漆'],
  ['电动车维修', '#c4241d', '#ffffff', '补胎 换电瓶'],
  ['快递驿站', '#1e8a5a', '#ffffff', '代收代发'],
  ['家常菜馆', '#b32118', '#ffe7a3', '炒菜 盖饭 承接酒席'],
  ['早餐 包子 豆浆', '#f3efe6', '#c4241d', '油条 煎饼 豆腐脑'],
  ['麻辣烫', '#c4241d', '#ffffff', '自选称重'],
  ['星空网咖', '#141820', '#3fd6ff', '电竞 包间'],
  ['台球 棋牌', '#1d5a3a', '#ffffff', '营业到凌晨'],
  ['金凤凰婚纱摄影', '#e389a8', '#ffffff', '艺术照 证件照'],
  ['床上用品', '#2766a8', '#ffffff', '四件套 棉被'],
  ['母婴生活馆', '#f2a7b8', '#ffffff', '奶粉 童装'],
  ['文具 书店', '#2a62a5', '#ffffff', '教辅 学习用品'],
  ['明亮眼镜', '#1f4f8f', '#ffffff', '免费验光'],
  ['鲜果园水果店', '#3f9a3a', '#ffffff', '新鲜到货'],
  ['烧烤 夜宵', '#1a1a1a', '#ff5a3c', '啤酒 小龙虾'],
  ['甜心奶茶', '#f29bb2', '#ffffff', '珍珠 果茶'],
  ['粮油副食', '#b5261e', '#ffffff', '大米 面粉 食用油'],
  ['悦来宾馆', '#7a4b2a', '#ffe7a3', '空调 热水 停车'],
  ['足浴保健', '#5a2d82', '#ffd8f2', '养生 推拿'],
  ['家电城', '#c4241d', '#ffffff', '以旧换新 送货上门'],
  ['潮流服饰', '#151515', '#ffffff', '男装 女装'],
  ['农资化肥', '#2e7d32', '#ffffff', '种子 农药'],
  ['摩托车 电动车', '#1f5fa8', '#ffe14d', '销售 维修'],
  ['青石镇农贸市场', '#b3221a', '#ffe14d', ''],
  ['青石镇中心小学', '#f6f3ec', '#b3221a', ''],
  ['好好学习 天天向上', '#f6f3ec', '#b3221a', ''],
  ['青石镇文化广场', '#a3151b', '#ffd93b', ''],
  ['文明出行 安全第一', '#f6f3ec', '#1f5fa8', ''],
  ['青石镇人民政府', '#f6f3ec', '#b3221a', ''],
  ['农家乐', '#7a4b2a', '#ffe7a3', '土鸡 鱼塘 住宿'],
  ['汽车修理', '#1f5fa8', '#ffffff', '钣金 喷漆 保养'],
  ['轮胎 补胎', '#1a1a1a', '#ffd93b', '24小时'],
];
export const SIGN = {
  COMMON_COUNT: 31,
  MARKET: 31, SCHOOL: 32, STUDY: 33, PLAZA: 34, TRAFFIC: 35, GOV: 36, FARM: 37, AUTO: 38, TYRE: 39,
  EATERY: [1, 2, 3, 11, 12, 13, 22, 23],
};

function signAtlas() {
  const W = 1024, H = 128;
  const c = canvas(W * SIGN_COLS, H * SIGN_ROWS), x = c.getContext('2d');
  SIGNS.forEach(([text, bg, fg, sub], i) => {
    const ox = (i % SIGN_COLS) * W, oy = Math.floor(i / SIGN_COLS) * H;
    const g = x.createLinearGradient(0, oy, 0, oy + H);
    g.addColorStop(0, shade(bg, 0.12)); g.addColorStop(1, shade(bg, -0.12));
    x.fillStyle = g; x.fillRect(ox, oy, W, H);
    x.strokeStyle = shade(bg, -0.35); x.lineWidth = 8; x.strokeRect(ox + 4, oy + 4, W - 8, H - 8);
    x.strokeStyle = shade(bg, 0.35); x.lineWidth = 2; x.strokeRect(ox + 12, oy + 12, W - 24, H - 24);
    const hasSub = !!sub;
    // 左侧圆形 logo
    if (hasSub) {
      x.fillStyle = fg;
      x.beginPath(); x.arc(ox + 80, oy + 64, 40, 0, Math.PI * 2); x.fill();
      x.fillStyle = bg; x.font = `bold 50px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(text[0], ox + 80, oy + 66);
    }
    let size = 80;
    x.font = `bold ${size}px ${FONT}`;
    const maxW = hasSub ? 640 : 900;
    const spacing = text.length <= 5 ? 0.35 : 0.1;
    const measure = () => x.measureText(text).width * (1 + spacing);
    while (measure() > maxW && size > 30) { size -= 4; x.font = `bold ${size}px ${FONT}`; }
    const tw = measure();
    const cx = ox + (hasSub ? 480 : W / 2);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const step = tw / text.length;
    for (let k = 0; k < text.length; k++) {
      const px = cx - tw / 2 + step * (k + 0.5);
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillText(text[k], px + 3, oy + 68);
      x.fillStyle = fg; x.fillText(text[k], px, oy + 65);
    }
    if (hasSub) {
      x.font = `22px ${FONT}`; x.fillStyle = fg; x.textAlign = 'center';
      const half = Math.ceil(sub.length / 2);
      const lines = sub.length > 7 ? [sub.slice(0, half), sub.slice(half)] : [sub];
      lines.forEach((ln, k) => x.fillText(ln.trim(), ox + 900, oy + 64 + (k - (lines.length - 1) / 2) * 28));
      x.font = `16px ${FONT}`; x.globalAlpha = 0.8;
      x.fillText('电话 1' + (30 + ((R() * 60) | 0)) + '****' + (1000 + ((R() * 8999) | 0)), ox + 900, oy + 112);
      x.globalAlpha = 1;
    }
  });
  const t = tex(c, { repeat: false });
  return t;
}

export function signUV(cell) {
  const col = cell % SIGN_COLS, row = Math.floor(cell / SIGN_COLS);
  const eu = 1 / (1024 * SIGN_COLS), ev = 1 / (128 * SIGN_ROWS);
  const u0 = col / SIGN_COLS + eu, u1 = (col + 1) / SIGN_COLS - eu;
  const v1 = 1 - row / SIGN_ROWS - ev, v0 = 1 - (row + 1) / SIGN_ROWS + ev;
  return [u0, v0, u1, v1];
}

// ---------------- 杂项 ----------------
function glowTex() {
  const c = canvas(128, 128), x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,220,160,1)');
  g.addColorStop(0.4, 'rgba(255,200,130,0.45)');
  g.addColorStop(1, 'rgba(255,200,130,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return tex(c, { repeat: false });
}

function schoolWallTex() {
  const c = canvas(256, 256), x = c.getContext('2d');
  x.fillStyle = '#efece5'; x.fillRect(0, 0, 256, 256);
  blotches(x, 256, 256, 15, '#c9c4b8', 10, 40, 0.4);
  x.fillStyle = '#3d6ea3'; x.fillRect(0, 186, 256, 70);
  x.fillStyle = '#8f8c86'; x.fillRect(0, 0, 256, 14);
  streaks(x, 256, 256, 20, 'rgba(80,70,60,1)', 0.12);
  return tex(c);
}

function turfTex() {
  const c = canvas(256, 256), x = c.getContext('2d');
  x.fillStyle = '#5c8c45'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'; x.fillRect(i * 32, 0, 32, 256); }
  speckle(x, 256, 256, 4000, ['#4a7537', '#6fa055'], 1, 2, 0.5);
  return tex(c);
}

function plaidTex() {
  const c = canvas(128, 128), x = c.getContext('2d');
  x.fillStyle = '#7d1f24'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(20,20,40,0.55)';
  for (let i = 0; i < 4; i++) { x.fillRect(i * 32 + 8, 0, 12, 128); x.fillRect(0, i * 32 + 8, 128, 12); }
  x.fillStyle = 'rgba(240,200,80,0.5)';
  for (let i = 0; i < 4; i++) { x.fillRect(i * 32 + 26, 0, 2, 128); x.fillRect(0, i * 32 + 26, 128, 2); }
  x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 2;
  for (let i = 0; i < 128; i += 16) { x.beginPath(); x.moveTo(0, i); x.lineTo(128, i + 8); x.stroke(); }
  return tex(c);
}

// ---------------- 材质汇总 ----------------
export function createMaterials(renderer) {
  ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, ...o });
  const M = {};
  M.asphalt = std({ map: asphaltTex(), roughness: 0.95 });
  M.concreteRoad = std({ map: concreteRoadTex() });
  M.sidewalk = std({ map: sidewalkTex() });
  M.plaza = std({ map: plazaTex() });
  M.curb = std({ map: curbTex() });
  M.yard = std({ map: yardTex() });
  M.ground = std({ map: groundTex(), roughness: 1 });
  M.fields = { crops: std({ map: fieldTex('crops'), roughness: 1 }), rapeseed: std({ map: fieldTex('rapeseed'), roughness: 1 }), soil: std({ map: fieldTex('soil'), roughness: 1 }), paddy: std({ map: fieldTex('paddy'), roughness: 0.5 }) };
  M.water = std({ map: waterTex(), roughness: 0.18, metalness: 0.2 });
  M.bank = std({ map: bankTex() });
  M.bed = std({ color: 0x2f2e25 });
  M.roofFlat = [std({ map: roofFlatTex(false) }), std({ map: roofFlatTex(true) })];
  M.roofTile = [roofTileTex('#9c4636', false), roofTileTex('#2c5f93', true), roofTileTex('#585b5e', false)]
    .map((t, i) => std({ map: t, side: THREE.DoubleSide, roughness: i === 1 ? 0.45 : 0.85 }));
  M.facade = []; M.plain = [];
  for (const st of FACADE_STYLES) {
    const f = facadeTex(st);
    M.facade.push(std({ map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 0 }));
    M.plain.push(std({ map: plainTex(st) }));
  }
  const shopTypes = [['shutter', 'shutter'], ['open', 'open'], ['glass', 'glass'], ['half', 'open'], ['open', 'glass'], ['half', 'half'], ['glass', 'open']];
  M.shop = shopTypes.map((t) => {
    const s = shopTex(t);
    return std({ map: s.map, emissiveMap: s.emissive, emissive: 0xffffff, emissiveIntensity: 0 });
  });
  const atlas = signAtlas();
  M.sign = std({ map: atlas, emissiveMap: atlas, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6 });
  M.eave = std({ color: 0xc9c4ba });
  M.concrete = std({ color: 0xa9a59d });
  M.rail = std({ color: 0xdcd8cf });
  M.metal = std({ color: 0x8c9196, roughness: 0.5, metalness: 0.4 });
  M.mark = std({ color: 0xe6e4dc, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  M.markY = std({ color: 0xd9a21e, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  M.track = std({ color: 0xa4473a });
  M.turf = std({ map: turfTex() });
  M.schoolWall = std({ map: schoolWallTex() });
  M.shed = std({ map: corrugatedTex('#3f6f9c'), side: THREE.DoubleSide, roughness: 0.6, metalness: 0.2 });
  M.stage = std({ color: 0xa3261e });
  M.vc = std({ vertexColors: true, roughness: 0.85 });
  M.vcShiny = std({ vertexColors: true, roughness: 0.35, metalness: 0.25 });
  M.lampHead = std({ color: 0xfffbea, emissive: 0xffe0a0, emissiveIntensity: 0 });
  M.glow = new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  M.plaid = std({ map: plaidTex(), roughness: 1 });
  M.flag = std({ color: 0xd2231c, side: THREE.DoubleSide });
  return M;
}
