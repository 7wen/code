// 键盘 + 触屏按钮 + 鼠标拖动环视
const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.once = new Set();
    this.dragX = 0;
    this.dragY = 0;
    this.dragging = false;
    this.lastDrag = 0;
    addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!e.repeat) this.once.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // 触屏按钮：<button data-key="KeyW">
    for (const el of document.querySelectorAll('[data-key]')) {
      const code = el.dataset.key;
      const on = (e) => { e.preventDefault(); this.keys.add(code); this.once.add(code); el.classList.add('on'); };
      const off = (e) => { e.preventDefault(); this.keys.delete(code); el.classList.remove('on'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    }

    let lx = 0, ly = 0;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      this.dragging = true; lx = e.clientX; ly = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.dragX += e.clientX - lx; this.dragY += e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      this.lastDrag = performance.now();
    });
    const end = () => { this.dragging = false; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  pressed(code) { return this.once.has(code); }
  get throttle() { return this.down('KeyW', 'ArrowUp') ? 1 : 0; }
  get brake() { return this.down('KeyS', 'ArrowDown') ? 1 : 0; }
  get handbrake() { return this.down('Space'); }
  get steer() { return (this.down('KeyA', 'ArrowLeft') ? 1 : 0) - (this.down('KeyD', 'ArrowRight') ? 1 : 0); }
  get horn() { return this.down('KeyH'); }
  takeDrag() {
    const d = [this.dragX, this.dragY];
    this.dragX = this.dragY = 0;
    return d;
  }
  endFrame() { this.once.clear(); }
}
