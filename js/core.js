'use strict';

/* ============================ 1. 상수 및 유틸리티 ============================ */
const W = 1600, H = 900;
const BEDROCK = 36;
const GRAVITY = 560;
const WIND_ACCEL = 10;
const MAX_WIND = 10;
const MOVE_SPEED = 130;
const AIM_SPEED = 55;
const POWER_PERIOD = 2.4;
const MAX_SHELL_SPEED = 1150;
const BASE_HW = 16;
const BARREL_LEN = 34, PIVOT_Y = 22;
const WINS_TO_MATCH = 5;
const SUDDEN_DEATH_TURN = 10; // 10턴 이후 서든데스 발동
const TAU = Math.PI * 2;
const FONT = "'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif";

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

/* ============================ 2. 결정론적 시드 난수 (RNG) ============================
 * 온라인 대전 시 Host와 Guest가 동일한 턴 시드를 공유하여
 * 산탄 퍼짐, 룰렛 배율, 유성우, 보급 상자 등이 100% 동일하게 발생하도록 보장합니다.
 */
const RNG = {
  seed: 123456789,
  setSeed(s) {
    this.seed = (s >>> 0) || 123456789;
  },
  next() {
    let t = (this.seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
};

// 게임 로직용 시드 기반 난수 (동기화 필수 요소에 사용)
const rand = (a, b) => a + RNG.next() * (b - a);
// 순수 시각/파티클 연출용 비동기 난수 (게임 판정에 영향 없음)
const fxRand = (a, b) => a + Math.random() * (b - a);

function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (RNG.next() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = v => clamp(Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt), 0, 255);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/* ============================ 3. 오디오 엔진 ============================ */
const Sfx = (() => {
  let ac = null, master = null, nbuf = null, co = null, cg = null;
  const ok = () => !!ac;

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination);
    const n = ac.sampleRate * 2;
    nbuf = ac.createBuffer(1, n, ac.sampleRate);
    const d = nbuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  function tone(o) {
    if (!ok()) return;
    const { type = 'sine', f0 = 440, f1 = null, dur = 0.2, vol = 0.3, delay = 0, attack = 0.005 } = o;
    const t = ac.currentTime + delay;
    const os = ac.createOscillator(), g = ac.createGain();
    os.type = type; os.frequency.setValueAtTime(f0, t);
    if (f1) os.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    os.connect(g); g.connect(master);
    os.start(t); os.stop(t + dur + 0.05);
  }
  function noise(o) {
    if (!ok()) return;
    const { dur = 0.3, vol = 0.4, f0 = 1000, f1 = 200, type = 'lowpass', q = 1, delay = 0 } = o;
    const t = ac.currentTime + delay;
    const src = ac.createBufferSource(); src.buffer = nbuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.8); src.stop(t + dur + 0.05);
  }
  return {
    init,
    shoot(power) { noise({ dur: 0.2, vol: 0.5, f0: 1600, f1: 250, type: 'bandpass', q: 0.8 }); tone({ type: 'square', f0: 240 + power, f1: 60, dur: 0.25, vol: 0.2 }); },
    chargeStart() {
      if (!ok() || co) return;
      co = ac.createOscillator(); cg = ac.createGain();
      co.type = 'sawtooth'; co.frequency.value = 110; cg.gain.value = 0.0001;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      co.connect(f); f.connect(cg); cg.connect(master); co.start();
      cg.gain.setTargetAtTime(0.09, ac.currentTime, 0.03);
    },
    chargeUpdate(pct) { if (co) co.frequency.setTargetAtTime(110 + pct * 5, ac.currentTime, 0.03); },
    chargeStop() { if (!co) return; const o = co, g = cg; co = cg = null; g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.03); o.stop(ac.currentTime + 0.15); },
    explosion(radius) { const d = 0.45 + radius / 90; noise({ dur: d, vol: 0.9, f0: 2200, f1: 70 }); tone({ type: 'sine', f0: 140, f1: 28, dur: d, vol: 0.8 }); },
    hit() { tone({ type: 'square', f0: 900, f1: 200, dur: 0.12, vol: 0.18 }); },
    bounce() { tone({ type: 'triangle', f0: 380, f1: 760, dur: 0.1, vol: 0.2 }); },
    thud() { tone({ type: 'sine', f0: 90, f1: 40, dur: 0.18, vol: 0.5 }); },
    ko() { tone({ type: 'sawtooth', f0: 400, f1: 40, dur: 1.0, vol: 0.3 }); noise({ dur: 1.1, vol: 0.8, f0: 3000, f1: 50 }); },
    cardMove() { tone({ type: 'square', f0: 660, dur: 0.05, vol: 0.08 }); },
    cardPick() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.35, vol: 0.22, delay: i * 0.07 })); },
    roundStart() { tone({ type: 'square', f0: 330, dur: 0.12, vol: 0.12 }); tone({ type: 'square', f0: 495, dur: 0.18, vol: 0.12, delay: 0.12 }); },
    pop() { tone({ type: 'square', f0: 760, f1: 260, dur: 0.12, vol: 0.18 }); },
    portal() { tone({ type: 'sine', f0: 300, f1: 1200, dur: 0.2, vol: 0.22 }); },
    crate() { [660, 880, 1100].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.18, vol: 0.2, delay: i * 0.05 })); },
    airstrike() { noise({ dur: 0.4, vol: 0.35, f0: 2400, f1: 400, type: 'bandpass', q: 2 }); },
    poison() { noise({ dur: 0.5, vol: 0.25, f0: 1200, f1: 600, type: 'highpass' }); },
    drill() { noise({ dur: 0.6, vol: 0.5, f0: 900, f1: 300, type: 'bandpass', q: 3 }); },
    phoenix() { [440, 554, 659, 880, 1108].forEach((f, i) => tone({ type: 'sawtooth', f0: f, dur: 0.3, vol: 0.2, delay: i * 0.05 })); },
    lightning() { noise({ dur: 0.25, vol: 0.6, f0: 3200, f1: 300, type: 'highpass' }); tone({ type: 'sawtooth', f0: 1200, f1: 120, dur: 0.2, vol: 0.3 }); },
    ufo() { tone({ type: 'sine', f0: 440, f1: 880, dur: 0.4, vol: 0.2 }); tone({ type: 'sine', f0: 880, f1: 440, dur: 0.4, vol: 0.2, delay: 0.4 }); },
    hum(dur) {
      if (!ok()) return;
      const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(34, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
    },
  };
})();

