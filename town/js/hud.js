import * as L from './layout.js';
import { FONT } from './textures.js';

// HUD：小地图（车头朝上）、速度表、地名、提示
const S = 2;               // 小地图底图每米像素
const HALF = 335;

const COLORS = {
  bg: '#a7b289', far: '#9aa77c', crops: '#86a35a', rapeseed: '#d9c64e', soil: '#a88c68', paddy: '#8fae95', greenhouse: '#dfe4e6', pond: '#7fb0c2',
  slab: '#d8d2c4', yard: '#cfc8b8', building: '#a59c8b', buildingEdge: '#8a8272', road: '#fbfaf6', main: '#f5d27a', river: '#7fb0c2', strip: '#d8d2c4', plaza: '#e6dcc6', market: '#9db7d1', track: '#c7705f',
};

export class Hud {
  constructor(W) {
    this.W = W;
    this.mini = document.getElementById('minimap');
    this.mctx = this.mini.getContext('2d');
    this.speedC = document.getElementById('speedo');
    this.sctx = this.speedC.getContext('2d');
    this.placeEl = document.getElementById('place');
    this.timeEl = document.getElementById('tod');
    this.toastEl = document.getElementById('toast');
    this.bigEl = document.getElementById('bigmap');
    this.bigC = document.getElementById('bigmapCanvas');
    this.toastT = 0;
    this.big = false;
    this.lastPlace = '';
    this.map = this.renderMap();
  }

