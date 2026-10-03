import * as THREE from 'three';
import { createMaterials } from './textures.js';
import { buildWorld } from './world.js';
import { Player, MAX_SPEED } from './scooter.js';
import { Traffic } from './traffic.js';
import { Peds } from './peds.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { placeName } from './layout.js';
import { clamp, damp, lerp } from './util.js';

const canvas = document.getElementById('game');
const loadingEl = document.getElementById('loading');
const startEl = document.getElementById('start');
const helpEl = document.getElementById('help');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.25, 2600);
scene.fog = new THREE.Fog(0xc9d2d6, 60, 520);

const hemi = new THREE.HemisphereLight(0xcfdcea, 0x7a6f5c, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const SC = sun.shadow.camera;
SC.left = -70; SC.right = 70; SC.top = 70; SC.bottom = -70; SC.near = 10; SC.far = 400;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// 天空：上下渐变的大球
const skyMat = new THREE.ShaderMaterial({
  uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
  vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vP;
    void main(){ float h = clamp(vP.y * 2.2, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.7)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
  side: THREE.BackSide, depthWrite: false, fog: false,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), skyMat);
sky.renderOrder = -2;
scene.add(sky);

// 时间段
const TOD = [
  { name: '上午', dir: [0.45, 0.78, 0.42], sun: '#fff0d8', sunI: 2.7, sky: '#d3dfec', gnd: '#7d725e', hemiI: 1.15, fog: '#c8d0d3', near: 70, far: 560, top: '#86a9cb', bot: '#d4dadb', hills: '#a3afb2', win: 0, shop: 0, sign: 0, lamp: 0, glow: 0, head: 0, car: 0, exp: 1.0 },
  { name: '傍晚', dir: [-0.75, 0.22, 0.3], sun: '#ffa45c', sunI: 1.9, sky: '#c69a8c', gnd: '#4d3f38', hemiI: 0.75, fog: '#cf9f84', near: 50, far: 460, top: '#5f6f9a', bot: '#eba274', hills: '#8b7d88', win: 0.55, shop: 0.35, sign: 0.6, lamp: 1.2, glow: 0.35, head: 30, car: 0.8, exp: 1.05 },
  { name: '夜晚', dir: [0.3, 0.75, -0.4], sun: '#93a8e0', sunI: 0.28, sky: '#2a3654', gnd: '#141519', hemiI: 0.4, fog: '#151b28', near: 25, far: 300, top: '#05070e', bot: '#1d2538', hills: '#1a2030', win: 1.1, shop: 0.75, sign: 1.0, lamp: 2.2, glow: 0.8, head: 80, car: 2.0, exp: 1.15 },
];

const state = { tod: 0, todFrom: TOD[0], todT: 1, camMode: 0, started: false, shake: 0, yawOff: 0, pitchOff: 0, helpOn: true };
let M, W, player, traffic, peds, hud, input, sound;
const sunDir = new THREE.Vector3();
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

function mixColor(target, a, b, t) { target.copy(_c1.set(a)).lerp(_c2.set(b), t); }

function applyTOD(a, b, t) {
  const n = (k) => lerp(a[k], b[k], t);
  mixColor(sun.color, a.sun, b.sun, t);
  sun.intensity = n('sunI');
  sunDir.set(...a.dir).lerp(_v1.set(...b.dir), t).normalize();
  mixColor(hemi.color, a.sky, b.sky, t);
  mixColor(hemi.groundColor, a.gnd, b.gnd, t);
  hemi.intensity = n('hemiI');
  mixColor(scene.fog.color, a.fog, b.fog, t);
  scene.fog.near = n('near'); scene.fog.far = n('far');
  mixColor(skyMat.uniforms.top.value, a.top, b.top, t);
  mixColor(skyMat.uniforms.bottom.value, a.bot, b.bot, t);
  for (const m of W.hillMats) mixColor(m.color, a.hills, b.hills, t);
  for (const m of M.facade) m.emissiveIntensity = n('win');
  for (const m of M.shop) m.emissiveIntensity = n('shop');
  M.sign.emissiveIntensity = n('sign');
  M.lampHead.emissiveIntensity = n('lamp');
  M.glow.opacity = n('glow');
  if (W.glow) W.glow.visible = M.glow.opacity > 0.01;
  player.headlight.intensity = n('head');
  player.m.headlight.material.emissiveIntensity = 0.4 + n('head') / 30;
  player.tailBase = 0.3 + n('car');
  traffic.setNight(n('car'), 0.2 + n('car'));
  renderer.toneMappingExposure = n('exp');
}

function setTOD(i) {
  const cur = TOD[state.tod];
  state.todFrom = { ...cur };
  state.tod = i;
  state.todT = 0;
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------------- 相机 ----------------
const CAM_MODES = [
  { name: '近景跟随', dist: 4.4, h: 1.85, look: 1.15 },
  { name: '远景跟随', dist: 8.5, h: 3.6, look: 1.3 },
  { name: '第一人称', fp: true },
];
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camInit = false;

function updateCamera(dt) {
  const p = player;
  const mode = CAM_MODES[state.camMode];
  const sp = Math.abs(p.v);
  const [dx, dy] = input.takeDrag();
  state.yawOff -= dx * 0.006;
  state.pitchOff = clamp(state.pitchOff + dy * 0.004, -0.6, 0.9);
  if (!input.dragging && performance.now() - input.lastDrag > 900) {
    state.yawOff = damp(state.yawOff, 0, 2.5, dt);
    state.pitchOff = damp(state.pitchOff, 0, 2.5, dt);
  }
  const h = p.heading + state.yawOff;
  const fx = Math.sin(h), fz = Math.cos(h);
  if (mode.fp) {
    const lean = p.lean;
    const rx = -Math.cos(p.heading), rz = Math.sin(p.heading); // 右手方向
    const headH = 1.66;
    camera.position.set(p.pos.x + Math.sin(p.heading) * -0.15 + rx * Math.sin(lean) * headH,
      p.y + Math.cos(lean) * headH, p.pos.z + Math.cos(p.heading) * -0.15 + rz * Math.sin(lean) * headH);
    camLook.set(camera.position.x + fx * 10, camera.position.y - 0.9 - state.pitchOff * 6, camera.position.z + fz * 10);
    camera.up.set(rx * Math.sin(lean) * 0.6, 1, rz * Math.sin(lean) * 0.6).normalize();
    camera.lookAt(camLook);
    camera.near = 0.08;
    camInit = false;
  } else {
    camera.up.set(0, 1, 0);
    camera.near = 0.25;
    const dist = mode.dist * (1 + (sp / MAX_SPEED) * 0.22);
    const ch = mode.h + state.pitchOff * 3;
    _v1.set(p.pos.x - fx * dist * Math.cos(state.pitchOff * 0.5), p.y + ch, p.pos.z - fz * dist * Math.cos(state.pitchOff * 0.5));
    // 防止相机钻进楼里
    _v2.set(p.pos.x, p.y + 1.5, p.pos.z);
    const steps = 10;
    let ok = 1;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = lerp(_v2.x, _v1.x, t), y = lerp(_v2.y, _v1.y, t), z = lerp(_v2.z, _v1.z, t);
      if (W.col.blocked(x, z, y)) { ok = (i - 1) / steps; break; }
    }
    if (ok < 1) {
      // 被楼挡住：拉近一些并抬高，从头顶上看过去
      const f = Math.max(2.6 / dist, ok);
      _v1.lerpVectors(_v2, _v1, f);
      _v1.y += (1 - f) * 2.5;
    }
    if (!camInit) { camPos.copy(_v1); camInit = true; }
    camPos.x = damp(camPos.x, _v1.x, 7, dt);
    camPos.z = damp(camPos.z, _v1.z, 7, dt);
    camPos.y = damp(camPos.y, _v1.y, 5, dt);
    if (ok < 1) camPos.lerp(_v1, 0.5);
    camLook.set(p.pos.x + Math.sin(p.heading) * 2.2, p.y + mode.look, p.pos.z + Math.cos(p.heading) * 2.2);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  }
  if (state.shake > 0) {
    state.shake = Math.max(0, state.shake - dt * 1.5);
    camera.position.x += (Math.random() - 0.5) * state.shake;
    camera.position.y += (Math.random() - 0.5) * state.shake;
  }
  if (p.surface === 'dirt' && sp > 1) camera.position.y += Math.sin(performance.now() * 0.03) * 0.01 * Math.min(1, sp / 5);
  const fov = 62 + (sp / MAX_SPEED) * 8;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; }
  camera.updateProjectionMatrix();
}

// ---------------- 初始化 ----------------
function init() {
  M = createMaterials(renderer);
  W = buildWorld(scene, M);
  player = new Player(scene, M, W);
  traffic = new Traffic(scene, M, W);
  peds = new Peds(scene, M, W);
  input = new Input(canvas);
  hud = new Hud(W);
  sound = new Sound();
  applyTOD(TOD[0], TOD[0], 1);
  updateCamera(0.016);
  loadingEl.classList.add('hide');
  startEl.classList.add('show');
  const go = () => {
    if (state.started) return;
    state.started = true;
    startEl.classList.remove('show');
    sound.init();
    canvas.focus();
  };
  document.getElementById('goBtn').addEventListener('click', go);
  addEventListener('keydown', (e) => { if (e.code === 'Enter' || e.code === 'Space') go(); });
  // 调试用：瞬移、快进模拟
  window.__town = {
    scene, camera, player, traffic, peds, W, M, state, setTOD, renderer,
    teleport(x, z, h) { player.reset(x, z, h); camInit = false; updateCamera(0.016); },
    sim(seconds, keys = []) {
      const fake = { throttle: 0, brake: 0, steer: 0, handbrake: false };
      for (const k of keys) {
        if (k === 'W') fake.throttle = 1; if (k === 'S') fake.brake = 1;
        if (k === 'A') fake.steer += 1; if (k === 'D') fake.steer -= 1;
      }
      const real = input;
      input = { ...fake, pressed: () => false, endFrame() {}, takeDrag: () => [0, 0], horn: false, dragging: false, lastDrag: 0 };
      try { for (let t = 0; t < seconds; t += 1 / 30) step(1 / 30); } finally { input = real; }
      return { x: player.pos.x, z: player.pos.z, v: player.v, h: player.heading };
    },
  };
  requestAnimationFrame(loop);
}

let last = performance.now();
let placeT = 0;
let place = '';
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  renderer.render(scene, camera);
}