/* ============================ 4. 지형 엔진 ============================ */
function makeDirtTexture() {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 300, 0, H);
  g.addColorStop(0, '#93683c'); g.addColorStop(0.45, '#5d3d22'); g.addColorStop(1, '#2b1a0e');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 3000; i++) {
    x.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.14)' : 'rgba(255,214,150,0.08)';
    x.fillRect(fxRand(0, W), fxRand(300, H), fxRand(2, 5), fxRand(2, 5));
  }
  return c;
}

const BIOME_DEFS = {
  grass: {
    name: '초원 평원', icon: '🌿',
    sky: ['#070b24', '#1d1f4a', '#5a3466', '#c4627a'],
    mtn: ['#2d2150', '#221a40'],
    dirt: ['#93683c', '#5d3d22', '#2b1a0e'],
    crust: ['#3f8f2e', '#6fcf4f', '#a3ec78'],
    debris: ['#8a6038', '#5a3b21', '#6fcf4f', '#a67c4e'],
    speedMult: 1.0, fuelMult: 1.0, slide: 0
  },
  desert: {
    name: '작열하는 사막', icon: '🏜️',
    sky: ['#3b0d02', '#8c2d04', '#d95f0e', '#fec44f'],
    mtn: ['#7f2704', '#541902'],
    dirt: ['#e0a952', '#a87128', '#5e390d'],
    crust: ['#c78d2e', '#f5cb6c', '#fff3b0'],
    debris: ['#e0a952', '#a87128', '#f5cb6c', '#c78d2e'],
    speedMult: 0.9, fuelMult: 1.45, slide: 0
  },
  tundra: {
    name: '혹한의 툰드라', icon: '❄️',
    sky: ['#020c1b', '#0a2540', '#1d4e78', '#7cc6fe'],
    mtn: ['#10375c', '#09223b'],
    dirt: ['#547285', '#324857', '#18252e'],
    crust: ['#7ec8e3', '#d4f1f9', '#ffffff'],
    debris: ['#7ec8e3', '#d4f1f9', '#547285', '#ffffff'],
    speedMult: 1.15, fuelMult: 0.85, slide: 1
  },
  swamp: {
    name: '독안개 늪지대', icon: '🐊',
    sky: ['#041208', '#0d2b16', '#1e4d26', '#4c8538'],
    mtn: ['#103318', '#081f0d'],
    dirt: ['#344724', '#202e15', '#0f1709'],
    crust: ['#497326', '#8bc34a', '#ccff90'],
    debris: ['#344724', '#497326', '#8bc34a', '#202e15'],
    speedMult: 0.65, fuelMult: 1.25, slide: 0
  }
};

function makeBiomeDirt(biomeKey) {
  const b = BIOME_DEFS[biomeKey] || BIOME_DEFS.grass;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 300, 0, H);
  g.addColorStop(0, b.dirt[0]); g.addColorStop(0.45, b.dirt[1]); g.addColorStop(1, b.dirt[2]);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 3000; i++) {
    x.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.08)';
    x.fillRect(fxRand(0, W), fxRand(300, H), fxRand(2, 5), fxRand(2, 5));
  }
  return c;
}

