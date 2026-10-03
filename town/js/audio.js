// WebAudio 合成音效：电机声、风噪、喇叭、碰撞、路边汽车喇叭、远处的广场舞音乐
export class Sound {
  constructor() { this.ctx = null; this.hornOn = false; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // 电机：两个略微失谐的振荡器
    this.motorGain = ctx.createGain();
    this.motorGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1800;
    this.motorGain.connect(lp).connect(this.master);
    this.m1 = ctx.createOscillator(); this.m1.type = 'sawtooth';
    this.m2 = ctx.createOscillator(); this.m2.type = 'sine';
    const g1 = ctx.createGain(); g1.gain.value = 0.25;
    this.m1.connect(g1).connect(this.motorGain);
    this.m2.connect(this.motorGain);
    this.m1.start(); this.m2.start();

    // 风噪 / 轮胎噪声
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const n = ctx.createBufferSource();
    n.buffer = buf; n.loop = true;
    this.windF = ctx.createBiquadFilter();
    this.windF.type = 'bandpass'; this.windF.frequency.value = 500; this.windF.Q.value = 0.7;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    n.connect(this.windF).connect(this.windGain).connect(this.master);
    n.start();

    // 喇叭（嘀——）
    this.hornGain = ctx.createGain(); this.hornGain.gain.value = 0;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 2600;
    this.hornGain.connect(hf).connect(this.master);
    for (const f of [520, 655]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      o.connect(this.hornGain); o.start();
    }

    // 广场舞音乐（很简单的五声音阶小曲，按距离调音量）
    this.musicGain = ctx.createGain(); this.musicGain.gain.value = 0;
    this.musicGain.connect(this.master);
    this.nextNote = ctx.currentTime + 0.1;
    this.noteIdx = 0;
  }

  update(dt, speed, throttle, surface, musicDist) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = Math.abs(speed);
    this.m1.frequency.setTargetAtTime(90 + s * 28 + throttle * 25, t, 0.08);
    this.m2.frequency.setTargetAtTime(180 + s * 56 + throttle * 50, t, 0.08);
    const mg = s > 0.05 || throttle ? 0.018 + throttle * 0.03 + s * 0.002 : 0.0;
    this.motorGain.gain.setTargetAtTime(mg, t, 0.1);
    this.windF.frequency.setTargetAtTime(surface === 'dirt' ? 220 : 380 + s * 40, t, 0.2);
    this.windGain.gain.setTargetAtTime(Math.min(0.22, s * s * 0.0014 + (surface === 'dirt' ? s * 0.012 : 0)), t, 0.2);

    // 广场舞
    const vol = musicDist < 80 ? 0.05 * Math.pow(1 - musicDist / 80, 1.5) : 0;
    this.musicGain.gain.setTargetAtTime(vol, t, 0.3);
    if (vol > 0.0005) {
      const tune = [0, 2, 4, 7, 4, 2, 4, -1, 0, 2, 4, 7, 9, 7, 4, 2, 0, -1, 2, 4, 2, 0, -3, 0];
      while (this.nextNote < t + 0.25) {
        const n = tune[this.noteIdx % tune.length];
        if (n !== -1) this.note(this.nextNote, 392 * Math.pow(2, n / 12), 0.28);
        if (this.noteIdx % 2 === 0) this.drum(this.nextNote);
        this.nextNote += 0.3;
        this.noteIdx++;
      }
    } else this.nextNote = t + 0.1;
  }

  note(time, freq, dur) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(1, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    o.connect(g).connect(this.musicGain);
    o.start(time); o.stop(time + dur + 0.05);
  }

  drum(time) {
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    src.buffer = this.noiseBuf;
    f.type = 'lowpass'; f.frequency.value = 180;
    g.gain.setValueAtTime(1.5, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    src.connect(f).connect(g).connect(this.musicGain);
    src.start(time, Math.random()); src.stop(time + 0.2);
  }

  horn(on) {
    if (!this.ctx || on === this.hornOn) return;
    this.hornOn = on;
    this.hornGain.gain.setTargetAtTime(on ? 0.07 : 0, this.ctx.currentTime, 0.015);
  }

  bump(strength) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    src.buffer = this.noiseBuf;
    f.type = 'lowpass'; f.frequency.value = 600;
    g.gain.setValueAtTime(Math.min(0.6, strength * 0.08), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random()); src.stop(t + 0.3);
  }

  npcHorn(dist, small) {
    if (!this.ctx || dist > 60) return;
    const t = this.ctx.currentTime;
    const vol = 0.06 * Math.max(0, 1 - dist / 60);
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.master);
    const freqs = small ? [600, 760] : [380, 470];
    for (const f of freqs) {
      const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      o.connect(g); o.start(t); o.stop(t + 0.75);
    }
    for (const [a, b] of [[0, 0.22], [0.32, 0.7]]) {
      g.gain.setValueAtTime(vol, t + a);
      g.gain.setValueAtTime(0, t + b);
    }
  }
}