function step(dt) {
  const active = state.started;
  // 按键
  if (active) {
    if (input.pressed('KeyC')) { state.camMode = (state.camMode + 1) % CAM_MODES.length; hud.toast('镜头：' + CAM_MODES[state.camMode].name); camInit = false; }
    if (input.pressed('KeyT')) { setTOD((state.tod + 1) % TOD.length); hud.toast('时间：' + TOD[state.tod].name); }
    if (input.pressed('KeyB')) { player.m.quilt.visible = !player.m.quilt.visible; hud.toast(player.m.quilt.visible ? '挡风被：装上了，暖和' : '挡风被：拆了'); }
    if (input.pressed('KeyR')) { player.reset(W.spawn.x, W.spawn.z, W.spawn.h); camInit = false; hud.toast('回到人民路'); }
    if (input.pressed('KeyM')) hud.toggleBig();
    if (input.pressed('KeyI')) { state.helpOn = !state.helpOn; helpEl.classList.toggle('hide', !state.helpOn); }
  }
  const idle = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  const dyn = traffic.circles.concat(peds.circles);
  const ev = player.update(dt, active ? input : idle, dyn);
  if (ev.impact > 2.2) {
    state.shake = Math.min(0.35, ev.impact * 0.04);
    sound.bump(ev.impact);
  }
  const events = traffic.update(dt, player, peds.list);
  for (const e of events) if (e.type === 'honk') sound.npcHorn(e.dist, e.small);
  peds.update(dt, player);

  // 时间段过渡
  if (state.todT < 1) {
    state.todT = Math.min(1, state.todT + dt / 1.5);
    applyTOD(state.todFrom, TOD[state.tod], state.todT);
  }

  // 红绿灯
  for (const s of W.signals) {
    const st = traffic.light(s.axis);
    s.red.material.color.setHex(st === 'R' ? 0xff2a1a : 0x3a1410);
    s.yellow.material.color.setHex(st === 'Y' ? 0xffb81a : 0x3a2a10);
    s.green.material.color.setHex(st === 'G' ? 0x2aff6a : 0x10301a);
  }

  updateCamera(dt);
  sky.position.copy(camera.position);
  sun.target.position.set(player.pos.x, 0, player.pos.z);
  sun.position.copy(sun.target.position).addScaledVector(sunDir, 200);
  M.water.map.offset.x += dt * 0.012;
  M.water.map.offset.y += dt * 0.004;
  if (W.flag) W.flag.rotation.y = Math.sin(performance.now() * 0.002) * 0.25;
  if (W.flag2) W.flag2.rotation.y = Math.PI / 2 + Math.sin(performance.now() * 0.0021) * 0.25;

  sound.horn(active && input.horn);
  const musicDist = W.dancers ? Math.hypot(player.pos.x - W.dancers.x, player.pos.z - W.dancers.z) : 999;
  sound.update(dt, player.v, active ? input.throttle : 0, player.surface, musicDist);

  placeT -= dt;
  if (placeT <= 0) { place = placeName(player.pos.x, player.pos.z); placeT = 0.25; }
  hud.update(dt, player, traffic, place, TOD[state.tod].name);
  input.endFrame();
}

// 先让“加载中”画面显示出来，再生成世界
requestAnimationFrame(() => setTimeout(() => {
  try { init(); } catch (err) {
    loadingEl.querySelector('p').textContent = '加载失败：' + err.message;
    console.error(err);
  }
}, 30));