const Terrain = {
  top: new Float32Array(W),
  mask: new Uint8Array(W * H),
  cv: document.createElement('canvas'),
  biome: 'grass',
  init() {
    this.cv.width = W; this.cv.height = H;
    this.c = this.cv.getContext('2d');
    this.setBiome('grass');
  },
  setBiome(key) {
    this.biome = BIOME_DEFS[key] ? key : 'grass';
    this.dirt = makeBiomeDirt(this.biome);
    this.dirtPat = this.c.createPattern(this.dirt, 'no-repeat');
  },
  generate(x1, x2) {
    const amps = [88, 46, 24, 11], wls = [1250, 560, 260, 105];
    const waves = amps.map((a, i) => ({ a: a * rand(0.7, 1.2), wl: wls[i] * rand(0.85, 1.2), ph: rand(0, TAU) }));
    const hill = rand(10, 115), base = H * 0.67;
    for (let x = 0; x < W; x++) {
      let y = base;
      for (const w of waves) y += w.a * Math.sin(TAU * x / w.wl + w.ph);
      y -= hill * Math.exp(-Math.pow((x - W / 2) / 200, 2));
      this.top[x] = clamp(y, 330, H - BEDROCK - 90);
    }
    for (const cx of [x1, x2]) {
      const h0 = this.top[Math.round(cx)], half = 38, taper = 42;
      for (let dx = -half - taper; dx <= half + taper; dx++) {
        const x = Math.round(cx) + dx; if (x < 0 || x >= W) continue;
        const ad = Math.abs(dx), w = ad <= half ? 1 : 1 - (ad - half) / taper, s = w * w * (3 - 2 * w);
        this.top[x] = lerp(this.top[x], h0, s);
      }
    }
    this.rebuild();
  },
  rebuild() {
    const b = BIOME_DEFS[this.biome] || BIOME_DEFS.grass;
    this.mask.fill(0);
    for (let x = 0; x < W; x++) this.top[x] = Math.round(this.top[x]);
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) if (y >= this.top[x]) this.mask[row + x] = 1;
    }
    const c = this.c;
    c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, W, H);
    c.fillStyle = this.dirtPat;
    c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x < W; x++) c.lineTo(x, this.top[x]);
    c.lineTo(W, H); c.closePath(); c.fill();
    c.lineJoin = 'round'; c.lineCap = 'round';
    const line = (dy, col, lw) => {
      c.beginPath(); c.moveTo(0, this.top[0] + dy);
      for (let x = 1; x < W; x++) c.lineTo(x, this.top[x] + dy);
      c.strokeStyle = col; c.lineWidth = lw; c.stroke();
    };
    line(1, b.crust[0], 9); line(-0.5, b.crust[1], 5); line(-2.5, b.crust[2], 1.5);
    c.fillStyle = '#262a38'; c.fillRect(0, H - BEDROCK, W, BEDROCK);
    c.fillStyle = '#3a3e50'; c.fillRect(0, H - BEDROCK, W, 3);
  },
  solid(x, y) {
    x = x | 0; y = y | 0;
    if (x < 0 || x >= W || y < 0) return false;
    if (y >= H) return true;
    return this.mask[y * W + x] === 1;
  },
  h(x) {
    x = clamp(x, 1, W - 2);
    const i = x | 0;
    const h0 = (this.top[i - 1] + this.top[i] + this.top[i + 1]) / 3;
    const h1 = (this.top[i] + this.top[i + 1] + this.top[Math.min(W - 1, i + 2)]) / 3;
    return lerp(h0, h1, x - i);
  },
  recompute(x0, x1) {
    for (let x = x0; x <= x1; x++) {
      let y = 0;
      while (y < H && !this.mask[y * W + x]) y++;
      this.top[x] = y;
    }
  },
  sampleTank(x, s) {
    const hw = BASE_HW * s;
    const xl = clamp(x - hw, 1, W - 2), xr = clamp(x + hw, 1, W - 2);
    const yl = this.h(xl), yr = this.h(xr);
    return { y: (yl + yr) * 0.5, tilt: Math.atan2(yr - yl, (xr - xl) || 1) };
  },
  carve(cx, cy, r) {
    const yLim = H - BEDROCK;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(yLim - 1, Math.ceil(cy + r));
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy, rd = Math.sqrt(Math.max(0, r2 - dy * dy));
      const xa = Math.max(x0, Math.ceil(cx - rd)), xb = Math.min(x1, Math.floor(cx + rd));
      const row = y * W;
      for (let x = xa; x <= xb; x++) this.mask[row + x] = 0;
    }
    const c = this.c;
    c.save();
    c.beginPath(); c.rect(0, 0, W, yLim); c.clip();
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = '#000';
    c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill();
    c.restore();
    this.recompute(x0, x1);
  },
  raise(cx, cy, r) {
    const yLim = H - BEDROCK;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
    const base = Math.max(cy, this.top[clamp(Math.round(cx), 0, W - 1)]);
    const c = this.c;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx; if (Math.abs(dx) > r) continue;
      const h = Math.sqrt(r * r - dx * dx);
      const yTop = Math.max(0, Math.floor(base - h));
      const yBot = Math.min(yLim - 1, Math.ceil(Math.max(base, this.top[x])));
      if (yBot < yTop) continue;
      for (let y = yTop; y <= yBot; y++) this.mask[y * W + x] = 1;
      c.globalCompositeOperation = 'source-over';
      c.drawImage(this.dirt, x, yTop, 1, yBot - yTop + 1, x, yTop, 1, yBot - yTop + 1);
      c.fillStyle = 'rgba(190,150,100,0.75)'; c.fillRect(x, yTop, 1, 2);
    }
    this.recompute(x0, x1);
  },
};