  renderMap() {
    const c = document.createElement('canvas');
    c.width = c.height = HALF * 2 * S;
    const x = c.getContext('2d');
    const R = (r, col) => { x.fillStyle = col; x.fillRect((r.x0 + HALF) * S, (r.z0 + HALF) * S, (r.x1 - r.x0) * S, (r.z1 - r.z0) * S); };
    x.fillStyle = COLORS.bg; x.fillRect(0, 0, c.width, c.height);
    for (const f of this.W.fields) R(f, COLORS[f.type] || COLORS.crops);
    R({ x0: -HALF, x1: HALF, z0: L.RIVER.z0, z1: L.RIVER.z1 }, COLORS.river);
    for (const s of this.W.strips) R(s, COLORS.strip);
    for (const b of L.BLOCKS) {
      R(b.slab, b.type === 'plaza' ? COLORS.plaza : COLORS.slab);
      if (b.type === 'market') R({ x0: b.lot.x0 + 1, x1: b.lot.x1 - 1, z0: b.lot.z0 + 1, z1: b.lot.z1 - 2 }, COLORS.market);
    }
    for (const r of this.W.reserved) R({ x0: r.x0 + 2, x1: r.x1 - 2, z0: r.z0 + 2, z1: r.z1 - 2 }, COLORS.yard);
    for (const b of this.W.buildings) {
      R(b, COLORS.buildingEdge);
      R({ x0: b.x0 + 0.6, x1: b.x1 - 0.6, z0: b.z0 + 0.6, z1: b.z1 - 0.6 }, COLORS.building);
    }
    const sorted = [...L.ROADS].sort((a, b) => (a.kind === 'main') - (b.kind === 'main'));
    for (const r of sorted) R(L.roadRect(r, r.kind === 'lane' ? 0.4 : 0), r.kind === 'main' ? COLORS.main : COLORS.road);
    for (const br of L.BRIDGES) R({ x0: br.x0, x1: br.x1, z0: 178, z1: 202 }, COLORS.road);
    // 路名
    x.font = `bold ${7 * S}px ${FONT}`;
    x.fillStyle = '#4a4438';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const r of L.ROADS) {
      if (r.kind === 'lane') continue;
      const s = r.axis === 'x' ? (r.c === 0 ? -100 : -165) : (r.c === 0 ? -150 : -150);
      x.save();
      if (r.axis === 'x') { x.translate((s + HALF) * S, (r.c + HALF) * S); }
      else { x.translate((r.c + HALF) * S, (s + HALF) * S); x.rotate(Math.PI / 2); }
      x.fillText(r.name, 0, 0);
      x.restore();
    }
    x.fillStyle = '#2f5a6b';
    x.fillText('青 溪 河', (-160 + HALF) * S, (190 + HALF) * S);
    return c;
  }

  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    this.toastT = 1.6;
  }

  toggleBig() {
    this.big = !this.big;
    this.bigEl.classList.toggle('show', this.big);
  }

  update(dt, player, traffic, place, todName) {
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastEl.classList.remove('show');
    }
    if (place !== this.lastPlace) { this.placeEl.textContent = place; this.lastPlace = place; }
    this.timeEl.textContent = todName;
    this.drawMini(player, traffic);
    this.drawSpeed(player);
    if (this.big) this.drawBig(player);
  }

  drawMini(p, traffic) {
    const c = this.mini, x = this.mctx;
    const w = c.width, h = c.height, cx = w / 2, cy = h / 2;
    const ppm = w / 230;  // 每米像素
    x.save();
    x.clearRect(0, 0, w, h);
    x.beginPath(); x.arc(cx, cy, w / 2 - 2, 0, Math.PI * 2); x.clip();
    x.fillStyle = COLORS.far; x.fillRect(0, 0, w, h);
    x.translate(cx, cy);
    const phi = p.heading - Math.PI;
    x.rotate(phi);
    x.scale(ppm / S, ppm / S);
    x.drawImage(this.map, -(p.pos.x + HALF) * S, -(p.pos.z + HALF) * S);
    x.setTransform(1, 0, 0, 1, 0, 0);
    // 其他车辆
    x.fillStyle = 'rgba(60,60,70,0.75)';
    const cos = Math.cos(phi), sin = Math.sin(phi);
    for (const a of traffic.list) {
      const dx = a.x - p.pos.x, dz = a.z - p.pos.z;
      if (Math.abs(dx) > 130 || Math.abs(dz) > 130) continue;
      const sx = cx + (dx * cos - dz * sin) * ppm, sy = cy + (dx * sin + dz * cos) * ppm;
      x.beginPath(); x.arc(sx, sy, a.small ? 1.6 : 2.4, 0, Math.PI * 2); x.fill();
    }
    // 玩家箭头
    x.fillStyle = '#e8402c'; x.strokeStyle = '#fff'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(cx, cy - 9); x.lineTo(cx + 6.5, cy + 7); x.lineTo(cx, cy + 3.5); x.lineTo(cx - 6.5, cy + 7); x.closePath();
    x.stroke(); x.fill();
    x.restore();
    // 外圈 + 北
    x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 3;
    x.beginPath(); x.arc(cx, cy, w / 2 - 2, 0, Math.PI * 2); x.stroke();
    const nx = cx + Math.sin(phi) * (w / 2 - 13), ny = cy - Math.cos(phi) * (w / 2 - 13);
    x.fillStyle = 'rgba(30,30,30,0.75)';
    x.beginPath(); x.arc(nx, ny, 10, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; x.font = `bold 12px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('北', nx, ny + 1);
  }

  drawBig(p) {
    const c = this.bigC, x = c.getContext('2d');
    const s = c.width / (HALF * 2 * S);
    x.drawImage(this.map, 0, 0, c.width, c.height);
    const px = (p.pos.x + HALF) * S * s, pz = (p.pos.z + HALF) * S * s;
    x.save();
    x.translate(px, pz);
    x.rotate(Math.PI - p.heading);
    x.fillStyle = '#e8402c'; x.strokeStyle = '#fff'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, -10); x.lineTo(7, 8); x.lineTo(0, 4); x.lineTo(-7, 8); x.closePath();
    x.stroke(); x.fill();
    x.restore();
  }

  drawSpeed(p) {
    const c = this.speedC, x = this.sctx;
    const w = c.width, cx = w / 2, cy = w / 2, r = w / 2 - 10;
    const kmh = Math.abs(p.v) * 3.6;
    x.clearRect(0, 0, w, w);
    x.fillStyle = 'rgba(20,22,26,0.62)';
    x.beginPath(); x.arc(cx, cy, w / 2 - 2, 0, Math.PI * 2); x.fill();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, max = 50;
    x.lineWidth = 6; x.strokeStyle = 'rgba(255,255,255,0.15)';
    x.beginPath(); x.arc(cx, cy, r, a0, a1); x.stroke();
    const ak = a0 + (a1 - a0) * Math.min(1, kmh / max);
    x.strokeStyle = kmh > 40 ? '#ff7a45' : '#7fd3ff';
    x.beginPath(); x.arc(cx, cy, r, a0, ak); x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.75)'; x.font = `11px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let k = 0; k <= max; k += 10) {
      const a = a0 + ((a1 - a0) * k) / max;
      x.fillText(k, cx + Math.cos(a) * (r - 17), cy + Math.sin(a) * (r - 17));
    }
    x.fillStyle = '#fff'; x.font = `bold 34px ${FONT}`;
    x.fillText(Math.round(kmh), cx, cy - 2);
    x.font = `11px ${FONT}`; x.fillStyle = 'rgba(255,255,255,0.7)';
    x.fillText('km/h', cx, cy + 20);
    x.fillText(`里程 ${(p.odo / 1000).toFixed(2)} km`, cx, cy + 42);
  }
}
